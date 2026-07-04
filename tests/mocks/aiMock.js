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
    getWeeklySummary: async (events, controller) => {
      calls.push({ fn: "getWeeklySummary", events, controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return weeklySummary;
    },
    getStudySuggestion: async (events, controller) => {
      calls.push({ fn: "getStudySuggestion", events, controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return studySuggestion;
    },
    getScheduleAnalysis: async (events, controller) => {
      calls.push({ fn: "getScheduleAnalysis", events, controller });
      if (hang) return maybeHang(controller);
      maybeFail();
      return scheduleAnalysis;
    },
  };
}
