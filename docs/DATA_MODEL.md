# Modelo de Dados do MedAgenda

> Documentação oficial do modelo de dados do MedAgenda. Reflete exatamente a implementação atual das migrations em `sql/*.sql` e o uso real feito pelos Services (`*.js` na raiz e `services/`) e pelas Edge Functions (`supabase/functions/*/index.ts`). Não descreve schema planejado, não sugere alterações e não modifica migrations, tabelas, RLS ou qualquer SQL existente.

---

## Visão Geral

### Filosofia do banco

O MedAgenda não possui um banco de dados desenhado "de cima para baixo" com um diagrama entidade-relacionamento prévio: ele cresceu de forma incremental, uma migration numerada por etapa de produto (`01_events.sql` → `08_ai_metrics.sql`), cada uma resolvendo uma necessidade concreta da aplicação. Ainda assim, o resultado é coeso porque todas as migrations seguem os mesmos três princípios:

1. **Isolamento por usuário via Row Level Security (RLS).** O Postgres, não a camada de aplicação, é a fronteira de autorização. Toda tabela que guarda dado de usuário tem RLS habilitado com políticas baseadas em `auth.uid()` — a função do Supabase que extrai o UUID do usuário autenticado a partir do JWT da requisição. Mesmo que um Service esqueça de filtrar por `user_id`, o banco nunca devolve nem aceita linha de outro usuário.
2. **Autenticação delegada ao Supabase Auth.** Não existe tabela de usuários própria: `auth.users` é gerenciada inteiramente pelo GoTrue (Supabase Auth). Toda tabela de domínio que pertence a um usuário referencia `auth.users(id)` com `ON DELETE CASCADE`, garantindo que excluir a conta limpe automaticamente os dados associados.
3. **Privilégio elevado apenas via Edge Function com `service_role`.** Operações que precisam contornar RLS de propósito — gravar log de notificação enviada por um processo de sistema, excluir a conta de um usuário — são feitas por Edge Functions autenticadas com a chave `service_role`, nunca pelo cliente/frontend diretamente.

O schema é **relacional simples**: chaves primárias `UUID` geradas por `gen_random_uuid()`, timestamps `TIMESTAMPTZ`, poucas tabelas (8 no schema `public`), sem JSONB de domínio e sem ORM — todo acesso é feito via SDK `@supabase/supabase-js` (PostgREST) a partir dos Services do frontend, complementado por 3 Edge Functions para os casos que exigem segredo ou privilégio.

### Diagrama ASCII — todas as tabelas e relacionamentos

```
                              ┌───────────────────┐
                              │   auth.users       │   (schema auth — gerenciado
                              │   (Supabase Auth)   │    pelo Supabase, fora de public)
                              └─────────┬───────────┘
                                        │ id (PK)
        ┌───────────────┬──────────────┼──────────────┬────────────────┬──────────────┐
        │ 1:1            │ N:1          │ N:1          │ N:1            │ N:1          │ N:1
        ▼                ▼              ▼              ▼                ▼              ▼
 ┌─────────────┐  ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────────┐ ┌────────────┐
 │  profiles   │  │   events   │ │ categories │ │push_          │ │academic_        │ │ ai_metrics │
 │             │  │            │ │            │ │subscriptions  │ │calendars        │ │            │
 └─────────────┘  └─────┬──────┘ └────────────┘ └──────┬─────────┘ └────────┬────────┘ └────────────┘
                        │ (sem FK)                      │ (N:1 lógico,        │ N:1 (FK real)
                        │ vínculo lógico                │  sem FK formal)     ▼
                        │ events.category               │              ┌──────────────────┐
                        │  = categories.name (texto)     ▼              │ academic_events  │
                        │                          ┌──────────────────┐ └──────────────────┘
                        └─────────────────────────▶│ notification_logs│
                        event_id (FK, ON DELETE     │                  │
                        CASCADE)                    └──────────────────┘

                                    storage.objects (schema storage — Supabase Storage)
                                    └── bucket: avatars  (sem FK relacional; RLS por pasta {user_id}/...)
```

**Legenda:**
- `1:1` — relação de um-para-um com chave estrangeira formal.
- `N:1` — relação de muitos-para-um com chave estrangeira formal (`REFERENCES ... ON DELETE CASCADE`).
- `N:1 lógico` / `sem FK formal` — relação existe conceitualmente (mesmo nome, mesmo domínio de dado) mas não é imposta por constraint de banco.

Todas as tabelas do schema `public`, exceto `academic_events`, têm uma coluna `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE` própria. `academic_events` é a única exceção: sua relação com o usuário é indireta, via `calendar_id → academic_calendars.user_id`.

---

# Tabela `events`

**Finalidade:** tabela fundacional e central do sistema. Armazena todos os compromissos (aulas, plantões, provas, estudos, eventos pessoais) de todos os usuários, com suporte nativo a recorrência, lembretes locais/push e categorização textual. Definida em `sql/01_events.sql`; suas colunas de recorrência são reforçadas (de forma idempotente) por `sql/03_recurrence.sql`.

### Colunas

| Coluna                      | Tipo          | Obrigatório | Padrão                | Observações |
|------------------------------|---------------|:-----------:|------------------------|--------------|
| `id`                         | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | Identificador do compromisso. |
| `user_id`                    | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. Dono do evento; base de toda política de RLS. |
| `title`                      | `TEXT`        | Sim         | —                      | Título do compromisso. |
| `event_date`                 | `DATE`        | Sim         | —                      | Data-base do evento (para eventos recorrentes, a data da primeira ocorrência). |
| `start_time`                 | `TIME`        | Não         | —                      | Horário de início. |
| `duration_minutes`           | `INTEGER`     | Não         | —                      | Duração em minutos. |
| `category`                   | `TEXT`        | Não         | —                      | Nome textual da categoria — **não é FK** para `categories`. |
| `color`                      | `TEXT`        | Não         | —                      | Cor hexadecimal de destaque, independente da cor da categoria. |
| `location`                   | `TEXT`        | Não         | —                      | Local do compromisso. |
| `description`                | `TEXT`        | Não         | —                      | Detalhes adicionais. |
| `reminder_minutes`           | `INTEGER`     | Não         | —                      | Antecedência do lembrete (local e push) em minutos. |
| `recurrence_type`            | `TEXT`        | Sim         | `'none'`               | Ver constraint `events_recurrence_type_check`. |
| `recurrence_interval`        | `INTEGER`     | Não         | —                      | Intervalo numérico usado por recorrências `custom`/periódicas. |
| `recurrence_until`           | `DATE`        | Não         | —                      | Data limite da recorrência; `NULL` = recorrência sem fim definido. |
| `recurrence_days_of_week`    | `TEXT`        | Não         | —                      | Dias da semana como string (ex.: `"1,3,5"`), usada em `recurrence_type = 'custom'`. |
| `created_at`                 | `TIMESTAMPTZ` | Sim         | `now()`                 | Preenchido pelo banco na criação. |
| `updated_at`                 | `TIMESTAMPTZ` | Sim         | `now()`                 | Mantido pela trigger `events_updated_at`. |

### Constraints

