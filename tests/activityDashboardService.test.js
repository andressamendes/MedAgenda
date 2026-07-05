/**
 * Tests for activityDashboardService.js — Dashboard de Execução (F2.1).
 * computeDashboardIndicators() is pure (no DOM, no I/O) and mirrors the style
 * of tests/activitySessionStats.test.js. getDashboardData() is tested
 * separately, with listByDateRange mocked, to check the single-query
 * strategy (ETAPA 6: uma única busca cobre hoje, semana e mês).
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "./mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../supabase.js", import.meta.url).href;
const SERVICE_SPECIFIER  = new URL("../activitySessionService.js", import.meta.url).href;

// activityDashboardService.js importa activitySessionService.js, que importa
// supabase.js -> config.js (gitignored, ausente em CI/dev containers).
// Mockar supabase.js diretamente (em vez de exigir um config.js real em
// disco) evita esse import inteiramente — mesmo padrão usado em
// activitySessionService.test.js e academicCalendarService.test.js.
function loadDashboardService(t) {
  const supabase = createSupabaseMock({ tableResponses: {} });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: { supabase, currentUserId: async () => "user-123" },
  });
  return import(`../activityDashboardService.js?t=${Math.random()}`);
}

const NOW = new Date("2026-07-08T18:00:00.000Z"); // uma quarta-feira

const finished  = (id, started_at, duration_minutes) => ({ id, status: "finished", started_at, duration_minutes });
const cancelled = (id, started_at, duration_minutes) => ({ id, status: "cancelled", started_at, duration_minutes });

test("with no sessions, every indicator returns its empty value", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const result = computeDashboardIndicators([], NOW);

  assert.strictEqual(result.todayMinutes, 0);
  assert.strictEqual(result.weekMinutes, 0);
  assert.strictEqual(result.monthMinutes, 0);
  assert.strictEqual(result.todaySessionsCount, 0);
  assert.strictEqual(result.weekSessionsCount, 0);
  assert.strictEqual(result.monthSessionsCount, 0);
  assert.strictEqual(result.averageMinutes, 0);
  assert.strictEqual(result.longestSession, null);
});

test("a session started today counts in today, week and month", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [finished("s1", "2026-07-08T12:00:00.000Z", 60)];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.todayMinutes, 60);
  assert.strictEqual(result.weekMinutes, 60);
  assert.strictEqual(result.monthMinutes, 60);
  assert.strictEqual(result.todaySessionsCount, 1);
  assert.strictEqual(result.weekSessionsCount, 1);
  assert.strictEqual(result.monthSessionsCount, 1);
});

test("a session earlier this week (not today) counts in week and month, not today", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  // Segunda-feira da mesma semana de NOW (2026-07-08, quarta).
  const sessions = [finished("s1", "2026-07-06T09:00:00.000Z", 30)];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.todayMinutes, 0);
  assert.strictEqual(result.todaySessionsCount, 0);
  assert.strictEqual(result.weekMinutes, 30);
  assert.strictEqual(result.weekSessionsCount, 1);
  assert.strictEqual(result.monthMinutes, 30);
  assert.strictEqual(result.monthSessionsCount, 1);
});

test("a session earlier this month (before this week) counts only in month", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [finished("s1", "2026-07-01T09:00:00.000Z", 45)];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.todayMinutes, 0);
  assert.strictEqual(result.weekMinutes, 0);
  assert.strictEqual(result.weekSessionsCount, 0);
  assert.strictEqual(result.monthMinutes, 45);
  assert.strictEqual(result.monthSessionsCount, 1);
});

test("a session from last month is excluded from every indicator", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [finished("s1", "2026-06-15T09:00:00.000Z", 120)];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.todayMinutes, 0);
  assert.strictEqual(result.weekMinutes, 0);
  assert.strictEqual(result.monthMinutes, 0);
  assert.strictEqual(result.monthSessionsCount, 0);
});

test("cancelled sessions never enter any indicator", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [
    cancelled("s1", "2026-07-08T09:00:00.000Z", 999),
    finished("s2", "2026-07-08T10:00:00.000Z", 20),
  ];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.todayMinutes, 20);
  assert.strictEqual(result.todaySessionsCount, 1);
  assert.strictEqual(result.monthMinutes, 20);
});

test("average duration is computed over the month's finished sessions and rounds", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [
    finished("s1", "2026-07-01T09:00:00.000Z", 30),
    finished("s2", "2026-07-05T09:00:00.000Z", 45),
    finished("s3", "2026-07-08T09:00:00.000Z", 50),
  ];
  const result = computeDashboardIndicators(sessions, NOW);

  // 125 / 3 = 41.66… → arredonda para 42
  assert.strictEqual(result.averageMinutes, 42);
});

test("longest session picks the finished session with the highest duration in the month", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = [
    finished("s1", "2026-07-01T09:00:00.000Z", 30),
    finished("s2", "2026-07-05T09:00:00.000Z", 90),
    cancelled("s3", "2026-07-08T09:00:00.000Z", 500),
  ];
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.longestSession.id, "s2");
  assert.strictEqual(result.longestSession.duration_minutes, 90);
});

test("a large volume of sessions is aggregated without error", async (t) => {
  const { computeDashboardIndicators } = await loadDashboardService(t);
  const sessions = Array.from({ length: 500 }, (_, i) =>
    finished(`s${i}`, "2026-07-08T10:00:00.000Z", 10)
  );
  const result = computeDashboardIndicators(sessions, NOW);

  assert.strictEqual(result.monthSessionsCount, 500);
  assert.strictEqual(result.monthMinutes, 5000);
  assert.strictEqual(result.averageMinutes, 10);
});

// ── getDashboardData() — busca única ────────────────────────────────────────

test("getDashboardData() fetches sessions exactly once, from the earliest of week/month start through now", async (t) => {
  const calls = [];
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      listByDateRange: async (start, end) => {
        calls.push({ start, end });
        return [finished("s1", "2026-07-08T10:00:00.000Z", 25)];
      },
    },
  });

  const { getDashboardData } = await import(`../activityDashboardService.js?t=${Math.random()}`);
  const result = await getDashboardData(NOW);

  assert.strictEqual(calls.length, 1);
  // Início do mês (dia 1) é anterior ao início da semana (segunda, dia 6),
  // então a busca começa no início do mês.
  assert.strictEqual(calls[0].start, "2026-07-01T00:00:00.000Z");
  assert.strictEqual(calls[0].end, "2026-07-08T23:59:59.999Z");
  assert.strictEqual(result.todayMinutes, 25);
  assert.strictEqual(result.monthMinutes, 25);
});

test("getDashboardData() widens the query to the week start when it falls in the previous month", async (t) => {
  const early = new Date("2026-07-02T12:00:00.000Z"); // quinta-feira, mês começou na quarta (dia 1)
  const calls = [];
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      listByDateRange: async (start, end) => {
        calls.push({ start, end });
        return [];
      },
    },
  });

  const { getDashboardData } = await import(`../activityDashboardService.js?t=${Math.random()}`);
  await getDashboardData(early);

  // Semana começa segunda 2026-06-29 (mês anterior) — mais cedo que o início do mês (07-01).
  assert.strictEqual(calls[0].start, "2026-06-29T00:00:00.000Z");
});
