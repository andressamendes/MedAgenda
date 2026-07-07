-- Execute no SQL Editor do Supabase
-- Requer: 01_events.sql (define update_updated_at), 11_activity_sessions.sql
--
-- F6.7 — Infraestrutura do domínio Questões Resolvidas.
-- Apenas a tabela, RLS, índices e triggers. Sem estatísticas, sem acertos/
-- erros, sem tempo por questão, sem conquistas, sem tela — isso fica para
-- etapas futuras que consumirão questionService.js. Esta migration também
-- não altera activity_sessions (nenhuma coluna nova) nem publica eventos
-- próprios: a Sessão continua sendo o único evento raiz (F6.1/F6.2).
--
-- Relação: Sessão 1:N Questões (F6.1). Uma questão nunca existe sem uma
-- sessão — o mesmo desenho já usado em 13_reviews.sql para revisões, que
-- nunca existem sem o compromisso original. Por isso session_id é
-- NOT NULL REFERENCES ... ON DELETE CASCADE: se a sessão de atividade for
-- excluída, suas questões deixam de fazer sentido como registro (não há
-- "questão órfã" no domínio) e são excluídas junto — o mesmo raciocínio de
-- reviews.event_id, e não o SET NULL usado em activity_sessions.event_id,
-- onde a sessão sobrevive à exclusão do compromisso por ser ela própria o
-- registro de execução independente.
--
-- `status` aqui é o andamento da questão no fluxo do usuário (pending/
-- answered/skipped), nunca "correto/incorreto" — desempenho é um
-- consumidor futuro derivado, não um campo bruto desta tabela.

CREATE TABLE public.questions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        UUID        NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
  question_type     TEXT        NOT NULL DEFAULT 'multiple_choice',
  status            TEXT        NOT NULL DEFAULT 'pending',
  difficulty        TEXT        NOT NULL DEFAULT 'medium',
  subject           TEXT,
  topic             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT questions_question_type_check CHECK (
    question_type IN ('multiple_choice', 'true_false', 'open', 'flashcard')
  ),
  CONSTRAINT questions_status_check CHECK (
    status IN ('pending', 'answered', 'skipped')
  ),
  CONSTRAINT questions_difficulty_check CHECK (
    difficulty IN ('easy', 'medium', 'hard')
  )
);

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX questions_user_id_idx ON public.questions (user_id);
CREATE INDEX questions_session_id_idx ON public.questions (session_id);
CREATE INDEX questions_user_status_idx ON public.questions (user_id, status);

-- ── Trigger: mantém updated_at atualizado (reutiliza a função de 01_events.sql) ─

CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions"
  ON public.questions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own questions"
  ON public.questions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own questions"
  ON public.questions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own questions"
  ON public.questions FOR DELETE
  USING (user_id = auth.uid());

-- ── Schema version ────────────────────────────────────────────────────────────
-- Nenhum UPDATE em public.schema_version nesta migration: o frontend ainda
-- não depende deste schema (nenhuma view/service consumidor foi conectado
-- nesta etapa — ver restrições da F6.7). A convenção de 14_schema_version.sql
-- exige o bump apenas quando o build passa a depender da tabela; isso
-- acontecerá na etapa que conectar Questões aos seus consumidores.
