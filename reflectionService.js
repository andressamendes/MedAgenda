/**
 * reflectionService.js — Coach Inteligente: Reflection Engine (F3.4).
 *
 * Analisa como o usuário executou o planejamento — nunca cria, altera ou
 * agenda nada. Função de leitura pura sobre o histórico: sem DOM, sem
 * chamada a Gemini, sem acesso direto ao Supabase. Toda busca de dados passa
 * por serviços já existentes (activitySessionService, reviewService,
 * categoryService, eventService, profileService) e por blocos puros já
 * expostos por outros motores (aiContextService.computeCategoryBreakdown,
 * timeGoals.calculateGoalPercentage, activitySessionStats.calculateTotalDuration)
 * — nenhum indicador já calculado em outro lugar é recalculado aqui
 * (ETAPA 1/2 da auditoria).
 *
 * Reaproveitamento por auditoria:
 *  - activitySessionService.listByDateRange()      → sessões do período
 *  - reviewService.listPending/listCompleted/listSkipped() → revisões
 *  - categoryService.getCategories() + eventService.getEvents() → catálogo
 *  - aiContextService.computeCategoryBreakdown()   → tempo/última sessão por categoria
 *  - activitySessionStats.calculateTotalDuration() → soma de minutos
 *  - timeGoals.calculateGoalPercentage()           → percentual de meta
 *  - profileService.getProfile()                  → metas configuradas
 *
 * Performance (ETAPA 7): uma única rodada paralela de buscas
 * (getReflectionData()) carrega tudo que os indicadores precisam; toda a
 * análise (computeXIndicators/buildInsights) roda em memória sobre esses
 * dados já carregados — nenhuma consulta é repetida.
 *
 * Erros (ETAPA 8): cada fonte é protegida por _safe(), que reaproveita
 * errorService.handleError() (silencioso — quem decide o que mostrar é a
 * view) e cai para um fallback vazio. Uma fonte indisponível nunca derruba
 * as demais nem o relatório inteiro: o resultado sai com status "partial" e
 * os indicadores cuja fonte falhou simplesmente não geram reflexão (nunca um
 * dado inventado). Quando não há histórico algum, o status é
 * "insufficient_data" — usuário novo, sem nenhuma reflexão prematura.
 */

import { listByDateRange } from "./activitySessionService.js";
import { listPending, listCompleted, listSkipped } from "./reviewService.js";
import { getCategories } from "./categoryService.js";
import { getEvents } from "./eventService.js";
import { getProfile } from "./profileService.js";
import { computeCategoryBreakdown } from "./aiContextService.js";
import { calculateTotalDuration } from "./activitySessionStats.js";
import { calculateGoalPercentage } from "./timeGoals.js";
import { isoDate } from "./utils.js";
import { handleError } from "./errorService.js";

// Janela padrão de análise (ETAPA 3/4): mesma granularidade dos exemplos do
// enunciado ("esta semana", "últimos 7 dias"). Categorias usam uma janela
// mais ampla (30 dias) para não marcar como "negligenciada" uma categoria só
// porque a semana corrente não passou por ela.
const PERIOD_DAYS = 7;
const CATEGORY_WINDOW_DAYS = 30;

// Mesmo piso de "categoria pouco estudada" usado por recommendationEngine.js
// e planningService.js — constante redefinida aqui (não importada, para não
// acoplar o Reflection Engine a esses módulos), mesmo valor por consistência.
const UNDERSTUDIED_DAYS = 5;

// Queda/alta de produtividade só vira reflexão a partir deste piso — uma
// oscilação de poucos minutos não é "a produtividade caiu".
const PRODUCTIVITY_TREND_PCT = 20;

function _startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function _daysAgo(now, days) {
  const d = _startOfDay(now);
  d.setDate(d.getDate() - days);
  return d;
}

function _inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const t = new Date(dateStr);
  return t >= start && t <= end;
}

function _sessionsInRange(sessions, start, end) {
  return (sessions || []).filter(s => _inRange(s.started_at, start, end));
}

async function _safe(promise, fallback, context, errors) {
  try {
    return await promise;
  } catch (err) {
    handleError(err, { context, silent: true });
    errors.push(context);
    return fallback;
  }
}

// ── Blocos puros (testáveis isoladamente, sem I/O) ──────────────────────────

/** Sessões iniciadas/concluídas/canceladas no período, e taxa de conclusão. */
export function computeSessionIndicators(sessions) {
  const list = sessions || [];
  const started = list.length;
  const completed = list.filter(s => s.status === "finished").length;
  const cancelled = list.filter(s => s.status === "cancelled").length;
  return {
    started,
    completed,
    cancelled,
    completionRate: started > 0 ? Math.round((completed / started) * 100) : null,
  };
}

