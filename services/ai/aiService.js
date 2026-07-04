/**
 * aiService.js — AI Gateway.
 * The rest of the application must ONLY interact with the AI through this module.
 * Adding a new provider requires changes only here and in providers/.
 */
import { AI_CONFIG } from '../../config/ai.js';
import { callGemini }              from './providers/geminiProvider.js';
import { prepareWeeklySummary }    from './prompts/weeklySummary.js';
import { prepareStudySuggestion }  from './prompts/studySuggestion.js';
import { prepareScheduleAnalysis } from './prompts/scheduleAnalysis.js';
import { parseResponse }           from './parsers/responseParser.js';

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
 * @param {object[]} allBaseEvents - Raw events from getEvents()
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getWeeklySummary(allBaseEvents, controller) {
  const payload = prepareWeeklySummary(allBaseEvents);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}

/**
 * Suggests free time slots for study in the next 14 days.
 * @param {object[]} allBaseEvents
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getStudySuggestion(allBaseEvents, controller) {
  const payload = prepareStudySuggestion(allBaseEvents);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}

/**
 * Analyses the schedule for conflicts and workload issues in the next 30 days.
 * @param {object[]} allBaseEvents
 * @param {AbortController} [controller] - Lets the caller cancel the in-flight request
 * @returns {Promise<string>}
 */
export async function getScheduleAnalysis(allBaseEvents, controller) {
  const payload = prepareScheduleAnalysis(allBaseEvents);
  const raw     = await getProvider()(payload, controller);
  return parseResponse(raw);
}
