/**
 * recommendationEngine.js — Primeiras Recomendações (F3.2).
 *
 * Interpreta o contexto já consolidado por aiContextService.getAIContext()
 * e produz recomendações com evidência real — nunca inventa informação.
 * Função pura: sem I/O, sem DOM, sem chamada a IA. Cada regra só lê campos
 * já sanitizados do contexto (ETAPA 5) e, quando aciona, anexa o dado que a
 * fundamenta (`evidence`) além da frase pronta (`message`) — ver ETAPA 4.
 *
 * Duas regras (semana carregada/vazia e execução recente/período sem
 * sessões) são mutuamente exclusivas dentro de si mesmas: uma semana não
 * pode ser ao mesmo tempo "muito carregada" e "muito vazia", e um usuário
 * que está há muito tempo sem sessão já está coberto por essa recomendação
 * mais grave, sem precisar também soar como "pouca execução recente".
 */

// Percentual de meta considerado "próximo de ser atingida": já em andamento,
// mas ainda não alcançada nem ultrapassada (isso já tem estado próprio,
// "achieved"/"exceeded", em timeGoals.calculateGoalProgress()).
const GOAL_NEAR_MIN_PCT = 70;
const GOAL_NEAR_MAX_PCT = 99;

// Categoria "pouco estudada": sem sessão finalizada há pelo menos este
// número de dias (ou nunca estudada).
const UNDERSTUDIED_DAYS = 5;
const UNDERSTUDIED_MAX_ITEMS = 3;

// Carga semanal (compromissos já expandidos, ver computeWeekEventsCount).
const HEAVY_WEEK_EVENTS = 10;
const EMPTY_WEEK_EVENTS = 0;

// Execução: período sem nenhuma sessão finalizada, e piso de "pouca
// execução" quando ainda há sessões recentes mas abaixo do normal.
const LONG_GAP_DAYS = 14;
const LOW_EXECUTION_WEEK_MINUTES = 60;

function _isNearGoal(goal) {
  return !!goal?.configured && goal.percentage >= GOAL_NEAR_MIN_PCT && goal.percentage <= GOAL_NEAR_MAX_PCT;
}

/** Compromissos atrasados (não recorrentes, vencidos, sem sessão finalizada). */
export function findOverdueEventsRecommendation(context) {
  const overdue = context.overdueEvents || [];
  if (!overdue.length) return null;

  const examples = overdue.slice(0, 3).map(e => `"${e.title}" (${e.daysOverdue}d)`).join(", ");
  const message = overdue.length === 1
    ? `Você tem 1 compromisso atrasado sem execução registrada: ${examples}.`
    : `Você tem ${overdue.length} compromissos atrasados sem execução registrada, incluindo ${examples}.`;

  return { type: "overdue_events", message, evidence: { count: overdue.length, examples: overdue.slice(0, 3) } };
}

/** Revisões pendentes (F2.3), com destaque para as já atrasadas. */
export function findPendingReviewsRecommendation(context) {
  const reviews = context.reviews;
  if (!reviews?.pendingCount) return null;

  const overdueCount = reviews.pending.filter(r => r.daysOverdue > 0).length;
  const message = overdueCount > 0
    ? `Você possui ${reviews.pendingCount} revisões pendentes, sendo ${overdueCount} já atrasadas.`
    : `Você possui ${reviews.pendingCount} revisões pendentes.`;

  return { type: "pending_reviews", message, evidence: { pendingCount: reviews.pendingCount, overdueCount } };
}

/** Metas de tempo (F2.2) próximas de serem atingidas (diária/semanal/mensal). */
export function findGoalsNearlyMetRecommendation(context) {
  const { dailyGoal, weeklyGoal, monthlyGoal } = context.execution || {};
  const near = [
    ["diária",  dailyGoal],
    ["semanal", weeklyGoal],
    ["mensal",  monthlyGoal],
  ].filter(([, goal]) => _isNearGoal(goal));

  if (!near.length) return null;

  const parts = near.map(([label, goal]) => `meta ${label} em ${goal.percentage}%`);
  return {
    type: "goals_nearly_met",
    message: `Você está perto de bater sua ${parts.join(" e sua ")}. Continue assim!`,
    evidence: { goals: near.map(([period, goal]) => ({ period, percentage: goal.percentage, remainingMinutes: goal.remainingMinutes })) },
  };
}

