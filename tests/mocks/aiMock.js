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
} = {}) {
  const calls = [];
  const maybeFail = () => {
    if (fail) throw new Error(failMessage);
  };
  return {
    _calls: calls,
    getWeeklySummary: async (events) => {
      calls.push({ fn: "getWeeklySummary", events });
      maybeFail();
      return weeklySummary;
    },
    getStudySuggestion: async (events) => {
      calls.push({ fn: "getStudySuggestion", events });
      maybeFail();
      return studySuggestion;
    },
    getScheduleAnalysis: async (events) => {
      calls.push({ fn: "getScheduleAnalysis", events });
      maybeFail();
      return scheduleAnalysis;
    },
  };
}