/** Tempo estudado (reaproveita activitySessionStats) vs. tempo planejado (meta configurada). */
export function computeStudyTimeIndicators(sessions, plannedMinutes) {
  const studiedMinutes = calculateTotalDuration(sessions);
  const planned = plannedMinutes || null;
  return {
    studiedMinutes,
    plannedMinutes: planned,
    // Reaproveita timeGoals.calculateGoalPercentage() — mesmo cálculo de
    // percentual de meta já usado pelo Dashboard de Execução (F2.1/F2.2).
    completionPct: planned ? calculateGoalPercentage(studiedMinutes, planned) : null,
  };
}

/** Quantos dos últimos `days` dias bateram a meta diária configurada. */
export function computeGoalDaysIndicators(sessions, dailyGoalMinutes, days, now = new Date()) {
  if (!dailyGoalMinutes) return null;

  let daysMet = 0;
  for (let i = 0; i < days; i++) {
    const dayStart = _daysAgo(now, i);
    const dayEnd = _endOfDay(dayStart);
    const dayMinutes = calculateTotalDuration(_sessionsInRange(sessions, dayStart, dayEnd));
    if (dayMinutes >= dailyGoalMinutes) daysMet += 1;
  }
  return { daysMet, daysTotal: days };
}

/** Revisões concluídas vs. ignoradas no período, e a taxa de revisões ignoradas. */
export function computeReviewIndicators(completedInPeriod, skippedInPeriod) {
  const completedCount = (completedInPeriod || []).length;
  const skippedCount = (skippedInPeriod || []).length;
  const total = completedCount + skippedCount;
  return {
    completedCount,
    skippedCount,
    ignoredRate: total > 0 ? Math.round((skippedCount / total) * 100) : null,
  };
}

