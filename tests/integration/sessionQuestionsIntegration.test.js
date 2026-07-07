/**
 * F6.8 — Integração real entre Session e Question, via sessionQuestionsService,
 * contra Supabase mockado (sem rede, sem projeto real). Ao contrário de
 * tests/services/sessionQuestionsService.test.js (que mocka os dois services
 * inteiros para isolar a orquestração), esta suíte usa activitySessionService.js
 * e questionService.js reais, só substituindo supabase.js — prova que a
 * integração de fato funciona ponta a ponta, não só que a orquestração chama
 * os mocks certos.
 *
 * activitySessionService.js e questionService.js são importados uma única
 * vez para o arquivo inteiro (nunca com cache-bust): eles importam
 * "./supabase.js" sem query string, então uma instância "bustada" por teste
 * ficaria presa ao supabase mockado vigente no instante do primeiro import
 * (módulos ES não remockados são singletons no processo) — os testes
 * seguintes reusariam esse mock antigo em vez do novo. Por isso o mock de
 * supabase.js aqui não é um objeto novo por teste; é um único objeto cujo
 * conjunto de respostas (`state.responses`) é resetado a cada teste antes
 * de exercitar os services reais, que continuam vivos o arquivo inteiro.
 */
import { test, mock } from "node:test";
import assert from "node:assert";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

const CHAIN_METHODS = [
  "select", "insert", "update", "delete", "upsert",
  "eq", "neq", "gte", "lte", "lt", "gt", "or", "order", "in", "range",
];

function toQueue(responses) {
  return Array.isArray(responses) ? responses.slice() : [responses];
}

function makeQueryBuilder(table, result, calls) {
  const builder = { table };
  for (const method of CHAIN_METHODS) {
    builder[method] = (...args) => { calls.push({ table, method, args }); return builder; };
  }
  builder.single = (...args) => { calls.push({ table, method: "single", args }); return builder; };
  builder.maybeSingle = (...args) => { calls.push({ table, method: "maybeSingle", args }); return builder; };
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const state = { responses: {}, calls: [], queues: {} };

function resetMock(responses) {
  state.responses = responses;
  state.calls = [];
  state.queues = {};
}

const supabaseDouble = {
  get _calls() { return state.calls; },
  from(table) {
    if (!state.queues[table]) state.queues[table] = toQueue(state.responses[table]);
    const queue = state.queues[table];
    const result = queue.length > 1 ? queue.shift() : queue[0];
    return makeQueryBuilder(table, result, state.calls);
  },
};

mock.module(SUPABASE_SPECIFIER, {
  namedExports: {
    supabase: supabaseDouble,
    currentUserId: async () => "user-123",
  },
});

const activitySessionService = await import("../../activitySessionService.js");
const questionService = await import("../../questionService.js");
const sessionQuestionsService = await import("../../sessionQuestionsService.js");

const RUNNING_SESSION = { id: "sess-1", user_id: "user-123", status: "running" };

test("integração: addQuestion() busca a sessão real e insere a questão vinculada a ela", async () => {
  const created = { id: "q-1", session_id: "sess-1", subject: "Farmacologia", user_id: "user-123" };
  resetMock({
    activity_sessions: { data: RUNNING_SESSION, error: null },
    questions:         { data: created, error: null },
  });

  const result = await sessionQuestionsService.addQuestion("sess-1", { subject: "Farmacologia" });

  assert.deepStrictEqual(result, created);
  const sessionLookup = state.calls.find(c => c.table === "activity_sessions" && c.method === "eq");
  assert.ok(sessionLookup, "deveria consultar activity_sessions antes de inserir a questão");
  const insertCall = state.calls.find(c => c.table === "questions" && c.method === "insert");
  assert.strictEqual(insertCall.args[0].session_id, "sess-1");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
});

test("integração: addQuestion() nunca insere questão quando a sessão não existe (isolamento por usuário)", async () => {
  resetMock({
    activity_sessions: { data: null, error: null }, // sessão de outro usuário ou inexistente
  });

  await assert.rejects(
    () => sessionQuestionsService.addQuestion("sess-of-another-user", { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
  assert.ok(
    !state.calls.some(c => c.table === "questions"),
    "nenhuma questão deveria ser tocada quando a sessão não é do usuário atual"
  );
});

test("integração: listQuestions() lê da tabela questions filtrando por sessão + usuário", async () => {
  const rows = [{ id: "q-1", session_id: "sess-1" }, { id: "q-2", session_id: "sess-1" }];
  resetMock({
    activity_sessions: { data: RUNNING_SESSION, error: null },
    questions:         { data: rows, error: null },
  });

  const result = await sessionQuestionsService.listQuestions("sess-1");

  assert.deepStrictEqual(result, rows);
  const eqCalls = state.calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["session_id", "sess-1"]]);
});

test("integração: updateQuestion() atualiza a questão real, escopada por id + usuário", async () => {
  const updated = { id: "q-1", status: "answered" };
  resetMock({
    questions: { data: updated, error: null },
  });

  const result = await sessionQuestionsService.updateQuestion("q-1", { status: "answered" });

  assert.deepStrictEqual(result, updated);
  const eqCalls = state.calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "q-1"], ["user_id", "user-123"]]);
});

test("integração: removeQuestion() exclui a questão real, escopada por id + usuário", async () => {
  resetMock({
    questions: { data: null, error: null },
  });

  await sessionQuestionsService.removeQuestion("q-1");

  const eqCalls = state.calls.filter(c => c.table === "questions" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "q-1"], ["user_id", "user-123"]]);
});

// ── Remoção em cascata ───────────────────────────────────────────────────
// A F6.7 define session_id com ON DELETE CASCADE (sql/15_questions.sql): a
// exclusão de questões ao excluir a sessão é responsabilidade do banco, não
// de código de aplicação. Este teste garante que activitySessionService.js
// (inalterado nesta etapa) não faz nenhuma chamada manual à tabela
// "questions" ao excluir uma sessão — se algum dia alguém "ajudar" o banco
// duplicando a exclusão em JS, este teste quebra.

test("remoção em cascata: deleteActivitySession() nunca toca a tabela questions — a cascata é do banco (ON DELETE CASCADE)", async () => {
  resetMock({
    activity_sessions: { data: null, error: null },
  });

  await activitySessionService.deleteActivitySession("sess-1");

  assert.ok(
    state.calls.every(c => c.table !== "questions"),
    "deleteActivitySession() não deve manipular a tabela questions — a exclusão em cascata é feita pelo FK do banco"
  );
});
