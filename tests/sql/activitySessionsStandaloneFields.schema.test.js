/**
 * Tests for sql/21_activity_sessions_standalone_fields.sql — refatoração do
 * fluxo "Sessão de Estudo": o modal de configuração pré-início
 * (studySessionView.js) grava título/categoria/conteúdo/data/tempo previsto
 * mesmo quando a sessão não está vinculada a um compromisso (event_id NULL).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * tests/sql/monthlyGoalMinutesInteger.schema.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL_PATH = fileURLToPath(
  new URL("../../sql/21_activity_sessions_standalone_fields.sql", import.meta.url)
);
const sql = readFileSync(SQL_PATH, "utf8");

test("adiciona title/content/session_date/planned_duration_minutes a activity_sessions", () => {
  assert.match(sql, /ALTER TABLE public\.activity_sessions/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS title\s+TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS content\s+TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS session_date\s+DATE/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS planned_duration_minutes\s+INTEGER/);
});

test("todas as colunas novas usam IF NOT EXISTS — a migration é idempotente", () => {
  const addColumnLines = sql.match(/ADD COLUMN[^\n,]*/g) ?? [];
  assert.ok(addColumnLines.length >= 4);
  for (const line of addColumnLines) {
    assert.match(line, /ADD COLUMN IF NOT EXISTS/);
  }
});

test("planned_duration_minutes aceita NULL ou um valor positivo, nunca zero/negativo", () => {
  assert.match(
    sql,
    /CHECK \(planned_duration_minutes IS NULL OR planned_duration_minutes > 0\)/
  );
});

test("nunca apaga nem reescreve dados existentes — só DDL de coluna, sem DELETE/UPDATE em activity_sessions", () => {
  assert.doesNotMatch(sql, /DELETE FROM public\.activity_sessions/);
  assert.doesNotMatch(sql, /UPDATE public\.activity_sessions/);
});

test("bump de schema_version para 21, seguindo a convenção de 14_schema_version.sql", () => {
  assert.match(sql, /UPDATE public\.schema_version SET version = 21, applied_at = now\(\) WHERE id = 1/);
});
