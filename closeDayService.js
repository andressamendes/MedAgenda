// ── closeDayService.js — Fechar o dia (F14.8) ───────────────────────────────
//
// O dia de estudo nunca tinha desfecho (auditoria F14 §7/§13): a última
// sessão terminava, o app voltava ao Diário, e nada dizia "pronto, seu dia
// está encerrado" — nem havia ponte para o dia seguinte. Este módulo cobre
// as duas metades desse fechamento:
//
//  - getDayRecap(): um resumo de 15 segundos (tempo, sessões, questões,
//    sequência) a partir dos MESMOS dados já usados por
//    activityDashboardService (activitySessionService.listByDateRange +
//    activitySessionStats) e studyStreakService — nenhum cálculo novo,
//    só um recorte do dia agregado num único lugar.
//  - getNextStudyPlan()/setNextStudyPlan()/clearNextStudyPlan(): o campo
//    opcional "primeiro estudo de amanhã", persistido em profiles
//    (sql/22_next_study_plan.sql — mesma relação 1:1 com o usuário que as
//    Metas de Tempo já têm com profiles). studySessionView.js lê o plano
//    para oferecer um chip de início ("Amanhã: {título}") e o consome
//    (clearNextStudyPlan()) assim que o chip é usado, para não repetir uma
//    sugestão já atendida.
//
// Função de leitura pura sobre dados já buscados por outros serviços — sem
// tabela nova além das duas colunas de profiles, sem evento novo publicado.

import { listByDateRange } from "./activitySessionService.js";
import { calculateTotalDuration, calculateSessionCount } from "./activitySessionStats.js";
import { listQuestionsBySessions } from "./sessionQuestionsService.js";
import { getStreakSummary } from "./studyStreakService.js";
import { getProfile, upsertProfile } from "./profileService.js";

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

// Recap do dia: tempo total, sessões e questões de hoje (só sessões
// "finished" contam, mesma regra de activitySessionStats.js) + sequência
// atual (studyStreakService.js, intocado).
export async function getDayRecap(now = new Date()) {
  const dayStart = _startOfDay(now);
  const dayEnd = _endOfDay(now);

  const [sessions, streak] = await Promise.all([
    listByDateRange(dayStart.toISOString(), dayEnd.toISOString()),
    getStreakSummary(),
  ]);

  const finished = (sessions || []).filter(s => s.status === "finished");
  const questionsBySession = finished.length
    ? await listQuestionsBySessions(finished.map(s => s.id))
    : {};
  const questionsCount = Object.values(questionsBySession)
    .reduce((sum, list) => sum + list.length, 0);

  return {
    minutes: calculateTotalDuration(finished),
    sessionsCount: calculateSessionCount(finished),
    questionsCount,
    currentStreak: streak.currentStreak,
  };
}

// Plano de amanhã já salvo, ou null se o estudante não deixou nenhum (caso
// mais comum — o campo é opcional em todo "Fechar o dia").
export async function getNextStudyPlan() {
  const profile = await getProfile();
  if (!profile?.next_study_title) return null;
  return {
    title: profile.next_study_title,
    category_id: profile.next_study_category_id || null,
  };
}

// title vazio equivale a não deixar plano nenhum — nunca grava uma string
// em branco que reapareceria como chip vazio na próxima sessão.
export async function setNextStudyPlan({ title, category_id } = {}) {
  const trimmed = (title || "").trim();
  await upsertProfile({
    next_study_title: trimmed || null,
    next_study_category_id: trimmed ? (category_id || null) : null,
  });
}

// Chamado assim que o chip "Amanhã: {título}" é usado para iniciar uma
// sessão (studySessionView.js) — a sugestão é de uso único, não deve
// continuar aparecendo depois de já ter sido atendida.
export async function clearNextStudyPlan() {
  await upsertProfile({ next_study_title: null, next_study_category_id: null });
}
