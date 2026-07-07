/**
 * Tests for aiContextService.js — Motor de Contexto para IA (F3.2; F6.6
 * adiciona a integração com o barramento de eventos da sessão).
 *
 * Pure helpers (computeWeekEventsCount, computeCategoryBreakdown,
 * computeOverdueEvents, sanitizePendingReviews) are exercised directly with
 * plain data. getAIContext() has every dependency mocked (no real Supabase),
 * mirroring the style of tests/activityDashboardService.test.js and
 * tests/insightsService.test.js — it verifies consolidation, sanitization,
 * a single round of parallel calls, and graceful degradation when one
 * source fails ("contexto incompleto").
 *
 * F6.6: sessionEventBus.js NÃO é mockado nos testes de cache/invalidação —
 * mesmo padrão de tests/views/activityDashboardView.test.js — para exercitar
 * o pub/sub real (subscribe/publish) ponta a ponta. `afterEach(clearEventBus)`
 * evita que assinaturas de um teste vazem para o próximo (o barramento é um
 * singleton em memória, compartilhado entre todos os `import()` desta
 * suíte). Os testes de "wiring" (quais eventos são assinados, se
 * resetAIContextService() de fato chama cada unsubscribe) mockam
 * sessionEventBus.js diretamente para observar as chamadas a subscribe().
 */
import { test, afterEach } from "node:test";
import assert from "node:assert";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../sessionEventBus.js";

const EVENT_SPECIFIER       = new URL("../eventService.js", import.meta.url).href;
const DASHBOARD_SPECIFIER   = new URL("../activityDashboardService.js", import.meta.url).href;
const REVIEW_SPECIFIER      = new URL("../reviewService.js", import.meta.url).href;
const SESSION_SPECIFIER     = new URL("../activitySessionService.js", import.meta.url).href;
const CATEGORY_SPECIFIER    = new URL("../categoryService.js", import.meta.url).href;
const FILTER_SPECIFIER      = new URL("../academicCalendarFilter.js", import.meta.url).href;
const PROFILE_SPECIFIER     = new URL("../profileService.js", import.meta.url).href;
const ERROR_SPECIFIER       = new URL("../errorService.js", import.meta.url).href;
const SESSION_BUS_SPECIFIER = new URL("../sessionEventBus.js", import.meta.url).href;

afterEach(() => clearEventBus());

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
    namedExports: {
      getEventsByRange: overrides.getEventsByRange ?? (async () => []),
      // getEvents() nunca é chamado por aiContextService.js — é um import de
      // nível de módulo do User Memory Engine (F3.6, userMemoryService.js),
      // carregado porque aiContextService.js importa suas funções puras
      // (buildUserMemory/emptyUserMemoryPreferences). Precisa existir no mock
      // para o módulo carregar, mesmo sem ser invocado neste teste.
      getEvents: overrides.getEvents ?? (async () => []),
    },
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
  // profileService.js: mesmo motivo do getEvents acima — import de nível de
  // módulo do User Memory Engine, nunca chamado diretamente por aiContextService.js.
  t.mock.module(PROFILE_SPECIFIER, {
    namedExports: { getProfile: overrides.getProfile ?? (async () => null) },
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

  // Memória do Usuário (F3.6) — usuário novo nunca produz preferência inventada.
  assert.strictEqual(context.memory.status, "insufficient_data");
  assert.strictEqual(context.memory.preferences.horarioPreferido, null);
});

// ── Memória do Usuário (F3.6, ETAPA 4) ───────────────────────────────────────
// getAIContext() é o único consumidor do User Memory Engine — reaproveita
// exatamente os dados que já buscou (sessions/events/categories/
// categoryBreakdown/completedReviews), nunca uma nova consulta.

test("getAIContext() derives memory preferences from the exact sessions/events/categories it already fetched — zero extra queries", async (t) => {
  let sessionCalls = 0, eventCalls = 0, categoryCalls = 0;
  const sessions = Array.from({ length: 5 }, (_, i) => ({
    status: "finished", duration_minutes: 45, started_at: `2026-07-0${i + 1}T20:00:00.000Z`,
  }));

  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionCalls++; return sessions; },
    getEventsByRange: async () => { eventCalls++; return []; },
    getCategories:    async () => { categoryCalls++; return []; },
  });

  const context = await getAIContext(NOW);

  assert.strictEqual(sessionCalls, 1);
  assert.strictEqual(eventCalls, 1);
  assert.strictEqual(categoryCalls, 1);
  assert.strictEqual(context.memory.status, "ok");
  assert.strictEqual(context.memory.preferences.horarioPreferido.valor, "noite");
});

