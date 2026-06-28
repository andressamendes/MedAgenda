import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushSubscriptionRow {
  id:       string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

interface EventRow {
  id:                      string;
  user_id:                 string;
  title:                   string;
  event_date:              string;
  start_time:              string;
  location:                string | null;
  reminder_minutes:        number;
  recurrence_type:         string;
  recurrence_interval:     number | null;
  recurrence_until:        string | null;
  recurrence_days_of_week: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const serviceKey      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey  = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@medagenda.app";

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceKey);
    const now      = new Date();

    // Fetch all events that have a reminder configured
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select([
        "id", "user_id", "title", "event_date", "start_time", "location",
        "reminder_minutes", "recurrence_type",
        "recurrence_interval", "recurrence_until", "recurrence_days_of_week",
      ].join(", "))
      .not("reminder_minutes", "is", null);

    if (eventsError) throw eventsError;

    let sent = 0, failed = 0, skipped = 0;

    for (const event of (events as EventRow[]) ?? []) {
      // Calculate when the reminder should fire for the current occurrence
      const fireTime = getReminderFireTime(event, now);
      if (!fireTime) { skipped++; continue; }

      // Process only if within a 5-minute window (cron runs every minute)
      const diffMs = now.getTime() - fireTime.getTime();
      if (diffMs < 0 || diffMs > 5 * 60 * 1000) { skipped++; continue; }

      // Derive the occurrence date from the fire time + offset
      const eventDate = getEventDate(event.start_time, event.reminder_minutes, fireTime);

      // Skip if already sent for this event × occurrence date
      const { data: existing } = await supabase
        .from("notification_logs")
        .select("id")
        .eq("event_id",   event.id)
        .eq("event_date", eventDate)
        .eq("user_id",    event.user_id)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Fetch all push subscriptions for this user
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", event.user_id);

      if (!subscriptions?.length) { skipped++; continue; }

      const payload = JSON.stringify({
        title: event.title,
        body:  [event.start_time?.slice(0, 5), event.location].filter(Boolean).join(" · "),
        tag:   `medagenda_${event.id}_${eventDate}`,
        data:  { eventId: event.id, eventDate, url: "/" },
      });

      let anySent = false;

      for (const sub of subscriptions as PushSubscriptionRow[]) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600 }
          );
          anySent = true;
          sent++;
        } catch (err: any) {
          // 410 Gone / 404 Not Found: subscription was revoked — clean it up
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error(`Push failed for subscription ${sub.id}:`, err.message);
          }
          failed++;
        }
      }

      // Record the send attempt to prevent duplicate notifications
      await supabase.from("notification_logs").upsert(
        {
          user_id:    event.user_id,
          event_id:   event.id,
          event_date: eventDate,
          status:     anySent ? "sent" : "failed",
          error:      anySent ? null : "All subscriptions failed",
        },
        { onConflict: "user_id,event_id,event_date" }
      );
    }

    return new Response(
      JSON.stringify({ sent, failed, skipped, timestamp: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge Function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Recurrence helpers ─────────────────────────────────────────────────────

/** Returns the UTC instant when the reminder should fire for the current occurrence, or null. */
function getReminderFireTime(event: EventRow, now: Date): Date | null {
  if (!event.start_time) return null;

  const [h, m]           = event.start_time.split(":").map(Number);
  const offsetMs         = (event.reminder_minutes ?? 0) * 60_000;
  const recurrenceType   = event.recurrence_type ?? "none";

  if (recurrenceType === "none") {
    // Single event
    const [y, mo, d] = event.event_date.split("-").map(Number);
    const eventTime  = new Date(y, mo - 1, d, h, m, 0, 0);
    return new Date(eventTime.getTime() - offsetMs);
  }

  // Recurring: check if today is a valid occurrence
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [by, bm, bd] = event.event_date.split("-").map(Number);
  const baseDate = new Date(by, bm - 1, bd);

  if (today < baseDate) return null;

  if (event.recurrence_until) {
    const until = new Date(event.recurrence_until);
    if (today > until) return null;
  }

  if (!isOccurrenceOn(event, today, baseDate)) return null;

  const eventTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0, 0);
  return new Date(eventTime.getTime() - offsetMs);
}

function isOccurrenceOn(event: EventRow, day: Date, baseDate: Date): boolean {
  const diffDays = Math.round((day.getTime() - baseDate.getTime()) / 86_400_000);

  switch (event.recurrence_type) {
    case "daily":
      return true;
    case "weekdays":
      return day.getDay() >= 1 && day.getDay() <= 5;
    case "weekly":
      return diffDays % 7 === 0;
    case "biweekly":
      return diffDays % 14 === 0;
    case "monthly":
      return day.getDate() === baseDate.getDate();
    case "yearly":
      return day.getDate() === baseDate.getDate() && day.getMonth() === baseDate.getMonth();
    case "custom": {
      const interval     = event.recurrence_interval ?? 1;
      const daysOfWeek   = event.recurrence_days_of_week?.split(",").map(Number) ?? [];
      const weeksElapsed = Math.floor(diffDays / 7);
      if (weeksElapsed % interval !== 0) return false;
      return daysOfWeek.includes(day.getDay());
    }
    default:
      return false;
  }
}

/** Derives the event occurrence date from the fire time. */
function getEventDate(startTime: string, reminderMinutes: number, fireTime: Date): string {
  const eventTime = new Date(fireTime.getTime() + reminderMinutes * 60_000);
  const y  = eventTime.getFullYear();
  const mo = String(eventTime.getMonth() + 1).padStart(2, "0");
  const d  = String(eventTime.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}
