/**
 * aiContextService.js — Motor de Contexto para IA (F3.2, sobre a base do F3.1).
 *
 * Única fonte de contexto para qualquer funcionalidade de IA — Gemini
 * (services/ai/aiService.js) ou recomendações locais (recommendationEngine.js).
 * Nenhuma View e nenhum prompt deve montar contexto ou consultar serviços
 * diretamente: tudo passa por getAIContext().
 *
 * Reaproveitamento (ETAPA 1/2): todo dado aqui já é computado por um serviço
 * existente — eventService, activityDashboardService (F2.1/F2.2),
 * reviewService (F2.3), activitySessionService + activitySessionStats
 * (F1.x), categoryService. Nenhum cálculo é duplicado; este módulo só
 * consolida e sanitiza.
 *
 * Sanitização (ETAPA 5): todo bloco derivado aqui (reviews, categorias,
 * compromissos atrasados, contadores) sai sem nenhum id, user_id ou campo
 * técnico — apenas o que uma recomendação precisa para citar evidência.
 * `events` é a única exceção: mantém o formato bruto de getEventsByRange()
 * porque os três prompts de IA já existentes (weeklySummary/studySuggestion/
 * scheduleAnalysis, ver services/ai/prompts/*.js) fazem sua própria
 * filtragem/sanitização desses campos — preservado assim para não alterar
 * prompt algum.
 *
 * Performance (ETAPA 6): getAIContext() busca tudo em paralelo (Promise.all),
 * uma única vez por chamada — nenhuma consulta repetida entre os blocos.
 * Cada fonte já entra nesse Promise.all envolvida por _safe(), que captura
 * qualquer rejeição individual (rede, permissão) e resolve para um valor de
 * fallback vazio — então uma falha isolada nunca derruba o Promise.all
 * inteiro nem o contexto: o bloco correspondente cai para seu valor vazio, e
 * o restante segue disponível ("contexto incompleto", ETAPA 7).
 *
 * Memória do Usuário (F3.6, ETAPA 4): o Context Engine é o único consumidor
 * do User Memory Engine (userMemoryService.js) — nenhuma View o consulta
 * diretamente. Para não duplicar nenhuma das consultas acima, getAIContext()
 * nunca chama userMemoryService.getUserMemory() (que faria sua própria busca
 * de sessões/categorias/eventos/revisões); em vez disso, importa a função
 * pura buildUserMemory() e reaproveita exatamente os dados que este módulo
 * já buscou (sessions/events/categories/categoryBreakdown/completedReviews) —
 * zero I/O adicional.
 *
 * Barramento de Eventos (F6.6): o Context Engine é o único módulo de domínio
 * migrado nesta fase — recommendationEngine, planningService, reflectionService,
 * decisionEngine e userMemoryService continuam chamando exclusivamente
 * getAIContext(), sem qualquer alteração, e continuam sem conhecer o
 * barramento (ver RESPONSABILIDADE no ticket F6.6).
 *
 * Estratégia — dirty flag + rebuild preguiçoso (nunca eager reload): views já
 * migradas (Dashboard/Histórico/Insights, F6.3-F6.5) re-renderizam a cada
 * evento porque têm algo na tela agora. getAIContext() não tem tela: é
 * chamado sob demanda por vários módulos (aiPanelView, decisionEngine,
 * eventFormView, services/ai/aiService), às vezes minutos após o último
 * evento. Recalcular imediatamente a cada SessionFinished/Cancelled/Updated
 * refaria o Promise.all inteiro para um consumidor que talvez nunca apareça
 * antes do próximo evento invalidar tudo de novo. Em vez disso, cada evento
 * apenas marca o snapshot como "sujo" (_dirty = true); getAIContext() só
 * refaz o Promise.all quando alguém efetivamente chama a função E o snapshot
 * está sujo — do contrário devolve o último snapshot calculado. Isso também
 * coalesce de graça qualquer sequência de eventos publicados antes da
 * próxima chamada (ex.: SessionUpdated seguido de SessionFinished ao
 * encerrar uma sessão): a flag booleana não acumula, então uma rajada de
 * eventos ainda dispara um único rebuild.
 *
 * Eventos consumidos — SessionFinished, SessionCancelled, SessionUpdated:
 * todo bloco de getAIContext() que depende de sessões (execution, categories,
 * daysSinceLastSession, overdueEvents, memory) deriva exclusivamente de
 * sessões com status "finished" (computeCategoryBreakdown filtra
 * status === "finished"; calculateLastSession e os totais do dashboard idem;
 * computeOverdueEvents usa hasFinishedSession). SessionUpdated é o ponto
 * único de publicação de qualquer updateActivitySession() (edição de
 * duração/categoria de uma sessão já finalizada, por exemplo) — e por isso
 * também já é publicado por finishSession()/cancelSession() internamente,
 * então assiná-lo sozinho já cobriria os outros dois; mesmo assim os três são
 * assinados explicitamente, mesmo padrão redundante-porém-explícito já usado
 * pelo Histórico/Dashboard/Insights (F6.3-F6.5).
 *
 * Eventos NÃO consumidos — SessionStarted, SessionPaused, SessionResumed:
 * nenhum campo devolvido por getAIContext() reflete uma sessão em andamento
 * ou pausada (não há "sessão atual"/"isRunning" no contrato) — apenas
 * sessões finalizadas, como acima. Publicar qualquer um desses três eventos
 * não mudaria um único campo do snapshot, então assiná-los só custaria
 * rebuilds inúteis. Mesma exclusão de SessionPaused/SessionResumed já
 * justificada nas migrações anteriores.
 *
 * Segurança de virada de dia: vários campos do snapshot dependem de `now`
 * (dailyGoal, daysOverdue, daysSinceLastStudy, weekEventsCount). O cache só é
 * reaproveitado quando, além de não estar sujo, o `now` da chamada atual cai
 * no mesmo dia (isoDate) do `now` usado para construir o snapshot — evita
 * devolver "hoje" com os números de ontem para uma aba deixada aberta
 * durante a virada da meia-noite, sem exigir nenhum evento extra para isso.
 *
 * Reset (logout/troca de usuário): resetAIContextService() cancela as
 * assinaturas do barramento e descarta o snapshot — chamada em
 * onBeforeSignOut (script.js), junto dos demais resets. A assinatura é
 * refeita de forma preguiçosa na próxima chamada a getAIContext() (mesmo
 * guard idempotente `_unsubscribers.length > 0` do padrão
 * _subscribeToEventBus() já usado pelas Views migradas) — nenhum módulo
 * precisa chamar um "init" deste serviço.
 */

