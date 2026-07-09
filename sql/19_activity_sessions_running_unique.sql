-- Execute no SQL Editor do Supabase
-- Requer: 11_activity_sessions.sql (tabela activity_sessions), 14_schema_version.sql
--
-- AUD-001 — Integridade: no máximo uma sessão "running" por usuário.
--
-- Contexto: startSession() valida isso hoje só na aplicação (getRunningSession()
-- seguido de INSERT, ver activitySessionService.js). Duas abas/dispositivos
-- chamando startSession() ao mesmo tempo podem passar pela leitura antes que o
-- INSERT concorrente seja confirmado, criando duas sessões "running" simultâneas
-- para o mesmo usuário. A partir daí getRunningSession().maybeSingle() passa a
-- falhar (mais de uma linha), quebrando a restauração da sessão e o início de
-- novas sessões — só correção manual no banco resolve.
--
-- Esta migration move a validação para o banco, como última linha de defesa:
-- um índice único parcial que rejeita qualquer segunda linha "running" para o
-- mesmo user_id. paused/finished/cancelled continuam ilimitados (a condição
-- WHERE do índice só alcança status = 'running'). A aplicação continua
-- validando normalmente antes disso — este índice nunca deveria disparar em
-- uso normal, só na corrida entre requisições concorrentes.
--
-- Falha explícita em dados já inconsistentes: se o banco já tiver mais de uma
-- sessão "running" para o mesmo usuário, o bloco abaixo interrompe a migration
-- com uma mensagem clara (em vez de deixar o CREATE UNIQUE INDEX abortar com o
-- erro genérico de índice do Postgres). A correção desses dados é manual — esta
-- migration nunca apaga nem escolhe automaticamente qual sessão manter.

DO $$
DECLARE
  offending_user UUID;
  offending_count INTEGER;
BEGIN
  SELECT user_id, COUNT(*)
    INTO offending_user, offending_count
    FROM public.activity_sessions
   WHERE status = 'running'
   GROUP BY user_id
  HAVING COUNT(*) > 1
   LIMIT 1;

  IF offending_user IS NOT NULL THEN
    RAISE EXCEPTION
      'AUD-001: usuário % já possui % sessões "running" simultâneas em activity_sessions. Corrija manualmente (finalize ou cancele as duplicadas) antes de reexecutar esta migration.',
      offending_user, offending_count;
  END IF;
END $$;

-- ── Índice único parcial ─────────────────────────────────────────────────────
-- IF NOT EXISTS torna a migration idempotente (reexecutá-la depois de aplicada
-- não falha nem duplica o índice).

CREATE UNIQUE INDEX IF NOT EXISTS activity_sessions_one_running_per_user
  ON public.activity_sessions (user_id)
  WHERE status = 'running';

-- ── Schema version ────────────────────────────────────────────────────────────
-- 19 = o número desta própria migration. activitySessionService.js passa a
-- depender dela nesta mesma etapa (startSession()/resumeSession() convertem a
-- violação desta constraint no erro de domínio SESSION_ALREADY_RUNNING), por
-- isso o bump acontece aqui, seguindo a convenção de 14_schema_version.sql.

UPDATE public.schema_version SET version = 19, applied_at = now() WHERE id = 1;