- `events_recurrence_type_check` — `CHECK (recurrence_type IN ('none','daily','weekdays','weekly','biweekly','monthly','yearly','custom'))`.

### Índices

- `events_user_id_idx` — B-tree em `(user_id)`.
- `events_user_date_idx` — B-tree composto em `(user_id, event_date)`.

### Triggers

- `events_updated_at` — `BEFORE UPDATE FOR EACH ROW`, executa `update_updated_at()`.

### Row Level Security

RLS habilitado. Quatro políticas, todas usando `user_id = auth.uid()`:

| Operação | Condição |
|---|---|
| SELECT | `USING (user_id = auth.uid())` |
| INSERT | `WITH CHECK (user_id = auth.uid())` |
| UPDATE | `USING (user_id = auth.uid())` |
| DELETE | `USING (user_id = auth.uid())` |

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`) — relação física, N:1.
- `category` (texto) ↔ `categories.name` — relação **lógica**, sem FK. A exclusão de uma categoria no banco não afeta os eventos que a referenciam por nome; a integridade é garantida pelo frontend (`categoryService.deleteCategory` impede excluir categoria em uso).
- Referenciada por `notification_logs.event_id` (FK, `ON DELETE CASCADE`).

### Uso pelo sistema

`eventService.js` é o único ponto de acesso à tabela a partir do frontend:

- `createEvent(fields)` — injeta `user_id` da sessão e insere.
- `getEvents()` — lista todos os eventos-base do usuário, ordenados por `event_date`, `start_time`.
- `updateEvent(id, fields)` / `deleteEvent(id)` — sempre filtram por `id` **e** `user_id` (defesa em profundidade além da RLS).
- `getEventsByRange(start, end)` — dispara duas queries em paralelo (`Promise.all`): eventos cuja `event_date` cai no intervalo, e eventos recorrentes cuja data-base é anterior ao intervalo mas ainda podem gerar ocorrências dentro dele (`recurrence_until` nulo ou `>= start`). Os resultados são deduplicados por `id` no cliente.

A expansão de recorrência (transformar uma linha "base" em múltiplas ocorrências concretas) **não acontece no banco** — é feita inteiramente no cliente por `recurrence.js` (frontend) e, de forma equivalente, por `supabase/functions/_shared/recurrence-core.js` (Edge Function `send-push-notifications`). A Edge Function `send-push-notifications` também lê `events` (com `service_role`, ignorando RLS) para decidir quando disparar notificações push. `categoryService.deleteCategory()` faz uma leitura de contagem em `events` (filtrando por `category = nome`) para impedir a exclusão de categorias em uso.

---

# Tabela `categories`

**Finalidade:** categorias personalizadas por usuário, usadas para classificação visual e filtragem de eventos no calendário. Definida em `sql/02_categories.sql`.

### Colunas

| Coluna       | Tipo          | Obrigatório | Padrão               | Observações |
|--------------|---------------|:-----------:|------------------------|--------------|
| `id`         | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `user_id`    | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `name`       | `TEXT`        | Sim         | —                      | Nome da categoria. Único por usuário (case-insensitive). |
| `color`      | `TEXT`        | Sim         | `'#3b82f6'`             | Cor hexadecimal padrão (azul). |
| `icon`       | `TEXT`        | Não         | —                      | Existe na estrutura, mas **não é usado** pelo frontend atual. |
| `created_at` | `TIMESTAMPTZ` | Sim         | `now()`                 | |
| `updated_at` | `TIMESTAMPTZ` | Sim         | `now()`                 | Mantido pela trigger `categories_updated_at`. |

### Índices

- `categories_user_name_idx` — **UNIQUE** em `(user_id, lower(name))` — impede categorias duplicadas por usuário, ignorando maiúsculas/minúsculas.
- `categories_user_id_idx` — B-tree em `(user_id)`.

### Triggers

- `categories_updated_at` — `BEFORE UPDATE`, chama `update_updated_at()`.

### Row Level Security

RLS habilitado. Quatro políticas com `user_id = auth.uid()` (SELECT, INSERT, UPDATE, DELETE), mesmo padrão de `events`.

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`).
- `name` ↔ `events.category` — relação lógica (ver seção `events`).

### Uso pelo sistema

`categoryService.js`:

- `getCategories()` — lista ordenada por `name`.
- `createCategory(name, color)` / `updateCategory(id, name, color)` — capturam a violação do índice único (`error.code === '23505'`) e a traduzem para `"Já existe uma categoria com esse nome."` em vez de propagar o erro cru do Postgres.
- `deleteCategory(id)` — antes de excluir, conta quantos `events.category` referenciam o nome da categoria; se houver uso, a exclusão é **abortada no cliente** (nenhum `DELETE` é enviado ao banco) e um erro de negócio é lançado.
- `ensureDefaultCategories()` — na primeira visita de um usuário sem categorias, insere em lote 8 categorias padrão (Aula, Plantão, Ambulatório, Laboratório, Estudo, Prova, Congresso, Pessoal), cada uma com cor pré-definida no próprio Service.

---

# Tabela `profiles`

**Finalidade:** perfil estendido do usuário, com dados acadêmicos (universidade, curso, semestre) e preferências de configuração (fuso horário, notificações, tema). Criada automaticamente no momento do cadastro. Definida em `sql/05_profiles.sql`.

### Colunas

| Coluna                   | Tipo          | Obrigatório | Padrão                    | Observações |
|---------------------------|---------------|:-----------:|-----------------------------|--------------|
| `id`                      | `UUID`        | Sim (PK)    | —                           | PK **e** FK → `auth.users(id)` `ON DELETE CASCADE`. Não tem `gen_random_uuid()` porque reaproveita o UUID do usuário. |
| `full_name`               | `TEXT`        | Não         | —                           | |
| `avatar_url`              | `TEXT`        | Não         | —                           | URL pública do arquivo no bucket `avatars`. |
| `university`              | `TEXT`        | Não         | —                           | |
| `course`                  | `TEXT`        | Não         | —                           | |
| `semester`                | `SMALLINT`    | Não         | —                           | `CHECK (semester BETWEEN 1 AND 12)`. |
| `timezone`                | `TEXT`        | Não         | `'America/Sao_Paulo'`        | |
| `notification_enabled`    | `BOOLEAN`     | Não         | `TRUE`                       | |
| `theme`                   | `TEXT`        | Não         | `'light'`                    | `CHECK (theme IN ('light','dark','system'))`. |
| `created_at`               | `TIMESTAMPTZ` | **Não** (sem `NOT NULL`) | `NOW()`      | Ver observação de inconsistência abaixo. |
| `updated_at`               | `TIMESTAMPTZ` | **Não** (sem `NOT NULL`) | `NOW()`      | Mantido pela trigger `profiles_updated_at`. |

### Constraints

- CHECK em `semester` — intervalo `1..12`.
- CHECK em `theme` — enum `light`/`dark`/`system`.

### Triggers

- `on_auth_user_created` — trigger especial em `auth.users` (`AFTER INSERT FOR EACH ROW`), chama `handle_new_user()`, que insere automaticamente a linha correspondente em `profiles` com `full_name` extraído de `raw_user_meta_data->>'full_name'`. Usa `ON CONFLICT (id) DO NOTHING`, tornando-a idempotente.
- `profiles_updated_at` — `BEFORE UPDATE`, chama `update_updated_at()`.

