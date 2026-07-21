/**
 * Tests for sql/23_client_errors.sql — F15.3 (Observabilidade mínima de
 * produção).
 *
 * Sem projeto Supabase real disponível em CI, esta suíte valida a migration
 * estaticamente (parse do próprio arquivo .sql), no mesmo espírito de
 * tests/sql/questions.schema.test.js: cada garantia estrutural (FK, RLS,
 * policy insert-only, ausência de policy de leitura, bump de schema_version)
 * é conferida por um assert específico.
 */
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL_PATH = fileURLToPath(new URL("../../sql/23_client_errors.sql", import.meta.url));
const sql = readFileSync(SQL_PATH, "utf8");

test("cria a tabela public.client_errors com PK e os campos mínimos (categoria, contexto, mensagem, código, status, user agent)", () => {
  assert.match(sql, /create table if not exists public\.client_errors/);
  for (const column of [
    "id", "user_id", "category", "context", "message",
    "code", "http_status", "user_agent", "created_at",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ausente: ${column}`);
  }
  assert.match(sql, /id\s+uuid primary key/);
});

test("user_id é FK obrigatória para auth.users com ON DELETE CASCADE (exclusão de conta não deixa linhas órfãs)", () => {
  assert.match(
    sql,
    /user_id\s+uuid not null references auth\.users\(id\) on delete cascade/
  );
});

test("RLS habilitado, com política de INSERT restrita às próprias linhas do usuário", () => {
  assert.match(sql, /alter table public\.client_errors enable row level security/);
  assert.match(sql, /create policy "client_errors_insert_own"/);
  assert.match(sql, /for insert\s+with check \(auth\.uid\(\) = user_id\)/);
});

test("insert-only: nenhuma política de SELECT/UPDATE/DELETE é criada — a leitura é exclusiva do SQL Editor", () => {
  assert.doesNotMatch(sql, /for select/i);
  assert.doesNotMatch(sql, /for update/i);
  assert.doesNotMatch(sql, /for delete/i);
});

test("nenhuma coluna de PII ou payload: sem e-mail, título, conteúdo ou stack trace no schema", () => {
  for (const forbidden of ["email", "title", "content", "stack", "payload"]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`^\\s*${forbidden}\\s`, "mi"),
      `coluna proibida no schema: ${forbidden}`
    );
  }
});

test("faz bump de schema_version para 23 ao final (convenção de 14_schema_version.sql)", () => {
  assert.match(
    sql,
    /UPDATE public\.schema_version SET version = 23, applied_at = now\(\) WHERE id = 1;/
  );
});