import { getEventsByRange } from "./eventService.js";
import { getDashboardData } from "./activityDashboardService.js";
import { listPending, listCompleted } from "./reviewService.js";
import { listByDateRange, getEventExecutionSummaries } from "./activitySessionService.js";
import { calculateLastSession } from "./activitySessionStats.js";
import { getCategories } from "./categoryService.js";
import { isPersonalVisible } from "./academicCalendarFilter.js";
import { expandEvents } from "./recurrence.js";
import { isoDate, localDate, mondayOf } from "./utils.js";
import { handleError } from "./errorService.js";
import { buildUserMemory, emptyUserMemoryPreferences } from "./userMemoryService.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

// Superset de janela para os compromissos: cobre os três recortes já usados
// pelos prompts existentes (7/14/30 dias à frente) e ainda alcança o
// suficiente para trás para detectar compromissos atrasados sem execução.
const EVENTS_LOOKBACK_DAYS  = 30;
const EVENTS_LOOKAHEAD_DAYS = 30;

// Janela de sessões usada para o recorte de categorias/última sessão geral —
// independente da janela de compromissos.
const SESSIONS_LOOKBACK_DAYS = 60;

function _startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _daysBetween(later, earlier) {
  return Math.round((_startOfDay(later) - _startOfDay(earlier)) / 86400000);
}

async function _safe(promise, fallback, context) {
  try {
    return await promise;
  } catch (err) {
    handleError(err, { context, silent: true });
    return fallback;
  }
}

// ── Blocos puros (testáveis isoladamente, sem I/O) ──────────────────────────

/** Quantidade de ocorrências (já expandindo recorrência) agendadas na semana atual. */
export function computeWeekEventsCount(events, now = new Date()) {
  const monday = mondayOf(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return expandEvents(events || [], isoDate(monday), isoDate(sunday)).length;
}

// Resolve o nome da categoria de uma sessão: sessões vinculadas a um
// compromisso (event_id) herdam a categoria do compromisso (texto livre,
// mesmo campo usado pela agenda); sessões avulsas usam category_id (FK para
// categories). Mesma resolução de activityHistoryView.js._resolveMeta(), sem
// duplicar a lógica de categoryService/eventService.
function _resolveSessionCategoryName(session, eventsById, categoriesById) {
  if (session.event_id) return eventsById.get(session.event_id)?.category ?? null;
  if (session.category_id) return categoriesById.get(session.category_id)?.name ?? null;
  return null;
}

/**
 * Tempo estudado e data da última sessão por categoria, a partir da mesma
 * lista de sessões já carregada (SESSIONS_LOOKBACK_DAYS). Inclui todas as
 * categorias do usuário — mesmo as sem nenhuma sessão no período — para que
 * "categorias pouco estudadas" possa avaliar o catálogo inteiro.
 */
export function computeCategoryBreakdown(sessions, events, categories, now = new Date()) {
  const eventsById     = new Map((events || []).map(e => [e.id, e]));
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));

  const byName = new Map();
  for (const s of (sessions || [])) {
    if (s.status !== "finished") continue;
    const name = _resolveSessionCategoryName(s, eventsById, categoriesById);
    if (!name) continue;
    const entry = byName.get(name) || { minutes: 0, lastStudiedDate: null };
    entry.minutes += s.duration_minutes || 0;
    if (!entry.lastStudiedDate || new Date(s.started_at) > new Date(entry.lastStudiedDate)) {
      entry.lastStudiedDate = s.started_at;
    }
    byName.set(name, entry);
  }

  return (categories || []).map(cat => {
    const entry = byName.get(cat.name);
    const lastStudiedDate = entry?.lastStudiedDate ?? null;
    return {
      name: cat.name,
      minutes: entry?.minutes ?? 0,
      lastStudiedDate,
      daysSinceLastStudy: lastStudiedDate ? _daysBetween(now, lastStudiedDate) : null,
    };
  });
}

