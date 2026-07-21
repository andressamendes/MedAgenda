/**
 * Tests for recurrence.js — expandEvent and expandEvents.
 * Run with: node --experimental-vm-modules tests/recurrence.test.js
 */

import { expandEvent, expandEvents } from "../recurrence.js";

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    console.error(`  ✗ ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertLength(description, arr, len) {
  if (arr.length === len) {
    passed++;
    console.log(`  ✓ ${description} (${len} items)`);
  } else {
    failed++;
    console.error(`  ✗ ${description}: expected ${len} items, got ${arr.length}`);
  }
}

function dates(occurrences) {
  return occurrences.map(o => o.event_date);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    id:                      "evt-1",
    title:                   "Test Event",
    event_date:              "2024-01-01",
    start_time:              "09:00",
    recurrence_type:         "none",
    recurrence_interval:     null,
    recurrence_until:        null,
    recurrence_days_of_week: null,
    ...overrides,
  };
}

// ── Non-recurring ─────────────────────────────────────────────────────────────
console.log("\nNon-recurring events");

const nonRecurring = makeEvent({ event_date: "2024-03-15" });
assert(
  "returns event within range",
  dates(expandEvent(nonRecurring, "2024-03-01", "2024-03-31")),
  ["2024-03-15"]
);
assertLength(
  "returns empty when out of range",
  expandEvent(nonRecurring, "2024-04-01", "2024-04-30"),
  0
);

// ── Daily recurrence ──────────────────────────────────────────────────────────
console.log("\nDaily recurrence");

const daily = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "daily",
  recurrence_until: "2024-01-05",
});
const dailyResult = expandEvent(daily, "2024-01-01", "2024-01-10");
assert(
  "generates correct dates",
  dates(dailyResult),
  ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]
);

const dailyTruncated = expandEvent(daily, "2024-01-03", "2024-01-10");
assert(
  "starts from range start, not event_date",
  dates(dailyTruncated),
  ["2024-01-03", "2024-01-04", "2024-01-05"]
);

// ── Weekly recurrence ─────────────────────────────────────────────────────────
console.log("\nWeekly recurrence");

// 2024-01-01 is a Monday
const weekly = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "weekly",
  recurrence_until: "2024-02-05",
});
const weeklyResult = expandEvent(weekly, "2024-01-01", "2024-02-05");
assert(
  "generates Monday occurrences",
  dates(weeklyResult),
  ["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22", "2024-01-29", "2024-02-05"]
);

// ── Biweekly recurrence ───────────────────────────────────────────────────────
console.log("\nBiweekly recurrence");

const biweekly = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "biweekly",
  recurrence_until: "2024-02-15",
});
const biweeklyResult = expandEvent(biweekly, "2024-01-01", "2024-02-15");
assert(
  "generates every-2-week occurrences",
  dates(biweeklyResult),
  ["2024-01-01", "2024-01-15", "2024-01-29", "2024-02-12"]
);

// ── Weekdays recurrence ───────────────────────────────────────────────────────
console.log("\nWeekdays recurrence");

// 2024-01-01 is Monday
const weekdays = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "weekdays",
  recurrence_until: "2024-01-12",
});
const weekdaysResult = expandEvent(weekdays, "2024-01-01", "2024-01-12");
assert(
  "generates Mon-Fri only",
  dates(weekdaysResult),
  ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05",
   "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11", "2024-01-12"]
);

// ── Monthly recurrence ────────────────────────────────────────────────────────
console.log("\nMonthly recurrence");

const monthly = makeEvent({
  event_date:      "2024-01-15",
  recurrence_type: "monthly",
  recurrence_until: "2024-06-30",
});
const monthlyResult = expandEvent(monthly, "2024-01-01", "2024-06-30");
assert(
  "generates monthly on the 15th",
  dates(monthlyResult),
  ["2024-01-15", "2024-02-15", "2024-03-15", "2024-04-15", "2024-05-15", "2024-06-15"]
);

// ── Yearly recurrence ─────────────────────────────────────────────────────────
console.log("\nYearly recurrence");

const yearly = makeEvent({
  event_date:      "2024-03-10",
  recurrence_type: "yearly",
  recurrence_until: "2027-12-31",
});
const yearlyResult = expandEvent(yearly, "2024-01-01", "2027-12-31");
assert(
  "generates yearly occurrences",
  dates(yearlyResult),
  ["2024-03-10", "2025-03-10", "2026-03-10", "2027-03-10"]
);

// ── Custom recurrence ─────────────────────────────────────────────────────────
console.log("\nCustom recurrence (every 2 weeks, Mon+Wed)");

// 2024-01-01 = Monday → base week: Mon Jan 1, Wed Jan 3
const custom = makeEvent({
  event_date:              "2024-01-01",
  recurrence_type:         "custom",
  recurrence_interval:     2,
  recurrence_days_of_week: "1,3", // Monday=1, Wednesday=3
  recurrence_until:        "2024-02-15",
});
const customResult = expandEvent(custom, "2024-01-01", "2024-02-15");
assert(
  "generates biweekly Mon+Wed occurrences",
  dates(customResult),
  // Week of Jan 1: Mon Jan 1, Wed Jan 3
  // Week of Jan 15 (skip Jan 8): Mon Jan 15, Wed Jan 17
  // Week of Jan 29: Mon Jan 29, Wed Jan 31
  // Week of Feb 12: Mon Feb 12, Wed Feb 14
  ["2024-01-01", "2024-01-03", "2024-01-15", "2024-01-17", "2024-01-29", "2024-01-31", "2024-02-12", "2024-02-14"]
);

// ── Occurrence metadata ───────────────────────────────────────────────────────
console.log("\nOccurrence metadata");

const meta = makeEvent({
  id:              "base-123",
  event_date:      "2024-01-01",
  recurrence_type: "daily",
  recurrence_until: "2024-01-03",
});
const metaResult = expandEvent(meta, "2024-01-01", "2024-01-03");
assert("_isOccurrence flag set", metaResult[0]._isOccurrence, true);
assert("_baseEventId preserved", metaResult[1]._baseEventId, "base-123");
assert("_baseEventDate preserved", metaResult[1]._baseEventDate, "2024-01-01");
assert("event_date changes per occurrence", metaResult[1].event_date, "2024-01-02");

// ── expandEvents (array version) ──────────────────────────────────────────────
console.log("\nexpandEvents (array)");

const events = [
  makeEvent({ id: "a", event_date: "2024-03-15", recurrence_type: "none" }),
  makeEvent({ id: "b", event_date: "2024-03-10", recurrence_type: "daily", recurrence_until: "2024-03-12" }),
];
const expanded = expandEvents(events, "2024-03-01", "2024-03-31");
assertLength("non-recurring + 3 daily occurrences = 4 total", expanded, 4);

// ── No recurrence_until (open-ended) ─────────────────────────────────────────
console.log("\nOpen-ended recurrence (no until)");

const openEnded = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "weekly",
});
const openResult = expandEvent(openEnded, "2024-01-01", "2024-01-22");
assert(
  "generates until range end when no until date",
  dates(openResult),
  ["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22"]
);

// ── F16 — COUNT (fim por número de ocorrências) ────────────────────────────
console.log("\nCOUNT — fim por número de ocorrências");

const countDaily = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "daily",
  recurrence_count: 3,
});
assert(
  "daily stops after N occurrences, independent of range end",
  dates(expandEvent(countDaily, "2024-01-01", "2024-01-31")),
  ["2024-01-01", "2024-01-02", "2024-01-03"]
);

const countWeeklyNarrowRange = makeEvent({
  event_date:      "2024-01-01",
  recurrence_type: "weekly",
  recurrence_count: 4,
});
assert(
  "COUNT is computed from the base date, not the query range — a later, narrower window still sees only the remaining occurrences",
  dates(expandEvent(countWeeklyNarrowRange, "2024-01-15", "2024-01-31")),
  ["2024-01-15", "2024-01-22"]
);

const countCustom = makeEvent({
  event_date:              "2024-01-01", // Monday
  recurrence_type:         "custom",
  recurrence_interval:     1,
  recurrence_days_of_week: "1,3", // Mon, Wed
  recurrence_count:        3,
});
assert(
  "custom (weekly BYDAY) stops after N occurrences across multiple days per week",
  dates(expandEvent(countCustom, "2024-01-01", "2024-02-01")),
  ["2024-01-01", "2024-01-03", "2024-01-08"]
);

// ── F16 — dateField (academic_events usa start_date, não event_date) ───────
console.log("\ndateField — expansão sobre uma coluna de data diferente");

const academicWeekly = {
  id: "acad-1",
  title: "Aula de Anatomia",
  start_date: "2024-01-01", // Monday
  recurrence_type: "weekly",
  recurrence_interval: 1,
  recurrence_until: "2024-01-22",
};
const academicResult = expandEvent(academicWeekly, "2024-01-01", "2024-01-31", { dateField: "start_date" });
assert(
  "expands using start_date instead of event_date",
  academicResult.map(o => o.start_date),
  ["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22"]
);
assert("_baseEventDate reads from the custom dateField too", academicResult[1]._baseEventDate, "2024-01-01");

// ── F16 — Exceções (recurrence_exceptions: cancelamento e sobrescrita) ─────
console.log("\nExceções — cancelamento e sobrescrita de uma ocorrência pontual");

const exceptionBase = makeEvent({
  id:               "evt-exc",
  event_date:       "2024-01-01",
  recurrence_type:  "weekly",
  recurrence_until: "2024-01-22",
});

const cancelledMap = new Map([
  ["evt-exc", new Map([["2024-01-08", { is_cancelled: true, override: null }]])],
]);
assert(
  "a cancelled occurrence is dropped from the expansion (EXDATE-equivalent)",
  dates(expandEvent(exceptionBase, "2024-01-01", "2024-01-31", { exceptionsByEventId: cancelledMap })),
  ["2024-01-01", "2024-01-15", "2024-01-22"]
);

const overriddenMap = new Map([
  ["evt-exc", new Map([["2024-01-08", { is_cancelled: false, override: { title: "Aula remarcada" } }]])],
]);
const overriddenResult = expandEvent(exceptionBase, "2024-01-01", "2024-01-31", { exceptionsByEventId: overriddenMap });
assert(
  "an overridden occurrence keeps its place in the series but with the overridden fields",
  overriddenResult.map(o => o.title),
  ["Test Event", "Aula remarcada", "Test Event", "Test Event"]
);
assert(
  "the override never changes which date the occurrence lands on",
  overriddenResult[1].event_date,
  "2024-01-08"
);

// Exceção sobre a PRÓPRIA data-base da série (primeira ocorrência) — mesmo
// tratamento de qualquer outra ocorrência, já que occurrence() é aplicado
// uniformemente a todas as datas geradas (inclusive a primeira).
const cancelledFirstMap = new Map([
  ["evt-exc", new Map([["2024-01-01", { is_cancelled: true, override: null }]])],
]);
assert(
  "cancelling the series' own base date removes just that occurrence, the rest of the series survives",
  dates(expandEvent(exceptionBase, "2024-01-01", "2024-01-31", { exceptionsByEventId: cancelledFirstMap })),
  ["2024-01-08", "2024-01-15", "2024-01-22"]
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
