# Banco de Dados Anoti

> Documento oficial do schema do Anoti. Cobre as 20 migrations em `sql/*.sql` (01 a 20) e reflete exatamente o estado atual do banco — tabelas, colunas, relacionamentos, chaves estrangeiras, índices, constraints, políticas RLS e comportamento `ON DELETE`. Para o modelo de domínio (como as tabelas se compõem em Compromisso → Sessão → Questões → Revisões → Reflexão → Projeções) e o Session Event Bus, ver [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Visão Geral

O Anoti utiliza o **PostgreSQL** como banco de dados relacional, gerenciado pela plataforma **Supabase**. A arquitetura é fundamentada em três pilares:

- **Row Level Security (RLS):** todas as tabelas de dados do usuário têm RLS habilitado. O acesso é restrito ao próprio dono dos dados por meio de `auth.uid()`, eliminando a necessidade de filtros manuais no backend para isolamento de usuários.
- **Supabase Auth:** a autenticação é delegada inteiramente ao Supabase (`auth.users`). As tabelas de domínio referenciam `auth.users(id)` via chave estrangeira com `ON DELETE CASCADE`.
- **Edge Functions:** operações que requerem privilégios elevados (como inserir logs de notificação ou enviar push) são executadas via Edge Functions com `service_role`, contornando o RLS de forma controlada e auditada.

As migrations estão organizadas em arquivos numerados sequencialmente em `/sql` (`01` a `20`), devendo ser executadas em ordem no SQL Editor do Supabase. Cada arquivo é autocontido e declara explicitamente suas dependências nos comentários de cabeçalho. Não há uso da CLI de migrations do Supabase (`supabase db push`) — todas as migrations são aplicadas manualmente.

Desde a migration `14_schema_version.sql`, a tabela `public.schema_version` registra a versão de schema mais recente aplicada; o frontend (`schemaService.js`) e o pipeline de deploy (`deploy.yml`) leem essa versão para bloquear a execução contra um banco desatualizado. Ver `OPERATIONS.md` para o mecanismo completo.

As migrations `11` a `20` introduzem o domínio de **Execução de Estudo** (Sessão de Atividade, Questões, Revisões, Reflexão) que se soma ao domínio de **Planejamento** (Compromissos, Categorias, Calendário Acadêmico) já existente desde `01`–`10`. Ver `ARCHITECTURE.md` para como esse domínio se conecta ao Session Event Bus e às projeções derivadas (Dashboard, Diário, Histórico, Subject Progress, Study Streak, Achievements).

---

## Estrutura das Migrations

### 01_events.sql

**Objetivo:** Criar a tabela fundacional do sistema e a função compartilhada de atualização de timestamps. Esta é a única migration sem dependências e deve ser executada antes de todas as demais.

**Tabelas criadas:** `events`

**Funções:**
- `update_updated_at()` — função reutilizável por todas as migrations posteriores para manter o campo `updated_at` sincronizado automaticamente via trigger.

**Triggers:**
- `events_updated_at` — `BEFORE UPDATE` em `events`, chama `update_updated_at()`.

**Índices:**
- `events_user_id_idx` em `(user_id)` — filtro rápido por usuário.
- `events_user_date_idx` em `(user_id, event_date)` — índice composto para queries de calendário filtradas por usuário e intervalo de datas.

**Políticas RLS:** SELECT, INSERT, UPDATE e DELETE com `user_id = auth.uid()`.

**Dependências:** Nenhuma.

---

### 02_categories.sql

**Objetivo:** Criar o sistema de categorias personalizadas por usuário para classificação visual de eventos.

**Tabelas criadas:** `categories`

**Triggers:**
- `categories_updated_at` — `BEFORE UPDATE` em `categories`, chama `update_updated_at()`.

**Índices:**
- `categories_user_name_idx` — UNIQUE em `(user_id, lower(name))`, impedindo categorias duplicadas por usuário de forma case-insensitive.
- `categories_user_id_idx` em `(user_id)`.

**Políticas RLS:** SELECT, INSERT, UPDATE e DELETE com `user_id = auth.uid()`.

**Dependências:** `01_events.sql` (para a função `update_updated_at`).

---

### 03_recurrence.sql

**Objetivo:** Adicionar colunas de recorrência à tabela `events` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**Tabelas modificadas:** `events` — adiciona `recurrence_interval`, `recurrence_until`, `recurrence_days_of_week`.

**Observação:** As três colunas adicionadas por esta migration já estão declaradas em `01_events.sql`. O uso de `ADD COLUMN IF NOT EXISTS` torna esta migration idempotente — sua execução é segura mesmo que as colunas já existam. É tecnicamente redundante quando executada após `01_events.sql`, mas não gera erros.

**Dependências:** `01_events.sql`.

---

### 04_push_notifications.sql

**Objetivo:** Implementar o sistema completo de notificações push Web, com registro de assinaturas por dispositivo e log de envios para deduplicação.

**Tabelas criadas:** `push_subscriptions`, `notification_logs`

**Funções:**
- `cleanup_old_notification_logs()` — remove registros de `notification_logs` com mais de 90 dias. Pode ser agendada via Supabase Scheduler (recomendado) ou pg_cron. Não é chamada automaticamente.

**Triggers:**
- `push_subscriptions_updated_at` — `BEFORE UPDATE` em `push_subscriptions`, chama `update_updated_at()`.

**Índices:**
- `push_subscriptions_user_endpoint` — UNIQUE em `(user_id, endpoint)`, garantindo que cada dispositivo tenha apenas uma assinatura por usuário.
- `notification_logs_dedup` — UNIQUE em `(user_id, event_id, event_date)`, prevenindo o envio duplicado de notificações para o mesmo evento na mesma data.
- `notification_logs_sent_at_idx` em `(sent_at)`, para queries de cleanup e auditoria temporal.

**Políticas RLS:**
- `push_subscriptions`: SELECT, INSERT, UPDATE e DELETE com `auth.uid() = user_id`.
- `notification_logs`: apenas SELECT com `auth.uid() = user_id`. Inserções são realizadas pela Edge Function `send-push-notifications` com `service_role`, contornando o RLS de forma intencional.

**Dependências:** `01_events.sql` (para `update_updated_at`).

---

### 05_profiles.sql

**Objetivo:** Criar o perfil estendido do usuário com preferências acadêmicas e de configuração da aplicação, e automatizar sua criação no momento do cadastro.

**Tabelas criadas:** `profiles`

**Funções:**
- `handle_new_user()` — executada com `SECURITY DEFINER` após a criação de um novo usuário em `auth.users`. Insere automaticamente uma linha em `profiles` com o `full_name` extraído dos metadados de cadastro via `raw_user_meta_data->>'full_name'`. Usa `ON CONFLICT (id) DO NOTHING` para ser idempotente.

**Triggers:**
- `on_auth_user_created` — `AFTER INSERT` em `auth.users`, chama `handle_new_user()`. Garante que todo usuário tenha um perfil imediatamente após o cadastro.
- `profiles_updated_at` — `BEFORE UPDATE` em `profiles`, chama `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE (com `USING` e `WITH CHECK`) e DELETE, todas com `auth.uid() = id`.

**Dependências:** `01_events.sql` (para `update_updated_at`).

---

### 06_storage.sql

**Objetivo:** Configurar as políticas de acesso ao bucket `avatars` no Supabase Storage para controle granular de upload e leitura de avatares.

**Tabelas modificadas:** `storage.objects` (schema interno do Supabase)

**Políticas de Storage:**
- `avatars_insert_own` — permite upload apenas na própria pasta do usuário (verificada via `storage.foldername(name)[1]`).
- `avatars_update_own` — permite substituição apenas do próprio avatar.
- `avatars_delete_own` — permite remoção apenas do próprio avatar.
- `avatars_select_public` — leitura pública de todos os avatares, necessária para que as URLs funcionem sem autenticação.

**Pré-requisito manual:** O bucket `avatars` deve ser criado manualmente no Supabase Dashboard (Storage → New Bucket → Public: yes) antes de executar esta migration.

**Dependências:** Nenhuma dependência de outras migrations SQL.

---

### 07_academic_calendar.sql

**Objetivo:** Implementar o módulo de Calendário Acadêmico com suporte a múltiplos calendários por usuário e eventos de múltiplos dias.

**Tabelas criadas:** `academic_calendars`, `academic_events`

**Triggers:**
- `academic_calendars_updated_at` — `BEFORE UPDATE` em `academic_calendars`, chama `update_updated_at()`.
- `academic_events_updated_at` — `BEFORE UPDATE` em `academic_events`, chama `update_updated_at()`.

**Índices:**
- `academic_calendars_user_id_idx` em `academic_calendars(user_id)`.
- `academic_events_calendar_id_idx` em `academic_events(calendar_id)`.
- `academic_events_start_date_idx` em `academic_events(start_date)`.

**Políticas RLS:**
- `academic_calendars`: acesso direto via `user_id = auth.uid()`.
- `academic_events`: acesso via subquery com JOIN — o usuário só acessa eventos de calendários que lhe pertencem. A tabela não possui `user_id` diretamente.

**Dependências:** `01_events.sql` (para `update_updated_at`).

---

### 08_ai_metrics.sql

**Objetivo:** Registrar métricas de uso das funcionalidades de IA sem armazenar o conteúdo das conversas ou prompts.

**Tabelas criadas:** `ai_metrics`

**Políticas RLS:**
- `ai_metrics_select_own` — SELECT com `auth.uid() = user_id`.
- Não há política de INSERT para usuários comuns. Inserções são realizadas exclusivamente via Edge Function com `service_role`.

**Dependências:** Nenhuma dependência de outras migrations SQL além do banco base.

---

### 09_notification_logs_integrity.sql

**Objetivo:** Corrigir a ausência de FK formal entre `notification_logs.event_id` e `events.id` (Auditoria P1.3), eliminando o risco de logs órfãos ao excluir um evento.

**Tabelas alteradas:** `notification_logs` — remove logs órfãos pré-existentes e adiciona `CONSTRAINT notification_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE`.

**Idempotência:** guarda via `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) $$`, pois Postgres não suporta `ADD CONSTRAINT IF NOT EXISTS`.

**Dependências:** `01_events.sql` (tabela `events`), `04_push_notifications.sql` (tabela `notification_logs`).

---

### 10_ai_metrics_observability.sql

**Objetivo:** Observabilidade da Edge Function `ai-chat` (Auditoria A2.2) — adiciona colunas a `ai_metrics` para registrar modelo utilizado, código HTTP e um resumo curto de erro por chamada.

**Tabelas alteradas:** `ai_metrics` (`ADD COLUMN IF NOT EXISTS model text, http_status int, error_message text`).

**Políticas RLS:** Nenhuma alteração — reaproveita a política `ai_metrics_select_own` existente.

**Dependências:** `08_ai_metrics.sql` (tabela `ai_metrics`).

---

### 11_activity_sessions.sql

**Objetivo:** F1.1 — infraestrutura das Sessões de Atividade (execução real de estudo/plantão/etc., distinta do compromisso planejado em `events`). Apenas tabela, RLS e índices — sem cronômetro, sem UI, sem regras de negócio nesta migration.

**Tabelas criadas:** `activity_sessions`

**Colunas-chave:** `status` (`running`/`paused`/`finished`/`cancelled`), `source` (`quick`/`event`/`manual`), `event_id` (FK opcional para `events`, `ON DELETE SET NULL` — a Sessão sobrevive à exclusão do compromisso que a originou, por ser ela própria o registro de execução), `category_id` (FK opcional para `categories`, `ON DELETE SET NULL`), `started_at`, `ended_at`, `duration_minutes`, `notes`.

**Constraints:**
- `activity_sessions_status_check` — `status IN ('running','paused','finished','cancelled')`.
- `activity_sessions_source_check` — `source IN ('quick','event','manual')`.

**Índices:**
- `activity_sessions_user_id_idx`, `activity_sessions_event_id_idx`, `activity_sessions_started_at_idx`.

**Triggers:**
- `activity_sessions_updated_at` — reutiliza `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE, DELETE com `user_id = auth.uid()`.

