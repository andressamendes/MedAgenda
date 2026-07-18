# API do Anoti

> Documentação oficial da API interna do Anoti: como o Frontend, os Services, o cliente Supabase, o banco PostgreSQL e as Edge Functions se comunicam. Este documento reflete exatamente a implementação atual do código (`*.js` na raiz, `services/`, `supabase.js`, `supabase/functions/`). Não descreve comportamento planejado nem sugere mudanças.
>
> **Escopo:** cobre o padrão geral View → Service → Supabase SDK, usando os Services de Planejamento (`eventService.js`, `categoryService.js` etc.) como exemplo. Os Services do domínio de Execução de Estudo (`activitySessionService.js`, `questionService.js`, `reviewService.js`, `studyReflectionService.js` etc.) seguem o mesmo padrão de comunicação com o Supabase descrito aqui, com a adição do Session Event Bus como canal de propagação de eventos entre módulos — ver [`ARCHITECTURE.md`](ARCHITECTURE.md) para o detalhamento desses Services e dos seis eventos que publicam.

---

## Visão Geral

O Anoti **não possui um backend HTTP próprio**. É uma aplicação estática (HTML/CSS/JS, sem build obrigatório) que se comunica diretamente com um projeto Supabase através do SDK `@supabase/supabase-js`. Não existe uma camada de "API REST" escrita pela equipe — a "API interna" documentada aqui é a camada de **Services** (`eventService.js`, `categoryService.js`, etc.), que funciona como fronteira única entre as Views (UI) e o Supabase.

Fluxo de uma chamada típica (ex.: listar eventos):

```
 Views (UI)
    │  chama função exportada, ex.: getEvents()
    ▼
 Services (eventService.js, categoryService.js, ...)
    │  monta filtros, injeta user_id, valida entrada
    ▼
 Supabase Client (supabase.js → @supabase/supabase-js)
    │  anexa JWT da sessão (Authorization: Bearer <token>)
    ▼
 REST API do Supabase (PostgREST / GoTrue / Storage / Edge Functions)
    │  aplica Row Level Security usando auth.uid()
    ▼
 PostgreSQL (ou Storage, ou runtime Deno das Edge Functions)
    │  executa a query/operação
    ▼
 Resposta
    │  { data, error } retorna pela mesma cadeia
    ▼
 Services (lança exceção se error, normaliza retorno)
    ▼
 Views (atualizam a UI ou exibem erro)
```

### Camadas

| Camada | Responsabilidade |
|---|---|
| **Views** | Renderizam a UI, capturam eventos do usuário, chamam funções dos Services e reagem ao resultado (sucesso ou erro). Nunca importam `supabase.js` diretamente para acesso a dados de domínio — exceção legítima: `accountView.js`, que chama `supabase.functions.invoke('delete-account')` diretamente (não há wrapper em `auth.js` para Edge Functions; a exclusão de conta não é acesso à sessão). Sinalização de sessão (login/logout) sempre passa pelos wrappers de `auth.js` (A1.7 — `signOut()`, nunca `supabase.auth.signOut()` diretamente). |
| **Services** | Módulos ES puros (`*.js` na raiz do projeto e `services/ai/`). Cada um encapsula o acesso a uma tabela ou a um domínio específico (eventos, categorias, perfil, avatar, calendário acadêmico, notificações locais, push, IA). Resolvem o `user_id` da sessão atual, montam a query Supabase, tratam erros e devolvem dados já no formato usado pela UI. |
| **Supabase Client** | Instância única (`supabase.js`) criada com `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`. Gerencia sessão (localStorage), renovação de token e serve de base para `.from()`, `.storage`, `.auth` e `.functions.invoke()`. |
| **REST API (Supabase)** | PostgREST expõe cada tabela como um recurso REST; GoTrue expõe autenticação; Storage expõe upload/download de arquivos; Edge Functions expõem endpoints HTTP customizados. Todas exigem o header `Authorization: Bearer <jwt>` (exceto rotas públicas de auth, como login/signup). |
| **PostgreSQL** | Armazena os dados de domínio. Row Level Security (RLS) garante que cada usuário só acesse suas próprias linhas, usando `auth.uid()` extraído do JWT. |
| **Resposta** | Toda chamada Supabase retorna `{ data, error }` (ou `{ data, error }` dentro de uma Promise). Os Services seguem o padrão `if (error) throw error;` e devolvem `data` já pronto para a View consumir. |

---

## Organização dos Services

Todos os Services seguem a mesma convenção: importam `supabase` e `currentUserId` de `supabase.js`, expõem funções `async` nomeadas por operação (`getX`, `createX`, `updateX`, `deleteX`) e propagam erros do Supabase lançando exceções (nunca engolem silenciosamente um erro de banco).

| Service | Arquivo | Responsabilidade | Depende de |
|---|---|---|---|
| `eventService` | `eventService.js` | CRUD de compromissos (`events`) e busca por intervalo de datas, incluindo eventos recorrentes | `supabase.js` (tabela `events`) |
| `categoryService` | `categoryService.js` | CRUD de categorias (`categories`), proteção contra duplicidade e exclusão de categoria em uso | `supabase.js` (tabelas `categories`, `events`) |
| `profileService` | `profileService.js` | Leitura e upsert do perfil do usuário (`profiles`) | `supabase.js` (tabela `profiles`) |
| `avatarService` | `avatarService.js` | Upload/remoção da foto de perfil no Storage | `supabase.js` (Storage, bucket `avatars`) |
| `academicCalendarService` | `academicCalendarService.js` | CRUD de calendários e eventos acadêmicos, expansão de eventos multi-dia | `supabase.js` (tabelas `academic_calendars`, `academic_events`) |
| `notificationService` | `notificationService.js` | Agendamento de lembretes locais via `Notification` API do navegador (não usa Supabase) | `recurrence.js`, `utils.js`, Web Notifications API |
| `pushService` | `pushService.js` | Registro/remoção de inscrições Web Push (`push_subscriptions`) | `supabase.js` (tabela `push_subscriptions`), Push API, Service Worker |
| `aiService` | `services/ai/aiService.js` | Gateway único de IA: prepara payload, seleciona provider, normaliza resposta | `geminiProvider.js`, prompts, `responseParser.js` |
| `auth` | `auth.js` | Login, cadastro, logout, sessão, redefinição de senha, eventos de auth | `supabase.js` (`supabase.auth`) |
| `diagnosticService` | `diagnosticService.js` | Ping de conectividade (Supabase, auth, service worker, push) para tela de diagnóstico | `supabase.js` |

