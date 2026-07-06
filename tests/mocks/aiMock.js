/**
 * Reusable fake for services/ai/aiService.js — the AI Gateway used by
 * aiPanelView.js. Meant to be installed with node:test's mock.module()
 * before importing the view module, so no real Gemini/Edge Function call
 * is ever made.
 */
export function createAiServiceMock({
  weeklySummary   = "Resumo semanal de teste.",
  studySuggestion = "Sugestão de estudo de teste.",
  scheduleAnalysis = "Análise de agenda de teste.",
  recommendations = "• Recomendação de teste.",
  weeklyPlan = [
    { tipo: "review", prioridade: "alta", categoria: null, tempoSugerido: "30 minutos", dataSugerida: "2026-07-07", motivo: "Existem 2 revisões pendentes.", confianca: "alta" },
  ],
  myEvolution = {
    status: "ok",
    resumo: "Você concluiu 82% do planejamento nos últimos 7 dias.",
    pontosPositivos: [
      { id: "plan_completion", tipo: "positivo", mensagem: "Você concluiu 82% do planejamento nos últimos 7 dias.", dadosUtilizados: { studiedMinutes: 246, plannedMinutes: 300 }, periodoAnalisado: "últimos 7 dias (2026-06-30 a 2026-07-06)", motivo: "Meta de 300 minutos configurada; 246 minutos estudados no período.", nivelConfianca: "alta" },
    ],
    pontosAtencao: [
      { id: "neglected_category", tipo: "atencao", mensagem: "A categoria Pediatria está negligenciada: sem sessões há 12 dias.", dadosUtilizados: { category: "Pediatria", daysSinceLastStudy: 12 }, periodoAnalisado: "últimos 30 dias (2026-06-06 a 2026-07-06)", motivo: "Categoria com maior tempo sem execução entre as cadastradas.", nivelConfianca: "alta" },
    ],
    evolucaoRecente: [],
    insights: [],
  },
  fail = false,
  failMessage = "Erro simulado do assistente de IA.",
  // Nunca resolve por si só — simula uma chamada real em andamento, para
  // testar estados de espera/cancelamento. Rejeita com o mesmo formato de
  // erro que geminiProvider.js produz quando o AbortController é abortado
  // manualmente (ver aiPanelView.js: `err?.code === 'CANCELLED'`).
  hang = false,
} = {}) {
  const calls = [];
  const maybeFail = () => {
    if (fail) throw new Error(failMessage);
  };
  const maybeHang = (controller) => {
    if (!hang) return undefined;
    return new Promise((resolve, reject) => {
      controller?.signal.addEventListener('abort', () => {
        if (controller.signal.reason === 'user') {
          const err = new Error('Consulta cancelada.');
          err.code = 'CANCELLED';
          reject(err);
        }
      });
    });
  };
  return {
    _calls: calls,
    getWeeklySummary: async (controller) => {
      calls.push({ fn: "getWeeklySummary", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return weeklySummary;
    },
    getStudySuggestion: async (controller) => {
      calls.push({ fn: "getStudySuggestion", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return studySuggestion;
    },
    getScheduleAnalysis: async (controller) => {
      calls.push({ fn: "getScheduleAnalysis", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return scheduleAnalysis;
    },
    getContextualRecommendations: async (controller) => {
      calls.push({ fn: "getContextualRecommendations", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return recommendations;
    },
    getWeeklyPlan: async (controller) => {
      calls.push({ fn: "getWeeklyPlan", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return weeklyPlan;
    },
    getMyEvolution: async (controller) => {
      calls.push({ fn: "getMyEvolution", controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return myEvolution;
    },
  };
}
