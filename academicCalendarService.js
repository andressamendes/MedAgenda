import { supabase, currentUserId } from "./supabase.js";
import { expandEvents } from "./recurrence.js";
import { getExceptionsMap } from "./recurrenceExceptionsService.js";

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

export async function getAcademicEventById(id) {
  const { data, error } = await supabase
    .from("academic_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

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

  // Mirrors eventService.getEventsByRange: two queries because a recurring
  // event's base start_date may lie before the visible range while later
  // occurrences still fall inside it.
  const [inRange, recurringBases] = await Promise.all([
    supabase.from("academic_events").select("*, academic_calendars(id, name, color)")
      .in("calendar_id", calendarIds).lte("start_date", end).order("start_date"),

    supabase.from("academic_events").select("*, academic_calendars(id, name, color)")
      .in("calendar_id", calendarIds)
      .neq("recurrence_type", "none")
      .lt("start_date", start)
      .or(`recurrence_until.is.null,recurrence_until.gte.${start}`)
      .order("start_date"),
  ]);
  if (inRange.error) throw inRange.error;
  if (recurringBases.error) throw recurringBases.error;

  const seen = new Set();
  const merged = [];
  for (const ev of [...(inRange.data ?? []), ...(recurringBases.data ?? [])]) {
    if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
  }

  // Keep only events that overlap the range. Recurring events are kept
  // unconditionally here — expandAcademicEvents() (recurrence-core) decides
  // precisely which occurrences fall in [start, end].
  return merged.filter(ev => {
    if (ev.recurrence_type && ev.recurrence_type !== "none") return true;
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
// Converts (possibly recurring) events into one entry per day within the
// range, enriched with _isAcademic metadata for visual differentiation.
//
// Recurrence reuses the SAME core as Compromissos (recurrence-core.js via
// recurrence.js) — F16, único motor de recorrência do domínio de Agenda.
// Non-recurring events skip the core entirely and go straight to the
// multi-day spread below: expandEvent()'s point-in-time range check would
// incorrectly drop a span whose start_date is before `start` but whose
// end_date still overlaps the range (the case the original clamp handled).

export async function expandAcademicEvents(events, start, end) {
  if (!events.length) return [];

  const recurringIds = events
    .filter(ev => ev.recurrence_type && ev.recurrence_type !== "none")
    .map(ev => ev.id);
  const exceptionsByEventId = recurringIds.length
    ? await getExceptionsMap("academic_events", recurringIds)
    : new Map();

  const occurrences = events.flatMap(ev => {
    if (!ev.recurrence_type || ev.recurrence_type === "none") return [ev];
    return expandEvents([ev], start, end, { dateField: "start_date", exceptionsByEventId })
      .map(_shiftEndDate);
  });

  return _spreadMultiDay(occurrences, start, end);
}

// Recurrence-core only rewrites the anchor date (start_date) — the original
// end_date survives unchanged on each occurrence and must be shifted by the
// same span so multi-day recurring events (ex.: rodízio de 3 dias, toda
// semana) keep their duration on every occurrence.
function _shiftEndDate(occ) {
  if (!occ._isOccurrence || !occ.end_date) return occ;
  const durationDays = _daysBetween(occ._baseEventDate, occ.end_date);
  if (durationDays <= 0) return occ;
  return { ...occ, end_date: _addDaysISO(occ.start_date, durationDays) };
}

function _spreadMultiDay(events, start, end) {
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
      cur = _addDaysISO(cur, 1);
    }
  }
  return result;
}

function _daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86_400_000);
}

function _addDaysISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
