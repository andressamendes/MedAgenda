# Banco de Dados MedAgenda

## Visão Geral

O MedAgenda utiliza o **PostgreSQL** como banco de dados relacional, gerenciado pela plataforma **Supabase**. A arquitetura é fundamentada em três pilares:

- **Row Level Security (RLS):** todas as tabelas de dados do usuário têm RLS habilitado. O acesso é restrito ao próprio dono dos dados por meio de `auth.uid()`, eliminando a necessidade de filtros manuais no backend para isolamento de usuários.
- **Supabase Auth:** a autenticação é delegada inteiramente ao Supabase (`auth.users`). As tabelas de domínio referenciam `auth.users(id)` via chave estrangeira com `ON DELETE CASCADE`.
- **Edge Functions:** operações que requerem privilégios elevados (como inserir logs de notificação ou enviar push) são executadas via Edge Functions com `service_role`, contornando o RLS de forma controlada.

As migrations estão organizadas em arquivos numerados sequencialmente em `/sql`, devendo ser executadas em ordem no SQL Editor do Supabase. Cada arquivo é autocontido e declara explicitamente suas dependências.

---

## Estrutura das Migrations

### 01_events.sql

**Objetivo:** Criar a tabela fundacional do sistema e a função compartilhada de atualização de timestamps.

**Tabelas criadas:** `events`

**Funções:**
- `update_updated_at()` — função reutilizável por todas as migrations posteriores para manter o campo `updated_at` sincronizado automaticamente.

**Triggers:**
- `events_updated_at` — `BEFORE UPDATE` em `events`, chama `update_updated_at()`.

**Índices:**
- `events_user_id_idx` em `(user_id)`
- `events_user_date_idx` em `(user_id, event_date)` — índice composto para queries filtradas por usuário e data.

**Políticas RLS:** SELECT, INSERT, UPDATE e DELETE com `user_id = auth.uid()`.

**Dependências:** Nenhuma. Esta migration deve ser executada antes de todas as demais.

---

### 02_categories.sql

**Objetivo:** Criar o sistema de categorias personalizadas por usuário.

**Tabelas criadas:** `categories`

**Triggers:**
- `categories_updated_at` — `BEFORE UPDATE` em `categories`, chama `update_updated_at()`.

**Índices:**
- `categories_user_name_idx` — índice único em `(user_id, lower(name))`, impedindo categorias duplicadas por usuário de forma case-insensitive.
- `categories_user_id_idx` em `(user_id)`.

**Políticas RLS:** SELECT, INSERT, UPDATE e DELETE com `user_id = auth.uid()`.

**Dependências:** `01_events.sql` (para a função `update_updated_at`).

---

### 03_recurrence.sql

**Objetivo:** Adicionar colunas de recorrência à tabela `events` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

**Tabelas modificadas:** `events` (adiciona `recurrence_interval`, `recurrence_until`, `recurrence_days_of_week`)

**Observação:** As colunas adicionadas por esta migration já estão declaradas em `01_events.sql`. O uso de `ADD COLUMN IF NOT EXISTS` torna esta migration idempotente — sua execução é segura mesmo que as colunas já existam, mas é tecnicamente redundante quando executada após `01_events.sql`.

**Dependências:** `01_events.sql`.

---

### 04_push_notifications.sql

**Objetivo:** Implementar o sistema completo de notificações push Web, com registro de assinaturas e log de envios.

**Tabelas criadas:** `push_subscriptions`, `notification_logs`

**Funções:**
- `cleanup_old_notification_logs()` — remove registros de `notification_logs` com mais de 90 dias. Pode ser agendada via pg_cron ou pelo Supabase Scheduler.

**Triggers:**
- `push_subscriptions_updated_at` — `BEFORE UPDATE` em `push_subscriptions`, chama `update_updated_at()`.

**Índices:**
- `push_subscriptions_user_endpoint` — índice único em `(user_id, endpoint)`, garantindo que cada dispositivo tenha apenas uma assinatura por usuário.
- `notification_logs_dedup` — índice único em `(user_id, event_id, event_date)`, prevenindo o envio duplicado de notificações.
- `notification_logs_sent_at_idx` em `(sent_at)`, para queries de cleanup e auditoria por data.