Os Services **não** conhecem a UI: não manipulam DOM nem exibem toasts — isso é responsabilidade das Views e do `errorService.js`.

---

## eventService

Arquivo: `eventService.js`. Tabela: `public.events`. Todas as operações resolvem `user_id` via `currentUserId()` e filtram/gravam por esse valor — a aplicação nunca confia em um `user_id` vindo da UI.

### `createEvent(fields)`
- **Entrada:** objeto com os campos do evento (`title`, `event_date`, `start_time`, `category`, `recurrence_type`, etc.), sem `user_id`.
- **Processamento:** obtém `user_id` da sessão, insere em `events` com `{ ...fields, user_id }`, pede o registro criado de volta (`.select().single()`).
- **Retorno:** o evento criado (linha completa, com `id` gerado).
- **Erros:** qualquer erro do PostgREST/Postgres (ex.: `NOT NULL` violado, `recurrence_type` inválido pela constraint `events_recurrence_type_check`) é relançado como está.

### `getEvents()`
- **Entrada:** nenhuma (usa apenas a sessão atual).
- **Processamento:** `SELECT * FROM events WHERE user_id = :uid ORDER BY event_date, start_time`.
- **Retorno:** array de eventos "base" (sem expansão de recorrência — isso é feito no frontend por `recurrence.js`).
- **Erros:** erro do Supabase é relançado.

### `updateEvent(id, fields)`
- **Entrada:** `id` do evento e campos a atualizar (parcial).
- **Processamento:** `UPDATE events SET ...fields WHERE id = :id AND user_id = :uid`. A dupla condição garante que um usuário não altere evento de outro, mesmo que RLS já impeça isso no banco.
- **Retorno:** o evento atualizado.
- **Erros:** relançado; se `id` pertencer a outro usuário, a query não casa nenhuma linha e `.single()` retorna erro (`PGRST116`).

### `deleteEvent(id)`
- **Entrada:** `id` do evento.
- **Processamento:** `DELETE FROM events WHERE id = :id AND user_id = :uid`.
- **Retorno:** nenhum (`void`).
- **Erros:** relançado.

### `getEventsByRange(start, end)`
- **Entrada:** datas ISO `start` e `end`.
- **Processamento:** duas queries em paralelo (`Promise.all`):
  1. eventos cuja `event_date` está dentro do intervalo;
  2. eventos recorrentes cuja base é anterior ao intervalo mas ainda podem gerar ocorrências dentro dele (`recurrence_until` nulo ou ≥ `start`).
  Os resultados são deduplicados por `id` antes de retornar.
- **Retorno:** array de eventos "base" (a expansão em ocorrências individuais é feita depois por `recurrence.js`, no cliente).
- **Erros:** se qualquer uma das duas queries falhar, o erro correspondente é lançado.

---

## categoryService

Arquivo: `categoryService.js`. Tabela: `public.categories`.

### `getCategories()`
- **Entrada:** nenhuma.
- **Processamento:** `SELECT * FROM categories WHERE user_id = :uid ORDER BY name`.
- **Retorno:** array de categorias do usuário.
- **Erros:** relançado.

### `createCategory(name, color)`
- **Entrada:** `name` (string) e `color` (hex).
- **Processamento:** insere `{ user_id, name: name.trim(), color }`.
- **Retorno:** categoria criada.
- **Erros:** se o índice único `categories_user_name_idx` (nome duplicado, case-insensitive, por usuário) for violado (`code === '23505'`), lança `Error("Já existe uma categoria com esse nome.")` em vez do erro cru do Postgres. Demais erros são relançados sem alteração.

### `updateCategory(id, name, color)`
- **Entrada:** `id`, novo `name`, novo `color`.
- **Processamento:** `UPDATE categories SET name, color WHERE id = :id AND user_id = :uid`.
- **Retorno:** categoria atualizada.
- **Erros:** mesmo tratamento de duplicidade (`23505`) do `createCategory`.

### `deleteCategory(id)`
- **Entrada:** `id`.
- **Processamento:** antes de excluir, busca o nome da categoria e conta quantos `events` a usam (`category = nome`). Se `count > 0`, a exclusão é **abortada no frontend** (nenhuma chamada `DELETE` é feita) e é lançado um erro de negócio explicando quantos compromissos usam a categoria.
- **Retorno:** nenhum (`void`) quando a exclusão ocorre.
- **Erros:** erro de negócio (categoria em uso) ou erro relançado do Supabase.

### `ensureDefaultCategories()`
- **Entrada:** nenhuma.
- **Processamento:** chama `getCategories()`; se o usuário já tem categorias, retorna-as sem alteração. Caso contrário, insere em lote (`bulk insert`) 8 categorias padrão (Aula, Plantão, Ambulatório, Laboratório, Estudo, Prova, Congresso, Pessoal), cada uma com cor pré-definida.
- **Retorno:** array das categorias (existentes ou recém-criadas).
- **Erros:** relançado. Usado para popular a conta de um usuário novo na primeira visita.

---

## profileService

Arquivo: `profileService.js`. Tabela: `public.profiles` (chave primária = `auth.users.id`, criada automaticamente por trigger no signup — ver `sql/05_profiles.sql`).