**Dependências:** `01_events.sql` (para `update_updated_at`).

---

### 12_time_goals.sql

**Objetivo:** F2.2 — Metas de Tempo (Study Goals). Não cria tabela própria: estende `profiles` com metas pessoais de tempo de estudo/atividade, reaproveitando a relação 1:1 já existente entre `profiles` e o usuário (mesmo padrão de `timezone`/`theme`).

**Tabelas alteradas:** `profiles` — adiciona `daily_goal_minutes SMALLINT`, `weekly_goal_minutes SMALLINT`, `monthly_goal_minutes SMALLINT` (tipo ampliado para `INTEGER` em `20_monthly_goal_minutes_integer.sql`).

**Constraints:**
- `daily_goal_minutes IS NULL OR daily_goal_minutes BETWEEN 5 AND 1440`
- `weekly_goal_minutes IS NULL OR weekly_goal_minutes BETWEEN 5 AND 10080`
- `monthly_goal_minutes IS NULL OR monthly_goal_minutes BETWEEN 5 AND 44640`

**Dependências:** `05_profiles.sql` (tabela `profiles`).

---

### 13_reviews.sql

**Objetivo:** F2.3 — infraestrutura do Sistema de Revisões Inteligentes (repetição espaçada). Apenas tabela, RLS e índices — sem IA, sem notificações, sem dashboard, sem geração automática nesta migration.

**Tabelas criadas:** `reviews`

**Por que é uma tabela própria (não reaproveita `events`):** uma revisão não é um compromisso — não tem horário, duração ou recorrência própria, e um evento pode ter várias revisões futuras simultâneas. Uma tabela dedicada, referenciando `events` por FK, mantém os dois ciclos de vida (compromisso × revisão) desacoplados — mesmo padrão de `11_activity_sessions.sql`.

**Colunas-chave:** `event_id` (FK obrigatória para `events`, `ON DELETE CASCADE` — uma revisão nunca existe sem o compromisso original), `scheduled_date`, `status` (`pending`/`completed`/`skipped`), `completed_at`, `review_type` (`manual`/`automatic`), `origin` (`event`/`ai`/`user`).

**Constraints:**
- `reviews_status_check` — `status IN ('pending','completed','skipped')`.
- `reviews_review_type_check` — `review_type IN ('manual','automatic')`.
- `reviews_origin_check` — `origin IN ('event','ai','user')`.

**Índices:**
- `reviews_user_id_idx`, `reviews_event_id_idx`, `reviews_user_status_idx` (composto), `reviews_scheduled_date_idx`.

**Triggers:**
- `reviews_updated_at` — reutiliza `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE, DELETE com `user_id = auth.uid()`.

**Dependências:** `01_events.sql` (para `update_updated_at`, tabela `events`).

---

### 14_schema_version.sql

**Objetivo:** P0 — Sistema de Proteção contra Divergência de Schema. Cria a fonte única de verdade sobre qual versão de schema está aplicada no banco, prevenindo o incidente em que o frontend foi publicado consultando tabelas (`activity_sessions`, `reviews`) ainda não migradas em produção.

**Tabelas criadas:** `schema_version` — linha única (`id = 1`, `CHECK (id = 1)`), colunas `version INTEGER` e `applied_at TIMESTAMPTZ`.

**Convenção obrigatória a partir desta migration:** toda migration numerada da qual o frontend passe a depender deve terminar com `UPDATE public.schema_version SET version = <N>, applied_at = now() WHERE id = 1;`. Migrations que só adicionam infraestrutura ainda não consumida por nenhuma View/Service (ex.: `15`, `16`) não fazem esse bump — ele acontece na migration que efetivamente conecta o schema a um consumidor visual.

**Políticas RLS:** leitura liberada para `anon` **e** `authenticated` (não guarda dado de usuário, apenas um inteiro público) — o frontend lê no bootstrap (`schemaService.js`) e o workflow `deploy.yml` lê via REST com a anon key antes de publicar. Nenhuma política de escrita — apenas o SQL Editor (fora de RLS) altera a versão.

**Dependências:** Nenhuma (tabela independente).

---

### 15_questions.sql

**Objetivo:** F6.7 — infraestrutura do domínio Questões Resolvidas. Apenas tabela, RLS, índices e trigger — sem estatísticas, sem acertos/erros, sem conquistas, sem tela nesta migration.

**Tabelas criadas:** `questions`

**Relação:** Sessão 1:N Questões. `session_id NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE` — uma questão nunca existe sem uma sessão (mesmo raciocínio de `reviews.event_id`, e não o `SET NULL` de `activity_sessions.event_id`, pois aqui não há "questão órfã" no domínio).

**Colunas-chave:** `question_type` (`multiple_choice`/`true_false`/`open`/`flashcard`), `status` (`pending`/`answered`/`skipped` — andamento da questão, nunca "correto/incorreto"), `difficulty` (`easy`/`medium`/`hard`), `subject`, `topic`.

**Constraints:**
- `questions_question_type_check`, `questions_status_check`, `questions_difficulty_check`.

**Índices:**
- `questions_user_id_idx`, `questions_session_id_idx`, `questions_user_status_idx` (composto).

**Triggers:**
- `questions_updated_at` — reutiliza `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE, DELETE com `user_id = auth.uid()`.

