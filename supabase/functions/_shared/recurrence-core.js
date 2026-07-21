/**
 * Canonical recurrence logic — single source of truth.
 *
 * Imported by:
 *   - recurrence.js  (frontend / browser)
 *   - supabase/functions/send-push-notifications/index.ts  (Deno Edge Function)
 *
 * Pure ES module. No external dependencies. No runtime-specific APIs.
 * All date strings are ISO "YYYY-MM-DD".
 */

// ── Date helpers ───────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function minDate(a, b) { return a < b ? a : b; }

// ── Occurrence factory ──────────────────────────────────────────────────────
// dateField lets the same core serve tables with a different date column
// (events.event_date vs. academic_events.start_date) without branching logic
// per table — see expandEvents()/expandEvent() `dateField` option.
//
// Exceptions (recurrence_exceptions — see sql/24_recurrence_shared.sql) are
// applied here, uniformly for every generated date including the base
// event's own date: `cancelled` drops the occurrence (EXDATE-equivalent),
// `override` is a shallow merge on top of the occurrence's fields
// (RECURRENCE-ID-equivalent, used by "editar apenas esta ocorrência").

function occurrence(event, date, dateField, exceptionsForEvent) {
  const dateStr = isoDate(date);
  const exception = exceptionsForEvent?.get(dateStr);
  if (exception?.is_cancelled) return null;

  const base = {
    ...event,
    [dateField]:    dateStr,
    _isOccurrence:  true,
    _baseEventId:   event.id,
    _baseEventDate: event[dateField],
  };
  return exception?.override ? { ...base, ...exception.override, [dateField]: dateStr } : base;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Expands every event in the array, returning a flat list of occurrences
 * within [rangeStart, rangeEnd].
 *
 * @param {{dateField?: string, exceptionsByEventId?: Map<string, Map<string, object>>}} [options]
 *   dateField: which field on the event carries its date (default "event_date").
 *   exceptionsByEventId: base event id -> Map(occurrence ISO date -> {is_cancelled, override}).
 */
export function expandEvents(events, rangeStart, rangeEnd, options = {}) {
  return events.flatMap(ev => expandEvent(ev, rangeStart, rangeEnd, options));
}

/**
 * Expands a single event into all occurrences within [rangeStart, rangeEnd].
 * Non-recurring events are returned unchanged if they fall in the range.
 */
export function expandEvent(event, rangeStart, rangeEnd, options = {}) {
  const dateField = options.dateField || "event_date";
  const exceptionsForEvent = options.exceptionsByEventId?.get(event.id);
  const type = event.recurrence_type;

  if (!type || type === "none") {
    const date = event[dateField];
    if (date < rangeStart || date > rangeEnd) return [];
    const occ = occurrence(event, localDate(date), dateField, exceptionsForEvent);
    return occ ? [occ] : [];
  }

  if (type === "custom") return expandCustom(event, rangeStart, rangeEnd, dateField, exceptionsForEvent);

  return expandSimple(event, rangeStart, rangeEnd, dateField, exceptionsForEvent);
}

// ── Simple step-based types ────────────────────────────────────────────────

function expandSimple(event, rangeStart, rangeEnd, dateField, exceptionsForEvent) {
  const type     = event.recurrence_type;
  const base     = localDate(event[dateField]);
  const end      = event.recurrence_until
    ? minDate(localDate(event.recurrence_until), localDate(rangeEnd))
    : localDate(rangeEnd);
  const start    = localDate(rangeStart);
  const interval = Math.max(1, event.recurrence_interval || 1);
  const maxCount = event.recurrence_count > 0 ? event.recurrence_count : Infinity;

  let cur = new Date(base);

  // For weekdays: skip if base falls on a weekend
  if (type === "weekdays") {
    while (cur.getDay() === 0 || cur.getDay() === 6) cur.setDate(cur.getDate() + 1);
  }

  const occurrences = [];
  let guard = 0;
  let emitted = 0; // counts every generated occurrence (COUNT is from the base date, not the query range)

  while (cur <= end && emitted < maxCount && guard++ < 3000) {
    emitted++;
    if (cur >= start) {
      const occ = occurrence(event, cur, dateField, exceptionsForEvent);
      if (occ) occurrences.push(occ);
    }

    switch (type) {
      case "daily":
        cur = addDays(cur, interval);
        break;
      case "weekdays":
        cur = addDays(cur, 1);
        while (cur.getDay() === 0 || cur.getDay() === 6) cur = addDays(cur, 1);
        break;
      case "weekly":
        cur = addDays(cur, 7 * interval);
        break;
      case "biweekly":
        cur = addDays(cur, 14);
        break;
      case "monthly":
        cur = new Date(cur);
        cur.setMonth(cur.getMonth() + interval);
        break;
      case "yearly":
        cur = new Date(cur);
        cur.setFullYear(cur.getFullYear() + interval);
        break;
      default:
        guard = 3001; // unknown type — stop
    }
  }

  return occurrences;
}

// ── Custom (N-weekly on specific days of week) ─────────────────────────────

function expandCustom(event, rangeStart, rangeEnd, dateField, exceptionsForEvent) {
  const base   = localDate(event[dateField]);
  const end    = event.recurrence_until
    ? minDate(localDate(event.recurrence_until), localDate(rangeEnd))
    : localDate(rangeEnd);
  const start  = localDate(rangeStart);
  const nWeeks = Math.max(1, event.recurrence_interval || 1);
  const maxCount = event.recurrence_count > 0 ? event.recurrence_count : Infinity;
  // daysOfWeek: JS day numbers (0=Sun, 1=Mon … 6=Sat)
  const days   = event.recurrence_days_of_week
    ? event.recurrence_days_of_week.split(",").map(Number)
    : [base.getDay()]; // default: same weekday as base event

  const baseMon = mondayOf(base);
  const occurrences = [];
  let weekMon = new Date(baseMon);
  let guard = 0;
  let emitted = 0; // counts every generated occurrence, in date order, across all BYDAY days

  while (weekMon <= end && emitted < maxCount && guard++ < 1000) {
    const weekNum = Math.round((weekMon - baseMon) / (7 * 86_400_000));
    if (weekNum % nWeeks === 0) {
      // offset from Monday: (dow + 6) % 7 → Mon=0 … Sun=6, so days within the
      // week are already visited in chronological order.
      const sortedDays = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      for (const dow of sortedDays) {
        if (emitted >= maxCount) break;
        const d = addDays(weekMon, (dow + 6) % 7);
        if (d < base) continue;
        emitted++;
        if (d >= start && d <= end) {
          const occ = occurrence(event, d, dateField, exceptionsForEvent);
          if (occ) occurrences.push(occ);
        }
      }
    }
    weekMon = addDays(weekMon, 7);
  }

  // Sort by date (multiple days per week can arrive unordered)
  occurrences.sort((a, b) => (a[dateField] > b[dateField] ? 1 : -1));
  return occurrences;
}
