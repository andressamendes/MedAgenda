/**
 * insightsService.js — Central de Insights: Infraestrutura (F2.4).
 *
 * Consolida, num único ponto, indicadores que já existem espalhados por
 * quatro telas (Dashboard de Execução, Metas de Tempo, Revisões, Histórico de
 * Sessões). Nenhum cálculo novo é feito aqui: cada indicador vem de uma
 * função de domínio já existente —
 *
 *   activityDashboardService.getDashboardData()  → tempo estudado, sessões
 *                                                   concluídas e metas
 *   reviewService.listPending() / listCompleted() → revisões
 *   eventService.getEvents() +
 *   activitySessionService.getEventExecutionSummaries() → compromissos
 *                                                          executados/nunca executados
 *
 * A View (insightsView.js) nunca combina esses dados manualmente: ela só
 * chama getInsightsData() e renderiza o que cada bloco já traz pronto.
 *
 * ETAPA 6 (performance): as quatro fontes são buscadas em paralelo (uma única
 * rodada de chamadas, via Promise.allSettled), nunca em série.
 *
 * ETAPA 7 (estados): Promise.allSettled garante que a falha de uma fonte não
 * derruba as outras — cada bloco carrega seu próprio status
 * ("ok" | "partial" | "error") e a View decide, bloco a bloco, o que exibir.
 * Nenhum erro é lançado por getInsightsData(); ela sempre resolve.
 */

import { getDashboardData } from "./activityDashboardService.js";
import { listPending, listCompleted } from "./reviewService.js";
import { getEvents } from "./eventService.js";
import { getEventExecutionSummaries } from "./activitySessionService.js";

// Deriva os contadores de "compromissos executados" / "nunca executados" a
// partir dos mesmos compromissos (eventService.getEvents(), já existente) e
// do mesmo resumo de execução em lote usado pela agenda
// (activitySessionService.getEventExecutionSummaries(), F1.7) — nenhuma
// consulta nova é introduzida, apenas reaproveitada.
async function _getEventExecutionCounts() {
  const events = await getEvents();
  const ids = (events || []).map(e => e.id);
  const summaries = await getEventExecutionSummaries(ids);

  let executedCount = 0;
  for (const id of ids) {
    if (summaries[id]?.hasFinishedSession) executedCount += 1;
  }

  return {
    totalEvents: ids.length,
    executedCount,
    neverExecutedCount: ids.length - executedCount,
  };
}

/** Empacota o resultado de uma Promise.allSettled num bloco { status, data, error }. */
function _blockFromSettled(result, mapper) {
  if (result.status === "fulfilled") {
    return { status: "ok", data: mapper(result.value), error: null };
  }
  return { status: "error", data: null, error: result.reason };
}

// Bloco de Revisões combina duas fontes independentes (pendentes/concluídas):
// se só uma delas falhar, o bloco ainda mostra o indicador que carregou —
// "dados parciais" (ETAPA 7) em vez de esconder o bloco inteiro.
function _reviewsBlock(pendingResult, completedResult) {
  const pendingOk   = pendingResult.status === "fulfilled";
  const completedOk = completedResult.status === "fulfilled";

  if (!pendingOk && !completedOk) {
    return { status: "error", data: null, error: pendingResult.reason };
  }

  return {
    status: (pendingOk && completedOk) ? "ok" : "partial",
    data: {
      pendingCount:   pendingOk   ? pendingResult.value.length   : null,
      completedCount: completedOk ? completedResult.value.length : null,
    },
    error: !pendingOk ? pendingResult.reason : (!completedOk ? completedResult.reason : null),
  };
}

/**
 * Ponto de entrada único da Central de Insights. Busca as quatro fontes em
 * paralelo e retorna os quatro blocos (ETAPA 4: Execução / Metas / Revisões /
 * Produtividade) já prontos para a View renderizar. Nunca rejeita — cada
 * bloco carrega seu próprio estado de erro.
 */
export async function getInsightsData(now = new Date()) {
  const [dashboardResult, pendingResult, completedResult, executionResult] =
    await Promise.allSettled([
      getDashboardData(now),
      listPending(),
      listCompleted(),
      _getEventExecutionCounts(),
    ]);

  return {
    execucao: _blockFromSettled(dashboardResult, d => ({
      todayMinutes:       d.todayMinutes,
      weekMinutes:        d.weekMinutes,
      monthMinutes:       d.monthMinutes,
      todaySessionsCount: d.todaySessionsCount,
      weekSessionsCount:  d.weekSessionsCount,
      monthSessionsCount: d.monthSessionsCount,
    })),
    metas: _blockFromSettled(dashboardResult, d => ({
      dailyGoal:   d.dailyGoal,
      weeklyGoal:  d.weeklyGoal,
      monthlyGoal: d.monthlyGoal,
    })),
    revisoes:      _reviewsBlock(pendingResult, completedResult),
    produtividade: _blockFromSettled(executionResult, e => e),
  };
}
