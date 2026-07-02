import { createClient } from "npm:@supabase/supabase-js@2.110.0";
import webpush from "npm:web-push";
import { expandEvent } from "../_shared/recurrence-core.js";

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

    // ISO date string for today, used by expandEvent
    const todayStr = isoDateStr(now);

    // Fetch only events that could possibly fire today, instead of scanning
    // the whole table. A row is only relevant when:
    //   - it has a reminder configured (reminder_minutes IS NOT NULL);
    //   - it has already started (event_date <= today) — no occurrence,
    //     recurring or not, can exist before its base event_date;
    //   - its recurrence hasn't ended yet (recurrence_until IS NULL,
    //     which also covers non-recurring events, or >= today);
    //   - non-recurring events additionally require event_date == today,
    //     since they only ever occur on that single day.
    // This is a superset of "occurs today" — expandEvent() below still
    // performs the exact per-type occurrence check (weekday/interval/etc.),
    // so no reminder that would have fired is ever excluded here.
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select([
        "id", "user_id", "title", "event_date", "start_time", "location",
        "reminder_minutes", "recurrence_type",
        "recurrence_interval", "recurrence_until", "recurrence_days_of_week",
      ].join(", "))
      .not("reminder_minutes", "is", null)
      .lte("event_date", todayStr)
      .or(`recurrence_until.is.null,recurrence_until.gte.${todayStr}`)
      .or(`recurrence_type.neq.none,event_date.eq.${todayStr}`);

    if (eventsError) throw eventsError;

    let sent = 0, failed = 0, skipped = 0;

    for (const event of (events as EventRow[]) ?? []) {
      if (!event.start_time) { skipped++; continue; }

      // Use the canonical recurrence logic to check if today is a valid occurrence.
      // expandEvent(event, todayStr, todayStr) returns a one-element array when today
      // is a valid occurrence, or an empty array otherwise.
      const occurrences = expandEvent(event as Record<string, unknown>, todayStr, todayStr);
      if (!occurrences.length) { skipped++; continue; }

      // Calculate when the reminder should fire for today's occurrence
      const [h, m]    = event.start_time.split(":").map(Number);
      const offsetMs  = (event.reminder_minutes ?? 0) * 60_000;
      const eventTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      const fireTime  = new Date(eventTime.getTime() - offsetMs);

      // Process only if within a 5-minute window (cron runs every minute)
      const diffMs = now.getTime() - fireTime.getTime();
      if (diffMs < 0 || diffMs > 5 * 60 * 1000) { skipped++; continue; }

      // The occurrence date is today (expandEvent confirmed it above)
      const eventDate = todayStr;

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

// ── Helpers ────────────────────────────────────────────────────────────────

function isoDateStr(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}
