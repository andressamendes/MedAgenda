/**
 * AI Gateway configuration.
 * No API keys here — those live in Supabase Edge Function environment variables.
 */
export const AI_CONFIG = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  // gemini-2.5-flash gasta parte do orçamento de maxOutputTokens com
  // "thinking" interno antes do texto visível — com 1024 isso cortava
  // respostas no meio da frase mesmo pedindo textos curtos no prompt.
  maxTokens: 2048,
  timeout: 30000,
};
