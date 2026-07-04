/**
 * activitySessionStats.js — Cálculos de estatísticas de sessões de um compromisso.
 * Funções puras: recebem a lista de sessões já carregada (ex.: o retorno de
 * activitySessionService.listByEvent(), reaproveitado do histórico da F1.5 —
 * nunca uma nova consulta) e derivam números a partir dela. Sem I/O, sem DOM.
 *
 * Só sessões com status "finished" entram nos cálculos — "cancelled",
 * "running" e "paused" são ignoradas.
 */

function _finished(sessions) {
  return (sessions || []).filter(s => s.status === "finished");
}

/** Soma de duration_minutes das sessões concluídas. */
export function calculateTotalDuration(sessions) {
  return _finished(sessions).reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
}

/** Média (arredondada) de duration_minutes das sessões concluídas, ou 0 se não houver nenhuma. */
export function calculateAverageDuration(sessions) {
  const finished = _finished(sessions);
  if (!finished.length) return 0;
  return Math.round(calculateTotalDuration(sessions) / finished.length);
}

/** A sessão concluída com maior duration_minutes, ou null se não houver nenhuma. */
export function calculateLongestSession(sessions) {
  const finished = _finished(sessions);
  if (!finished.length) return null;
  return finished.reduce((longest, s) =>
    (s.duration_minutes || 0) > (longest.duration_minutes || 0) ? s : longest
  );
}

/** A sessão concluída com o started_at mais recente, ou null se não houver nenhuma. */
export function calculateLastSession(sessions) {
  const finished = _finished(sessions);
  if (!finished.length) return null;
  return finished.reduce((latest, s) =>
    new Date(s.started_at) > new Date(latest.started_at) ? s : latest
  );
}

/** Quantidade de sessões concluídas. */
export function calculateSessionCount(sessions) {
  return _finished(sessions).length;
}

/** Atalho: todas as estatísticas de uma vez, a partir da mesma lista de sessões. */
export function computeSessionStats(sessions) {
  return {
    totalMinutes:   calculateTotalDuration(sessions),
    sessionCount:   calculateSessionCount(sessions),
    lastSession:    calculateLastSession(sessions),
    longestSession: calculateLongestSession(sessions),
    averageMinutes: calculateAverageDuration(sessions),
  };
}

// ── F1.7 — Resumo de execução para indicadores na agenda ────────────────────
// Diferente de computeSessionStats() (estatísticas detalhadas do modal do
// compromisso), summarizeExecution() é o resumo mínimo usado para decorar um
// compromisso na agenda (weekView/calendar): também precisa saber se há uma
// sessão "running" agora, o que as estatísticas do F1.6 não expõem.

/** "3h20" / "45min" / "" (sem tempo acumulado) — formato compacto para badges. */
export function formatCompactDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * Resumo mínimo de execução de um compromisso, a partir da mesma lista de
 * sessões (ex.: activitySessionService.listByEvent() ou o retorno agrupado de
 * getEventExecutionSummaries()). Sem I/O, sem DOM.
 */
export function summarizeExecution(sessions) {
  const list = sessions || [];
  return {
    totalDuration:      calculateTotalDuration(list),
    sessionsCount:       calculateSessionCount(list),
    lastSession:         calculateLastSession(list),
    hasFinishedSession:  calculateSessionCount(list) > 0,
    hasRunningSession:   list.some(s => s.status === "running"),
  };
}

/**
 * Indicador visual (ícone + texto) a partir de um summarizeExecution(), ou
 * null quando o compromisso não tem nada a mostrar. Único ponto de decisão
 * sobre "o que exibir" — reaproveitado por weekView.js e calendar.js para não
 * duplicar essa regra em cada renderizador de agenda.
 */
export function describeExecutionIndicator(summary) {
  if (!summary) return null;
  if (summary.hasRunningSession) {
    return { state: "running", icon: "●", text: "Em andamento" };
  }
  if (summary.hasFinishedSession) {
    const compact = formatCompactDuration(summary.totalDuration);
    const text = compact || `${summary.sessionsCount} ${summary.sessionsCount === 1 ? "sessão" : "sessões"}`;
    return { state: "executed", icon: "✓", text };
  }
  return null;
}
