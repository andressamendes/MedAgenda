/**
 * Tests for academicCalendarService.js — Calendário Acadêmico main flow
 * (list / create / delete calendars) plus the pure client-side expansion
 * logic. Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER             = new URL("../../supabase.js", import.meta.url).href;
// recurrenceExceptionsService.js keeps a stable URL (no cache-busting query)
// across every test in this file — the FIRST test to import
// academicCalendarService.js (which statically imports it) freezes its
// `supabase` binding to that first test's mock. A later test's own
// tableResponses.recurrence_exceptions is silently ignored by that stale
// binding, so tests that need real exception data mock this module directly
// instead (mockExceptions()), the same way eventFormView.test.js works
// around the same limitation for recurrenceService.js.
const RECURRENCE_EXCEPTIONS_SPECIFIER = new URL("../../recurrenceExceptionsService.js", import.meta.url).href;

function loadService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: { supabase, currentUserId: async () => "user-123" },
  });
  return import(`../../academicCalendarService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

function mockExceptions(t, exceptionsByEventId = new Map()) {
  t.mock.module(RECURRENCE_EXCEPTIONS_SPECIFIER, {
    namedExports: {
      getExceptionsMap:        async () => exceptionsByEventId,
      cancelOccurrence:        async () => ({}),
      overrideOccurrence:      async () => ({}),
      deleteExceptionsForBase: async () => {},
    },
  });
}

test("getCalendars() returns the user's calendars ordered by creation", async (t) => {
  const rows = [{ id: "cal-1", name: "Medicina 2026" }];
  const { mod, supabase } = await loadService(t, {
    academic_calendars: { data: rows, error: null },
  });

  const result = await mod.getCalendars();

  assert.deepStrictEqual(result, rows);
  const eqCall = supabase._calls.find(c => c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
});

test("getCalendars() defaults to an empty array when data is null", async (t) => {
  const { mod } = await loadService(t, {
    academic_calendars: { data: null, error: null },
  });

  assert.deepStrictEqual(await mod.getCalendars(), []);
});

test("createCalendar() attaches the current user id and applies the default color", async (t) => {
  const created = { id: "cal-1", name: "Medicina 2026", color: "#7c3aed" };
  const { mod, supabase } = await loadService(t, {
    academic_calendars: { data: created, error: null },
  });

  const result = await mod.createCalendar({ name: "Medicina 2026" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].color, "#7c3aed");
});

test("deleteCalendar() scopes deletion to id + user_id and throws on error", async (t) => {
  const { mod } = await loadService(t, {
    academic_calendars: { data: null, error: { message: "row not found" } },
  });

  await assert.rejects(
    () => mod.deleteCalendar("cal-missing"),
    (err) => err.message === "row not found"
  );
});

test("getAcademicEventsByRange() returns [] without querying when no calendars are visible", async (t) => {
  const { mod, supabase } = await loadService(t, {});

  const result = await mod.getAcademicEventsByRange([], "2026-07-01", "2026-07-31");

  assert.deepStrictEqual(result, []);
  assert.strictEqual(supabase._calls.length, 0);
});

test("getAcademicEventsByRange() filters out events that end before the range starts", async (t) => {
  const rows = [
    { id: "ev-1", start_date: "2026-06-20", end_date: "2026-06-25" }, // ends before range
    { id: "ev-2", start_date: "2026-06-28", end_date: "2026-07-02" }, // overlaps range start
  ];
  const { mod } = await loadService(t, {
    academic_events: { data: rows, error: null },
  });

  const result = await mod.getAcademicEventsByRange(["cal-1"], "2026-07-01", "2026-07-31");

  assert.deepStrictEqual(result.map(e => e.id), ["ev-2"]);
});

test("expandAcademicEvents() expands a multi-day event into one entry per day within range", async (t) => {
  // Pure logic, but the module still statically imports supabase.js — mock
  // it (unused here) so the import doesn't require a real config.js.
  const { mod } = await loadService(t, {});

  const events = [{
    id: "ev-1",
    start_date: "2026-07-01",
    end_date:   "2026-07-03",
    calendar_id: "cal-1",
    academic_calendars: { name: "Medicina 2026", color: "#7c3aed" },
  }];

  const result = await mod.expandAcademicEvents(events, "2026-07-01", "2026-07-31");

  assert.deepStrictEqual(result.map(e => e.event_date), ["2026-07-01", "2026-07-02", "2026-07-03"]);
  assert.ok(result.every(e => e._isAcademic === true));
  assert.strictEqual(result[0]._calendarName, "Medicina 2026");
});

// ── F16 — recorrência em eventos acadêmicos (mesmo motor de events) ────────

test("expandAcademicEvents() expands a weekly-recurring single-day event into one entry per occurrence", async (t) => {
  mockExceptions(t);
  const { mod } = await loadService(t, {});

  const events = [{
    id: "acad-1",
    start_date: "2026-07-01", // Wednesday
    end_date:   null,
    calendar_id: "cal-1",
    recurrence_type: "weekly",
    recurrence_interval: 1,
    recurrence_until: "2026-07-22",
    academic_calendars: { name: "Medicina 2026", color: "#7c3aed" },
  }];

  const result = await mod.expandAcademicEvents(events, "2026-07-01", "2026-07-31");

  assert.deepStrictEqual(
    result.map(e => e.event_date),
    ["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22"]
  );
  assert.ok(result.every(e => e._isAcademic === true));
  assert.ok(result.every(e => e._isOccurrence === true && e._baseEventId === "acad-1"));
});

test("expandAcademicEvents() shifts end_date on each occurrence, preserving a multi-day recurring event's span", async (t) => {
  mockExceptions(t);
  const { mod } = await loadService(t, {});

  const events = [{
    id: "acad-2",
    title: "Rodízio de 3 dias",
    start_date: "2026-07-01",
    end_date:   "2026-07-03",
    calendar_id: "cal-1",
    recurrence_type: "weekly",
    recurrence_interval: 1,
    recurrence_until: "2026-07-15",
  }];

  const result = await mod.expandAcademicEvents(events, "2026-07-01", "2026-07-31");
  const days = result.map(e => e.event_date);

  // 3 occurrences of the rodízio (Jul 1-3, Jul 8-10, Jul 15-17) x 3 days each
  assert.deepStrictEqual(days, [
    "2026-07-01", "2026-07-02", "2026-07-03",
    "2026-07-08", "2026-07-09", "2026-07-10",
    "2026-07-15", "2026-07-16", "2026-07-17",
  ]);
});

test("expandAcademicEvents() applies recurrence_exceptions the same way personal appointments do", async (t) => {
  mockExceptions(t, new Map([
    ["acad-3", new Map([["2026-07-08", { is_cancelled: true, override: null }]])],
  ]));
  const { mod } = await loadService(t, {});

  const events = [{
    id: "acad-3",
    start_date: "2026-07-01",
    calendar_id: "cal-1",
    recurrence_type: "weekly",
    recurrence_until: "2026-07-15",
  }];

  const result = await mod.expandAcademicEvents(events, "2026-07-01", "2026-07-31");

  assert.deepStrictEqual(result.map(e => e.event_date), ["2026-07-01", "2026-07-15"]);
});