/** Categorias sem sessão finalizada há muito tempo (ou nunca estudadas). */
export function findUnderstudiedCategoriesRecommendation(context) {
  if (!context.hasStudyHistory) return null; // sem histórico, não há evidência para comparar

  const neglected = (context.categories || [])
    .filter(c => c.daysSinceLastStudy === null || c.daysSinceLastStudy >= UNDERSTUDIED_DAYS)
    .sort((a, b) => (b.daysSinceLastStudy ?? Infinity) - (a.daysSinceLastStudy ?? Infinity))
    .slice(0, UNDERSTUDIED_MAX_ITEMS);

  if (!neglected.length) return null;

  const first = neglected[0];
  const message = first.daysSinceLastStudy === null
    ? `Você ainda não registrou sessões de estudo na categoria ${first.name}.`
    : `Há ${first.daysSinceLastStudy} dias você não realiza sessões da categoria ${first.name}.`;

  return { type: "understudied_categories", message, evidence: { categories: neglected } };
}

/** Semana muito carregada ou muito vazia, a partir dos compromissos agendados. */
export function findWeekLoadRecommendation(context) {
  if (!context.hasAnyEvents) return null; // sem nenhum compromisso cadastrado, "vazia" não é um alerta

  const count = context.weekEventsCount;
  if (count >= HEAVY_WEEK_EVENTS) {
    return { type: "heavy_week", message: `Sua semana está muito carregada: ${count} compromissos agendados.`, evidence: { weekEventsCount: count } };
  }
  if (count === EMPTY_WEEK_EVENTS) {
    return { type: "empty_week", message: "Sua semana está vazia: nenhum compromisso agendado.", evidence: { weekEventsCount: count } };
  }
  return null;
}

/** Longo período sem sessões, ou pouca execução recente (mutuamente exclusivas). */
export function findExecutionRecommendation(context) {
  if (!context.hasStudyHistory) return null; // usuário novo — nada para comparar ainda

  const gap = context.daysSinceLastSession;
  if (gap === null || gap >= LONG_GAP_DAYS) {
    return {
      type: "long_gap_no_sessions",
      message: `Você está há ${gap === null ? "muitos" : gap} dias sem registrar sessões de estudo.`,
      evidence: { daysSinceLastSession: gap },
    };
  }

  const weekMinutes = context.execution?.weekMinutes ?? 0;
  if (weekMinutes < LOW_EXECUTION_WEEK_MINUTES) {
    return {
      type: "low_recent_execution",
      message: `Você estudou apenas ${weekMinutes} minutos esta semana.`,
      evidence: { weekMinutes },
    };
  }
  return null;
}

/**
 * Horário preferido do usuário (F3.6 — User Memory Engine), quando a
 * evidência é forte. Peso, não regra absoluta: é a única recomendação desta
 * lista que nunca sinaliza um problema — só reflete de volta um hábito já
 * observado, sempre citando a evidência (ETAPA 6 do Memory Engine). Nunca
 * substitui nem impede as demais recomendações; some silenciosamente sem o
 * Memory Engine ou sem confiança "alta" (ver aiContextService.memory).
 */
export function findPreferredScheduleRecommendation(context) {
  const time = context.memory?.preferences?.horarioPreferido;
  if (!time || time.confianca !== "alta") return null;

  return {
    type: "preferred_schedule",
    message: `Você costuma estudar mais no período da ${time.valor}, com base em ${time.baseadoEm}.`,
    evidence: { horarioPreferido: time.valor, baseadoEm: time.baseadoEm },
  };
}

const RULES = [
  findOverdueEventsRecommendation,
  findPendingReviewsRecommendation,
  findGoalsNearlyMetRecommendation,
  findUnderstudiedCategoriesRecommendation,
  findWeekLoadRecommendation,
  findExecutionRecommendation,
  findPreferredScheduleRecommendation,
];

/**
 * Produz a lista ordenada de recomendações a partir de um contexto já
 * consolidado (aiContextService.getAIContext()). Nunca lança: uma regra que
 * não se aplica simplesmente não entra na lista.
 */
export function computeRecommendations(context) {
  return RULES.map(rule => rule(context)).filter(Boolean);
}
