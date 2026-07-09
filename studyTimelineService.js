/**
 * studyTimelineService.js — Linha do Tempo da Evolução (F8.5).
 *
 * Camada de agregação puramente em memória sobre as entradas já carregadas
 * pelo Diário de Estudos (studyJournalView.js/F8.1-F8.4): cada entrada é
 * `{ session, meta, extras }`, o mesmo formato já resolvido para os cartões
 * de sessão (session vem de activitySessionService/listSessions(), extras
 * já contém as questões/revisões buscadas uma única vez por sessão). Nenhuma
 * função aqui faz I/O — mesma filosofia de computeDashboardIndicators() em
 * activityDashboardService.js (F2.1): separar o cálculo puro do ponto onde
 * os dados são buscados, para ser testável isoladamente e reaproveitado sem
 * nenhuma consulta adicional.
 *
 * Isso é o que permite F8.5 cumprir "nenhuma consulta adicional" e "resumos
 * consideram apenas as sessões atualmente visíveis após a filtragem": em vez
 * de chamar studyStreakService/subjectProgressService/questionService (que
 * buscam TODAS as sessões/questões do usuário do banco a cada chamada), este
 * módulo reimplementa os mesmos conceitos de derivação dessas services —
 * "dia estudado" como o dia civil local de started_at (studyStreakService),
 * "matéria" como meta.subject já resolvido pelo Diário (subjectProgressService),
 * "maior sequência" como dias consecutivos sem lacuna (studyStreakService)
 * — só que sobre o subconjunto de entradas já em memória e já filtrado, sem
 * tocar o banco de novo. Agrupamento semanal usa mondayOf()/isoDate() de
 * utils.js, a mesma dupla já usada por activityDashboardService.js para
 * "semana" — nenhum cálculo de número de semana ISO é inventado aqui.
 */

import { pad, isoDate, localDate, mondayOf } from "./utils.js";

// ── Resumo diário ────────────────────────────────────────────────────────
// Recebe as entradas de um único grupo de dia (já formadas por
// studyJournalView/_buildDayGroups) e deriva tempo líquido, contagem de
// sessões, questões e revisões, e as matérias estudadas — tudo já presente
// em cada entrada, nenhum campo novo buscado.

export function summarizeDayEntries(entries) {
  const list = entries || [];

  const totalMinutes = list.reduce((sum, e) => sum + (e.session.duration_minutes || 0), 0);
  const questionsCount = list.reduce((sum, e) => sum + (e.extras?.questions?.length || 0), 0);
  const reviewsCount = list.reduce((sum, e) => sum + (e.extras?.reviews?.length || 0), 0);

  const subjects = Array.from(new Set(list.map(e => e.meta?.subject).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  return {
    totalMinutes,
    sessionsCount: list.length,
    questionsCount,
    reviewsCount,
    subjects,
  };
}

// ── Indicadores de evolução ─────────────────────────────────────────────
// Compara o resumo do dia atual com o do dia anterior exibido na linha do
// tempo (o próximo grupo mais antigo, já que a lista vem em ordem
// started_at desc). Sem dia anterior (primeiro dia da linha do tempo, ou
// único dia após os filtros), retorna null — nenhuma comparação é exibida.
export function compareDailySummaries(current, previous) {
  if (!previous) return null;
  return {
    sessionsDelta: current.sessionsCount - previous.sessionsCount,
    minutesDelta: current.totalMinutes - previous.totalMinutes,
    questionsDelta: current.questionsCount - previous.questionsCount,
  };
}

// ── Agrupamento semanal ──────────────────────────────────────────────────
// Chave da semana: segunda-feira local (mesma convenção de
// activityDashboardService.js/getDashboardData) — dois dias caem na mesma
// semana sse mondayOf() coincide.

export function weekKeyOf(iso) {
  return isoDate(mondayOf(new Date(iso)));
}

// Rótulo legível ("Semana de 08/06 a 14/06") a partir da chave (segunda da
// semana, "YYYY-MM-DD"). Evita reimplementar numeração de semana ISO 8601 —
// a data de início já identifica a semana sem ambiguidade.
export function weekLabel(weekKey) {
  const monday = localDate(weekKey);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `Semana de ${fmt(monday)} a ${fmt(sunday)}`;
}

// Maior sequência de dias consecutivos estudados dentro de um conjunto de
// dias (mesmo conceito de studyStreakService/_longestStreak — "consecutivo"
// significa diferença de exatamente 1 dia civil — recalculado aqui sobre os
// dias já visíveis na linha do tempo, sem buscar todo o histórico de novo).
function _longestConsecutiveStreak(dayKeys) {
  const sorted = [...new Set(dayKeys)].sort();
  if (sorted.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = localDate(sorted[i - 1]);
    const next = localDate(sorted[i]);
    const gapDays = Math.round((next - prev) / 86400000);
    current = gapDays === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

// ── Resumo semanal ───────────────────────────────────────────────────────
// Recebe os grupos de dia (já resumidos por summarizeDayEntries) que caem
// numa mesma semana e consolida tempo total, sessões, questões, matérias
// distintas e a maior sequência de dias estudados dentro dessa janela.
// `dayGroups`: array de `{ dayKey, summary }`, na mesma ordem em que
// aparecem na linha do tempo.
export function summarizeWeekGroups(dayGroups) {
  const list = dayGroups || [];

  const totalMinutes = list.reduce((sum, g) => sum + g.summary.totalMinutes, 0);
  const sessionsCount = list.reduce((sum, g) => sum + g.summary.sessionsCount, 0);
  const questionsCount = list.reduce((sum, g) => sum + g.summary.questionsCount, 0);

  const subjects = new Set();
  list.forEach(g => g.summary.subjects.forEach(s => subjects.add(s)));

  return {
    totalMinutes,
    sessionsCount,
    questionsCount,
    subjectsCount: subjects.size,
    longestStreak: _longestConsecutiveStreak(list.map(g => g.dayKey)),
  };
}
