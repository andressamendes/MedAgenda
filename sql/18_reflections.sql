-- Execute no SQL Editor do Supabase
-- Requer: 01_events.sql (define update_updated_at), 11_activity_sessions.sql
--
-- F8.2 — Infraestrutura do domínio Reflexão da Sessão (Reflection Journal).
-- Apenas a tabela, RLS, índice e trigger. Nenhuma lógica de IA, nenhum
-- resumo automático, nenhuma análise de sentimento — só o texto livre que o
-- usuário escreve sobre a própria Sessão.
--
-- Reflexão é um conceito distinto de Observações (activity_sessions.notes,
-- ver 11_activity_sessions.sql): Observações representam o estudo em si
-- (o que foi feito na Sessão); Reflexão representa a aprendizagem (o que o
-- usuário tirou de aprendizado dela). Por isso esta migration não toca
-- activity_sessions — cria uma tabela própria, nunca reaproveita a coluna
-- `notes` existente.
--
-- Relação: Sessão 1:1 Reflexão (no máximo uma reflexão por sessão) — a
-- UNIQUE constraint em session_id garante isso no banco, e o service usa
-- UPSERT (ON CONFLICT session_id) para "criar ou editar" sem duplicar
-- linhas. Mesmo desenho de cascata de 15_questions.sql: se a Sessão for
-- excluída, a Reflexão deixa de fazer sentido como registro (não há
-- "reflexão órfã") e é excluída junto — ON DELETE CASCADE.
--
-- Esta migration não publica eventos próprios (sessionEventBus.js não é
-- tocado) e não altera nenhum outro domínio (Dashboard, Insights, IA,
-- Conquistas, Progresso, Estatísticas, Study Streak).

CREATE TABLE public.reflections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        UUID        NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  content           TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reflections_session_id_unique UNIQUE (session_id),
  CONSTRAINT reflections_content_not_blank CHECK (btrim(content) <> '')
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX reflections_user_id_idx ON public.reflections (user_id);

-- ── Trigger: mantém updated_at atualizado (reutiliza a função de 01_events.sql) ─

CREATE TRIGGER reflections_updated_at
  BEFORE UPDATE ON public.reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reflections"
  ON public.reflections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own reflections"
  ON public.reflections FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own reflections"
  ON public.reflections FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own reflections"
  ON public.reflections FOR DELETE
  USING (user_id = auth.uid());

-- ── Schema version ────────────────────────────────────────────────────────────
-- 18 = o número desta própria migration. O frontend passa a depender desta
-- tabela nesta mesma etapa (studyJournalView.js consome
-- studyReflectionService.js), por isso o bump acontece aqui, seguindo a
-- convenção de 14_schema_version.sql.

UPDATE public.schema_version SET version = 18, applied_at = now() WHERE id = 1;
