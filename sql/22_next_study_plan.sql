-- ============================================================
-- F14.8 — Fechar o dia
-- Extensão da tabela profiles: plano do primeiro estudo de amanhã
-- ============================================================
-- "Fechar o dia" (todayView.js) grava aqui, opcionalmente, o que o
-- estudante pretende estudar amanhã — um único campo 1:1 com o usuário,
-- mesma relação que daily_goal_minutes já tem com profiles (12_time_goals.sql).
-- Reaproveita a tabela existente em vez de criar uma nova para um dado tão
-- pequeno. studySessionView.js lê esses dois campos para oferecer um chip de
-- início de sessão ("Amanhã: {título}") e os limpa assim que o chip é usado.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS next_study_title       TEXT,
  ADD COLUMN IF NOT EXISTS next_study_category_id UUID
    REFERENCES public.categories(id) ON DELETE SET NULL;

-- ── Schema version ────────────────────────────────────────────────────────
-- 22 = o número desta própria migration, seguindo a convenção de
-- 14_schema_version.sql / 21_activity_sessions_standalone_fields.sql.

UPDATE public.schema_version SET version = 22, applied_at = now() WHERE id = 1;