**Schema version:** sem bump — nenhum consumidor visual conectado nesta etapa (ver `14_schema_version.sql`).

**Dependências:** `01_events.sql` (para `update_updated_at`), `11_activity_sessions.sql`.

---

### 16_review_session_link.sql

**Objetivo:** F6.10 — integração Sessão ↔ Revisão. Apenas a coluna e a FK que ligam uma Revisão à Sessão que a executou; nenhuma alteração em `activity_sessions` (a referência é de mão única, de `reviews` para `activity_sessions`).

**Tabelas alteradas:** `reviews` — adiciona `session_id UUID REFERENCES activity_sessions(id) ON DELETE SET NULL` (nullable).

**Por que `reviews.session_id` (e não o inverso, nem N:N):**
1. Cardinalidade real 1:N — uma Sessão pode cobrir várias Revisões pendentes do mesmo compromisso; uma Revisão aponta para no máximo uma Sessão.
2. Nullable nos dois sentidos — diferente de `questions.session_id` (composição obrigatória), aqui uma Revisão pode existir sem Sessão e vice-versa.
3. `ON DELETE SET NULL` (não `CASCADE`) — Sessão e Revisão são dois ciclos de vida independentes; excluir a Sessão que executou uma Revisão não apaga a Revisão, só remove a referência de "quem a executou".

**Índices:** `reviews_session_id_idx`.

**Schema version:** sem bump — mesmo motivo de `15_questions.sql` (nenhum consumidor visual conectado nesta etapa).

**Dependências:** `11_activity_sessions.sql`, `13_reviews.sql`.

---

### 17_activity_sessions_paused_time.sql

**Objetivo:** F7.7 — Tempo Líquido de Estudo (desconto de pausas). Corrige `duration_minutes` para não incluir intervalos em pausa.

**Tabelas alteradas:** `activity_sessions` — adiciona `paused_ms BIGINT NOT NULL DEFAULT 0` (total acumulado de milissegundos pausados em pausas já concluídas) e `paused_at TIMESTAMPTZ` (timestamp de início da pausa corrente, ou `NULL` se não pausada).

**Uso:** `pauseSession()` grava `paused_at`; `resumeSession()` soma o intervalo pausado a `paused_ms` e limpa `paused_at`; `finishSession()` usa ambos para calcular a duração líquida e também limpa `paused_at`.

**Schema version:** com bump — `activitySessionService.js` passa a depender destas colunas no mesmo commit.

```sql
UPDATE public.schema_version SET version = 17, applied_at = now() WHERE id = 1;
```

**Dependências:** `11_activity_sessions.sql`, `14_schema_version.sql`.

---

### 18_reflections.sql

**Objetivo:** F8.2 — infraestrutura do domínio Reflexão da Sessão (Reflection Journal, parte do Diário de Estudos). Apenas tabela, RLS, índice e trigger — sem IA, sem resumo automático, sem análise de sentimento.

**Tabelas criadas:** `reflections`

**Conceito distinto de Observações (`activity_sessions.notes`):** Observações representam o estudo em si (o que foi feito); Reflexão representa a aprendizagem (o que o usuário tirou de aprendizado). Por isso é uma tabela própria, nunca reaproveita `notes`.

**Relação:** Sessão 1:1 Reflexão. `session_id NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE`, com `UNIQUE (session_id)` garantindo no máximo uma reflexão por sessão; o service usa `UPSERT (ON CONFLICT session_id)` para "criar ou editar" sem duplicar linhas.

**Constraints:**
- `reflections_session_id_unique` — `UNIQUE (session_id)`.
- `reflections_content_not_blank` — `CHECK (btrim(content) <> '')`.

**Índices:** `reflections_user_id_idx`.

**Triggers:** `reflections_updated_at` — reutiliza `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE, DELETE com `user_id = auth.uid()`.

**Schema version:** com bump — `studyJournalView.js` consome `studyReflectionService.js` nesta mesma etapa.

```sql
UPDATE public.schema_version SET version = 18, applied_at = now() WHERE id = 1;
```

**Dependências:** `01_events.sql` (para `update_updated_at`), `11_activity_sessions.sql`.

---

### 19_activity_sessions_running_unique.sql

**Objetivo:** AUD-001 — integridade: no máximo uma sessão `"running"` por usuário, imposta no banco como última linha de defesa contra corrida entre requisições concorrentes (duas abas/dispositivos chamando `startSession()` simultaneamente).

**Tabelas alteradas:** `activity_sessions` — adiciona índice único parcial.

**Guarda de dados pré-existentes:** um bloco `DO $$ ... $$` verifica se já existe mais de uma sessão `"running"` para o mesmo usuário; se existir, a migration falha explicitamente com mensagem clara em vez de deixar o `CREATE UNIQUE INDEX` abortar com erro genérico. A correção de dados inconsistentes é manual.

**Índice:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS activity_sessions_one_running_per_user
  ON public.activity_sessions (user_id)
  WHERE status = 'running';
```
`paused`/`finished`/`cancelled` continuam ilimitados — a condição `WHERE` do índice só alcança `status = 'running'`.

**Schema version:** com bump — `activitySessionService.js` converte a violação desta constraint no erro de domínio `SESSION_ALREADY_RUNNING`.

```sql
UPDATE public.schema_version SET version = 19, applied_at = now() WHERE id = 1;
```

**Dependências:** `11_activity_sessions.sql`, `14_schema_version.sql`.

---

### 20_monthly_goal_minutes_integer.sql

**Objetivo:** AUD-006 — `monthly_goal_minutes` era `SMALLINT` (máx. 32767) mas o `CHECK` e a aplicação sempre aceitaram até 44640 (31 dias × 1440 min), causando overflow do Postgres para valores entre 32768 e 44640.

**Tabelas alteradas:** `profiles` — `ALTER COLUMN monthly_goal_minutes TYPE INTEGER`. `daily_goal_minutes` (máx. 1440) e `weekly_goal_minutes` (máx. 10080) cabem em `SMALLINT` e não são alterados.

**Schema version:** com bump.

```sql
UPDATE public.schema_version SET version = 20, applied_at = now() WHERE id = 1;
```

**Dependências:** `12_time_goals.sql` (coluna `monthly_goal_minutes`), `14_schema_version.sql`.

---

### 21_activity_sessions_standalone_fields.sql

**Objetivo:** Refatoração do fluxo "Sessão de Estudo" — antes, o único ponto de entrada era "Iniciar sessão avulsa": a sessão começava imediatamente, sem etapa de configuração, e Compromisso/Categoria/Conteúdo/Data/Tempo previsto ficavam em branco pelo resto da sessão sempre que `event_id` era `NULL`. Agora `studySessionView.js` sempre abre um modal de configuração pré-início com dois caminhos: vincular um compromisso já existente (`event_id`, sem mudança) ou digitar livremente um nome de estudo — este segundo caminho precisa de onde gravar os mesmos campos que um compromisso já forneceria.

**Tabelas alteradas:** `activity_sessions` — adiciona `title TEXT`, `content TEXT`, `session_date DATE` e `planned_duration_minutes INTEGER` (todas nullable).

**Constraint:** `CHECK (planned_duration_minutes IS NULL OR planned_duration_minutes > 0)`.

**Nunca duplica dado de `events`:** as quatro colunas só são preenchidas quando a sessão NÃO tem `event_id` (caminho "Novo estudo" do modal); uma sessão vinculada a um compromisso continua resolvendo título/categoria/conteúdo/data/duração a partir de `events` via `event_id`, exatamente como antes — `category_id` (já existente desde `11_activity_sessions.sql`) é reaproveitado sem alteração para o caminho avulso.

**Schema version:** com bump.

```sql
UPDATE public.schema_version SET version = 21, applied_at = now() WHERE id = 1;
```

