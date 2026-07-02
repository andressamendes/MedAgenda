# Banco de Dados MedAgenda

## Visão Geral

O MedAgenda utiliza o **PostgreSQL** como banco de dados relacional, gerenciado pela plataforma **Supabase**. A arquitetura é fundamentada em três pilares:

- **Row Level Security (RLS):** todas as tabelas de dados do usuário têm RLS habilitado. O acesso é restrito ao próprio dono dos dados por meio de `auth.uid()`, eliminando a necessidade de filtros manuais no backend para isolamento de usuários.
- **Supabase Auth:** a autenticação é delegada inteiramente ao Supabase (`auth.users`). As tabelas de domínio referenciam `auth.users(id)` via chave estrangeira com `ON DELETE CASCADE`.
- **Edge Functions:** operações que requerem privilégios elevados (como inserir logs de notificação ou enviar push) são executadas via Edge Functions com `service_role`, contornando o RLS de forma controlada e auditada.

As migrations estão organizadas em arquivos numerados sequencialmente em `/sql`, devendo ser executadas em ordem no SQL Editor do Supabase. Cada arquivo é autocontido e declara explicitamente suas dependências nos comentários de cabeçalho.

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

## Modelo de Dados

Diagrama lógico das tabelas e seus relacionamentos:

```
auth.users  (Supabase Auth — schema auth)
│
├── profiles           (1:1 — id PK = auth.users.id)
│
├── events             (N:1 — user_id → auth.users.id)
│
├── categories         (N:1 — user_id → auth.users.id)
│
├── push_subscriptions (N:1 — user_id → auth.users.id)
│
├── notification_logs  (N:1 — user_id → auth.users.id)
│                      [event_id → events.id, ON DELETE CASCADE]
│
├── academic_calendars (N:1 — user_id → auth.users.id)
│   │
│   └── academic_events (N:1 — calendar_id → academic_calendars.id)
│
└── ai_metrics         (N:1 — user_id → auth.users.id)

storage.objects (Supabase Storage — schema storage)
└── bucket: avatars  (gerenciado por políticas RLS de storage, sem FK relacional)
```

---

## Documentação das Tabelas

### `events`

**Objetivo:** Tabela central do sistema. Armazena todos os compromissos dos usuários com suporte completo a recorrência, lembretes e categorização.

| Coluna                    | Tipo        | Nullable | Padrão                |
|---------------------------|-------------|----------|-----------------------|
| `id`                      | UUID        | NÃO      | `gen_random_uuid()`   |
| `user_id`                 | UUID        | NÃO      | —                     |
| `title`                   | TEXT        | NÃO      | —                     |
| `event_date`              | DATE        | NÃO      | —                     |
| `start_time`              | TIME        | SIM      | —                     |
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
| `created_at`              | TIMESTAMPTZ | NÃO      | `now()`               |
| `updated_at`              | TIMESTAMPTZ | NÃO      | `now()`               |

**Constraints:**
- `events_recurrence_type_check` — `recurrence_type` deve ser um de: `none`, `daily`, `weekdays`, `weekly`, `biweekly`, `monthly`, `yearly`, `custom`.

**Índices:** `events_user_id_idx`, `events_user_date_idx`

**Triggers:** `events_updated_at`

**RLS:** Todas as operações restritas ao próprio usuário via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O campo `category` armazena o nome textual da categoria (não uma FK para `categories`). O vínculo é conceitual — a exclusão de uma categoria no banco não quebra os eventos existentes, mas o frontend impede a exclusão de categorias em uso. O campo `recurrence_days_of_week` armazena dias como string (ex: `"1,3,5"`) para o tipo `custom`.

---

### `categories`

**Objetivo:** Categorias personalizadas por usuário para classificação visual e filtragem de eventos.

| Coluna       | Tipo        | Nullable | Padrão              |
|--------------|-------------|----------|---------------------|
| `id`         | UUID        | NÃO      | `gen_random_uuid()` |
| `user_id`    | UUID        | NÃO      | —                   |
| `name`       | TEXT        | NÃO      | —                   |
| `color`      | TEXT        | NÃO      | `'#3b82f6'`         |
| `icon`       | TEXT        | SIM      | —                   |
| `created_at` | TIMESTAMPTZ | NÃO      | `now()`             |
| `updated_at` | TIMESTAMPTZ | NÃO      | `now()`             |