test("getAIContext() reuses the already-loaded dailyGoal for the memory's goal-achievement pattern (no profile re-fetch)", async (t) => {
  const sessions = [{ status: "finished", duration_minutes: 60, started_at: "2026-07-06T20:00:00.000Z" }];
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => sessions,
    getDashboardData: async () => ({
      ...EMPTY_DASHBOARD,
      dailyGoal: { configured: true, goalMinutes: 30, actualMinutes: 60, percentage: 200, remainingMinutes: 0, state: "exceeded" },
    }),
  });

  const context = await getAIContext(NOW);

  assert.ok(context.memory.preferences.metasAtingidas);
  assert.match(context.memory.preferences.metasAtingidas.motivo, /meta diária/);
});

test("when both sessions and reviews are unavailable, memory falls back to 'insufficient_data' instead of breaking the context", async (t) => {
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { throw new Error("network down"); },
    listCompleted:   async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => getAIContext(NOW));
  const context = await getAIContext(NOW);
  assert.strictEqual(context.memory.status, "insufficient_data");
  // O restante do contexto continua disponível mesmo com a memória vazia.
  assert.strictEqual(context.hasAnyEvents, false);
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

// ── Barramento de Eventos (F6.6) — wiring (sessionEventBus mockado) ──────────
// Estes testes observam diretamente as chamadas a subscribe()/unsubscribe(),
// sem depender do comportamento real do barramento.

test("getAIContext() subscribes only to SessionFinished, SessionCancelled and SessionUpdated — never Started/Paused/Resumed", async (t) => {
  const subscribedEvents = [];
  t.mock.module(SESSION_BUS_SPECIFIER, {
    namedExports: {
      SESSION_EVENTS,
      subscribe: (eventType) => { subscribedEvents.push(eventType); return () => {}; },
    },
  });
  const { getAIContext } = await loadAiContextService(t);

  await getAIContext(NOW);

  assert.deepStrictEqual([...subscribedEvents].sort(), [
    SESSION_EVENTS.CANCELLED, SESSION_EVENTS.FINISHED, SESSION_EVENTS.UPDATED,
  ].sort());
});

test("getAIContext() subscribes exactly once even across multiple calls (idempotent)", async (t) => {
  let subscribeCalls = 0;
  t.mock.module(SESSION_BUS_SPECIFIER, {
    namedExports: { SESSION_EVENTS, subscribe: () => { subscribeCalls++; return () => {}; } },
  });
  const { getAIContext } = await loadAiContextService(t);

  await getAIContext(NOW);
  await getAIContext(NOW);
  await getAIContext(NOW);

  assert.strictEqual(subscribeCalls, 3); // FINISHED + CANCELLED + UPDATED, uma única vez
});

test("resetAIContextService() calls the unsubscribe function returned for every subscription", async (t) => {
  const unsubscribedEvents = [];
  t.mock.module(SESSION_BUS_SPECIFIER, {
    namedExports: {
      SESSION_EVENTS,
      subscribe: (eventType) => () => unsubscribedEvents.push(eventType),
    },
  });
  const { getAIContext, resetAIContextService } = await loadAiContextService(t);
  await getAIContext(NOW);

  resetAIContextService();

  assert.deepStrictEqual([...unsubscribedEvents].sort(), [
    SESSION_EVENTS.CANCELLED, SESSION_EVENTS.FINISHED, SESSION_EVENTS.UPDATED,
  ].sort());
});

test("after resetAIContextService(), the next getAIContext() call re-subscribes to the bus", async (t) => {
  let subscribeCalls = 0;
  t.mock.module(SESSION_BUS_SPECIFIER, {
    namedExports: { SESSION_EVENTS, subscribe: () => { subscribeCalls++; return () => {}; } },
  });
  const { getAIContext, resetAIContextService } = await loadAiContextService(t);

  await getAIContext(NOW);
  assert.strictEqual(subscribeCalls, 3);

  resetAIContextService();
  await getAIContext(NOW);

  assert.strictEqual(subscribeCalls, 6); // reassinado do zero — nenhum listener sobrevive ao reset
});

// ── Barramento de Eventos (F6.6) — cache/invalidação (barramento real) ───────

test("getAIContext() reuses the cached snapshot when called again with no session event in between", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  await getAIContext(NOW);
  await getAIContext(NOW);

  assert.strictEqual(sessionsCalls, 1);
});

