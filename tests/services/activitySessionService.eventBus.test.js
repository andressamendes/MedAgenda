/**
 * Tests for the F6.2 integration between activitySessionService.js and
 * sessionEventBus.js: activitySessionService must be the only publisher,
 * publishing exactly one lifecycle event per transition (plus the generic
 * SessionUpdated already covered by updateActivitySession()), and
 * onSessionFinished() must keep working unchanged as a thin adapter over
 * the bus (F1.3 compatibility).
 *
 * sessionEventBus.js is a singleton module (no cache-busting query on its
 * specifier), so every dynamic reload of activitySessionService.js below
 * shares the very same bus instance — clear() in afterEach() prevents
 * subscriptions from one test leaking into the next.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";
import { SESSION_EVENTS, subscribe, clear } from "../../sessionEventBus.js";

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

test.afterEach(() => {
  clear();
});

test("startSession() publishes SessionStarted with the created session as payload", async (t) => {
  const created = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: null, error: null }, { data: created, error: null }],
  });

  const events = [];
  subscribe(SESSION_EVENTS.STARTED, (payload) => events.push(payload));

  const result = await mod.startSession({ source: "manual" });

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].session, result);
  assert.strictEqual(events[0].eventType, SESSION_EVENTS.STARTED);
  assert.ok(events[0].timestamp);
});

test("startSession() never publishes SessionStarted when it refuses to start (already running)", async (t) => {
  const running = { id: "sess-running", status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: running, error: null },
  });

  let calls = 0;
  subscribe(SESSION_EVENTS.STARTED, () => { calls += 1; });

  await assert.rejects(() => mod.startSession({}));
  assert.strictEqual(calls, 0);
});

test("pauseSession() publishes SessionPaused (and the generic SessionUpdated) with the updated session", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const paused = { ...session, status: "paused" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: paused, error: null }],
  });

  const pausedEvents = [];
  const updatedEvents = [];
  subscribe(SESSION_EVENTS.PAUSED, (p) => pausedEvents.push(p));
  subscribe(SESSION_EVENTS.UPDATED, (p) => updatedEvents.push(p));

  const result = await mod.pauseSession("sess-1");

  assert.strictEqual(pausedEvents.length, 1);
  assert.strictEqual(pausedEvents[0].session, result);
  assert.strictEqual(pausedEvents[0].eventType, SESSION_EVENTS.PAUSED);
  assert.strictEqual(updatedEvents.length, 1);
  assert.strictEqual(updatedEvents[0].session, result);
});

test("resumeSession() publishes SessionResumed with the updated session", async (t) => {
  const session = { id: "sess-1", status: "paused" };
  const resumed = { ...session, status: "running" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null },
      { data: null, error: null },
      { data: resumed, error: null },
    ],
  });

  const events = [];
  subscribe(SESSION_EVENTS.RESUMED, (p) => events.push(p));

  const result = await mod.resumeSession("sess-1");

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].session, result);
});

test("finishSession() publishes SessionFinished with the finished session as payload", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: updated, error: null }],
  });

  const events = [];
  subscribe(SESSION_EVENTS.FINISHED, (p) => events.push(p));

  const result = await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].session, result);
  assert.strictEqual(events[0].eventType, SESSION_EVENTS.FINISHED);
});

test("finishSession() never publishes SessionFinished when it throws (invalid duration)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:30:00.000Z" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: session, error: null },
  });

  let calls = 0;
  subscribe(SESSION_EVENTS.FINISHED, () => { calls += 1; });

  await assert.rejects(() => mod.finishSession("sess-1", new Date("2026-01-01T10:00:00.000Z")));
  assert.strictEqual(calls, 0);
});

test("cancelSession() publishes SessionCancelled with the cancelled session as payload", async (t) => {
  const session = { id: "sess-1", status: "running" };
  const cancelled = { ...session, status: "cancelled" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: cancelled, error: null }],
  });

  const events = [];
  subscribe(SESSION_EVENTS.CANCELLED, (p) => events.push(p));

  const result = await mod.cancelSession("sess-1");

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].session, result);
});

test("updateActivitySession() publishes the generic SessionUpdated for any structural change", async (t) => {
  const updated = { id: "sess-1", status: "finished", notes: "revisão de arritmias" };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: updated, error: null },
  });

  const events = [];
  subscribe(SESSION_EVENTS.UPDATED, (p) => events.push(p));

  const result = await mod.updateActivitySession("sess-1", { notes: "revisão de arritmias" });

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].session, result);
});

test("activitySessionService is the only publisher — deleteActivitySession() and reads never publish", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  let calls = 0;
  for (const eventType of Object.values(SESSION_EVENTS)) {
    subscribe(eventType, () => { calls += 1; });
  }

  await mod.deleteActivitySession("sess-1");
  await mod.getActivitySessions();

  assert.strictEqual(calls, 0);
});

// ── Compatibilidade com onSessionFinished() (F1.3) ──────────────────────────

test("onSessionFinished() still fires on finishSession(), receiving the bare session (no envelope)", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 30 };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [{ data: session, error: null }, { data: updated, error: null }],
  });

  let received = null;
  mod.onSessionFinished((s) => { received = s; });

  const result = await mod.finishSession("sess-1", new Date("2026-01-01T10:30:00.000Z"));

  assert.strictEqual(received, result);
  assert.strictEqual(received.eventType, undefined, "onSessionFinished must not leak the bus envelope");
});

test("onSessionFinished() returns an unsubscribe function that stops further notifications", async (t) => {
  const session = { id: "sess-1", status: "running", started_at: "2026-01-01T10:00:00.000Z" };
  const updated = { ...session, status: "finished", duration_minutes: 10 };
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: [
      { data: session, error: null }, { data: updated, error: null },
      { data: { ...session, status: "running" }, error: null }, { data: updated, error: null },
    ],
  });

  let calls = 0;
  const off = mod.onSessionFinished(() => { calls += 1; });

  await mod.finishSession("sess-1", new Date("2026-01-01T10:10:00.000Z"));
  off();
  await mod.finishSession("sess-1", new Date("2026-01-01T10:10:00.000Z")).catch(() => {});

  assert.strictEqual(calls, 1);
});

test("onSessionFinished() is backed by the bus: publishing SessionFinished directly also reaches it", async (t) => {
  const { mod } = await loadActivitySessionService(t, {
    activity_sessions: { data: null, error: null },
  });

  let received = null;
  mod.onSessionFinished((s) => { received = s; });

  const { publish } = await import("../../sessionEventBus.js");
  const session = { id: "sess-99", status: "finished" };
  publish(SESSION_EVENTS.FINISHED, session);

  assert.strictEqual(received, session);
});
