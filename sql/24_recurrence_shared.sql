-- Execute no SQL Editor do Supabase
-- F16 — Recorrência compartilhada entre Compromissos (events) e Calendários
-- Acadêmicos (academic_events).
--
-- Aditivo apenas: nenhuma coluna/linha existente é removida ou renomeada.
-- Compromissos e eventos acadêmicos já cadastrados continuam funcionando sem
-- qualquer alteração (recurrence_type novo nasce 'none' nos dois casos).

-- ── events: fim da recorrência por número de ocorrências ────────────────────
-- Complementa recurrence_until (03_recurrence.sql): a recorrência agora pode
-- terminar por data OU por contagem. Os dois campos são mutuamente
-- exclusivos na UI, mas nada no schema impede ambos coexistirem — o core de
-- expansão (recurrence-core.js) aplica o limite mais restritivo primeiro.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_count     INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_recurrence_parent_idx
  ON events (recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- ── academic_events: mesmo vocabulário de recorrência de events ─────────────
-- Reaproveita literalmente os mesmos nomes/semântica de coluna e o mesmo
-- motor de expansão (recurrence-core.js) — nenhum novo domínio de
-- recorrência é criado, só estendido para esta tabela.
ALTER TABLE academic_events
  ADD COLUMN IF NOT EXISTS recurrence_type         TEXT        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval      INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_until         DATE,
  ADD COLUMN IF NOT EXISTS recurrence_count         INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_days_of_week  TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id     UUID REFERENCES academic_events(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE academic_events
    ADD CONSTRAINT academic_events_recurrence_type_check CHECK (
      recurrence_type IN ('none','daily','weekdays','weekly','biweekly','monthly','yearly','custom')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS academic_events_recurrence_parent_idx
  ON academic_events (recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- ── recurrence_exceptions: exceções pontuais de uma ocorrência ──────────────
-- Estratégia escolhida (ver docs/F16_RECORRENCIA.md): a série continua sendo
-- expandida dinamicamente (RRULE-like, sem materializar linhas por
-- ocorrência). Para permitir editar/excluir "apenas esta ocorrência" sem
-- gerar uma linha por data, cada exceção é um registro pequeno: ou marca a
-- data como cancelada (is_cancelled), ou carrega os campos que sobrescrevem
-- aquela ocorrência específica (override) — mesmo modelo EXDATE/
-- RECURRENCE-ID do padrão iCalendar. "Esta e as próximas" não usa esta
-- tabela: divide a série (ver recurrenceService.js).
--
-- source_table é polimórfico por necessidade (compromissos e eventos
-- acadêmicos são tabelas fisicamente distintas, sem hierarquia comum) — a
-- integridade referencial é garantida em nível de aplicação
-- (recurrenceService.js sempre resolve o evento-base antes de gravar uma
-- exceção) e a segurança por RLS via user_id, gravado diretamente na linha
-- (evita JOIN polimórfico nas políticas).
CREATE TABLE IF NOT EXISTS public.recurrence_exceptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table   TEXT        NOT NULL CHECK (source_table IN ('events', 'academic_events')),
  base_event_id  UUID        NOT NULL,
  occurrence_date DATE       NOT NULL,
  is_cancelled   BOOLEAN     NOT NULL DEFAULT false,
  override       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recurrence_exceptions_unique
    UNIQUE (source_table, base_event_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS recurrence_exceptions_base_idx
  ON public.recurrence_exceptions (source_table, base_event_id);

DROP TRIGGER IF EXISTS recurrence_exceptions_updated_at ON public.recurrence_exceptions;
CREATE TRIGGER recurrence_exceptions_updated_at
  BEFORE UPDATE ON public.recurrence_exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.recurrence_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recurrence exceptions"
  ON public.recurrence_exceptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own recurrence exceptions"
  ON public.recurrence_exceptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own recurrence exceptions"
  ON public.recurrence_exceptions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own recurrence exceptions"
  ON public.recurrence_exceptions FOR DELETE
  USING (user_id = auth.uid());

-- ── Schema version ────────────────────────────────────────────────────────
-- 24 = o número desta própria migration, seguindo a convenção de
-- 14_schema_version.sql: o frontend (academicCalendarService.js,
-- recurrenceService.js) passa a depender das colunas/tabela acima, portanto
-- o bump é obrigatório no mesmo commit.

UPDATE public.schema_version SET version = 24, applied_at = now() WHERE id = 1;