### Row Level Security

RLS habilitado. Quatro políticas usando `auth.uid() = id` (a PK, não um `user_id` separado):

| Operação | Condição |
|---|---|
| SELECT | `USING (auth.uid() = id)` |
| INSERT | `WITH CHECK (auth.uid() = id)` |
| UPDATE | `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` |
| DELETE | `USING (auth.uid() = id)` |

### Relacionamentos

- `id` → `auth.users(id)` (`ON DELETE CASCADE`) — relação 1:1, única tabela onde a FK **é** a própria chave primária.

### Uso pelo sistema

`profileService.js`:

- `getProfile()` — busca por `id = uid`, ignora explicitamente o erro `PGRST116` (nenhuma linha encontrada), pois o perfil pode ainda não existir (corrida entre signup e trigger, por exemplo).
- `upsertProfile(fields)` — filtra a entrada contra uma allowlist explícita (`full_name`, `avatar_url`, `university`, `course`, `semester`, `timezone`, `notification_enabled`, `theme`); campos fora da lista são silenciosamente ignorados antes mesmo de chegar ao banco.

`avatarService.js` não escreve na tabela diretamente — após o upload no Storage, é a View (`accountView.js`) quem chama `upsertProfile({ avatar_url })` para persistir a URL.

**Observação de inconsistência (documentada, não corrigida):** `created_at` e `updated_at` são `TIMESTAMPTZ DEFAULT NOW()` **sem** `NOT NULL`, diferente de todas as demais tabelas do schema, onde ambos os campos são `NOT NULL DEFAULT now()`. Na prática, o `DEFAULT` garante que o campo seja sempre preenchido em INSERTs normais, então não há impacto funcional observado — apenas quebra de convenção.

---

# Tabela `push_subscriptions`

**Finalidade:** armazena as assinaturas Web Push de cada dispositivo de cada usuário, permitindo múltiplos dispositivos simultâneos (celular, desktop, notebook) recebendo notificações mesmo com o app fechado. Definida em `sql/04_push_notifications.sql`.

### Colunas

| Coluna       | Tipo          | Obrigatório | Padrão               | Observações |
|--------------|---------------|:-----------:|------------------------|--------------|
| `id`         | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `user_id`    | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `endpoint`   | `TEXT`        | Sim         | —                      | URL única do endpoint de push do navegador/dispositivo. |
| `p256dh`     | `TEXT`        | Sim         | —                      | Chave pública de criptografia (protocolo Web Push). |
| `auth`       | `TEXT`        | Sim         | —                      | Segredo de autenticação (protocolo Web Push). |
| `user_agent` | `TEXT`        | Não         | —                      | Usado apenas para fins informativos/diagnóstico. |
| `created_at` | `TIMESTAMPTZ` | Sim         | `now()`                 | |
| `updated_at` | `TIMESTAMPTZ` | Sim         | `now()`                 | Mantido pela trigger `push_subscriptions_updated_at`. |

### Índices

- `push_subscriptions_user_endpoint` — **UNIQUE** em `(user_id, endpoint)` — garante uma única assinatura por combinação usuário+dispositivo (endpoint).

### Triggers

- `push_subscriptions_updated_at` — `BEFORE UPDATE`, chama `update_updated_at()`.

### Row Level Security

RLS habilitado. Quatro políticas (`push_subscriptions_select/insert/update/delete`) usando `auth.uid() = user_id`.

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`).
- Consumida (leitura) pela Edge Function `send-push-notifications` para descobrir para quais dispositivos enviar; não há FK entre `push_subscriptions` e `events` ou `notification_logs`.

### Uso pelo sistema

`pushService.js`:

- `subscribeToPush()` — obtém permissão do navegador, cria/recupera uma `PushSubscription`, e grava via `upsert(..., { onConflict: 'user_id,endpoint' })`.
- `unsubscribeFromPush()` — remove a linha por `user_id` + `endpoint` e cancela a assinatura no navegador.
- `syncPushSubscription()` — reconcilia a assinatura local com o banco após login; se o navegador revogou a assinatura externamente, apenas desativa a preferência local (`localStorage`), sem tocar o banco.

A Edge Function `send-push-notifications` (com `service_role`, contornando RLS) lê `push_subscriptions` por `user_id` para cada evento com lembrete devido, envia via `web-push`, e **remove automaticamente** as assinaturas que retornam HTTP `410` (Gone) ou `404` (Not Found) — sinal de que o navegador revogou a assinatura.

---

# Tabela `notification_logs`

**Finalidade:** registra cada tentativa de envio de notificação push para (a) prevenir duplicidade de envio quando o mesmo evento/ocorrência é reavaliado a cada execução do cron, e (b) fornecer trilha de auditoria/diagnóstico de envios. Definida em `sql/04_push_notifications.sql`, mantida deliberadamente separada de `events` para lidar de forma simples com eventos recorrentes (uma linha por ocorrência, identificada por data).

### Colunas

| Coluna       | Tipo          | Obrigatório | Padrão               | Observações |
|--------------|---------------|:-----------:|------------------------|--------------|
| `id`         | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `user_id`    | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `event_id`   | `UUID`        | Sim         | —                      | FK → `events.id` `ON DELETE CASCADE` — ver Relacionamentos. |
| `event_date` | `DATE`        | Sim         | —                      | Data da ocorrência específica notificada (não necessariamente `events.event_date`, no caso de recorrência). |
| `status`     | `TEXT`        | Sim         | `'sent'`                | Valores em uso: `sent`, `failed`. Não há CHECK constraint impondo esse enum no banco. |
| `error`      | `TEXT`        | Não         | —                      | Mensagem de erro quando `status = 'failed'`. |
| `sent_at`    | `TIMESTAMPTZ` | Sim         | `now()`                 | Não há `updated_at` — registros são tratados como imutáveis (o `upsert` reescreve a linha inteira, mas não há trigger de atualização de timestamp). |

### Índices

- `notification_logs_dedup` — **UNIQUE** em `(user_id, event_id, event_date)` — é a garantia central de idempotência: um `upsert` para a mesma combinação atualiza a linha existente em vez de duplicar.
- `notification_logs_sent_at_idx` — B-tree em `(sent_at)` — usado por queries de auditoria temporal e pela função de limpeza.

### Triggers

Nenhuma. A tabela não tem `updated_at`, portanto não usa `update_updated_at()`.

### Row Level Security

RLS habilitado, porém com apenas **uma** política:

| Operação | Condição |
|---|---|
| SELECT | `USING (auth.uid() = user_id)` |
| INSERT / UPDATE / DELETE | Nenhuma política para usuários comuns — apenas a Edge Function `send-push-notifications`, autenticada com `service_role` (que ignora RLS), grava nesta tabela. |

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`) — relação física.
- `event_id` → `events(id)` (`ON DELETE CASCADE`, adicionada em `09_notification_logs_integrity.sql`) — relação física. `event_id` sempre referencia a linha-base do evento em `events`; múltiplas linhas de `notification_logs` (uma por *ocorrência*, evento × data) apontam para o mesmo `event_id`, então a FK não exige modelagem de ocorrências materializadas. Ao excluir um evento, `ON DELETE CASCADE` remove junto todo o seu histórico de notificações, evitando logs órfãos.