**Índices:**
- `categories_user_name_idx` — UNIQUE em `(user_id, lower(name))`
- `categories_user_id_idx` em `(user_id)`

**Triggers:** `categories_updated_at`

**RLS:** Todas as operações restritas ao próprio usuário via `user_id = auth.uid()`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O índice único usa `lower(name)` para prevenir duplicatas case-insensitive. O frontend cria 8 categorias padrão (`Aula`, `Plantão`, `Ambulatório`, `Laboratório`, `Estudo`, `Prova`, `Congresso`, `Pessoal`) automaticamente via `ensureDefaultCategories()` quando o usuário não possui nenhuma. O campo `icon` existe na estrutura mas não é utilizado pelo frontend atual.

---

### `push_subscriptions`

**Objetivo:** Armazena as assinaturas Web Push de cada dispositivo por usuário, permitindo múltiplos dispositivos simultâneos (desktop, mobile, notebook).

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

**RLS:** SELECT, INSERT, UPDATE e DELETE restritos ao próprio usuário via `auth.uid() = user_id`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** O `endpoint` identifica unicamente o dispositivo junto ao serviço de push do navegador. O par `p256dh` e `auth` são as chaves criptográficas para cifrar mensagens push via protocolo Web Push. O frontend usa upsert com `onConflict: 'user_id,endpoint'` para garantir idempotência no registro. A Edge Function `send-push-notifications` remove automaticamente assinaturas que retornam HTTP 410 ou 404 (assinatura revogada pelo navegador).

---

### `notification_logs`

**Objetivo:** Registra cada notificação enviada para prevenir envios duplicados e fornecer trilha de auditoria para diagnóstico.

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

