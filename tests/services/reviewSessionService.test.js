/**
 * Tests for reviewSessionService.js — orquestração Sessão ↔ Revisão (F6.10).
 * reviewService.js e activitySessionService.js são mockados como módulos
 * inteiros, e supabase.js é mockado para o UPDATE de reviews.session_id —
 * o objetivo é validar apenas a orquestração (quando cada domínio é
 * chamado, com quais argumentos, e quais validações bloqueiam a chamada
 * antes de tocar o banco). A integração real entre os services, contra
 * Supabase mockado, está em
 * tests/integration/reviewSessionIntegration.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";

const REVIEW_SERVICE_SPECIFIER  = new URL("../../reviewService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const SUPABASE_SPECIFIER        = new URL("../../supabase.js", import.meta.url).href;

function loadReviewSessionService(t, {
  review, session, updateResult, updateError = null, listResult, listError = null,
} = {}) {
  const calls = [];

  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      getById: async (id) => {
        calls.push({ fn: "reviewService.getById", args: [id] });
        return typeof review === "function" ? review(id) : review;
      },
    },
  });

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActivitySessionById: async (id) => {
        calls.push({ fn: "activitySessionService.getActivitySessionById", args: [id] });
        return typeof session === "function" ? session(id) : session;
      },
    },
  });

  const builder = {
    update: (fields) => { calls.push({ fn: "supabase.update", args: [fields] }); return builder; },
    eq:     (...args) => { calls.push({ fn: "supabase.eq", args }); return builder; },
    select: (...args) => { calls.push({ fn: "supabase.select", args }); return builder; },
    single: () => Promise.resolve(
      updateError ? { data: null, error: updateError } : { data: updateResult, error: null }
    ),
    order: (...args) => {
      calls.push({ fn: "supabase.order", args });
      return Promise.resolve(
        listError ? { data: null, error: listError } : { data: listResult, error: null }
      );
    },
  };

  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase: { from: (table) => { calls.push({ fn: "supabase.from", args: [table] }); return builder; } },
      currentUserId: async () => "user-123",
    },
  });

  return import(`../../reviewSessionService.js?t=${Math.random()}`).then(mod => ({ mod, calls }));
}

const REVIEW    = { id: "rev-1", user_id: "user-123", event_id: "evt-1", status: "pending", session_id: null };
const SESSION   = { id: "sess-1", user_id: "user-123", status: "finished" };

// ── associateReview() ────────────────────────────────────────────────────

test("associateReview() exige reviewId", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: SESSION });

  await assert.rejects(
    () => mod.associateReview(null, "sess-1"),
    (err) => err.code === "REVIEW_ID_REQUIRED"
  );
});

test("associateReview() exige sessionId", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: SESSION });

  await assert.rejects(
    () => mod.associateReview("rev-1", null),
    (err) => err.code === "SESSION_ID_REQUIRED"
  );
});

test("associateReview() rejeita quando a revisão não existe", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: null, session: SESSION });

  await assert.rejects(
    () => mod.associateReview("rev-missing", "sess-1"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
});

test("associateReview() rejeita quando a sessão não existe", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: null });

  await assert.rejects(
    () => mod.associateReview("rev-1", "sess-missing"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

// getById()/getActivitySessionById() já escopam por user_id — para uma
// revisão/sessão de outro usuário, o service real retorna null; simulamos
// exatamente esse contrato.
test("associateReview() rejeita revisão de outro usuário (getById retorna null)", async (t) => {
  const { mod, calls } = await loadReviewSessionService(t, { review: null, session: SESSION });

  await assert.rejects(
    () => mod.associateReview("rev-of-another-user", "sess-1"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
  assert.deepStrictEqual(
    calls.find(c => c.fn === "reviewService.getById").args,
    ["rev-of-another-user"]
  );
  assert.ok(!calls.some(c => c.fn === "supabase.from"), "não deveria tocar o banco quando a revisão não existe");
});

test("associateReview() rejeita sessão de outro usuário (getActivitySessionById retorna null)", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: null });

  await assert.rejects(
    () => mod.associateReview("rev-1", "sess-of-another-user"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

test("associateReview() associa a revisão à sessão informada", async (t) => {
  const updated = { ...REVIEW, session_id: "sess-1" };
  const { mod, calls } = await loadReviewSessionService(t, {
    review: REVIEW, session: SESSION, updateResult: updated,
  });

  const result = await mod.associateReview("rev-1", "sess-1");

  assert.deepStrictEqual(result, updated);
  const updateCall = calls.find(c => c.fn === "supabase.update");
  assert.deepStrictEqual(updateCall.args[0], { session_id: "sess-1" });
  const eqCalls = calls.filter(c => c.fn === "supabase.eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "rev-1"], ["user_id", "user-123"]]);
});

test("associateReview() propaga erro do banco", async (t) => {
  const { mod } = await loadReviewSessionService(t, {
    review: REVIEW, session: SESSION, updateError: new Error("update failed"),
  });

  await assert.rejects(
    () => mod.associateReview("rev-1", "sess-1"),
    (err) => err.message === "update failed"
  );
});

// BUG 17: status "pending" não implica "sem sessão" — uma revisão associada
// a uma Sessão continua pending até ser concluída/pulada, então nada
// impedia associá-la de novo a outra Sessão, sobrescrevendo session_id
// silenciosamente e "roubando" o vínculo da Sessão anterior.
test("associateReview() rejeita quando a revisão já está associada a outra sessão", async (t) => {
  const alreadyLinked = { ...REVIEW, session_id: "sess-other" };
  const { mod, calls } = await loadReviewSessionService(t, {
    review: alreadyLinked, session: SESSION,
  });

  await assert.rejects(
    () => mod.associateReview("rev-1", "sess-1"),
    (err) => err.code === "REVIEW_ALREADY_LINKED"
  );
  assert.ok(!calls.some(c => c.fn === "supabase.update"), "não deve sobrescrever o vínculo existente");
});

// Reassociar à mesma sessão precisa continuar funcionando — é o caminho de
// retry do BUG 16 (confirmar de novo depois de uma falha parcial reassocia
// a mesma revisão à mesma sessão em vez de recriar).
test("associateReview() permite reassociar a revisão à mesma sessão já vinculada (idempotente)", async (t) => {
  const alreadyLinkedToSameSession = { ...REVIEW, session_id: "sess-1" };
  const updated = { ...alreadyLinkedToSameSession };
  const { mod } = await loadReviewSessionService(t, {
    review: alreadyLinkedToSameSession, session: SESSION, updateResult: updated,
  });

  const result = await mod.associateReview("rev-1", "sess-1");
  assert.deepStrictEqual(result, updated);
});

// ── unlinkReview() ───────────────────────────────────────────────────────

test("unlinkReview() exige reviewId", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: SESSION });

  await assert.rejects(
    () => mod.unlinkReview(null),
    (err) => err.code === "REVIEW_ID_REQUIRED"
  );
});

test("unlinkReview() rejeita quando a revisão não existe", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: null, session: SESSION });

  await assert.rejects(
    () => mod.unlinkReview("rev-missing"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
});

test("unlinkReview() zera session_id da revisão", async (t) => {
  const updated = { ...REVIEW, session_id: null };
  const { mod, calls } = await loadReviewSessionService(t, {
    review: { ...REVIEW, session_id: "sess-1" }, session: SESSION, updateResult: updated,
  });

  const result = await mod.unlinkReview("rev-1");

  assert.deepStrictEqual(result, updated);
  const updateCall = calls.find(c => c.fn === "supabase.update");
  assert.deepStrictEqual(updateCall.args[0], { session_id: null });
});

test("unlinkReview() propaga erro do banco", async (t) => {
  const { mod } = await loadReviewSessionService(t, {
    review: REVIEW, session: SESSION, updateError: new Error("update failed"),
  });

  await assert.rejects(
    () => mod.unlinkReview("rev-1"),
    (err) => err.message === "update failed"
  );
});

// ── getReviewSession() ───────────────────────────────────────────────────

test("getReviewSession() exige revisão existente", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: null, session: SESSION });

  await assert.rejects(
    () => mod.getReviewSession("rev-missing"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
});

test("getReviewSession() retorna null quando a revisão nunca foi associada", async (t) => {
  const { mod, calls } = await loadReviewSessionService(t, {
    review: { ...REVIEW, session_id: null }, session: SESSION,
  });

  const result = await mod.getReviewSession("rev-1");

  assert.strictEqual(result, null);
  assert.ok(!calls.some(c => c.fn === "activitySessionService.getActivitySessionById"));
});

test("getReviewSession() retorna a sessão associada", async (t) => {
  const { mod, calls } = await loadReviewSessionService(t, {
    review: { ...REVIEW, session_id: "sess-1" }, session: SESSION,
  });

  const result = await mod.getReviewSession("rev-1");

  assert.deepStrictEqual(result, SESSION);
  assert.deepStrictEqual(
    calls.find(c => c.fn === "activitySessionService.getActivitySessionById").args,
    ["sess-1"]
  );
});

// ── listBySession() ──────────────────────────────────────────────────────

test("listBySession() exige sessão existente", async (t) => {
  const { mod } = await loadReviewSessionService(t, { review: REVIEW, session: null });

  await assert.rejects(
    () => mod.listBySession("sess-missing"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

test("listBySession() lista as revisões vinculadas à sessão", async (t) => {
  const reviews = [
    { ...REVIEW, id: "rev-1", session_id: "sess-1" },
    { ...REVIEW, id: "rev-2", session_id: "sess-1" },
  ];
  const { mod, calls } = await loadReviewSessionService(t, {
    review: REVIEW, session: SESSION, listResult: reviews,
  });

  const result = await mod.listBySession("sess-1");

  assert.deepStrictEqual(result, reviews);
  const eqCalls = calls.filter(c => c.fn === "supabase.eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["session_id", "sess-1"]]);
  assert.deepStrictEqual(
    calls.find(c => c.fn === "activitySessionService.getActivitySessionById").args,
    ["sess-1"]
  );
});

test("listBySession() propaga erro do banco", async (t) => {
  const { mod } = await loadReviewSessionService(t, {
    review: REVIEW, session: SESSION, listError: new Error("query failed"),
  });

  await assert.rejects(
    () => mod.listBySession("sess-1"),
    (err) => err.message === "query failed"
  );
});
