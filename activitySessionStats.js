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