### `getProfile()`
- **Entrada:** nenhuma.
- **Processamento:** `SELECT * FROM profiles WHERE id = :uid LIMIT 1` via `.single()`.
- **Retorno:** o perfil do usuário, ou `undefined`/`null` se ainda não existir.
- **Erros:** o código `PGRST116` (nenhuma linha encontrada) é explicitamente ignorado — não é considerado erro, pois um perfil pode não existir ainda. Qualquer outro código é relançado.

### `upsertProfile(fields)`
- **Entrada:** objeto parcial com qualquer subconjunto de `full_name`, `avatar_url`, `university`, `course`, `semester`, `timezone`, `notification_enabled`, `theme`. Campos fora dessa lista são **silenciosamente ignorados** (allow-list explícita, não passam para o banco).
- **Processamento:** `UPSERT` em `profiles` com `onConflict: 'id'`, sempre incluindo `id` da sessão atual.
- **Retorno:** o perfil resultante após o upsert.
- **Erros:** relançado (ex.: `semester` fora do intervalo 1–12 viola `CHECK` da tabela; `theme` fora de `light/dark/system` idem).

---

## avatarService

Arquivo: `avatarService.js`. Storage bucket: `avatars` (público para leitura, gravação restrita ao próprio usuário via RLS de Storage).

### `uploadAvatar(file)`
- **Entrada:** `File` do input do navegador.
- **Processamento:**
  1. Validação de tipo MIME (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) — outros tipos lançam erro **antes** de qualquer chamada de rede.
  2. Validação de tamanho (máx. 2 MB) — mesma lógica.
  3. Monta o caminho `${user_id}/avatar.${ext}` e chama `storage.from('avatars').upload(path, file, { upsert: true, contentType })`.
  4. Obtém a URL pública via `getPublicUrl` e anexa `?v=<timestamp>` para invalidar cache do navegador.
- **Retorno:** URL pública do avatar (string), já com cache-busting.
- **Erros:** erros de validação são lançados como `Error` com mensagem amigável em português; erros do Storage são relançados como vieram do Supabase.

### `removeAvatar()`
- **Entrada:** nenhuma.
- **Processamento:** lista os arquivos na pasta `${user_id}/` do bucket e remove todos (`storage.remove`). Se não houver arquivos, retorna sem erro.
- **Retorno:** nenhum (`void`).
- **Erros:** relançado tanto na listagem quanto na remoção.

---

## academicCalendarService

Arquivo: `academicCalendarService.js`. Tabelas: `public.academic_calendars` e `public.academic_events` (RLS de `academic_events` é feita via `EXISTS` contra `academic_calendars.user_id`, não há coluna `user_id` direta na tabela de eventos).

### Calendários

| Função | Entrada | Processamento | Retorno |
|---|---|---|---|
| `getCalendars()` | — | `SELECT * FROM academic_calendars WHERE user_id = :uid ORDER BY created_at` | array (`[]` se erro de dado ausente) |
| `createCalendar({ name, university, academic_year, color })` | campos do calendário | `INSERT` com `user_id` injetado; `color` default `#7c3aed` | calendário criado |
| `updateCalendar(id, fields)` | `id`, campos parciais | `UPDATE ... WHERE id = :id AND user_id = :uid` | calendário atualizado |
| `deleteCalendar(id)` | `id` | `DELETE ... WHERE id = :id AND user_id = :uid` (cascata apaga os `academic_events` filhos via FK) | `void` |

### Eventos acadêmicos

| Função | Entrada | Processamento | Retorno |
|---|---|---|---|
| `getAcademicEvents(calendarId)` | `calendarId` | `SELECT * WHERE calendar_id = :id ORDER BY start_date` | array |
| `getAcademicEventsByRange(calendarIds, start, end)` | array de IDs, intervalo | `SELECT ... WHERE calendar_id IN (...) AND start_date <= end`, com join a `academic_calendars(id, name, color)`; filtro adicional **no cliente** para manter apenas eventos cujo `end_date` (ou `start_date`, se não houver fim) seja ≥ `start` | array de eventos que sobrepõem o intervalo |
| `createAcademicEvent(fields)` | campos do evento | `INSERT` direto (sem injetar `user_id` — a autorização depende do `calendar_id` pertencer ao usuário, verificado pela policy de RLS) | evento criado |
| `updateAcademicEvent(id, fields)` | `id`, campos | `UPDATE ... WHERE id = :id` (autorização via RLS) | evento atualizado |
| `deleteAcademicEvent(id)` | `id` | `DELETE ... WHERE id = :id` (autorização via RLS) | `void` |
| `bulkInsertAcademicEvents(events)` | array de eventos | `INSERT` em lote (usado pela importação de ICS); retorna `[]` se array vazio, sem chamar o Supabase | array de eventos criados |

### `expandAcademicEvents(events, start, end)`
- Função **puramente local**, não chama o Supabase. Converte eventos multi-dia em uma entrada por dia dentro do intervalo, adicionando metadados (`_isAcademic`, `_calendarId`, `_calendarName`, `_calendarColor`) para diferenciação visual no calendário.

---

## notificationService

Arquivo: `notificationService.js`. **Não se comunica com o Supabase** — usa exclusivamente a Web Notifications API do navegador e `localStorage`. É o mecanismo de lembretes *enquanto a aba está aberta*; o lembrete que funciona com o app fechado é o Push (`pushService.js` + Edge Function `send-push-notifications`, documentada abaixo).