### Uso pelo sistema

Nenhum Service do frontend lê ou escreve nesta tabela — a única gravação ocorre dentro da Edge Function `send-push-notifications`:

1. Antes de enviar uma notificação para uma ocorrência de evento, consulta `notification_logs` por `(user_id, event_id, event_date)`; se já existir, pula o envio (`skipped++`).
2. Após tentar enviar (com sucesso ou falha) para todas as assinaturas do usuário, faz `upsert` com `onConflict: 'user_id,event_id,event_date'`, gravando `status: 'sent'` (se ao menos uma assinatura recebeu) ou `status: 'failed'` (se todas falharam), com `error` preenchido no segundo caso.

A função utilitária `cleanup_old_notification_logs()` (definida na mesma migration) apaga registros com `sent_at` anterior a 90 dias, mas **não é chamada automaticamente** por nenhum trigger ou cron configurado no código — precisa ser agendada manualmente (Supabase Scheduler ou `pg_cron`), conforme o próprio comentário da migration.

Excluir um evento (`eventService.deleteEvent`) não passa mais por essa função de limpeza por idade: a partir de `09_notification_logs_integrity.sql`, a FK `event_id → events.id` com `ON DELETE CASCADE` remove imediatamente as linhas de `notification_logs` daquele evento, independentemente de `sent_at`.

---

# Tabela `academic_calendars`

**Finalidade:** representa um calendário acadêmico completo (ex.: "Medicina 2026", "Internato", "Liga de Cardiologia") pertencente a um usuário. Um usuário pode ter múltiplos calendários simultâneos. Definida em `sql/07_academic_calendar.sql`.

### Colunas

| Coluna          | Tipo          | Obrigatório | Padrão               | Observações |
|------------------|---------------|:-----------:|------------------------|--------------|
| `id`             | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `user_id`        | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `name`           | `TEXT`        | Sim         | —                      | Nome do calendário. |
| `university`     | `TEXT`        | Não         | —                      | |
| `academic_year`  | `TEXT`        | Não         | —                      | Ex.: `"2026"`. |
| `color`          | `TEXT`        | Sim         | `'#7c3aed'`              | Cor padrão roxa; distinta do azul padrão de `categories`. |
| `created_at`     | `TIMESTAMPTZ` | Sim         | `now()`                 | |
| `updated_at`     | `TIMESTAMPTZ` | Sim         | `now()`                 | Mantido pela trigger `academic_calendars_updated_at`. |

### Índices

- `academic_calendars_user_id_idx` — B-tree em `(user_id)`.

### Triggers

- `academic_calendars_updated_at` — `BEFORE UPDATE`, chama `update_updated_at()`.

### Row Level Security

RLS habilitado. Quatro políticas com `user_id = auth.uid()`, mesmo padrão de `events`/`categories`.

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`).
- Pai de `academic_events` via `academic_events.calendar_id → academic_calendars.id` (`ON DELETE CASCADE`) — excluir um calendário apaga automaticamente todos os seus eventos acadêmicos.

### Uso pelo sistema

`academicCalendarService.js`:

- `getCalendars()` — lista ordenada por `created_at`.
- `createCalendar({ name, university, academic_year, color })` — injeta `user_id`; `color` tem default `#7c3aed` também no próprio Service (redundante com o `DEFAULT` do banco, mas explícito).
- `updateCalendar(id, fields)` / `deleteCalendar(id)` — filtram por `id` **e** `user_id`. A exclusão apaga em cascata os `academic_events` filhos via FK, sem necessidade de lógica adicional no Service.

---

# Tabela `academic_events`

**Finalidade:** eventos dentro de um calendário acadêmico — provas, semanas de rodízio, férias, recessos — com suporte a intervalos de múltiplos dias. Definida em `sql/07_academic_calendar.sql`.

### Colunas

| Coluna         | Tipo          | Obrigatório | Padrão               | Observações |
|-----------------|---------------|:-----------:|------------------------|--------------|
| `id`            | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `calendar_id`   | `UUID`        | Sim         | —                      | FK → `academic_calendars(id)` `ON DELETE CASCADE`. |
| `title`         | `TEXT`        | Sim         | —                      | |
| `description`   | `TEXT`        | Não         | —                      | |
| `start_date`    | `DATE`        | Sim         | —                      | |
| `end_date`      | `DATE`        | Não         | —                      | `NULL` = evento de um único dia. |
| `all_day`       | `BOOLEAN`     | Sim         | `true`                  | |
| `color`         | `TEXT`        | Não         | —                      | Sobrescreve, quando definida, a cor herdada do calendário pai. |
| `category`      | `TEXT`        | Não         | —                      | Categoria textual livre (ex.: "Prova", "Férias"), independente de `categories`. |
| `location`      | `TEXT`        | Não         | —                      | |
| `created_at`    | `TIMESTAMPTZ` | Sim         | `now()`                 | |
| `updated_at`    | `TIMESTAMPTZ` | Sim         | `now()`                 | Mantido pela trigger `academic_events_updated_at`. |

### Índices

- `academic_events_calendar_id_idx` — B-tree em `(calendar_id)` — busca de eventos de um calendário.
- `academic_events_start_date_idx` — B-tree em `(start_date)` — filtro por data de início.

### Triggers

- `academic_events_updated_at` — `BEFORE UPDATE`, chama `update_updated_at()`.

### Row Level Security

RLS habilitado, mas **é a única tabela do schema sem coluna `user_id` própria**. Autorização via subquery `EXISTS`:

```sql
USING (
  EXISTS (
    SELECT 1 FROM academic_calendars
    WHERE id = calendar_id AND user_id = auth.uid()
  )
)
```

A mesma condição é usada para SELECT, INSERT (`WITH CHECK`), UPDATE e DELETE — o usuário só acessa eventos de calendários que ele mesmo possui.

### Relacionamentos

- `calendar_id` → `academic_calendars(id)` (`ON DELETE CASCADE`) — único vínculo formal da tabela; não há FK direta para `auth.users`.

### Uso pelo sistema

`academicCalendarService.js`:

- `getAcademicEvents(calendarId)` — lista por `calendar_id`, ordenada por `start_date`.
- `getAcademicEventsByRange(calendarIds, start, end)` — `SELECT ... WHERE calendar_id IN (...)`, com `join` inline (`academic_calendars(id, name, color)`) para trazer metadados do calendário pai junto de cada evento; um filtro adicional é aplicado **no cliente** para manter apenas eventos cujo intervalo `[start_date, end_date]` sobrepõe `[start, end]`.
- `createAcademicEvent` / `updateAcademicEvent` / `deleteAcademicEvent` — não injetam nem checam `user_id` no cliente (diferente de `eventService`/`categoryService`); a autorização é delegada inteiramente à RLS via `calendar_id`.
- `bulkInsertAcademicEvents(events)` — inserção em lote, usada pela importação de arquivos `.ics` (`academicCalendarICSView.js`).
- `expandAcademicEvents(events, start, end)` — função **puramente local**, não acessa o banco; converte eventos multi-dia em uma entrada por data dentro do intervalo pedido, para renderização no calendário.

