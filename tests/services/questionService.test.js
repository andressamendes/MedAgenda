/**
 * Tests for questionService.js — CRUD puro contra Supabase mockado.
 * Supabase é totalmente mockado: sem rede, sem projeto real.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadQuestionService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../questionService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("createQuestion() insere com o user_id do usuário atual e retorna a linha criada", async (t) => {
  const created = {
    id: "q-1", session_id: "sess-1", question_type: "multiple_choice",
    status: "pending", difficulty: "medium", user_id: "user-123",
  };
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: created, error: null },
  });

  const result = await mod.createQuestion({ session_id: "sess-1", question_type: "multiple_choice" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.table === "questions" && c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].session_id, "sess-1");
});

test("createQuestion() propaga erro do Supabase", async (t) => {
  const { mod } = await loadQuestionService(t, {
    questions: { data: null, error: { message: "insert failed" } },
  });

  await assert.rejects(
    () => mod.createQuestion({ session_id: "sess-1" }),
    (err) => err.message === "insert failed"
  );
});

test("getQuestionById() escopa a busca por id + user_id e retorna a linha", async (t) => {
  const row = { id: "q-1", status: "pending" };
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: row, error: null },
  });

  const result = await mod.getQuestionById("q-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "q-1"], ["user_id", "user-123"]]);
});

test("getQuestionById() retorna null quando não há questão, sem lançar erro", async (t) => {
  const { mod } = await loadQuestionService(t, {
    questions: { data: null, error: null },
  });

  const result = await mod.getQuestionById("q-missing");
  assert.strictEqual(result, null);
});

test("getQuestions() retorna as questões do usuário atual, mais recente primeiro", async (t) => {
  const rows = [{ id: "q-2" }, { id: "q-1" }];
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: rows, error: null },
  });

  const result = await mod.getQuestions();

  assert.deepStrictEqual(result, rows);
  const eqCall = supabase._calls.find(c => c.table === "questions" && c.method === "eq");
  assert.deepStrictEqual(eqCall.args, ["user_id", "user-123"]);
  const orderCall = supabase._calls.find(c => c.table === "questions" && c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["created_at", { ascending: false }]);
});

test("updateQuestion() escopa a atualização por id + user_id e retorna a linha atualizada", async (t) => {
  const updated = { id: "q-1", status: "answered" };
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: updated, error: null },
  });

  const result = await mod.updateQuestion("q-1", { status: "answered" });

  assert.deepStrictEqual(result, updated);
  const eqCalls = supabase._calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "q-1"], ["user_id", "user-123"]]);
});

test("updateQuestion() propaga erro do Supabase", async (t) => {
  const { mod } = await loadQuestionService(t, {
    questions: { data: null, error: { message: "update failed" } },
  });

  await assert.rejects(
    () => mod.updateQuestion("q-1", { status: "answered" }),
    (err) => err.message === "update failed"
  );
});

test("deleteQuestion() escopa a exclusão por id + user_id", async (t) => {
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: null, error: null },
  });

  await mod.deleteQuestion("q-1");

  const eqCalls = supabase._calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "q-1"], ["user_id", "user-123"]]);
});

test("deleteQuestion() lança quando o Supabase reporta erro", async (t) => {
  const { mod } = await loadQuestionService(t, {
    questions: { data: null, error: { message: "not found" } },
  });

  await assert.rejects(
    () => mod.deleteQuestion("q-missing"),
    (err) => err.message === "not found"
  );
});

test("listBySession() filtra por usuário + sessão e ordena por criação ascendente", async (t) => {
  const rows = [{ id: "q-1" }, { id: "q-2" }];
  const { mod, supabase } = await loadQuestionService(t, {
    questions: { data: rows, error: null },
  });

  const result = await mod.listBySession("sess-1");

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["session_id", "sess-1"]]);
  const orderCall = supabase._calls.find(c => c.table === "questions" && c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["created_at", { ascending: true }]);
});

test("listBySession() propaga erro do Supabase", async (t) => {
  const { mod } = await loadQuestionService(t, {
    questions: { data: null, error: { message: "query failed" } },
  });

  await assert.rejects(
    () => mod.listBySession("sess-1"),
    (err) => err.message === "query failed"
  );
});