**RLS:** Apenas SELECT para o próprio usuário via `auth.uid() = user_id`. Inserções realizadas pela Edge Function `send-push-notifications` com `service_role`, contornando o RLS de forma intencional.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`
- `event_id` → `events(id)` com `ON DELETE CASCADE` (migration `09_notification_logs_integrity.sql`)

**Observações:** O campo `status` aceita `'sent'` ou `'failed'`. O índice `notification_logs_dedup` é a principal garantia de idempotência — um upsert para a mesma combinação `(user_id, event_id, event_date)` atualiza o registro existente em vez de duplicar. A FK em `event_id` com `ON DELETE CASCADE` garante que, ao excluir um evento (recorrente ou não), todo o seu histórico de notificações seja removido junto, eliminando a possibilidade de logs órfãos. A função `cleanup_old_notification_logs()` remove registros com mais de 90 dias.

---

### `profiles`

**Objetivo:** Perfil estendido do usuário com informações acadêmicas e preferências de configuração da aplicação. Criado automaticamente via trigger no momento do cadastro.

| Coluna                 | Tipo        | Nullable | Padrão                |
|------------------------|-------------|----------|-----------------------|
| `id`                   | UUID        | NÃO      | — (PK = auth.users.id)|
| `full_name`            | TEXT        | SIM      | —                     |
| `avatar_url`           | TEXT        | SIM      | —                     |
| `university`           | TEXT        | SIM      | —                     |
| `course`               | TEXT        | SIM      | —                     |
| `semester`             | SMALLINT    | SIM      | —                     |
| `timezone`             | TEXT        | SIM      | `'America/Sao_Paulo'` |
| `notification_enabled` | BOOLEAN     | SIM      | `true`                |
| `theme`                | TEXT        | SIM      | `'light'`             |
| `created_at`           | TIMESTAMPTZ | SIM      | `now()`               |
| `updated_at`           | TIMESTAMPTZ | SIM      | `now()`               |

**Constraints:**
- `semester`: CHECK `(semester BETWEEN 1 AND 12)`
- `theme`: CHECK `(theme IN ('light', 'dark', 'system'))`

**Triggers:**
- `on_auth_user_created` (em `auth.users`) — cria automaticamente o perfil ao registrar novo usuário.
- `profiles_updated_at` — atualiza `updated_at` em cada UPDATE.

**RLS:** SELECT, INSERT, UPDATE (com `USING` e `WITH CHECK`) e DELETE restritos a `auth.uid() = id`.

**Relacionamentos:**
- `id` → `auth.users(id)` com `ON DELETE CASCADE` (relação 1:1)

**Observações:** `created_at` e `updated_at` são nullable nesta tabela, diferentemente das demais onde são `NOT NULL` — inconsistência presente na migration original. Não impacta funcionalidade pois ambos têm `DEFAULT now()`. O `avatar_url` armazena a URL pública do arquivo no bucket `avatars`. O `profileService.js` usa uma allowlist de campos na função `upsertProfile()` para evitar que campos não autorizados sejam gravados.

---

### `academic_calendars`

**Objetivo:** Representa um calendário acadêmico completo pertencente a um usuário, agrupando eventos de um período letivo ou instituição específica.

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

**Objetivo:** Eventos dentro de um calendário acadêmico com suporte a eventos de múltiplos dias (provas, semanas acadêmicas, recessos, rodízios).

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

**RLS:** Acesso via subquery com `EXISTS` verificando ownership do calendário pai. O usuário só acessa eventos de calendários que lhe pertencem. A tabela não possui `user_id` diretamente.

**Relacionamentos:**
- `calendar_id` → `academic_calendars(id)` com `ON DELETE CASCADE`

**Observações:** `end_date` é opcional — eventos de um único dia omitem o campo. O frontend expande eventos de múltiplos dias em entradas individuais por data via `expandAcademicEvents()` no `academicCalendarService.js`. Queries de range usam join com `academic_calendars` para retornar `id`, `name` e `color` do calendário pai.

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

**RLS:** Apenas SELECT para o próprio usuário via `auth.uid() = user_id`. Inserções realizadas via Edge Function com `service_role`.

**Relacionamentos:**
- `user_id` → `auth.users(id)` com `ON DELETE CASCADE`

**Observações:** `prompt_type` identifica o tipo de análise solicitada (`weekly_summary`, `study_suggestion`, `schedule_analysis`). Não há `updated_at` pois registros de métricas são imutáveis. A Edge Function `ai-chat` atualmente não insere dados nesta tabela — a tabela está provisionada para uso futuro ou instrumentação opcional (ver seção Auditoria de Consistência).

---

## Índices

| Nome                               | Tabela               | Colunas                           | Tipo   | Objetivo                                                   |
|------------------------------------|----------------------|-----------------------------------|--------|------------------------------------------------------------|
| `events_user_id_idx`               | `events`             | `(user_id)`                       | B-tree | Filtro rápido de eventos por usuário                       |
| `events_user_date_idx`             | `events`             | `(user_id, event_date)`           | B-tree | Queries de calendário por usuário + intervalo de datas     |
| `categories_user_name_idx`         | `categories`         | `(user_id, lower(name))`          | UNIQUE | Previne categorias duplicadas case-insensitive por usuário |
| `categories_user_id_idx`           | `categories`         | `(user_id)`                       | B-tree | Listagem de categorias do usuário                          |
| `push_subscriptions_user_endpoint` | `push_subscriptions` | `(user_id, endpoint)`             | UNIQUE | Garante uma assinatura por dispositivo por usuário         |
| `notification_logs_dedup`          | `notification_logs`  | `(user_id, event_id, event_date)` | UNIQUE | Previne notificação duplicada para o mesmo evento/data     |
| `notification_logs_sent_at_idx`    | `notification_logs`  | `(sent_at)`                       | B-tree | Queries de cleanup por data e auditoria temporal           |
| `academic_calendars_user_id_idx`   | `academic_calendars` | `(user_id)`                       | B-tree | Listagem de calendários do usuário                         |
| `academic_events_calendar_id_idx`  | `academic_events`    | `(calendar_id)`                   | B-tree | Busca de eventos por calendário                            |
| `academic_events_start_date_idx`   | `academic_events`    | `(start_date)`                    | B-tree | Filtro de eventos por data de início                       |

---

## Triggers

Todos os triggers de atualização de timestamps seguem o mesmo padrão, reutilizando uma única função centralizada definida em `01_events.sql`.

### `update_updated_at()`

Função TRIGGER do tipo `BEFORE UPDATE` que atribui `now()` ao campo `updated_at` do registro sendo atualizado. Definida uma única vez em `01_events.sql` e compartilhada por todas as tabelas que possuem o campo `updated_at`.

| Trigger                          | Tabela               | Momento       | Função chamada        |
|----------------------------------|----------------------|---------------|-----------------------|
| `events_updated_at`              | `events`             | BEFORE UPDATE | `update_updated_at()` |
| `categories_updated_at`          | `categories`         | BEFORE UPDATE | `update_updated_at()` |
| `push_subscriptions_updated_at`  | `push_subscriptions` | BEFORE UPDATE | `update_updated_at()` |
| `profiles_updated_at`            | `profiles`           | BEFORE UPDATE | `update_updated_at()` |
| `academic_calendars_updated_at`  | `academic_calendars` | BEFORE UPDATE | `update_updated_at()` |
| `academic_events_updated_at`     | `academic_events`    | BEFORE UPDATE | `update_updated_at()` |

### `on_auth_user_created`

Trigger especial em `auth.users` (`AFTER INSERT FOR EACH ROW`), que chama `handle_new_user()`. Garante que todo novo usuário tenha um perfil criado automaticamente na tabela `profiles`, com o `full_name` extraído dos metadados de cadastro via `raw_user_meta_data->>'full_name'`. Usa `ON CONFLICT (id) DO NOTHING` para ser idempotente em caso de reexecução.

---

## Funções SQL

### `update_updated_at()`

- **Tipo:** TRIGGER
- **Linguagem:** PL/pgSQL
- **Objetivo:** Manter o campo `updated_at` sincronizado com o momento exato de cada atualização de registro, sem depender da camada de aplicação.
- **Parâmetros:** Nenhum (opera sobre a variável especial `NEW` implícita em triggers).
- **Retorno:** `TRIGGER` (retorna `NEW` com `updated_at` atualizado para `now()`).
- **Utilizada por:** 6 triggers de 6 tabelas distintas (`events`, `categories`, `push_subscriptions`, `profiles`, `academic_calendars`, `academic_events`).

### `handle_new_user()`

- **Tipo:** TRIGGER com `SECURITY DEFINER`
- **Linguagem:** PL/pgSQL
- **Objetivo:** Criar automaticamente uma linha em `public.profiles` para cada novo usuário registrado via Supabase Auth, populando o `full_name` a partir dos metadados fornecidos no cadastro.
- **Parâmetros:** Nenhum (opera sobre `NEW` do trigger em `auth.users`).
- **Retorno:** `TRIGGER` (retorna `NEW`).
- **Utilizada por:** Trigger `on_auth_user_created` em `auth.users`.
- **Observação:** Executada com `SECURITY DEFINER` e `SET search_path = public` para garantir permissão de escrita em `profiles` partindo do schema `auth`, onde o trigger está registrado.

### `cleanup_old_notification_logs()`

- **Tipo:** Função utilitária
- **Linguagem:** SQL
- **Objetivo:** Remover registros de `notification_logs` com mais de 90 dias para controlar o crescimento da tabela ao longo do tempo.
- **Parâmetros:** Nenhum.
- **Retorno:** `void`.
- **Utilizada por:** Não é chamada automaticamente por nenhum trigger. Deve ser agendada via Supabase Scheduler (recomendado) ou pg_cron conforme documentado em `04_push_notifications.sql`.

---

## Row Level Security

O MedAgenda adota uma estratégia de **isolamento completo por usuário** via RLS. Toda tabela de dados do usuário tem `ENABLE ROW LEVEL SECURITY` ativado, com políticas que garantem que cada usuário veja e modifique apenas seus próprios dados.

O mecanismo central é `auth.uid()`, função provida pelo Supabase que retorna o UUID do usuário autenticado na sessão atual. A função retorna `NULL` para sessões não autenticadas, efetivamente bloqueando todo acesso sem login.

### Estratégias adotadas

**Acesso direto por `user_id`:** Padrão utilizado em `events`, `categories`, `push_subscriptions`, `academic_calendars`.

```
USING (user_id = auth.uid())
```

**Acesso por chave primária:** Utilizado em `profiles`, onde o `id` é simultaneamente PK e FK para `auth.users`.

```
USING (auth.uid() = id)
```

**Acesso via subquery com JOIN:** Utilizado em `academic_events`, que não possui `user_id` diretamente. O acesso é validado verificando se o `calendar_id` referencia um calendário pertencente ao usuário autenticado.

```
USING (
  EXISTS (
    SELECT 1 FROM academic_calendars
    WHERE id = calendar_id AND user_id = auth.uid()
  )
)
```

**Acesso apenas para leitura pelo usuário:** `notification_logs` e `ai_metrics` — o usuário pode consultar seus próprios registros, mas inserções são feitas exclusivamente via `service_role` em Edge Functions, contornando o RLS de forma controlada.

**Acesso público para leitura (Storage):** Bucket `avatars` — SELECT público para que as URLs de avatar funcionem sem autenticação. INSERT, UPDATE e DELETE restritos ao dono da pasta.

### Detalhamento por tabela

| Tabela                | SELECT              | INSERT              | UPDATE              | DELETE              |
|-----------------------|---------------------|---------------------|---------------------|---------------------|
| `events`              | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `categories`          | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `push_subscriptions`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `notification_logs`   | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `profiles`            | `id = uid()`        | `id = uid()`        | `id = uid()` (USING + WITH CHECK) | `id = uid()` |
| `academic_calendars`  | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   | `user_id = uid()`   |
| `academic_events`     | via JOIN            | via JOIN            | via JOIN            | via JOIN            |
| `ai_metrics`          | `user_id = uid()`   | service_role apenas | —                   | —                   |
| `storage.objects`     | público (avatars)   | `uid()` = pasta     | `uid()` = pasta     | `uid()` = pasta     |

---

## Integridade dos Dados

### Foreign Keys

Todas as referências a `auth.users(id)` usam `ON DELETE CASCADE`, garantindo que a exclusão de um usuário remova automaticamente todos os seus dados nas tabelas de domínio (`events`, `categories`, `push_subscriptions`, `notification_logs`, `profiles`, `academic_calendars`, `ai_metrics`).

A relação `academic_events.calendar_id → academic_calendars(id)` também usa `ON DELETE CASCADE`, de forma que excluir um calendário remove automaticamente todos os seus eventos acadêmicos.

### Constraints e Validações

| Tabela     | Constraint                      | Regra                                                                                        |
|------------|---------------------------------|----------------------------------------------------------------------------------------------|
| `events`   | `events_recurrence_type_check`  | `recurrence_type` ∈ `{none, daily, weekdays, weekly, biweekly, monthly, yearly, custom}`    |
| `profiles` | CHECK em `semester`             | `semester BETWEEN 1 AND 12`                                                                  |
| `profiles` | CHECK em `theme`                | `theme` ∈ `{light, dark, system}`                                                            |

### Campos Obrigatórios vs. Opcionais

- **`events`:** obrigatórios: `id`, `user_id`, `title`, `event_date`, `recurrence_type`, `created_at`, `updated_at`.
- **`categories`:** obrigatórios: `id`, `user_id`, `name`, `color`, `created_at`, `updated_at`.
- **`push_subscriptions`:** obrigatórios: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, `updated_at`.
- **`notification_logs`:** obrigatórios: `id`, `user_id`, `event_id`, `event_date`, `status`, `sent_at`.
- **`profiles`:** obrigatório apenas `id` (PK). Todos os demais campos são opcionais com defaults.
- **`academic_calendars`:** obrigatórios: `id`, `user_id`, `name`, `color`, `created_at`, `updated_at`.
- **`academic_events`:** obrigatórios: `id`, `calendar_id`, `title`, `start_date`, `all_day`, `created_at`, `updated_at`.
- **`ai_metrics`:** obrigatórios: `id`, `user_id`, `prompt_type`, `success`, `created_at`.

### Unicidade garantida pelo banco

- Categorias: nome único por usuário (case-insensitive) via índice `categories_user_name_idx`.
- Push subscriptions: um `endpoint` por usuário via índice `push_subscriptions_user_endpoint`.
- Notification logs: uma entrada por `(user_id, event_id, event_date)` via índice `notification_logs_dedup`.
- Profiles: exatamente um perfil por usuário (PK = FK para `auth.users`).

---

## Fluxo de Persistência

### Eventos

```
Frontend (eventFormView.js)
  ↓ createEvent() / updateEvent() / deleteEvent() / getEventsByRange()
