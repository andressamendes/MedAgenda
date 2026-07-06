/**
 * planningService.js — Planejamento Assistido (F3.3, sobre a base do F3.1/F3.2).
 *
 * Interpreta o mesmo contexto consolidado por aiContextService.getAIContext()
 * — o Context Engine — e produz um plano estruturado de sugestões para a
 * semana. Função pura: sem I/O, sem DOM, sem chamada a Gemini. Mesmo padrão de
 * recommendationEngine.js (F3.2): cada regra só lê campos já sanitizados do
 * contexto e, quando aciona, o `motivo` da sugestão já cita o dado real que a
 * fundamenta — nunca uma sugestão sem evidência (ETAPA 5).
 *
 * Reaproveitamento (ETAPA 1/2): nenhum indicador é recalculado aqui — tudo já
 * vem pronto de aiContextService (compromissos atrasados, revisões pendentes,
 * categorias/tempo estudado, metas, carga semanal). Este módulo só decide
 * prioridade, tempo sugerido e data sugerida a partir desses dados.
 *
 * O usuário decide tudo: nenhuma sugestão cria evento, grava no banco ou
 * dispara notificação — ver aiPanelView.js, que apenas lista o plano.
 */

// Categoria "pouco estudada": mesmo piso de recommendationEngine.js — sem
// sessão finalizada há pelo menos este número de dias (ou nunca estudada).
const UNDERSTUDIED_DAYS = 5;
const MAX_UNDERSTUDIED_ITEMS = 3;

// Tempo sugerido por tipo de sugestão — piso realista por item, nunca
// inventado a partir de disponibilidade inexistente na agenda.
const MINUTES_PER_OVERDUE_EVENT = 20;
const MAX_OVERDUE_MINUTES = 90;
const MINUTES_PER_REVIEW = 15;
const MAX_REVIEW_MINUTES = 90;
const STUDY_SESSION_MINUTES = 45;
const EMPTY_WEEK_SESSION_MINUTES = 60;
const MAX_GOAL_SESSION_MINUTES = 90;

// Meta abaixo deste percentual é tratada como "muito atrasada" (prioridade alta).
const GOAL_LOW_PCT_THRESHOLD = 50;

const PRIORITY_ORDER = { alta: 0, "média": 1, baixa: 2 };

function _mostFrequentCategory(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item.category) continue;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) { best = category; bestCount = count; }
  }
  return best;
}

// ── Regras (uma por origem de dado, testáveis isoladamente) ─────────────────

/** Compromissos atrasados sem execução (context.overdueEvents, ver aiContextService). */
export function findOverduePlanItem(context) {
  const overdue = context.overdueEvents || [];
  if (!overdue.length) return null;

  const minutes = Math.min(overdue.length * MINUTES_PER_OVERDUE_EVENT, MAX_OVERDUE_MINUTES);
  return {
    tipo: "overdue",
    prioridade: "alta",
    categoria: _mostFrequentCategory(overdue),
    tempoSugerido: `${minutes} minutos`,
    dataSugerida: null, // atribuída em computeWeeklyPlan()
    motivo: overdue.length === 1
      ? "Você tem 1 compromisso atrasado sem execução registrada."
      : `Você tem ${overdue.length} compromissos atrasados sem execução registrada.`,
    confianca: "alta",
  };
}

/** Revisões pendentes (context.reviews, F2.3), com destaque para as já atrasadas. */
export function findPendingReviewsPlanItem(context) {
  const reviews = context.reviews;
  if (!reviews?.pendingCount) return null;

  const overdueCount = reviews.pending.filter(r => r.daysOverdue > 0).length;
  const minutes = Math.min(reviews.pendingCount * MINUTES_PER_REVIEW, MAX_REVIEW_MINUTES);

  return {
    tipo: "review",
    prioridade: overdueCount > 0 ? "alta" : "média",
    categoria: null, // revisões (F2.3) não carregam categoria no contexto sanitizado
    tempoSugerido: `${minutes} minutos`,
    dataSugerida: null,
    motivo: overdueCount > 0
      ? `Existem ${reviews.pendingCount} revisões pendentes, sendo ${overdueCount} já atrasadas.`
      : `Existem ${reviews.pendingCount} revisões pendentes.`,
    confianca: "alta",
  };
}

