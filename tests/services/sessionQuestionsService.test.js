/**
 * Tests for sessionQuestionsService.js — orquestração Sessão ↔ Questões
 * (F6.8). activitySessionService.js e questionService.js são mockados como
 * módulos inteiros (nenhum acesso a rede/Supabase aqui) — o objetivo é
 * validar apenas a orquestração (quando cada domínio é chamado, com quais
 * argumentos, e quais validações bloqueiam a chamada antes de delegar).
 * A integração real entre os dois services, contra Supabase mockado, está
 * em tests/integration/sessionQuestionsIntegration.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SERVICE_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTION_SERVICE_SPECIFIER = new URL("../../questionService.js", import.meta.url).href;

function loadSessionQuestionsService(t, { session, questionServiceOverrides = {} } = {}) {
  const calls = [];

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActivitySessionById: async (id) => {
        calls.push({ fn: "getActivitySessionById", args: [id] });
        return typeof session === "function" ? session(id) : session;
      },
    },
  });

  t.mock.module(QUESTION_SERVICE_SPECIFIER, {
    namedExports: {
      createQuestion: async (fields) => {
        calls.push({ fn: "createQuestion", args: [fields] });
        return questionServiceOverrides.createQuestion
          ? questionServiceOverrides.createQuestion(fields)
          : { id: "q-1", ...fields };
      },
      updateQuestion: async (id, fields) => {
        calls.push({ fn: "updateQuestion", args: [id, fields] });
        return questionServiceOverrides.updateQuestion
          ? questionServiceOverrides.updateQuestion(id, fields)
          : { id, ...fields };
      },
      deleteQuestion: async (id) => {
        calls.push({ fn: "deleteQuestion", args: [id] });
        return questionServiceOverrides.deleteQuestion
          ? questionServiceOverrides.deleteQuestion(id)
          : undefined;
      },
      listBySession: async (sessionId) => {
        calls.push({ fn: "listBySession", args: [sessionId] });
        return questionServiceOverrides.listBySession
          ? questionServiceOverrides.listBySession(sessionId)
          : [];
      },
      listBySessions: async (sessionIds) => {
        calls.push({ fn: "listBySessions", args: [sessionIds] });
        return questionServiceOverrides.listBySessions
          ? questionServiceOverrides.listBySessions(sessionIds)
          : {};
      },
    },
  });

  return import(`../../sessionQuestionsService.js?t=${Math.random()}`).then(mod => ({ mod, calls }));
}

const RUNNING_SESSION   = { id: "sess-1", user_id: "user-123", status: "running" };
const PAUSED_SESSION    = { id: "sess-1", user_id: "user-123", status: "paused" };
const FINISHED_SESSION  = { id: "sess-1", user_id: "user-123", status: "finished" };
const CANCELLED_SESSION = { id: "sess-1", user_id: "user-123", status: "cancelled" };

// ── addQuestion() ────────────────────────────────────────────────────────

test("addQuestion() exige sessionId", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  await assert.rejects(
    () => mod.addQuestion(null, { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_ID_REQUIRED"
  );
});

test("addQuestion() rejeita quando a sessão não existe", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: null });

  await assert.rejects(
    () => mod.addQuestion("sess-missing", { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

// getActivitySessionById() já escopa por user_id — para uma sessão de outro
// usuário, o service real retorna null; aqui simulamos exatamente esse
// contrato e confirmamos que a orquestração trata isso como "não existe".
test("addQuestion() rejeita sessão de outro usuário (getActivitySessionById retorna null)", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: null });

  await assert.rejects(
    () => mod.addQuestion("sess-of-another-user", { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
  assert.deepStrictEqual(
    calls.find(c => c.fn === "getActivitySessionById").args,
    ["sess-of-another-user"]
  );
});

test("addQuestion() rejeita sessão cancelada", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: CANCELLED_SESSION });

  await assert.rejects(
    () => mod.addQuestion("sess-1", { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

test("addQuestion() rejeita sessão finalizada", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: FINISHED_SESSION });

  await assert.rejects(
    () => mod.addQuestion("sess-1", { subject: "Farmacologia" }),
    (err) => err.code === "SESSION_ALREADY_ENDED"
  );
});

test("addQuestion() cria a questão vinculada à sessão em andamento (FK válida)", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  const result = await mod.addQuestion("sess-1", { subject: "Farmacologia", question_type: "multiple_choice" });

  assert.deepStrictEqual(result, {
    id: "q-1", subject: "Farmacologia", question_type: "multiple_choice", session_id: "sess-1",
  });
  const createCall = calls.find(c => c.fn === "createQuestion");
  assert.strictEqual(createCall.args[0].session_id, "sess-1");
  assert.strictEqual(createCall.args[0].subject, "Farmacologia");
});

test("addQuestion() também aceita sessão pausada", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: PAUSED_SESSION });

  await mod.addQuestion("sess-1", { subject: "Cardiologia" });

  assert.ok(calls.some(c => c.fn === "createQuestion"));
});

test("addQuestion() propaga erro do questionService", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, {
    session: RUNNING_SESSION,
    questionServiceOverrides: {
      createQuestion: async () => { throw new Error("insert failed"); },
    },
  });

  await assert.rejects(
    () => mod.addQuestion("sess-1", { subject: "Farmacologia" }),
    (err) => err.message === "insert failed"
  );
});

// ── listQuestions() ──────────────────────────────────────────────────────

test("listQuestions() exige sessionId", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  await assert.rejects(
    () => mod.listQuestions(null),
    (err) => err.code === "SESSION_ID_REQUIRED"
  );
});

test("listQuestions() rejeita quando a sessão não existe", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, { session: null });

  await assert.rejects(
    () => mod.listQuestions("sess-missing"),
    (err) => err.code === "SESSION_NOT_FOUND"
  );
});

test("listQuestions() funciona mesmo para sessão já finalizada — histórico continua legível", async (t) => {
  const rows = [{ id: "q-1" }, { id: "q-2" }];
  const { mod, calls } = await loadSessionQuestionsService(t, {
    session: FINISHED_SESSION,
    questionServiceOverrides: { listBySession: async () => rows },
  });

  const result = await mod.listQuestions("sess-1");

  assert.deepStrictEqual(result, rows);
  assert.deepStrictEqual(calls.find(c => c.fn === "listBySession").args, ["sess-1"]);
});

// ── updateQuestion() ─────────────────────────────────────────────────────

test("updateQuestion() delega os campos para questionService.updateQuestion", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  await mod.updateQuestion("q-1", { status: "answered" });

  assert.deepStrictEqual(calls.find(c => c.fn === "updateQuestion").args, ["q-1", { status: "answered" }]);
});

test("updateQuestion() descarta session_id do payload — atualização segura, FK imutável", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  await mod.updateQuestion("q-1", { status: "answered", session_id: "sess-other" });

  const updateCall = calls.find(c => c.fn === "updateQuestion");
  assert.deepStrictEqual(updateCall.args, ["q-1", { status: "answered" }]);
});

test("updateQuestion() propaga erro do questionService", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, {
    session: RUNNING_SESSION,
    questionServiceOverrides: {
      updateQuestion: async () => { throw new Error("update failed"); },
    },
  });

  await assert.rejects(
    () => mod.updateQuestion("q-1", { status: "answered" }),
    (err) => err.message === "update failed"
  );
});

// ── removeQuestion() ─────────────────────────────────────────────────────

test("removeQuestion() delega diretamente para questionService.deleteQuestion", async (t) => {
  const { mod, calls } = await loadSessionQuestionsService(t, { session: RUNNING_SESSION });

  await mod.removeQuestion("q-1");

  assert.deepStrictEqual(calls.find(c => c.fn === "deleteQuestion").args, ["q-1"]);
});

test("removeQuestion() propaga erro do questionService", async (t) => {
  const { mod } = await loadSessionQuestionsService(t, {
    session: RUNNING_SESSION,
    questionServiceOverrides: {
      deleteQuestion: async () => { throw new Error("not found"); },
    },
  });

  await assert.rejects(
    () => mod.removeQuestion("q-missing"),
    (err) => err.message === "not found"
  );
});