---

# Tabela `ai_metrics`

**Finalidade:** registrar métricas de uso das funcionalidades de IA (tipo de chamada, duração, sucesso/erro) **sem armazenar o conteúdo das conversas ou prompts** — por design, para preservar privacidade dos dados do usuário. Definida em `sql/08_ai_metrics.sql`.

### Colunas

| Coluna         | Tipo          | Obrigatório | Padrão               | Observações |
|-----------------|---------------|:-----------:|------------------------|--------------|
| `id`            | `UUID`        | Sim (PK)    | `gen_random_uuid()`    | |
| `user_id`       | `UUID`        | Sim         | —                      | FK → `auth.users(id)` `ON DELETE CASCADE`. |
| `prompt_type`   | `TEXT`        | Sim         | —                      | Tipo de operação de IA solicitada (ex.: `weekly_summary`, `study_suggestion`, `schedule_analysis`, conforme os tipos aceitos pela Edge Function `ai-chat`). |
| `duration_ms`   | `INTEGER`     | Não         | —                      | Duração da chamada em milissegundos. |
| `success`       | `BOOLEAN`     | Sim         | `true`                  | |
| `error_code`    | `TEXT`        | Não         | —                      | |
| `created_at`    | `TIMESTAMPTZ` | Sim         | `now()`                 | Não há `updated_at` — registros de métrica são imutáveis por natureza. |

### Índices

Nenhum índice além do implícito da chave primária (`id`).

### Triggers

Nenhuma — tabela sem `updated_at`.

### Row Level Security

RLS habilitado, com apenas **uma** política:

| Operação | Condição |
|---|---|
| SELECT | `USING (auth.uid() = user_id)` |
| INSERT / UPDATE / DELETE | Nenhuma política — o comentário na migration indica que a inserção é feita "via Service Role na Edge Function", mas ver observação abaixo. |

### Relacionamentos

- `user_id` → `auth.users(id)` (`ON DELETE CASCADE`).

### Uso pelo sistema

**Nenhum.** A tabela está corretamente provisionada (RLS habilitado, FK válida, comentário de intenção na migration), mas nenhuma Edge Function nem Service do frontend grava nela atualmente. A Edge Function `ai-chat` (`supabase/functions/ai-chat/index.ts`), única que faz chamadas de IA na aplicação, processa a requisição e retorna `{ text, ms }` ao cliente **sem inserir nenhuma linha em `ai_metrics`**. A tabela existe pronta para uso futuro ou instrumentação opcional — ver seção **Auditoria**.

---

# Relacionamentos

### Cadeia solicitada (ordem de apresentação)

O diagrama abaixo segue a ordem de tabelas conforme solicitado para esta documentação. **Atenção:** essa cadeia é uma sequência de apresentação, não uma cadeia de dependência física — as setas indicam onde existe uma FK real e onde existe apenas um vínculo lógico (mesmo `user_id`, sem que uma tabela seja "pai" física da próxima).

```
profiles
  │  (nenhuma FK para events — ambas apenas compartilham auth.users.id)
  ▼  vínculo lógico: mesmo usuário (profiles.id = events.user_id)
events
  │  (nenhuma FK para categories — events.category é TEXT livre)
  ▼  vínculo lógico: events.category = categories.name (texto)
categories
  │  (nenhuma FK para academic_calendars — tabelas independentes)
  ▼  vínculo lógico: mesmo usuário (categories.user_id = academic_calendars.user_id)
academic_calendars
  │  FK REAL: academic_events.calendar_id → academic_calendars.id  (ON DELETE CASCADE)
  ▼
academic_events
  │  (nenhuma FK entre academic_events e notification_logs — tabelas de domínios distintos)
  ▼  vínculo lógico: mesmo usuário (indireto, via academic_calendars.user_id)
notification_logs
  │  FK REAL: notification_logs.event_id → events.id  (ON DELETE CASCADE)
  │  (nenhuma FK para push_subscriptions — ambas apenas compartilham user_id)
  ▼  vínculo lógico: mesmo usuário (notification_logs.user_id = push_subscriptions.user_id)
push_subscriptions
```

### Diagrama real de chaves estrangeiras

Para não confundir vínculo físico com vínculo lógico, o diagrama abaixo mostra **apenas** as FKs efetivamente declaradas no schema:

```
auth.users (id)
   ├──(FK, CASCADE, 1:1)──► profiles.id
   ├──(FK, CASCADE, N:1)──► events.user_id
   ├──(FK, CASCADE, N:1)──► categories.user_id
   ├──(FK, CASCADE, N:1)──► push_subscriptions.user_id
   ├──(FK, CASCADE, N:1)──► notification_logs.user_id
   ├──(FK, CASCADE, N:1)──► academic_calendars.user_id
   └──(FK, CASCADE, N:1)──► ai_metrics.user_id

academic_calendars (id)
   └──(FK, CASCADE, N:1)──► academic_events.calendar_id

events (id)
   └──(FK, CASCADE, N:1)──► notification_logs.event_id
```

### Relacionamentos lógicos (sem FK física)

| Origem | Destino | Natureza | Por que não há FK formal |
|---|---|---|---|
| `events.category` (TEXT) | `categories.name` (TEXT) | N:1 lógico | O vínculo é por nome, não por `id`. Permite que um evento continue existindo com uma categoria "solta" (texto) mesmo que o nome não corresponda mais a nenhuma categoria cadastrada. A integridade de negócio (impedir excluir categoria em uso) é responsabilidade do frontend (`categoryService.deleteCategory`), não do banco. |
| `academic_events` (via `calendar_id`) | `auth.users` | N:1 indireto | `academic_events` não tem `user_id` próprio; o dono é sempre resolvido através do calendário pai. |
| Todas as tabelas com `user_id` | `auth.users.id` | Implícito no RLS | Ainda que a FK exista fisicamente, o *isolamento* entre usuários é garantido pela política de RLS (`auth.uid()`), não apenas pela constraint — a FK garante apenas integridade referencial (não apagar `user_id` órfão), não autorização. |

---

# Índices