eventService.js
  ↓ supabase.from('events').insert | .update | .delete | .select
Supabase (RLS valida user_id = auth.uid())
  ↓
Tabela: events
  ↓ Trigger: events_updated_at → update_updated_at()
Resposta: objeto do evento criado/atualizado ou confirmação de exclusão
```

Para consultas por intervalo, `getEventsByRange()` dispara duas queries paralelas via `Promise.all()`: uma para eventos com data base dentro do range, outra para eventos recorrentes com data base anterior ao range mas com ocorrências dentro dele. Os resultados são mesclados no cliente com deduplicação por `id`.

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

O `deleteCategory()` verifica previamente no frontend quantos eventos utilizam a categoria antes de permitir a exclusão. Em caso de uso, lança erro de negócio sem chamar o banco.

### Calendário Acadêmico

```
Frontend (academicCalendarView.js)
  ↓ getCalendars() / createCalendar() / getAcademicEventsByRange() / bulkInsertAcademicEvents()
academicCalendarService.js
  ↓ supabase.from('academic_calendars' | 'academic_events')...
Supabase
  ├── academic_calendars: RLS via user_id = auth.uid()
  └── academic_events: RLS via JOIN com academic_calendars
  ↓
Tabelas: academic_calendars → academic_events
Resposta: objetos ou arrays, com join inline de dados do calendário pai
```

O `getAcademicEventsByRange()` faz select com join `academic_calendars(id, name, color)` para retornar metadados do calendário pai junto com cada evento. O frontend expande eventos de múltiplos dias com `expandAcademicEvents()`, gerando entradas individuais por data para renderização no calendário.

### Perfil

**Dados textuais:**

```
Frontend (accountView.js)
  ↓ getProfile() / upsertProfile()
