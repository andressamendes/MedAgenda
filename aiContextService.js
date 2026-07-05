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

// ── Ponto de entrada único ───────────────────────────────────────────────────

/**
 * Busca e consolida, numa única rodada paralela, tudo que uma recomendação
 * (ou um prompt de IA) precisa saber sobre o estado atual do usuário.
 * Nunca rejeita: cada fonte tem seu próprio fallback vazio.
 */
export async function getAIContext(now = new Date()) {
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
  };
}
