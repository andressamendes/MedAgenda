-- Execute no SQL Editor do Supabase
-- Sem dependências de outras migrations (tabela independente).
--
-- P0 — Sistema de Proteção contra Divergência de Schema (Deploy Seguro).
--
-- Contexto do incidente que esta migration existe para prevenir: o frontend
-- foi publicado no GitHub Pages enquanto as migrations 11, 12 e 13 ainda não
-- haviam sido aplicadas em produção — Dashboard, Central de Insights e
-- Histórico de Sessões passaram a consultar tabelas inexistentes. Não havia
-- nenhuma forma, em tempo de build ou de bootstrap do app, de saber que o
-- banco estava desatualizado antes que o usuário batesse nesse erro.
--
-- Esta tabela é a única fonte de verdade sobre "qual é a versão do schema
-- atualmente aplicada neste banco". Uma única linha (id = 1), sem histórico
-- de versões anteriores — não é um log de migrations, apenas o número da
-- mais recente já aplicada. schemaService.js (frontend) lê essa linha no
-- bootstrap e compara com EXPECTED_SCHEMA_VERSION; o workflow deploy.yml lê
-- a mesma linha (via REST, com a anon key) antes de publicar o frontend.
--
-- Convenção obrigatória daqui em diante: toda nova migration numerada que o
-- frontend passe a depender deve terminar com:
--
--   UPDATE public.schema_version SET version = <N>, applied_at = now() WHERE id = 1;
--
-- onde <N> é o número da própria migration (ex.: 15, 16...). Sem essa linha,
-- a migration não "conta" para o mecanismo de proteção — o app continuará
-- bloqueado (ou, pior, destravado sem que o schema novo exista de fato).

CREATE TABLE IF NOT EXISTS public.schema_version (
  id          SMALLINT     PRIMARY KEY DEFAULT 1,
  version     INTEGER      NOT NULL,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT schema_version_single_row CHECK (id = 1)
);

-- Semeia (ou atualiza, se a migration for reexecutada) a versão atual.
-- 14 = o número desta própria migration, a primeira a ser rastreada — 01-13
-- já estão aplicadas em qualquer banco que chegue até aqui, por isso não
-- precisam de rastreamento retroativo.
INSERT INTO public.schema_version (id, version)
VALUES (1, 14)
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = now();

-- ── Row Level Security ────────────────────────────────────────────────────
-- Esta tabela não guarda dado de usuário nenhum, só um inteiro público (a
-- versão do schema) — por isso, ao contrário de toda outra tabela do
-- projeto, a leitura é liberada tanto para `anon` quanto para `authenticated`:
--   - `authenticated`: o frontend, já logado, faz essa leitura no bootstrap
--     (ver schemaService.js) antes de inicializar Dashboard/Insights/
--     Histórico/IA/Sessões.
--   - `anon`: o passo de validação do deploy.yml consulta essa mesma linha
--     usando a SUPABASE_ANON_KEY (já exposta ao navegador de qualquer forma)
--     via REST, sem sessão de usuário, para bloquear a publicação do
--     frontend quando o banco estiver desatualizado.
-- Nenhuma política de INSERT/UPDATE/DELETE é criada para `anon`/`authenticated`
-- — apenas o SQL Editor (que roda como owner da tabela, ignorando RLS) pode
-- alterar a versão, exatamente como as demais migrations.
ALTER TABLE public.schema_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read schema version"
  ON public.schema_version FOR SELECT
  TO anon, authenticated
  USING (true);
