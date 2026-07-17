import { supabase, currentUserId } from "./supabase.js";
import { summarizeExecution } from "./activitySessionStats.js";
import { SESSION_EVENTS, publish, subscribe } from "./sessionEventBus.js";

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

// Toda atualização estrutural da sessão passa por aqui — por isso é o único
// ponto que publica SessionUpdated (evento genérico, "algo nesta sessão
// mudou"). As transições de ciclo de vida (pausar/continuar/finalizar/
// cancelar, abaixo) chamam esta função e, além do SessionUpdated que ela já
// publica, publicam também seu evento específico — um assinante interessado
// só na semântica ("a sessão foi pausada") usa o evento específico; um
// assinante que só quer saber "a sessão mudou, releia o que precisar" usa
// SessionUpdated sem precisar conhecer cada transição possível.
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
  publish(SESSION_EVENTS.UPDATED, data);
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

// AUD-001 — última linha de defesa contra a corrida entre startSession()/
// resumeSession() concorrentes (duas abas, dois dispositivos): o índice único
// parcial activity_sessions_one_running_per_user (sql/19_activity_sessions_
// running_unique.sql) rejeita, no banco, uma segunda linha "running" para o
// mesmo user_id — mesmo quando a checagem getRunningSession() de ambas as
// chamadas já passou antes que o INSERT/UPDATE concorrente fosse confirmado.
// Reconhecida pelo código de erro do Postgres (23505 = unique_violation) e
// pelo nome do próprio índice, nunca por texto genérico da mensagem, para não
// mascarar outra violação de unicidade não relacionada.
function _isRunningConstraintViolation(error) {
  return error?.code === "23505"
    && String(error?.message ?? "").includes("activity_sessions_one_running_per_user");
}

function _sessionAlreadyRunningError(action) {
  return _domainError(
    `Já existe uma sessão de atividade em andamento. Finalize ou cancele-a antes de ${action}.`,
    "SESSION_ALREADY_RUNNING"
  );
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

// Sessão "running" OU "paused" do usuário atual, ou null se nenhuma (F7.8 —
// recuperação ao reabrir o app: diferente de getRunningSession(), também
// enxerga sessões pausadas, que continuam sem cronômetro rodando mas ainda
// não foram encerradas). Só leitura — nenhuma regra de negócio nova; as
// regras de transição continuam só em startSession()/resumeSession() (que
// seguem checando getRunningSession(), sem alteração de comportamento).
export async function getActiveSession() {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("user_id", user_id)
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// Regra: um usuário nunca pode ter duas sessões "running" simultâneas.
export async function startSession(fields = {}) {
  const running = await getRunningSession();
  if (running) {
    throw _sessionAlreadyRunningError("iniciar uma nova");
  }
  let created;
  try {
    created = await createActivitySession({
      ...fields,
      status: "running",
      started_at: fields.started_at ?? new Date().toISOString(),
    });
  } catch (error) {
    if (_isRunningConstraintViolation(error)) {
      throw _sessionAlreadyRunningError("iniciar uma nova");
    }
    throw error;
  }
  publish(SESSION_EVENTS.STARTED, created);
  return created;
}

// F10 #3.4 — `notes` (Observações da sessão, digitadas no resumo de
// encerramento) antes só existiam na variável local de studySessionView.js,
// nunca gravadas em activity_sessions.notes (coluna já existente desde
// sql/11_activity_sessions.sql) — o texto era mostrado uma única vez, na
// tela "Sessão concluída" que este item remove, e depois disso se perdia
// para sempre. Persistido aqui para que o Diário de Estudos (studyJournalView.js)
// continue sendo capaz de exibi-lo depois que a tela de resumo deixar de existir.
export async function finishSession(id, endedAt = new Date(), notes) {
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
  const rawMs = endedAtDate - new Date(session.started_at);
  if (rawMs < 0) {
    throw _domainError(
      "A data de término não pode ser anterior ao início da sessão.",
      "INVALID_DURATION"
    );
  }

  // Tempo líquido (F7.7): desconta paused_ms (pausas já concluídas) e, se a
  // sessão está sendo finalizada diretamente a partir de "paused" (sem
  // retomar antes), também o intervalo da pausa corrente (started em
  // paused_at até agora) — mesma soma que resumeSession() faria.
  const currentPauseMs = session.status === "paused" && session.paused_at
    ? Math.max(0, endedAtDate - new Date(session.paused_at))
    : 0;
  const totalPausedMs = (session.paused_ms || 0) + currentPauseMs;
  const durationMinutes = Math.max(0, Math.round((rawMs - totalPausedMs) / 60000));

  const trimmedNotes = notes?.trim();
  const finished = await updateActivitySession(id, {
    status: "finished",
    ended_at: endedAtDate.toISOString(),
    duration_minutes: durationMinutes,
    paused_at: null,
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  });
  publish(SESSION_EVENTS.FINISHED, finished);
  return finished;
}

// ── Notificação de sessão finalizada (compatibilidade, F1.3) ───────────────
// onSessionFinished() é o pub/sub original desta etapa — hoje um adaptador
// fino sobre o barramento de eventos (F6.2): assina SESSION_EVENTS.FINISHED
// e repassa só `session` ao callback, preservando exatamente o contrato de
// antes (assinatura, retorno, e o próprio `session` sem o envelope
// { session, timestamp, eventType } do barramento). Mantido apenas para
// módulos ainda não migrados para o barramento — activityDashboardView.js
// (F6.4), activityHistoryView.js (F6.3) e insightsView.js (F6.5) já assinam
// SESSION_EVENTS diretamente e não usam mais este adaptador.
export function onSessionFinished(callback) {
  return subscribe(SESSION_EVENTS.FINISHED, ({ session }) => callback(session));
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
  const cancelled = await updateActivitySession(id, { status: "cancelled" });
  publish(SESSION_EVENTS.CANCELLED, cancelled);
  return cancelled;
}

// Tempo líquido (F7.7): paused_at marca o início da pausa corrente;
// paused_ms acumula pausas já concluídas. pauseSession() só grava paused_at
// (o intervalo ainda está "aberto"); resumeSession() fecha esse intervalo,
// somando-o a paused_ms, e limpa paused_at. finishSession() usa os dois
// campos para descontar o tempo pausado de duration_minutes, inclusive
// quando a sessão é finalizada diretamente a partir de "paused" (sem
// retomar antes) — ver sql/17_activity_sessions_paused_time.sql.
export async function pauseSession(id) {
  const session = await getActivitySessionById(id);
  if (!session) {
    throw _domainError("Sessão de atividade não encontrada.", "SESSION_NOT_FOUND");
  }
  if (session.status !== "running") {
    throw _domainError("Somente sessões em andamento podem ser pausadas.", "INVALID_STATE");
  }
  const paused = await updateActivitySession(id, {
    status: "paused",
    paused_at: new Date().toISOString(),
  });
  publish(SESSION_EVENTS.PAUSED, paused);
  return paused;
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
    throw _sessionAlreadyRunningError("retomar esta");
  }
  const currentPauseMs = session.paused_at
    ? Math.max(0, Date.now() - new Date(session.paused_at).getTime())
    : 0;
  let resumed;
  try {
    resumed = await updateActivitySession(id, {
      status: "running",
      paused_at: null,
      paused_ms: (session.paused_ms || 0) + currentPauseMs,
    });
  } catch (error) {
    if (_isRunningConstraintViolation(error)) {
      throw _sessionAlreadyRunningError("retomar esta");
    }
    throw error;
  }
  publish(SESSION_EVENTS.RESUMED, resumed);
  return resumed;
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
