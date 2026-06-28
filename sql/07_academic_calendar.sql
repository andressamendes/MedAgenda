-- Execute no SQL Editor do Supabase
-- Etapa 17: Calendário Acadêmico

-- ── academic_calendars ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academic_calendars (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  university    TEXT,
  academic_year TEXT,
  color         TEXT        NOT NULL DEFAULT '#7c3aed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academic_calendars_user_id_idx
  ON academic_calendars (user_id);

CREATE TRIGGER academic_calendars_updated_at
  BEFORE UPDATE ON academic_calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE academic_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own academic calendars"
  ON academic_calendars FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own academic calendars"
  ON academic_calendars FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own academic calendars"
  ON academic_calendars FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own academic calendars"
  ON academic_calendars FOR DELETE
  USING (user_id = auth.uid());

-- ── academic_events ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS academic_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id   UUID        NOT NULL REFERENCES academic_calendars(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  start_date    DATE        NOT NULL,
  end_date      DATE,
  all_day       BOOLEAN     NOT NULL DEFAULT true,
  color         TEXT,
  category      TEXT,
  location      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academic_events_calendar_id_idx
  ON academic_events (calendar_id);

CREATE INDEX IF NOT EXISTS academic_events_start_date_idx
  ON academic_events (start_date);

CREATE TRIGGER academic_events_updated_at
  BEFORE UPDATE ON academic_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE academic_events ENABLE ROW LEVEL SECURITY;

-- RLS via join: only the calendar owner can access its events
CREATE POLICY "Users can view own academic events"
  ON academic_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academic_calendars
      WHERE id = calendar_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own academic events"
  ON academic_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM academic_calendars
      WHERE id = calendar_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own academic events"
  ON academic_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM academic_calendars
      WHERE id = calendar_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own academic events"
  ON academic_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM academic_calendars
      WHERE id = calendar_id AND user_id = auth.uid()
    )
  );
