/**
 * Tests for recommendationEngine.js — Primeiras Recomendações (F3.2).
 * Pure functions: no I/O, no DOM, no aiContextService import — every test
 * builds a plain context object by hand, exactly the shape
 * aiContextService.getAIContext() returns (see tests/aiContextService.test.js
 * for how that shape itself is built).
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  computeRecommendations,
  findOverdueEventsRecommendation,
  findPendingReviewsRecommendation,
  findGoalsNearlyMetRecommendation,
  findUnderstudiedCategoriesRecommendation,
  findWeekLoadRecommendation,
  findExecutionRecommendation,
} from "../recommendationEngine.js";

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

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

// ── usuário novo ──────────────────────────────────────────────────────────────

test("a brand-new user (no history at all) gets no recommendations", () => {
  const result = computeRecommendations(emptyContext());
  assert.deepStrictEqual(result, []);
});

// ── compromissos atrasados ───────────────────────────────────────────────────

test("findOverdueEventsRecommendation() is grounded in the actual overdue count and examples", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova de Farmaco", category: "Farmacologia", date: "2026-07-01", daysOverdue: 7 }],
  });
  const rec = findOverdueEventsRecommendation(context);
  assert.strictEqual(rec.type, "overdue_events");
  assert.match(rec.message, /1 compromisso atrasado/);
  assert.match(rec.message, /"Prova de Farmaco" \(7d\)/);
  assert.strictEqual(rec.evidence.count, 1);
});

test("findOverdueEventsRecommendation() returns null when there are none", () => {
  assert.strictEqual(findOverdueEventsRecommendation(emptyContext()), null);
});

// ── revisões pendentes ───────────────────────────────────────────────────────

test("findPendingReviewsRecommendation() reports the pending count and how many are overdue", () => {
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
  const rec = findPendingReviewsRecommendation(context);
  assert.strictEqual(rec.type, "pending_reviews");
  assert.strictEqual(rec.message, "Você possui 6 revisões pendentes, sendo 1 já atrasadas.");
  assert.strictEqual(rec.evidence.pendingCount, 6);
  assert.strictEqual(rec.evidence.overdueCount, 1);
});

test("findPendingReviewsRecommendation() returns null when there are no pending reviews", () => {
  assert.strictEqual(findPendingReviewsRecommendation(emptyContext()), null);
});

// ── metas atingidas / próximas / atrasadas ──────────────────────────────────

test("findGoalsNearlyMetRecommendation() fires only for goals between 70% and 99%", () => {
  const context = emptyContext({
    execution: {
      ...emptyContext().execution,
      dailyGoal:   { configured: true, goalMinutes: 120, actualMinutes: 90, percentage: 75, remainingMinutes: 30, state: "partial" },
      weeklyGoal:  NO_GOAL,
      monthlyGoal: NO_GOAL,
    },
  });
  const rec = findGoalsNearlyMetRecommendation(context);
  assert.strictEqual(rec.type, "goals_nearly_met");
  assert.match(rec.message, /meta diária em 75%/);
});

test("findGoalsNearlyMetRecommendation() does not fire for a goal already achieved (100%) or exceeded", () => {
  const context = emptyContext({
    execution: {
      ...emptyContext().execution,
      dailyGoal:  { configured: true, goalMinutes: 120, actualMinutes: 120, percentage: 100, remainingMinutes: 0, state: "achieved" },
      weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 900, percentage: 150, remainingMinutes: 0, state: "exceeded" },
    },
  });
  assert.strictEqual(findGoalsNearlyMetRecommendation(context), null);
});

test("findGoalsNearlyMetRecommendation() does not fire for an unconfigured goal or one far from completion", () => {
  const context = emptyContext({
    execution: {
      ...emptyContext().execution,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 10, percentage: 8, remainingMinutes: 110, state: "partial" },
    },
  });
  assert.strictEqual(findGoalsNearlyMetRecommendation(context), null);
});

// ── categorias pouco utilizadas ──────────────────────────────────────────────

test("findUnderstudiedCategoriesRecommendation() flags a category not studied in a while, citing the exact gap", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [
      { name: "Clínica Médica", minutes: 300, lastStudiedDate: "2026-07-03T00:00:00.000Z", daysSinceLastStudy: 5 },
      { name: "Cirurgia",        minutes: 600, lastStudiedDate: "2026-07-08T00:00:00.000Z", daysSinceLastStudy: 0 },
    ],
  });
  const rec = findUnderstudiedCategoriesRecommendation(context);
  assert.strictEqual(rec.type, "understudied_categories");
  assert.strictEqual(rec.message, "Há 5 dias você não realiza sessões da categoria Clínica Médica.");
});

test("findUnderstudiedCategoriesRecommendation() flags a category that was never studied", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [
      { name: "Cirurgia", minutes: 600, lastStudiedDate: "2026-07-08T00:00:00.000Z", daysSinceLastStudy: 0 },
      { name: "Pediatria", minutes: 0,   lastStudiedDate: null, daysSinceLastStudy: null },
    ],
  });
  const rec = findUnderstudiedCategoriesRecommendation(context);
  assert.strictEqual(rec.message, "Você ainda não registrou sessões de estudo na categoria Pediatria.");
});

test("findUnderstudiedCategoriesRecommendation() never fires for a user with no study history at all", () => {
  const context = emptyContext({
    hasStudyHistory: false,
    categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
  });
  assert.strictEqual(findUnderstudiedCategoriesRecommendation(context), null);
});

test("findUnderstudiedCategoriesRecommendation() does not fire when every category was studied recently", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    categories: [{ name: "Cirurgia", minutes: 600, lastStudiedDate: "2026-07-08T00:00:00.000Z", daysSinceLastStudy: 1 }],
  });
  assert.strictEqual(findUnderstudiedCategoriesRecommendation(context), null);
});

// ── semana muito carregada / muito vazia ────────────────────────────────────

test("findWeekLoadRecommendation() flags a heavy week", () => {
  const context = emptyContext({ hasAnyEvents: true, weekEventsCount: 12 });
  const rec = findWeekLoadRecommendation(context);
  assert.strictEqual(rec.type, "heavy_week");
  assert.match(rec.message, /12 compromissos/);
});

test("findWeekLoadRecommendation() flags an empty week", () => {
  const context = emptyContext({ hasAnyEvents: true, weekEventsCount: 0 });
  const rec = findWeekLoadRecommendation(context);
  assert.strictEqual(rec.type, "empty_week");
});

test("findWeekLoadRecommendation() stays silent for a normal week or a user with no agenda at all", () => {
  assert.strictEqual(findWeekLoadRecommendation(emptyContext({ hasAnyEvents: true, weekEventsCount: 4 })), null);
  assert.strictEqual(findWeekLoadRecommendation(emptyContext({ hasAnyEvents: false, weekEventsCount: 0 })), null);
});

// ── longo período sem sessões / pouca execução recente ──────────────────────

test("findExecutionRecommendation() flags a long gap without any sessions", () => {
  const context = emptyContext({ hasStudyHistory: true, daysSinceLastSession: 20 });
  const rec = findExecutionRecommendation(context);
  assert.strictEqual(rec.type, "long_gap_no_sessions");
  assert.match(rec.message, /20 dias/);
});

test("findExecutionRecommendation() flags low recent execution when sessions are recent but few", () => {
  const context = emptyContext({
    hasStudyHistory: true,
    daysSinceLastSession: 2,
    execution: { ...emptyContext().execution, weekMinutes: 40 },
  });
  const rec = findExecutionRecommendation(context);
  assert.strictEqual(rec.type, "low_recent_execution");
  assert.match(rec.message, /apenas 40 minutos/);
});

test("findExecutionRecommendation() stays silent when execution is healthy, and never fires for a new user", () => {
  const healthy = emptyContext({
    hasStudyHistory: true,
    daysSinceLastSession: 1,
    execution: { ...emptyContext().execution, weekMinutes: 300 },
  });
  assert.strictEqual(findExecutionRecommendation(healthy), null);
  assert.strictEqual(findExecutionRecommendation(emptyContext({ hasStudyHistory: false, daysSinceLastSession: null })), null);
});

// ── consolidação ─────────────────────────────────────────────────────────────

test("computeRecommendations() combines every applicable rule, in evidence, for an active user", () => {
  const context = emptyContext({
    overdueEvents: [{ title: "Prova", category: null, date: "2026-07-01", daysOverdue: 7 }],
    reviews: { pendingCount: 2, pending: [{ scheduledDate: "2026-07-01", daysOverdue: 7 }], completedCount: 5 },
    hasStudyHistory: true,
    daysSinceLastSession: 1,
    execution: { ...emptyContext().execution, weekMinutes: 300 },
  });

  const result = computeRecommendations(context);
  const types = result.map(r => r.type);

  assert.deepStrictEqual(types, ["overdue_events", "pending_reviews"]);
});
