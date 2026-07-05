/**
 * Tests for insightsService.js — Central de Insights: Infraestrutura (F2.4).
 *
 * insightsService.js only consolidates data already computed by four
 * existing services; every dependency is mocked here (no real aggregation
 * math is exercised — that's covered by tests/activityDashboardService.test.js,
 * tests/services/reviewService.test.js, tests/activitySessionStats.test.js).
 * These tests verify: single-round consolidation, block grouping, and that a
 * failure in one source never breaks the others (ETAPA 6 e ETAPA 7).
 */
import { test } from "node:test";
import assert from "node:assert";

const DASHBOARD_SPECIFIER = new URL("../activityDashboardService.js", import.meta.url).href;
const REVIEW_SPECIFIER    = new URL("../reviewService.js", import.meta.url).href;
const EVENT_SPECIFIER     = new URL("../eventService.js", import.meta.url).href;
const SESSION_SPECIFIER   = new URL("../activitySessionService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

const DASHBOARD_DATA = {
  todayMinutes: 30, weekMinutes: 90, monthMinutes: 300,
  todaySessionsCount: 1, weekSessionsCount: 3, monthSessionsCount: 10,
  averageMinutes: 30, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

function loadInsightsService(t, overrides = {}) {
  t.mock.module(DASHBOARD_SPECIFIER, {
    namedExports: { getDashboardData: overrides.getDashboardData ?? (async () => DASHBOARD_DATA) },
  });
  t.mock.module(REVIEW_SPECIFIER, {
    namedExports: {
      listPending:   overrides.listPending   ?? (async () => []),
      listCompleted: overrides.listCompleted ?? (async () => []),
    },
  });
  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEvents: overrides.getEvents ?? (async () => []) },
  });
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: { getEventExecutionSummaries: overrides.getEventExecutionSummaries ?? (async () => ({})) },
  });
  return import(`../insightsService.js?t=${Math.random()}`);
}

test("consolidates all four blocks from a single round of calls, without duplicating calculations", async (t) => {
  let dashboardCalls = 0, pendingCalls = 0, completedCalls = 0, eventsCalls = 0, summariesCalls = 0;

  const { getInsightsData } = await loadInsightsService(t, {
    getDashboardData: async () => { dashboardCalls++; return DASHBOARD_DATA; },
    listPending:      async () => { pendingCalls++; return [{ id: "r1" }, { id: "r2" }]; },
    listCompleted:    async () => { completedCalls++; return [{ id: "r3" }]; },
    getEvents:        async () => { eventsCalls++; return [{ id: "e1" }, { id: "e2" }]; },
    getEventExecutionSummaries: async () => { summariesCalls++; return { e1: { hasFinishedSession: true }, e2: { hasFinishedSession: false } }; },
  });

  const result = await getInsightsData();

  assert.strictEqual(dashboardCalls, 1);
  assert.strictEqual(pendingCalls, 1);
  assert.strictEqual(completedCalls, 1);
  assert.strictEqual(eventsCalls, 1);
  assert.strictEqual(summariesCalls, 1);

  assert.strictEqual(result.execucao.status, "ok");
  assert.strictEqual(result.execucao.data.todayMinutes, 30);
  assert.strictEqual(result.execucao.data.monthSessionsCount, 10);

  assert.strictEqual(result.metas.status, "ok");
  assert.strictEqual(result.metas.data.dailyGoal.state, "no_goal");

  assert.strictEqual(result.revisoes.status, "ok");
  assert.strictEqual(result.revisoes.data.pendingCount, 2);
  assert.strictEqual(result.revisoes.data.completedCount, 1);

  assert.strictEqual(result.produtividade.status, "ok");
  assert.strictEqual(result.produtividade.data.totalEvents, 2);
  assert.strictEqual(result.produtividade.data.executedCount, 1);
  assert.strictEqual(result.produtividade.data.neverExecutedCount, 1);
});

test("with no data anywhere, every block resolves to its empty value", async (t) => {
  const { getInsightsData } = await loadInsightsService(t);
  const result = await getInsightsData();

  assert.strictEqual(result.execucao.status, "ok");
  assert.strictEqual(result.execucao.data.todayMinutes, 30); // vem do mock padrão
  assert.strictEqual(result.revisoes.data.pendingCount, 0);
  assert.strictEqual(result.revisoes.data.completedCount, 0);
  assert.strictEqual(result.produtividade.data.totalEvents, 0);
  assert.strictEqual(result.produtividade.data.executedCount, 0);
  assert.strictEqual(result.produtividade.data.neverExecutedCount, 0);
});

test("a dashboard failure marks execucao and metas as error, without affecting revisoes/produtividade", async (t) => {
  const { getInsightsData } = await loadInsightsService(t, {
    getDashboardData: async () => { throw new Error("network down"); },
    listPending:      async () => [{ id: "r1" }],
  });

  const result = await getInsightsData();

  assert.strictEqual(result.execucao.status, "error");
  assert.strictEqual(result.execucao.data, null);
  assert.match(result.execucao.error.message, /network down/);

  assert.strictEqual(result.metas.status, "error");

  assert.strictEqual(result.revisoes.status, "ok");
  assert.strictEqual(result.revisoes.data.pendingCount, 1);
});

test("a failure in only one review query yields a 'partial' state, keeping the other indicator", async (t) => {
  const { getInsightsData } = await loadInsightsService(t, {
    listPending:   async () => [{ id: "r1" }, { id: "r2" }],
    listCompleted: async () => { throw new Error("permission denied"); },
  });

  const result = await getInsightsData();

  assert.strictEqual(result.revisoes.status, "partial");
  assert.strictEqual(result.revisoes.data.pendingCount, 2);
  assert.strictEqual(result.revisoes.data.completedCount, null);
  assert.match(result.revisoes.error.message, /permission denied/);
});

test("a failure in both review queries yields a full 'error' state for the block", async (t) => {
  const { getInsightsData } = await loadInsightsService(t, {
    listPending:   async () => { throw new Error("network down"); },
    listCompleted: async () => { throw new Error("network down too"); },
  });

  const result = await getInsightsData();

  assert.strictEqual(result.revisoes.status, "error");
  assert.strictEqual(result.revisoes.data, null);
});

test("a failure fetching events marks produtividade as error, without affecting the other blocks", async (t) => {
  const { getInsightsData } = await loadInsightsService(t, {
    getEvents: async () => { throw new Error("permission denied"); },
  });

  const result = await getInsightsData();

  assert.strictEqual(result.produtividade.status, "error");
  assert.strictEqual(result.execucao.status, "ok");
  assert.strictEqual(result.revisoes.status, "ok");
});