**Dependências:** `11_activity_sessions.sql`, `14_schema_version.sql`.

---

## Modelo de Dados

Diagrama lógico das tabelas e seus relacionamentos:

```
auth.users  (Supabase Auth — schema auth)
│
├── profiles                (1:1 — id PK = auth.users.id; inclui metas de tempo desde 12_time_goals.sql)
│
├── events                  (N:1 — user_id → auth.users.id)
│   │
│   ├── notification_logs   (N:1 — user_id) [event_id → events.id, ON DELETE CASCADE]
│   ├── reviews              (N:1 — user_id) [event_id → events.id, ON DELETE CASCADE]
│   └── activity_sessions   (N:1 — user_id) [event_id → events.id, ON DELETE SET NULL]
│
├── categories               (N:1 — user_id → auth.users.id)
│   └── [vínculo lógico: activity_sessions.category_id → categories.id, ON DELETE SET NULL]
│
├── push_subscriptions       (N:1 — user_id → auth.users.id)
│
├── academic_calendars       (N:1 — user_id → auth.users.id)
│   │
│   └── academic_events     (N:1 — calendar_id → academic_calendars.id, ON DELETE CASCADE)
│
├── ai_metrics                (N:1 — user_id → auth.users.id)
│
└── activity_sessions        (N:1 — user_id → auth.users.id)
    │
    ├── questions            (N:1 — session_id → activity_sessions.id, ON DELETE CASCADE)
    ├── reflections           (1:1 — session_id → activity_sessions.id, ON DELETE CASCADE, UNIQUE)
    └── reviews.session_id   (N:1 — session_id → activity_sessions.id, ON DELETE SET NULL — mão única, de reviews para activity_sessions)

schema_version (tabela independente, linha única, sem FK, sem user_id — versão global do schema)

storage.objects (Supabase Storage — schema storage)
└── bucket: avatars  (gerenciado por políticas RLS de storage, sem FK relacional)
```

**Cadeia do domínio de Execução de Estudo** (ver `ARCHITECTURE.md` para o Modelo de Domínio completo):

```
events (Compromisso)
  └─▶ activity_sessions (Sessão de Estudo — event_id opcional, ON DELETE SET NULL)
        ├─▶ questions (Questões — session_id obrigatório, ON DELETE CASCADE)
        ├─▶ reflections (Reflexão — session_id obrigatório, 1:1, ON DELETE CASCADE)
        └──(reviews.session_id aponta de volta, opcional, ON DELETE SET NULL)
reviews (Revisão — event_id obrigatório, ON DELETE CASCADE; session_id opcional, ON DELETE SET NULL)
```

---

## Documentação das Tabelas

### `events`

**Objetivo:** Tabela central do sistema. Armazena todos os compromissos dos usuários com suporte completo a recorrência, lembretes e categorização.

| Coluna                    | Tipo        | Nullable | Padrão                |
|---------------------------|-------------|----------|------------------------|
| `id`                      | UUID        | NÃO      | `gen_random_uuid()`   |
| `user_id`                 | UUID        | NÃO      | —                     |
| `title`                   | TEXT        | NÃO      | —                     |
| `event_date`              | DATE        | NÃO      | —                     |
| `start_time`               | TIME        | SIM      | —                     |
| `duration_minutes`        | INTEGER     | SIM      | —                     |
| `category`                | TEXT        | SIM      | —                     |
| `color`                   | TEXT        | SIM      | —                     |
| `location`                | TEXT        | SIM      | —                     |
| `description`             | TEXT        | SIM      | —                     |
| `reminder_minutes`        | INTEGER     | SIM      | —                     |
| `recurrence_type`         | TEXT        | NÃO      | `'none'`              |
| `recurrence_interval`     | INTEGER     | SIM      | —                     |
| `recurrence_until`        | DATE        | SIM      | —                     |
| `recurrence_days_of_week` | TEXT        | SIM      | —                     |
| `created_at`               | TIMESTAMPTZ | NÃO      | `now()`               |
| `updated_at`               | TIMESTAMPTZ | NÃO      | `now()`               |

**Constraints:** `events_recurrence_type_check` — `recurrence_type` ∈ `{none, daily, weekdays, weekly, biweekly, monthly, yearly, custom}`.

**Índices:** `events_user_id_idx`, `events_user_date_idx`

**Triggers:** `events_updated_at`

**RLS:** Todas as operações restritas ao próprio usuário via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` `ON DELETE CASCADE`
- Referenciada por `notification_logs.event_id` (`ON DELETE CASCADE`), `reviews.event_id` (`ON DELETE CASCADE`), `activity_sessions.event_id` (`ON DELETE SET NULL`)

**Observações:** O campo `category` armazena o nome textual da categoria (não uma FK para `categories`). O vínculo é conceitual — a exclusão de uma categoria no banco não quebra os eventos existentes, mas o frontend impede a exclusão de categorias em uso.

---

### `categories`

**Objetivo:** Categorias personalizadas por usuário para classificação visual e filtragem de eventos.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|----------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `name`       | TEXT        | NÃO      | —                   |
| `color`      | TEXT        | NÃO      | `'#3b82f6'`         |
| `icon`       | TEXT        | SIM      | —                   |
| `created_at` | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at` | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `categories_user_name_idx` (UNIQUE, `lower(name)`), `categories_user_id_idx`

**Triggers:** `categories_updated_at`

**RLS:** Todas as operações restritas via `user_id = auth.uid()`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`; referenciada por `activity_sessions.category_id` (`ON DELETE SET NULL`).

**Observações:** O frontend cria 8 categorias padrão automaticamente via `ensureDefaultCategories()`. O campo `icon` existe na estrutura mas não é utilizado.

---

### `profiles`

**Objetivo:** Perfil estendido do usuário com informações acadêmicas, preferências de configuração e, desde `12_time_goals.sql`, metas pessoais de tempo de estudo. Criado automaticamente via trigger no momento do cadastro.

| Coluna                     | Tipo          | Nullable                 | Padrão                    |
|----------------------------|---------------|---------------------------|-----------------------------|
| `id`                        | UUID          | NÃO (PK = `auth.users.id`) | —                        |
| `full_name`                 | TEXT          | SIM                       | —                           |
| `avatar_url`                | TEXT          | SIM                       | —                           |
| `university`                | TEXT          | SIM                       | —                           |
| `course`                    | TEXT          | SIM                       | —                           |
| `semester`                  | SMALLINT      | SIM                       | —                           |
| `timezone`                  | TEXT          | SIM                       | `'America/Sao_Paulo'`      |
| `notification_enabled`      | BOOLEAN       | SIM                       | `TRUE`                      |
| `theme`                     | TEXT          | SIM                       | `'light'`                   |
| `daily_goal_minutes`        | SMALLINT      | SIM                       | — (`12_time_goals.sql`)    |
| `weekly_goal_minutes`       | SMALLINT      | SIM                       | — (`12_time_goals.sql`)    |
| `monthly_goal_minutes`      | INTEGER       | SIM                       | — (`12_time_goals.sql`, tipo ampliado em `20`) |
| `created_at`                 | TIMESTAMPTZ   | SIM (sem `NOT NULL`)      | `now()`                     |
| `updated_at`                 | TIMESTAMPTZ   | SIM (sem `NOT NULL`)      | `now()`                     |

**Constraints:**
- `semester BETWEEN 1 AND 12`
- `theme IN ('light','dark','system')`
- `daily_goal_minutes IS NULL OR daily_goal_minutes BETWEEN 5 AND 1440`
- `weekly_goal_minutes IS NULL OR weekly_goal_minutes BETWEEN 5 AND 10080`
- `monthly_goal_minutes IS NULL OR monthly_goal_minutes BETWEEN 5 AND 44640`

**Triggers:** `on_auth_user_created` (em `auth.users`), `profiles_updated_at`

**RLS:** SELECT, INSERT, UPDATE (`USING` + `WITH CHECK`) e DELETE restritos a `auth.uid() = id`.

**Relacionamentos:** `id` → `auth.users(id)` `ON DELETE CASCADE` (1:1).

**Observações:** "Metas de Tempo" (Study Goals) **não é uma tabela separada** — são três colunas opcionais em `profiles`, 1:1 com o usuário e apenas informativas (sem recomendação automática), reaproveitando a relação já existente em vez de criar uma nova tabela. `created_at`/`updated_at` são nullable nesta tabela, inconsistência de convenção sem impacto funcional (o `DEFAULT` sempre preenche o valor).

---

### `push_subscriptions`

**Objetivo:** Assinaturas Web Push por dispositivo/usuário.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|----------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `endpoint`   | TEXT        | NÃO      | —                   |
| `p256dh`     | TEXT        | NÃO      | —                   |
| `auth`       | TEXT        | NÃO      | —                   |
| `user_agent` | TEXT        | SIM      | —                   |
| `created_at` | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at` | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `push_subscriptions_user_endpoint` (UNIQUE)