**Políticas RLS:**
- `push_subscriptions`: SELECT, INSERT, UPDATE e DELETE com `auth.uid() = user_id`.
- `notification_logs`: apenas SELECT com `auth.uid() = user_id`. Inserções são realizadas pela Edge Function com `service_role`, contornando o RLS de forma intencional.

**Dependências:** `01_events.sql`.

---

### 05_profiles.sql

**Objetivo:** Criar o perfil estendido do usuário e automatizar sua criação no momento do cadastro.

**Tabelas criadas:** `profiles`

**Funções:**
- `handle_new_user()` — executada com `SECURITY DEFINER` após a criação de um novo usuário em `auth.users`. Insere automaticamente uma linha em `profiles` com o `full_name` extraído dos metadados de cadastro.

**Triggers:**
- `on_auth_user_created` — `AFTER INSERT` em `auth.users`, chama `handle_new_user()`. Garante que todo usuário tenha um perfil imediatamente após o cadastro.
- `profiles_updated_at` — `BEFORE UPDATE` em `profiles`, chama `update_updated_at()`.

**Políticas RLS:** SELECT, INSERT, UPDATE (com `USING` e `WITH CHECK`) e DELETE, todas com `auth.uid() = id`.

**Dependências:** `01_events.sql` (para `update_updated_at`).

---

### 06_storage.sql

**Objetivo:** Configurar as políticas de acesso ao bucket `avatars` no Supabase Storage.

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

**Objetivo:** Implementar o módulo de Calendário Acadêmico com suporte a múltiplos calendários e eventos de múltiplos dias.

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
- `academic_events`: acesso via JOIN com `academic_calendars` — o usuário só acessa eventos de calendários que lhe pertencem. Não há `user_id` direto na tabela.

**Dependências:** `01_events.sql`.

---

### 08_ai_metrics.sql

**Objetivo:** Registrar métricas de uso da IA sem armazenar o conteúdo das conversas.

**Tabelas criadas:** `ai_metrics`

**Políticas RLS:**
- `ai_metrics_select_own` — SELECT com `auth.uid() = user_id`.
- Não há política de INSERT para usuários comuns. Inserções são realizadas via Edge Function com `service_role`.

**Dependências:** Nenhuma dependência de outras migrations SQL além do banco base.

---

## Modelo de Dados

Diagrama lógico das tabelas e seus relacionamentos:

```
auth.users (Supabase Auth)
│
├── profiles          (1:1 — id = auth.users.id)
│
├── events            (N:1 — user_id → auth.users.id)
│
├── categories        (N:1 — user_id → auth.users.id)
│
├── push_subscriptions (N:1 — user_id → auth.users.id)
│
├── notification_logs  (N:1 — user_id → auth.users.id)
│                      [event_id referencia events.id conceitualmente,
│                       mas sem FK formal — desacoplamento intencional]
│
├── academic_calendars (N:1 — user_id → auth.users.id)
│   │
│   └── academic_events (N:1 — calendar_id → academic_calendars.id)
│
└── ai_metrics         (N:1 — user_id → auth.users.id)

storage.objects (Supabase Storage)
└── bucket: avatars  (gerenciado por políticas RLS de storage)
```

---

## Documentação das Tabelas

### `events`

**Objetivo:** Tabela central do sistema. Armazena todos os compromissos dos usuários, incluindo suporte a recorrência.

| Coluna                  | Tipo        | Nullable | Padrão                    |
|-------------------------|-------------|----------|---------------------------|
| `id`                    | UUID        | NÃO      | `gen_random_uuid()`       |
| `user_id`               | UUID        | NÃO      | —                         |
| `title`                 | TEXT        | NÃO      | —                         |
| `event_date`            | DATE        | NÃO      | —                         |
| `start_time`            | TIME        | SIM      | —                         |
| `duration_minutes`      | INTEGER     | SIM      | —                         |
| `category`              | TEXT        | SIM      | —                         |
| `color`                 | TEXT        | SIM      | —                         |
| `location`              | TEXT        | SIM      | —                         |
| `description`           | TEXT        | SIM      | —                         |
| `reminder_minutes`      | INTEGER     | SIM      | —                         |
| `recurrence_type`       | TEXT        | NÃO      | `'none'`                  |
| `recurrence_interval`   | INTEGER     | SIM      | —                         |
| `recurrence_until`      | DATE        | SIM      | —                         |
| `recurrence_days_of_week` | TEXT      | SIM      | —                         |
| `created_at`            | TIMESTAMPTZ | NÃO      | `now()`                   |
| `updated_at`            | TIMESTAMPTZ | NÃO      | `now()`                   |