- **`initNotifications(userId)`** — guarda o `userId` em memória (usado para namespacing das preferências no `localStorage`).
- **`isSupported()` / `permissionStatus()`** — consultam a API `Notification` do navegador.
- **`isEnabled()` / `setEnabled(bool)`** — leem/gravam a preferência do usuário em `localStorage`, chave `medagenda_notif_<userId>`.
- **`requestPermission()`** — solicita permissão do navegador (`Notification.requestPermission()`).
- **`scheduleReminders(events)`** — entrada: array de eventos base (de `getEvents()`). Processamento: limpa todos os `setTimeout` pendentes, expande cada evento com `expandEvent()` (`recurrence.js`) numa janela de 7 dias e agenda um `setTimeout` por ocorrência que tenha `reminder_minutes` definido, ignorando ocorrências mais de 1 minuto atrasadas ou além da janela. Retorno: nenhum. Sem tratamento de erro de rede — é 100% síncrono/local.
- **`_scheduleOne` / `_fire` / `clearAll`** — funções internas: disparam `new Notification(...)` no horário calculado e limpam os timers ao reagendar.

---

## pushService

Arquivo: `pushService.js`. Tabela: `public.push_subscriptions`. Complementa `notificationService.js` para lembretes que funcionam com o app fechado, via Web Push + Service Worker.

### `subscribeToPush()`
- **Entrada:** nenhuma (usa `_vapidPubKey` configurada por `initPushService`).
- **Processamento:** solicita permissão de notificação; obtém (ou cria) uma `PushSubscription` via `registration.pushManager.subscribe()` usando a `VAPID_PUBLIC_KEY`; grava a subscription no Supabase.
- **Retorno:** o objeto `PushSubscription` do navegador.
- **Erros:** lança `Error` com mensagens específicas para: navegador sem suporte, `VAPID_PUBLIC_KEY` não configurada, ou permissão negada pelo usuário.

### `unsubscribeFromPush()`
- **Processamento:** obtém a subscription atual, remove a linha correspondente no Supabase (`_removeSubscription`) e cancela a subscription no navegador (`subscription.unsubscribe()`).
- **Retorno:** `void`.

### `syncPushSubscription()`
- **Processamento:** se push estiver habilitado localmente mas a subscription do navegador tiver sido revogada externamente, desativa a preferência local; caso contrário, regrava a subscription atual no Supabase (mantém `updated_at` em dia).
- **Retorno:** `void`.

### `_saveSubscription(subscription)` (interno)
- **Processamento:** `UPSERT` em `push_subscriptions` com `onConflict: 'user_id,endpoint'`, gravando `endpoint`, `p256dh`, `auth` (chaves criptográficas da subscription) e `user_agent`.
- **Erros:** em caso de falha, relança como `Error('Erro ao salvar subscription: ...')`.

---

## aiService

Arquivo: `services/ai/aiService.js` — funciona como **gateway único** de IA: o restante da aplicação só deve chamar `getWeeklySummary`, `getStudySuggestion` e `getScheduleAnalysis`; nunca a Edge Function diretamente.

### Provider
- Configurado em `config/ai.js` (`AI_CONFIG.provider = 'gemini'`). O mapa `PROVIDERS` associa o identificador `'gemini'` à função `callGemini` (`services/ai/providers/geminiProvider.js`). Trocar de provider exigiria apenas adicionar uma entrada nesse mapa — hoje só existe Gemini.

### Prompt
- Cada operação tem um preparador dedicado em `services/ai/prompts/`:
  - `prepareWeeklySummary` — eventos da semana corrente (segunda a domingo).
  - `prepareStudySuggestion` — eventos dos próximos 14 dias.
  - `prepareScheduleAnalysis` — eventos dos próximos 30 dias.
  Todos usam `expandEvents()` (`recurrence.js`) para converter eventos recorrentes em ocorrências concretas, e enviam apenas campos não sensíveis (`title`, `date`, `start_time`, `duration_minutes`, `category`, `location` quando aplicável) — nunca `description` ou `id` interno.
- O **texto do prompt em si** (as instruções em português enviadas ao modelo) é montado **na Edge Function** (`buildWeeklySummaryPrompt`, `buildStudySuggestionPrompt`, `buildScheduleAnalysisPrompt` em `supabase/functions/ai-chat/index.ts`), não no frontend. O frontend envia apenas `{ type, events, ...datas do período }`.

### Edge Function
- `callGemini(payload)` obtém a sessão atual (`supabase.auth.getSession()`) — se não houver sessão, lança `AIError('Usuário não autenticado.', 'AUTH')` sem chamar a rede.
- Monta a URL da função a partir da própria URL do projeto Supabase: `${supabase.supabaseUrl}/functions/v1/ai-chat`.
- Faz `fetch` com `Authorization: Bearer <access_token>`, corpo `{ ...payload, model, temperature, maxTokens }` (de `AI_CONFIG`), e timeout de 30s via `AbortController`.

### Resposta
- `parseResponse()` (`services/ai/parsers/responseParser.js`) limpa o texto cru retornado pelo modelo: remove marcações Markdown de heading (`#`), negrito (`**`) e normaliza marcadores de lista para `•`.
- Retorno final de `getWeeklySummary`/`getStudySuggestion`/`getScheduleAnalysis`: string de texto pronta para exibição.