**Triggers:** `push_subscriptions_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `auth.uid() = user_id`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`.

---

### `notification_logs`

**Objetivo:** Registra cada notificação enviada, para deduplicação e auditoria.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|----------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `event_id`   | UUID        | NÃO      | —                   |
| `event_date` | DATE        | NÃO      | —                   |
| `status`     | TEXT        | NÃO      | `'sent'`            |
| `error`      | TEXT        | SIM      | —                   |
| `sent_at`    | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `notification_logs_dedup` (UNIQUE), `notification_logs_sent_at_idx`

**RLS:** apenas SELECT via `auth.uid() = user_id`; INSERT feito só via `service_role`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`; `event_id` → `events(id)` `ON DELETE CASCADE` (desde `09_notification_logs_integrity.sql`).

---

### `academic_calendars`

**Objetivo:** Calendários acadêmicos (múltiplos por usuário).

| Coluna          | Tipo        | Nullable | Padrão              |
|-----------------|-------------|----------|----------------------|
| `id`            | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`       | UUID        | NÃO      | —                   |
| `name`          | TEXT        | NÃO      | —                   |
| `university`    | TEXT        | SIM      | —                   |
| `academic_year` | TEXT        | SIM      | —                   |
| `color`         | TEXT        | NÃO      | `'#7c3aed'`         |
| `created_at`     | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at`     | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `academic_calendars_user_id_idx`

**Triggers:** `academic_calendars_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `user_id = auth.uid()`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`; pai de `academic_events`.

---

### `academic_events`

**Objetivo:** Eventos dentro de um calendário acadêmico, com suporte a intervalos de múltiplos dias.

| Coluna        | Tipo        | Nullable | Padrão              |
|---------------|-------------|----------|----------------------|
| `id`          | UUID        | NÃO      | `gen_random_uuid()` |
| `calendar_id` | UUID        | NÃO      | —                   |
| `title`       | TEXT        | NÃO      | —                   |
| `description` | TEXT        | SIM      | —                   |
| `start_date`  | DATE        | NÃO      | —                   |
| `end_date`    | DATE        | SIM      | —                   |
| `all_day`     | BOOLEAN     | NÃO      | `true`              |
| `color`       | TEXT        | SIM      | —                   |
| `category`    | TEXT        | SIM      | —                   |
| `location`    | TEXT        | SIM      | —                   |
| `created_at`   | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at`   | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `academic_events_calendar_id_idx`, `academic_events_start_date_idx`

**Triggers:** `academic_events_updated_at`

**RLS:** via subquery `EXISTS` — a única tabela do schema sem `user_id` próprio.

**Relacionamentos:** `calendar_id` → `academic_calendars(id)` `ON DELETE CASCADE`.

---

### `ai_metrics`

**Objetivo:** Métricas de uso de IA, sem armazenar conteúdo de conversas.

| Coluna          | Tipo        | Nullable | Padrão              |
|-----------------|-------------|----------|----------------------|
| `id`            | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`       | UUID        | NÃO      | —                   |
| `prompt_type`   | TEXT        | NÃO      | —                   |
| `model`         | TEXT        | SIM      | —                   |
| `duration_ms`   | INTEGER     | SIM      | —                   |
| `success`       | BOOLEAN     | NÃO      | `true`              |
| `http_status`   | INTEGER     | SIM      | —                   |
| `error_code`    | TEXT        | SIM      | —                   |
| `error_message` | TEXT        | SIM      | —                   |
| `created_at`     | TIMESTAMPTZ | NÃO      | `now()`             |

**RLS:** apenas SELECT via `auth.uid() = user_id`; INSERT só via `service_role`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`.

---

### `activity_sessions`

**Objetivo:** Fato central do domínio de Execução de Estudo — registra o tempo efetivamente gasto em uma atividade (estudo, plantão, etc.), com ou sem vínculo a um compromisso planejado. É a entidade raiz de que Questões, Reflexão e (opcionalmente) Revisões dependem. Ver `ARCHITECTURE.md` → Modelo de Domínio.

| Coluna              | Tipo          | Nullable | Padrão               |
|----------------------|---------------|----------|-------------------------|
| `id`                  | UUID          | NÃO      | `gen_random_uuid()`    |
| `user_id`             | UUID          | NÃO      | —                       |
| `event_id`            | UUID          | SIM      | — (FK opcional)         |
| `category_id`         | UUID          | SIM      | — (FK opcional)         |
| `status`              | TEXT          | NÃO      | `'running'`             |
| `started_at`          | TIMESTAMPTZ   | NÃO      | `now()`                 |
| `ended_at`            | TIMESTAMPTZ   | SIM      | —                       |
| `duration_minutes`    | INTEGER       | SIM      | — (líquido, desconta pausas) |
| `source`              | TEXT          | NÃO      | `'manual'`              |
| `notes`               | TEXT          | SIM      | — (Observações, distinto de Reflexão) |
| `paused_ms`           | BIGINT        | NÃO      | `0` (`17`)              |
| `paused_at`           | TIMESTAMPTZ   | SIM      | — (`17`)                |
| `title`               | TEXT          | SIM      | — (`21`, só sem `event_id`) |
| `content`             | TEXT          | SIM      | — (`21`, só sem `event_id`) |
| `session_date`        | DATE          | SIM      | — (`21`, só sem `event_id`) |
| `planned_duration_minutes` | INTEGER | SIM      | — (`21`, só sem `event_id`) |
| `created_at`           | TIMESTAMPTZ   | NÃO      | `now()`                 |
| `updated_at`           | TIMESTAMPTZ   | NÃO      | `now()`                 |

**Constraints:**
- `activity_sessions_status_check` — `status IN ('running','paused','finished','cancelled')`
- `activity_sessions_source_check` — `source IN ('quick','event','manual')`
- `planned_duration_minutes IS NULL OR planned_duration_minutes > 0` (`21`)

**Índices:**
- `activity_sessions_user_id_idx`, `activity_sessions_event_id_idx`, `activity_sessions_started_at_idx`
- `activity_sessions_one_running_per_user` — UNIQUE parcial em `(user_id) WHERE status = 'running'` (`19`)

**Triggers:** `activity_sessions_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` `ON DELETE CASCADE`
- `event_id` → `events(id)` `ON DELETE SET NULL` — a Sessão sobrevive à exclusão do compromisso
- `category_id` → `categories(id)` `ON DELETE SET NULL`
- Referenciada por `questions.session_id` (`ON DELETE CASCADE`), `reflections.session_id` (`ON DELETE CASCADE`, 1:1), `reviews.session_id` (`ON DELETE SET NULL`, opcional)

**Observações:** `duration_minutes` é o tempo **líquido** (desde `17_activity_sessions_paused_time.sql`) — desconta qualquer intervalo em `paused`. Toda transição de status é publicada no Session Event Bus por `activitySessionService.js` (único publicador) — ver `ARCHITECTURE.md`. `title`/`content`/`session_date`/`planned_duration_minutes` (`21`) só existem para sessões sem `event_id` — o modal de configuração pré-início (`studySessionView.js`) grava esses campos no caminho "Novo estudo"; uma sessão vinculada a um compromisso continua resolvendo os mesmos dados a partir de `events`, nunca de ambas as fontes ao mesmo tempo.

---

### `reviews`

**Objetivo:** Controle do ciclo de revisão espaçada de um compromisso — quando revisar, se já foi revisada, e (opcionalmente) qual Sessão a executou.