profileService.js
  ↓ supabase.from('profiles').select('*').eq('id', id)
  ↓ supabase.from('profiles').upsert(payload, { onConflict: 'id' })
Supabase (RLS valida id = auth.uid())
  ↓
Tabela: profiles
  ↓ Trigger: profiles_updated_at → update_updated_at()
Resposta: objeto do perfil completo
```

O `upsertProfile()` filtra os campos recebidos contra uma allowlist explícita (`full_name`, `avatar_url`, `university`, `course`, `semester`, `timezone`, `notification_enabled`, `theme`) antes de enviar ao banco.

**Upload de avatar:**

```
Frontend (accountView.js)
  ↓ uploadAvatar(file)
avatarService.js
  ↓ Valida MIME (jpeg/png/webp/gif) e tamanho (máx 2 MB)
  ↓ supabase.storage.from('avatars').upload('{user_id}/avatar.{ext}', file, { upsert: true })
Supabase Storage (policy: avatars_insert_own / avatars_update_own)
  ↓ Verifica: bucket_id = 'avatars' AND auth.uid()::text = pasta do arquivo
Bucket: avatars / {user_id}/avatar.{ext}
  ↓ Retorna URL pública (com ?v={timestamp} para forçar refresh no navegador)
Frontend
  ↓ upsertProfile({ avatar_url: url })