**Constraint:** `events_recurrence_type_check` — `recurrence_type` deve ser um de: `none`, `daily`, `weekdays`, `weekly`, `biweekly`, `monthly`, `yearly`, `custom`.

**Índices:** `events_user_id_idx`, `events_user_date_idx`

**Triggers:** `events_updated_at`

**RLS:** Todas as operações restritas ao próprio usuário via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O campo `category` armazena o nome textual da categoria (não a FK para `categories`). A exclusão de uma categoria não quebra eventos existentes, mas o frontend impede a exclusão de categorias em uso.

---

### `categories`

**Objetivo:** Categorias personalizadas por usuário para classificação visual de eventos.

| Coluna       | Tipo        | Nullable | Padrão        |
|--------------|-------------|----------|---------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —             |
| `name`       | TEXT        | NÃO      | —             |
| `color`      | TEXT        | NÃO      | `'#3b82f6'`   |
| `icon`       | TEXT        | SIM      | —             |
| `created_at` | TIMESTAMPTZ | NÃO      | `now()`       |
| `updated_at` | TIMESTAMPTZ | NÃO      | `now()`       |

**Índices:**
- `categories_user_name_idx` — UNIQUE em `(user_id, lower(name))`
- `categories_user_id_idx` em `(user_id)`

**Triggers:** `categories_updated_at`

**RLS:** Todas as operações restritas ao próprio usuário via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O índice unique usa `lower(name)` para prevenir duplicatas case-insensitive. O frontend cria categorias padrão (Aula, Plantão, Ambulatório, etc.) automaticamente quando o usuário não possui nenhuma.

---

### `push_subscriptions`

**Objetivo:** Armazena as assinaturas Web Push de cada dispositivo por usuário, permitindo múltiplos dispositivos simultâneos.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|---------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `endpoint`   | TEXT        | NÃO      | —                   |
| `p256dh`     | TEXT        | NÃO      | —                   |
| `auth`       | TEXT        | NÃO      | —                   |
| `user_agent` | TEXT        | SIM      | —                   |
| `created_at` | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at` | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `push_subscriptions_user_endpoint` — UNIQUE em `(user_id, endpoint)`

**Triggers:** `push_subscriptions_updated_at`

**RLS:** SELECT, INSERT, UPDATE e DELETE restritos ao próprio usuário.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O `endpoint` identifica unicamente o dispositivo. O par `p256dh` e `auth` são as chaves criptográficas necessárias para cifrar as mensagens push. O upsert via `onConflict: 'user_id,endpoint'` garante idempotência no registro.

---

### `notification_logs`

**Objetivo:** Registra cada notificação enviada para prevenir envios duplicados e fornecer trilha de auditoria.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|---------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `event_id`   | UUID        | NÃO      | —                   |
| `event_date` | DATE        | NÃO      | —                   |
| `status`     | TEXT        | NÃO      | `'sent'`            |
| `error`      | TEXT        | SIM      | —                   |
| `sent_at`    | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:**
- `notification_logs_dedup` — UNIQUE em `(user_id, event_id, event_date)`
- `notification_logs_sent_at_idx` em `(sent_at)`

**RLS:** Apenas SELECT para o próprio usuário. Inserções são feitas pela Edge Function com `service_role`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`
- `event_id` referencia `events.id` conceitualmente, mas sem FK formal — decisão intencional para suportar eventos recorrentes sem complicar o modelo.

**Observações:** O campo `status` aceita `sent` ou `failed`. O índice `notification_logs_dedup` é a principal garantia de idempotência — uma tentativa de inserção duplicada gera conflito, evitando notificação repetida para o mesmo evento na mesma data.

---

### `profiles`

**Objetivo:** Perfil estendido do usuário com preferências acadêmicas e de configuração da aplicação.

