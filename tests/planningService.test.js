/**
 * Tests for planningService.js — Planejamento Assistido (F3.3).
 * Pure functions: no I/O, no DOM, no aiContextService import — every test
 * builds a plain context object by hand, exactly the shape
 * aiContextService.getAIContext() returns (same fixture pattern as
 * tests/recommendationEngine.test.js).
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  computeWeeklyPlan,
  findOverduePlanItem,
  findPendingReviewsPlanItem,
  findUnderstudiedPlanItems,
  findGoalCatchUpPlanItem,
  findEmptyWeekPlanItem,
} from "../planningService.js";

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
const NOW = new Date("2026-07-06T10:00:00"); // segunda-feira

function emptyContext(overrides = {}) {
  return {
    events: [],
    hasAnyEvents: false,
    weekEventsCount: 0,
    execution: {
      todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
      todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
      dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
    },
    reviews: { pendingCount: 0, pending: [], completedCount: 0 },
    categories: [],
    hasStudyHistory: false,
    daysSinceLastSession: null,
    overdueEvents: [],
    ...overrides,
  };
}

// ── usuário novo / agenda vazia ──────────────────────────────────────────────

test("a brand-new user (no history, no events) gets an empty plan", () => {
  assert.deepStrictEqual(computeWeeklyPlan(emptyContext(), NOW), []);
});

test("a user with an empty agenda but no events registered at all gets no 'empty week' item", () => {
  // hasAnyEvents=false → não há evidência de que a semana está "vazia" (ver
  // mesma guarda de recommendationEngine.findWeekLoadRecommendation).
  assert.strictEqual(findEmptyWeekPlanItem(emptyContext({ hasAnyEvents: false, weekEventsCount: 0 })), null);
});

// ── agenda cheia / compromissos atrasados ───────────────────────────────────

test("findOverduePlanItem() is grounded in the actual overdue count and category, capped at 90 minutes", () => {
  const context = emptyContext({
    overdueEvents: [
      { title: "Prova 1", category: "Farmacologia", date: "2026-07-01", daysOverdue: 5 },
      { title: "Prova 2", category: "Farmacologia", date: "2026-07-02", daysOverdue: 4 },
      { title: "Prova 3", category: "Cirurgia", date: "2026-07-03", daysOverdue: 3 },
    ],
  });
  const item = findOverduePlanItem(context);
  assert.strictEqual(item.tipo, "overdue");
  assert.strictEqual(item.prioridade, "alta");
  assert.strictEqual(item.categoria, "Farmacologia");
  assert.strictEqual(item.tempoSugerido, "60 minutos");
  assert.match(item.motivo, /3 compromissos atrasados/);
  assert.strictEqual(item.confianca, "alta");
});

test("findOverduePlanItem() caps suggested time at 90 minutes regardless of how many events are overdue", () => {
  const overdueEvents = Array.from({ length: 10 }, (_, i) => ({ title: `Ev${i}`, category: null, date: "2026-07-01", daysOverdue: 1 }));
  const item = findOverduePlanItem(emptyContext({ overdueEvents }));
  assert.strictEqual(item.tempoSugerido, "90 minutos");
});

test("findOverduePlanItem() returns null when there are none", () => {
  assert.strictEqual(findOverduePlanItem(emptyContext()), null);
});

// ── revisões pendentes ───────────────────────────────────────────────────────

test("findPendingReviewsPlanItem() reports the pending count and flags high priority when some are overdue", () => {
  const context = emptyContext({
    reviews: {
      pendingCount: 6,
      pending: [
        { scheduledDate: "2026-06-01", daysOverdue: 30 },
        { scheduledDate: "2026-07-20", daysOverdue: 0 },
      ],
      completedCount: 0,
    },
  });
  const item = findPendingReviewsPlanItem(context);
  assert.strictEqual(item.tipo, "review");
  assert.strictEqual(item.prioridade, "alta");
  assert.strictEqual(item.tempoSugerido, "90 minutos"); // 6*15=90, no cap needed
  assert.strictEqual(item.motivo, "Existem 6 revisões pendentes, sendo 1 já atrasadas.");
});

test("findPendingReviewsPlanItem() is medium priority when none are overdue yet", () => {
  const context = emptyContext({
    reviews: { pendingCount: 2, pending: [{ scheduledDate: "2026-07-10", daysOverdue: 0 }], completedCount: 0 },
  });
  const item = findPendingReviewsPlanItem(context);
  assert.strictEqual(item.prioridade, "média");
  assert.strictEqual(item.tempoSugerido, "30 minutos");
});

test("findPendingReviewsPlanItem() returns null when there are no pending reviews", () => {
  assert.strictEqual(findPendingReviewsPlanItem(emptyContext()), null);
});

// ── categorias negligenciadas ────────────────────────────────────────────────

test("findUnderstudiedPlanItems() flags a category not studied in a while, citing the exact gap", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [
      { name: "Clínica Médica", minutes: 300, lastStudiedDate: "2026-07-01T00:00:00.000Z", daysSinceLastStudy: 5 },
      { name: "Cirurgia", minutes: 600, lastStudiedDate: "2026-07-06T00:00:00.000Z", daysSinceLastStudy: 0 },
    ],
  });
  const items = findUnderstudiedPlanItems(context);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].tipo, "study");
  assert.strictEqual(items[0].categoria, "Clínica Médica");
  assert.strictEqual(items[0].prioridade, "média");
  assert.strictEqual(items[0].tempoSugerido, "45 minutos");
  assert.strictEqual(items[0].motivo, "Esta categoria não recebe sessões há 5 dias.");
  assert.strictEqual(items[0].confianca, "alta");
});

test("findUnderstudiedPlanItems() flags a category that was never studied, with medium confidence", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [
      { name: "Cirurgia", minutes: 600, lastStudiedDate: "2026-07-06T00:00:00.000Z", daysSinceLastStudy: 0 },
      { name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null },
    ],
  });
  const items = findUnderstudiedPlanItems(context);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].motivo, "Você ainda não registrou sessões de estudo na categoria Pediatria.");
  assert.strictEqual(items[0].confianca, "média");
});

test("findUnderstudiedPlanItems() raises priority to alta for a very long gap", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [{ name: "Cirurgia", minutes: 0, lastStudiedDate: "2026-06-01T00:00:00.000Z", daysSinceLastStudy: 20 }],
  });
  assert.strictEqual(findUnderstudiedPlanItems(context)[0].prioridade, "alta");
});

test("findUnderstudiedPlanItems() caps at 3 items and never fires for a brand-new user", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: Array.from({ length: 5 }, (_, i) => ({ name: `Cat${i}`, minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null })),
  });
  assert.strictEqual(findUnderstudiedPlanItems(context).length, 3);
  assert.deepStrictEqual(findUnderstudiedPlanItems(emptyContext({ hasStudyHistory: false, categories: [{ name: "X", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }] })), []);
});

// ── metas atingidas / atrasadas ──────────────────────────────────────────────

test("findGoalCatchUpPlanItem() flags a weekly goal far from completion as high priority", () => {
  const context = emptyContext({
    execution: {
      ...emptyContext().execution,
      weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 100, percentage: 17, remainingMinutes: 500, state: "partial" },
    },
  });
  const item = findGoalCatchUpPlanItem(context);
  assert.strictEqual(item.tipo, "goal");
  assert.strictEqual(item.prioridade, "alta");
  assert.strictEqual(item.tempoSugerido, "90 minutos"); // capped
  assert.strictEqual(item.motivo, "Sua meta semanal está em 17%.");
});

test("findGoalCatchUpPlanItem() flags a nearly-met goal as medium priority", () => {
  const context = emptyContext({
    execution: {
      ...emptyContext().execution,
      weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 570, percentage: 95, remainingMinutes: 30, state: "partial" },
    },
  });
  assert.strictEqual(findGoalCatchUpPlanItem(context).prioridade, "média");
});

test("findGoalCatchUpPlanItem() does not fire for an achieved/exceeded or unconfigured goal", () => {
  assert.strictEqual(findGoalCatchUpPlanItem(emptyContext()), null); // sem meta
  assert.strictEqual(findGoalCatchUpPlanItem(emptyContext({
    execution: { ...emptyContext().execution, weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 600, percentage: 100, remainingMinutes: 0, state: "achieved" } },
  })), null);
});

// ── semana vazia ─────────────────────────────────────────────────────────────

test("findEmptyWeekPlanItem() flags an empty week as low-priority, medium-confidence opportunity", () => {
  const item = findEmptyWeekPlanItem(emptyContext({ hasAnyEvents: true, weekEventsCount: 0 }));
  assert.strictEqual(item.tipo, "study");
  assert.strictEqual(item.prioridade, "baixa");
  assert.strictEqual(item.confianca, "média");
});

test("findEmptyWeekPlanItem() stays silent for a loaded week", () => {
  assert.strictEqual(findEmptyWeekPlanItem(emptyContext({ hasAnyEvents: true, weekEventsCount: 5 })), null);
});

// ── consolidação e datas sugeridas ───────────────────────────────────────────

test("computeWeeklyPlan() orders items by priority (alta > média > baixa) and assigns grounded dates", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova", category: null, date: "2026-07-01", daysOverdue: 5 }],
    reviews: { pendingCount: 1, pending: [{ scheduledDate: "2026-07-05", daysOverdue: 1 }], completedCount: 0 },
    hasAnyEvents: true,
    weekEventsCount: 0,
    hasStudyHistory: true,
    categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
  });

  const plan = computeWeeklyPlan(context, NOW);
  const priorities = plan.map(p => p.prioridade);
  // alta itens (overdue, review) antes de baixa (empty week); nada intercalado fora de ordem
  for (let i = 1; i < priorities.length; i++) {
    assert.ok(PRIORITY_RANK(priorities[i - 1]) <= PRIORITY_RANK(priorities[i]));
  }

  const overdueItem = plan.find(p => p.tipo === "overdue");
  assert.strictEqual(overdueItem.dataSugerida, "2026-07-06"); // hoje — ação urgente, não uma data inventada

  plan.forEach(p => assert.match(p.dataSugerida, /^\d{4}-\d{2}-\d{2}$/));
});

function PRIORITY_RANK(p) {
  return { alta: 0, "média": 1, baixa: 2 }[p];
}

test("computeWeeklyPlan() is stable: same context + same now always produce the same plan", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova", category: "Farmacologia", date: "2026-07-01", daysOverdue: 5 }],
    hasStudyHistory: true,
    categories: [{ name: "Cirurgia", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
  });
  const first = computeWeeklyPlan(context, NOW);
  const second = computeWeeklyPlan(context, NOW);
  assert.deepStrictEqual(first, second);
});

// ── contexto parcial / dados indisponíveis ──────────────────────────────────

test("computeWeeklyPlan() degrades gracefully with a partial context (missing optional fields default via emptyContext shape)", () => {
  // Simula uma fonte indisponível: aiContextService já resolve para os
  // fallbacks vazios (ver _safe()); o Planning Engine nunca lança mesmo
  // recebendo um contexto parcialmente vazio.
  const partial = emptyContext({ reviews: { pendingCount: 0, pending: [], completedCount: 0 }, categories: [] });
  assert.doesNotThrow(() => computeWeeklyPlan(partial, NOW));
  assert.deepStrictEqual(computeWeeklyPlan(partial, NOW), []);
});

// ── sanitização ──────────────────────────────────────────────────────────────

test("plan items never leak ids or raw technical fields — only tipo/prioridade/categoria/tempoSugerido/dataSugerida/motivo/confianca", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova", category: "Farmacologia", date: "2026-07-01", daysOverdue: 5 }],
  });
  const plan = computeWeeklyPlan(context, NOW);
  const allowedKeys = ["tipo", "prioridade", "categoria", "tempoSugerido", "dataSugerida", "motivo", "confianca"];
  plan.forEach(item => {
    assert.deepStrictEqual(Object.keys(item).sort(), [...allowedKeys].sort());
  });
});

// ── preferência de horário/dia (F3.6 — User Memory Engine) ──────────────────
// Peso, não regra absoluta: só itens "study" são deslocados para o dia
// preferido, e só com confiança "alta" — nunca muda prioridade, categoria ou
// motivo, e nunca aparece sem o Memory Engine (contextos existentes, sem
// `memory`, continuam produzindo exatamente o mesmo plano de antes).

test("computeWeeklyPlan() nudges a 'study' item to the user's preferred weekday when the Memory Engine has strong evidence", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
    memory: { status: "ok", preferences: { diaPreferido: { valor: "Quinta-feira", baseadoEm: "12 sessões concluídas", confianca: "alta" } } },
  });
  const plan = computeWeeklyPlan(context, NOW); // NOW = segunda-feira, 2026-07-06
  const studyItem = plan.find(p => p.tipo === "study");
  assert.strictEqual(studyItem.dataSugerida, "2026-07-09"); // próxima quinta-feira
  // Nunca muda o que já era grounded em evidência própria do item:
  assert.strictEqual(studyItem.motivo, "Você ainda não registrou sessões de estudo na categoria Pediatria.");
  assert.strictEqual(studyItem.confianca, "média");
});

test("computeWeeklyPlan() ignores the preferred weekday below 'alta' confidence — falls back to the usual spread", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
    memory: { status: "ok", preferences: { diaPreferido: { valor: "Quinta-feira", baseadoEm: "4 sessões", confianca: "média" } } },
  });
  const withMemory = computeWeeklyPlan(context, NOW);
  const withoutMemory = computeWeeklyPlan({ ...context, memory: undefined }, NOW);
  assert.deepStrictEqual(withMemory, withoutMemory);
});

test("computeWeeklyPlan() never nudges 'overdue' or 'goal' items by the preferred weekday — only 'study'", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova", category: null, date: "2026-07-01", daysOverdue: 5 }],
    execution: {
      ...emptyContext().execution,
      weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 100, percentage: 17, remainingMinutes: 500, state: "partial" },
    },
    memory: { status: "ok", preferences: { diaPreferido: { valor: "Quinta-feira", baseadoEm: "12 sessões concluídas", confianca: "alta" } } },
  });
  const plan = computeWeeklyPlan(context, NOW);
  assert.strictEqual(plan.find(p => p.tipo === "overdue").dataSugerida, "2026-07-06"); // hoje, inalterado
  assert.strictEqual(plan.find(p => p.tipo === "goal").dataSugerida, "2026-07-12");    // domingo, inalterado
});

test("computeWeeklyPlan() is unaffected by memory when the context predates the Memory Engine (no `memory` field at all)", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
  });
  assert.ok(!("memory" in context));
  assert.doesNotThrow(() => computeWeeklyPlan(context, NOW));
});
