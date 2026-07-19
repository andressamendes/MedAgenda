/**
 * Tests for progressNarrativeService.js — Progresso narrativo (F14.5).
 * activitySessionService/eventService/studyStreakService são mockados como
 * módulos inteiros (mesmo padrão de studyStreakService.test.js /
 * subjectProgressService.test.js): o objetivo é validar apenas a agregação
 * (semana atual × anterior, matéria dominante), nunca acesso a rede/Supabase.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER   = new URL("../../eventService.js", import.meta.url).href;
const STREAK_SERVICE_SPECIFIER  = new URL("../../studyStreakService.js", import.meta.url).href;

function loadService(t, { sessions = [], events = [], streak = { currentStreak: 0 } } = {}) {
  const calls = [];

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      listByDateRange: async (start, end) => {
        calls.push({ fn: "listByDateRange", start, end });
        return sessions;
      },
    },
  });
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { getEvents: async () => events },
  });
  t.mock.module(STREAK_SERVICE_SPECIFIER, {
    namedExports: { getStreakSummary: async () => streak },
  });

  return import(`../../progressNarrativeService.js?t=${Math.random()}`).then((mod) => ({ mod, calls }));
}

// Quarta-feira: segunda desta semana é 2026-07-06; segunda da semana
// anterior é 2026-06-29.
const NOW = new Date("2026-07-08T18:00:00.000Z");

const finished = (id, started_at, duration_minutes, event_id = null) =>
  ({ id, status: "finished", started_at, duration_minutes, event_id });

test("with no sessions in either week, returns zeroed indicators and null dominant category", async (t) => {
  const { mod } = await loadService(t, { sessions: [], streak: { currentStreak: 0 } });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.weekMinutes, 0);
  assert.strictEqual(result.previousWeekMinutes, 0);
  assert.strictEqual(result.dominantCategory, null);
  assert.strictEqual(result.currentStreak, 0);
});

test("sums finished sessions started this week (from Monday) into weekMinutes, excluding the previous week", async (t) => {
  const sessions = [
    finished("s1", "2026-07-06T09:00:00.000Z", 30), // segunda desta semana
    finished("s2", "2026-07-08T09:00:00.000Z", 60), // hoje (quarta)
    finished("s3", "2026-06-29T09:00:00.000Z", 45), // segunda da semana anterior
  ];
  const { mod } = await loadService(t, { sessions });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.weekMinutes, 90);
  assert.strictEqual(result.previousWeekMinutes, 45);
});

test("ignores cancelled sessions in both weeks", async (t) => {
  const sessions = [
    { id: "s1", status: "cancelled", started_at: "2026-07-08T09:00:00.000Z", duration_minutes: 100, event_id: null },
  ];
  const { mod } = await loadService(t, { sessions });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.weekMinutes, 0);
});

test("dominant category is the event category with the most minutes this week", async (t) => {
  const sessions = [
    finished("s1", "2026-07-06T09:00:00.000Z", 40, "ev-cardio"),
    finished("s2", "2026-07-07T09:00:00.000Z", 20, "ev-cardio"),
    finished("s3", "2026-07-08T09:00:00.000Z", 30, "ev-neuro"),
  ];
  const events = [
    { id: "ev-cardio", category: "Cardiologia" },
    { id: "ev-neuro", category: "Neurologia" },
  ];
  const { mod } = await loadService(t, { sessions, events });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.deepStrictEqual(result.dominantCategory, { name: "Cardiologia", minutes: 60 });
});

test("sessions without event_id (avulsas) never contribute to the dominant category", async (t) => {
  const sessions = [finished("s1", "2026-07-08T09:00:00.000Z", 90, null)];
  const { mod } = await loadService(t, { sessions, events: [] });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.weekMinutes, 90);
  assert.strictEqual(result.dominantCategory, null);
});

test("an event with a blank/missing category is treated as having no category", async (t) => {
  const sessions = [finished("s1", "2026-07-08T09:00:00.000Z", 30, "ev-1")];
  const events = [{ id: "ev-1", category: "  " }];
  const { mod } = await loadService(t, { sessions, events });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.dominantCategory, null);
});

test("currentStreak passes through unchanged from studyStreakService.getStreakSummary()", async (t) => {
  const { mod } = await loadService(t, { streak: { currentStreak: 5 } });

  const result = await mod.getProgressNarrativeData(NOW);

  assert.strictEqual(result.currentStreak, 5);
});

test("fetches sessions in a single query spanning both weeks (previous week's Monday through now)", async (t) => {
  const { mod, calls } = await loadService(t);

  await mod.getProgressNarrativeData(NOW);

  const rangeCalls = calls.filter(c => c.fn === "listByDateRange");
  assert.strictEqual(rangeCalls.length, 1, "must fetch both weeks in a single call, never two");
  assert.strictEqual(rangeCalls[0].start, "2026-06-29T00:00:00.000Z");
  assert.strictEqual(rangeCalls[0].end, NOW.toISOString().slice(0, 11) + "23:59:59.999Z");
});