| Coluna              | Tipo          | Nullable | Padrão               |
|----------------------|---------------|----------|-------------------------|
| `id`                  | UUID          | NÃO      | `gen_random_uuid()`    |
| `user_id`             | UUID          | NÃO      | —                       |
| `event_id`            | UUID          | NÃO      | —                       |
| `session_id`          | UUID          | SIM      | — (`16`, opcional)      |
| `scheduled_date`      | DATE          | NÃO      | —                       |
| `status`              | TEXT          | NÃO      | `'pending'`             |
| `completed_at`         | TIMESTAMPTZ   | SIM      | —                       |
| `review_type`         | TEXT          | NÃO      | `'manual'`              |
| `origin`              | TEXT          | NÃO      | `'user'`                |
| `created_at`           | TIMESTAMPTZ   | NÃO      | `now()`                 |
| `updated_at`           | TIMESTAMPTZ   | NÃO      | `now()`                 |

**Constraints:**
- `reviews_status_check` — `status IN ('pending','completed','skipped')`
- `reviews_review_type_check` — `review_type IN ('manual','automatic')`
- `reviews_origin_check` — `origin IN ('event','ai','user')`

**Índices:** `reviews_user_id_idx`, `reviews_event_id_idx`, `reviews_user_status_idx`, `reviews_scheduled_date_idx`, `reviews_session_id_idx` (`16`)

**Triggers:** `reviews_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` `ON DELETE CASCADE`
- `event_id` → `events(id)` `ON DELETE CASCADE` — uma revisão nunca existe sem o compromisso original
- `session_id` → `activity_sessions(id)` `ON DELETE SET NULL` — vínculo opcional, mão única (só `reviews` conhece `activity_sessions`, nunca o inverso)

**Observações:** `reviewService.js` mantém um pub/sub próprio (`onReviewStatusChanged`), independente e mais antigo que o Session Event Bus — não publica nem consome eventos do barramento de Sessão.

---

### `questions`

**Objetivo:** Questões resolvidas durante uma Sessão de estudo.

| Coluna              | Tipo          | Nullable | Padrão                    |
|----------------------|---------------|----------|-------------------------------|
| `id`                  | UUID          | NÃO      | `gen_random_uuid()`         |
| `user_id`             | UUID          | NÃO      | —                             |
| `session_id`          | UUID          | NÃO      | —                             |
| `question_type`       | TEXT          | NÃO      | `'multiple_choice'`          |
| `status`              | TEXT          | NÃO      | `'pending'`                   |
| `difficulty`          | TEXT          | NÃO      | `'medium'`                    |
| `subject`             | TEXT          | SIM      | —                             |
| `topic`               | TEXT          | SIM      | —                             |
| `created_at`           | TIMESTAMPTZ   | NÃO      | `now()`                       |
| `updated_at`           | TIMESTAMPTZ   | NÃO      | `now()`                       |

**Constraints:**
- `questions_question_type_check` — `question_type IN ('multiple_choice','true_false','open','flashcard')`
- `questions_status_check` — `status IN ('pending','answered','skipped')`
- `questions_difficulty_check` — `difficulty IN ('easy','medium','hard')`

**Índices:** `questions_user_id_idx`, `questions_session_id_idx`, `questions_user_status_idx`

**Triggers:** `questions_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `user_id = auth.uid()`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`; `session_id` → `activity_sessions(id)` `ON DELETE CASCADE` — uma questão nunca existe sem sessão (composição, não opcional).

**Observações:** `status` é o andamento da questão no fluxo do usuário, nunca "correto/incorreto" — desempenho é derivado por consumidores futuros, não um campo bruto. `subject` é a única coluna do schema que carrega "matéria" — `subjectProgressService.js` usa `events.category` (via `activity_sessions.event_id`) como proxy de matéria quando `questions.subject` não está disponível.

---

### `reflections`