/** Categoria mais executada e categoria mais negligenciada, a partir do breakdown já existente. */
export function computeCategoryIndicators(categoryBreakdown) {
  const list = categoryBreakdown || [];
  const studied = list.filter(c => c.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const neglected = list
    .filter(c => c.daysSinceLastStudy === null || c.daysSinceLastStudy >= UNDERSTUDIED_DAYS)
    .sort((a, b) => (b.daysSinceLastStudy ?? Infinity) - (a.daysSinceLastStudy ?? Infinity));

  return {
    mostStudied: studied[0] ?? null,
    mostNeglected: neglected[0] ?? null,
  };
}

/** Direção e variação percentual entre um valor atual e um valor do período anterior. */
export function computeTrend(current, previous) {
  if (!previous || previous <= 0) {
    return { direction: current > 0 ? "up" : "stable", deltaPct: null };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "stable";
  return { direction, deltaPct };
}

// ── Insights estruturados (ETAPA 4/5) ───────────────────────────────────────
// Cada insight sempre traz dadosUtilizados (evidência), periodoAnalisado,
// motivo (por que a conclusão foi tirada) e nivelConfianca — nunca uma
// conclusão sem os quatro. Nenhum insight é produzido quando o indicador que
// o fundamenta está ausente (meta não configurada, sem categorias, etc.).
export function buildInsights(ctx) {
  const insights = [];
  const {
    periodLabel, categoryLabel,
    sessionIndicators, studyTimeIndicators, goalDaysIndicators, reviewIndicators,
    categoryIndicators, minutesTrend, reviewsTrend,
    previousMinutes, previousReviewsCompleted,
  } = ctx;

  if (studyTimeIndicators.completionPct !== null) {
    const pct = studyTimeIndicators.completionPct;
    insights.push({
      id: "plan_completion",
      tipo: pct >= 70 ? "positivo" : "atencao",
      mensagem: `Você concluiu ${pct}% do planejamento ${periodLabel.humano}.`,
      dadosUtilizados: { studiedMinutes: studyTimeIndicators.studiedMinutes, plannedMinutes: studyTimeIndicators.plannedMinutes },
      periodoAnalisado: periodLabel.completo,
      motivo: `Meta de ${studyTimeIndicators.plannedMinutes} minutos configurada; ${studyTimeIndicators.studiedMinutes} minutos estudados no período.`,
      nivelConfianca: "alta",
    });
  }

  if (goalDaysIndicators) {
    const { daysMet, daysTotal } = goalDaysIndicators;
    insights.push({
      id: "goal_days_met",
      tipo: daysMet >= Math.ceil(daysTotal / 2) ? "positivo" : "atencao",
      mensagem: `As metas diárias foram cumpridas em ${daysMet} dos últimos ${daysTotal} dias.`,
      dadosUtilizados: { daysMet, daysTotal },
      periodoAnalisado: periodLabel.completo,
      motivo: "Meta diária configurada; tempo estudado comparado dia a dia contra a meta.",
      nivelConfianca: "alta",
    });
  }

  if (sessionIndicators.started > 0) {
    insights.push({
      id: "session_completion_rate",
      tipo: sessionIndicators.completionRate >= 70 ? "positivo" : "atencao",
      mensagem: `Você iniciou ${sessionIndicators.started} ${sessionIndicators.started === 1 ? "sessão" : "sessões"} e concluiu ${sessionIndicators.completed} (${sessionIndicators.completionRate}%) ${periodLabel.humano}.`,
      dadosUtilizados: { started: sessionIndicators.started, completed: sessionIndicators.completed, cancelled: sessionIndicators.cancelled },
      periodoAnalisado: periodLabel.completo,
      motivo: `${sessionIndicators.completed} de ${sessionIndicators.started} sessões iniciadas foram concluídas no período.`,
      nivelConfianca: sessionIndicators.started >= 3 ? "alta" : "média",
    });
  }

  if (previousMinutes > 0 && minutesTrend.direction === "down" && Math.abs(minutesTrend.deltaPct) >= PRODUCTIVITY_TREND_PCT) {
    insights.push({
      id: "productivity_drop",
      tipo: "atencao",
      mensagem: `A produtividade caiu ${Math.abs(minutesTrend.deltaPct)}% ${periodLabel.humano} em relação ao período anterior.`,
      dadosUtilizados: { currentMinutes: studyTimeIndicators.studiedMinutes, previousMinutes },
      periodoAnalisado: periodLabel.completo,
      motivo: "Tempo estudado no período atual comparado ao período imediatamente anterior de mesma duração.",
      nivelConfianca: "alta",
    });
  } else if (previousMinutes > 0 && minutesTrend.direction === "up" && minutesTrend.deltaPct >= PRODUCTIVITY_TREND_PCT) {
    insights.push({
      id: "productivity_up",
      tipo: "positivo",
      mensagem: `Sua produtividade aumentou ${minutesTrend.deltaPct}% ${periodLabel.humano} em relação ao período anterior.`,
      dadosUtilizados: { currentMinutes: studyTimeIndicators.studiedMinutes, previousMinutes },
      periodoAnalisado: periodLabel.completo,
      motivo: "Tempo estudado no período atual comparado ao período imediatamente anterior de mesma duração.",
      nivelConfianca: "alta",
    });
  }

  if (previousReviewsCompleted > 0 && reviewsTrend.direction === "down") {
    insights.push({
      id: "reviews_drop",
      tipo: "atencao",
      mensagem: `Há redução nas revisões: você concluiu ${reviewIndicators.completedCount} ${periodLabel.humano}, contra ${previousReviewsCompleted} no período anterior.`,
      dadosUtilizados: { current: reviewIndicators.completedCount, previous: previousReviewsCompleted },
      periodoAnalisado: periodLabel.completo,
      motivo: "Comparação entre revisões concluídas no período atual e no período imediatamente anterior de mesma duração.",
      nivelConfianca: "média",
    });
  }

  if (categoryIndicators.mostStudied) {
    const cat = categoryIndicators.mostStudied;
    insights.push({
      id: "top_category",
      tipo: "positivo",
      mensagem: `Você estudou mais ${cat.name} ${categoryLabel.humano}.`,
      dadosUtilizados: { category: cat.name, minutes: cat.minutes },
      periodoAnalisado: categoryLabel.completo,
      motivo: `${cat.name} concentrou o maior tempo estudado (${cat.minutes} minutos) entre as categorias no período.`,
      nivelConfianca: "alta",
    });
  }

  if (categoryIndicators.mostNeglected) {
    const cat = categoryIndicators.mostNeglected;
    const detail = cat.daysSinceLastStudy === null
      ? "você ainda não registrou sessões de estudo nesta categoria"
      : `sem sessões há ${cat.daysSinceLastStudy} dias`;
    insights.push({
      id: "neglected_category",
      tipo: "atencao",
      mensagem: `A categoria ${cat.name} está negligenciada: ${detail}.`,
      dadosUtilizados: { category: cat.name, daysSinceLastStudy: cat.daysSinceLastStudy },
      periodoAnalisado: categoryLabel.completo,
      motivo: "Categoria com maior tempo sem execução entre as cadastradas.",
      nivelConfianca: cat.daysSinceLastStudy === null ? "média" : "alta",
    });
  }

  return insights;
}

function _periodLabel(days, start, end) {
  return {
    humano: `nos últimos ${days} dias`,
    completo: `últimos ${days} dias (${isoDate(start)} a ${isoDate(end)})`,
  };
}

// ── Ponto de entrada único ───────────────────────────────────────────────────

/**
 * Busca (uma única rodada paralela) e analisa o histórico do usuário,
 * devolvendo indicadores e insights explicáveis. Nunca lança: cada fonte tem
 * seu próprio fallback vazio (ETAPA 8), e a ausência total de histórico
 * produz um resultado "insufficient_data" em vez de uma reflexão inventada.
 */
export async function getReflectionData(now = new Date()) {
  const rangeStart = _daysAgo(now, CATEGORY_WINDOW_DAYS - 1);
  const rangeEnd = _endOfDay(now);

  const errors = [];
  const [sessions, pendingReviews, completedReviews, skippedReviews, categories, events, profile] = await Promise.all([
    _safe(listByDateRange(rangeStart.toISOString(), rangeEnd.toISOString()), [], "reflectionService.sessions", errors),
    _safe(listPending(), [], "reflectionService.reviewsPending", errors),
    _safe(listCompleted(), [], "reflectionService.reviewsCompleted", errors),
    _safe(listSkipped(), [], "reflectionService.reviewsSkipped", errors),
    _safe(getCategories(), [], "reflectionService.categories", errors),
    _safe(getEvents(), [], "reflectionService.events", errors),
    _safe(getProfile(), null, "reflectionService.profile", errors),
  ]);

  const hasHistory = sessions.length > 0 || pendingReviews.length > 0 || completedReviews.length > 0 || skippedReviews.length > 0;
  const generatedAt = now.toISOString();

  if (!hasHistory) {
    return {
      status: "insufficient_data",
      period: { days: PERIOD_DAYS, startDate: isoDate(rangeStart), endDate: isoDate(now) },
      resumo: "Ainda não há histórico suficiente para gerar reflexões. Continue registrando suas sessões de estudo e revisões.",
      pontosPositivos: [],
      pontosAtencao: [],
      evolucaoRecente: [],
      insights: [],
      generatedAt,
    };
  }

  const periodStart = _daysAgo(now, PERIOD_DAYS - 1);
  const previousStart = _daysAgo(now, PERIOD_DAYS * 2 - 1);
  const previousEnd = new Date(periodStart.getTime() - 1);

  const periodSessions = _sessionsInRange(sessions, periodStart, rangeEnd);
  const previousPeriodSessions = _sessionsInRange(sessions, previousStart, previousEnd);

  const completedInPeriod = completedReviews.filter(r => _inRange(r.completed_at, periodStart, rangeEnd));
  const previousCompletedReviews = completedReviews.filter(r => _inRange(r.completed_at, previousStart, previousEnd));
  // Revisões puladas não têm um timestamp próprio (ver sql/13_reviews.sql) —
  // usamos updated_at como aproximação do momento em que foram ignoradas.
  const skippedInPeriod = skippedReviews.filter(r => _inRange(r.updated_at, periodStart, rangeEnd));

  const sessionIndicators = computeSessionIndicators(periodSessions);
  const studyTimeIndicators = computeStudyTimeIndicators(periodSessions, profile?.weekly_goal_minutes);
  const goalDaysIndicators = computeGoalDaysIndicators(sessions, profile?.daily_goal_minutes, PERIOD_DAYS, now);
  const reviewIndicators = computeReviewIndicators(completedInPeriod, skippedInPeriod);
  const categoryBreakdown = computeCategoryBreakdown(sessions, events, categories, now);
  const categoryIndicators = computeCategoryIndicators(categoryBreakdown);

  const currentMinutes = calculateTotalDuration(periodSessions);
  const previousMinutes = calculateTotalDuration(previousPeriodSessions);
  const minutesTrend = computeTrend(currentMinutes, previousMinutes);
  const reviewsTrend = computeTrend(completedInPeriod.length, previousCompletedReviews.length);

  const insights = buildInsights({
    periodLabel: _periodLabel(PERIOD_DAYS, periodStart, now),
    categoryLabel: _periodLabel(CATEGORY_WINDOW_DAYS, rangeStart, now),
    sessionIndicators, studyTimeIndicators, goalDaysIndicators, reviewIndicators,
    categoryIndicators, minutesTrend, reviewsTrend,
    previousMinutes, previousReviewsCompleted: previousCompletedReviews.length,
  });

  const pontosPositivos = insights.filter(i => i.tipo === "positivo");
  const pontosAtencao = insights.filter(i => i.tipo === "atencao");
  const evolucaoRecente = insights.filter(i => ["productivity_drop", "productivity_up", "reviews_drop"].includes(i.id));

  return {
    status: errors.length ? "partial" : "ok",
    period: { days: PERIOD_DAYS, startDate: isoDate(periodStart), endDate: isoDate(now) },
    indicators: {
      sessions: sessionIndicators,
      studyTime: studyTimeIndicators,
      goalDays: goalDaysIndicators,
      reviews: reviewIndicators,
      categories: categoryIndicators,
    },
    trends: { minutes: minutesTrend, reviews: reviewsTrend },
    resumo: insights[0]?.mensagem ?? "Sem sinais suficientes para um resumo objetivo ainda — continue registrando suas sessões.",
    pontosPositivos,
    pontosAtencao,
    evolucaoRecente,
    insights,
    generatedAt,
  };
}
