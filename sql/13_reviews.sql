-- Execute no SQL Editor do Supabase
-- Requer: 01_events.sql (define update_updated_at, public.events)
--
-- F2.3 — Infraestrutura do Sistema de Revisões Inteligentes.
-- Apenas a tabela, RLS e índices. Sem IA, sem notificações, sem dashboard,
-- sem geração automática — só o modelo de dados e as operações básicas
-- (create/complete/skip/list), consumidas por reviewService.js.
--
-- Tabela nova (não reaproveita "events"): uma revisão não é um compromisso
-- na agenda — não tem horário, duração, local, recorrência própria, etc. —
-- e um único evento pode ter várias revisões futuras simultâneas apontando
-- para a mesma data original. Sobrecarregar "events" com status de revisão
-- misturaria dois ciclos de vida independentes (o do compromisso e o da
-- revisão) e complicaria a lógica de recorrência já existente em
-- recurrence-core.js. Uma tabela dedicada, referenciando "events" por FK,
-- mantém os dois conceitos desacoplados — como já feito em
-- 11_activity_sessions.sql para as sessões de atividade.

CREATE TABLE public.reviews (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id          UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scheduled_date    DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  completed_at      TIMESTAMPTZ,
  review_type       TEXT        NOT NULL DEFAULT 'manual',
  origin            TEXT        NOT NULL DEFAULT 'user',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reviews_status_check CHECK (
    status IN ('pending', 'completed', 'skipped')
  ),
  CONSTRAINT reviews_review_type_check CHECK (
    review_type IN ('manual', 'automatic')
  ),
  CONSTRAINT reviews_origin_check CHECK (
    origin IN ('event', 'ai', 'user')
  )
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX reviews_user_id_idx ON public.reviews (user_id);
CREATE INDEX reviews_event_id_idx ON public.reviews (event_id);
CREATE INDEX reviews_user_status_idx ON public.reviews (user_id, status);
CREATE INDEX reviews_scheduled_date_idx ON public.reviews (scheduled_date);

-- ── Trigger: mantém updated_at atualizado (reutiliza a função de 01_events.sql) ─

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reviews"
  ON public.reviews FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own reviews"
  ON public.reviews FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own reviews"
  ON public.reviews FOR DELETE
  USING (user_id = auth.uid());
