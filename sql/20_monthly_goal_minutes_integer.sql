-- Execute no SQL Editor do Supabase
-- Requer: 12_time_goals.sql (coluna monthly_goal_minutes), 14_schema_version.sql
--
-- AUD-006 — monthly_goal_minutes: SMALLINT não comporta o intervalo aceito.
--
-- Contexto: 12_time_goals.sql declarou monthly_goal_minutes como SMALLINT com
-- CHECK (... BETWEEN 5 AND 44640), mas o SMALLINT do Postgres vai só até
-- 32767. timeGoals.js (GOAL_LIMITS.monthly.max = 44640) e o formulário de
-- conta (accountView.js) sempre aceitaram o intervalo completo — qualquer
-- valor entre 32768 e 44640 passa nas validações da aplicação e do CHECK,
-- mas falha na gravação com o erro genérico de overflow do Postgres.
--
-- daily_goal_minutes (máx. 1440) e weekly_goal_minutes (máx. 10080) cabem
-- em SMALLINT normalmente e não são alterados aqui.
--
-- Esta migration amplia o tipo da coluna para INTEGER — comporta folgadamente
-- o intervalo de 5 a 44640 já validado em UI/aplicação/CHECK, sem exigir
-- nenhuma mudança de limite nesses pontos.

ALTER TABLE public.profiles
  ALTER COLUMN monthly_goal_minutes TYPE INTEGER;

-- ── Schema version ────────────────────────────────────────────────────────────
-- 20 = o número desta própria migration, seguindo a convenção de
-- 14_schema_version.sql / 19_activity_sessions_running_unique.sql.

UPDATE public.schema_version SET version = 20, applied_at = now() WHERE id = 1;
