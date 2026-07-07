/**
 * Tests for subjectProgressService.js — Progresso por Matéria (F6.9).
 * activitySessionService.js, questionService.js e eventService.js são
 * mockados como módulos inteiros (mesmo padrão de
 * sessionQuestionsService.test.js): o objetivo é validar apenas a
 * agregação, nunca acesso a rede/Supabase.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SERVICE_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTION_SERVICE_SPECIFIER = new URL("../../questionService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;

function loadSubjectProgressService(t, { sessions = [], questions = [], events = [] } = {}) {
  const calls = [];

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActivitySessions: async () => {
        calls.push({ fn: "getActivitySessions" });
        return sessions;
      },
    },
  });

  t.mock.module(QUESTION_SERVICE_SPECIFIER, {
    namedExports: {
      getQuestions: async () => {
        calls.push({ fn: "getQuestions" });
        return questions;
      },
    },
  });

  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      getEvents: async () => {
        calls.push({ fn: "getEvents" });
        return events;
      },
    },
  });

  return import(`../../subjectProgressService.js?t=${Math.random()}`).then((mod) => ({ mod, calls }));
}

function session(overrides = {}) {
  return {
    id: "sess-1",
    event_id: null,
    status: "finished",
    started_at: "2026-01-01T10:00:00.000Z",
    duration_minutes: 60,
    ...overrides,
  };
}

function question(overrides = {}) {
  return {
    id: "q-1",
    subject: "Farmacologia",
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

// ── matéria sem sessões ──────────────────────────────────────────────────

test("getSubjectProgress() retorna agregação zerada para matéria sem sessões nem questões", async (t) => {
  const { mod } = await loadSubjectProgressService(t, { sessions: [], questions: [] });

  const result = await mod.getSubjectProgress("Cardiologia");

  assert.deepStrictEqual(result, {
    subject: "Cardiologia",
    sessionsCount: 0,
    finishedSessionsCount: 0,
    cancelledSessionsCount: 0,
    questionsCount: 0,
    totalMinutes: 0,
    lastSessionAt: null,
    lastQuestionAt: null,
    lastActivityAt: null,
    status: "sem_atividade",
  });
});

// ── matéria com múltiplas sessões ────────────────────────────────────────

test("getSubjectProgress() soma tempo e sessões de uma matéria vinda do evento vinculado", async (t) => {
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", started_at: "2026-01-01T10:00:00.000Z", duration_minutes: 30 }),
    session({ id: "s2", event_id: "ev-1", started_at: "2026-01-03T10:00:00.000Z", duration_minutes: 45 }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions: [], events });

  const result = await mod.getSubjectProgress("Farmacologia");

  assert.strictEqual(result.sessionsCount, 2);
  assert.strictEqual(result.finishedSessionsCount, 2);
  assert.strictEqual(result.totalMinutes, 75);
  assert.strictEqual(result.lastSessionAt, "2026-01-03T10:00:00.000Z");
  assert.strictEqual(result.lastActivityAt, "2026-01-03T10:00:00.000Z");
  assert.strictEqual(result.status, "com_atividade");
});

// ── matéria com questões ─────────────────────────────────────────────────

test("getSubjectProgress() agrega questões pelo campo subject próprio", async (t) => {
  const questions = [
    question({ id: "q1", subject: "Farmacologia", created_at: "2026-01-01T08:00:00.000Z" }),
    question({ id: "q2", subject: "Farmacologia", created_at: "2026-01-05T08:00:00.000Z" }),
    question({ id: "q3", subject: "Cardiologia", created_at: "2026-01-02T08:00:00.000Z" }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions: [], questions });

  const farmacologia = await mod.getSubjectProgress("Farmacologia");
  assert.strictEqual(farmacologia.questionsCount, 2);
  assert.strictEqual(farmacologia.lastQuestionAt, "2026-01-05T08:00:00.000Z");
  assert.strictEqual(farmacologia.lastActivityAt, "2026-01-05T08:00:00.000Z");
  assert.strictEqual(farmacologia.sessionsCount, 0);

  const cardiologia = await mod.getSubjectProgress("Cardiologia");
  assert.strictEqual(cardiologia.questionsCount, 1);
});

// ── múltiplas matérias ───────────────────────────────────────────────────

test("listSubjectsProgress() separa corretamente sessões e questões de matérias diferentes", async (t) => {
  const events = [
    { id: "ev-1", category: "Farmacologia" },
    { id: "ev-2", category: "Cardiologia" },
  ];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", duration_minutes: 20 }),
    session({ id: "s2", event_id: "ev-2", duration_minutes: 40 }),
  ];
  const questions = [
    question({ id: "q1", subject: "Farmacologia" }),
    question({ id: "q2", subject: "Anatomia" }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions, events });

  const result = await mod.listSubjectsProgress();
  const subjects = result.map((entry) => entry.subject);

  assert.deepStrictEqual(subjects.sort(), ["Anatomia", "Cardiologia", "Farmacologia"].sort());

  const farmacologia = result.find((e) => e.subject === "Farmacologia");
  assert.strictEqual(farmacologia.sessionsCount, 1);
  assert.strictEqual(farmacologia.questionsCount, 1);

  const cardiologia = result.find((e) => e.subject === "Cardiologia");
  assert.strictEqual(cardiologia.sessionsCount, 1);
  assert.strictEqual(cardiologia.questionsCount, 0);

  const anatomia = result.find((e) => e.subject === "Anatomia");
  assert.strictEqual(anatomia.sessionsCount, 0);
  assert.strictEqual(anatomia.questionsCount, 1);
});

// ── ordenação ─────────────────────────────────────────────────────────────

test("listSubjectsProgress() ordena matérias alfabeticamente e deixa 'sem matéria' por último", async (t) => {
  const sessions = [
    session({ id: "s1", event_id: null }), // sem matéria
  ];
  const questions = [
    question({ id: "q1", subject: "Farmacologia" }),
    question({ id: "q2", subject: "Anatomia" }),
    question({ id: "q3", subject: "Cardiologia" }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions });

  const result = await mod.listSubjectsProgress();

  assert.deepStrictEqual(
    result.map((e) => e.subject),
    ["Anatomia", "Cardiologia", "Farmacologia", null]
  );
});

// ── agregações (visão geral) ─────────────────────────────────────────────

test("getOverallProgress() soma indicadores de todas as matérias, incluindo 'sem matéria'", async (t) => {
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", duration_minutes: 30, started_at: "2026-01-01T09:00:00.000Z" }),
    session({ id: "s2", event_id: null, duration_minutes: 15, started_at: "2026-01-04T09:00:00.000Z" }),
  ];
  const questions = [
    question({ id: "q1", subject: "Farmacologia", created_at: "2026-01-02T09:00:00.000Z" }),
    question({ id: "q2", subject: null, created_at: "2026-01-03T09:00:00.000Z" }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions, events });

  const overall = await mod.getOverallProgress();

  assert.strictEqual(overall.subjectsCount, 1); // só "Farmacologia" conta como matéria nomeada
  assert.strictEqual(overall.sessionsCount, 2);
  assert.strictEqual(overall.questionsCount, 2);
  assert.strictEqual(overall.totalMinutes, 45);
  assert.strictEqual(overall.lastActivityAt, "2026-01-04T09:00:00.000Z");
});

// ── sessões canceladas ────────────────────────────────────────────────────

test("sessão cancelada conta como sessão mas não soma tempo (duration_minutes nulo)", async (t) => {
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", status: "cancelled", duration_minutes: null }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions: [], events });

  const result = await mod.getSubjectProgress("Farmacologia");

  assert.strictEqual(result.sessionsCount, 1);
  assert.strictEqual(result.cancelledSessionsCount, 1);
  assert.strictEqual(result.finishedSessionsCount, 0);
  assert.strictEqual(result.totalMinutes, 0);
  assert.strictEqual(result.status, "com_atividade");
});

// ── sessões finalizadas ───────────────────────────────────────────────────

test("sessão finalizada soma duration_minutes e conta em finishedSessionsCount", async (t) => {
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", status: "finished", duration_minutes: 50 }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions: [], events });

  const result = await mod.getSubjectProgress("Farmacologia");

  assert.strictEqual(result.finishedSessionsCount, 1);
  assert.strictEqual(result.totalMinutes, 50);
  assert.strictEqual(result.status, "com_atividade");
});

test("sessão em andamento (running/paused) marca a matéria como 'em_andamento'", async (t) => {
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    session({ id: "s1", event_id: "ev-1", status: "running", duration_minutes: null }),
  ];
  const { mod } = await loadSubjectProgressService(t, { sessions, questions: [], events });

  const result = await mod.getSubjectProgress("Farmacologia");

  assert.strictEqual(result.status, "em_andamento");
});

// ── isolamento por usuário ────────────────────────────────────────────────

test("isolamento por usuário é herdado das services subjacentes — nenhuma filtragem própria é adicionada", async (t) => {
  // Simula o contrato real: getActivitySessions/getQuestions/getEvents já
  // escopam por user_id (RLS + filtro explícito). Aqui, o mock representa
  // "usuário atual" retornando apenas os dados que pertenceriam a ele —
  // subjectProgressService não deve buscar nem misturar nada além disso.
  const sessions = [session({ id: "s1", event_id: null, duration_minutes: 10 })];
  const questions = [question({ id: "q1", subject: "Farmacologia" })];
  const { mod, calls } = await loadSubjectProgressService(t, { sessions, questions, events: [] });

  const result = await mod.listSubjectsProgress();

  assert.strictEqual(calls.filter((c) => c.fn === "getActivitySessions").length, 1);
  assert.strictEqual(calls.filter((c) => c.fn === "getQuestions").length, 1);
  assert.strictEqual(calls.filter((c) => c.fn === "getEvents").length, 1);

  const total = result.reduce((sum, e) => sum + e.sessionsCount + e.questionsCount, 0);
  assert.strictEqual(total, 2); // exatamente os dados do "usuário atual", nada a mais
});
