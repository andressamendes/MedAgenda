-- Execute no SQL Editor do Supabase
-- Requer: 11_activity_sessions.sql, 14_schema_version.sql
--
-- Refatoração do fluxo "Sessão de Estudo" — antes, o único ponto de entrada
-- era "Iniciar sessão avulsa": a sessão começava IMEDIATAMENTE, sem nenhuma
-- etapa de configuração, e Compromisso/Categoria/Conteúdo/Data/Tempo previsto
-- ficavam em branco pelo resto da sessão sempre que ela não vinha de um
-- compromisso (event_id NULL).
--
-- Agora, iniciar uma sessão sempre passa por um modal de configuração
-- pré-início (studySessionView.js) com dois caminhos: vincular um compromisso
-- já existente (event_id, já suportado desde 11_activity_sessions.sql) OU
-- digitar livremente um nome de estudo — este segundo caminho precisa de um
-- lugar para gravar os mesmos campos que um compromisso já fornece
-- (título/conteúdo/data/tempo previsto), já que não há `events` row para
-- resolvê-los. `category_id` já existe (11_activity_sessions.sql) e é
-- reaproveitado sem alteração.
--
-- Todas as colunas são nullable e permanecem NULL para sessões vinculadas a
-- um compromisso (o título/categoria/conteúdo/data/duração continuam vindo
-- de `events`, resolvidos por event_id — nenhuma duplicação de dado).

ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS title                     TEXT,
  ADD COLUMN IF NOT EXISTS content                    TEXT,
  ADD COLUMN IF NOT EXISTS session_date                DATE,
  ADD COLUMN IF NOT EXISTS planned_duration_minutes    INTEGER
    CHECK (planned_duration_minutes IS NULL OR planned_duration_minutes > 0);

-- ── Schema version ────────────────────────────────────────────────────────────
-- 21 = o número desta própria migration, seguindo a convenção de
-- 14_schema_version.sql / 20_monthly_goal_minutes_integer.sql.

UPDATE public.schema_version SET version = 21, applied_at = now() WHERE id = 1;
