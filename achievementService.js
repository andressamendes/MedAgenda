// ── achievementService.js — Domínio de Conquistas (F6.12) ──────────────────
// Projeção pura: deriva o estado atual das conquistas a partir de projeções
// já existentes (studyStreakService, subjectProgressService,
// activitySessionService, questionService). Segue a arquitetura da F6.1:
// conquistas NUNCA são persistidas — não existe tabela "achievements", não
// existe coluna de progresso salva, não existe migration. Toda vez que este
// service é chamado, o estado é recalculado a partir dos fatos correntes,
// mesmo padrão de studyStreakService.js (F6.11) e subjectProgressService.js
// (F6.9): nada aqui grava no banco, publica evento ou mantém cache entre
// chamadas.
//
// Fontes de dados: exclusivamente studyStreakService, subjectProgressService,
// activitySessionService e questionService. Nunca consulta Dashboard,
// Insights, IA ou Views diretamente.
//
// O que NÃO é feito aqui (fora do escopo desta etapa, e não fazem parte do
// domínio): XP, níveis, ranking, medalhas animadas, gamificação visual,
// notificações. Nenhum evento é publicado — este service permanece um
// consumidor puro.

import { getStreakSummary } from "./studyStreakService.js";
import { listSubjectsProgress } from "./subjectProgressService.js";
import { getActivitySessions } from "./activitySessionService.js";
import { getQuestions } from "./questionService.js";

// ── Metas ────────────────────────────────────────────────────────────────
// Metas fixas de infraestrutura (não são níveis, não escalam, não são
// gamificação) — apenas o alvo usado para calcular o progresso derivado de
// cada categoria.

const HOURS_TARGET = 100;
const SESSIONS_TARGET = 30;
const QUESTIONS_TARGET = 1000;
const STREAK_TARGET = 10;
const SUBJECTS_TARGET = 12;

// ── Cálculo de progresso ─────────────────────────────────────────────────

function _clampProgress(current, target) {
  if (!target || target <= 0) return 0;
  return Math.min(1, current / target);
}

function _buildAchievement({ id, title, description, category, current, target, icon }) {
  const safeCurrent = Math.max(0, current);
  const progress = _clampProgress(safeCurrent, target);
  return {
    id,
    title,
    description,
    category,
    current: safeCurrent,
    target,
    completed: safeCurrent >= target,
    progress,
    icon,
  };
}

// ── Fontes derivadas ─────────────────────────────────────────────────────

async function _finishedSessionsCount() {
  const sessions = await getActivitySessions();
  return (sessions || []).filter((session) => session.status === "finished").length;
}

async function _studyHours() {
  const subjects = await listSubjectsProgress();
  const totalMinutes = subjects.reduce((sum, entry) => sum + (entry.totalMinutes || 0), 0);
  return totalMinutes / 60;
}

async function _questionsCount() {
  const questions = await getQuestions();
  return (questions || []).length;
}

async function _currentStreak() {
  const summary = await getStreakSummary();
  return summary.currentStreak;
}

async function _subjectsStudiedCount() {
  const subjects = await listSubjectsProgress();
  return subjects.filter((entry) => entry.subject !== null && entry.status !== "sem_atividade").length;
}

// ── Definições das conquistas ────────────────────────────────────────────
// Cada definição sabe computar seu próprio `current` a partir das fontes
// derivadas acima. Nenhum valor é persistido entre chamadas.

const ACHIEVEMENT_DEFINITIONS = [
  {
    id: "study-time",
    title: "Tempo de estudo",
    description: `Acumule ${HOURS_TARGET} horas de estudo.`,
    category: "tempo_de_estudo",
    target: HOURS_TARGET,
    icon: "clock",
    getCurrent: _studyHours,
  },
  {
    id: "sessions-completed",
    title: "Sessões concluídas",
    description: `Conclua ${SESSIONS_TARGET} sessões de estudo.`,
    category: "sessoes_concluidas",
    target: SESSIONS_TARGET,
    icon: "check-circle",
    getCurrent: _finishedSessionsCount,
  },
  {
    id: "questions-solved",
    title: "Questões resolvidas",
    description: `Resolva ${QUESTIONS_TARGET} questões.`,
    category: "questoes_resolvidas",
    target: QUESTIONS_TARGET,
    icon: "target",
    getCurrent: _questionsCount,
  },
  {
    id: "study-streak",
    title: "Constância",
    description: `Estude por ${STREAK_TARGET} dias consecutivos.`,
    category: "constancia",
    target: STREAK_TARGET,
    icon: "flame",
    getCurrent: _currentStreak,
  },
  {
    id: "subjects-studied",
    title: "Matérias estudadas",
    description: `Estude ${SUBJECTS_TARGET} matérias diferentes.`,
    category: "materias_estudadas",
    target: SUBJECTS_TARGET,
    icon: "book",
    getCurrent: _subjectsStudiedCount,
  },
];

async function _computeAchievement(definition) {
  const current = await definition.getCurrent();
  return _buildAchievement({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    current,
    target: definition.target,
    icon: definition.icon,
  });
}

// ── API pública ──────────────────────────────────────────────────────────

// Estado atual de todas as conquistas, recalculado a cada chamada a partir
// das projeções existentes. Isolamento por usuário é herdado das fontes de
// dados (studyStreakService, subjectProgressService, activitySessionService,
// questionService) — este service não faz nenhuma filtragem própria.
export async function listAchievements() {
  return Promise.all(ACHIEVEMENT_DEFINITIONS.map(_computeAchievement));
}

// Estado atual de uma única conquista. Retorna null se o id não existir
// (nunca lança erro — "conquista inexistente" é um resultado válido).
export async function getAchievement(id) {
  const definition = ACHIEVEMENT_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) return null;
  return _computeAchievement(definition);
}

// Apenas os indicadores de progresso de uma conquista (sem título/descrição),
// útil para consumidores que só precisam do estado numérico. Retorna null se
// o id não existir.
export async function getAchievementProgress(id) {
  const achievement = await getAchievement(id);
  if (!achievement) return null;
  const { current, target, completed, progress } = achievement;
  return { current, target, completed, progress };
}

// Resumo consolidado — evita N chamadas separadas quando um consumidor
// futuro precisar de uma visão geral do domínio de conquistas.
export async function getAchievementSummary() {
  const achievements = await listAchievements();
  const completedCount = achievements.filter((entry) => entry.completed).length;
  const overallProgress = achievements.length > 0
    ? achievements.reduce((sum, entry) => sum + entry.progress, 0) / achievements.length
    : 0;

  return {
    total: achievements.length,
    completed: completedCount,
    inProgress: achievements.length - completedCount,
    overallProgress,
  };
}