| Coluna                 | Tipo        | Nullable | Padrão                  |
|------------------------|-------------|----------|-------------------------|
| `id`                   | UUID        | NÃO      | — (PK = auth.users.id)  |
| `full_name`            | TEXT        | SIM      | —                       |
| `avatar_url`           | TEXT        | SIM      | —                       |
| `university`           | TEXT        | SIM      | —                       |
| `course`               | TEXT        | SIM      | —                       |
| `semester`             | SMALLINT    | SIM      | —                       |
| `timezone`             | TEXT        | SIM      | `'America/Sao_Paulo'`   |
| `notification_enabled` | BOOLEAN     | SIM      | `true`                  |
| `theme`                | TEXT        | SIM      | `'light'`               |
| `created_at`           | TIMESTAMPTZ | SIM      | `now()`                 |
| `updated_at`           | TIMESTAMPTZ | SIM      | `now()`                 |

**Constraints:**
- `semester`: CHECK `(semester BETWEEN 1 AND 12)`
- `theme`: CHECK `(theme IN ('light', 'dark', 'system'))`

**Triggers:**
- `on_auth_user_created` (em `auth.users`) — cria automaticamente o perfil ao registrar novo usuário.
- `profiles_updated_at` — atualiza `updated_at` em cada UPDATE.

**RLS:** SELECT, INSERT, UPDATE (com USING e WITH CHECK) e DELETE restritos a `auth.uid() = id`.

**Relacionamentos:**
- `id` → `auth.users(id)` com `ON DELETE CASCADE` (relação 1:1)

**Observações:** `created_at` e `updated_at` são nullable, diferentemente das demais tabelas onde são NOT NULL — inconsistência presente na migration original. O `avatar_url` armazena a URL pública do arquivo no bucket `avatars`.

---

### `academic_calendars`

**Objetivo:** Representa um calendário acadêmico completo, agrupando eventos de um período letivo ou instituição.

| Coluna          | Tipo        | Nullable | Padrão              |
|-----------------|-------------|----------|---------------------|
| `id`            | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`       | UUID        | NÃO      | —                   |
| `name`          | TEXT        | NÃO      | —                   |
| `university`    | TEXT        | SIM      | —                   |
| `academic_year` | TEXT        | SIM      | —                   |
| `color`         | TEXT        | NÃO      | `'#7c3aed'`         |
| `created_at`    | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at`    | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:** `academic_calendars_user_id_idx` em `(user_id)`

**Triggers:** `academic_calendars_updated_at`

**RLS:** SELECT, INSERT, UPDATE e DELETE restritos a `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

---

### `academic_events`

**Objetivo:** Eventos dentro de um calendário acadêmico, com suporte a eventos de múltiplos dias (provas, semanas acadêmicas, recessos).

| Coluna        | Tipo        | Nullable | Padrão              |
|---------------|-------------|----------|---------------------|
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
| `created_at`  | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at`  | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:**
- `academic_events_calendar_id_idx` em `(calendar_id)`
- `academic_events_start_date_idx` em `(start_date)`

**Triggers:** `academic_events_updated_at`

**RLS:** Acesso via JOIN com `academic_calendars` — o usuário só acessa eventos de calendários que lhe pertencem. Não há `user_id` direto nesta tabela.

**Relacionamentos:**
- `calendar_id` → `academic_calendars(id)` com `ON DELETE CASCADE`

**Observações:** O campo `end_date` é opcional — eventos de um único dia omitem o campo. O frontend expande eventos de múltiplos dias em entradas individuais por data via `expandAcademicEvents()`.

---

### `ai_metrics`

**Objetivo:** Registrar métricas de uso das funcionalidades de IA sem armazenar o conteúdo das conversas ou prompts.

