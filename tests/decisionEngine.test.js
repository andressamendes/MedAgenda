/**
 * Tests for decisionEngine.js — Orquestrador da IA: Decision Engine (F3.7).
 *
 * The consolidation algorithm itself (PRIORITY, the classify helpers,
 * consolidateDecisions) is pure: no I/O, no DOM — every test builds plain
 * recommendation/plan/insight objects by hand, exactly the shapes
 * recommendationEngine.computeRecommendations(), planningService.
 * computeWeeklyPlan() and reflectionService.getReflectionData().insights
 * already produce (same fixture style as tests/recommendationEngine.test.js
 * and tests/planningService.test.js).
 *
 * decisionEngine.js also imports aiContextService.js/reflectionService.js at
 * the top of the file (for its I/O entry point, getDecisions()) — same
 * situation as reflectionService.test.js with aiContextService.js: every
 * test here loads the module dynamically, after mocking those two specifiers
 * wholesale, so their own heavy dependency graphs (eventService/
 * activitySessionService/supabase.js/etc.) never load, even for the tests
 * that only exercise the pure functions.
 */
import { test } from "node:test";
import assert from "node:assert";

const AICONTEXT_SPECIFIER   = new URL("../aiContextService.js", import.meta.url).href;
const REFLECTION_SPECIFIER  = new URL("../reflectionService.js", import.meta.url).href;
const ERROR_SPECIFIER       = new URL("../errorService.js", import.meta.url).href;

const EMPTY_REFLECTION = { status: "insufficient_data", resumo: "", pontosPositivos: [], pontosAtencao: [], evolucaoRecente: [], insights: [] };

function loadDecisionEngine(t, overrides = {}) {
  t.mock.module(AICONTEXT_SPECIFIER, {
    namedExports: { getAIContext: overrides.getAIContext ?? (async () => { throw new Error("getAIContext not stubbed for this test"); }) },
  });
  t.mock.module(REFLECTION_SPECIFIER, {
    namedExports: { getReflectionData: overrides.getReflectionData ?? (async () => EMPTY_REFLECTION) },
  });
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: overrides.handleError ?? (() => ({ category: "unknown", friendly: "erro" })) },
  });
  return import(`../decisionEngine.js?t=${Math.random()}`);
}

// ── Fixtures — um exemplo de cada `type`/`tipo`/`id` já produzido pelos três
// motores existentes ─────────────────────────────────────────────────────────

function overdueRecommendation() {
  return { type: "overdue_events", message: "Você tem 1 compromisso atrasado.", evidence: { count: 1, examples: [] } };
}
function pendingReviewsRecommendation(overdueCount = 0) {
  return { type: "pending_reviews", message: "Você possui 5 revisões pendentes.", evidence: { pendingCount: 5, overdueCount } };
}
function goalsNearlyMetRecommendation() {
  return { type: "goals_nearly_met", message: "Você está perto de bater sua meta semanal.", evidence: { goals: [] } };
}
function understudiedRecommendation(name = "Anatomia") {
  return { type: "understudied_categories", message: `Há dias você não estuda ${name}.`, evidence: { categories: [{ name, daysSinceLastStudy: 10 }] } };
}
function emptyWeekRecommendation() {
  return { type: "empty_week", message: "Sua semana está vazia.", evidence: { weekEventsCount: 0 } };
}
function longGapRecommendation() {
  return { type: "long_gap_no_sessions", message: "Você está há 20 dias sem sessões.", evidence: { daysSinceLastSession: 20 } };
}
function preferredScheduleRecommendation() {
  return { type: "preferred_schedule", message: "Você costuma estudar à noite.", evidence: { horarioPreferido: "noite" } };
}

function overduePlanItem() {
  return { tipo: "overdue", prioridade: "alta", categoria: null, tempoSugerido: "20 minutos", dataSugerida: "2026-07-06", motivo: "Você tem 1 compromisso atrasado.", confianca: "alta" };
}
function reviewPlanItem() {
  return { tipo: "review", prioridade: "alta", categoria: null, tempoSugerido: "15 minutos", dataSugerida: "2026-07-06", motivo: "Existem 5 revisões pendentes.", confianca: "alta" };
}
function goalPlanItem() {
  return { tipo: "goal", prioridade: "média", categoria: null, tempoSugerido: "30 minutos", dataSugerida: "2026-07-12", motivo: "Sua meta semanal está em 95%.", confianca: "alta" };
}
function studyPlanItem(name = "Anatomia") {
  return { tipo: "study", prioridade: "alta", categoria: name, tempoSugerido: "45 minutos", dataSugerida: "2026-07-08", motivo: `Esta categoria não recebe sessões há 10 dias.`, confianca: "alta" };
}
function emptyWeekPlanItem() {
  return { tipo: "study", prioridade: "baixa", categoria: null, tempoSugerido: "60 minutos", dataSugerida: "2026-07-07", motivo: "Sua semana está vazia: nenhum compromisso agendado.", confianca: "média" };
}