### Erros da IA
Ver seção [Tratamento de Erros](#tratamento-de-erros) para o mapeamento completo de códigos `AIError`.

---

## Edge Functions

Todas as três funções vivem em `supabase/functions/<nome>/index.ts`, rodam em runtime Deno, respondem a `OPTIONS` e retornam sempre JSON. `delete-account` e `send-push-notifications` respondem com CORS liberado (`Access-Control-Allow-Origin: *`); `ai-chat` restringe a origem a uma allowlist (produção + localhost/127.0.0.1) — ver detalhe abaixo.

### `ai-chat`

| Aspecto | Detalhe |
|---|---|
| **Endpoint** | `POST {SUPABASE_URL}/functions/v1/ai-chat` |
| **Autenticação** | Header `Authorization: Bearer <jwt do usuário>` obrigatório. A função valida o token chamando `supabase.auth.getUser()` com um client criado usando `SUPABASE_ANON_KEY` + o header recebido (não usa `service_role`). |
| **Headers** | `Content-Type: application/json`; `Access-Control-Allow-Origin` restrito à allowlist (produção `https://andressamendes.github.io` + `http://localhost`/`http://127.0.0.1` em qualquer porta), `Access-Control-Allow-Headers` liberado para `authorization, x-client-info, apikey, content-type`. |
| **Payload** | `{ type: 'weekly_summary' \| 'study_suggestion' \| 'schedule_analysis', events: Event[], model?, temperature?, maxTokens? }`. Validado: `type` precisa estar na lista permitida, `events` precisa ser array, e no máximo 500 itens. |
| **Resposta** | `200 { text: string, ms: number }` |
| **Erros** | `401` token ausente/inválido/sessão expirada · `400` payload inválido (tipo desconhecido, `events` não é array, mais de 500 eventos) · `429` limite de taxa do Gemini · `503` `GEMINI_API_KEY` não configurada ou erro de autenticação do Gemini · `502` erro genérico do Gemini ou resposta vazia · `500` erro interno inesperado. |
| **Segredos usados** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (nunca exposto ao navegador). |

### `send-push-notifications`

| Aspecto | Detalhe |
|---|---|
| **Endpoint** | `POST {SUPABASE_URL}/functions/v1/send-push-notifications` |
| **Autenticação** | Não valida um usuário final — é uma função de **sistema**, disparada por cron (Supabase Scheduler ou `pg_cron` + `pg_net`, ver `sql/04_push_notifications.sql`) usando a `service_role key` no header `Authorization`. Não é chamada por nenhum Service do frontend. |
| **Headers** | `Content-Type: application/json` na chamada do cron; resposta com CORS liberado. |
| **Payload** | Nenhum corpo necessário (`{}` no exemplo de `pg_cron`). |
| **Processamento** | Usa client Supabase com `service_role` (bypassa RLS). Busca todos os `events` com `reminder_minutes` definido, usa `expandEvent()` (`supabase/functions/_shared/recurrence-core.js` — mesma lógica de recorrência do frontend) para checar se hoje é uma ocorrência válida, calcula se o horário do lembrete cai dentro de uma janela de 5 minutos (o cron roda a cada minuto), evita duplicar envios consultando `notification_logs`, busca as `push_subscriptions` do usuário e envia via `web-push`. Registra o resultado em `notification_logs` (upsert por `user_id,event_id,event_date`). Subscriptions que retornam `410`/`404` (revogadas) são removidas automaticamente. |
| **Resposta** | `200 { sent, failed, skipped, timestamp }` |
| **Erros** | `500 { error: message }` em caso de exceção não tratada (ex.: falha ao consultar `events`). Falhas de envio individuais por subscription não abortam o processamento — apenas incrementam `failed` e são logadas. |
| **Segredos usados** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |

### `delete-account`

| Aspecto | Detalhe |
|---|---|
| **Endpoint** | `POST {SUPABASE_URL}/functions/v1/delete-account` |
| **Autenticação** | Header `Authorization: Bearer <jwt do usuário>` obrigatório. A função identifica o usuário chamando `userClient.auth.getUser()` com um client criado com `SUPABASE_ANON_KEY` + o token recebido. |
| **Chamada no frontend** | `accountView.js` chama via SDK: `supabase.functions.invoke('delete-account')` (o SDK anexa o JWT da sessão automaticamente — não é um `fetch` manual como no `aiService`). |
| **Headers** | Anexados automaticamente pelo SDK (`apikey`, `authorization`, `content-type`). |
| **Payload** | Nenhum — a função opera apenas sobre o usuário autenticado, identificado pelo próprio token. |
| **Processamento** | Cria um client **admin** com `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS) e apaga, na ordem que respeita as foreign keys: `notification_logs`, `push_subscriptions`, `events`, `categories` do usuário; remove os arquivos do usuário no bucket `avatars`; por fim chama `admin.auth.admin.deleteUser(userId)`, que apaga o usuário em `auth.users` — a linha em `profiles` é removida automaticamente por `ON DELETE CASCADE`. Note que `academic_calendars`/`academic_events` e `ai_metrics` **não são apagados explicitamente** por esta função — dependem do `ON DELETE CASCADE` das FKs para `auth.users(id)` ser acionado quando o usuário é excluído do Auth. |
| **Resposta** | `200 { success: true }` |
| **Erros** | `401 { error: 'Não autorizado.' }` sem header ou token inválido · `500 { error: <mensagem> }` se `deleteUser` falhar ou qualquer exceção não tratada ocorrer (capturada pelo `try/catch` externo, que serializa o erro com `String(err)`). |
| **Segredos usados** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. |
| **Pós-chamada no frontend** | Em caso de sucesso, `accountView.js` chama `signOut()` (wrapper oficial de `auth.js`, A1.7 — nunca `supabase.auth.signOut()` diretamente) e exibe um toast de confirmação; em caso de erro, passa por `errorService.handleError()` e exibe a mensagem amigável resultante em um toast de erro (nunca `err.message` bruto). |

---

## Fluxo de Dados

### Eventos

```
weekView.js / eventFormView.js / quickAdd.js
        │  createEvent / getEvents / getEventsByRange / updateEvent / deleteEvent
        ▼
eventService.js  ──currentUserId()──►  supabase.auth (sessão local)
        │
        ▼
supabase.from("events")  ── JWT ──►  PostgREST  ── RLS(user_id = auth.uid()) ──►  events
        │
        ▼
{ data, error } ──► lança erro ou retorna dados ──► View atualiza o calendário
```

### Categorias

```
categoryView.js
        │  getCategories / createCategory / updateCategory / deleteCategory
        ▼
categoryService.js  (valida duplicidade e uso em eventos antes de deletar)
        │
        ▼
supabase.from("categories")  +  supabase.from("events") (checagem de uso)
        │
        ▼
PostgreSQL (RLS por user_id)  ──►  { data, error }  ──►  View
```

### Perfil

```
accountView.js
        │  getProfile / upsertProfile
        ▼
profileService.js  ──currentUserId()──►  supabase.auth
        │
        ▼
supabase.from("profiles")  ──►  PostgreSQL (RLS por id = auth.uid())
        │
        ▼
{ data, error }  ──►  View exibe/edita formulário de perfil
```

### Avatar

```
accountView.js (input file)
        │  uploadAvatar(file) / removeAvatar()
        ▼
avatarService.js  (valida MIME e tamanho localmente, sem chamar a rede se inválido)
        │
        ▼
supabase.storage.from("avatars")  ──►  Storage (RLS por pasta {user_id}/...)
        │
        ▼
getPublicUrl()  ──►  URL pública + cache-busting  ──►  View atualiza <img>
```

### Calendário Acadêmico

```
academicCalendarView.js / academicCalendarEventsView.js / academicCalendarICSView.js
        │  getCalendars / createCalendar / getAcademicEventsByRange / bulkInsertAcademicEvents
        ▼
academicCalendarService.js
        │
        ▼
supabase.from("academic_calendars")  +  supabase.from("academic_events")
        │
        ▼
PostgreSQL (RLS de academic_events via EXISTS em academic_calendars.user_id)
        │
        ▼
{ data, error }  ──►  expandAcademicEvents() (local)  ──►  View renderiza no calendário
```

### IA

```
aiPanelView.js
        │  getWeeklySummary / getStudySuggestion / getScheduleAnalysis
        ▼
aiService.js  ──►  prompts/*.js (monta payload local, expande recorrência)
        │
        ▼
providers/geminiProvider.js  ──JWT + payload──►  Edge Function "ai-chat"
        │                                              │
        │                                              ▼
        │                                     valida JWT, monta prompt,
        │                                     chama Gemini API (GEMINI_API_KEY)
        ▼
parseResponse()  ◄── { text, ms } ──────────────────────┘
        │
        ▼
View exibe o texto formatado (ou mensagem de erro da AIError)
```

### Push

```
accountView.js / configurações de notificação
        │  subscribeToPush() / unsubscribeFromPush() / syncPushSubscription()
        ▼
pushService.js  ──►  Service Worker (PushManager.subscribe)
        │
        ▼
supabase.from("push_subscriptions")  ──upsert──►  PostgreSQL (RLS por user_id)


                    (processo independente, agendado)
Supabase Scheduler / pg_cron (a cada minuto)
        │  Authorization: Bearer <service_role key>
        ▼
Edge Function "send-push-notifications"
        │  lê events + push_subscriptions com service_role (bypassa RLS)
        │  usa expandEvent() (recurrence-core.js) para achar ocorrências de hoje
        ▼
web-push  ──►  navegador do usuário (Service Worker exibe a notificação)
        │
        ▼
notification_logs (upsert)  ──►  evita reenviar a mesma ocorrência
```

---

## Autenticação

Toda autenticação é delegada ao **Supabase Auth (GoTrue)**, acessado via `supabase.auth` (`auth.js`).

- **JWT:** ao logar (`signInWithPassword`) ou cadastrar (`signUp`), o Supabase Auth emite um JWT de acesso (`access_token`) e um `refresh_token`. O SDK `@supabase/supabase-js` guarda ambos automaticamente (localStorage) e os disponibiliza via `supabase.auth.getSession()`.
- **Authorization / Bearer:** toda chamada feita através do SDK (`.from()`, `.storage`, `.functions.invoke()`) anexa automaticamente o header `Authorization: Bearer <access_token>` da sessão atual. As duas Edge Functions chamadas por usuários finais (`ai-chat`, `delete-account`) dependem inteiramente desse header para identificar quem fez a chamada — não recebem `user_id` no payload.
- **`currentUserId()` (`supabase.js`):** helper usado por praticamente todo Service de domínio. Lê `supabase.auth.getSession()`, extrai `data.session?.user?.id` e lança `Error("Usuário não autenticado.")` se não houver sessão — nenhuma query de domínio é disparada sem um `user_id` válido resolvido no frontend (a autorização real, porém, é sempre imposta pela RLS no banco, não por essa checagem no cliente).
- **Sessão:** persistida pelo SDK; `onAuthStateChange` (`auth.js`) expõe os eventos `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`, `TOKEN_REFRESHED` para a aplicação reagir (ex.: recarregar dados no login, limpar estado no logout).
- **Refresh:** renovação de token é feita automaticamente pelo SDK em background; a aplicação não implementa lógica própria de refresh. O evento `TOKEN_REFRESHED` apenas notifica que ocorreu.
- **Redefinição de senha / confirmação de e-mail:** `sendPasswordReset` e `signUp` usam `emailRedirectTo`/`redirectTo` apontando para `APP_URL` (`config.js`), garantindo que o link do e-mail volte para o ambiente correto (local ou produção).
- **Edge Function `send-push-notifications`** é a única parte do sistema que **não** usa o JWT de um usuário final — ela é autenticada com a `service_role key`, que tem acesso irrestrito (bypassa RLS), e só deve ser invocada pelo agendador (cron), nunca pelo frontend.

---

## Tratamento de Erros

Toda chamada Supabase segue o padrão `const { data, error } = await ...; if (error) throw error;` — não há supressão silenciosa de erro nos Services de domínio (exceto os dois casos documentados: `PGRST116` em `getProfile`, e `PGRST301`/`PGRST116` no ping de `diagnosticService`).

| Origem | Exemplos de erro | Como chega ao frontend |
|---|---|---|
| **Supabase (PostgREST/Postgres)** | `23505` (unique violation), `PGRST116` (nenhuma linha em `.single()`), violação de `CHECK`/FK | Objeto de erro nativo do Supabase, relançado pelo Service. Alguns Services traduzem para mensagem amigável (`categoryService`: `23505` → "Já existe uma categoria com esse nome."). |
| **HTTP genérico** | Falha de rede, `fetch` recusado, offline | Exceção `TypeError`/`NetworkError` do navegador, capturada e categorizada por `errorService.js` (`categorize()` reconhece `failed to fetch`, `networkerror`, `net::`). |
| **Edge Functions** | Respostas `400/401/403/429/502/503/500` com corpo `{ error: string }` | Em `aiService`, `geminiProvider.js` mapeia cada status para uma `AIError` tipada (`AUTH`, `RATE_LIMIT`, `UNAVAILABLE`, `API_ERROR`, `EMPTY_RESPONSE`); em `delete-account`, `accountView.js` lê `error.message` retornado por `supabase.functions.invoke()`. |
| **Timeout** | Requisição à Edge Function `ai-chat` demora mais que `AI_CONFIG.timeout` (30s) | `AbortController` cancela o `fetch`; `geminiProvider.js` captura `AbortError` e lança `AIError('...excedeu o tempo limite...', 'TIMEOUT')`. |
| **Erros da IA** | Qualquer falha do pipeline de IA (auth, rede, timeout, rate limit, indisponibilidade, resposta vazia, erro genérico da API) | Sempre convertidos para a classe `AIError` (`code` + `message` em português), nunca vaza o erro cru do Gemini para a UI. |

**Camada final (`errorService.js`):** funciona como um handler global (`window.onerror`, `unhandledrejection`) e também pode ser chamado explicitamente. Ele:
1. Categoriza o erro (`auth`, `network`, `database`, `ai`, `push`, `service_worker`, `ui`, `unknown`) — a maioria por palavras-chave na mensagem/código, exceto `AIError` (ver acima), reconhecida pelo nome da classe independentemente do texto.
2. Gera uma mensagem amigável em português (`friendlyMessage`) — nunca expõe stack trace ou mensagem técnica ao usuário final; para `AIError`, preserva a mensagem específica por código já gerada em `geminiProvider.js`.
3. Registra um log em memória (`getRecentErrors()`, até 100 entradas) e envia telemetria (`track(EVENTS.ERROR, ...)`), exceto para erros de categoria `ui`.
4. Exibe um toast de erro (`showToast`), a menos que o contexto marque `silent: true` ou a categoria seja `auth` (erros de auth normalmente já são tratados de forma específica pela View que fez a chamada).

Erros de autenticação (`AUTH`/`PGRST301`/mensagens contendo `jwt`/`session`) tipicamente indicam sessão expirada — a UI deve reagir redirecionando para o login, não apenas exibindo o toast.

---

## Segurança

| Camada | Mecanismo | O que protege |
|---|---|---|
| **RLS (Row Level Security)** | Habilitado em todas as tabelas de domínio (`events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`). Policies comparam `user_id`/`id` com `auth.uid()`; `academic_events` usa `EXISTS` contra `academic_calendars.user_id` (não tem coluna própria de usuário). | Garante que, mesmo que um Service tenha um bug e esqueça de filtrar por usuário, o Postgres nunca retorna nem aceita linhas de outro usuário. É a linha de defesa real — as checagens de `user_id` feitas nos Services são defesa em profundidade, não a autorização primária. |
| **JWT** | Emitido pelo Supabase Auth, validado automaticamente pelo PostgREST/Storage/Edge Functions a cada requisição. `auth.uid()` dentro das policies de RLS é extraído diretamente do JWT. | Garante que uma requisição só é processada em nome de um usuário autenticado e que `user_id` não pode ser forjado pelo cliente. |
| **Secrets** | `SUPABASE_ANON_KEY` é pública por design (usada no frontend, protegida por RLS). `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e as chaves `VAPID_*` privadas existem **somente** como variáveis de ambiente das Edge Functions — nunca chegam ao navegador. `config.js` (com a anon key) é gerado em CI/build e está no `.gitignore`. | Evita que chaves privilegiadas (que bypassam RLS ou dão acesso a APIs de terceiros pagas) sejam expostas no bundle do frontend. |
| **Storage** | Bucket `avatars` é público para leitura (necessário para exibir a foto sem autenticação em `<img>`), mas INSERT/UPDATE/DELETE são restritos por policy a `auth.uid()::text = (storage.foldername(name))[1]` — ou seja, cada usuário só grava dentro da própria pasta. | Impede que um usuário sobrescreva ou apague o avatar de outro, mesmo com leitura pública liberada. |
| **Edge Functions** | `ai-chat` e `delete-account` exigem `Authorization: Bearer <jwt>` e validam o usuário via `auth.getUser()` antes de qualquer efeito colateral; usam a `service_role key` apenas internamente, nunca a repassam ao cliente. `send-push-notifications` não aceita chamadas de usuário final — depende de o operador manter o cron/segredo protegido. | Mantém operações privilegiadas (excluir conta, chamar API paga de IA, enviar push em massa) fora do alcance direto do navegador, com validação de identidade centralizada em cada função. |

---

## Dependências

Matriz Service → Supabase → Tabela/Recurso → Edge Function → Resposta:

| Service | Recurso Supabase | Tabela/Bucket | Edge Function | Resposta |
|---|---|---|---|---|
| `eventService` | PostgREST | `events` | — | linha(s) de `events` ou `void` |
| `categoryService` | PostgREST | `categories` (+ leitura de `events` para checar uso) | — | linha(s) de `categories` ou `void` |
| `profileService` | PostgREST | `profiles` | — | linha de `profiles` |
| `avatarService` | Storage | bucket `avatars` | — | URL pública ou `void` |
| `academicCalendarService` | PostgREST | `academic_calendars`, `academic_events` | — | linha(s) das tabelas ou `void` |
| `notificationService` | — (Web Notifications API + `localStorage`) | — | — | `void` (efeito colateral: notificação exibida) |
| `pushService` | PostgREST | `push_subscriptions` | — | `void` (efeito colateral: subscription criada/removida) |
| `aiService` | Edge Function via `fetch` autenticado | — | `ai-chat` | `{ text, ms }` → string tratada |
| `auth` | Auth (GoTrue) | `auth.users` (indireto) | — | sessão / usuário |
| `diagnosticService` | PostgREST + Auth | `events` (ping) | — | objeto de diagnóstico |
| `accountView` (chamada direta) | Edge Function via SDK | — (efeitos em várias tabelas + Storage + `auth.users`) | `delete-account` | `{ success: true }` |
| *(sistema/cron, sem Service dedicado)* | Edge Function agendada | `events`, `push_subscriptions`, `notification_logs` | `send-push-notifications` | `{ sent, failed, skipped, timestamp }` |

---

## Auditoria

Verificação feita durante a elaboração deste documento (nenhuma alteração de código foi realizada):

- ✅ Todos os Services listados no escopo da tarefa foram lidos e documentados: `eventService`, `categoryService`, `profileService`, `avatarService`, `academicCalendarService`, `notificationService`, `aiService`.
- ✅ Services adicionais encontrados por análise de dependências também foram documentados para completude da comunicação Frontend ↔ Supabase: `pushService`, `auth`, `diagnosticService`.
- ✅ Todas as três Edge Functions (`ai-chat`, `send-push-notifications`, `delete-account`) foram lidas por completo e documentadas (endpoint, autenticação, payload, resposta, erros).
- ✅ Todas as chamadas a `supabase.from(...)`, `supabase.storage`, `supabase.auth` e `supabase.functions.invoke(...)` fora dos Services também foram localizadas (apenas `accountView.js`, para `delete-account` e `signOut`).

Inconsistências e pontos de atenção observados (apenas documentados, não corrigidos):

- **Autorização inconsistente em `academic_events`:** diferente de todas as outras tabelas de domínio, `academic_events` não tem coluna `user_id` própria — a autorização depende inteiramente de RLS via `EXISTS` contra `academic_calendars`. Os Services (`createAcademicEvent`, `updateAcademicEvent`, `deleteAcademicEvent`) não fazem nenhuma checagem adicional de posse no cliente (diferente de `eventService`/`categoryService`, que sempre filtram por `user_id` na query), confiando 100% na RLS.
- **Dois padrões de chamada de Edge Function:** `aiService`/`geminiProvider` monta a URL manualmente e usa `fetch` com `Authorization` explícito; `accountView.js` usa `supabase.functions.invoke(...)`, que resolve a URL e o header automaticamente. Ambos funcionam, mas não há um padrão único documentado no código para "como chamar uma Edge Function" — um novo desenvolvedor pode replicar qualquer um dos dois estilos.
- **`delete-account` não limpa todas as tabelas explicitamente:** a função apaga manualmente `notification_logs`, `push_subscriptions`, `events` e `categories`, mas depende do `ON DELETE CASCADE` de `auth.users` para remover `profiles`, `academic_calendars` (e, em cascata, `academic_events`) e `ai_metrics`. Isso funciona corretamente hoje (todas as FKs relevantes têm `ON DELETE CASCADE`), mas o comportamento não é auto-evidente lendo apenas o código da função.
- **`notificationService` (lembrete local) e `send-push-notifications` (push remoto) duplicam a lógica de "quando disparar o lembrete"** de forma independente — uma em `recurrence.js`/`notificationService.js` (frontend), outra em `recurrence-core.js` (compartilhado com a Edge Function). Ambas usam a mesma função `expandEvent` de `recurrence-core.js`/`recurrence.js`, mas os dois mecanismos operam de forma totalmente desacoplada (um por `setTimeout` no navegador, outro por cron no servidor) e podem, em tese, notificar o mesmo evento duas vezes se a aba estiver aberta e o push também estiver ativo.
- **Contratos por lo demais consistentes:** todos os Services de domínio seguem o mesmo padrão `{ data, error } → throw error → return data`, a mesma convenção de nomes (`getX`/`createX`/`updateX`/`deleteX`) e o mesmo uso de `currentUserId()`. As três Edge Functions seguem o mesmo padrão de CORS, resposta JSON e tratamento de `OPTIONS`.

---

## Estado Atual

- **Services documentados:** 10 (`eventService`, `categoryService`, `profileService`, `avatarService`, `academicCalendarService`, `notificationService`, `pushService`, `aiService`, `auth`, `diagnosticService`).
- **Edge Functions documentadas:** 3 (`ai-chat`, `send-push-notifications`, `delete-account`).
- **Integrações externas:** 2 (Google Gemini API, via `ai-chat`; protocolo Web Push, via `send-push-notifications` com `web-push`/VAPID).
- **Tabelas do domínio expostas via API:** 8 (`events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`) + 1 bucket de Storage (`avatars`).
- **Fluxo oficial da aplicação:** Views chamam Services → Services resolvem `user_id` da sessão e chamam o Supabase Client → PostgREST/Storage/Edge Functions aplicam autenticação (JWT) e autorização (RLS) → PostgreSQL (ou runtime Deno) executa a operação → resposta `{ data, error }` retorna pela mesma cadeia → Services lançam exceção em caso de erro → Views exibem o resultado ou delegam o erro a `errorService.js`.
- **Avaliação geral da camada de comunicação:** a arquitetura é enxuta e consistente — não há um backend próprio, a maior parte do CRUD é feita diretamente pelo frontend contra o Supabase com RLS como única linha de autorização, e apenas as três operações que exigem segredo ou privilégio elevado (chamar Gemini, enviar push em massa, excluir conta com `service_role`) passam por Edge Function. O padrão de retorno (`{ data, error }` → exceção) é seguido de forma uniforme por todos os Services, o que facilita auditoria e manutenção. Os pontos de atenção listados na seção de Auditoria são de baixo risco prático (a RLS cobre a lacuna de autorização em `academic_events`; a duplicação de lógica de lembrete é redundância, não inconsistência funcional), mas valem observação para evolução futura da base de código.
