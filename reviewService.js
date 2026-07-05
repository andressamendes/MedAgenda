// ── reviewService.js — Infraestrutura do Sistema de Revisões (F2.3) ──────────
// Apenas a infraestrutura: create/complete/skip/list + geração manual de
// datas (+1/+7/+30 dias). Nenhuma regra de IA, notificação ou recomendação
// automática — isso fica para etapas futuras que consumirão este service.

import { supabase, currentUserId } from "./supabase.js";
import { isoDate, localDate } from "./utils.js";

// Segue o mesmo padrão de _domainError() do activitySessionService.js: erro
// simples com `.code` + `.context` anexados, para o errorService.js
// categorizar quando a camada de view o capturar. O service nunca chama
// handleError() diretamente.
function _domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.context = "reviewService";
  return err;
}

// ── Acesso a dados (CRUD) ───────────────────────────────────────────────────

export async function create(fields) {
  if (!fields?.event_id) {
    throw _domainError("Revisão precisa estar vinculada a um compromisso.", "EVENT_ID_REQUIRED");
  }
  if (!fields?.scheduled_date) {
    throw _domainError("Revisão precisa de uma data prevista.", "SCHEDULED_DATE_REQUIRED");
  }

  const user_id = await currentUserId();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", fields.event_id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) {
    throw _domainError("Compromisso não encontrado.", "EVENT_NOT_FOUND");
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      event_id:       fields.event_id,
      scheduled_date: fields.scheduled_date,
      review_type:    fields.review_type ?? "manual",
      origin:         fields.origin ?? "user",
      status:         "pending",
      user_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getById(id) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Lista as revisões de um compromisso específico, mais recente prevista primeiro.
export async function list(eventId) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", user_id)
    .eq("event_id", eventId)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data;
}

// Revisões pendentes, globais (sem filtro) ou de um compromisso específico.
export async function listPending(eventId) {
  const user_id = await currentUserId();
  let query = supabase
    .from("reviews")
    .select("*")
    .eq("user_id", user_id)
    .eq("status", "pending");
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query.order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data;
}

// Revisões concluídas, globais (sem filtro) ou de um compromisso específico.
// Mesmo formato de listPending() — usado pela Central de Insights (F2.4) para
// o indicador "Revisões concluídas", sem introduzir nenhuma tabela ou cálculo novo.
export async function listCompleted(eventId) {
  const user_id = await currentUserId();
  let query = supabase
    .from("reviews")
    .select("*")
    .eq("user_id", user_id)
    .eq("status", "completed");
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query.order("completed_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function _updateStatus(id, statusFields) {
  const review = await getById(id);
  if (!review) {
    throw _domainError("Revisão não encontrada.", "REVIEW_NOT_FOUND");
  }
  if (review.status !== "pending") {
    throw _domainError("Esta revisão já foi encerrada e não pode ser alterada.", "REVIEW_ALREADY_ENDED");
  }

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("reviews")
    .update(statusFields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Notificação de revisão encerrada ────────────────────────────────────────
// Mesmo pub/sub mínimo em memória de activitySessionService.onSessionFinished():
// permite que outras telas (ex.: Central de Insights, F2.4) recalculem seus
// indicadores assim que uma revisão for concluída ou pulada, sem polling.
const _statusListeners = new Set();

/** Assina notificações de revisão encerrada (completed/skipped). Retorna uma função para cancelar a assinatura. */
export function onReviewStatusChanged(callback) {
  _statusListeners.add(callback);
  return () => _statusListeners.delete(callback);
}

function _notifyReviewStatusChanged(review) {
  for (const callback of _statusListeners) {
    try {
      callback(review);
    } catch (err) {
      console.error("onReviewStatusChanged listener falhou:", err);
    }
  }
}

export async function complete(id, completedAt = new Date()) {
  const completedAtDate = completedAt instanceof Date ? completedAt : new Date(completedAt);
  const review = await _updateStatus(id, {
    status:       "completed",
    completed_at: completedAtDate.toISOString(),
  });
  _notifyReviewStatusChanged(review);
  return review;
}

export async function skip(id) {
  const review = await _updateStatus(id, { status: "skipped" });
  _notifyReviewStatusChanged(review);
  return review;
}

// ── Geração manual (F2.3 — Etapa 5) ─────────────────────────────────────────
// Apenas geração manual por deslocamento fixo de dias a partir de uma data
// base (o próprio event_date, por padrão). Nenhum algoritmo de repetição
// espaçada ou recomendação — isso fica para uma etapa futura.

const DEFAULT_OFFSETS_DAYS = [1, 7, 30];

// Reaproveita isoDate/localDate de utils.js — mesma lógica de datas usada em
// todo o app — em vez de reimplementar aritmética de datas aqui.
function _addDays(baseDateStr, days) {
  const d = localDate(baseDateStr);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export async function generateForEvent(eventId, baseDate, offsetsDays = DEFAULT_OFFSETS_DAYS) {
  if (!eventId) {
    throw _domainError("Revisão precisa estar vinculada a um compromisso.", "EVENT_ID_REQUIRED");
  }
  if (!baseDate) {
    throw _domainError("Data base é obrigatória para gerar revisões.", "BASE_DATE_REQUIRED");
  }

  const created = [];
  for (const days of offsetsDays) {
    const review = await create({
      event_id:       eventId,
      scheduled_date: _addDays(baseDate, days),
      review_type:    "manual",
      origin:         "event",
    });
    created.push(review);
  }
  return created;
}
