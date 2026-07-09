// ── reviewSessionService.js — Integração Sessão ↔ Revisão (F6.10) ──────────
// Orquestra reviewService (ciclo de revisão) e activitySessionService (ciclo
// de vida da Sessão) — nenhum dos dois é alterado, e nenhum CRUD é
// duplicado aqui. A associação é apenas uma referência (sql/
// 16_review_session_link.sql): a Sessão continua sendo o registro factual
// de estudo, a Revisão continua controlando o ciclo de revisão. Nenhuma
// regra de Dashboard, IA, Recommendation, Planning, Reflection, Decision
// Engine, User Memory, Subject Progress ou Conquistas. Nenhum evento novo —
// sessionEventBus.js não é tocado nesta etapa.

import { supabase, currentUserId } from "./supabase.js";
import { getById as getReviewById } from "./reviewService.js";
import { getActivitySessionById } from "./activitySessionService.js";

// Mesmo padrão de _domainError() de reviewService.js/activitySessionService.js/
// sessionQuestionsService.js: erro simples com `.code` + `.context` anexados,
// para o errorService.js categorizar quando a camada de view o capturar.
function _domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.context = "reviewSessionService";
  return err;
}

// getById()/getActivitySessionById() já escopam por user_id — uma revisão
// ou sessão de outro usuário resulta em `null` aqui, tratada como "não
// encontrada" (a mesma distinção que a RLS já garante no banco).
async function _requireExistingReview(reviewId) {
  const review = await getReviewById(reviewId);
  if (!review) {
    throw _domainError("Revisão não encontrada.", "REVIEW_NOT_FOUND");
  }
  return review;
}

async function _requireExistingSession(sessionId) {
  const session = await getActivitySessionById(sessionId);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  return session;
}

// ── API pública ──────────────────────────────────────────────────────────

// Vincula uma Revisão à Sessão que a executou. Ambos precisam existir e
// pertencer ao usuário atual antes do UPDATE chegar ao banco — a FK
// (ON DELETE SET NULL) só garante integridade referencial, não isolamento
// por usuário.
export async function associateReview(reviewId, sessionId) {
  if (!reviewId) {
    throw _domainError("Revisão é obrigatória para associação.", "REVIEW_ID_REQUIRED");
  }
  if (!sessionId) {
    throw _domainError("Sessão é obrigatória para associação.", "SESSION_ID_REQUIRED");
  }

  await _requireExistingReview(reviewId);
  await _requireExistingSession(sessionId);

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .update({ session_id: sessionId })
    .eq("id", reviewId)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Remove a associação sem afetar a Revisão nem a Sessão — ambas continuam
// existindo, só a referência é apagada.
export async function unlinkReview(reviewId) {
  if (!reviewId) {
    throw _domainError("Revisão é obrigatória para desassociação.", "REVIEW_ID_REQUIRED");
  }

  await _requireExistingReview(reviewId);

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .update({ session_id: null })
    .eq("id", reviewId)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Lê a Sessão associada a uma Revisão, se houver. `null` cobre tanto
// "nunca foi associada" quanto "a Sessão associada foi excluída" (a FK já
// zera session_id nesse caso — ON DELETE SET NULL) — dois estados
// indistinguíveis do ponto de vista de quem pergunta, e nenhum dos dois é
// um erro.
export async function getReviewSession(reviewId) {
  const review = await _requireExistingReview(reviewId);
  if (!review.session_id) return null;
  return getActivitySessionById(review.session_id);
}

// Direção inversa de getReviewSession(): lista as Revisões associadas a uma
// Sessão (F8.1 — Diário de Estudos). Só leitura, sem CRUD duplicado — mesmo
// padrão de sessionQuestionsService.listQuestions(), que também exige a
// Sessão existente antes de listar. reviews.session_id é escopado por
// user_id da mesma forma que o UPDATE em associateReview()/unlinkReview().
export async function listBySession(sessionId) {
  await _requireExistingSession(sessionId);

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", user_id)
    .eq("session_id", sessionId)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data;
}
