-- Execute no SQL Editor do Supabase
-- F15.3 — Observabilidade mínima de produção: erros de frontend no banco.
--
-- Problema: errorService.js categoriza e registra todo erro relevante do
-- frontend, mas apenas num buffer em memória do navegador — nenhum erro de
-- produção chega à desenvolvedora sem relato manual do usuário. Esta tabela
-- estende à captura de erros o mesmo padrão já provado por ai_metrics
-- (08_ai_metrics.sql): coleta mínima, sem PII, consultável via SQL Editor.
--
-- O que É gravado: categoria do erro (auth/network/database/...), contexto
-- curto ("módulo.ação"), mensagem truncada, código/status estruturados e o
-- user agent do navegador. O que NUNCA é gravado: payloads de dados do
-- usuário, títulos de compromissos, conteúdo de sessões, stack traces,
-- e-mails ou qualquer outro dado pessoal — ver errorService._sendReport().
--
-- Requer: 14_schema_version.sql (bump ao final).

create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null,
  context     text,
  message     text,
  code        text,
  http_status int,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.client_errors enable row level security;

-- Insert-only: o usuário autenticado insere apenas as próprias linhas.
-- Nenhuma política de SELECT/UPDATE/DELETE é criada para anon/authenticated —
-- a leitura é exclusiva da desenvolvedora, via SQL Editor (que roda como
-- owner da tabela, fora de RLS). Com RLS habilitado e sem política de
-- SELECT, qualquer consulta com a anon key retorna zero linhas.
create policy "client_errors_insert_own"
  on public.client_errors for insert
  with check (auth.uid() = user_id);

-- Consulta operacional por período (a leitura documentada em
-- docs/OPERATIONS.md usa este índice).
create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

-- ── Schema version ────────────────────────────────────────────────────────
-- 23 = o número desta própria migration, seguindo a convenção de
-- 14_schema_version.sql: o frontend (errorService.js) passa a inserir nesta
-- tabela, portanto o bump é obrigatório no mesmo commit.

UPDATE public.schema_version SET version = 23, applied_at = now() WHERE id = 1;