| Índice                               | Tabela                | Colunas                             | Tipo    | Motivo de existir |
|----------------------------------------|------------------------|---------------------------------------|---------|---------------------|
| `events_user_id_idx`                   | `events`               | `(user_id)`                           | B-tree  | Acelera qualquer query filtrada só por usuário (ex.: contagens, checagens de existência). |
| `events_user_date_idx`                 | `events`               | `(user_id, event_date)`               | B-tree composto | Otimiza a consulta mais frequente do sistema: listar/filtrar eventos de um usuário dentro de um intervalo de datas (`getEventsByRange`). |
| `categories_user_name_idx`             | `categories`           | `(user_id, lower(name))`              | UNIQUE  | Impede duas categorias com o mesmo nome (case-insensitive) para o mesmo usuário — é a constraint de negócio "nome único por usuário", implementada como índice. |
| `categories_user_id_idx`               | `categories`           | `(user_id)`                           | B-tree  | Acelera a listagem de categorias por usuário (`getCategories`). |
| `push_subscriptions_user_endpoint`     | `push_subscriptions`   | `(user_id, endpoint)`                 | UNIQUE  | Garante uma única assinatura por dispositivo (endpoint) por usuário; é a chave usada pelo `upsert` de `_saveSubscription`. |
| `notification_logs_dedup`              | `notification_logs`    | `(user_id, event_id, event_date)`     | UNIQUE  | Garantia de idempotência do envio de notificação — impede duas linhas para a mesma ocorrência de evento; é a chave do `upsert` na Edge Function. |
| `notification_logs_sent_at_idx`        | `notification_logs`    | `(sent_at)`                           | B-tree  | Acelera consultas por intervalo de tempo, usadas por auditoria e pela função de limpeza (`cleanup_old_notification_logs`). |
| `academic_calendars_user_id_idx`       | `academic_calendars`   | `(user_id)`                           | B-tree  | Acelera a listagem de calendários de um usuário (`getCalendars`). |
| `academic_events_calendar_id_idx`      | `academic_events`      | `(calendar_id)`                       | B-tree  | Acelera a busca de eventos de um calendário específico (`getAcademicEvents`). |
| `academic_events_start_date_idx`       | `academic_events`      | `(start_date)`                        | B-tree  | Acelera filtros por data (`getAcademicEventsByRange`, ordenação). |

Além destes 10 índices explícitos, o Postgres cria automaticamente um índice único para cada chave primária (`id` em todas as tabelas, ou `id` em `profiles` que também é FK), não listado nas migrations por ser implícito ao `PRIMARY KEY`.

`ai_metrics` é a única tabela do schema **sem nenhum índice explícito** além da chave primária — coerente com seu uso atual (nenhuma escrita, nenhuma consulta em produção).

---

# Triggers

### `update_updated_at()`

Função central, definida uma única vez em `sql/01_events.sql` e reutilizada por todas as tabelas que possuem o campo `updated_at`:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Funcionamento:** é uma função de trigger `BEFORE UPDATE FOR EACH ROW`. Antes de qualquer `UPDATE` ser efetivado, ela substitui o valor de `NEW.updated_at` (a nova linha, ainda não gravada) por `now()`, garantindo que o timestamp reflita o momento exato da escrita no banco — independentemente de o cliente ter enviado (ou esquecido de enviar) um valor para `updated_at`. Como é `BEFORE UPDATE`, a substituição ocorre antes da gravação física, sem custo de um segundo `UPDATE`.

**Tabelas que utilizam esta trigger (6):**

| Trigger                          | Tabela               |
|-----------------------------------|------------------------|
| `events_updated_at`               | `events`               |
| `categories_updated_at`           | `categories`           |
| `push_subscriptions_updated_at`   | `push_subscriptions`   |
| `profiles_updated_at`             | `profiles`             |
| `academic_calendars_updated_at`   | `academic_calendars`   |
| `academic_events_updated_at`      | `academic_events`      |

`notification_logs` e `ai_metrics` **não** têm essa trigger, pois nenhuma das duas possui coluna `updated_at` — seus registros são tratados como eventos imutáveis (log/métrica), não como entidades editáveis.

### `on_auth_user_created` (trigger em `auth.users`, não em uma tabela `public`)

Definida em `sql/05_profiles.sql`, é `AFTER INSERT FOR EACH ROW ON auth.users`, e chama `handle_new_user()`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

**Funcionamento:** sempre que um novo usuário é criado em `auth.users` (via signup do Supabase Auth), esta trigger dispara automaticamente e insere a linha correspondente em `public.profiles`, com `id` igual ao `id` do novo usuário e `full_name` extraído do JSON de metadados enviado no cadastro. É `SECURITY DEFINER` (executa com os privilégios de quem definiu a função, não de quem disparou o trigger) porque o trigger está registrado em `auth.users` — schema gerenciado pelo Supabase — mas precisa de permissão de escrita em `public.profiles`. `ON CONFLICT (id) DO NOTHING` torna a operação segura mesmo em reexecuções.

---

# Row Level Security

O MedAgenda adota **isolamento completo por usuário** via RLS: toda tabela de domínio no schema `public` tem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, e a autorização primária vive no banco — não no Service, que apenas replica o filtro por `user_id` como defesa em profundidade.

### Tabelas com RLS habilitado

Todas as 8 tabelas do schema `public` documentadas neste arquivo: `events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`. Adicionalmente, `storage.objects` (bucket `avatars`) tem políticas de RLS de Storage, fora do escopo de tabela de domínio, mas parte do mesmo modelo de isolamento.