function attentionInsight(id = "session_completion_rate", nivelConfianca = "alta") {
  return { id, tipo: "atencao", mensagem: "Você concluiu poucas sessões.", dadosUtilizados: {}, periodoAnalisado: "últimos 7 dias", motivo: "m", nivelConfianca };
}
function positiveInsight(id = "top_category") {
  return { id, tipo: "positivo", mensagem: "Você estudou mais Anatomia.", dadosUtilizados: { category: "Anatomia" }, periodoAnalisado: "últimos 30 dias", motivo: "m", nivelConfianca: "alta" };
}
function neglectedCategoryInsight(name = "Anatomia") {
  return { id: "neglected_category", tipo: "atencao", mensagem: `A categoria ${name} está negligenciada.`, dadosUtilizados: { category: name, daysSinceLastStudy: 10 }, periodoAnalisado: "últimos 30 dias", motivo: "m", nivelConfianca: "média" };
}

// ── Classificadores individuais ─────────────────────────────────────────────

test("classifyRecommendation() assigns urgente to an overdue-events recommendation", async (t) => {
  const { PRIORITY, classifyRecommendation } = await loadDecisionEngine(t);
  const decision = classifyRecommendation(overdueRecommendation());
  assert.strictEqual(decision.prioridade, PRIORITY.URGENTE);
  assert.strictEqual(decision.origem, "recommendation");
  assert.strictEqual(decision.assunto, "compromissos_atrasados");
});

test("classifyRecommendation() reads pending_reviews' own evidence to refine severity (overdue vs. only pending)", async (t) => {
  const { PRIORITY, classifyRecommendation } = await loadDecisionEngine(t);
  assert.strictEqual(classifyRecommendation(pendingReviewsRecommendation(2)).prioridade, PRIORITY.URGENTE);
  assert.strictEqual(classifyRecommendation(pendingReviewsRecommendation(0)).prioridade, PRIORITY.IMPORTANTE);
});

test("classifyRecommendation() treats an opportunity (goal near, understudied category) as recomendado, not urgente", async (t) => {
  const { PRIORITY, classifyRecommendation } = await loadDecisionEngine(t);
  assert.strictEqual(classifyRecommendation(goalsNearlyMetRecommendation()).prioridade, PRIORITY.RECOMENDADO);
  assert.strictEqual(classifyRecommendation(understudiedRecommendation()).prioridade, PRIORITY.RECOMENDADO);
});

test("classifyRecommendation() treats pure context (empty week, preferred schedule) as informativo", async (t) => {
  const { PRIORITY, classifyRecommendation } = await loadDecisionEngine(t);
  assert.strictEqual(classifyRecommendation(emptyWeekRecommendation()).prioridade, PRIORITY.INFORMATIVO);
  assert.strictEqual(classifyRecommendation(preferredScheduleRecommendation()).prioridade, PRIORITY.INFORMATIVO);
});

test("classifyRecommendation() treats a long gap without sessions as urgente", async (t) => {
  const { PRIORITY, classifyRecommendation } = await loadDecisionEngine(t);
  assert.strictEqual(classifyRecommendation(longGapRecommendation()).prioridade, PRIORITY.URGENTE);
});

test("classifyPlanItem() translates planningService's own alta/média/baixa into the shared 4-level scale", async (t) => {
  const { PRIORITY, classifyPlanItem } = await loadDecisionEngine(t);
  assert.strictEqual(classifyPlanItem(overduePlanItem()).prioridade, PRIORITY.URGENTE);
  assert.strictEqual(classifyPlanItem(goalPlanItem()).prioridade, PRIORITY.IMPORTANTE);
  assert.strictEqual(classifyPlanItem(emptyWeekPlanItem()).prioridade, PRIORITY.RECOMENDADO);
});

