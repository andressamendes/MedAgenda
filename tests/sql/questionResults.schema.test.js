/**
 * Tests for sql/25_question_results.sql — F17 (Refatoração do Registro de
 * Questões + Estatísticas do Diário).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * tests/sql/activitySessionsStandaloneFields.schema.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL_PATH = fileURLToPath(new URL("../../sql/25_question_results.sql", import.meta.url));
const sql = readFileSync(SQL_PATH, "utf8");

test("adiciona correct_count/incorrect_count a questions, com default 0 (compatível com linhas antigas)", () => {
  assert.match(sql, /ALTER TABLE public\.questions/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS correct_count\s+INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS incorrect_count\s+INTEGER NOT NULL DEFAULT 0/);
});

test("ambos os contadores têm CHECK >= 0", () => {
  assert.match(sql, /questions_correct_count_check\s+CHECK \(correct_count >= 0\)/);
  assert.match(sql, /questions_incorrect_count_check\s+CHECK \(incorrect_count >= 0\)/);
});

test("nunca apaga nem reescreve dados existentes — só DDL de coluna/função, sem DELETE/UPDATE em questions", () => {
  assert.doesNotMatch(sql, /DELETE FROM public\.questions/);
  assert.doesNotMatch(sql, /UPDATE public\.questions/);
});

test("cria a função get_question_statistics com os 4 filtros opcionais e retorno total/correct/incorrect", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_question_statistics\(/);
  assert.match(sql, /p_start\s+DATE DEFAULT NULL/);
  assert.match(sql, /p_end\s+DATE DEFAULT NULL/);
  assert.match(sql, /p_category_id\s+UUID DEFAULT NULL/);
  assert.match(sql, /p_subject\s+TEXT DEFAULT NULL/);
  assert.match(sql, /RETURNS TABLE \(total INTEGER, correct INTEGER, incorrect INTEGER\)/);
});

test("a função não é SECURITY DEFINER — herda a RLS de quem chama (nenhum bypass de user_id)", () => {
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});

test("a função escopa por auth.uid() e faz JOIN com activity_sessions para o filtro de categoria", () => {
  assert.match(sql, /WHERE q\.user_id = auth\.uid\(\)/);
  assert.match(sql, /JOIN public\.activity_sessions s ON s\.id = q\.session_id/);
  assert.match(sql, /p_category_id IS NULL OR s\.category_id = p_category_id/);
});

test("bump de schema_version para 25, seguindo a convenção de 14_schema_version.sql", () => {
  assert.match(sql, /UPDATE public\.schema_version SET version = 25, applied_at = now\(\) WHERE id = 1/);
});