**Objetivo:** Texto livre que o usuário escreve sobre o que aprendeu em uma Sessão — distinto de `activity_sessions.notes` (Observações, sobre o que foi feito).

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|----------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `session_id` | UUID        | NÃO      | — (UNIQUE)          |
| `content`    | TEXT        | NÃO      | —                   |
| `created_at`  | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at`  | TIMESTAMPTZ | NÃO      | `now()`             |

**Constraints:**
- `reflections_session_id_unique` — `UNIQUE (session_id)` — no máximo uma reflexão por sessão
- `reflections_content_not_blank` — `CHECK (btrim(content) <> '')`

**Índices:** `reflections_user_id_idx`

**Triggers:** `reflections_updated_at`

**RLS:** SELECT/INSERT/UPDATE/DELETE via `user_id = auth.uid()`.

**Relacionamentos:** `user_id` → `auth.users(id)` `ON DELETE CASCADE`; `session_id` → `activity_sessions(id)` `ON DELETE CASCADE`, `UNIQUE` (1:1).

**Observações:** `studyReflectionService.js` grava via `UPSERT (ON CONFLICT session_id)` — "criar" e "editar" são a mesma operação. Consumida por `studyJournalView.js` (Diário de Estudos) como a única escrita que essa tela realiza.

---

### `schema_version`

**Objetivo:** Fonte única de verdade sobre a versão de schema aplicada no banco — não guarda dado de usuário.

| Coluna       | Tipo        | Nullable | Padrão   |
|--------------|-------------|----------|----------|
| `id`         | SMALLINT    | NÃO (PK) | `1`      |
| `version`    | INTEGER     | NÃO      | —        |
| `applied_at` | TIMESTAMPTZ | NÃO      | `now()`  |

**Constraints:** `schema_version_single_row` — `CHECK (id = 1)`, garante linha única.

**RLS:** SELECT liberado para `anon` e `authenticated`; nenhuma política de escrita (só o SQL Editor, fora de RLS).

**Relacionamentos:** Nenhum — tabela independente, sem FK.

**Observações:** Versão atual: `20` (última migration que fez bump). Consumida por `schemaService.js` (frontend, bootstrap) e pelo passo "Validate database schema version" de `deploy.yml`. Ver `OPERATIONS.md` para o mecanismo completo.

---

## Índices

| Nome                                        | Tabela               | Colunas                             | Tipo             | Objetivo |
|----------------------------------------------|------------------------|----------------------------------------|------------------|----------|
| `events_user_id_idx`                        | `events`               | `(user_id)`                           | B-tree           | Filtro rápido por usuário |
| `events_user_date_idx`                      | `events`               | `(user_id, event_date)`               | B-tree composto  | Consulta de calendário por usuário + intervalo de datas |
| `categories_user_name_idx`                  | `categories`           | `(user_id, lower(name))`              | UNIQUE           | Previne categorias duplicadas case-insensitive |
| `categories_user_id_idx`                    | `categories`           | `(user_id)`                           | B-tree           | Listagem de categorias do usuário |
| `push_subscriptions_user_endpoint`          | `push_subscriptions`   | `(user_id, endpoint)`                 | UNIQUE           | Uma assinatura por dispositivo por usuário |
| `notification_logs_dedup`                   | `notification_logs`    | `(user_id, event_id, event_date)`     | UNIQUE           | Previne notificação duplicada |
| `notification_logs_sent_at_idx`             | `notification_logs`    | `(sent_at)`                           | B-tree           | Cleanup e auditoria temporal |
| `academic_calendars_user_id_idx`            | `academic_calendars`   | `(user_id)`                           | B-tree           | Listagem de calendários do usuário |
| `academic_events_calendar_id_idx`           | `academic_events`      | `(calendar_id)`                       | B-tree           | Busca de eventos por calendário |
| `academic_events_start_date_idx`            | `academic_events`      | `(start_date)`                        | B-tree           | Filtro por data de início |
| `activity_sessions_user_id_idx`             | `activity_sessions`    | `(user_id)`                           | B-tree           | Listagem de sessões do usuário |
| `activity_sessions_event_id_idx`            | `activity_sessions`    | `(event_id)`                          | B-tree           | Sessões de um compromisso (`listByEvent`) |
| `activity_sessions_started_at_idx`          | `activity_sessions`    | `(started_at)`                        | B-tree           | Filtro por intervalo de datas / histórico |
| `activity_sessions_one_running_per_user`    | `activity_sessions`    | `(user_id) WHERE status='running'`    | UNIQUE parcial   | No máximo uma sessão `running` por usuário (AUD-001) |
| `reviews_user_id_idx`                       | `reviews`               | `(user_id)`                           | B-tree           | Listagem de revisões do usuário |
| `reviews_event_id_idx`                      | `reviews`               | `(event_id)`                          | B-tree           | Revisões de um compromisso |
| `reviews_user_status_idx`                   | `reviews`               | `(user_id, status)`                   | B-tree composto  | Revisões pendentes/concluídas do usuário |
| `reviews_scheduled_date_idx`                | `reviews`               | `(scheduled_date)`                    | B-tree           | Revisões por data agendada |
| `reviews_session_id_idx`                    | `reviews`               | `(session_id)`                        | B-tree           | Revisão executada por uma Sessão |
| `questions_user_id_idx`                     | `questions`             | `(user_id)`                           | B-tree           | Listagem de questões do usuário |
| `questions_session_id_idx`                  | `questions`             | `(session_id)`                        | B-tree           | Questões de uma Sessão (`listBySession`) |
| `questions_user_status_idx`                 | `questions`             | `(user_id, status)`                   | B-tree composto  | Questões pendentes/respondidas do usuário |
| `reflections_user_id_idx`                    | `reflections`           | `(user_id)`                           | B-tree           | Listagem de reflexões do usuário |

23 índices explícitos, além do índice implícito de cada chave primária. `ai_metrics` e `schema_version` são as únicas tabelas sem índice explícito além da PK.

---

## Triggers

### `update_updated_at()`

Função central, definida uma única vez em `sql/01_events.sql` e reutilizada por 10 tabelas:

| Trigger                          | Tabela               |
|-----------------------------------|------------------------|
| `events_updated_at`               | `events`               |
| `categories_updated_at`           | `categories`           |
| `push_subscriptions_updated_at`   | `push_subscriptions`   |
| `profiles_updated_at`             | `profiles`             |
| `academic_calendars_updated_at`   | `academic_calendars`   |
| `academic_events_updated_at`      | `academic_events`      |
| `activity_sessions_updated_at`    | `activity_sessions`    |
| `reviews_updated_at`              | `reviews`               |
| `questions_updated_at`            | `questions`             |
| `reflections_updated_at`           | `reflections`           |

`notification_logs`, `ai_metrics` e `schema_version` **não** têm essa trigger — não possuem `updated_at` (registros tratados como imutáveis) ou não fazem sentido para o padrão (linha única de `schema_version`).

### `on_auth_user_created`

Trigger em `auth.users` (`AFTER INSERT FOR EACH ROW`), chama `handle_new_user()`. Garante que todo novo usuário tenha um perfil criado automaticamente em `profiles`.

---

## Funções SQL

Três funções no total — nenhuma nova foi introduzida pelas migrations `11`–`20`:

- **`update_updated_at()`** — trigger `BEFORE UPDATE`, definida em `01_events.sql`, reutilizada por 10 tabelas.
- **`handle_new_user()`** — `SECURITY DEFINER`, cria a linha de `profiles` no cadastro do usuário.
- **`cleanup_old_notification_logs()`** — utilitária, remove `notification_logs` com mais de 90 dias; não é chamada automaticamente.

---

## Row Level Security

Isolamento completo por usuário via RLS, com `auth.uid()` como mecanismo central.

### Estratégias adotadas

- **Acesso direto por `user_id`:** `events`, `categories`, `push_subscriptions`, `academic_calendars`, `activity_sessions`, `reviews`, `questions`, `reflections`.
- **Acesso por chave primária:** `profiles` (`id` é PK e FK).
- **Acesso via subquery/JOIN:** `academic_events` (via `academic_calendars.user_id`).
- **Leitura própria, escrita só via `service_role`:** `notification_logs`, `ai_metrics`.
- **Leitura pública (anon + authenticated), sem escrita de usuário:** `schema_version`.
- **Leitura pública (Storage):** bucket `avatars`.

### Detalhamento por tabela

| Tabela                | SELECT              | INSERT              | UPDATE              | DELETE              |
|-----------------------|---------------------|----------------------|----------------------|----------------------|
| `events`              | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `categories`          | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `push_subscriptions`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `notification_logs`   | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `profiles`            | `id = uid()`        | `id = uid()`        | `id = uid()` (USING+WITH CHECK) | `id = uid()` |
| `academic_calendars`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `academic_events`     | via JOIN            | via JOIN            | via JOIN            | via JOIN            |
| `ai_metrics`          | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `activity_sessions`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `reviews`             | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `questions`           | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `reflections`         | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `schema_version`      | `anon, authenticated` (true) | —          | —                   | —                   |
| `storage.objects`     | público (avatars)   | `uid()` = pasta     | `uid()` = pasta     | `uid()` = pasta     |

---

## Integridade dos Dados

### Foreign Keys e `ON DELETE`

| Origem                          | Destino                | Ação            |
|-----------------------------------|--------------------------|-------------------|
| `profiles.id`                    | `auth.users(id)`         | CASCADE           |
| `events.user_id`                 | `auth.users(id)`         | CASCADE           |
| `categories.user_id`             | `auth.users(id)`         | CASCADE           |
| `push_subscriptions.user_id`     | `auth.users(id)`         | CASCADE           |
| `notification_logs.user_id`      | `auth.users(id)`         | CASCADE           |
| `academic_calendars.user_id`     | `auth.users(id)`         | CASCADE           |
| `ai_metrics.user_id`              | `auth.users(id)`         | CASCADE           |
| `activity_sessions.user_id`      | `auth.users(id)`         | CASCADE           |
| `reviews.user_id`                 | `auth.users(id)`         | CASCADE           |
| `questions.user_id`               | `auth.users(id)`         | CASCADE           |
| `reflections.user_id`             | `auth.users(id)`         | CASCADE           |
| `academic_events.calendar_id`    | `academic_calendars(id)` | CASCADE           |
| `notification_logs.event_id`     | `events(id)`              | CASCADE           |
| `reviews.event_id`                | `events(id)`              | CASCADE           |
| `activity_sessions.event_id`     | `events(id)`              | **SET NULL**      |
| `activity_sessions.category_id`  | `categories(id)`          | **SET NULL**      |
| `questions.session_id`            | `activity_sessions(id)`  | CASCADE           |
| `reflections.session_id`          | `activity_sessions(id)`  | CASCADE (+ UNIQUE)|
| `reviews.session_id`              | `activity_sessions(id)`  | **SET NULL**      |

**Padrão de decisão CASCADE × SET NULL:** `CASCADE` é usado quando a linha filha não tem sentido sem a pai (composição — ex.: uma Questão sem Sessão, um log de notificação sem o evento que o gerou). `SET NULL` é usado quando as duas entidades têm ciclos de vida independentes e a filha deve sobreviver à exclusão da referência (ex.: a Sessão sobrevive à exclusão do compromisso que a originou, por ser ela própria o registro de execução; uma Revisão sobrevive à exclusão da Sessão que a executou).

### Constraints CHECK

| Tabela               | Constraint                          | Regra |
|------------------------|----------------------------------------|-------|
| `events`               | `events_recurrence_type_check`         | `recurrence_type ∈ {none,daily,weekdays,weekly,biweekly,monthly,yearly,custom}` |
| `profiles`             | (sem nome)                             | `semester BETWEEN 1 AND 12` |
| `profiles`             | (sem nome)                             | `theme ∈ {light,dark,system}` |
| `profiles`             | (sem nome, `12`)                       | `daily_goal_minutes IS NULL OR BETWEEN 5 AND 1440` |
| `profiles`             | (sem nome, `12`)                       | `weekly_goal_minutes IS NULL OR BETWEEN 5 AND 10080` |
| `profiles`             | (sem nome, `12`/`20`)                  | `monthly_goal_minutes IS NULL OR BETWEEN 5 AND 44640` |
| `activity_sessions`    | `activity_sessions_status_check`       | `status ∈ {running,paused,finished,cancelled}` |
| `activity_sessions`    | `activity_sessions_source_check`       | `source ∈ {quick,event,manual}` |
| `reviews`               | `reviews_status_check`                 | `status ∈ {pending,completed,skipped}` |
| `reviews`               | `reviews_review_type_check`            | `review_type ∈ {manual,automatic}` |
| `reviews`               | `reviews_origin_check`                 | `origin ∈ {event,ai,user}` |
| `questions`             | `questions_question_type_check`        | `question_type ∈ {multiple_choice,true_false,open,flashcard}` |
| `questions`             | `questions_status_check`               | `status ∈ {pending,answered,skipped}` |
| `questions`             | `questions_difficulty_check`           | `difficulty ∈ {easy,medium,hard}` |
| `reflections`           | `reflections_session_id_unique`        | `UNIQUE(session_id)` — no máximo 1 reflexão por sessão |
| `reflections`           | `reflections_content_not_blank`        | `btrim(content) <> ''` |
| `schema_version`       | `schema_version_single_row`            | `id = 1` — linha única |

`notification_logs.status` e `academic_events.category` continuam sem CHECK — o domínio de valores é imposto apenas em código.

### Unicidade garantida pelo banco

- Categorias: nome único por usuário (case-insensitive).
- Push subscriptions: um `endpoint` por usuário.
- Notification logs: uma entrada por `(user_id, event_id, event_date)`.
- Profiles: exatamente um perfil por usuário.
- Activity sessions: no máximo uma sessão `running` por usuário (`19`).
- Reflections: no máximo uma reflexão por sessão.
- Schema version: linha única (`id = 1`).

---

## Versões de Schema

| Migration | Versão gravada em `schema_version` | O que passou a ser exigido pelo frontend |
|---|---|---|
| `01`–`13` | — (retroativas, não rastreadas) | Base do sistema até Revisões, aplicada antes da criação da tabela de versionamento |
| `14_schema_version.sql` | `14` | A própria tabela de versionamento |
| `15_questions.sql` | sem bump | Infraestrutura de Questões, sem consumidor visual ainda |
| `16_review_session_link.sql` | sem bump | Vínculo Revisão↔Sessão, sem consumidor visual ainda |
| `17_activity_sessions_paused_time.sql` | `17` | `paused_ms`/`paused_at` (Tempo Líquido) |
| `18_reflections.sql` | `18` | Tabela `reflections` (Diário de Estudos) |
| `19_activity_sessions_running_unique.sql` | `19` | Índice único parcial (erro `SESSION_ALREADY_RUNNING`) |
| `20_monthly_goal_minutes_integer.sql` | `20` | Tipo `INTEGER` em `monthly_goal_minutes` |

**Versão atual do schema: 20.**

---

## Fluxo de Persistência

### Eventos, Categorias, Calendário Acadêmico, Perfil, Push

Inalterado desde a introdução dessas tabelas — ver histórico completo em versões anteriores deste documento ou em `BACKEND.md`. Resumo: View → Service → `supabase.from(tabela)...` → RLS valida `user_id = auth.uid()` → Postgres grava/lê → trigger `update_updated_at()` mantém timestamps.

### Sessão de Estudo (`activity_sessions`)

```
Frontend (studySessionView.js / eventFormView.js "Iniciar Sessão")
  ↓ startSession() / pauseSession() / resumeSession() / finishSession() / cancelSession()
