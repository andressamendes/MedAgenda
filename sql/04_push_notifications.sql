-- ── push_subscriptions ────────────────────────────────────────────────────
-- Stores Web Push subscriptions per user/device.
-- A single user can have multiple subscriptions (mobile, desktop, notebook).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint
  ON push_subscriptions (user_id, endpoint);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_select" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_update" ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "push_subscriptions_delete" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ── notification_logs ──────────────────────────────────────────────────────
-- Records every sent notification to prevent duplicates.
-- Kept separate from `events` to handle recurring events cleanly and
-- provide an audit trail for debugging and future analytics.
CREATE TABLE IF NOT EXISTS notification_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_date  DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'sent',  -- sent | failed
  error       TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One log per user × event × occurrence date prevents duplicate pushes
CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_dedup
  ON notification_logs (user_id, event_id, event_date);

CREATE INDEX IF NOT EXISTS notification_logs_sent_at_idx
  ON notification_logs (sent_at);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_logs_select" ON notification_logs
  FOR SELECT USING (auth.uid() = user_id);

-- The Edge Function runs with service_role, bypassing RLS.
-- No extra INSERT/UPDATE policy is required for it.

-- Cleanup function: remove logs older than 90 days (call via pg_cron if desired)
CREATE OR REPLACE FUNCTION cleanup_old_notification_logs()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM notification_logs WHERE sent_at < now() - interval '90 days';
$$;

-- ── Supabase Scheduler setup ───────────────────────────────────────────────
-- The Edge Function `send-push-notifications` must run every minute.
--
-- OPTION A — Supabase Dashboard (recommended, no pg_cron needed):
--   1. Go to: Project → Edge Functions → send-push-notifications
--   2. Enable "Schedule" and set cron expression: * * * * *
--
-- OPTION B — pg_cron + pg_net (SQL Editor):
--   Run the block below after enabling both extensions in Project → Extensions.
--   Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your actual values.
--
-- SELECT cron.schedule(
--   'medagenda-push-notifications',
--   '* * * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push-notifications',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--       ),
--       body := '{}'::jsonb
--     ) AS request_id;
--   $$
-- );