/**
 * Compromissos não recorrentes cuja data já passou e que nunca tiveram uma
 * sessão finalizada — a partir do mesmo resumo de execução em lote já usado
 * pela agenda e pela Central de Insights (activitySessionService.
 * getEventExecutionSummaries(), F1.7/F2.4). Eventos recorrentes ficam de
 * fora: o vínculo sessão↔compromisso é pelo evento-base, não por ocorrência,
 * então não há como saber qual ocorrência específica ficou sem execução.
 */
export function computeOverdueEvents(events, executionSummaries, now = new Date()) {
  const todayStr = isoDate(now);
  return (events || [])
    .filter(e => (!e.recurrence_type || e.recurrence_type === "none") && e.event_date < todayStr)
    .filter(e => !executionSummaries[e.id]?.hasFinishedSession)
    .map(e => ({
      title:       e.title,
      category:    e.category ?? null,
      date:        e.event_date,
      daysOverdue: _daysBetween(now, localDate(e.event_date)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Revisões pendentes sanitizadas (sem id/event_id), com dias de atraso já calculados. */
export function sanitizePendingReviews(reviews, now = new Date()) {
  const todayStr = isoDate(now);
  return (reviews || []).map(r => ({
    scheduledDate: r.scheduled_date,
    daysOverdue:   r.scheduled_date < todayStr ? _daysBetween(now, localDate(r.scheduled_date)) : 0,
  }));
}

// ── Barramento de Eventos (F6.6) — cache + dirty flag ────────────────────────
// Ver justificativa completa no cabeçalho do módulo.

let _cache      = null; // último snapshot calculado (objeto devolvido por getAIContext())
let _cachedNow  = null; // `now` usado para construir _cache — ver "segurança de virada de dia"
let _dirty      = true; // sem snapshot ainda: força o primeiro rebuild
let _unsubscribers = [];

function _markDirty() {
  _dirty = true;
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — chamadas repetidas a getAIContext() são no-op aqui
  _unsubscribers = [
    subscribe(SESSION_EVENTS.FINISHED, _markDirty),
    subscribe(SESSION_EVENTS.CANCELLED, _markDirty),
    subscribe(SESSION_EVENTS.UPDATED, _markDirty),
  ];
}

/**
 * Cancela a assinatura do barramento e descarta o snapshot em cache. Uso:
 * logout / reset / troca de usuário (ver script.js onBeforeSignOut) — sem
 * isso, o cache e os listeners registrados em _subscribeToEventBus()
 * sobreviveriam à troca de sessão e poderiam devolver o contexto de IA de um
 * usuário para outro. A próxima chamada a getAIContext() reassina o
 * barramento e reconstrói o snapshot do zero, de forma preguiçosa.
 */
export function resetAIContextService() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  _cache     = null;
  _cachedNow = null;
  _dirty     = true;
}

// ── Ponto de entrada único ───────────────────────────────────────────────────

/**
 * Busca e consolida, numa única rodada paralela, tudo que uma recomendação
 * (ou um prompt de IA) precisa saber sobre o estado atual do usuário.
 * Nunca rejeita: cada fonte tem seu próprio fallback vazio.
 *
 * F6.6: devolve o snapshot em cache sempre que ele ainda não foi invalidado
 * por um evento do barramento (_dirty === false) e cai no mesmo dia do `now`
 * atual — só refaz a consolidação completa quando uma dessas condições falha.
 */
export async function getAIContext(now = new Date()) {
  _subscribeToEventBus();

  if (!_dirty && _cache && _cachedNow && isoDate(_cachedNow) === isoDate(now)) {
    return _cache;
  }

  const context = await _buildAIContext(now);
  _cache     = context;
  _cachedNow = now;
  _dirty     = false;
  return context;
}

async function _buildAIContext(now) {
  const eventsStart = new Date(now); eventsStart.setDate(eventsStart.getDate() - EVENTS_LOOKBACK_DAYS);
  const eventsEnd   = new Date(now); eventsEnd.setDate(eventsEnd.getDate() + EVENTS_LOOKAHEAD_DAYS);
  const sessionsStart = new Date(now); sessionsStart.setDate(sessionsStart.getDate() - SESSIONS_LOOKBACK_DAYS);

  const personalVisible = isPersonalVisible();

  const [events, dashboard, pendingReviews, completedReviews, sessions, categories] = await Promise.all([
    personalVisible
      ? _safe(getEventsByRange(isoDate(eventsStart), isoDate(eventsEnd)), [], "aiContextService.events")
      : Promise.resolve([]),
    _safe(getDashboardData(now), null, "aiContextService.dashboard"),
    _safe(listPending(), [], "aiContextService.reviewsPending"),
    _safe(listCompleted(), [], "aiContextService.reviewsCompleted"),
    _safe(listByDateRange(sessionsStart.toISOString(), now.toISOString()), [], "aiContextService.sessions"),
    _safe(getCategories(), [], "aiContextService.categories"),
  ]);

  // Resumo de execução em lote apenas para os compromissos candidatos a
  // "atrasado" (não recorrentes, já vencidos) — evita buscar o resumo de
  // todos os compromissos da janela quando só uma fração pode estar atrasada.
  const todayStr = isoDate(now);
  const overdueCandidateIds = events
    .filter(e => (!e.recurrence_type || e.recurrence_type === "none") && e.event_date < todayStr)
    .map(e => e.id);
  const executionSummaries = overdueCandidateIds.length
    ? await _safe(getEventExecutionSummaries(overdueCandidateIds), {}, "aiContextService.executionSummaries")
    : {};

  const categoryBreakdown = computeCategoryBreakdown(sessions, events, categories, now);
  const lastSession = calculateLastSession(sessions);

  const dailyGoal   = dashboard?.dailyGoal   ?? { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
  const weeklyGoal  = dashboard?.weeklyGoal  ?? dailyGoal;
  const monthlyGoal = dashboard?.monthlyGoal ?? dailyGoal;

  // Memória do Usuário (F3.6) — ver nota de performance no cabeçalho: reusa
  // exatamente os dados já buscados acima, nunca uma nova consulta.
  const hasMemoryHistory = sessions.length > 0 || completedReviews.length > 0;
  let memory;
  try {
    memory = hasMemoryHistory
      ? {
          status: "ok",
          preferences: buildUserMemory({
            sessions, events, categories, categoryBreakdown, completedReviews,
            dailyGoalMinutes: dailyGoal.goalMinutes,
            windowDays: SESSIONS_LOOKBACK_DAYS,
          }, now),
          generatedAt: now.toISOString(),
        }
      : { status: "insufficient_data", preferences: emptyUserMemoryPreferences(), generatedAt: now.toISOString() };
  } catch (err) {
    handleError(err, { context: "aiContextService.memory", silent: true });
    memory = { status: "insufficient_data", preferences: emptyUserMemoryPreferences(), generatedAt: now.toISOString() };
  }

  return {
    events, // contrato preservado para os prompts existentes — ver cabeçalho do módulo
    hasAnyEvents:    events.length > 0,
    weekEventsCount: computeWeekEventsCount(events, now),

    execution: {
      todayMinutes:       dashboard?.todayMinutes       ?? 0,
      weekMinutes:        dashboard?.weekMinutes         ?? 0,
      monthMinutes:       dashboard?.monthMinutes        ?? 0,
      todaySessionsCount: dashboard?.todaySessionsCount  ?? 0,
      weekSessionsCount:  dashboard?.weekSessionsCount   ?? 0,
      monthSessionsCount: dashboard?.monthSessionsCount  ?? 0,
      dailyGoal, weeklyGoal, monthlyGoal,
    },

    reviews: {
      pendingCount:   pendingReviews.length,
      pending:        sanitizePendingReviews(pendingReviews, now),
      completedCount: completedReviews.length,
    },

    categories: categoryBreakdown,
    hasStudyHistory: categoryBreakdown.some(c => c.lastStudiedDate !== null),
    daysSinceLastSession: lastSession ? _daysBetween(now, new Date(lastSession.started_at)) : null,

    overdueEvents: computeOverdueEvents(events, executionSummaries, now),

    memory, // preferências observadas (F3.6) — ver userMemoryService.js
  };
}
