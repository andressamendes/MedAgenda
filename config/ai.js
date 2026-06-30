/**
 * AI Gateway configuration.
 * No API keys here — those live in Supabase Edge Function environment variables.
 */
export const AI_CONFIG = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 1024,
  timeout: 30000,
};