profileService.js → Tabela: profiles (campo avatar_url)
```

A remoção do avatar (`removeAvatar()`) lista todos os arquivos da pasta do usuário no bucket e os remove via `supabase.storage.from('avatars').remove(paths)`. A política `avatars_delete_own` garante que apenas o próprio usuário possa remover seus arquivos.

### Notificações Push

```
Frontend (pushService.js)
  ↓ subscribeToPush() → upsert em push_subscriptions (RLS user)
  ↓ unsubscribeFromPush() → delete em push_subscriptions (RLS user)

[Cron: a cada minuto]
Edge Function: send-push-notifications (service_role)
  ↓ Consulta events WHERE reminder_minutes IS NOT NULL
  ↓ Para cada evento: expandEvent() verifica se hoje é ocorrência válida
  ↓ Calcula fireTime = start_time - reminder_minutes
  ↓ Verifica janela de 5 minutos e ausência de log em notification_logs
  ↓ Busca push_subscriptions do usuário
  ↓ Envia via web-push para cada dispositivo
  ↓ Upsert em notification_logs (status: sent | failed)
  ↓ Remove subscriptions com erro 410/404 (revogadas)
```

### IA (Métricas)

```
Frontend (aiPanelView.js / assistantView.js)
  ↓ getWeeklySummary() / getStudySuggestion() / getScheduleAnalysis()
