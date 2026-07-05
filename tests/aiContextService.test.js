/**
 * Tests for aiContextService.js — Motor de Contexto para IA (F3.2).
 *
 * Pure helpers (computeWeekEventsCount, computeCategoryBreakdown,
 * computeOverdueEvents, sanitizePendingReviews) are exercised directly with
 * plain data. getAIContext() has every dependency mocked (no real Supabase),
 * mirroring the style of tests/activityDashboardService.test.js and
 * tests/insightsService.test.js — it verifies consolidation, sanitization,
 * a single round of parallel calls, and graceful degradation when one
 * source fails ("contexto incompleto").
 */
import { test } from "node:test";
import assert from "node:assert";

const EVENT_SPECIFIER      = new URL("../eventService.js", import.meta.url).href;
const DASHBOARD_SPECIFIER  = new URL("../activityDashboardService.js", import.meta.url).href;
const REVIEW_SPECIFIER     = new URL("../reviewService.js", import.meta.url).href;
const SESSION_SPECIFIER    = new URL("../activitySessionService.js", import.meta.url).href;
const CATEGORY_SPECIFIER   = new URL("../categoryService.js", import.meta.url).href;
const FILTER_SPECIFIER     = new URL("../academicCalendarFilter.js", import.meta.url).href;
const ERROR_SPECIFIER      = new URL("../errorService.js", import.meta.url).href;

const NOW = new Date("2026-07-08T18:00:00.000Z"); // uma quarta-feira

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
const EMPTY_DASHBOARD = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

function loadAiContextService(t, overrides = {}) {
  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEventsByRange: overrides.getEventsByRange ?? (async () => []) },
  });
  t.mock.module(DASHBOARD_SPECIFIER, {
    namedExports: { getDashboardData: overrides.getDashboardData ?? (async () => EMPTY_DASHBOARD) },
  });
  t.mock.module(REVIEW_SPECIFIER, {
    namedExports: {
      listPending:   overrides.listPending   ?? (async () => []),
      listCompleted: overrides.listCompleted ?? (async () => []),
    },
  });
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: {
      listByDateRange:            overrides.listByDateRange            ?? (async () => []),
      getEventExecutionSummaries: overrides.getEventExecutionSummaries ?? (async () => ({})),
    },
  });
  t.mock.module(CATEGORY_SPECIFIER, {
    namedExports: { getCategories: overrides.getCategories ?? (async () => []) },
  });
  t.mock.module(FILTER_SPECIFIER, {
    namedExports: { isPersonalVisible: overrides.isPersonalVisible ?? (() => true) },
  });
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: overrides.handleError ?? (() => ({ category: "unknown", friendly: "erro" })) },
  });
  return import(`../aiContextService.js?t=${Math.random()}`);
}

// ── Blocos puros ─────────────────────────────────────────────────────────────

test("computeWeekEventsCount() counts only occurrences within the current Monday–Sunday week", async (t) => {
  const { computeWeekEventsCount } = await loadAiContextService(t);
  const events = [
    { id: "e1", title: "Aula", event_date: "2026-07-06", recurrence_type: "none" }, // segunda desta semana
    { id: "e2", title: "Prova", event_date: "2026-07-12", recurrence_type: "none" }, // domingo desta semana
    { id: "e3", title: "Fora", event_date: "2026-07-13", recurrence_type: "none" },  // semana seguinte
  ];
  assert.strictEqual(computeWeekEventsCount(events, NOW), 2);
});

