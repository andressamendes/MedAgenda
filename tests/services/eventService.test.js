/**
 * Tests for eventService.js — CRUD + range queries against Supabase.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

// Each test needs its own mock, and eventService.js resolves `./supabase.js`
// only once per distinct module instance — mock via the test-scoped
// `t.mock.module()` (auto-restored after the test) and cache-bust the
// dynamic import so eventService.js re-evaluates against the new mock.
function loadEventService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../eventService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("createEvent() inserts with the current user's id and returns the created row", async (t) => {
  const created = { id: "evt-1", title: "Prova de Anatomia", user_id: "user-123" };
  const { mod, supabase } = await loadEventService(t, {
    events: { data: created, error: null },
  });

  const result = await mod.createEvent({ title: "Prova de Anatomia" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].title, "Prova de Anatomia");
});

test("createEvent() propagates a Supabase error", async (t) => {
  const { mod } = await loadEventService(t, {
    events: { data: null, error: { message: "insert failed" } },
  });

  await assert.rejects(
    () => mod.createEvent({ title: "X" }),
    (err) => err.message === "insert failed"
  );
});

test("getEvents() returns rows scoped to the current user", async (t) => {
  const rows = [{ id: "evt-1" }, { id: "evt-2" }];
  const { mod, supabase } = await loadEventService(t, {
    events: { data: rows, error: null },
  });

  const result = await mod.getEvents();

  assert.deepStrictEqual(result, rows);
  const eqCall = supabase._calls.find(c => c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
});

test("getEventById() scopes the lookup to id + user_id and returns the row", async (t) => {
  const row = { id: "evt-1", title: "Prova de Anatomia" };
  const { mod, supabase } = await loadEventService(t, {
    events: { data: row, error: null },
  });

  const result = await mod.getEventById("evt-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "evt-1"], ["user_id", "user-123"]]);
});

test("getEventById() returns null when no row matches, without throwing", async (t) => {
  const { mod } = await loadEventService(t, {
    events: { data: null, error: null },
  });

  const result = await mod.getEventById("evt-missing");

  assert.strictEqual(result, null);
});

test("updateEvent() scopes the update to id + user_id and returns the updated row", async (t) => {
  const updated = { id: "evt-1", title: "Novo título" };
  const { mod, supabase } = await loadEventService(t, {
    events: { data: updated, error: null },
  });

  const result = await mod.updateEvent("evt-1", { title: "Novo título" });

  assert.deepStrictEqual(result, updated);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "evt-1"], ["user_id", "user-123"]]);
});

test("deleteEvent() scopes the delete to id + user_id", async (t) => {
  const { mod, supabase } = await loadEventService(t, {
    events: { data: null, error: null },
  });

  await mod.deleteEvent("evt-1");

  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "evt-1"], ["user_id", "user-123"]]);
});

test("deleteEvent() throws when Supabase reports an error", async (t) => {
  const { mod } = await loadEventService(t, {
    events: { data: null, error: { message: "not found" } },
  });

  await assert.rejects(
    () => mod.deleteEvent("evt-missing"),
    (err) => err.message === "not found"
  );
});

test("getEventsByRange() merges in-range events with pre-existing recurring bases, de-duplicated by id", async (t) => {
  const inRange       = [{ id: "evt-1" }, { id: "evt-shared" }];
  const recurringBase = [{ id: "evt-shared" }, { id: "evt-recurring" }];
  const { mod } = await loadEventService(t, {
    // getEventsByRange fires two sequential `.from("events")` queries inside
    // Promise.all — the queue returns them in call order.
    events: [
      { data: inRange, error: null },
      { data: recurringBase, error: null },
    ],
  });

  const result = await mod.getEventsByRange("2026-07-01", "2026-07-31");

  assert.deepStrictEqual(
    result.map(e => e.id).sort(),
    ["evt-1", "evt-recurring", "evt-shared"]
  );
});

// ── F15.10 — cache de leitura por carregamento ──────────────────────────────
// getEvents() memoiza a consulta integral; toda escrita do service (e o
// invalidateEventsCache() exportado) descarta o cache. Consultas completas
// são identificáveis no mock por select("*") — os `.select()` encadeados nos
// writes não levam argumento.

function countFullSelects(supabase) {
  return supabase._calls.filter(
    c => c.table === "events" && c.method === "select" && c.args[0] === "*"
  ).length;
}

test("getEvents() memoizes: two consecutive calls fire a single query", async (t) => {
  const rows = [{ id: "evt-1" }, { id: "evt-2" }];
  const { mod, supabase } = await loadEventService(t, {
    events: { data: rows, error: null },
  });

  const first  = await mod.getEvents();
  const second = await mod.getEvents();

  assert.strictEqual(countFullSelects(supabase), 1);
  assert.deepStrictEqual(first, rows);
  assert.deepStrictEqual(second, rows);
  // Each call gets its own shallow copy — a consumer sorting/filtering the
  // returned array in place must not corrupt the shared cache.
  assert.notStrictEqual(first, second);
});

test("createEvent() invalidates the getEvents() cache", async (t) => {
  const { mod, supabase } = await loadEventService(t, {
    events: [
      { data: [{ id: "evt-1" }], error: null },                   // initial getEvents
      { data: { id: "evt-2" }, error: null },                     // createEvent
      { data: [{ id: "evt-1" }, { id: "evt-2" }], error: null },  // refetch
    ],
  });

  await mod.getEvents();
  await mod.createEvent({ title: "X" });
  const after = await mod.getEvents();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.deepStrictEqual(after.map(e => e.id), ["evt-1", "evt-2"]);
});

test("updateEvent() invalidates the getEvents() cache", async (t) => {
  const { mod, supabase } = await loadEventService(t, {
    events: [
      { data: [{ id: "evt-1", title: "A" }], error: null },
      { data: { id: "evt-1", title: "B" }, error: null },
      { data: [{ id: "evt-1", title: "B" }], error: null },
    ],
  });

  await mod.getEvents();
  await mod.updateEvent("evt-1", { title: "B" });
  const after = await mod.getEvents();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.strictEqual(after[0].title, "B");
});

test("deleteEvent() invalidates the getEvents() cache", async (t) => {
  const { mod, supabase } = await loadEventService(t, {
    events: [
      { data: [{ id: "evt-1" }], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ],
  });

  await mod.getEvents();
  await mod.deleteEvent("evt-1");
  const after = await mod.getEvents();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.deepStrictEqual(after, []);
});

test("invalidateEventsCache() forces the next getEvents() to re-query (logout reset)", async (t) => {
  const { mod, supabase } = await loadEventService(t, {
    events: { data: [{ id: "evt-1" }], error: null },
  });

  await mod.getEvents();
  mod.invalidateEventsCache();
  await mod.getEvents();

  assert.strictEqual(countFullSelects(supabase), 2);
});

test("a failed getEvents() is not memoized: the next call re-queries", async (t) => {
  const rows = [{ id: "evt-1" }];
  const { mod } = await loadEventService(t, {
    events: [
      { data: null, error: { message: "network down" } },
      { data: rows, error: null },
    ],
  });

  await assert.rejects(() => mod.getEvents(), (err) => err.message === "network down");
  const retry = await mod.getEvents();

  assert.deepStrictEqual(retry, rows);
});

test("getEventsByRange() throws if the in-range query errors", async (t) => {
  const { mod } = await loadEventService(t, {
    events: [
      { data: null, error: { message: "network down" } },
      { data: [], error: null },
    ],
  });

  await assert.rejects(
    () => mod.getEventsByRange("2026-07-01", "2026-07-31"),
    (err) => err.message === "network down"
  );
});