activitySessionService.js  (único publicador do Session Event Bus)
  ↓ supabase.from('activity_sessions').insert | .update
Supabase (RLS: user_id = auth.uid(); índice único parcial bloqueia 2ª sessão "running")
  ↓
Tabela: activity_sessions
  ↓ Trigger: activity_sessions_updated_at
  ↓ sessionEventBus.publish(SessionStarted | SessionPaused | SessionResumed | SessionFinished | SessionCancelled | SessionUpdated, session)
Consumidores do barramento (Dashboard, Histórico, Diário, IA context) recarregam suas projeções
```

Ver `ARCHITECTURE.md` → Session Event Bus para o detalhamento de cada evento, publicador e consumidores.

### Questões (`questions`)

```
Frontend (studySessionView.js, durante Sessão "running"/"paused")
  ↓ sessionQuestionsService.addQuestion(sessionId, data)
questionService.js
  ↓ supabase.from('questions').insert  (session_id obrigatório)
Supabase (RLS: user_id = auth.uid())
  ↓
Tabela: questions  (ON DELETE CASCADE se a Sessão for excluída)
```

Nenhum evento é publicado — a Sessão continua sendo o único evento raiz.

### Revisões (`reviews`) e vínculo com Sessão

```
Frontend
  ↓ reviewService.create(eventId, ...) / generateForEvent(eventId, baseDate, [1,7,30])
reviewService.js  (pub/sub próprio onReviewStatusChanged, independente do Session Event Bus)
  ↓ supabase.from('reviews').insert  (event_id obrigatório)

Quando uma Sessão executa a revisão:
  ↓ reviewSessionService.associateReview(reviewId, sessionId)
  ↓ supabase.from('reviews').update({ session_id })  (mão única: reviews → activity_sessions)
```

### Reflexão (`reflections`)

```
Frontend (studyJournalView.js, tela do Diário de Estudos)
  ↓ studyReflectionService.saveReflection(sessionId, content)
  ↓ supabase.from('reflections').upsert(..., { onConflict: 'session_id' })
Supabase (RLS: user_id = auth.uid(); UNIQUE(session_id))
  ↓
Tabela: reflections  (ON DELETE CASCADE se a Sessão for excluída)
```

Única escrita que a tela do Diário de Estudos realiza — todo o resto que ela exibe (agrupamento por dia, resumos, marcos, timeline, busca) é projeção em memória, nunca persistida. Ver `ARCHITECTURE.md` → Diário de Estudos.

---

## Convenções

| Convenção              | Padrão adotado |
|------------------------|--------------------------------------------------------------------------------------------------|
| **Chaves primárias**   | `UUID` gerado por `gen_random_uuid()` em todas as tabelas, exceto `profiles.id` (= `auth.users.id`) e `schema_version.id` (`SMALLINT` fixo `1`). |
| **Timestamps**         | `TIMESTAMPTZ`. Sempre `created_at`/`updated_at`, exceto `ai_metrics`/`notification_logs` (registros imutáveis) e `schema_version` (linha única). |
| **Strings**            | `TEXT` sem limite. Exceção: `semester`/`daily_goal_minutes`/`weekly_goal_minutes` usam `SMALLINT`; `monthly_goal_minutes` usa `INTEGER` desde `20`. |
| **Atualização de timestamps** | Via trigger `update_updated_at()`, `BEFORE UPDATE`, compartilhada por 10 tabelas. |
| **RLS**                | Habilitado em todas as tabelas `public`. |
| **Cascade**            | `ON DELETE CASCADE` para relações de composição (auth.users, e Sessão→Questão/Reflexão); `ON DELETE SET NULL` para relações entre ciclos de vida independentes (Compromisso→Sessão, Sessão→Revisão). |
| **Idempotência**       | `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guardas `DO $$ IF NOT EXISTS $$` para `ADD CONSTRAINT` (Postgres não suporta `IF NOT EXISTS` nessa cláusula). |
| **Versionamento**      | Migrations numeradas sequencialmente (`01`–`20`); migrations das quais o frontend passa a depender fazem bump de `schema_version` no mesmo commit (convenção de `14_schema_version.sql`). |
| **Status como enum textual** | `TEXT` + `CHECK IN (...)`, nunca tipo `ENUM` do Postgres nem tabela de domínio — padrão usado em `events.recurrence_type`, `activity_sessions.status/source`, `reviews.status/review_type/origin`, `questions.question_type/status/difficulty`. |

---

## Estado Atual

| Métrica                    | Quantidade |
|-----------------------------|------------|
| Migrations                  | 20 (`01` a `20`) |
| Tabelas no schema `public`  | 13 |
| Triggers                    | 11 (10× `update_updated_at()` + `on_auth_user_created`) |
| Funções SQL                 | 3 |
| Índices explícitos          | 23 |
| Políticas RLS (tabelas)     | 43 |
| Políticas RLS (Storage)     | 4 |
| Versão de schema atual      | 20 |

**Avaliação geral:** O banco cresceu de 8 para 13 tabelas entre as migrations `10` e `20`, introduzindo o domínio de Execução de Estudo (`activity_sessions`, `questions`, `reflections`) e o de Revisão Espaçada (`reviews`) sem alterar nenhuma das 8 tabelas originais de Planejamento — a única exceção é a extensão não-destrutiva de `profiles` com metas de tempo (`12`). O padrão de RLS, triggers e `ON DELETE CASCADE` para `auth.users` permanece idêntico ao das primeiras 10 migrations; a novidade estrutural é o uso deliberado de `ON DELETE SET NULL` (`activity_sessions.event_id`, `activity_sessions.category_id`, `reviews.session_id`) para modelar relações entre ciclos de vida independentes — algo que não existia até a migration `11`. A tabela `schema_version` (`14`) fechou a lacuna que havia permitido o incidente de deploy com schema desatualizado (migrations `11`–`13`), e o índice único parcial de `19` moveu para o banco uma invariante de negócio (uma sessão `running` por usuário) que antes só era garantida na aplicação.
