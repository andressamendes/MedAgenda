/**
 * F6.10 — Integração real entre Review e Session, via reviewSessionService,
 * contra Supabase mockado (sem rede, sem projeto real). Ao contrário de
 * tests/services/reviewSessionService.test.js (que mocka reviewService.js e
 * activitySessionService.js inteiros para isolar a orquestração), esta
 * suíte usa os services reais, só substituindo supabase.js — prova que a
 * integração de fato funciona ponta a ponta.
 *
 * reviewService.js e activitySessionService.js são importados uma única
 * vez para o arquivo inteiro (nunca com cache-bust) — mesmo raciocínio de
 * tests/integration/sessionQuestionsIntegration.test.js: módulos ES não
 * remockados são singletons no processo, então um novo import por teste
 * ficaria preso ao mock de supabase vigente no primeiro import. O mock de
 * supabase.js aqui é um único objeto cujo conjunto de respostas
 * (`state.responses`) é resetado a cada teste.
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

const reviewService          = await import("../../reviewService.js");
const activitySessionService = await import("../../activitySessionService.js");
const reviewSessionService   = await import("../../reviewSessionService.js");

const REVIEW  = { id: "rev-1", user_id: "user-123", event_id: "evt-1", status: "pending", session_id: null };
const SESSION = { id: "sess-1", user_id: "user-123", status: "finished" };

test("integração: associateReview() busca revisão e sessão reais e grava session_id em reviews", async () => {
  const associated = { ...REVIEW, session_id: "sess-1" };
  resetMock({
    reviews:           [{ data: REVIEW, error: null }, { data: associated, error: null }],
    activity_sessions: { data: SESSION, error: null },
  });

  const result = await reviewSessionService.associateReview("rev-1", "sess-1");

  assert.deepStrictEqual(result, associated);
  const updateCall = state.calls.find(c => c.table === "reviews" && c.method === "update");
  assert.deepStrictEqual(updateCall.args[0], { session_id: "sess-1" });
  const sessionLookup = state.calls.find(c => c.table === "activity_sessions" && c.method === "eq");
  assert.ok(sessionLookup, "deveria consultar activity_sessions antes de associar");
});

test("integração: associateReview() nunca grava quando a revisão não existe (isolamento por usuário)", async () => {
  resetMock({
    reviews: { data: null, error: null }, // revisão de outro usuário ou inexistente
  });

  await assert.rejects(
    () => reviewSessionService.associateReview("rev-of-another-user", "sess-1"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
  assert.ok(
    !state.calls.some(c => c.table === "reviews" && c.method === "update"),
    "nenhum UPDATE deveria ocorrer quando a revisão não é do usuário atual"
  );
});

test("integração: associateReview() nunca grava quando a sessão não existe (isolamento por usuário)", async () => {
  resetMock({
    reviews:           { data: REVIEW, error: null },
    activity_sessions: { data: null, error: null }, // sessão de outro usuário ou inexistente
  });

  await assert.rejects(
    () => reviewSessionService.associateReview("rev-1", "sess-of-another-user"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
  assert.ok(
    !state.calls.some(c => c.table === "reviews" && c.method === "update"),
    "nenhum UPDATE deveria ocorrer quando a sessão não é do usuário atual"
  );
});

// BUG 17: uma revisão fica "pending" mesmo depois de associada a uma
// Sessão — sem esta trava, uma segunda associação a outra Sessão
// sobrescrevia session_id silenciosamente, roubando o vínculo da primeira.
test("integração: associateReview() rejeita e não grava quando a revisão já está vinculada a outra sessão", async () => {
  const linkedToOther = { ...REVIEW, session_id: "sess-other" };
  resetMock({
    reviews:           { data: linkedToOther, error: null },
    activity_sessions: { data: SESSION, error: null },
  });

  await assert.rejects(
    () => reviewSessionService.associateReview("rev-1", "sess-1"),
    (err) => err.code === "REVIEW_ALREADY_LINKED"
  );
  assert.ok(
    !state.calls.some(c => c.table === "reviews" && c.method === "update"),
    "nenhum UPDATE deveria ocorrer quando a revisão já está associada a outra sessão"
  );
});

test("integração: unlinkReview() zera session_id, escopado por id + usuário", async () => {
  const linked = { ...REVIEW, session_id: "sess-1" };
  const unlinked = { ...REVIEW, session_id: null };
  resetMock({
    reviews: [{ data: linked, error: null }, { data: unlinked, error: null }],
  });

  const result = await reviewSessionService.unlinkReview("rev-1");

  assert.deepStrictEqual(result, unlinked);
  const updateIndex = state.calls.findIndex(c => c.table === "reviews" && c.method === "update");
  assert.deepStrictEqual(state.calls[updateIndex].args[0], { session_id: null });
  // .eq() encadeados logo após o UPDATE (o lookup de existência via getById()
  // roda antes e também gera seus próprios .eq() sobre "reviews").
  const eqCallsAfterUpdate = state.calls
    .slice(updateIndex + 1)
    .filter(c => c.table === "reviews" && c.method === "eq")
    .map(c => c.args);
  assert.deepStrictEqual(eqCallsAfterUpdate, [["id", "rev-1"], ["user_id", "user-123"]]);
});

test("integração: getReviewSession() lê a revisão real e resolve a sessão associada", async () => {
  const linked = { ...REVIEW, session_id: "sess-1" };
  resetMock({
    reviews:           { data: linked, error: null },
    activity_sessions: { data: SESSION, error: null },
  });

  const result = await reviewSessionService.getReviewSession("rev-1");

  assert.deepStrictEqual(result, SESSION);
});

test("integração: getReviewSession() retorna null quando a revisão não tem sessão associada", async () => {
  resetMock({
    reviews: { data: { ...REVIEW, session_id: null }, error: null },
  });

  const result = await reviewSessionService.getReviewSession("rev-1");

  assert.strictEqual(result, null);
  assert.ok(!state.calls.some(c => c.table === "activity_sessions"));
});

// ── ON DELETE SET NULL (sql/16_review_session_link.sql) ─────────────────
// A FK zera reviews.session_id automaticamente quando a Sessão referenciada
// é excluída — comportamento do banco, não de código de aplicação. Este
// teste documenta o contrato do lado da aplicação: getReviewSession() trata
// session_id nulo (seja porque nunca foi associada, seja porque a Sessão
// associada foi excluída e a FK zerou) como "sem sessão associada", nunca
// como erro — e deleteActivitySession() (inalterado nesta etapa) não faz
// nenhuma chamada manual à tabela "reviews".

test("ON DELETE SET NULL: deleteActivitySession() nunca toca a tabela reviews — a atualização é do banco (FK)", async () => {
  resetMock({
    activity_sessions: { data: null, error: null },
  });

  await activitySessionService.deleteActivitySession("sess-1");

  assert.ok(
    state.calls.every(c => c.table !== "reviews"),
    "deleteActivitySession() não deve manipular a tabela reviews — o ON DELETE SET NULL é feito pelo FK do banco"
  );
});

test("ON DELETE SET NULL: getReviewSession() trata session_id nulo pós-exclusão como 'sem sessão', não como erro", async () => {
  // Simula o estado pós-exclusão: a FK já zerou reviews.session_id.
  resetMock({
    reviews: { data: { ...REVIEW, session_id: null }, error: null },
  });

  const result = await reviewSessionService.getReviewSession("rev-1");

  assert.strictEqual(result, null);
});

// ── Independência dos ciclos de vida ─────────────────────────────────────
// Excluir a Revisão nunca deve tocar a Sessão associada — a FK vive
// exclusivamente em reviews.session_id, não há referência no sentido
// inverso (activity_sessions não tem review_id).

test("independência: reviewService.getById() não faz nenhuma chamada à tabela activity_sessions", async () => {
  resetMock({
    reviews: { data: { ...REVIEW, session_id: "sess-1" }, error: null },
  });

  await reviewService.getById("rev-1");

  assert.ok(
    !state.calls.some(c => c.table === "activity_sessions"),
    "reviewService.getById() não deve depender de activity_sessions"
  );
});
