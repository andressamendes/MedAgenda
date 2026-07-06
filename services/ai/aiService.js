/**
 * aiService.js — AI Gateway.
 * The rest of the application must ONLY interact with the AI through this module.
 * Adding a new provider requires changes only here and in providers/.
 *
 * F3.2 — IA Contextual: every function here gets its data exclusively from
 * aiContextService.getAIContext() — the single Context Engine. No function
 * accepts events from its caller anymore, and no View (aiPanelView.js)
 * fetches or shapes context on its own. The three existing prompt preparers
 * (prompts/weeklySummary.js, studySuggestion.js, scheduleAnalysis.js) are
 * untouched: they still receive the same raw `events` array they always
 * did, just sourced centrally instead of by the view.
 */
import { AI_CONFIG } from '../../config/ai.js';
import { callGemini }              from './providers/geminiProvider.js';
import { prepareWeeklySummary }    from './prompts/weeklySummary.js';
import { prepareStudySuggestion }  from './prompts/studySuggestion.js';
import { prepareScheduleAnalysis } from './prompts/scheduleAnalysis.js';
import { parseResponse }           from './parsers/responseParser.js';
import { getAIContext }            from '../../aiContextService.js';
import { computeRecommendations }  from '../../recommendationEngine.js';
import { computeWeeklyPlan }       from '../../planningService.js';
import { getReflectionData }       from '../../reflectionService.js';

/** Map of provider identifiers to their call functions */
const PROVIDERS = {
  gemini: callGemini,
};

function getProvider() {
  const fn = PROVIDERS[AI_CONFIG.provider];
  if (!fn) throw new Error(`Provedor de IA desconhecido: "${AI_CONFIG.provider}"`);
  return fn;
}

/**
 * Generates a natural-language summary of the user's current week.
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getWeeklySummary(controller) {
  const context = await getAIContext();
  const payload = prepareWeeklySummary(context.events);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}

/**
 * Suggests free time slots for study in the next 14 days.
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getStudySuggestion(controller) {
  const context = await getAIContext();
  const payload = prepareStudySuggestion(context.events);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}

/**
 * Analyses the schedule for conflicts and workload issues in the next 30 days.
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getScheduleAnalysis(controller) {
  const context = await getAIContext();
  const payload = prepareScheduleAnalysis(context.events);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}

/**
 * First contextual recommendations (F3.2): interprets the same Context
 * Engine snapshot with recommendationEngine.computeRecommendations() —
 * deterministic, always grounded in real data, never invented. This does
 * NOT call Gemini: the ai-chat Edge Function only accepts the three prompt
 * types above (see VALID_TYPES in supabase/functions/ai-chat/index.ts),
 * and this step must not modify Edge Functions or add a new prompt type.
 * @returns {Promise<string>}
 */
export async function getContextualRecommendations() {
  const context = await getAIContext();
  const recommendations = computeRecommendations(context);
  if (!recommendations.length) {
    return 'Nenhuma recomendação no momento — está tudo em dia!';
  }
  return recommendations.map(r => `• ${r.message}`).join('\n');
}

/**
 * Planejamento Assistido (F3.3): gera o plano estruturado da semana a partir
 * do mesmo Context Engine, com planningService.computeWeeklyPlan() —
 * determinístico, sem I/O e sem chamada a Gemini (mesma justificativa de
 * getContextualRecommendations(): a Edge Function ai-chat só aceita os três
 * tipos de prompt já existentes, e este passo não adiciona um novo).
 * @returns {Promise<Array<object>>} lista de sugestões (pode ser vazia)
 */
export async function getWeeklyPlan() {
  const context = await getAIContext();
  return computeWeeklyPlan(context);
}

/**
 * Coach Inteligente (F3.4): reflete sobre como o usuário executou o
 * planejamento, com reflectionService.getReflectionData() — motor separado
 * do Context Engine (getAIContext()), pois analisa uma janela histórica
 * própria (7/30 dias) em vez do instantâneo atual. Determinístico sobre os
 * dados carregados, sem I/O adicional e sem chamada a Gemini (mesma
 * justificativa de getWeeklyPlan()/getContextualRecommendations()).
 * @returns {Promise<object>} relatório de reflexão (resumo, pontos
 * positivos/atenção, evolução recente, insights explicáveis)
 */
export async function getMyEvolution() {
  return getReflectionData();
}
