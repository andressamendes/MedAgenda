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

// ── Occurrence factory ─────────────────────────────────────────────────────

function occurrence(event, date) {
  return {
    ...event,
    event_date:     isoDate(date),
    _isOccurrence:  true,
    _baseEventId:   event.id,
    _baseEventDate: event.event_date,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Expands every event in the array, returning a flat list of occurrences
 * within [rangeStart, rangeEnd].
 */
export function expandEvents(events, rangeStart, rangeEnd) {
  return events.flatMap(ev => expandEvent(ev, rangeStart, rangeEnd));
}

/**
 * Expands a single event into all occurrences within [rangeStart, rangeEnd].
 * Non-recurring events are returned unchanged if they fall in the range.
 */
export function expandEvent(event, rangeStart, rangeEnd) {
  const type = event.recurrence_type;

  if (!type || type === "none") {
    return event.event_date >= rangeStart && event.event_date <= rangeEnd
      ? [event]
      : [];
  }

  if (type === "custom") return expandCustom(event, rangeStart, rangeEnd);

  return expandSimple(event, rangeStart, rangeEnd);
}

// ── Simple step-based types ────────────────────────────────────────────────

function expandSimple(event, rangeStart, rangeEnd) {
  const type     = event.recurrence_type;
  const base     = localDate(event.event_date);
  const end      = event.recurrence_until
    ? minDate(localDate(event.recurrence_until), localDate(rangeEnd))
    : localDate(rangeEnd);
  const start    = localDate(rangeStart);
  const interval = Math.max(1, event.recurrence_interval || 1);

  let cur = new Date(base);

  // For weekdays: skip if base falls on a weekend
  if (type === "weekdays") {
    while (cur.getDay() === 0 || cur.getDay() === 6) cur.setDate(cur.getDate() + 1);
  }

  const occurrences = [];
  let guard = 0;

  while (cur <= end && guard++ < 3000) {
    if (cur >= start) occurrences.push(occurrence(event, cur));

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

function expandCustom(event, rangeStart, rangeEnd) {
  const base   = localDate(event.event_date);
  const end    = event.recurrence_until
    ? minDate(localDate(event.recurrence_until), localDate(rangeEnd))
    : localDate(rangeEnd);
  const start  = localDate(rangeStart);
  const nWeeks = Math.max(1, event.recurrence_interval || 1);
  // daysOfWeek: JS day numbers (0=Sun, 1=Mon … 6=Sat)
  const days   = event.recurrence_days_of_week
    ? event.recurrence_days_of_week.split(",").map(Number)
    : [base.getDay()]; // default: same weekday as base event

  const baseMon = mondayOf(base);
  const occurrences = [];
  let weekMon = new Date(baseMon);
  let guard = 0;

  while (weekMon <= end && guard++ < 1000) {
    const weekNum = Math.round((weekMon - baseMon) / (7 * 86_400_000));
    if (weekNum % nWeeks === 0) {
      for (const dow of days) {
        // offset from Monday: (dow + 6) % 7 → Mon=0 … Sun=6
        const d = addDays(weekMon, (dow + 6) % 7);
        if (d >= base && d >= start && d <= end) {
          occurrences.push(occurrence(event, d));
        }
      }
    }
    weekMon = addDays(weekMon, 7);
  }

  // Sort by date (multiple days per week can arrive unordered)
  occurrences.sort((a, b) => (a.event_date > b.event_date ? 1 : -1));
  return occurrences;
}