services/ai/aiService.js
  ↓ prepareWeeklySummary / prepareStudySuggestion / prepareScheduleAnalysis
  ↓ callGemini() → fetch para Edge Function ai-chat

Edge Function: ai-chat (anon key + auth.getUser())
  ↓ Valida JWT do usuário via Supabase Auth
  ↓ Monta prompt conforme tipo solicitado
  ↓ Chama Gemini API (gemini-2.5-flash por padrão)
  ↓ Retorna { text, ms } ao frontend
  [ai_metrics não é populada pela versão atual da Edge Function]

Frontend
  ↓ parseResponse(raw) — limpa markdown do retorno
Resposta: string em linguagem natural exibida no painel
```

---

## Convenções

O banco de dados segue convenções consistentes em todas as migrations:

| Convenção              | Padrão adotado                                                                                   |
|------------------------|--------------------------------------------------------------------------------------------------|
| **Chaves primárias**   | `UUID` gerado por `gen_random_uuid()` em todas as tabelas.                                       |
| **Timestamps**         | `TIMESTAMPTZ` com timezone incluído. Sempre `created_at` e `updated_at`, exceto `ai_metrics` (registros imutáveis, sem `updated_at`) e `notification_logs` (usa `sent_at` no lugar). |
| **Strings**            | `TEXT` sem limite de tamanho definido. Excepção: `semester` usa `SMALLINT`.                      |
| **Booleans**           | `BOOLEAN` com valor padrão explícito (`true` ou `false`).                                        |
| **JSONB**              | Não utilizado nas tabelas de domínio. `raw_user_meta_data` (JSONB) existe em `auth.users` mas é gerenciado exclusivamente pelo Supabase Auth. |
| **Atualização de timestamps** | Via trigger `update_updated_at()` em `BEFORE UPDATE`. Nenhuma tabela depende da aplicação para atualizar `updated_at`. |
| **RLS**                | Habilitado em todas as tabelas públicas via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.         |
| **Nomes de políticas** | Descritivos em inglês: `"Users can view own events"` ou padrão abreviado `tabela_operação` (ex: `push_subscriptions_select`). |
| **Cascade**            | `ON DELETE CASCADE` em todas as FKs que referenciam `auth.users(id)`.                           |
| **Idempotência**       | `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE FUNCTION` tornam as migrations reaplicáveis com segurança no SQL Editor. |
| **Defaults de cor**    | Azul padrão (`#3b82f6`) em `categories`, roxo (`#7c3aed`) em `academic_calendars`.              |
| **Ordenação de migrations** | Prefixo numérico sequencial de dois dígitos (`01_`, `02_`, ...) com dependências declaradas em comentários no cabeçalho de cada arquivo. |

---

## Auditoria de Consistência

### Ordem e dependências das migrations

As 8 migrations estão numeradas sequencialmente de `01` a `08`. A ordem de execução obrigatória é:

- `01_events.sql` — sem dependências, deve ser a primeira.
- `02_categories.sql`, `03_recurrence.sql`, `04_push_notifications.sql`, `05_profiles.sql`, `07_academic_calendar.sql` — dependem de `01_events.sql` (função `update_updated_at`).
- `06_storage.sql` — independente, atua em `storage.objects`.
- `08_ai_metrics.sql` — independente das demais migrations SQL.

