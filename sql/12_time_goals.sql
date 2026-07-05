-- ============================================================
-- F2.2 — Metas de Tempo
-- Extensão da tabela profiles: metas pessoais de tempo de estudo/atividade
-- ============================================================
-- Metas são 1:1 com o usuário e apenas informativas (sem recomendação
-- automática) — a mesma relação que timezone/theme já têm com profiles.
-- Reaproveita a tabela existente em vez de criar uma nova.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_goal_minutes   SMALLINT
    CHECK (daily_goal_minutes   IS NULL OR daily_goal_minutes   BETWEEN 5 AND 1440),
  ADD COLUMN IF NOT EXISTS weekly_goal_minutes  SMALLINT
    CHECK (weekly_goal_minutes  IS NULL OR weekly_goal_minutes  BETWEEN 5 AND 10080),
  ADD COLUMN IF NOT EXISTS monthly_goal_minutes SMALLINT
    CHECK (monthly_goal_minutes IS NULL OR monthly_goal_minutes BETWEEN 5 AND 44640);
