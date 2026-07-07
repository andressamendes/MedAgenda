/**
 * Tests for sql/15_questions.sql — F6.7 (Domínio Questões Resolvidas).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * scripts/check-schema.js: nenhum "confia que está certo", cada garantia
 * estrutural (FK, RLS, policies, constraints, índices, trigger) é conferida
 * por um assert específico, nunca um "arquivo existe" genérico.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL_PATH = fileURLToPath(new URL("../../sql/15_questions.sql", import.meta.url));
const sql = readFileSync(SQL_PATH, "utf8");

test("cria a tabela public.questions com PK e todos os campos mínimos exigidos", () => {
  assert.match(sql, /CREATE TABLE public\.questions/);
  for (const column of [
    "id", "user_id", "session_id", "question_type", "status",
    "difficulty", "subject", "topic", "created_at", "updated_at",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ausente: ${column}`);
  }
  assert.match(sql, /id\s+UUID\s+PRIMARY KEY/);
});

test("session_id é FK obrigatória para activity_sessions com ON DELETE CASCADE", () => {
  assert.match(
    sql,
    /session_id\s+UUID\s+NOT NULL\s+REFERENCES public\.activity_sessions\(id\)\s+ON DELETE CASCADE/
  );
});

test("user_id é FK obrigatória para auth.users com ON DELETE CASCADE", () => {
  assert.match(
    sql,
    /user_id\s+UUID\s+NOT NULL\s+REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE/
  );
});

test("possui CHECK constraints para question_type, status e difficulty (nunca texto livre irrestrito)", () => {
  assert.match(sql, /questions_question_type_check CHECK \(\s*question_type IN \('multiple_choice', 'true_false', 'open', 'flashcard'\)/);
  assert.match(sql, /questions_status_check CHECK \(\s*status IN \('pending', 'answered', 'skipped'\)/);
  assert.match(sql, /questions_difficulty_check CHECK \(\s*difficulty IN \('easy', 'medium', 'hard'\)/);
});

test("cria índices em user_id, session_id e no par (user_id, status)", () => {
  assert.match(sql, /CREATE INDEX questions_user_id_idx ON public\.questions \(user_id\)/);
  assert.match(sql, /CREATE INDEX questions_session_id_idx ON public\.questions \(session_id\)/);
  assert.match(sql, /CREATE INDEX questions_user_status_idx ON public\.questions \(user_id, status\)/);
});

test("cria o trigger de updated_at reaproveitando update_updated_at()", () => {
  assert.match(sql, /CREATE TRIGGER questions_updated_at\s+BEFORE UPDATE ON public\.questions\s+FOR EACH ROW EXECUTE FUNCTION update_updated_at\(\)/);
});

test("habilita RLS na tabela", () => {
  assert.match(sql, /ALTER TABLE public\.questions ENABLE ROW LEVEL SECURITY/);
});

test("define as quatro policies (select/insert/update/delete), todas escopadas por user_id = auth.uid()", () => {
  const policyBlocks = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.questions FOR (\w+)\s+(USING|WITH CHECK) \(user_id = auth\.uid\(\)\)/g)];
  assert.strictEqual(policyBlocks.length, 4, "esperadas 4 policies (select/insert/update/delete)");

  const byAction = Object.fromEntries(policyBlocks.map(m => [m[2], m]));
  assert.ok(byAction.SELECT, "falta policy de SELECT");
  assert.strictEqual(byAction.SELECT[3], "USING");
  assert.ok(byAction.INSERT, "falta policy de INSERT");
  assert.strictEqual(byAction.INSERT[3], "WITH CHECK");
  assert.ok(byAction.UPDATE, "falta policy de UPDATE");
  assert.strictEqual(byAction.UPDATE[3], "USING");
  assert.ok(byAction.DELETE, "falta policy de DELETE");
  assert.strictEqual(byAction.DELETE[3], "USING");
});

test("não faz UPDATE em public.schema_version — este passo ainda não conecta consumidores", () => {
  assert.doesNotMatch(sql, /UPDATE public\.schema_version/);
});
