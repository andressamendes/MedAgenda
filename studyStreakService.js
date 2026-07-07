// ── studyStreakService.js — Constância / Study Streak (F6.11) ──────────────
// Projeção pura: deriva sequência de dias estudados a partir de Sessões
// (activitySessionService), seguindo a arquitetura da F6.1 — Constância
// NUNCA é persistida. Não existe tabela "streak", não existe contador salvo
// no banco; a fonte de verdade continua sendo activity_sessions. Mesmo
// padrão de subjectProgressService.js (F6.9): nada aqui grava no banco,
// publica evento ou mantém cache entre chamadas — cada chamada recalcula a
// partir dos fatos correntes.
//
// Fonte de dados: exclusivamente activitySessionService. Nunca consulta
// Questões, Reviews, IA ou Dashboard.
//
// O que NÃO é calculado aqui (pertence ao domínio Conquistas, etapa futura):
// conquistas, níveis, XP, gamificação.

import { getActivitySessions } from "./activitySessionService.js";

// ── Normalização de dia ─────────────────────────────────────────────────────
// "Dia estudado" é o dia civil (local) de started_at, no formato YYYY-MM-DD.
// Usar componentes locais (não toISOString, que é UTC) evita que uma sessão
// iniciada à noite em fusos a oeste de UTC "vaze" para o dia seguinte.

function _dayKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function _addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return _dayKey(date);
}

function _daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// ── Extração dos dias estudados ─────────────────────────────────────────────
// Só sessões "finished" contam. Canceladas e pausadas são ignoradas.
// Múltiplas sessões no mesmo dia contam como um único dia estudado.

function _studyDaySet(sessions) {
  const days = new Set();
  for (const session of sessions || []) {
    if (session.status !== "finished") continue;
    if (!session.started_at) continue;
    days.add(_dayKey(session.started_at));
  }
  return days;
}

function _sortedDays(daySet) {
  return [...daySet].sort();
}

// ── Cálculos ─────────────────────────────────────────────────────────────

// Sequência atual: conta dias consecutivos terminando hoje. Se hoje ainda
// não foi estudado, a sequência pode continuar "viva" até ontem (o dia de
// hoje não é considerado quebra até virar meia-noite) — se ontem também não
// foi estudado, a sequência atual é zero.
function _currentStreak(sortedDays, today) {
  if (sortedDays.length === 0) return 0;
  const daySet = new Set(sortedDays);
  const lastDay = sortedDays[sortedDays.length - 1];
  const gapFromToday = _daysBetween(lastDay, today);
  if (gapFromToday > 1) return 0; // quebrada há mais de um dia

  let streak = 0;
  let cursor = lastDay;
  while (daySet.has(cursor)) {
    streak += 1;
    cursor = _addDays(cursor, -1);
  }
  return streak;
}

// Maior sequência já registrada, considerando todo o histórico de dias.
function _longestStreak(sortedDays) {
  if (sortedDays.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    if (_daysBetween(sortedDays[i - 1], sortedDays[i]) === 1) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
  }
  return longest;
}

// ── API pública ──────────────────────────────────────────────────────────

// Sequência atual de dias estudados consecutivos, terminando hoje (ou ontem,
// se hoje ainda não foi estudado). Zero se a sequência já quebrou.
export async function getCurrentStreak() {
  const sessions = await getActivitySessions();
  const sortedDays = _sortedDays(_studyDaySet(sessions || []));
  return _currentStreak(sortedDays, _dayKey(new Date()));
}

// Maior sequência de dias consecutivos já estudados, em todo o histórico.
export async function getLongestStreak() {
  const sessions = await getActivitySessions();
  const sortedDays = _sortedDays(_studyDaySet(sessions || []));
  return _longestStreak(sortedDays);
}

// Todos os dias estudados (YYYY-MM-DD), em ordem crescente. Cada dia aparece
// uma única vez, mesmo com múltiplas sessões finalizadas nele.
export async function getStudyDays() {
  const sessions = await getActivitySessions();
  return _sortedDays(_studyDaySet(sessions || []));
}

// Calendário de presença: mapa { "YYYY-MM-DD": true } para todos os dias
// estudados — formato pensado para consumo futuro por um widget de
// calendário (heatmap de constância), sem essa etapa conectar nada.
export async function getStudyCalendar() {
  const days = await getStudyDays();
  const calendar = {};
  for (const day of days) calendar[day] = true;
  return calendar;
}

// Resumo consolidado de constância — evita 4 chamadas separadas quando um
// consumidor futuro precisar de tudo de uma vez.
export async function getStreakSummary() {
  const sessions = await getActivitySessions();
  const sortedDays = _sortedDays(_studyDaySet(sessions || []));
  const today = _dayKey(new Date());

  return {
    currentStreak: _currentStreak(sortedDays, today),
    longestStreak: _longestStreak(sortedDays),
    totalStudyDays: sortedDays.length,
    lastStudyDay: sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null,
    daysSinceLastStudy: sortedDays.length > 0
      ? _daysBetween(sortedDays[sortedDays.length - 1], today)
      : null,
  };
}