### Detalhamento SELECT / INSERT / UPDATE / DELETE

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `events` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `categories` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `profiles` | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` (USING + WITH CHECK) | `auth.uid() = id` |
| `push_subscriptions` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `notification_logs` | `auth.uid() = user_id` | — (apenas `service_role`) | — (apenas `service_role`) | — (apenas `service_role`) |
| `academic_calendars` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `academic_events` | `EXISTS (... academic_calendars.user_id = auth.uid())` | idem (WITH CHECK) | idem | idem |
| `ai_metrics` | `auth.uid() = user_id` | — (apenas `service_role`) | — (apenas `service_role`) | — (apenas `service_role`) |

### Como funciona o isolamento por usuário

`auth.uid()` é uma função fornecida pelo Supabase que lê o JWT anexado à requisição (via PostgREST) e retorna o UUID do usuário autenticado — ou `NULL` se não houver sessão válida. Toda política de RLS neste banco compara uma coluna da linha (`user_id`, `id`, ou, indiretamente, `calendar_id` → `user_id`) com `auth.uid()`:

- **Sem RLS**, uma query como `SELECT * FROM events` retornaria as linhas de todos os usuários; a aplicação teria que se lembrar de adicionar `WHERE user_id = :uid` em toda query, em todo Service, para sempre.
- **Com RLS**, o Postgres reescreve implicitamente toda query contra a tabela para incluir a condição da política — mesmo que o Service "esqueça" o filtro, o banco nunca devolve nem aceita uma linha de outro usuário. Os filtros explícitos por `user_id` presentes em `eventService.js`, `categoryService.js` etc. são redundantes com a RLS, mas servem como defesa em profundidade e tornam a intenção do código explícita.
- Para `academic_events`, que não tem `user_id` próprio, o isolamento é feito por **subquery correlacionada** (`EXISTS`), verificando se o `calendar_id` da linha aponta para um calendário cujo dono é o usuário autenticado.
- Para `notification_logs` e `ai_metrics`, o isolamento de leitura segue o mesmo padrão (`user_id = auth.uid()`), mas a **escrita** é deliberadamente vedada a usuários comuns: apenas Edge Functions autenticadas com a `service_role key` (que ignora RLS por completo) podem inserir. Isso impede que um usuário forje logs de notificação ou métricas de IA em nome de outro usuário, ou manipule seu próprio histórico de auditoria.

---

# Integridade

### Chaves primárias (UUIDs)

Todas as 8 tabelas usam `UUID` como chave primária. Em 7 delas, o valor é gerado pelo próprio banco via `gen_random_uuid()`; a exceção é `profiles.id`, que **não** tem `DEFAULT` — o valor é sempre fornecido explicitamente (pelo trigger `handle_new_user()` ou pelo `upsert` do Service), pois precisa ser exatamente igual ao `id` do usuário em `auth.users`.

### Foreign keys e `ON DELETE CASCADE`

Toda FK que aponta para `auth.users(id)` usa `ON DELETE CASCADE`: `profiles.id`, `events.user_id`, `categories.user_id`, `push_subscriptions.user_id`, `notification_logs.user_id`, `academic_calendars.user_id`, `ai_metrics.user_id`. Isso significa que excluir um usuário em `auth.users` apaga automaticamente, em cascata, **todas** as suas linhas nessas 7 tabelas — sem necessidade de lógica de limpeza manual no aplicativo para essas relações.

A FK `academic_events.calendar_id → academic_calendars.id` também usa `ON DELETE CASCADE`: apagar um calendário acadêmico apaga automaticamente todos os seus eventos.

### Constraints CHECK

| Tabela | Constraint | Regra |
|---|---|---|
| `events` | `events_recurrence_type_check` | `recurrence_type IN ('none','daily','weekdays','weekly','biweekly','monthly','yearly','custom')` |
| `profiles` | (sem nome explícito) | `semester BETWEEN 1 AND 12` |
| `profiles` | (sem nome explícito) | `theme IN ('light','dark','system')` |

Nenhuma outra tabela possui CHECK constraints. Em particular, `notification_logs.status` (`sent`/`failed`) e `academic_events.category` (texto livre) **não** têm CHECK — o domínio de valores válidos é imposto apenas em código (Edge Function / Service), não pelo banco.

### Defaults

| Padrão | Onde é usado |
|---|---|
| `gen_random_uuid()` | Chave primária de 7 das 8 tabelas (todas exceto `profiles`). |
| `now()` / `NOW()` | `created_at` e `updated_at` (quando existentes) em todas as tabelas. |
| `'none'` | `events.recurrence_type`. |
| `'#3b82f6'` | `categories.color` (azul). |
| `'#7c3aed'` | `academic_calendars.color` (roxo). |
| `true` | `academic_events.all_day`, `ai_metrics.success`. |
| `'America/Sao_Paulo'` | `profiles.timezone`. |
| `TRUE` | `profiles.notification_enabled`. |
| `'light'` | `profiles.theme`. |
| `'sent'` | `notification_logs.status`. |

### Timestamps

Padrão `TIMESTAMPTZ` (com timezone) em todas as ocorrências. Convenção geral: `created_at` + `updated_at` `NOT NULL DEFAULT now()`. Duas exceções documentadas:

- `profiles.created_at`/`updated_at` — têm `DEFAULT NOW()` mas **sem** `NOT NULL` (inconsistência de convenção, sem impacto funcional).
- `notification_logs` e `ai_metrics` — não têm `updated_at`, apenas `sent_at`/`created_at` respectivamente, porque seus registros são conceitualmente imutáveis (logs e métricas não são "editados", apenas criados).

### Como o banco garante consistência, na prática

1. **Unicidade** é garantida por índices `UNIQUE`, não por lógica de aplicação: `categories_user_name_idx` (nome único por usuário), `push_subscriptions_user_endpoint` (uma assinatura por dispositivo), `notification_logs_dedup` (uma notificação por ocorrência).
2. **Consistência referencial** é garantida por FK com `ON DELETE CASCADE` — não há "linhas órfãs" possíveis para as relações fisicamente declaradas.
3. **Domínio de valores** é garantido por CHECK apenas onde declarado (`events.recurrence_type`, `profiles.semester`, `profiles.theme`); nos demais casos (`notification_logs.status`, categorias de `events`/`academic_events`), a validação é responsabilidade exclusiva do código da aplicação — um valor fora do esperado nesses campos **seria aceito pelo banco**.
4. **Isolamento entre usuários** é garantido por RLS, não por FK nem por filtro de aplicação (ver seção Row Level Security).
5. **Timestamps de auditoria** (`updated_at`) são garantidos pela trigger `update_updated_at()`, eliminando a possibilidade de um `UPDATE` esquecer de atualizar o timestamp.

---

# Fluxo de Dados

Fluxo genérico de uma entidade de domínio (`events`, `categories`, `academic_calendars`, `academic_events`, `profiles`, `push_subscriptions`), do cadastro à exclusão:

```
┌─────────────┐
│  Cadastro   │   View captura input do usuário (ex.: eventFormView.js)
└──────┬──────┘   chama a função do Service (createEvent, createCategory, ...)
       ▼
┌─────────────┐
│   Banco     │   Service resolve user_id via currentUserId() e injeta no payload
│             │   supabase.from(tabela).insert({ ...fields, user_id })
│             │   PostgREST valida JWT → RLS avalia WITH CHECK (user_id = auth.uid())
│             │   Postgres grava a linha, preenche defaults (id, created_at, updated_at)
└──────┬──────┘
       ▼
┌─────────────┐
│  Consulta   │   getX() / getXByRange() — SELECT filtrado por user_id (aplicação)
│             │   e reforçado por RLS (USING user_id = auth.uid())
│             │   { data, error } retorna ao Service, que relança erro ou devolve data
└──────┬──────┘
       ▼
┌─────────────┐
│Atualização  │   updateX(id, fields) — UPDATE ... WHERE id = :id AND user_id = :uid
│             │   Trigger BEFORE UPDATE (update_updated_at) sobrescreve updated_at = now()
│             │   RLS revalida USING antes de permitir a alteração
└──────┬──────┘
       ▼
┌─────────────┐
│  Exclusão   │   deleteX(id) — DELETE ... WHERE id = :id AND user_id = :uid
│             │   RLS revalida USING antes de permitir a remoção
│             │   FKs com ON DELETE CASCADE propagam a exclusão para tabelas filhas
│             │   (ex.: academic_calendars → academic_events)
└─────────────┘
```

### Caso especial — exclusão de conta (`delete-account`)

A Edge Function `delete-account` é o único ponto do sistema que apaga dados de **múltiplas tabelas em sequência**, usando `service_role` (contorna RLS):

```
accountView.js
   │ supabase.functions.invoke('delete-account')  [JWT do usuário anexado pelo SDK]
   ▼
Edge Function delete-account (valida usuário via auth.getUser())
   │ admin.from("notification_logs").delete().eq("user_id", userId)
   │ admin.from("push_subscriptions").delete().eq("user_id", userId)
   │ admin.from("events").delete().eq("user_id", userId)
   │ admin.from("categories").delete().eq("user_id", userId)
   │ admin.storage.from("avatars").remove([...arquivos do usuário])
   ▼
admin.auth.admin.deleteUser(userId)   [apaga a linha em auth.users]
   │
   ▼  ON DELETE CASCADE propaga automaticamente para:
   profiles · academic_calendars (→ academic_events em cascata) · ai_metrics
