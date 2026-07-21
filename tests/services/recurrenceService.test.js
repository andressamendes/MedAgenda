/**
 * Tests for recurrenceService.js (F16) — the shared "apenas esta / esta e
 * as próximas / toda a série" edit/delete scope resolution used by both
 * Compromissos (events) and Eventos de Calendário Acadêmico (academic_events).
 *
 * Direct dependencies (eventService.js, academicCalendarService.js,
 * recurrenceExceptionsService.js) are mocked; recurrenceService.js itself is
 * imported fresh (cache-busted) in every test so it re-links against each
 * test's mocks instead of a stale binding from an earlier test.
 */
import { test } from "node:test";
import assert from "node:assert";

const EVENT_SERVICE_SPECIFIER      = new URL("../../eventService.js", import.meta.url).href;
const ACADEMIC_SERVICE_SPECIFIER   = new URL("../../academicCalendarService.js", import.meta.url).href;
const EXCEPTIONS_SERVICE_SPECIFIER = new URL("../../recurrenceExceptionsService.js", import.meta.url).href;

function mockDeps(t, { events = {}, academic = {}, exceptions = {} } = {}) {
  const calls = [];

  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      createEvent:  async (fields) => { calls.push({ fn: "createEvent", fields }); return events.create?.(fields) ?? { id: "evt-new", ...fields }; },
      updateEvent:  async (id, fields) => { calls.push({ fn: "updateEvent", id, fields }); return events.update?.(id, fields) ?? { id, ...fields }; },
      deleteEvent:  async (id) => { calls.push({ fn: "deleteEvent", id }); return events.remove?.(id); },
      getEventById: async (id) => { calls.push({ fn: "getEventById", id }); return events.getById?.(id) ?? { id }; },
    },
  });

  t.mock.module(ACADEMIC_SERVICE_SPECIFIER, {
    namedExports: {
      createAcademicEvent:  async (fields) => { calls.push({ fn: "createAcademicEvent", fields }); return academic.create?.(fields) ?? { id: "acad-new", ...fields }; },
      updateAcademicEvent:  async (id, fields) => { calls.push({ fn: "updateAcademicEvent", id, fields }); return academic.update?.(id, fields) ?? { id, ...fields }; },
      deleteAcademicEvent:  async (id) => { calls.push({ fn: "deleteAcademicEvent", id }); return academic.remove?.(id); },
      getAcademicEventById: async (id) => { calls.push({ fn: "getAcademicEventById", id }); return academic.getById?.(id) ?? { id }; },
    },
  });

  t.mock.module(EXCEPTIONS_SERVICE_SPECIFIER, {
    namedExports: {
      getExceptionsMap:        async () => new Map(),
      cancelOccurrence:        async (sourceTable, baseId, date) => { calls.push({ fn: "cancelOccurrence", sourceTable, baseId, date }); },
      overrideOccurrence:      async (sourceTable, baseId, date, override) => { calls.push({ fn: "overrideOccurrence", sourceTable, baseId, date, override }); return exceptions.override?.(); },
      deleteExceptionsForBase: async (sourceTable, baseId) => { calls.push({ fn: "deleteExceptionsForBase", sourceTable, baseId }); },
    },
  });

  return calls;
}

async function loadService() {
  return import(`../../recurrenceService.js?t=${Math.random()}`);
}

// ── "Toda a série" ───────────────────────────────────────────────────────

test("applyEditScope('series') updates the base row directly, for both events and academic_events", async (t) => {
  const calls = mockDeps(t);
  const { applyEditScope, SCOPE } = await loadService();

  await applyEditScope({ sourceTable: "events", occurrence: { id: "evt-1" }, fields: { title: "Novo" }, scope: SCOPE.SERIES });
  await applyEditScope({ sourceTable: "academic_events", occurrence: { id: "acad-1" }, fields: { title: "Novo" }, scope: SCOPE.SERIES });

  assert.deepStrictEqual(calls, [
    { fn: "updateEvent", id: "evt-1", fields: { title: "Novo" } },
    { fn: "updateAcademicEvent", id: "acad-1", fields: { title: "Novo" } },
  ]);
});

test("a non-occurrence (base row, no _isOccurrence) always edits/deletes as a series, regardless of the scope argument", async (t) => {
  const calls = mockDeps(t);
  const { applyEditScope, applyDeleteScope, SCOPE } = await loadService();

  await applyEditScope({ sourceTable: "events", occurrence: { id: "evt-1" }, fields: { title: "X" }, scope: SCOPE.THIS });
  assert.deepStrictEqual(calls, [{ fn: "updateEvent", id: "evt-1", fields: { title: "X" } }]);

  calls.length = 0;
  await applyDeleteScope({ sourceTable: "events", occurrence: { id: "evt-1" }, scope: SCOPE.FUTURE });
  assert.deepStrictEqual(calls, [
    { fn: "deleteExceptionsForBase", sourceTable: "events", baseId: "evt-1" },
    { fn: "deleteEvent", id: "evt-1" },
  ]);
});

test("applyDeleteScope('series') clears exceptions before deleting the base row", async (t) => {
  const calls = mockDeps(t);
  const { applyDeleteScope, SCOPE } = await loadService();

  await applyDeleteScope({ sourceTable: "events", occurrence: { id: "evt-1" }, scope: SCOPE.SERIES });

  assert.deepStrictEqual(calls, [
    { fn: "deleteExceptionsForBase", sourceTable: "events", baseId: "evt-1" },
    { fn: "deleteEvent", id: "evt-1" },
  ]);
});