test("classifyPlanItem() carries the suggested action (tempo/data) that recommendations never have", async (t) => {
  const { classifyPlanItem } = await loadDecisionEngine(t);
  const decision = classifyPlanItem(studyPlanItem());
  assert.deepStrictEqual(decision.acaoSugerida, { tempoSugerido: "45 minutos", dataSugerida: "2026-07-08" });
});

test("classifyPlanItem() distinguishes an understudied-category study item from an empty-week filler by subject", async (t) => {
  const { classifyPlanItem } = await loadDecisionEngine(t);
  assert.strictEqual(classifyPlanItem(studyPlanItem("Anatomia")).assunto, "categoria_negligenciada:Anatomia");
  assert.strictEqual(classifyPlanItem(emptyWeekPlanItem()).assunto, "carga_semana");
});

test("classifyReflectionInsight() treats a positive insight as informativo — it is good news, not a call to action", async (t) => {
  const { PRIORITY, classifyReflectionInsight } = await loadDecisionEngine(t);
  assert.strictEqual(classifyReflectionInsight(positiveInsight()).prioridade, PRIORITY.INFORMATIVO);
});

test("classifyReflectionInsight() reads the insight's own nivelConfianca to grade an 'atencao' insight", async (t) => {
  const { PRIORITY, classifyReflectionInsight } = await loadDecisionEngine(t);
  assert.strictEqual(classifyReflectionInsight(attentionInsight("session_completion_rate", "alta")).prioridade, PRIORITY.IMPORTANTE);
  assert.strictEqual(classifyReflectionInsight(attentionInsight("session_completion_rate", "média")).prioridade, PRIORITY.RECOMENDADO);
});

// ── consolidateDecisions() — múltiplos motores, duplicações, prioridades,
// conflitos, contexto parcial, erro parcial, estabilidade, ordenação (ETAPA 9)

test("consolidateDecisions() merges items from all three engines into a single list", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions } = consolidateDecisions({
    recommendations: [overdueRecommendation()],
    planning: [goalPlanItem()],
    reflection: [positiveInsight()],
  });
  assert.strictEqual(decisions.length, 3);
  assert.deepStrictEqual(decisions.map(d => d.origem).sort(), ["planning", "recommendation", "reflection"]);
});

test("consolidateDecisions() orders the final list from the highest to the lowest priority", async (t) => {
  const { PRIORITY, consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions } = consolidateDecisions({
    recommendations: [emptyWeekRecommendation()], // informativo
    planning: [overduePlanItem()],                // urgente
    reflection: [attentionInsight("session_completion_rate", "média")], // recomendado
  });
  assert.deepStrictEqual(decisions.map(d => d.prioridade), [PRIORITY.URGENTE, PRIORITY.RECOMENDADO, PRIORITY.INFORMATIVO]);
});

test("consolidateDecisions() never shows the same subject twice: 'pending reviews' recommendation + plan item collapse into one", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions } = consolidateDecisions({
    recommendations: [pendingReviewsRecommendation(2)],
    planning: [reviewPlanItem()],
    reflection: [],
  });
  const reviewDecisions = decisions.filter(d => d.assunto === "revisoes_pendentes");
  assert.strictEqual(reviewDecisions.length, 1);
  // Conflito de prioridade resolvido a favor do item mais acionável (Planning
  // Engine já sugere tempo e data) quando a prioridade também empata/supera.
  assert.strictEqual(reviewDecisions[0].origem, "planning");
});

test("consolidateDecisions() dedupes an understudied category across recommendation, plan and reflection, keeping the most actionable", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions } = consolidateDecisions({
    recommendations: [understudiedRecommendation("Anatomia")],
    planning: [studyPlanItem("Anatomia")],
    reflection: [neglectedCategoryInsight("Anatomia")],
  });
  const categoryDecisions = decisions.filter(d => d.assunto === "categoria_negligenciada:Anatomia");
  assert.strictEqual(categoryDecisions.length, 1);
  assert.strictEqual(categoryDecisions[0].origem, "planning");
});

test("consolidateDecisions() never merges unrelated subjects — two different neglected categories both survive", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions } = consolidateDecisions({
    recommendations: [],
    planning: [studyPlanItem("Anatomia"), studyPlanItem("Farmacologia")],
    reflection: [],
  });
  assert.strictEqual(decisions.length, 2);
});