```

`notification_logs`, `push_subscriptions`, `events` e `categories` são apagadas **explicitamente** pela função antes de excluir o usuário; `profiles`, `academic_calendars` (e seus `academic_events`) e `ai_metrics` **não** são tocadas pelo código da função — sua remoção depende inteiramente do `ON DELETE CASCADE` disparado quando `auth.users` perde a linha correspondente. O comportamento final é correto (todas as FKs relevantes têm `CASCADE`), mas essa dependência implícita não é evidente apenas lendo o corpo da função — está documentada aqui e na seção **Auditoria**.

### Caso especial — notificações push (fluxo assíncrono/cron)

```
[Cron: a cada minuto, Authorization: service_role key]
Edge Function send-push-notifications
   │ SELECT events WHERE reminder_minutes IS NOT NULL   (bypassa RLS)
   │ expandEvent() decide se hoje é uma ocorrência válida
   │ calcula se o horário do lembrete cai numa janela de 5 minutos
   │ SELECT notification_logs (dedup) → pula se já notificado
   │ SELECT push_subscriptions do usuário
   │ envia via web-push para cada dispositivo
   │ UPSERT notification_logs (status: sent|failed)
   │ DELETE push_subscriptions com erro 410/404 (revogadas)
```

Este fluxo não passa por nenhuma View nem Service do frontend — é inteiramente server-side, disparado por agendamento externo (Supabase Scheduler ou `pg_cron`).

---

# Auditoria

Verificação realizada durante a elaboração desta documentação, comparando as 8 migrations em `sql/*.sql` com o uso real em todos os Services (`eventService.js`, `categoryService.js`, `profileService.js`, `avatarService.js`, `pushService.js`, `notificationService.js`, `academicCalendarService.js`) e nas 3 Edge Functions (`ai-chat`, `send-push-notifications`, `delete-account`). Nenhuma alteração de código foi feita.

- ✅ **Todas as 8 tabelas** do schema `public` foram lidas nas migrations e documentadas nesta página: `events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`.
- ✅ **Todos os 10 índices explícitos** foram localizados nas migrations e documentados na seção Índices, com o motivo de existência de cada um.
- ✅ **Todas as 7 triggers** (6 de `update_updated_at()` + `on_auth_user_created`) foram localizadas e documentadas, com explicação de funcionamento.
- ✅ **Todas as 26 políticas de RLS em tabelas** (mais 4 políticas de Storage no bucket `avatars`) foram localizadas e documentadas por tabela/operação.

### Inconsistências e observações encontradas (apenas documentadas, não corrigidas)

| Item | Tipo | Descrição |
|---|---|---|
| `profiles.created_at`/`updated_at` sem `NOT NULL` | Inconsistência de convenção | Diferente das demais 7 tabelas, onde ambos os campos são `NOT NULL DEFAULT now()`. Sem impacto funcional observado, pois o `DEFAULT` sempre preenche o valor em uso normal. |
| `03_recurrence.sql` redundante | Inconsistência de migration | As 3 colunas que adiciona (`recurrence_interval`, `recurrence_until`, `recurrence_days_of_week`) já estão declaradas em `01_events.sql`. `ADD COLUMN IF NOT EXISTS` torna a migration segura, mas desnecessária se executada após `01`. |
| `notification_logs.event_id` sem FK formal | Resolvido (`09_notification_logs_integrity.sql`, Auditoria P1.3) | Passou a ter FK para `events(id)` com `ON DELETE CASCADE`, eliminando o risco de logs órfãos ao excluir um evento. |
| `events.category` / `academic_events.category` como TEXT livre, sem FK | Decisão arquitetural, não bug | O vínculo com `categories` é gerenciado pelo frontend, não pelo banco. |
| `ai_metrics` provisionada mas não populada | Inconsistência funcional | A tabela existe, com RLS e FK corretas, mas a Edge Function `ai-chat` (única chamadora de IA do sistema) não insere nenhuma linha nela. Confirmado por leitura direta de `supabase/functions/ai-chat/index.ts` — não há nenhuma referência a `ai_metrics` no código da função. |
| `delete-account` depende de `CASCADE` implícito para 3 tabelas | Observação de design, não bug | `profiles`, `academic_calendars`/`academic_events` e `ai_metrics` não são apagadas explicitamente pela função — apenas via `ON DELETE CASCADE` ao excluir o usuário em `auth.users`. Funciona corretamente hoje, mas não é auto-evidente lendo apenas o código da Edge Function. |
| `categories.icon` não utilizado | Campo ocioso | A coluna existe desde `02_categories.sql`, mas nenhum Service ou View lê ou escreve nela atualmente. |
| `notification_logs.status` sem CHECK | Ausência de constraint | Os valores `sent`/`failed` são um contrato apenas de código (Edge Function), não impostos pelo banco — qualquer string seria aceita fisicamente. |
| Nenhuma tabela usa JSONB | Observação de modelagem | Todo o schema de domínio é relacional plano; a única coluna JSONB do sistema é `auth.users.raw_user_meta_data`, gerenciada exclusivamente pelo Supabase Auth. |

---

# Estado Atual

| Métrica | Quantidade |
|---|---|
| Tabelas no schema `public` | 8 |
| Migrations SQL | 8 (`01` a `08`) |
| Triggers | 7 (6× `update_updated_at()` + `on_auth_user_created`) |
| Funções SQL | 3 (`update_updated_at()`, `handle_new_user()`, `cleanup_old_notification_logs()`) |
| Índices explícitos | 10 (4 únicos + 6 B-tree simples/compostos) |
| Políticas de RLS em tabelas | 26 |
| Políticas de RLS em Storage (`avatars`) | 4 |
| Tabelas sem `user_id` próprio | 1 (`academic_events`, autorização via JOIN) |
| Tabelas sem escrita por Service ou Edge Function em uso | 1 (`ai_metrics`) |

### Avaliação geral da modelagem

O modelo de dados do MedAgenda é **enxuto, coeso e adequado ao tamanho da aplicação**. A decisão de delegar autenticação ao Supabase Auth e usar RLS como única linha real de autorização elimina uma classe inteira de bugs de isolamento entre usuários — mesmo sem qualquer filtro no código, o banco nunca vaza dado entre contas. A função `update_updated_at()` centralizada e reaproveitada por 6 tabelas, junto com o padrão consistente de `UUID` + `TIMESTAMPTZ` + `ON DELETE CASCADE`, demonstra disciplina arquitetural apesar do crescimento incremental por migrations numeradas.

A decisão de **não** usar FK formal em `events.category` é uma escolha consciente e documentada na própria migration, não uma omissão — troca integridade referencial estrita por flexibilidade operacional (um evento pode manter uma categoria "solta" em texto mesmo após ela ser excluída). Já a ausência de FK em `notification_logs.event_id` foi corrigida pela migration `09_notification_logs_integrity.sql` (Auditoria P1.3): a tabela agora tem `event_id → events.id ON DELETE CASCADE`, o que elimina logs órfãos sem afetar o suporte a eventos recorrentes (múltiplas linhas de log continuam apontando para o mesmo `event_id` da linha-base). O ponto mais frágil do modelo é a tabela `ai_metrics`: está corretamente desenhada, mas nenhuma parte do sistema a alimenta hoje, o que representa código morto no schema até que a instrumentação seja implementada na Edge Function `ai-chat`. As demais inconsistências (timestamps nullable em `profiles`, migration redundante `03_recurrence.sql`, ausência de CHECK em `notification_logs.status`) são de baixo risco prático e não comprometem a integridade observável do sistema em produção.