for (const eventName of ["FINISHED", "CANCELLED", "UPDATED"]) {
  test(`Session${eventName[0]}${eventName.slice(1).toLowerCase()} invalidates the cache and forces a rebuild on the next call`, async (t) => {
    let sessionsCalls = 0;
    const { getAIContext } = await loadAiContextService(t, {
      listByDateRange: async () => { sessionsCalls++; return []; },
    });

    await getAIContext(NOW);
    publish(SESSION_EVENTS[eventName], { id: "s1" });
    await getAIContext(NOW);

    assert.strictEqual(sessionsCalls, 2);
  });
}

test("SessionStarted, SessionPaused and SessionResumed do NOT invalidate the cache", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  publish(SESSION_EVENTS.STARTED, { id: "s1" });
  publish(SESSION_EVENTS.PAUSED, { id: "s1" });
  publish(SESSION_EVENTS.RESUMED, { id: "s1" });
  await getAIContext(NOW);

  assert.strictEqual(sessionsCalls, 1); // nenhum campo do contexto depende de sessão em andamento/pausada
});

test("multiple consecutive relevant events before the next call still trigger a single rebuild (coalescência)", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  publish(SESSION_EVENTS.UPDATED, { id: "s1" });
  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  publish(SESSION_EVENTS.CANCELLED, { id: "s2" });
  await getAIContext(NOW);

  assert.strictEqual(sessionsCalls, 2); // uma rajada de 3 eventos ainda é um único rebuild
});

test("crossing into a new day invalidates the cache even without any session event", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  const nextDay = new Date(NOW.getTime() + 24 * 3600 * 1000);
  await getAIContext(nextDay);

  assert.strictEqual(sessionsCalls, 2);
});

test("staying within the same day across calls keeps reusing the cache", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  const laterSameDay = new Date(NOW.getTime() + 3 * 3600 * 1000);
  await getAIContext(laterSameDay);

  assert.strictEqual(sessionsCalls, 1);
});

// ── Barramento de Eventos (F6.6) — reset (logout / troca de usuário) ────────

test("resetAIContextService() discards the cached snapshot — the next call always rebuilds", async (t) => {
  let sessionsCalls = 0;
  const { getAIContext, resetAIContextService } = await loadAiContextService(t, {
    listByDateRange: async () => { sessionsCalls++; return []; },
  });

  await getAIContext(NOW);
  resetAIContextService();
  await getAIContext(NOW);

  assert.strictEqual(sessionsCalls, 2);
});

test("resetAIContextService() (logout/troca de usuário) prevents the previous user's snapshot from leaking into the next getAIContext() call", async (t) => {
  let categoriesSource = [{ id: "cat-a", name: "Categoria do usuário A" }];
  const { getAIContext, resetAIContextService } = await loadAiContextService(t, {
    getCategories: async () => categoriesSource,
  });

  const first = await getAIContext(NOW);
  assert.strictEqual(first.categories[0].name, "Categoria do usuário A");

  // Troca de usuário: script.js chama resetAIContextService() em onBeforeSignOut.
  resetAIContextService();
  categoriesSource = [{ id: "cat-b", name: "Categoria do usuário B" }];

  const second = await getAIContext(NOW);
  assert.strictEqual(second.categories[0].name, "Categoria do usuário B");
});

// ── Barramento de Eventos (F6.6) — consumidores permanecem desacoplados ─────
// recommendationEngine, planningService, reflectionService, decisionEngine e
// userMemoryService nunca importam sessionEventBus nem sabem que
// aiContextService agora reage a eventos — continuam recebendo exatamente o
// mesmo formato de objeto de getAIContext(), com ou sem cache por trás.

test("getAIContext() keeps returning the exact same contract after a cache rebuild triggered by an event", async (t) => {
  const { getAIContext } = await loadAiContextService(t, {
    getDashboardData: async () => ({ ...EMPTY_DASHBOARD, todayMinutes: 40 }),
  });

  const before = await getAIContext(NOW);
  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  const after = await getAIContext(NOW);

  assert.deepStrictEqual(Object.keys(before).sort(), Object.keys(after).sort());
  assert.strictEqual(after.execution.todayMinutes, 40);
});
