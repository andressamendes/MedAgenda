-- Execute no SQL Editor do Supabase
-- Requer: 01_events.sql (define update_updated_at)
--
-- F1.1 — Infraestrutura das Sessões de Atividade.
-- Apenas a tabela, RLS e índices. Sem cronômetro, sem UI, sem regras de negócio.

CREATE TABLE public.activity_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id          UUID        REFERENCES public.events(id) ON DELETE SET NULL,
  category_id       UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'running',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  duration_minutes  INTEGER,
  source            TEXT        NOT NULL DEFAULT 'manual',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT activity_sessions_status_check CHECK (
    status IN ('running', 'paused', 'finished', 'cancelled')
  ),
  CONSTRAINT activity_sessions_source_check CHECK (
    source IN ('quick', 'event', 'manual')
  )
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX activity_sessions_user_id_idx ON public.activity_sessions (user_id);
CREATE INDEX activity_sessions_event_id_idx ON public.activity_sessions (event_id);
CREATE INDEX activity_sessions_started_at_idx ON public.activity_sessions (started_at);

-- ── Trigger: mantém updated_at atualizado (reutiliza a função de 01_events.sql) ─

CREATE TRIGGER activity_sessions_updated_at
  BEFORE UPDATE ON public.activity_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity sessions"
  ON public.activity_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own activity sessions"
  ON public.activity_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activity sessions"
  ON public.activity_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own activity sessions"
  ON public.activity_sessions FOR DELETE
  USING (user_id = auth.uid());
