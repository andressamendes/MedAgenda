/**
 * activityDashboardService.js — Dashboard de Execução (F2.1).
 *
 * Responde a uma única pergunta: "Como está minha execução?" — através de
 * indicadores simples de tempo estudado e sessões, hoje/semana/mês. Sem
 * gráficos, sem previsões, sem IA: apenas agregação sobre as mesmas sessões
 * de activity_sessions já existentes (nenhuma tabela nova, nenhum cálculo
 * feito na view).
 *
 * Toda a lógica de agregação mora aqui. A view (activityDashboardView.js) só
 * chama getDashboardData() e renderiza o resultado em cards.
 *
 * Estratégia de uma única consulta (ETAPA 6): "hoje" e "semana" estão sempre
 * contidos no intervalo [início da semana, agora] ∪ [início do mês, agora].
 * Como a semana pode começar no mês anterior (ex.: dia 1 cai numa
 * quinta-feira), buscamos a partir do mais antigo entre início da semana e
 * início do mês — uma única chamada a listByDateRange() cobre hoje, semana e
 * mês. Todos os indicadores são então derivados desse mesmo array em memória
 * (computeDashboardIndicators()), sem nenhuma consulta adicional.
 *
 * "Tempo médio por sessão" e "Maior sessão" são calculados sobre as sessões
 * do mês corrente — o mesmo recorte mais amplo já buscado, mantendo o
 * dashboard inteiro consistente com um único período de referência.
 */

import { listByDateRange } from "./activitySessionService.js";
import {
  calculateTotalDuration,
  calculateSessionCount,
  calculateAverageDuration,
  calculateLongestSession,
} from "./activitySessionStats.js";
import { getProfile } from "./profileService.js";
import { calculateGoalProgress } from "./timeGoals.js";
import { mondayOf } from "./utils.js";

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

function _startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function _inRange(session, start, end) {
  const startedAt = new Date(session.started_at);
  return startedAt >= start && startedAt <= end;
}

/**
 * Deriva todos os indicadores do dashboard a partir de uma única lista de
 * sessões já carregada. Função pura — sem I/O, sem DOM — para ser testável
 * isoladamente e reaproveitada sempre que o conjunto de sessões mudar (ex.:
 * após uma sessão ser finalizada).
 */
export function computeDashboardIndicators(sessions, now = new Date()) {
  const list = sessions || [];

  const dayStart   = _startOfDay(now);
  const dayEnd     = _endOfDay(now);
  const weekStart  = mondayOf(now);
  const monthStart = _startOfMonth(now);

  const todaySessions = list.filter(s => _inRange(s, dayStart, dayEnd));
  const weekSessions  = list.filter(s => _inRange(s, weekStart, dayEnd));
  const monthSessions = list.filter(s => _inRange(s, monthStart, dayEnd));

  return {
    todayMinutes:       calculateTotalDuration(todaySessions),
    weekMinutes:        calculateTotalDuration(weekSessions),
    monthMinutes:       calculateTotalDuration(monthSessions),
    todaySessionsCount: calculateSessionCount(todaySessions),
    weekSessionsCount:  calculateSessionCount(weekSessions),
    monthSessionsCount: calculateSessionCount(monthSessions),
    averageMinutes:     calculateAverageDuration(monthSessions),
    longestSession:     calculateLongestSession(monthSessions),
  };
}

/**
 * Deriva o progresso das três metas de tempo (diária/semanal/mensal) a
 * partir dos indicadores já computados e das metas configuradas em
 * profiles (F2.2). Função pura — mesma ideia de computeDashboardIndicators():
 * separada para ser testável isoladamente e reaproveitada sempre que os
 * indicadores ou as metas mudarem.
 */
export function computeGoalsProgress(indicators, goals = {}) {
  return {
    dailyGoal:   calculateGoalProgress(indicators.todayMinutes, goals?.daily_goal_minutes),
    weeklyGoal:  calculateGoalProgress(indicators.weekMinutes, goals?.weekly_goal_minutes),
    monthlyGoal: calculateGoalProgress(indicators.monthMinutes, goals?.monthly_goal_minutes),
  };
}

/**
 * F11 E11 — minigráfico de tempo estudado por dia, desde a segunda-feira
 * corrente até hoje (1 a 7 pontos, dependendo do dia da semana). Deriva-se
 * das MESMAS sessões já buscadas por getDashboardData() (o intervalo
 * buscado sempre cobre, no mínimo, desde a segunda-feira — ver rangeStart
 * abaixo), então nenhuma consulta nova é feita. Um recorte fixo dos últimos
 * 7 dias corridos (em vez de "desde a segunda") poderia cair fora do que já
 * foi buscado (ex.: hoje é terça — só há dado a partir de segunda) e
 * mostrar zero num dia que na verdade não foi consultado; "desde a
 * segunda" nunca sofre esse risco, porque é exatamente o que
 * getDashboardData() já garante ter buscado.
 */
export function computeWeekSparkline(sessions, now = new Date()) {
  const list = sessions || [];
  const weekStart = mondayOf(now);
  const days = [];
  const cursor = _startOfDay(weekStart);
  const today = _startOfDay(now);
  while (cursor <= today) {
    const dayStart = new Date(cursor);
    const dayEnd = _endOfDay(cursor);
    const dayMinutes = calculateTotalDuration(list.filter(s => _inRange(s, dayStart, dayEnd)));
    days.push({ date: new Date(cursor), minutes: dayMinutes });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Busca as sessões necessárias (uma única consulta) e o perfil (metas
 * configuradas), e retorna os indicadores e o progresso das metas já
 * calculados. Ponto de entrada usado pela view.
 */
export async function getDashboardData(now = new Date()) {
  const weekStart  = mondayOf(now);
  const monthStart = _startOfMonth(now);
  const rangeStart = weekStart < monthStart ? weekStart : monthStart;
  const rangeEnd   = _endOfDay(now);

  const [sessions, profile] = await Promise.all([
    listByDateRange(rangeStart.toISOString(), rangeEnd.toISOString()),
    getProfile(),
  ]);

  const indicators = computeDashboardIndicators(sessions, now);
  const goals = computeGoalsProgress(indicators, profile || {});
  const weekSparkline = computeWeekSparkline(sessions, now);
  return { ...indicators, ...goals, weekSparkline };
}