| Coluna        | Tipo        | Nullable | Padrão              |
|---------------|-------------|----------|---------------------|
| `id`          | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`     | UUID        | NÃO      | —                   |
| `prompt_type` | TEXT        | NÃO      | —                   |
| `duration_ms` | INTEGER     | SIM      | —                   |
| `success`     | BOOLEAN     | NÃO      | `true`              |
| `error_code`  | TEXT        | SIM      | —                   |
| `created_at`  | TIMESTAMPTZ | NÃO      | `now()`             |

**RLS:** Apenas SELECT para o próprio usuário. Inserções realizadas via Edge Function com `service_role`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** `prompt_type` identifica o tipo de análise solicitada (ex: resumo semanal, sugestão de estudo, análise de agenda). Não há `updated_at` pois registros de métricas são imutáveis.

---

## Índices

| Nome                                | Tabela                | Colunas                         | Tipo   | Objetivo                                                    |
|-------------------------------------|-----------------------|---------------------------------|--------|-------------------------------------------------------------|
| `events_user_id_idx`                | `events`              | `(user_id)`                     | B-tree | Filtro rápido de eventos por usuário                        |
| `events_user_date_idx`              | `events`              | `(user_id, event_date)`         | B-tree | Queries de calendário por usuário + intervalo de datas      |
| `categories_user_name_idx`          | `categories`          | `(user_id, lower(name))`        | UNIQUE | Previne categorias duplicadas case-insensitive por usuário  |
| `categories_user_id_idx`            | `categories`          | `(user_id)`                     | B-tree | Listagem de categorias do usuário                           |
| `push_subscriptions_user_endpoint`  | `push_subscriptions`  | `(user_id, endpoint)`           | UNIQUE | Garante uma assinatura por dispositivo por usuário          |
| `notification_logs_dedup`           | `notification_logs`   | `(user_id, event_id, event_date)` | UNIQUE | Previne notificação duplicada para o mesmo evento/data     |
| `notification_logs_sent_at_idx`     | `notification_logs`   | `(sent_at)`                     | B-tree | Queries de cleanup por data e auditoria temporal            |
| `academic_calendars_user_id_idx`    | `academic_calendars`  | `(user_id)`                     | B-tree | Listagem de calendários do usuário                          |
| `academic_events_calendar_id_idx`   | `academic_events`     | `(calendar_id)`                 | B-tree | Busca de eventos por calendário                             |
| `academic_events_start_date_idx`    | `academic_events`     | `(start_date)`                  | B-tree | Filtro de eventos por data de início                        |

---

## Triggers

Todos os triggers de atualização de timestamps seguem o mesmo padrão, reutilizando uma única função centralizada.

### `update_updated_at()`

Função TRIGGER do tipo `BEFORE UPDATE` que atribui `now()` ao campo `updated_at` antes de cada atualização. Definida em `01_events.sql` e compartilhada por todas as tabelas com este campo.

| Trigger                          | Tabela               | Momento       | Função chamada         |
|----------------------------------|----------------------|---------------|------------------------|
| `events_updated_at`              | `events`             | BEFORE UPDATE | `update_updated_at()`  |
| `categories_updated_at`          | `categories`         | BEFORE UPDATE | `update_updated_at()`  |
| `push_subscriptions_updated_at`  | `push_subscriptions` | BEFORE UPDATE | `update_updated_at()`  |
| `profiles_updated_at`            | `profiles`           | BEFORE UPDATE | `update_updated_at()`  |
| `academic_calendars_updated_at`  | `academic_calendars` | BEFORE UPDATE | `update_updated_at()`  |
| `academic_events_updated_at`     | `academic_events`    | BEFORE UPDATE | `update_updated_at()`  |

### `on_auth_user_created`

Trigger especial em `auth.users` (`AFTER INSERT`), que chama `handle_new_user()`. Garante que todo novo usuário tenha um perfil criado automaticamente, com o `full_name` extraído dos metadados de cadastro via `raw_user_meta_data->>'full_name'`. Usa `ON CONFLICT (id) DO NOTHING` para ser idempotente.

---

## Funções SQL

### `update_updated_at()`

- **Tipo:** TRIGGER
- **Linguagem:** PL/pgSQL
- **Objetivo:** Manter o campo `updated_at` sincronizado com o momento exato de cada atualização de registro.
- **Parâmetros:** Nenhum (opera sobre `NEW` implicitamente).
- **Retorno:** `TRIGGER` (retorna `NEW` com `updated_at` atualizado).
- **Utilizada por:** Triggers de todas as tabelas com campo `updated_at`.

### `handle_new_user()`

- **Tipo:** TRIGGER com `SECURITY DEFINER`
- **Linguagem:** PL/pgSQL
- **Objetivo:** Criar automaticamente uma linha em `profiles` para cada novo usuário registrado no Supabase Auth.
- **Parâmetros:** Nenhum (opera sobre `NEW` do trigger em `auth.users`).
- **Retorno:** `TRIGGER` (retorna `NEW`).
- **Utilizada por:** Trigger `on_auth_user_created` em `auth.users`.
- **Observação:** Executada com `SECURITY DEFINER` e `SET search_path = public` para garantir permissão de escrita em `profiles` mesmo partindo do schema `auth`.

### `cleanup_old_notification_logs()`

- **Tipo:** Função utilitária
- **Linguagem:** SQL
- **Objetivo:** Remover registros de `notification_logs` com mais de 90 dias para controle do crescimento da tabela.
- **Parâmetros:** Nenhum.
- **Retorno:** `void`.
- **Utilizada por:** Pode ser agendada via Supabase Scheduler (recomendado) ou pg_cron. Não é chamada automaticamente por nenhum trigger.

---

## Row Level Security

O MedAgenda adota uma estratégia de **isolamento completo por usuário** via RLS. Toda tabela de dados do usuário tem `ENABLE ROW LEVEL SECURITY` e políticas que garantem que cada usuário veja e modifique apenas seus próprios dados.

O mecanismo central é `auth.uid()`, função do Supabase que retorna o UUID do usuário autenticado na sessão atual.

### Estratégias adotadas

**Acesso direto por `user_id`:** Padrão utilizado em `events`, `categories`, `push_subscriptions`, `academic_calendars`, `profiles`.

```
USING (user_id = auth.uid())
```

**Acesso via JOIN:** Utilizado em `academic_events`, que não possui `user_id` diretamente — o acesso é validado verificando se o `calendar_id` referencia um calendário pertencente ao usuário autenticado.

```
USING (
  EXISTS (
    SELECT 1 FROM academic_calendars
    WHERE id = calendar_id AND user_id = auth.uid()
  )
)
```

**Acesso apenas para leitura pelo usuário:** `notification_logs` e `ai_metrics` — o usuário pode consultar seus próprios registros, mas inserções são feitas exclusivamente via `service_role` em Edge Functions.

**Acesso público para leitura:** Storage bucket `avatars` — SELECT público para que as URLs de avatar funcionem sem autenticação, enquanto INSERT, UPDATE e DELETE são restritos ao próprio dono.

### Detalhamento por tabela

| Tabela                | SELECT              | INSERT              | UPDATE              | DELETE              |
|-----------------------|---------------------|---------------------|---------------------|---------------------|
| `events`              | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `categories`          | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `push_subscriptions`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `notification_logs`   | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `profiles`            | `id = uid()`        | `id = uid()`        | `id = uid()`        | `id = uid()`        |
| `academic_calendars`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `academic_events`     | via JOIN            | via JOIN            | via JOIN            | via JOIN            |
| `ai_metrics`          | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `storage.objects`     | público (avatars)   | `uid()` = pasta     | `uid()` = pasta     | `uid()` = pasta     |

---

## Integridade dos Dados

### Foreign Keys

Todas as referências a `auth.users(id)` usam `ON DELETE CASCADE`, garantindo que a exclusão de um usuário remova automaticamente todos os seus dados nas tabelas de domínio.

A relação `academic_events.calendar_id → academic_calendars(id)` também usa `ON DELETE CASCADE`, de forma que excluir um calendário remove todos os seus eventos.

### Constraints e Validações

| Tabela     | Constraint                        | Regra                                                                                      |
|------------|-----------------------------------|--------------------------------------------------------------------------------------------|
| `events`   | `events_recurrence_type_check`    | `recurrence_type` ∈ `{none, daily, weekdays, weekly, biweekly, monthly, yearly, custom}`  |
| `profiles` | CHECK em `semester`               | `semester BETWEEN 1 AND 12`                                                                |
| `profiles` | CHECK em `theme`                  | `theme` ∈ `{light, dark, system}`                                                          |

### Campos Obrigatórios vs. Opcionais

- **Obrigatórios em `events`:** `id`, `user_id`, `title`, `event_date`, `recurrence_type`, `created_at`, `updated_at`.
- **Obrigatórios em `categories`:** `id`, `user_id`, `name`, `color`, `created_at`, `updated_at`.
- **Obrigatórios em `push_subscriptions`:** `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, `updated_at`.
- **Obrigatórios em `notification_logs`:** `id`, `user_id`, `event_id`, `event_date`, `status`, `sent_at`.
- **Obrigatórios em `profiles`:** apenas `id` (PK). Todos os demais campos são opcionais.
- **Obrigatórios em `academic_calendars`:** `id`, `user_id`, `name`, `color`, `created_at`, `updated_at`.
- **Obrigatórios em `academic_events`:** `id`, `calendar_id`, `title`, `start_date`, `all_day`, `created_at`, `updated_at`.
- **Obrigatórios em `ai_metrics`:** `id`, `user_id`, `prompt_type`, `success`, `created_at`.