### Resultados da auditoria

| Item                                           | Status                 | Observação                                                                                                                                    |
|------------------------------------------------|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| Migrations em ordem                            | Consistente            | Numeração sequencial, dependências declaradas e respeitadas.                                                                                  |
| Ausência de duplicações                        | Consistente            | `IF NOT EXISTS` e `CREATE OR REPLACE` garantem idempotência em todas as migrations.                                                           |
| Função `update_updated_at` reutilizada         | Consistente            | Todas as 6 tabelas com `updated_at` usam a mesma função centralizada definida em `01_events.sql`.                                             |
| Triggers consistentes                          | Consistente            | Todos os triggers de timestamp seguem `BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at()`.                                     |
| RLS em todas as tabelas públicas               | Consistente            | Todas as tabelas em `public` têm RLS habilitado com políticas cobrindo as operações relevantes.                                               |
| Compatibilidade frontend-banco                 | Consistente            | Todos os campos consultados e escritos pelos services (`eventService.js`, `categoryService.js`, `profileService.js`, `academicCalendarService.js`, `pushService.js`) correspondem exatamente às colunas existentes nas tabelas. |
| `profiles.created_at` nullable                 | Inconsistência menor   | Em `profiles`, `created_at` e `updated_at` são `TIMESTAMPTZ DEFAULT NOW()` sem `NOT NULL`, quebrando a convenção das demais tabelas. Não impacta funcionalidade pois `DEFAULT now()` garante preenchimento. |
| `03_recurrence.sql` redundante                 | Inconsistência menor   | As 3 colunas adicionadas por esta migration já estão declaradas em `01_events.sql`. A migration é segura (`IF NOT EXISTS`) mas desnecessária se executada após `01`. |
| `notification_logs.event_id` sem FK formal     | Resolvido (`09_notification_logs_integrity.sql`) | `event_id` agora tem FK para `events(id)` com `ON DELETE CASCADE`, eliminando o risco de logs órfãos ao excluir um evento. |
| `events.category` como TEXT sem FK            | Decisão arquitetural   | O campo armazena o nome da categoria por texto. Vínculo com `categories` é gerenciado pelo frontend via validação de negócio, não por integridade referencial no banco. |
| `ai_metrics` não populada pela Edge Function   | Inconsistência funcional | A tabela `ai_metrics` existe e está corretamente provisionada com RLS, mas a Edge Function `ai-chat` (única que chama a IA) não insere métricas nela. A tabela está disponível para uso futuro ou instrumentação opcional via `service_role`. |

---

## Estado Atual

| Métrica                    | Quantidade |
|----------------------------|------------|
| Tabelas                    | 8          |
| Migrations                 | 9          |
| Triggers                   | 7          |
| Funções SQL                | 3          |
| Políticas RLS (tabelas)    | 26         |
| Políticas RLS (storage)    | 4          |
| Índices                    | 10         |

**Avaliação geral da arquitetura:**

O banco de dados do MedAgenda é simples, coeso e bem alinhado com as capacidades do Supabase. A delegação de autenticação ao Supabase Auth, combinada com RLS granular, garante isolamento robusto dos dados sem complexidade adicional na camada de serviço. A função `update_updated_at()` centralizada e o padrão uniforme de triggers demonstram coerência arquitetural. As Edge Functions com `service_role` para operações privilegiadas (notificações, métricas) seguem o padrão recomendado pelo Supabase.

As inconsistências identificadas são de baixo impacto: `profiles` com timestamps nullable quebra a convenção mas não compromete a integridade; `03_recurrence.sql` é redundante mas inofensiva. A ausência de FK formal em `notification_logs.event_id` foi corrigida pela migration `09_notification_logs_integrity.sql` (Auditoria P1.3), que adiciona `ON DELETE CASCADE` após limpar logs órfãos pré-existentes. A única inconsistência funcional relevante é a tabela `ai_metrics` provisionada mas não utilizada pela implementação atual da Edge Function `ai-chat`, o que representa débito técnico a ser resolvido se o monitoramento de uso da IA for necessário.
