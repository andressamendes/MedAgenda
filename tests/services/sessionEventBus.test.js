/**
 * Tests for sessionEventBus.js — the F6.2 domain event bus for Sessão de
 * Estudo. Pure pub/sub, no I/O: no Supabase mock needed here.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  SESSION_EVENTS,
  subscribe,
  unsubscribe,
  publish,
  clear,
} from "../../sessionEventBus.js";

test.afterEach(() => {
  clear();
});

test("SESSION_EVENTS exposes exactly the six official events, nothing else", () => {
  assert.deepStrictEqual(SESSION_EVENTS, {
    STARTED:   "SessionStarted",
    PAUSED:    "SessionPaused",
    RESUMED:   "SessionResumed",
    FINISHED:  "SessionFinished",
    CANCELLED: "SessionCancelled",
    UPDATED:   "SessionUpdated",
  });
});

test("subscribe() + publish() delivers the payload to the callback", () => {
  const received = [];
  subscribe(SESSION_EVENTS.STARTED, (payload) => received.push(payload));

  const session = { id: "sess-1", status: "running" };
  publish(SESSION_EVENTS.STARTED, session);

  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].session, session);
});

test("publish() payload contains exactly session, timestamp and eventType — nothing derived", () => {
  let payload = null;
  subscribe(SESSION_EVENTS.FINISHED, (p) => { payload = p; });

  const session = { id: "sess-1", status: "finished", duration_minutes: 30 };
  publish(SESSION_EVENTS.FINISHED, session);

  assert.deepStrictEqual(Object.keys(payload).sort(), ["eventType", "session", "timestamp"]);
  assert.strictEqual(payload.session, session);
  assert.strictEqual(payload.eventType, SESSION_EVENTS.FINISHED);
  assert.ok(!Number.isNaN(new Date(payload.timestamp).getTime()), "timestamp must be a valid ISO date");
});

test("publish() with no subscribers is a silent no-op", () => {
  assert.doesNotThrow(() => publish(SESSION_EVENTS.CANCELLED, { id: "sess-1" }));
});

test("multiple subscribers to the same event all receive the payload, in subscription order", () => {
  const order = [];
  subscribe(SESSION_EVENTS.PAUSED, () => order.push("first"));
  subscribe(SESSION_EVENTS.PAUSED, () => order.push("second"));
  subscribe(SESSION_EVENTS.PAUSED, () => order.push("third"));

  publish(SESSION_EVENTS.PAUSED, { id: "sess-1" });

  assert.deepStrictEqual(order, ["first", "second", "third"]);
});

test("a subscriber to one event never receives another event's publication", () => {
  let startedCalls = 0, pausedCalls = 0;
  subscribe(SESSION_EVENTS.STARTED, () => { startedCalls += 1; });
  subscribe(SESSION_EVENTS.PAUSED, () => { pausedCalls += 1; });

  publish(SESSION_EVENTS.STARTED, { id: "sess-1" });

  assert.strictEqual(startedCalls, 1);
  assert.strictEqual(pausedCalls, 0);
});

test("unsubscribe() via the return value of subscribe() stops further delivery", () => {
  let calls = 0;
  const off = subscribe(SESSION_EVENTS.RESUMED, () => { calls += 1; });

  publish(SESSION_EVENTS.RESUMED, { id: "sess-1" });
  off();
  publish(SESSION_EVENTS.RESUMED, { id: "sess-1" });

  assert.strictEqual(calls, 1);
});

test("unsubscribe() called directly with (eventType, callback) also stops delivery", () => {
  let calls = 0;
  const callback = () => { calls += 1; };
  subscribe(SESSION_EVENTS.UPDATED, callback);

  publish(SESSION_EVENTS.UPDATED, { id: "sess-1" });
  unsubscribe(SESSION_EVENTS.UPDATED, callback);
  publish(SESSION_EVENTS.UPDATED, { id: "sess-1" });

  assert.strictEqual(calls, 1);
});

test("unsubscribe() is idempotent — calling it twice (or on a never-subscribed callback) does not throw", () => {
  const callback = () => {};
  const off = subscribe(SESSION_EVENTS.CANCELLED, callback);

  assert.doesNotThrow(() => { off(); off(); });
  assert.doesNotThrow(() => unsubscribe(SESSION_EVENTS.STARTED, () => {}));
});

test("a listener that throws does not prevent the remaining listeners from running", () => {
  const calls = [];
  subscribe(SESSION_EVENTS.FINISHED, () => { throw new Error("boom"); });
  subscribe(SESSION_EVENTS.FINISHED, () => calls.push("survivor"));

  assert.doesNotThrow(() => publish(SESSION_EVENTS.FINISHED, { id: "sess-1" }));
  assert.deepStrictEqual(calls, ["survivor"]);
});

test("clear() removes every subscription across every event", () => {
  let calls = 0;
  subscribe(SESSION_EVENTS.STARTED, () => { calls += 1; });
  subscribe(SESSION_EVENTS.FINISHED, () => { calls += 1; });

  clear();
  publish(SESSION_EVENTS.STARTED, { id: "sess-1" });
  publish(SESSION_EVENTS.FINISHED, { id: "sess-1" });

  assert.strictEqual(calls, 0);
});

// ── Cada um dos seis eventos oficiais, individualmente ──────────────────────

for (const [name, eventType] of Object.entries(SESSION_EVENTS)) {
  test(`${eventType} (SESSION_EVENTS.${name}) can be subscribed to and published independently`, () => {
    let payload = null;
    subscribe(eventType, (p) => { payload = p; });

    const session = { id: "sess-1", status: "whatever" };
    publish(eventType, session);

    assert.strictEqual(payload.eventType, eventType);
    assert.strictEqual(payload.session, session);
  });
}
