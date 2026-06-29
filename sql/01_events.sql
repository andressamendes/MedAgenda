-- ============================================================
-- Migration 01 — Tabela fundacional: public.events
-- Execute no SQL Editor do Supabase antes de todas as demais.
-- ============================================================

-- Função reutilizável para manter updated_at sincronizado.
-- Referenciada por migrations posteriores (02_categories, 07_academic_calendar).
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Tabela principal de compromissos ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                   TEXT        NOT NULL,
  event_date              DATE        NOT NULL,
  start_time              TIME,
  duration_minutes        INTEGER,
  category                TEXT,
  color                   TEXT,
  location                TEXT,
  description             TEXT,
  reminder_minutes        INTEGER,
  -- Recorrência: também adicionadas por 03_recurrence.sql (IF NOT EXISTS, idempotente)
  recurrence_type         TEXT        NOT NULL DEFAULT 'none',
  recurrence_interval     INTEGER,
  recurrence_until        DATE,
  recurrence_days_of_week TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT events_recurrence_type_check CHECK (
    recurrence_type IN ('none','daily','weekdays','weekly','biweekly','monthly','yearly','custom')
  )
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS events_user_id_idx
  ON public.events (user_id);

-- Índice composto otimiza as queries filtradas por usuário + data
CREATE INDEX IF NOT EXISTS events_user_date_idx
  ON public.events (user_id, event_date);

-- ── Trigger: mantém updated_at atualizado ─────────────────────────────────────

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON public.events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own events"
  ON public.events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own events"
  ON public.events FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own events"
  ON public.events FOR DELETE
  USING (user_id = auth.uid());
