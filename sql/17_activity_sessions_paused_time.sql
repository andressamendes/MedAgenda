-- Execute no SQL Editor do Supabase
-- Requer: 11_activity_sessions.sql (tabela activity_sessions), 14_schema_version.sql
--
-- F7.7 — Tempo Líquido de Estudo (Desconto de Pausas).
--
-- Contexto: desde a auditoria F6, duration_minutes sempre incluiu qualquer
-- intervalo em pausa (ver comentário removido de activitySessionService.js
-- em pauseSession/resumeSession). Esta migration adiciona o menor ajuste de
-- schema necessário para corrigir isso, sem tocar em status, eventos do
-- barramento ou em nenhum consumidor (Dashboard/Insights/Subject Progress/
-- Study Streak/Achievement/IA/Histórico continuam lendo apenas
-- duration_minutes, que passa a vir correto).
--
-- Estratégia: acumulador + marcador do início da pausa corrente.
--   - paused_ms:  total de milissegundos já pausados em pausas concluídas
--                 (resumeSession soma o intervalo pausado aqui ao retomar).
--   - paused_at:  timestamp de quando a pausa corrente começou, ou NULL
--                 quando a sessão não está pausada agora. pauseSession()
--                 grava; resumeSession()/finishSession() limpam.
-- Alternativa descartada: uma tabela de log de intervalos de pausa — mais
-- flexível, mas desnecessária: o domínio só precisa do total pausado, nunca
-- da lista de intervalos individuais.

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS paused_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- ── Schema version ────────────────────────────────────────────────────────
-- Ao contrário de 15_questions.sql/16_review_session_link.sql, esta migration
-- passa a ser dependida pelo frontend no mesmo commit (activitySessionService.js
-- passa a ler/gravar paused_ms/paused_at em pauseSession/resumeSession/
-- finishSession) — por isso, seguindo a convenção de 14_schema_version.sql,
-- faz o bump.
UPDATE public.schema_version SET version = 17, applied_at = now() WHERE id = 1;
