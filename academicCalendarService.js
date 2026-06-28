import { supabase, currentUserId } from "./supabase.js";

// ── Calendars ──────────────────────────────────────────────────────────────

export async function getCalendars() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("academic_calendars")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function createCalendar({ name, university = null, academic_year = null, color = "#7c3aed" }) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("academic_calendars")
    .insert({ name, university, academic_year, color, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCalendar(id, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("academic_calendars")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCalendar(id) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("academic_calendars")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function getAcademicEvents(calendarId) {
  const { data, error } = await supabase
    .from("academic_events")
    .select("*")
    .eq("calendar_id", calendarId)
    .order("start_date");
  if (error) throw error;
  return data || [];
}

export async function getAcademicEventsByRange(calendarIds, start, end) {
  if (!calendarIds || calendarIds.length === 0) return [];
  const { data, error } = await supabase
    .from("academic_events")
    .select("*, academic_calendars(id, name, color)")
    .in("calendar_id", calendarIds)
    .lte("start_date", end)
    .order("start_date");
  if (error) throw error;
  // Keep only events that overlap the range:
  // event ends on or after start (end_date >= start, or no end_date and start_date >= start)
  return (data || []).filter(ev => {
    const evEnd = ev.end_date || ev.start_date;
    return evEnd >= start;
  });
}

export async function createAcademicEvent(fields) {
  const { data, error } = await supabase
    .from("academic_events")
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAcademicEvent(id, fields) {
  const { data, error } = await supabase
    .from("academic_events")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAcademicEvent(id) {
  const { error } = await supabase
    .from("academic_events")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function bulkInsertAcademicEvents(events) {
  if (!events || events.length === 0) return [];
  const { data, error } = await supabase
    .from("academic_events")
    .insert(events)
    .select();
  if (error) throw error;
  return data || [];
}

// ── Client-side expansion ──────────────────────────────────────────────────
// Converts multi-day events into one entry per day within the range,
// enriched with _isAcademic metadata for visual differentiation.

export function expandAcademicEvents(events, start, end) {
  const result = [];
  for (const ev of events) {
    const evStart = ev.start_date;
    const evEnd   = ev.end_date || ev.start_date;

    let cur  = evStart < start ? start : evStart;
    const last = evEnd > end ? end : evEnd;

    while (cur <= last) {
      result.push({
        ...ev,
        event_date:     cur,
        _isAcademic:    true,
        _calendarId:    ev.calendar_id,
        _calendarName:  ev.academic_calendars?.name  || "",
        _calendarColor: ev.academic_calendars?.color || "#7c3aed",
      });
      const d = new Date(cur + "T12:00:00");
      d.setDate(d.getDate() + 1);
      cur = d.toISOString().slice(0, 10);
    }
  }
  return result;
}