test("consolidateDecisions() keeps working with only one engine available (partial context)", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions, unavailable } = consolidateDecisions({ recommendations: [overdueRecommendation()], planning: null, reflection: null });
  assert.strictEqual(decisions.length, 1);
  assert.deepStrictEqual(unavailable.sort(), ["planning", "reflection"]);
});

test("consolidateDecisions() marks a failed engine as unavailable without breaking the other two (partial error)", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const { decisions, unavailable } = consolidateDecisions({
    recommendations: null, // motor indisponível nesta rodada
    planning: [goalPlanItem()],
    reflection: [positiveInsight()],
  });
  assert.strictEqual(decisions.length, 2);
  assert.deepStrictEqual(unavailable, ["recommendations"]);
});

test("consolidateDecisions() never throws when every engine is unavailable — an empty, not broken, result", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  assert.doesNotThrow(() => {
    const { decisions, unavailable } = consolidateDecisions({ recommendations: null, planning: null, reflection: null });
    assert.deepStrictEqual(decisions, []);
    assert.deepStrictEqual(unavailable, ["recommendations", "planning", "reflection"]);
  });
});

test("consolidateDecisions() is deterministic and stable: same input, same order, every time", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  const input = {
    recommendations: [overdueRecommendation(), goalsNearlyMetRecommendation()],
    planning: [reviewPlanItem(), emptyWeekPlanItem()],
    reflection: [positiveInsight(), attentionInsight()],
  };
  const first  = consolidateDecisions(input).decisions.map(d => d.assunto);
  const second = consolidateDecisions(input).decisions.map(d => d.assunto);
  assert.deepStrictEqual(first, second);
});

test("consolidateDecisions() defaults to an empty, non-throwing result when called with no arguments", async (t) => {
  const { consolidateDecisions } = await loadDecisionEngine(t);
  assert.doesNotThrow(() => {
    const { decisions, unavailable } = consolidateDecisions();
    assert.deepStrictEqual(decisions, []);
    assert.deepStrictEqual(unavailable, ["recommendations", "planning", "reflection"]);
  });
});

// ── getDecisions() — ponto de entrada com I/O (ETAPA 7/8) ───────────────────

test("getDecisions() runs the three engines once and returns the consolidated, deduplicated list", async (t) => {
  const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
  const context = {
    events: [], hasAnyEvents: true, weekEventsCount: 0, // "semana vazia"
    execution: {
      todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
      todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
      dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
    },
    reviews: { pendingCount: 0, pending: [], completedCount: 0 },
    categories: [], hasStudyHistory: false, daysSinceLastSession: null, overdueEvents: [],
  };
  let contextCalls = 0;
  const { getDecisions } = await loadDecisionEngine(t, {
    getAIContext: async () => { contextCalls += 1; return context; },
  });

  const { decisions, planning, unavailable } = await getDecisions();
  assert.strictEqual(contextCalls, 1); // um único round por chamada — nenhum motor recalculado
  assert.deepStrictEqual(unavailable, []);
  assert.ok(decisions.some(d => /Sua semana está vazia/.test(d.mensagem)));
  assert.ok(Array.isArray(planning));
});

test("getDecisions() marks 'recommendations'/'planning' unavailable (both depend on the Context Engine) when it fails, without breaking reflection", async (t) => {
  const handleErrorCalls = [];
  const { getDecisions } = await loadDecisionEngine(t, {
    getAIContext: async () => { throw new Error("network down"); },
    getReflectionData: async () => ({ ...EMPTY_REFLECTION, status: "ok", insights: [positiveInsight()] }),
    handleError: (err, ctx) => { handleErrorCalls.push(ctx); return { category: "unknown", friendly: "erro" }; },
  });

  const { decisions, unavailable } = await getDecisions();
  assert.deepStrictEqual(unavailable.sort(), ["planning", "recommendations"]);
  assert.strictEqual(decisions.length, 1); // só a reflexão sobreviveu
  assert.ok(handleErrorCalls.some(c => c.context === "decisionEngine.getDecisions.context" && c.silent === true));
});

test("getDecisions() never throws even if every engine fails", async (t) => {
  const { getDecisions } = await loadDecisionEngine(t, {
    getAIContext: async () => { throw new Error("network down"); },
    getReflectionData: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(async () => {
    const { decisions, unavailable } = await getDecisions();
    assert.deepStrictEqual(decisions, []);
    assert.deepStrictEqual(unavailable.sort(), ["planning", "recommendations", "reflection"]);
  });
});
