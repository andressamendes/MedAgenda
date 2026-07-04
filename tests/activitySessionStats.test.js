/**
 * Tests for activitySessionStats.js — pure calculations over a list of
 * sessions (no DOM, no I/O). Mirrors the style of tests/utils.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  calculateTotalDuration,
  calculateAverageDuration,
  calculateLongestSession,
  calculateLastSession,
  calculateSessionCount,
  computeSessionStats,
  formatCompactDuration,
  summarizeExecution,
  describeExecutionIndicator,
} from "../activitySessionStats.js";

const finished = (id, started_at, duration_minutes) => ({ id, status: "finished", started_at, duration_minutes });
const cancelled = (id, started_at) => ({ id, status: "cancelled", started_at, duration_minutes: null });
const paused = (id, started_at) => ({ id, status: "paused", started_at, duration_minutes: null });

test("with no sessions, every calculation returns its empty value", () => {
  assert.strictEqual(calculateTotalDuration([]), 0);
  assert.strictEqual(calculateAverageDuration([]), 0);
  assert.strictEqual(calculateLongestSession([]), null);
  assert.strictEqual(calculateLastSession([]), null);
  assert.strictEqual(calculateSessionCount([]), 0);
});

test("with undefined/null input, every calculation still returns its empty value (never throws)", () => {
  assert.strictEqual(calculateTotalDuration(undefined), 0);
  assert.strictEqual(calculateAverageDuration(null), 0);
  assert.strictEqual(calculateLongestSession(undefined), null);
});

test("with a single finished session, total/average/longest/last all reflect it", () => {
  const sessions = [finished("s1", "2026-08-10T08:00:00.000Z", 45)];

  assert.strictEqual(calculateTotalDuration(sessions), 45);
  assert.strictEqual(calculateAverageDuration(sessions), 45);
  assert.strictEqual(calculateLongestSession(sessions).id, "s1");
  assert.strictEqual(calculateLastSession(sessions).id, "s1");
  assert.strictEqual(calculateSessionCount(sessions), 1);
});

test("with multiple finished sessions, total sums and average rounds correctly", () => {
  const sessions = [
    finished("s1", "2026-08-10T08:00:00.000Z", 30),
    finished("s2", "2026-08-11T08:00:00.000Z", 45),
    finished("s3", "2026-08-12T08:00:00.000Z", 50),
  ];

  assert.strictEqual(calculateTotalDuration(sessions), 125);
  // 125 / 3 = 41.66… → arredonda para 42
  assert.strictEqual(calculateAverageDuration(sessions), 42);
  assert.strictEqual(calculateSessionCount(sessions), 3);
});

test("calculateLongestSession() picks the session with the highest duration_minutes", () => {
  const sessions = [
    finished("s1", "2026-08-10T08:00:00.000Z", 20),
    finished("s2", "2026-08-11T08:00:00.000Z", 112),
    finished("s3", "2026-08-12T08:00:00.000Z", 60),
  ];

  assert.strictEqual(calculateLongestSession(sessions).id, "s2");
  assert.strictEqual(calculateLongestSession(sessions).duration_minutes, 112);
});

test("calculateLastSession() picks the most recent started_at, regardless of input order", () => {
  const sessions = [
    finished("s-oldest", "2026-08-10T08:00:00.000Z", 10),
    finished("s-newest", "2026-08-15T08:00:00.000Z", 10),
    finished("s-middle", "2026-08-12T08:00:00.000Z", 10),
  ];

  assert.strictEqual(calculateLastSession(sessions).id, "s-newest");
});

test("cancelled and paused sessions are excluded from every calculation", () => {
  const sessions = [
    finished("s1", "2026-08-10T08:00:00.000Z", 30),
    cancelled("s2", "2026-08-11T08:00:00.000Z"),
    paused("s3", "2026-08-12T08:00:00.000Z"),
  ];

  assert.strictEqual(calculateTotalDuration(sessions), 30);
  assert.strictEqual(calculateSessionCount(sessions), 1);
  assert.strictEqual(calculateLongestSession(sessions).id, "s1");
  assert.strictEqual(calculateLastSession(sessions).id, "s1");
});

test("with only cancelled/paused sessions (no finished ones), stats behave as if there were none", () => {
  const sessions = [cancelled("s1", "2026-08-10T08:00:00.000Z"), paused("s2", "2026-08-11T08:00:00.000Z")];

  assert.strictEqual(calculateTotalDuration(sessions), 0);
  assert.strictEqual(calculateSessionCount(sessions), 0);
  assert.strictEqual(calculateLongestSession(sessions), null);
  assert.strictEqual(calculateLastSession(sessions), null);
});

test("computeSessionStats() bundles every calculation from a single pass over the same list", () => {
  const sessions = [
    finished("s1", "2026-08-10T08:00:00.000Z", 30),
    finished("s2", "2026-08-15T08:00:00.000Z", 90),
    cancelled("s3", "2026-08-16T08:00:00.000Z"),
  ];

  const stats = computeSessionStats(sessions);

  assert.strictEqual(stats.totalMinutes, 120);
  assert.strictEqual(stats.sessionCount, 2);
  assert.strictEqual(stats.averageMinutes, 60);
  assert.strictEqual(stats.longestSession.id, "s2");
  assert.strictEqual(stats.lastSession.id, "s2");
});

// ── F1.7 — resumo de execução (indicadores na agenda) ───────────────────────

test("formatCompactDuration() formats minutes as compact 'XhYY' / 'Xmin' strings", () => {
  assert.strictEqual(formatCompactDuration(0), "");
  assert.strictEqual(formatCompactDuration(null), "");
  assert.strictEqual(formatCompactDuration(45), "45min");
  assert.strictEqual(formatCompactDuration(60), "1h");
  assert.strictEqual(formatCompactDuration(200), "3h20");
});

test("summarizeExecution() reports hasRunningSession when a session is running", () => {
  const sessions = [{ id: "s1", status: "running", started_at: "2026-08-10T08:00:00.000Z", duration_minutes: null }];
  const summary = summarizeExecution(sessions);

  assert.strictEqual(summary.hasRunningSession, true);
  assert.strictEqual(summary.hasFinishedSession, false);
  assert.strictEqual(summary.totalDuration, 0);
});

test("summarizeExecution() reports hasFinishedSession and totals from finished sessions", () => {
  const sessions = [
    finished("s1", "2026-08-10T08:00:00.000Z", 30),
    finished("s2", "2026-08-15T08:00:00.000Z", 90),
    cancelled("s3", "2026-08-16T08:00:00.000Z"),
  ];
  const summary = summarizeExecution(sessions);

  assert.strictEqual(summary.hasFinishedSession, true);
  assert.strictEqual(summary.hasRunningSession, false);
  assert.strictEqual(summary.totalDuration, 120);
  assert.strictEqual(summary.sessionsCount, 2);
  assert.strictEqual(summary.lastSession.id, "s2");
});

test("summarizeExecution() with no sessions returns an empty, non-throwing summary", () => {
  assert.deepStrictEqual(summarizeExecution([]), {
    totalDuration: 0,
    sessionsCount: 0,
    lastSession: null,
    hasFinishedSession: false,
    hasRunningSession: false,
  });
  assert.deepStrictEqual(summarizeExecution(undefined), {
    totalDuration: 0,
    sessionsCount: 0,
    lastSession: null,
    hasFinishedSession: false,
    hasRunningSession: false,
  });
});

test("describeExecutionIndicator() returns null for an empty/no-session summary", () => {
  assert.strictEqual(describeExecutionIndicator(null), null);
  assert.strictEqual(describeExecutionIndicator(summarizeExecution([])), null);
});

test("describeExecutionIndicator() prioritizes a running session over finished ones", () => {
  const summary = { totalDuration: 60, sessionsCount: 1, lastSession: null, hasFinishedSession: true, hasRunningSession: true };
  const indicator = describeExecutionIndicator(summary);

  assert.deepStrictEqual(indicator, { state: "running", icon: "●", text: "Em andamento" });
});

test("describeExecutionIndicator() shows the compact accumulated time when finished", () => {
  const summary = { totalDuration: 200, sessionsCount: 2, lastSession: null, hasFinishedSession: true, hasRunningSession: false };
  const indicator = describeExecutionIndicator(summary);

  assert.deepStrictEqual(indicator, { state: "executed", icon: "✓", text: "3h20" });
});

test("describeExecutionIndicator() falls back to a session count when there's no duration to show", () => {
  const summary = { totalDuration: 0, sessionsCount: 3, lastSession: null, hasFinishedSession: true, hasRunningSession: false };
  const indicator = describeExecutionIndicator(summary);

  assert.deepStrictEqual(indicator, { state: "executed", icon: "✓", text: "3 sessões" });
});
