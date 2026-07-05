/**
 * timeGoals.js — Metas de Tempo (F2.2).
 *
 * Funções puras de domínio para metas pessoais de tempo de estudo (diária,
 * semanal, mensal). Recebem os minutos já agregados por
 * activityDashboardService (computeDashboardIndicators) e o valor de meta
 * configurado em profiles — sem I/O, sem DOM. Nenhum cálculo mora na view:
 * ela só chama calculateGoalProgress() e renderiza o resultado.
 *
 * Nesta etapa as metas são apenas informativas — nenhuma recomendação ou
 * sugestão automática é derivada daqui.
 */

export const GOAL_LIMITS = {
  daily:   { min: 5, max: 1440 },   // até 24h
  weekly:  { min: 5, max: 10080 },  // até 7 dias
  monthly: { min: 5, max: 44640 },  // até 31 dias
};

/**
 * Valida um valor de meta (em minutos) para o período informado.
 * `null`/`undefined`/string vazia é válido — representa "sem meta".
 */
export function validateGoalMinutes(value, period) {
  const limits = GOAL_LIMITS[period];
  if (!limits) throw new Error(`Período de meta inválido: ${period}`);

  if (value === null || value === undefined || value === '') {
    return { valid: true, value: null };
  }

  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { valid: false, error: 'A meta deve ser um número inteiro de minutos.' };
  }
  if (n < limits.min || n > limits.max) {
    return { valid: false, error: `A meta deve estar entre ${limits.min} e ${limits.max} minutos.` };
  }
  return { valid: true, value: n };
}

/** Percentual atingido da meta (arredondado), ou null se não houver meta configurada. */
export function calculateGoalPercentage(actualMinutes, goalMinutes) {
  if (!goalMinutes || goalMinutes <= 0) return null;
  return Math.round(((actualMinutes || 0) / goalMinutes) * 100);
}

/** Minutos restantes para atingir a meta (nunca negativo), ou null se não houver meta. */
export function calculateRemainingTime(actualMinutes, goalMinutes) {
  if (!goalMinutes || goalMinutes <= 0) return null;
  return Math.max(0, goalMinutes - (actualMinutes || 0));
}

/**
 * Progresso completo de uma meta a partir do tempo já realizado no período —
 * estado (sem meta / parcial / atingida / ultrapassada), percentual e tempo
 * restante. É o único ponto de decisão sobre o estado de uma meta; a view
 * (activityDashboardView.js) só formata o que este objeto já traz pronto.
 */
export function calculateGoalProgress(actualMinutes, goalMinutes) {
  const actual = actualMinutes || 0;

  if (!goalMinutes || goalMinutes <= 0) {
    return {
      configured:       false,
      goalMinutes:      null,
      actualMinutes:    actual,
      percentage:       null,
      remainingMinutes: null,
      state:            'no_goal',
    };
  }

  const percentage       = calculateGoalPercentage(actual, goalMinutes);
  const remainingMinutes = calculateRemainingTime(actual, goalMinutes);

  let state = 'partial';
  if (percentage === 100) state = 'achieved';
  else if (percentage > 100) state = 'exceeded';

  return {
    configured: true,
    goalMinutes,
    actualMinutes: actual,
    percentage,
    remainingMinutes,
    state,
  };
}
