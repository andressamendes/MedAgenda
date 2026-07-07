// ── subjectProgressService.js — Progresso por Matéria (F6.9) ────────────────
// Projeção pura: consolida Sessões (activitySessionService) e Questões
// (questionService) por matéria. Segue a arquitetura da F6.1 — Sessão e
// Questão são fatos, "Progresso por Matéria" é derivado, nunca persistido.
// Nada aqui grava no banco, publica evento ou mantém cache entre chamadas:
// toda vez que uma view futura chamar este service, o resultado é
// recalculado a partir dos fatos correntes (mesmo padrão de
// activityDashboardService.js, que também deriva indicadores em memória a
// partir de activity_sessions sem tocar o banco).
//
// De onde vem a "matéria":
// - Questão já carrega `subject` como campo próprio (15_questions.sql) — a
//   matéria de uma questão é o próprio campo, sem indireção.
// - Sessão de atividade não tem campo de matéria (activity_sessions só tem
//   category_id, uma FK). A única forma de atribuir uma sessão a uma matéria
//   sem inventar coluna nova é através do compromisso que a originou: se a
//   sessão tem event_id, usamos events.category (texto livre, já existente)
//   como nome da matéria — daí eventService entrar como fonte de dados
//   ("quando necessário", conforme especificado). Sessões sem event_id (ex.:
//   sessões avulsas/"quick") não têm matéria conhecida e caem no grupo
//   "sem matéria" (subject === null), junto de questões sem `subject`
//   preenchido.
//
// O que NÃO é calculado aqui (etapas futuras terão serviços próprios):
// percentual de acerto, desempenho, ranking, conquistas, constância.

import { getActivitySessions } from "./activitySessionService.js";
import { getQuestions } from "./questionService.js";
import { getEvents } from "./eventService.js";

// ── Normalização ─────────────────────────────────────────────────────────

function _normalizeSubject(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function _maxDate(a, b) {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  return new Date(a) > new Date(b) ? a : b;
}

// ── Resolução de matéria ─────────────────────────────────────────────────

async function _buildEventSubjectById() {
  const events = await getEvents();
  const byId = new Map();
  for (const event of events || []) {
    byId.set(event.id, _normalizeSubject(event.category));
  }
  return byId;
}

function _sessionSubject(session, eventSubjectById) {
  if (!session.event_id) return null;
  return eventSubjectById.get(session.event_id) ?? null;
}

function _questionSubject(question) {
  return _normalizeSubject(question.subject);
}

// ── Agregação ────────────────────────────────────────────────────────────

function _emptyAggregate(subject) {
  return {
    subject,
    sessionsCount: 0,
    finishedSessionsCount: 0,
    cancelledSessionsCount: 0,
    questionsCount: 0,
    totalMinutes: 0,
    lastSessionAt: null,
    lastQuestionAt: null,
    lastActivityAt: null,
    status: "sem_atividade",
    _hasOpenSession: false,
  };
}

function _finalize(entry) {
  const { _hasOpenSession, ...rest } = entry;
  const lastActivityAt = _maxDate(entry.lastSessionAt, entry.lastQuestionAt);
  const hasActivity = entry.sessionsCount > 0 || entry.questionsCount > 0;
  const status = _hasOpenSession ? "em_andamento" : hasActivity ? "com_atividade" : "sem_atividade";
  return { ...rest, lastActivityAt, status };
}

function _aggregate(sessions, questions, eventSubjectById) {
  const bySubject = new Map();
  const _entry = (subject) => {
    if (!bySubject.has(subject)) bySubject.set(subject, _emptyAggregate(subject));
    return bySubject.get(subject);
  };

  for (const session of sessions) {
    const subject = _sessionSubject(session, eventSubjectById);
    const entry = _entry(subject);
    entry.sessionsCount += 1;
    if (session.status === "finished") entry.finishedSessionsCount += 1;
    if (session.status === "cancelled") entry.cancelledSessionsCount += 1;
    if (session.status === "running" || session.status === "paused") entry._hasOpenSession = true;
    entry.totalMinutes += Number(session.duration_minutes) || 0;
    if (session.started_at) entry.lastSessionAt = _maxDate(entry.lastSessionAt, session.started_at);
  }

  for (const question of questions) {
    const subject = _questionSubject(question);
    const entry = _entry(subject);
    entry.questionsCount += 1;
    if (question.created_at) entry.lastQuestionAt = _maxDate(entry.lastQuestionAt, question.created_at);
  }

  return bySubject;
}

// "Sem matéria" sempre por último — ordenação alfabética (pt-BR) não é
// ranking de desempenho, é só apresentação estável da lista.
function _sortSubjects(entries) {
  return [...entries].sort((a, b) => {
    if (a.subject === null && b.subject === null) return 0;
    if (a.subject === null) return 1;
    if (b.subject === null) return -1;
    return a.subject.localeCompare(b.subject, "pt-BR", { sensitivity: "base" });
  });
}

// ── API pública ──────────────────────────────────────────────────────────

// Progresso de todas as matérias encontradas em Sessões e Questões do
// usuário atual (isolamento herdado de activitySessionService/
// questionService/eventService, que já escopam por user_id — este service
// não faz nenhuma filtragem própria de usuário).
export async function listSubjectsProgress() {
  const [sessions, questions, eventSubjectById] = await Promise.all([
    getActivitySessions(),
    getQuestions(),
    _buildEventSubjectById(),
  ]);

  const bySubject = _aggregate(sessions || [], questions || [], eventSubjectById);
  return _sortSubjects([...bySubject.values()].map(_finalize));
}

// Progresso de uma única matéria. Se a matéria não tiver nenhuma sessão ou
// questão, retorna a agregação zerada (nunca lança erro) — "matéria sem
// sessões" é um resultado válido, não uma exceção.
export async function getSubjectProgress(subject) {
  const normalized = _normalizeSubject(subject);
  const all = await listSubjectsProgress();
  return all.find((entry) => entry.subject === normalized) ?? _finalize(_emptyAggregate(normalized));
}

// Visão consolidada de todas as matérias — não substitui listSubjectsProgress,
// soma os mesmos indicadores em um único total. `subjectsCount` conta apenas
// matérias nomeadas (o grupo "sem matéria" não é uma matéria).
export async function getOverallProgress() {
  const subjects = await listSubjectsProgress();
  return subjects.reduce(
    (acc, entry) => ({
      subjectsCount: acc.subjectsCount + (entry.subject !== null ? 1 : 0),
      sessionsCount: acc.sessionsCount + entry.sessionsCount,
      questionsCount: acc.questionsCount + entry.questionsCount,
      totalMinutes: acc.totalMinutes + entry.totalMinutes,
      lastActivityAt: _maxDate(acc.lastActivityAt, entry.lastActivityAt),
    }),
    { subjectsCount: 0, sessionsCount: 0, questionsCount: 0, totalMinutes: 0, lastActivityAt: null }
  );
}
