/**
 * Tests for sql/19_activity_sessions_running_unique.sql — AUD-001 (Garantir
 * Integridade: Apenas uma Sessão "running" por Usuário).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * tests/sql/questions.schema.test.js: cada garantia estrutural (índice único
 * parcial, condição WHERE, checagem de dados inconsistentes, idempotência,
 * bump de schema_version) é conferida por um assert específico.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL_PATH = fileURLToPath(
  new URL("../../sql/19_activity_sessions_running_unique.sql", import.meta.url)
);
const sql = readFileSync(SQL_PATH, "utf8");

test("cria um índice único parcial em (user_id) restrito a status = 'running'", () => {
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS activity_sessions_one_running_per_user\s+ON public\.activity_sessions \(user_id\)\s+WHERE status = 'running'/
  );
});

test("o índice é idempotente (IF NOT EXISTS) — reexecutar a migration não falha", () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS activity_sessions_one_running_per_user/);
});

test("nunca apaga nem modifica dados existentes — só DDL/checagem, sem DELETE/UPDATE em activity_sessions", () => {
  assert.doesNotMatch(sql, /DELETE FROM public\.activity_sessions/);
  assert.doesNotMatch(sql, /UPDATE public\.activity_sessions/);
});

test("falha explicitamente com mensagem clara quando já existe mais de uma sessão 'running' por usuário", () => {
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /GROUP BY user_id\s+HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /AUD-001/);
});

test("bump de schema_version para 19, seguindo a convenção de 14_schema_version.sql", () => {
  assert.match(sql, /UPDATE public\.schema_version SET version = 19, applied_at = now\(\) WHERE id = 1/);
});