/** Categorias sem sessão finalizada há muito tempo (ou nunca estudadas). */
export function findUnderstudiedPlanItems(context) {
  if (!context.hasStudyHistory) return []; // usuário novo — nada para comparar ainda

  const neglected = (context.categories || [])
    .filter(c => c.daysSinceLastStudy === null || c.daysSinceLastStudy >= UNDERSTUDIED_DAYS)
    .sort((a, b) => (b.daysSinceLastStudy ?? Infinity) - (a.daysSinceLastStudy ?? Infinity))
    .slice(0, MAX_UNDERSTUDIED_ITEMS);

  return neglected.map(cat => ({
    tipo: "study",
    prioridade: (cat.daysSinceLastStudy === null || cat.daysSinceLastStudy >= UNDERSTUDIED_DAYS * 2) ? "alta" : "média",
    categoria: cat.name,
    tempoSugerido: `${STUDY_SESSION_MINUTES} minutos`,
    dataSugerida: null,
    motivo: cat.daysSinceLastStudy === null
      ? `Você ainda não registrou sessões de estudo na categoria ${cat.name}.`
      : `Esta categoria não recebe sessões há ${cat.daysSinceLastStudy} dias.`,
    // Categoria nunca estudada tem menos evidência (não há histórico para
    // comparar) do que uma com data exata de última sessão.
    confianca: cat.daysSinceLastStudy === null ? "média" : "alta",
  }));
}

/** Meta semanal (F2.2) ainda não atingida — foco do "plano da semana". */
export function findGoalCatchUpPlanItem(context) {
  const goal = context.execution?.weeklyGoal;
  if (!goal?.configured) return null;
  if (goal.state === "achieved" || goal.state === "exceeded") return null;

  const minutes = Math.min(goal.remainingMinutes ?? 0, MAX_GOAL_SESSION_MINUTES);
  if (minutes <= 0) return null;

  return {
    tipo: "goal",
    prioridade: goal.percentage < GOAL_LOW_PCT_THRESHOLD ? "alta" : "média",
    categoria: null,
    tempoSugerido: `${minutes} minutos`,
    dataSugerida: null,
    motivo: `Sua meta semanal está em ${goal.percentage}%.`,
    confianca: "alta",
  };
}

/** Semana sem nenhum compromisso agendado — oportunidade, não urgência. */
export function findEmptyWeekPlanItem(context) {
  if (!context.hasAnyEvents) return null; // sem nenhum compromisso cadastrado, nada para comparar
  if (context.weekEventsCount > 0) return null;

  return {
    tipo: "study",
    prioridade: "baixa",
    categoria: null,
    tempoSugerido: `${EMPTY_WEEK_SESSION_MINUTES} minutos`,
    dataSugerida: null,
    motivo: "Sua semana está vazia: nenhum compromisso agendado.",
    confianca: "média",
  };
}

// Data sugerida: nunca afirma que existe um horário livre — apenas espalha as
// sugestões ao longo da semana (hoje para o que já está atrasado, o fim da
// semana para a meta semanal, os demais dias seguintes em sequência).
function _suggestedDate(item, index, now) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (item.tipo === "overdue") {
    return _isoDate(today);
  }
  if (item.tipo === "goal") {
    const dow = today.getDay(); // 0 = domingo
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
    const sunday = new Date(today);
    sunday.setDate(sunday.getDate() + daysUntilSunday);
    return _isoDate(sunday);
  }

  const d = new Date(today);
  d.setDate(d.getDate() + 1 + (index % 6));
  return _isoDate(d);
}

function _isoDate(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Produz o plano estruturado da semana a partir de um contexto já consolidado
 * (aiContextService.getAIContext()). Nunca lança: uma regra que não se aplica
 * simplesmente não entra na lista, e um contexto vazio/parcial produz um
 * plano vazio ou parcial — nunca um erro (ETAPA 8: quem trata a exceção de
 * rede/serviço indisponível é o próprio aiContextService, via _safe()).
 *
 * Determinístico: o mesmo contexto e o mesmo `now` sempre produzem o mesmo
 * plano, na mesma ordem (ETAPA 9 — estabilidade do planejamento).
 */
export function computeWeeklyPlan(context, now = new Date()) {
  const items = [
    findOverduePlanItem(context),
    findPendingReviewsPlanItem(context),
    ...findUnderstudiedPlanItems(context),
    findGoalCatchUpPlanItem(context),
    findEmptyWeekPlanItem(context),
  ].filter(Boolean);

  // Array.prototype.sort é estável (ES2019+): itens de mesma prioridade
  // mantêm a ordem relativa em que as regras foram avaliadas acima.
  items.sort((a, b) => PRIORITY_ORDER[a.prioridade] - PRIORITY_ORDER[b.prioridade]);

  return items.map((item, index) => ({
    ...item,
    dataSugerida: _suggestedDate(item, index, now),
  }));
}
