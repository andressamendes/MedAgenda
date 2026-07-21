-- Execute no SQL Editor do Supabase
-- Requer: 15_questions.sql (tabela questions), 11_activity_sessions.sql
-- (activity_sessions.category_id), 14_schema_version.sql
--
-- F17 — Refatoração do Registro de Questões + Estatísticas do Diário.
-- Até aqui, questions.status era só andamento (pending/answered/skipped) —
-- nunca resultado, como o próprio comentário de 15_questions.sql já
-- registrava ("desempenho é um consumidor futuro derivado, não um campo
-- bruto desta tabela"). Esta é essa etapa futura.
--
-- Desenho: cada linha de `questions` passa a representar um LANÇAMENTO (uma
-- ou várias questões do mesmo tipo/matéria/tópico resolvidas de uma vez —
-- "resolvi 8 questões de Cardiologia, errei 2"), não uma questão individual.
-- Por isso os dois campos novos são contadores (correct_count/
-- incorrect_count), não um booleano por linha: cobre tanto o registro rápido
-- de uma única questão (1/0 ou 0/1) quanto um bloco inteiro, sem precisar de
-- N inserts por bloco resolvido.
--
-- ADD COLUMN ... DEFAULT 0 preenche as linhas já existentes com 0/0
-- automaticamente (metadata-only default, Postgres 11+) — nenhum backfill
-- manual, nenhuma linha antiga perde dado, e "campos inexistentes tratados
-- como zero" (compatibilidade exigida pela F17) já é o comportamento
-- nativo: sessões antigas somam 0 em ambos os contadores, então não entram
-- no total de questões respondidas nem distorcem o índice de acerto.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS correct_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incorrect_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_correct_count_check   CHECK (correct_count >= 0),
  ADD CONSTRAINT questions_incorrect_count_check CHECK (incorrect_count >= 0);

-- ── RPC: agregação de estatísticas ──────────────────────────────────────────
-- Roda com o papel de quem chama (padrão do Postgres, sem elevar
-- privilégio), então a RLS de `questions`/`activity_sessions` já filtra por
-- user_id sozinha, sem precisar repetir `WHERE user_id = auth.uid()`
-- manualmente sobre uma execução privilegiada. Todos os filtros são
-- opcionais (NULL = não filtra); a checagem de matéria é `ILIKE` para casar
-- com o texto livre digitado em questions.subject.
--
-- Filtra por session_id → activity_sessions apenas quando p_category_id não
-- é NULL — assim uma questão sem sessão associável (não deveria existir,
-- questions.session_id é NOT NULL) nunca quebra o filtro por omissão.
CREATE OR REPLACE FUNCTION public.get_question_statistics(
  p_start       DATE DEFAULT NULL,
  p_end         DATE DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_subject     TEXT DEFAULT NULL
)
RETURNS TABLE (total INTEGER, correct INTEGER, incorrect INTEGER)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(q.correct_count + q.incorrect_count), 0)::INTEGER AS total,
    COALESCE(SUM(q.correct_count), 0)::INTEGER                     AS correct,
    COALESCE(SUM(q.incorrect_count), 0)::INTEGER                   AS incorrect
  FROM public.questions q
  JOIN public.activity_sessions s ON s.id = q.session_id
  WHERE q.user_id = auth.uid()
    AND (p_start IS NULL OR q.created_at::date >= p_start)
    AND (p_end   IS NULL OR q.created_at::date <= p_end)
    AND (p_category_id IS NULL OR s.category_id = p_category_id)
    AND (p_subject IS NULL OR q.subject ILIKE '%' || p_subject || '%')
$$;

-- ── Schema version ────────────────────────────────────────────────────────
-- 25 = o número desta própria migration: studySessionView.js/
-- studyJournalView.js/studyStatisticsService.js passam a depender das
-- colunas e da função acima no mesmo commit, portanto o bump é obrigatório.

UPDATE public.schema_version SET version = 25, applied_at = now() WHERE id = 1;
