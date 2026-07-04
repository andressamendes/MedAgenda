/**
 * geminiProvider.js — Calls the ai-chat Supabase Edge Function.
 * The actual Gemini API key never reaches the browser.
 */
import { supabase } from '../../../supabase.js';
import { AI_CONFIG } from '../../../config/ai.js';

const EDGE_FUNCTION_URL = (() => {
  // Derive Edge Function URL from the Supabase client's URL
  const base = supabase.supabaseUrl ?? '';
  return `${base}/functions/v1/ai-chat`;
})();

/**
 * @param {{ type: string, events: object[], [key: string]: unknown }} payload
 * @param {AbortController} [controller] - Shared with the caller so it can cancel
 *   manually; the timeout below aborts the same controller when it fires first.
 * @returns {Promise<string>} AI-generated text
 * @throws {AIError}
 */
export async function callGemini(payload, controller = new AbortController()) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AIError('Usuário não autenticado.', 'AUTH');

  const timer = setTimeout(() => controller.abort('timeout'), AI_CONFIG.timeout);

  let res;
  try {
    res = await fetch(EDGE_FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body:   JSON.stringify({ ...payload, model: AI_CONFIG.model, temperature: AI_CONFIG.temperature, maxTokens: AI_CONFIG.maxTokens }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      if (controller.signal.reason === 'user') throw new AIError('Consulta cancelada.', 'CANCELLED');
      throw new AIError('A requisição excedeu o tempo limite. Tente novamente.', 'TIMEOUT');
    }
    throw new AIError('Não foi possível conectar ao assistente de IA. Verifique sua conexão.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new AIError('Sessão expirada. Faça login novamente.', 'AUTH');
  if (res.status === 429) throw new AIError('Limite de requisições atingido. Aguarde alguns instantes e tente novamente.', 'RATE_LIMIT');
  if (res.status === 503) throw new AIError('O serviço de IA está temporariamente indisponível. Tente novamente mais tarde.', 'UNAVAILABLE');

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.error ?? `Erro ${res.status} ao contatar o serviço de IA.`;
    throw new AIError(msg, 'API_ERROR');
  }

  if (!body?.text) throw new AIError('O assistente de IA retornou uma resposta vazia. Tente novamente.', 'EMPTY_RESPONSE');

  return body.text;
}

export class AIError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name  = 'AIError';
    this.code  = code;
  }
}
