// ── sessionQuestionsService.js — Integração Sessão ↔ Questões (F6.8) ────────
// Orquestra activitySessionService (ciclo de vida da Sessão) e
// questionService (CRUD de Questões) — nenhum dos dois é alterado, e nenhum
// CRUD é duplicado aqui. A Sessão continua sem conhecer estatísticas,
// desempenho ou agregação (F6.1): esta camada só garante que uma Questão
// nunca é criada/lida fora do contexto de uma Sessão válida do usuário
// atual. Nenhum evento novo é publicado — a Sessão continua sendo o único
// evento raiz (sessionEventBus.js não é tocado nesta etapa).

import { getActivitySessionById } from "./activitySessionService.js";
import {
  createQuestion,
  updateQuestion as updateQuestionRecord,
  deleteQuestion,
  listBySession,
} from "./questionService.js";

// Mesmo padrão de _domainError() de activitySessionService.js/reviewService.js:
// erro simples com `.code` + `.context` anexados, para o errorService.js
// categorizar quando a camada de view o capturar.
function _domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.context = "sessionQuestionsService";
  return err;
}

// getActivitySessionById() já escopa por user_id — uma sessão de outro
// usuário resulta em `null` aqui, tratada como "sessão inexistente" (a
// mesma distinção que a RLS já garante no banco: do ponto de vista de quem
// pergunta, não existe "sessão de outro usuário", só "sessão que não existe
// para mim").
async function _requireExistingSession(sessionId) {
  const session = await getActivitySessionById(sessionId);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  return session;
}

async function _requireActiveSession(sessionId) {
  const session = await _requireExistingSession(sessionId);
  if (session.status === "finished" || session.status === "cancelled") {
    throw _domainError(
      "Esta sessão de atividade já foi encerrada e não aceita novas questões.",
      "SESSION_ALREADY_ENDED"
    );
  }
  return session;
}

// ── API pública ──────────────────────────────────────────────────────────

// Só aceita novas questões em sessões ainda ativas (running/paused) — uma
// sessão finalizada ou cancelada é um registro fechado, não recebe questões
// novas. FK válida: session_id só chega ao insert depois de confirmado que
// a sessão existe e pertence ao usuário atual.
export async function addQuestion(sessionId, data = {}) {
  if (!sessionId) {
    throw _domainError("Questão precisa estar vinculada a uma sessão.", "SESSION_ID_REQUIRED");
  }
  await _requireActiveSession(sessionId);
  return createQuestion({ ...data, session_id: sessionId });
}

// Listar não exige sessão ativa — o histórico de questões de uma sessão já
// encerrada continua legível, só a criação de questões novas é bloqueada.
export async function listQuestions(sessionId) {
  if (!sessionId) {
    throw _domainError("Questão precisa estar vinculada a uma sessão.", "SESSION_ID_REQUIRED");
  }
  await _requireExistingSession(sessionId);
  return listBySession(sessionId);
}

// Atualização segura: session_id nunca é aceito no payload — uma questão
// não pode ser reatribuída a outra sessão por esta API. Qualquer tentativa
// é descartada silenciosamente, nunca propagada ao banco.
export async function updateQuestion(questionId, fields = {}) {
  const { session_id, ...safeFields } = fields;
  return updateQuestionRecord(questionId, safeFields);
}

// Remoção em cascata: excluir uma sessão de atividade (activitySessionService
// .deleteActivitySession, inalterado) já exclui suas questões no banco, via
// FK ON DELETE CASCADE (sql/15_questions.sql) — nenhuma exclusão manual de
// questões é feita aqui ou em activitySessionService quando uma sessão é
// removida. removeQuestion() cobre apenas a remoção pontual de uma questão
// individual, delegando integralmente a questionService (nenhum CRUD
// duplicado).
export async function removeQuestion(questionId) {
  return deleteQuestion(questionId);
}