// ── "Apenas esta" ────────────────────────────────────────────────────────

test("applyEditScope('this') writes an override exception and never touches the base row", async (t) => {
  const calls = mockDeps(t);
  const { applyEditScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-12", _isOccurrence: true, _baseEventId: "evt-recur" };
  await applyEditScope({
    sourceTable: "events",
    occurrence,
    fields: { title: "Só hoje", recurrence_type: "weekly", recurrence_interval: 3 },
    scope: SCOPE.THIS,
  });

  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0], {
    fn: "overrideOccurrence", sourceTable: "events", baseId: "evt-recur", date: "2026-08-12",
    override: { title: "Só hoje" }, // recurrence rule fields stripped — a single occurrence never carries its own rule
  });
  assert.deepStrictEqual(calls[1], { fn: "getEventById", id: "evt-recur" });
});

test("applyDeleteScope('this') cancels just that occurrence's date, leaving the series and its base row untouched", async (t) => {
  const calls = mockDeps(t);
  const { applyDeleteScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-12", _isOccurrence: true, _baseEventId: "evt-recur" };
  await applyDeleteScope({ sourceTable: "events", occurrence, scope: SCOPE.THIS });

  assert.deepStrictEqual(calls, [
    { fn: "cancelOccurrence", sourceTable: "events", baseId: "evt-recur", date: "2026-08-12" },
  ]);
});

// ── "Esta e as próximas" ─────────────────────────────────────────────────

test("applyEditScope('future') truncates the original series and creates a new one from this occurrence onward", async (t) => {
  const calls = mockDeps(t, { events: { getById: () => ({ id: "evt-recur", event_date: "2026-08-01" }) } });
  const { applyEditScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-15", _isOccurrence: true, _baseEventId: "evt-recur" };
  const fields = { title: "Novo horário", event_date: "2026-08-15", recurrence_type: "weekly" };
  await applyEditScope({ sourceTable: "events", occurrence, fields, scope: SCOPE.FUTURE });

  assert.deepStrictEqual(calls, [
    { fn: "getEventById", id: "evt-recur" },
    { fn: "updateEvent", id: "evt-recur", fields: { recurrence_until: "2026-08-14", recurrence_count: null } },
    { fn: "createEvent", fields: { ...fields, recurrence_parent_id: "evt-recur" } },
  ]);
});

test("applyEditScope('future') on the series' own first occurrence deletes the original instead of leaving an empty truncated series", async (t) => {
  const calls = mockDeps(t, { events: { getById: () => ({ id: "evt-recur", event_date: "2026-08-01" }) } });
  const { applyEditScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-01", _isOccurrence: true, _baseEventId: "evt-recur" };
  const fields = { title: "Editada", event_date: "2026-08-01" };
  await applyEditScope({ sourceTable: "events", occurrence, fields, scope: SCOPE.FUTURE });

  assert.deepStrictEqual(calls, [
    { fn: "getEventById", id: "evt-recur" },
    { fn: "deleteExceptionsForBase", sourceTable: "events", baseId: "evt-recur" },
    { fn: "deleteEvent", id: "evt-recur" },
    { fn: "createEvent", fields: { ...fields, recurrence_parent_id: "evt-recur" } },
  ]);
});

test("applyDeleteScope('future') truncates recurrence_until the day before this occurrence", async (t) => {
  const calls = mockDeps(t, { events: { getById: () => ({ id: "evt-recur", event_date: "2026-08-01" }) } });
  const { applyDeleteScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-15", _isOccurrence: true, _baseEventId: "evt-recur" };
  await applyDeleteScope({ sourceTable: "events", occurrence, scope: SCOPE.FUTURE });

  assert.deepStrictEqual(calls, [
    { fn: "getEventById", id: "evt-recur" },
    { fn: "updateEvent", id: "evt-recur", fields: { recurrence_until: "2026-08-14", recurrence_count: null } },
  ]);
});

test("applyDeleteScope('future') on the series' first occurrence deletes the whole series (nothing is left before it)", async (t) => {
  const calls = mockDeps(t, { events: { getById: () => ({ id: "evt-recur", event_date: "2026-08-01" }) } });
  const { applyDeleteScope, SCOPE } = await loadService();

  const occurrence = { id: "evt-recur", event_date: "2026-08-01", _isOccurrence: true, _baseEventId: "evt-recur" };
  await applyDeleteScope({ sourceTable: "events", occurrence, scope: SCOPE.FUTURE });

  assert.deepStrictEqual(calls, [
    { fn: "getEventById", id: "evt-recur" },
    { fn: "deleteExceptionsForBase", sourceTable: "events", baseId: "evt-recur" },
    { fn: "deleteEvent", id: "evt-recur" },
  ]);
});

// ── isRecurring / isExpandedOccurrence ───────────────────────────────────

test("isRecurring() / isExpandedOccurrence() read the exact flags the rest of the app relies on", async (t) => {
  mockDeps(t);
  const { isRecurring, isExpandedOccurrence } = await loadService();

  assert.strictEqual(isRecurring({ recurrence_type: "weekly" }), true);
  assert.strictEqual(isRecurring({ recurrence_type: "none" }), false);
  assert.strictEqual(isRecurring({}), false);
  assert.strictEqual(isRecurring(null), false);

  assert.strictEqual(isExpandedOccurrence({ _isOccurrence: true }), true);
  assert.strictEqual(isExpandedOccurrence({ id: "evt-1" }), false);
  assert.strictEqual(isExpandedOccurrence(null), false);
});