### Unicidade

- Categorias: não duplicadas por usuário (case-insensitive).
- Push subscriptions: um endpoint por usuário.
- Notification logs: uma entrada por combinação `(user_id, event_id, event_date)`.
- Profiles: exatamente um perfil por usuário (PK = FK para `auth.users`).

---

## Fluxo de Persistência

### Eventos

```
Frontend (eventFormView.js)
  ↓ createEvent() / updateEvent() / deleteEvent()
eventService.js
  ↓ supabase.from('events').insert/update/delete
Supabase (RLS valida user_id = auth.uid())
  ↓
Tabela: events
  ↓ Trigger: events_updated_at → update_updated_at()
Resposta: objeto do evento criado/atualizado
```

Para consultas por intervalo, `getEventsByRange()` dispara duas queries paralelas e mescla os resultados no cliente, tratando eventos recorrentes cujas ocorrências futuras caem dentro da janela de tempo solicitada.

### Categorias

```
Frontend (categoryView.js)
  ↓ getCategories() / createCategory() / updateCategory() / deleteCategory()
categoryService.js
  ↓ supabase.from('categories')...
Supabase (RLS valida user_id = auth.uid())
  ↓
Tabela: categories
  ↓ Trigger: categories_updated_at → update_updated_at()
Resposta: array ou objeto de categoria
```

