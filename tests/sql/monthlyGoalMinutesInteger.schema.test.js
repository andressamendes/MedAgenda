/**
 * Tests for sql/20_monthly_goal_minutes_integer.sql — AUD-006 (monthly_goal_minutes
 * SMALLINT não comporta o intervalo aceito pela UI/CHECK).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * tests/sql/activitySessionsRunningUnique.schema.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GOAL_LIMITS } from "../../timeGoals.js";

const SQL_PATH = fileURLToPath(
  new URL("../../sql/20_monthly_goal_minutes_integer.sql", import.meta.url)
);
const sql = readFileSync(SQL_PATH, "utf8");

const ORIGINAL_SQL_PATH = fileURLToPath(new URL("../../sql/12_time_goals.sql", import.meta.url));
const originalSql = readFileSync(ORIGINAL_SQL_PATH, "utf8");

test("amplia monthly_goal_minutes para INTEGER (comporta o intervalo até 44640)", () => {
  assert.match(
    sql,
    /ALTER TABLE public\.profiles\s+ALTER COLUMN monthly_goal_minutes TYPE INTEGER/
  );
});

test("não toca daily_goal_minutes nem weekly_goal_minutes — só monthly cabia fora do SMALLINT", () => {
  assert.doesNotMatch(sql, /daily_goal_minutes\s+TYPE/);
  assert.doesNotMatch(sql, /weekly_goal_minutes\s+TYPE/);
});

test("nunca apaga nem reescreve dados existentes — só DDL de tipo, sem DELETE/UPDATE em profiles", () => {
  assert.doesNotMatch(sql, /DELETE FROM public\.profiles/);
  assert.doesNotMatch(sql, /UPDATE public\.profiles/);
});

test("bump de schema_version para 20, seguindo a convenção de 14_schema_version.sql", () => {
  assert.match(sql, /UPDATE public\.schema_version SET version = 20, applied_at = now\(\) WHERE id = 1/);
});

// ── Consistência UI ↔ banco ──────────────────────────────────────────────────
// O CHECK de 12_time_goals.sql continua sendo a única fonte de verdade do
// intervalo aceito (esta migration só amplia o tipo da coluna, nunca o
// CHECK) — a UI (timeGoals.js/GOAL_LIMITS, consumido por accountView.js) e o
// banco precisam concordar exatamente sobre o mesmo intervalo.
test("GOAL_LIMITS.monthly (UI) coincide exatamente com o CHECK de monthly_goal_minutes (banco)", () => {
  const match = originalSql.match(
    /monthly_goal_minutes IS NULL OR monthly_goal_minutes BETWEEN (\d+) AND (\d+)/
  );
  assert.ok(match, "CHECK de monthly_goal_minutes não encontrado em 12_time_goals.sql");
  const [, min, max] = match;
  assert.strictEqual(GOAL_LIMITS.monthly.min, Number(min));
  assert.strictEqual(GOAL_LIMITS.monthly.max, Number(max));
});
