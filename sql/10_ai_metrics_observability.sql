-- Execute no SQL Editor do Supabase
-- Etapa 21 (A2.2): Observabilidade da Edge Function ai-chat.
--
-- Problema: ai_metrics (08_ai_metrics.sql) já existia, mas a Edge Function
-- ai-chat nunca gravava nela — a única telemetria era console.log. Além
-- disso faltavam colunas para responder perguntas operacionais básicas
-- (qual modelo foi usado, qual o código HTTP retornado, resumo do erro).
--
-- Requer: 08_ai_metrics.sql (tabela ai_metrics).
--
-- Apenas adiciona colunas opcionais (nullable) à tabela existente — não
-- altera RLS, não cria tabelas novas, não armazena prompt/resposta da IA.
ALTER TABLE public.ai_metrics
  ADD COLUMN IF NOT EXISTS model         text,
  ADD COLUMN IF NOT EXISTS http_status   int,
  ADD COLUMN IF NOT EXISTS error_message text;