O `deleteCategory()` verifica previamente no frontend se há eventos utilizando a categoria antes de permitir a exclusão.

### Calendário Acadêmico

```
Frontend (academicCalendarView.js)
  ↓ getCalendars() / createCalendar() / getAcademicEvents()...
academicCalendarService.js
  ↓ supabase.from('academic_calendars' | 'academic_events')...
Supabase (RLS via user_id direto para calendars; via JOIN para events)
  ↓
Tabelas: academic_calendars → academic_events
Resposta: objetos ou arrays
```

O `getAcademicEventsByRange()` faz join com `academic_calendars` para retornar dados do calendário pai. O frontend expande eventos de múltiplos dias com `expandAcademicEvents()`.

### Perfil

```
Frontend (accountView.js)
  ↓ getProfile() / upsertProfile()
profileService.js
  ↓ supabase.from('profiles').select / .upsert
Supabase (RLS valida id = auth.uid())
  ↓
Tabela: profiles
  ↓ Trigger: profiles_updated_at → update_updated_at()
Resposta: objeto do perfil
```

O `upsertProfile()` usa uma lista de allowlist de campos para evitar que campos não autorizados sejam enviados ao banco.

### Notificações Push

```
Frontend (pushService.js)
  ↓ subscribeToPush() / unsubscribeFromPush()
  ↓ supabase.from('push_subscriptions').upsert / .delete
Tabela: push_subscriptions (RLS valida user_id = auth.uid())

Edge Function: send-push-notifications (service_role)
  ↓ Consulta push_subscriptions e events
  ↓ Envia notificações
  ↓ Insere em notification_logs (bypassa RLS via service_role)
Tabela: notification_logs
```

### IA (Métricas)

```
Frontend (aiPanelView.js / assistantView.js)
  ↓ getWeeklySummary() / getStudySuggestion() / getScheduleAnalysis()
services/ai/aiService.js
  ↓ callGemini() — chamada ao provedor externo
  ↓ parseResponse()
Resposta: string em linguagem natural

Edge Function (opcional)
  ↓ Registra métricas de uso
  ↓ supabase.from('ai_metrics').insert (service_role)
Tabela: ai_metrics
```

---

## Convenções

O banco de dados segue convenções consistentes em todas as migrations:

| Convenção          | Padrão adotado                                                                                |
|--------------------|-----------------------------------------------------------------------------------------------|
| **Chaves primárias** | `UUID` gerado por `gen_random_uuid()`                                                       |
| **Timestamps**     | `TIMESTAMPTZ` com timezone incluído. Sempre `created_at` e `updated_at`.                     |
| **Strings**        | `TEXT` sem limite de tamanho definido, salvo exceções documentadas (`SMALLINT` para semester). |
| **Booleans**       | `BOOLEAN` com valor padrão explícito.                                                         |
| **JSON**           | Não utilizado nas tabelas de domínio. `raw_user_meta_data` (JSONB) existe em `auth.users` mas é gerenciado pelo Supabase Auth. |
| **Atualização de timestamps** | Via trigger `update_updated_at()` em `BEFORE UPDATE`. Nenhuma tabela depende da aplicação para atualizar `updated_at`. |
| **RLS**            | Habilitado em todas as tabelas públicas via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.     |
| **Nomes de políticas** | Descritivos em inglês: `"Users can view own events"` ou padrão `tabela_operação`.        |
| **Cascade**        | `ON DELETE CASCADE` em todas as FKs que referenciam `auth.users(id)`.                        |
| **Idempotência**   | Uso de `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE FUNCTION` para tornar as migrations reaplicáveis com segurança. |

---

## Auditoria de Consistência

### Migrations em ordem

As 8 migrations estão numeradas sequencialmente de `01` a `08`. A ordem de dependências está documentada em cada arquivo:

- `02`, `03`, `04`, `05`, `07` dependem de `01` (função `update_updated_at`).
- `06` é independente das demais (atua em `storage.objects`).
- `08` não tem dependência declarada além do banco base.

### Análise de consistência

| Item                              | Status        | Observação                                                                                         |
|-----------------------------------|---------------|----------------------------------------------------------------------------------------------------|
| Migrations em ordem               | Consistente   | Numeração sequencial, dependências respeitadas.                                                    |
| Ausência de duplicações           | Consistente   | `IF NOT EXISTS` e `CREATE OR REPLACE` garantem idempotência.                                      |
| Função `update_updated_at` reutilizada | Consistente | Todas as tabelas com `updated_at` usam a mesma função central.                                |
| Triggers consistentes             | Consistente   | Todos os triggers de timestamp seguem o mesmo padrão `BEFORE UPDATE FOR EACH ROW`.                |
| RLS em todas as tabelas           | Consistente   | Todas as tabelas públicas têm RLS habilitado.                                                      |
| `profiles.created_at` nullable    | Inconsistência menor | Em `profiles`, `created_at` e `updated_at` são `TIMESTAMPTZ DEFAULT NOW()` sem `NOT NULL`, diferente das demais tabelas. Não impacta funcionalidade mas quebra a convenção. |
| `03_recurrence.sql` redundante    | Inconsistência menor | As colunas adicionadas por `03_recurrence.sql` já estão declaradas em `01_events.sql`. A migration é segura (`IF NOT EXISTS`), mas é desnecessária quando executada depois de `01`. |
| `notification_logs.event_id` sem FK formal | Decisão arquitetural | `event_id` referencia `events.id` mas sem FK declarada. Decisão intencional para suportar eventos recorrentes e simplificar limpeza de logs. |
| Campo `category` em `events` como TEXT | Decisão arquitetural | Não há FK para `categories`. O vínculo é por nome textual, gerenciado pelo frontend. Exclusão de categoria não quebra eventos existentes. |
| Compatibilidade frontend-banco    | Consistente   | Todos os campos consultados e escritos pelos services correspondem exatamente às colunas existentes nas tabelas. |

---

## Estado Atual

| Métrica                    | Quantidade |
|----------------------------|------------|
| Tabelas                    | 8          |
| Migrations                 | 8          |
| Triggers                   | 7          |
| Funções SQL                | 3          |
| Políticas RLS (tabelas)    | 27         |
| Políticas RLS (storage)    | 4          |
| Índices                    | 10         |

**Avaliação geral da arquitetura:**

O banco de dados do MedAgenda é simples, coeso e bem alinhado com as capacidades do Supabase. A delegação de autenticação ao Supabase Auth, combinada com RLS granular, garante isolamento robusto dos dados sem complexidade adicional na camada de serviço. A função `update_updated_at()` centralizada e o padrão uniforme de triggers demonstram coerência arquitetural.

As duas inconsistências menores encontradas — `profiles` com timestamps nullable e `03_recurrence.sql` redundante — não comprometem a integridade do sistema e podem ser tratadas em oportunidades futuras de manutenção. O desacoplamento intencional entre `events` e `notification_logs` (sem FK formal) é uma decisão defensiva válida para o contexto de eventos recorrentes.
