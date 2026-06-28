/**
 * AI Gateway configuration.
 * No API keys here — those live in Supabase Edge Function environment variables.
 */
export const AI_CONFIG = {
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  temperature: 0.7,
  maxTokens: 1024,
  timeout: 30000,
};

/** Prompt types supported by the gateway */
export const PROMPT_TYPES = {
  WEEKLY_SUMMARY:    'weekly_summary',
  STUDY_SUGGESTION:  'study_suggestion',
  SCHEDULE_ANALYSIS: 'schedule_analysis',
};
