/**
 * progressNarrativeService.js — Progresso narrativo (F14.5).
 *
 * A página Progresso mostrava só grades de stat-cards (~12 números soltos),
 * delegando ao estudante a tarefa de interpretá-los (auditoria F14 §10).
 * Este serviço deriva os três ingredientes de uma interpretação em frases —
 * tempo desta semana comparado à anterior, matéria que concentrou mais
 * tempo e sequência atual — a partir dos MESMOS fatos já usados por
 * activityDashboardService/studyStreakService: nenhuma tabela nova, nenhuma
 * consulta que já não existisse em algum lugar do produto. As únicas duas
 * comparações que nenhuma função anterior fazia (semana atual × anterior;
 * matéria dominante recortada à semana) são as únicas calculadas aqui.
 *
 * Função pura de agregação — sem DOM. A view (activityDashboardView.js) só
 * formata as frases a partir do que aqui é devolvido pronto.
 */

import { listByDateRange } from "./activitySessionService.js";
import { calculateTotalDuration } from "./activitySessionStats.js";
import { getEvents } from "./eventService.js";
import { getStreakSummary } from "./studyStreakService.js";
import { mondayOf } from "./utils.js";

function _endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function _inRange(session, start, end) {
  const startedAt = new Date(session.started_at);
  return startedAt >= start && startedAt <= end;
}

function _normalizeSubject(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Matéria que concentrou mais tempo entre as sessões da semana atual — mesma
// resolução de evento→matéria de subjectProgressService.js (events.category,
// texto livre), mas recortada à semana: subjectProgressService soma o
// histórico inteiro, que não serve para uma frase sobre "esta semana".
// Sessões avulsas (sem event_id) não têm matéria conhecida e são ignoradas
// aqui, mesma regra de subjectProgressService.
async function _dominantCategory(weekSessions) {
  const withEvent = weekSessions.filter(s => s.event_id);
  if (withEvent.length === 0) return null;

  const events = await getEvents();
  const categoryByEventId = new Map((events || []).map(e => [e.id, _normalizeSubject(e.category)]));

  const minutesByCategory = new Map();
  for (const session of withEvent) {
    const category = categoryByEventId.get(session.event_id);
    if (!category) continue;
    minutesByCategory.set(category, (minutesByCategory.get(category) || 0) + (Number(session.duration_minutes) || 0));
  }
  if (minutesByCategory.size === 0) return null;

  const [name, minutes] = [...minutesByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, minutes };
}

/**
 * Ponto de entrada único. Busca as sessões de duas semanas (atual + anterior)
 * numa única consulta — mesma estratégia de intervalo único de
 * activityDashboardService.getDashboardData() — e devolve os indicadores que
 * alimentam a narrativa.
 */
export async function getProgressNarrativeData(now = new Date()) {
  const weekStart = mondayOf(now);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = _endOfDay(new Date(weekStart.getTime() - 1));
  const rangeEnd = _endOfDay(now);

  const [sessions, streak] = await Promise.all([
    listByDateRange(previousWeekStart.toISOString(), rangeEnd.toISOString()),
    getStreakSummary(),
  ]);

  const list = sessions || [];
  const weekSessions         = list.filter(s => _inRange(s, weekStart, rangeEnd));
  const previousWeekSessions = list.filter(s => _inRange(s, previousWeekStart, previousWeekEnd));

  const weekMinutes         = calculateTotalDuration(weekSessions);
  const previousWeekMinutes = calculateTotalDuration(previousWeekSessions);
  const dominantCategory    = await _dominantCategory(weekSessions);

  return {
    weekMinutes,
    previousWeekMinutes,
    dominantCategory,
    currentStreak: streak.currentStreak,
  };
}
