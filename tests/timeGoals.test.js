/**
 * Tests for timeGoals.js — Metas de Tempo (F2.2).
 * Pure functions (no DOM, no I/O), same style as tests/activitySessionStats.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  GOAL_LIMITS,
  validateGoalMinutes,
  calculateGoalPercentage,
  calculateRemainingTime,
  calculateGoalProgress,
} from "../timeGoals.js";

// ── calculateGoalPercentage() ───────────────────────────────────────────────

test("calculateGoalPercentage returns null when there is no goal", () => {
  assert.strictEqual(calculateGoalPercentage(30, null), null);
  assert.strictEqual(calculateGoalPercentage(30, undefined), null);
  assert.strictEqual(calculateGoalPercentage(30, 0), null);
});

test("calculateGoalPercentage rounds the percentage", () => {
  assert.strictEqual(calculateGoalPercentage(30, 120), 25);
  assert.strictEqual(calculateGoalPercentage(50, 120), 42); // 41.67 -> 42
});

test("calculateGoalPercentage can exceed 100", () => {
  assert.strictEqual(calculateGoalPercentage(180, 120), 150);
});

test("calculateGoalPercentage treats a missing actual as zero", () => {
  assert.strictEqual(calculateGoalPercentage(undefined, 120), 0);
});

// ── calculateRemainingTime() ────────────────────────────────────────────────

test("calculateRemainingTime returns null when there is no goal", () => {
  assert.strictEqual(calculateRemainingTime(30, null), null);
  assert.strictEqual(calculateRemainingTime(30, 0), null);
});

test("calculateRemainingTime returns the difference when under the goal", () => {
  assert.strictEqual(calculateRemainingTime(30, 120), 90);
});

test("calculateRemainingTime never goes negative when the goal is exceeded", () => {
  assert.strictEqual(calculateRemainingTime(150, 120), 0);
});

// ── calculateGoalProgress() — estados (ETAPA 7) ─────────────────────────────

test("no goal configured -> state 'no_goal', nothing else computed", () => {
  const result = calculateGoalProgress(45, null);
  assert.strictEqual(result.configured, false);
  assert.strictEqual(result.state, "no_goal");
  assert.strictEqual(result.goalMinutes, null);
  assert.strictEqual(result.percentage, null);
  assert.strictEqual(result.remainingMinutes, null);
  assert.strictEqual(result.actualMinutes, 45);
});

test("empty goal (0 minutes done) -> partial with 0%", () => {
  const result = calculateGoalProgress(0, 120);
  assert.strictEqual(result.configured, true);
  assert.strictEqual(result.state, "partial");
  assert.strictEqual(result.percentage, 0);
  assert.strictEqual(result.remainingMinutes, 120);
});

test("daily goal partially reached", () => {
  const result = calculateGoalProgress(60, 120);
  assert.strictEqual(result.state, "partial");
  assert.strictEqual(result.percentage, 50);
  assert.strictEqual(result.remainingMinutes, 60);
});

test("weekly goal exactly reached -> state 'achieved'", () => {
  const result = calculateGoalProgress(600, 600);
  assert.strictEqual(result.state, "achieved");
  assert.strictEqual(result.percentage, 100);
  assert.strictEqual(result.remainingMinutes, 0);
});

test("monthly goal exceeded -> state 'exceeded'", () => {
  const result = calculateGoalProgress(3000, 2400);
  assert.strictEqual(result.state, "exceeded");
  assert.strictEqual(result.percentage, 125);
  assert.strictEqual(result.remainingMinutes, 0);
});

// ── validateGoalMinutes() ───────────────────────────────────────────────────

test("validateGoalMinutes accepts empty values as 'no goal'", () => {
  assert.deepStrictEqual(validateGoalMinutes(null, "daily"), { valid: true, value: null });
  assert.deepStrictEqual(validateGoalMinutes(undefined, "daily"), { valid: true, value: null });
  assert.deepStrictEqual(validateGoalMinutes("", "daily"), { valid: true, value: null });
});

test("validateGoalMinutes accepts values within range for each period", () => {
  assert.deepStrictEqual(validateGoalMinutes(120, "daily"), { valid: true, value: 120 });
  assert.deepStrictEqual(validateGoalMinutes("600", "weekly"), { valid: true, value: 600 });
  assert.deepStrictEqual(validateGoalMinutes(2400, "monthly"), { valid: true, value: 2400 });
});

test("validateGoalMinutes rejects values below the minimum", () => {
  const result = validateGoalMinutes(1, "daily");
  assert.strictEqual(result.valid, false);
  assert.match(result.error, new RegExp(`${GOAL_LIMITS.daily.min}`));
});

test("validateGoalMinutes rejects values above the maximum", () => {
  const result = validateGoalMinutes(GOAL_LIMITS.weekly.max + 1, "weekly");
  assert.strictEqual(result.valid, false);
});

test("validateGoalMinutes rejects non-integer values", () => {
  const result = validateGoalMinutes(12.5, "monthly");
  assert.strictEqual(result.valid, false);
});

test("validateGoalMinutes rejects non-numeric values", () => {
  const result = validateGoalMinutes("abc", "daily");
  assert.strictEqual(result.valid, false);
});

test("validateGoalMinutes throws for an unknown period", () => {
  assert.throws(() => validateGoalMinutes(60, "yearly"));
});

// ── monthly_goal_minutes — AUD-006 (SMALLINT do banco vs. limite da UI) ─────

test("validateGoalMinutes accepts the smallest valid monthly value", () => {
  assert.deepStrictEqual(
    validateGoalMinutes(GOAL_LIMITS.monthly.min, "monthly"),
    { valid: true, value: GOAL_LIMITS.monthly.min }
  );
});

test("validateGoalMinutes accepts the largest valid monthly value (44640, acima do limite do SMALLINT)", () => {
  assert.deepStrictEqual(
    validateGoalMinutes(GOAL_LIMITS.monthly.max, "monthly"),
    { valid: true, value: GOAL_LIMITS.monthly.max }
  );
  // 32767 é o limite do SMALLINT do Postgres — o maior valor aceito pela UI
  // precisa ultrapassá-lo para a migration 20 (INTEGER) ser de fato necessária.
  assert.ok(GOAL_LIMITS.monthly.max > 32767);
});

test("validateGoalMinutes rejects a monthly value above the limit", () => {
  const result = validateGoalMinutes(GOAL_LIMITS.monthly.max + 1, "monthly");
  assert.strictEqual(result.valid, false);
});