test("computeCategoryBreakdown() sums minutes per category and tracks the last studied date", async (t) => {
  const { computeCategoryBreakdown } = await loadAiContextService(t);
  const categories = [{ id: "cat-1", name: "Clínica Médica" }, { id: "cat-2", name: "Cirurgia" }];
  const events = [{ id: "ev-1", category: "Clínica Médica" }];
  const sessions = [
    { event_id: "ev-1", status: "finished", duration_minutes: 60, started_at: "2026-07-01T10:00:00.000Z" },
    { category_id: "cat-1", status: "finished", duration_minutes: 30, started_at: "2026-07-05T10:00:00.000Z" },
    { category_id: "cat-2", status: "cancelled", duration_minutes: 999, started_at: "2026-07-06T10:00:00.000Z" },
  ];

  const result = computeCategoryBreakdown(sessions, events, categories, NOW);

  const clinica = result.find(c => c.name === "Clínica Médica");
  const cirurgia = result.find(c => c.name === "Cirurgia");
  assert.strictEqual(clinica.minutes, 90);
  assert.strictEqual(clinica.lastStudiedDate, "2026-07-05T10:00:00.000Z");
  assert.strictEqual(clinica.daysSinceLastStudy, 3);
  assert.strictEqual(cirurgia.minutes, 0); // sessão cancelada nunca conta
  assert.strictEqual(cirurgia.lastStudiedDate, null);
  assert.strictEqual(cirurgia.daysSinceLastStudy, null);
});

test("computeOverdueEvents() only flags non-recurring past events without a finished session", async (t) => {
  const { computeOverdueEvents } = await loadAiContextService(t);
  const events = [
    { id: "e1", title: "Prova antiga", event_date: "2026-07-01", recurrence_type: "none" },
    { id: "e2", title: "Aula recorrente", event_date: "2026-06-01", recurrence_type: "weekly" },
    { id: "e3", title: "Compromisso futuro", event_date: "2026-08-01", recurrence_type: "none" },
    { id: "e4", title: "Já executado", event_date: "2026-07-02", recurrence_type: "none" },
  ];
  const summaries = {
    e1: { hasFinishedSession: false },
    e4: { hasFinishedSession: true },
  };

  const result = computeOverdueEvents(events, summaries, NOW);

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, "Prova antiga");
  assert.strictEqual(result[0].daysOverdue, 7);
});

test("sanitizePendingReviews() strips ids and computes days overdue only for past dates", async (t) => {
  const { sanitizePendingReviews } = await loadAiContextService(t);
  const reviews = [
    { id: "r1", event_id: "e1", scheduled_date: "2026-07-01" }, // atrasada
    { id: "r2", event_id: "e2", scheduled_date: "2026-07-20" }, // futura
  ];

  const result = sanitizePendingReviews(reviews, NOW);

  assert.deepStrictEqual(result, [
    { scheduledDate: "2026-07-01", daysOverdue: 7 },
    { scheduledDate: "2026-07-20", daysOverdue: 0 },
  ]);
  assert.ok(!("id" in result[0]));
  assert.ok(!("event_id" in result[0]));
});

// ── getAIContext() ────────────────────────────────────────────────────────────

test("getAIContext() consolidates every source in a single parallel round", async (t) => {
  let eventsCalls = 0, dashboardCalls = 0, pendingCalls = 0, completedCalls = 0, sessionsCalls = 0, categoriesCalls = 0;

  const { getAIContext } = await loadAiContextService(t, {
    getEventsByRange: async () => { eventsCalls++; return []; },
    getDashboardData: async () => { dashboardCalls++; return EMPTY_DASHBOARD; },
    listPending:      async () => { pendingCalls++; return []; },
    listCompleted:    async () => { completedCalls++; return []; },
    listByDateRange:  async () => { sessionsCalls++; return []; },
    getCategories:    async () => { categoriesCalls++; return []; },
  });

  await getAIContext(NOW);

  assert.strictEqual(eventsCalls, 1);
  assert.strictEqual(dashboardCalls, 1);
  assert.strictEqual(pendingCalls, 1);
  assert.strictEqual(completedCalls, 1);
  assert.strictEqual(sessionsCalls, 1);
  assert.strictEqual(categoriesCalls, 1);
});

test("with no data anywhere (new user), the context resolves to its empty shape", async (t) => {
  const { getAIContext } = await loadAiContextService(t);

  const context = await getAIContext(NOW);

  assert.deepStrictEqual(context.events, []);
  assert.strictEqual(context.hasAnyEvents, false);
  assert.strictEqual(context.weekEventsCount, 0);
  assert.strictEqual(context.execution.todayMinutes, 0);
  assert.strictEqual(context.execution.dailyGoal.state, "no_goal");
  assert.strictEqual(context.reviews.pendingCount, 0);
  assert.strictEqual(context.reviews.completedCount, 0);
  assert.deepStrictEqual(context.categories, []);
  assert.strictEqual(context.hasStudyHistory, false);
  assert.strictEqual(context.daysSinceLastSession, null);
  assert.deepStrictEqual(context.overdueEvents, []);
});

