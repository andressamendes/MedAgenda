import { supabase, currentUserId } from "./supabase.js";
import { summarizeExecution } from "./activitySessionStats.js";

// ── Acesso a dados (CRUD) ───────────────────────────────────────────────────
// Usado tanto diretamente quanto como base para a camada de domínio abaixo.

export async function createActivitySession(fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getActivitySessionById(id) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActivitySessions() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateActivitySession(id, fields) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteActivitySession(id) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("activity_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user_id);
  if (error) throw error;
}

// ── Domínio: ciclo de vida da sessão de atividade ───────────────────────────
// Erros aqui recebem uma mensagem específica (nunca genérica) e um `code` +
// `context`, seguindo o padrão de avatarService.js de anexar metadados ao
// erro para o errorService.js categorizar/registrar corretamente quando a
// UI futura o capturar — nenhum service chama handleError() diretamente,
// isso é responsabilidade da camada de view (mesmo padrão de eventService e
// categoryService).
function _domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  err.context = "activitySessionService";
  return err;
}

// Sessão em andamento do usuário atual, ou null se nenhuma.
export async function getRunningSession() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .eq("status", "running")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Regra: um usuário nunca pode ter duas sessões "running" simultâneas.
export async function startSession(fields = {}) {
  const running = await getRunningSession();
  if (running) {
    throw _domainError(
      "Já existe uma sessão de atividade em andamento. Finalize ou cancele-a antes de iniciar uma nova.",
      "SESSION_ALREADY_RUNNING"
    );
  }
  return createActivitySession({
    ...fields,
    status: "running",
    started_at: fields.started_at ?? new Date().toISOString(),
  });
}

export async function finishSession(id, endedAt = new Date()) {
  const session = await getActivitySessionById(id);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  if (session.status === "finished" || session.status === "cancelled") {
    throw _domainError(
      "Esta sessão de atividade já foi encerrada e não pode ser finalizada novamente.",
      "SESSION_ALREADY_ENDED"
    );
  }

  const endedAtDate = endedAt instanceof Date ? endedAt : new Date(endedAt);
  const durationMinutes = Math.round((endedAtDate - new Date(session.started_at)) / 60000);
  if (durationMinutes < 0) {
    throw _domainError(
      "A data de término não pode ser anterior ao início da sessão.",
      "INVALID_DURATION"
    );
  }

  return updateActivitySession(id, {
    status: "finished",
    ended_at: endedAtDate.toISOString(),
    duration_minutes: durationMinutes,
  });
}

// Cancelamento não exclui o registro: sessões canceladas continuam existindo
// para auditoria (mesmo status "final" que finished, apenas com outro valor).
export async function cancelSession(id) {
  const session = await getActivitySessionById(id);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  if (session.status === "finished" || session.status === "cancelled") {
    throw _domainError(
      "Esta sessão de atividade já foi encerrada e não pode ser cancelada.",
      "SESSION_ALREADY_ENDED"
    );
  }
  return updateActivitySession(id, { status: "cancelled" });
}

// Limitação atual: o modelo (activity_sessions) não tem campo para acumular
// tempo pausado, então pausar/retomar apenas alterna o status. A duração
// calculada em finishSession() é sempre started_at -> ended_at, incluindo
// qualquer intervalo em pausa. Descontar tempo pausado exigiria novo campo
// e fica para uma etapa futura.
export async function pauseSession(id) {
  const session = await getActivitySessionById(id);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  if (session.status !== "running") {
    throw _domainError("Somente sessões em andamento podem ser pausadas.", "INVALID_STATE");
  }
  return updateActivitySession(id, { status: "paused" });
}

export async function resumeSession(id) {
  const session = await getActivitySessionById(id);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  if (session.status !== "paused") {
    throw _domainError("Somente sessões pausadas podem ser retomadas.", "INVALID_STATE");
  }
  const running = await getRunningSession();
  if (running) {
    throw _domainError(
      "Já existe uma sessão de atividade em andamento. Finalize ou cancele-a antes de retomar esta.",
      "SESSION_ALREADY_RUNNING"
    );
  }
  return updateActivitySession(id, { status: "running" });
}

export async function listByEvent(eventId) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .eq("event_id", eventId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listByDateRange(start, end) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .gte("started_at", start)
    .lte("started_at", end)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return data;
}

// ── F1.8 — Histórico global de sessões ──────────────────────────────────────
// Alimenta activityHistoryView.js. Nunca inclui sessões "running"/"paused" —
// o histórico é só o que já foi encerrado (finished ou cancelled); sessões em
// andamento continuam vivendo só no cronômetro (getRunningSession()).
// Paginado via .range() para nunca carregar o histórico inteiro de uma vez;
// o `status` aceito hoje é "all" | "finished" | "cancelled", mas a assinatura
// em objeto já deixa espaço para novos filtros futuros sem quebrar chamadores.
export async function listSessions({ status = "all", limit = 20, offset = 0 } = {}) {
  const user_id = await currentUserId();
  let query = supabase
    .from("activity_sessions")
    .select("*", { count: "exact" })
    .eq("user_id", user_id);

  query = (status === "finished" || status === "cancelled")
    ? query.eq("status", status)
    : query.in("status", ["finished", "cancelled"]);

  const { data, error, count } = await query
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const sessions = data ?? [];
  const total = count ?? 0;
  return { sessions, total, hasMore: offset + sessions.length < total };
}

// ── F1.7 — Resumo de execução (indicadores na agenda) ───────────────────────

// Resumo de execução de um único compromisso. Reaproveita listByEvent() (já
// existente desde a F1.5) — não introduz consulta nova nem tabela nova.
export async function getEventExecutionSummary(eventId) {
  const sessions = await listByEvent(eventId);
  return summarizeExecution(sessions);
}

// Resumo de execução em lote, para telas de agenda (weekView/calendar) que
// renderizam muitos compromissos de uma vez: uma única consulta com `in`
// evita o problema N+1 de chamar getEventExecutionSummary() por compromisso.
export async function getEventExecutionSummaries(eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .in("event_id", ids)
    .order("started_at", { ascending: false });
  if (error) throw error;

  const byEvent = {};
  for (const id of ids) byEvent[id] = [];
  for (const session of data) {
    if (byEvent[session.event_id]) byEvent[session.event_id].push(session);
  }

  const summaries = {};
  for (const id of ids) summaries[id] = summarizeExecution(byEvent[id]);
  return summaries;
}
