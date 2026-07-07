-- Execute no SQL Editor do Supabase
-- Requer: 11_activity_sessions.sql (tabela activity_sessions), 13_reviews.sql
-- (tabela reviews)
--
-- F6.10 — Integração Sessão ↔ Revisão.
-- Apenas a coluna e a FK que ligam uma Revisão à Sessão que a executou.
-- Nenhuma regra de Dashboard, IA, Recommendation, Planning, Reflection,
-- Decision Engine, User Memory, Subject Progress ou Conquistas — e nenhuma
-- alteração em activity_sessions (a Sessão não passa a "conhecer" Revisão,
-- a referência é de mão única, de reviews para activity_sessions).
--
-- Estratégia: reviews.session_id (nullable) + FK ON DELETE SET NULL, e não
-- o inverso (activity_sessions.review_id) nem uma tabela de junção N:N.
-- Motivos:
--   1. Cardinalidade real é 1:N (uma Sessão pode "cobrir" várias Revisões
--      pendentes do mesmo compromisso; uma Revisão aponta para no máximo
--      uma Sessão que a executou) — colocar a FK do lado "N" (reviews) é o
--      desenho relacional padrão, sem precisar de tabela de junção.
--   2. NULLABLE (não NOT NULL): ao contrário de questions.session_id
--      (15_questions.sql, onde a Questão nunca existe sem Sessão — relação
--      de composição), aqui a associação é opcional nos dois sentidos — o
--      teto do domínio (ver REGRAS do card F6.10) exige que uma Revisão
--      possa existir sem Sessão e vice-versa.
--   3. ON DELETE SET NULL (não CASCADE): a Sessão é o registro factual de
--      estudo; a Revisão é o controle do ciclo de revisão espaçada — são
--      dois ciclos de vida independentes (mesma separação de
--      13_reviews.sql). Excluir a Sessão que executou uma Revisão não deve
--      apagar a Revisão (ela continua existindo, só perde a referência de
--      "quem a executou"); o inverso (excluir a Revisão) nunca toca a
--      Sessão, pois a FK vive exclusivamente em reviews.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.activity_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reviews_session_id_idx ON public.reviews (session_id);

-- ── Schema version ────────────────────────────────────────────────────────
-- Nenhum UPDATE em public.schema_version nesta migration, pelo mesmo motivo
-- de 15_questions.sql: nenhuma view/service consumidor visual foi conectado
-- nesta etapa (reviewSessionService.js é a única camada nova, sem Dashboard/
-- Insights/Histórico dependendo dela) — o bump fica para a etapa que
-- conectar esta relação a um consumidor real.