test("an active user's context reflects goals, reviews, categories and overdue events together", async (t) => {
  const events = [
    { id: "e1", title: "Prova antiga", event_date: "2026-07-01", recurrence_type: "none", category: "Cirurgia" },
  ];
  const { getAIContext } = await loadAiContextService(t, {
    getEventsByRange: async () => events,
    getDashboardData: async () => ({
      ...EMPTY_DASHBOARD,
      todayMinutes: 40, weekMinutes: 200, monthMinutes: 600,
      dailyGoal: { configured: true, goalMinutes: 60, actualMinutes: 40, percentage: 67, remainingMinutes: 20, state: "partial" },
    }),
    listPending:     async () => [{ id: "r1", scheduled_date: "2026-07-01" }],
    listCompleted:   async () => [{ id: "r2" }, { id: "r3" }],
    listByDateRange: async () => [
      { event_id: "e1", status: "finished", duration_minutes: 45, started_at: "2026-07-06T09:00:00.000Z" },
    ],
    getCategories: async () => [{ id: "cat-1", name: "Cirurgia" }],
    getEventExecutionSummaries: async () => ({ e1: { hasFinishedSession: false } }),
  });

  const context = await getAIContext(NOW);

  assert.strictEqual(context.execution.dailyGoal.percentage, 67);
  assert.strictEqual(context.reviews.pendingCount, 1);
  assert.strictEqual(context.reviews.completedCount, 2);
  assert.strictEqual(context.hasStudyHistory, true);
  assert.strictEqual(context.categories[0].name, "Cirurgia");
  assert.strictEqual(context.categories[0].minutes, 45);
  assert.strictEqual(context.daysSinceLastSession, 2);
  assert.strictEqual(context.overdueEvents.length, 1);
  assert.strictEqual(context.overdueEvents[0].title, "Prova antiga");
});

test("respects isPersonalVisible() — no personal events fetched when it's off", async (t) => {
  let eventsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    getEventsByRange: async () => { eventsCalls++; return [{ id: "e1" }]; },
    isPersonalVisible: () => false,
  });

  const context = await getAIContext(NOW);

  assert.strictEqual(eventsCalls, 0);
  assert.deepStrictEqual(context.events, []);
});

// ── Estados parciais / erro (ETAPA 7 — "contexto incompleto") ────────────────

test("a failure in one source (reviews) never breaks the rest of the context", async (t) => {
  const handleErrorCalls = [];
  const { getAIContext } = await loadAiContextService(t, {
    listPending: async () => { throw new Error("permission denied"); },
    getDashboardData: async () => ({ ...EMPTY_DASHBOARD, todayMinutes: 30 }),
    handleError: (err, ctx) => { handleErrorCalls.push({ err, ctx }); return { category: "database", friendly: "erro" }; },
  });

  const context = await getAIContext(NOW);

  assert.strictEqual(context.reviews.pendingCount, 0); // cai para o vazio, não propaga o erro
  assert.strictEqual(context.execution.todayMinutes, 30); // os demais blocos seguem intactos
  assert.strictEqual(handleErrorCalls.length, 1);
  assert.match(handleErrorCalls[0].err.message, /permission denied/);
});

test("a failure loading events also degrades gracefully, without throwing", async (t) => {
  const { getAIContext } = await loadAiContextService(t, {
    getEventsByRange: async () => { throw new Error("network down"); },
  });

  const context = await getAIContext(NOW);

  assert.deepStrictEqual(context.events, []);
  assert.strictEqual(context.hasAnyEvents, false);
});

test("never calls getEventExecutionSummaries when there are no overdue candidates", async (t) => {
  let summariesCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    getEventsByRange: async () => [{ id: "e1", title: "Futuro", event_date: "2026-08-01", recurrence_type: "none" }],
    getEventExecutionSummaries: async () => { summariesCalls++; return {}; },
  });

  await getAIContext(NOW);

  assert.strictEqual(summariesCalls, 0);
});
