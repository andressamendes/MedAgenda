/**
 * Tests for activitySessionService.js — CRUD against Supabase.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadActivitySessionService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../activitySessionService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("createActivitySession() inserts with the current user's id and returns the created row", async (t) => {
  const created = { id: "sess-1", status: "running", user_id: "user-123" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: created, error: null },
  });

  const result = await mod.createActivitySession({ status: "running", source: "manual" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].status, "running");
});

test("createActivitySession() propagates a Supabase error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "insert failed" } },
  });

  await assert.rejects(
    () => mod.createActivitySession({ status: "running" }),
    (err) => err.message === "insert failed"
  );
});

test("getActivitySessionById() scopes the lookup to id + user_id and returns the row", async (t) => {
  const row = { id: "sess-1", status: "running" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: row, error: null },
  });

  const result = await mod.getActivitySessionById("sess-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("getActivitySessionById() returns null when no row matches, without throwing", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  const result = await mod.getActivitySessionById("sess-missing");

  assert.strictEqual(result, null);
});

test("getActivitySessions() returns rows scoped to the current user, most recent first", async (t) => {
  const rows = [{ id: "sess-2" }, { id: "sess-1" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.getActivitySessions();

  assert.deepStrictEqual(result, rows);
  const eqCall = supabase._calls.find(c => c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
});

test("updateActivitySession() scopes the update to id + user_id and returns the updated row", async (t) => {
  const updated = { id: "sess-1", status: "finished" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: updated, error: null },
  });

  const result = await mod.updateActivitySession("sess-1", { status: "finished" });

  assert.deepStrictEqual(result, updated);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("deleteActivitySession() scopes the delete to id + user_id", async (t) => {
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  await mod.deleteActivitySession("sess-1");

  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "sess-1"], ["user_id", "user-123"]]);
});

test("deleteActivitySession() throws when Supabase reports an error", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: { message: "not found" } },
  });

  await assert.rejects(
    () => mod.deleteActivitySession("sess-missing"),
    (err) => err.message === "not found"
  );
});
