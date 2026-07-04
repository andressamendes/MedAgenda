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

// ── Domínio ──────────────────────────────────────────────────────────────

test("getRunningSession() returns null when there is no running session", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  assert.strictEqual(await mod.getRunningSession(), null);
});

test("startSession() creates a running session when none is active", async (t) => {
  const created = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    // 1ª chamada: getRunningSession() -> nenhuma sessão ativa
    // 2ª chamada: createActivitySession() -> insere e retorna a criada
    activity_sessions: [{ data: null, error: null }, { data: created, error: null }],
  });

  const result = await mod.startSession({ source: "manual" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].status, "running");
  assert.strictEqual(insertCall.args[0].source, "manual");
  assert.ok(insertCall.args[0].started_at);
});

test("startSession() refuses to start a second session while one is already running", async (t) => {
  const running = { id: "sess-running", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: running, error: null },
  });

  await assert.rejects(
    () => mod.startSession({}),
    (err) => err.code === "SESSION_ALREADY_RUNNING" && err.message.includes("Já existe")
  );
});

test("finishSession() sets ended_at, status and computes duration_minutes", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: updated, error: null }],
  });

  const result = await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  assert.deepStrictEqual(result, updated);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "finished");
  assert.strictEqual(updateCall.args[0].duration_minutes, 30);
  assert.strictEqual(updateCall.args[0].ended_at, "2026-01-01T10:30:00.000Z");
});

test("finishSession() rejects an end time earlier than the start (negative duration)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:30:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-1", new Date("2026-01-01T10:00:00.000Z")),
    (err) => err.code === "INVALID_DURATION"
  );
});

test("finishSession() throws a domain error when the session doesn't exist", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-missing"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

test("finishSession() refuses to re-finish an already finished session", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.finishSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

test("cancelSession() sets status to cancelled without deleting the row", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const cancelled = { ...session, status: "cancelled" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: cancelled, error: null }],
  });

  const result = await mod.cancelSession("sess-1");

  assert.deepStrictEqual(result, cancelled);
  assert.ok(!supabase._calls.some(c => c.method === "delete"));
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "cancelled");
});

test("cancelSession() refuses to cancel an already finished session", async (t) => {
  const session = { id: "sess-1", status: "finished" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.cancelSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

test("pauseSession() moves a running session to paused", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const paused = { ...session, status: "paused" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: paused, error: null }],
  });

  const result = await mod.pauseSession("sess-1");

  assert.deepStrictEqual(result, paused);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.deepStrictEqual(updateCall.args[0], { status: "paused" });
});

test("pauseSession() refuses to pause a session that isn't running", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.pauseSession("sess-1"),
    (err) => err.code === "INVALID_STATE"
  );
});

test("resumeSession() moves a paused session back to running", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const resumed = { ...session, status: "running" };
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null }, // getActivitySessionById
      { data: null, error: null },    // getRunningSession -> nenhuma outra ativa
      { data: resumed, error: null }, // updateActivitySession
    ],
  });

  const result = await mod.resumeSession("sess-1");

  assert.deepStrictEqual(result, resumed);
  const updateCall = supabase._calls.find(c => c.method === "update");
  assert.deepStrictEqual(updateCall.args[0], { status: "running" });
});

test("resumeSession() refuses to resume when another session is already running", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const otherRunning = { id: "sess-2", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: otherRunning, error: null }],
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) => err.code === "SESSION_ALREADY_RUNNING"
  );
});

test("resumeSession() refuses to resume a session that isn't paused", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  await assert.rejects(
    () => mod.resumeSession("sess-1"),
    (err) => err.code === "INVALID_STATE"
  );
});

test("listByEvent() scopes results to user_id + event_id, most recent first", async (t) => {
  const rows = [{ id: "sess-2" }, { id: "sess-1" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.listByEvent("event-1");

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["event_id", "event-1"]]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: false }]);
});

test("listByDateRange() scopes results to user_id and the started_at range", async (t) => {
  const rows = [{ id: "sess-1" }, { id: "sess-2" }];
  const { mod, supabase } = await loadActivitySessionService(t, {
    activity_sessions: { data: rows, error: null },
  });

  const result = await mod.listByDateRange("2026-01-01", "2026-01-31");

  assert.deepStrictEqual(result, rows);
  const gteCall = supabase._calls.find(c => c.method === "gte");
  const lteCall = supabase._calls.find(c => c.method === "lte");
  assert.deepStrictEqual(gteCall.args, ["started_at", "2026-01-01"]);
  assert.deepStrictEqual(lteCall.args, ["started_at", "2026-01-31"]);
  const orderCall = supabase._calls.find(c => c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["started_at", { ascending: true }]);
});
