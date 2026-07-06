/**
 * Tests for reflectionService.js — Coach Inteligente: Reflection Engine (F3.4).
 *
 * Pure indicator/insight builders are exercised directly with plain data
 * (same fixture style as tests/planningService.test.js). getReflectionData()
 * has every dependency mocked (no real Supabase), mirroring
 * tests/aiContextService.test.js — it verifies a single round of parallel
 * calls, graceful degradation ("partial"/"insufficient_data"), and that the
 * algorithm is deterministic.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SPECIFIER  = new URL("../activitySessionService.js", import.meta.url).href;
const REVIEW_SPECIFIER   = new URL("../reviewService.js", import.meta.url).href;
const CATEGORY_SPECIFIER = new URL("../categoryService.js", import.meta.url).href;
const EVENT_SPECIFIER    = new URL("../eventService.js", import.meta.url).href;
const PROFILE_SPECIFIER  = new URL("../profileService.js", import.meta.url).href;
const AICONTEXT_SPECIFIER = new URL("../aiContextService.js", import.meta.url).href;
const ERROR_SPECIFIER    = new URL("../errorService.js", import.meta.url).href;

const NOW = new Date("2026-07-06T18:00:00.000Z"); // uma segunda-feira

function loadReflectionService(t, overrides = {}) {
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: { listByDateRange: overrides.listByDateRange ?? (async () => []) },
  });
  t.mock.module(REVIEW_SPECIFIER, {
    namedExports: {
      listPending:   overrides.listPending   ?? (async () => []),
      listCompleted: overrides.listCompleted ?? (async () => []),
      listSkipped:   overrides.listSkipped   ?? (async () => []),
    },
  });
  t.mock.module(CATEGORY_SPECIFIER, {
    namedExports: { getCategories: overrides.getCategories ?? (async () => []) },
  });
  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEvents: overrides.getEvents ?? (async () => []) },
  });
  t.mock.module(PROFILE_SPECIFIER, {
    namedExports: { getProfile: overrides.getProfile ?? (async () => null) },
  });
  // aiContextService.js is mocked wholesale (its own heavy dependency graph —
  // eventService/activityDashboardService/academicCalendarFilter/etc. — never
  // loads): only computeCategoryBreakdown() is reused by reflectionService.js,
  // already covered in isolation by tests/aiContextService.test.js.
  t.mock.module(AICONTEXT_SPECIFIER, {
    namedExports: { computeCategoryBreakdown: overrides.computeCategoryBreakdown ?? (() => []) },
  });
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: overrides.handleError ?? (() => ({ category: "unknown", friendly: "erro" })) },
  });
  return import(`../reflectionService.js?t=${Math.random()}`);
}

function session({ daysAgo, minutes, status = "finished" }) {
  const started = new Date(NOW);
  started.setDate(started.getDate() - daysAgo);
  return { status, duration_minutes: minutes, started_at: started.toISOString() };
}

// ── Blocos puros ─────────────────────────────────────────────────────────────

test("computeSessionIndicators() counts started/completed/cancelled and the completion rate", async (t) => {
  const { computeSessionIndicators } = await loadReflectionService(t);
  const sessions = [
    { status: "finished" }, { status: "finished" }, { status: "cancelled" }, { status: "running" },
  ];
  const result = computeSessionIndicators(sessions);
  assert.deepStrictEqual(result, { started: 4, completed: 2, cancelled: 1, completionRate: 50 });
});

test("computeSessionIndicators() returns a null completion rate when nothing was started", async (t) => {
  const { computeSessionIndicators } = await loadReflectionService(t);
  assert.strictEqual(computeSessionIndicators([]).completionRate, null);
});

test("computeStudyTimeIndicators() sums studied minutes (reusing calculateTotalDuration) against the configured goal", async (t) => {
  const { computeStudyTimeIndicators } = await loadReflectionService(t);
  const sessions = [{ status: "finished", duration_minutes: 60 }, { status: "finished", duration_minutes: 30 }, { status: "cancelled", duration_minutes: 999 }];
  const result = computeStudyTimeIndicators(sessions, 120);
  assert.strictEqual(result.studiedMinutes, 90);
  assert.strictEqual(result.plannedMinutes, 120);
  assert.strictEqual(result.completionPct, 75);
});

test("computeStudyTimeIndicators() never invents a completion percentage without a configured goal", async (t) => {
  const { computeStudyTimeIndicators } = await loadReflectionService(t);
  const result = computeStudyTimeIndicators([{ status: "finished", duration_minutes: 60 }], null);
  assert.strictEqual(result.completionPct, null);
});

test("computeGoalDaysIndicators() counts how many of the last N days met the daily goal", async (t) => {
  const { computeGoalDaysIndicators } = await loadReflectionService(t);
  const sessions = [
    session({ daysAgo: 0, minutes: 60 }),  // hoje: bateu (>=60)
    session({ daysAgo: 1, minutes: 30 }),  // ontem: não bateu
    session({ daysAgo: 2, minutes: 90 }),  // bateu
  ];
  const result = computeGoalDaysIndicators(sessions, 60, 7, NOW);
  assert.strictEqual(result.daysMet, 2);
  assert.strictEqual(result.daysTotal, 7);
});

test("computeGoalDaysIndicators() returns null without a configured daily goal — never invents a target", async (t) => {
  const { computeGoalDaysIndicators } = await loadReflectionService(t);
  assert.strictEqual(computeGoalDaysIndicators([{ started_at: NOW.toISOString() }], null, 7, NOW), null);
});

test("computeReviewIndicators() derives the ignored rate from completed vs skipped in the period", async (t) => {
  const { computeReviewIndicators } = await loadReflectionService(t);
  const result = computeReviewIndicators([{ id: "c1" }, { id: "c2" }], [{ id: "s1" }]);
  assert.deepStrictEqual(result, { completedCount: 2, skippedCount: 1, ignoredRate: 33 });
});

test("computeReviewIndicators() returns a null ignored rate with no reviews at all", async (t) => {
  const { computeReviewIndicators } = await loadReflectionService(t);
  assert.strictEqual(computeReviewIndicators([], []).ignoredRate, null);
});

test("computeCategoryIndicators() finds the most-studied and most-neglected categories without recomputing the breakdown", async (t) => {
  const { computeCategoryIndicators } = await loadReflectionService(t);
  const breakdown = [
    { name: "Clínica Médica", minutes: 300, lastStudiedDate: "2026-07-05T00:00:00.000Z", daysSinceLastStudy: 1 },
    { name: "Cirurgia",       minutes: 600, lastStudiedDate: "2026-07-06T00:00:00.000Z", daysSinceLastStudy: 0 },
    { name: "Pediatria",      minutes: 0,   lastStudiedDate: null,                        daysSinceLastStudy: null },
  ];
  const result = computeCategoryIndicators(breakdown);
  assert.strictEqual(result.mostStudied.name, "Cirurgia");
  assert.strictEqual(result.mostNeglected.name, "Pediatria");
});

test("computeCategoryIndicators() returns nulls for an empty catalog", async (t) => {
  const { computeCategoryIndicators } = await loadReflectionService(t);
  const result = computeCategoryIndicators([]);
  assert.strictEqual(result.mostStudied, null);
  assert.strictEqual(result.mostNeglected, null);
});

test("computeTrend() reports direction and delta percentage, with no invented baseline when there's no previous data", async (t) => {
  const { computeTrend } = await loadReflectionService(t);
  assert.deepStrictEqual(computeTrend(120, 100), { direction: "up", deltaPct: 20 });
  assert.deepStrictEqual(computeTrend(60, 100), { direction: "down", deltaPct: -40 });
  assert.deepStrictEqual(computeTrend(100, 100), { direction: "stable", deltaPct: 0 });
  assert.deepStrictEqual(computeTrend(0, 0), { direction: "stable", deltaPct: null });
  assert.deepStrictEqual(computeTrend(50, 0), { direction: "up", deltaPct: null });
});

// ── getReflectionData() — orquestração ──────────────────────────────────────

test("a brand-new user (no sessions, no reviews) yields 'insufficient_data' with no invented insight", async (t) => {
  const { getReflectionData } = await loadReflectionService(t);
  const result = await getReflectionData(NOW);
  assert.strictEqual(result.status, "insufficient_data");
  assert.deepStrictEqual(result.insights, []);
  assert.deepStrictEqual(result.pontosPositivos, []);
  assert.deepStrictEqual(result.pontosAtencao, []);
  assert.match(result.resumo, /histórico suficiente/);
});

test("an active user with real history gets a grounded 'ok' report, fetched in a single parallel round", async (t) => {
  let sessionCalls = 0;
  const sessions = [
    session({ daysAgo: 0, minutes: 90 }),
    session({ daysAgo: 1, minutes: 60 }),
    session({ daysAgo: 8, minutes: 30 }), // fora da janela de 7 dias
  ];

  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => { sessionCalls++; return sessions; },
    getProfile: async () => ({ weekly_goal_minutes: 300, daily_goal_minutes: 60 }),
  });

  const result = await getReflectionData(NOW);

  assert.strictEqual(sessionCalls, 1); // ETAPA 7: uma única busca, tudo em memória
  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.indicators.sessions.started, 2); // só as duas dentro da janela de 7 dias
  assert.strictEqual(result.indicators.studyTime.studiedMinutes, 150);
  assert.ok(result.insights.length > 0);
  result.insights.forEach(i => {
    assert.ok(i.dadosUtilizados);
    assert.ok(i.periodoAnalisado);
    assert.ok(i.motivo);
    assert.ok(i.nivelConfianca);
  });
});

test("high productivity: a much busier week than the previous one triggers a positive trend insight", async (t) => {
  const sessions = [
    session({ daysAgo: 0, minutes: 200 }), // semana atual: alta
    session({ daysAgo: 10, minutes: 20 }), // semana anterior: baixa
  ];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => sessions,
  });
  const result = await getReflectionData(NOW);
  const up = result.insights.find(i => i.id === "productivity_up");
  assert.ok(up, "esperava um insight de produtividade em alta");
  assert.strictEqual(up.tipo, "positivo");
});

test("low productivity: a much quieter week than the previous one triggers an attention trend insight", async (t) => {
  const sessions = [
    session({ daysAgo: 0, minutes: 10 }),   // semana atual: baixa
    session({ daysAgo: 10, minutes: 200 }), // semana anterior: alta
  ];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => sessions,
  });
  const result = await getReflectionData(NOW);
  const drop = result.insights.find(i => i.id === "productivity_drop");
  assert.ok(drop, "esperava um insight de queda de produtividade");
  assert.strictEqual(drop.tipo, "atencao");
});

test("goals met: hitting the daily goal on most of the last 7 days is reported as a positive point", async (t) => {
  const sessions = Array.from({ length: 6 }, (_, i) => session({ daysAgo: i, minutes: 60 }));
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => sessions,
    getProfile: async () => ({ daily_goal_minutes: 60 }),
  });
  const result = await getReflectionData(NOW);
  const goalInsight = result.insights.find(i => i.id === "goal_days_met");
  assert.ok(goalInsight);
  assert.strictEqual(goalInsight.dadosUtilizados.daysMet, 6);
  assert.strictEqual(goalInsight.tipo, "positivo");
  assert.ok(result.pontosPositivos.some(i => i.id === "goal_days_met"));
});

test("goals missed: missing the daily goal on most days is reported as an attention point", async (t) => {
  const sessions = [session({ daysAgo: 0, minutes: 10 })];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => sessions,
    getProfile: async () => ({ daily_goal_minutes: 120 }),
  });
  const result = await getReflectionData(NOW);
  const goalInsight = result.insights.find(i => i.id === "goal_days_met");
  assert.ok(goalInsight);
  assert.strictEqual(goalInsight.dadosUtilizados.daysMet, 0);
  assert.strictEqual(goalInsight.tipo, "atencao");
  assert.ok(result.pontosAtencao.some(i => i.id === "goal_days_met"));
});

test("ignored reviews: skipped reviews in the period are counted without inventing a rate when there are none", async (t) => {
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => [session({ daysAgo: 0, minutes: 30 })],
    listCompleted:   async () => [{ completed_at: NOW.toISOString() }],
    listSkipped:     async () => [
      { updated_at: NOW.toISOString() },
      { updated_at: NOW.toISOString() },
    ],
  });
  const result = await getReflectionData(NOW);
  assert.strictEqual(result.indicators.reviews.completedCount, 1);
  assert.strictEqual(result.indicators.reviews.skippedCount, 2);
  assert.strictEqual(result.indicators.reviews.ignoredRate, 67);
});

test("category insights: the most-studied and most-neglected categories surface as positive/attention points", async (t) => {
  const breakdown = [
    { name: "Cirurgia",  minutes: 500, lastStudiedDate: "2026-07-06T00:00:00.000Z", daysSinceLastStudy: 0 },
    { name: "Pediatria", minutes: 0,   lastStudiedDate: null,                        daysSinceLastStudy: null },
  ];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => [session({ daysAgo: 0, minutes: 60 })],
    computeCategoryBreakdown: () => breakdown,
  });

  const result = await getReflectionData(NOW);
  const top = result.insights.find(i => i.id === "top_category");
  const neglected = result.insights.find(i => i.id === "neglected_category");

  assert.ok(top);
  assert.match(top.mensagem, /Cirurgia/);
  assert.strictEqual(top.tipo, "positivo");

  assert.ok(neglected);
  assert.match(neglected.mensagem, /Pediatria/);
  assert.strictEqual(neglected.tipo, "atencao");
});

test("partial context: a failure fetching reviews degrades gracefully instead of breaking the report", async (t) => {
  const errors = [];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => [session({ daysAgo: 0, minutes: 45 })],
    listPending:     async () => { throw new Error("network down"); },
    handleError:     (err, ctx) => { errors.push(ctx); return { category: "network", friendly: "erro" }; },
  });

  const result = await getReflectionData(NOW);

  assert.strictEqual(result.status, "partial");
  assert.ok(errors.some(ctx => ctx.context === "reflectionService.reviewsPending" && ctx.silent === true));
  // Indicadores derivados de sessões continuam disponíveis mesmo com a
  // fonte de revisões indisponível — nenhum insight quebra por causa disso.
  assert.strictEqual(result.indicators.sessions.started, 1);
});

test("partial network error: an unavailable session source still yields a report from the sources that succeeded", async (t) => {
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => { throw new Error("Failed to fetch"); },
    listCompleted:   async () => [{ completed_at: NOW.toISOString() }],
  });

  const result = await getReflectionData(NOW);

  assert.strictEqual(result.status, "partial");
  assert.strictEqual(result.indicators.sessions.started, 0);
  assert.strictEqual(result.indicators.reviews.completedCount, 1);
});

test("the engine is stable: the same inputs always produce the same report", async (t) => {
  const sessions = [session({ daysAgo: 0, minutes: 60 }), session({ daysAgo: 2, minutes: 40 })];
  const { getReflectionData } = await loadReflectionService(t, {
    listByDateRange: async () => sessions,
    getProfile: async () => ({ weekly_goal_minutes: 200, daily_goal_minutes: 50 }),
  });

  const first = await getReflectionData(NOW);
  const second = await getReflectionData(NOW);
  assert.deepStrictEqual(first, second);
});
