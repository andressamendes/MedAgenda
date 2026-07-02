# Backend MedAgenda

> Documentação oficial da arquitetura Backend do MedAgenda. Reflete o estado atual do código em `supabase/`, `sql/` e dos serviços do frontend que consomem o backend. Para o detalhamento completo do schema (tabelas, colunas, triggers, RLS) veja [`DATABASE.md`](./DATABASE.md); este documento foca na arquitetura, nos fluxos e na integração entre as peças.

---

## Visão Geral

O MedAgenda não possui um servidor de aplicação próprio. Todo o backend é fornecido por uma plataforma **Backend-as-a-Service (BaaS)**: o **Supabase**. O frontend (HTML/CSS/JS estático, publicado no GitHub Pages) se comunica diretamente com o Supabase através do SDK `@supabase/supabase-js`, sem passar por um backend intermediário controlado pela equipe.

O Supabase fornece quatro serviços usados pelo projeto:

- **PostgreSQL** — banco de dados relacional gerenciado, contendo todas as tabelas de domínio (`events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`).
- **Auth** — gerencia usuários, sessões, tokens JWT, cadastro, login, recuperação de senha e confirmação de e-mail.
- **Storage** — armazena arquivos binários (avatares de perfil) em buckets, com políticas de acesso próprias.
- **Edge Functions** — funções serverless (Deno) usadas para as poucas operações que exigem lógica de servidor, credenciais secretas ou privilégios elevados que não podem residir no navegador.

Complementando o Supabase, o backend integra o **Google Gemini API** (via Edge Function) para o assistente de IA, e o protocolo **Web Push** (via Edge Function agendada) para notificações.

### Por que essa arquitetura

- **Sem servidor para manter:** o projeto é mantido por poucos desenvolvedores; um BaaS elimina a necessidade de operar, escalar e corrigir um backend HTTP tradicional.
- **RLS como camada de autorização:** ao invés de escrever middleware de autorização em cada endpoint, as regras de acesso ficam declaradas no próprio banco (Row Level Security), reduzindo a superfície de bugs de segurança e mantendo a lógica de "quem pode ver o quê" em um único lugar.
- **Frontend fala diretamente com o banco:** para CRUD simples (eventos, categorias, perfil, calendário acadêmico), o frontend usa o SDK do Supabase diretamente — sem round-trip por um backend próprio — o que simplifica o código e reduz latência.
- **Edge Functions apenas onde necessário:** a lógica que exige segredos (chave do Gemini, chaves VAPID, `service_role`) ou que precisa rodar de forma agendada/privilegiada é isolada em três Edge Functions pequenas e de responsabilidade única, mantendo o restante da aplicação simples.

---

## Arquitetura Geral

```
Frontend (GitHub Pages · HTML/CSS/JS + @supabase/supabase-js)
        │
        ▼
   Supabase Project
        │
        ├── Auth ──────────────── usuários, JWT, sessão, e-mail
        │
        ├── PostgreSQL ─────────── events, categories, profiles,
        │                          push_subscriptions, notification_logs,
        │                          academic_calendars, academic_events,
        │                          ai_metrics  (todas com RLS)
        │
        ├── Storage ─────────────  bucket "avatars"
        │
        └── Edge Functions (Deno) ─┬── ai-chat
                                    ├── send-push-notifications
                                    └── delete-account
                                            │
                                            ▼
                              Google Gemini API   (somente ai-chat)
                              Web Push (navegadores)  (somente send-push-notifications)
```

### Componentes

- **Frontend:** aplicação estática (`index.html` + módulos ES `*.js`), sem build step obrigatório, publicada via GitHub Pages. É o único cliente do backend.
- **Auth:** valida credenciais, emite/renova JWT, dispara e-mails transacionais (confirmação, redefinição de senha).
- **PostgreSQL:** fonte única de verdade dos dados de domínio. Todo acesso passa por RLS baseada em `auth.uid()`.
- **Storage:** guarda os arquivos de avatar dos usuários em um bucket público, com políticas por pasta (`{user_id}/...`).
- **Edge Functions:** três funções Deno hospedadas pelo Supabase, cada uma com um único propósito (IA, notificações agendadas, exclusão de conta).
- **Google Gemini API:** serviço externo de IA generativa, chamado exclusivamente pela função `ai-chat` — nunca pelo navegador diretamente.

---

## Organização da Pasta Supabase

```
supabase/
└── functions/
    ├── _shared/
    │   └── recurrence-core.js       # lógica de recorrência compartilhada
    ├── ai-chat/
    │   └── index.ts                 # Edge Function do assistente de IA
    ├── send-push-notifications/
    │   └── index.ts                 # Edge Function de notificações agendadas
    └── delete-account/
        └── index.ts                 # Edge Function de exclusão de conta
```

- **`supabase/functions/`** — contém todo o código de servidor do projeto. Não existe pasta `supabase/migrations/` gerenciada pela CLI do Supabase neste repositório; as migrations SQL vivem em `/sql` na raiz (ver abaixo), aplicadas manualmente pelo SQL Editor do Supabase Dashboard.
- **`supabase/functions/_shared/recurrence-core.js`** — módulo ES puro, sem dependências externas, que implementa o algoritmo canônico de expansão de eventos recorrentes. É importado tanto pelo frontend (`recurrence.js`) quanto pela Edge Function `send-push-notifications`, garantindo que a mesma lógica de "este evento ocorre nesta data?" seja usada em ambos os lados — evitando divergência entre o que o usuário vê no calendário e o que dispara a notificação.
- **`supabase/functions/ai-chat/`** — única função que fala com um serviço externo (Gemini). Roda sob o JWT do próprio usuário (não usa `service_role`).
- **`supabase/functions/send-push-notifications/`** — única função agendada (cron). Roda sob `service_role` porque precisa ler dados de todos os usuários, não apenas do chamador.
- **`supabase/functions/delete-account/`** — função crítica de exclusão de conta. Valida o JWT do usuário para identificar quem está sendo excluído, mas usa `service_role` para de fato apagar registros e o usuário de `auth.users`.
- **`/sql`** (raiz do projeto) — migrations numeradas (`01_events.sql` a `08_ai_metrics.sql`), cada uma autocontida e documentando suas dependências no cabeçalho. Não fazem parte da pasta `supabase/` porque o projeto não usa `supabase db push`/CLI de migrations — são aplicadas manualmente. Ver seção "Banco de Dados" e `DATABASE.md`.

---

## Edge Functions

O projeto possui **3 Edge Functions**, todas em Deno, todas com resposta em JSON. `delete-account` e `send-push-notifications` têm CORS liberado (`Access-Control-Allow-Origin: *`); `ai-chat` restringe a origem a uma allowlist (produção + localhost/127.0.0.1 para desenvolvimento local) — ver `SECURITY.md`.

### ai-chat

**Objetivo:** gerar respostas de IA (resumo semanal, sugestão de estudo, análise de agenda) a partir dos eventos do usuário, usando o Google Gemini, sem expor a chave de API ao navegador.

**Responsabilidade:** validar o usuário autenticado, montar o prompt em português a partir dos eventos recebidos, chamar a API do Gemini e devolver o texto gerado.

**Fluxo:**

```
Frontend (geminiProvider.js)
   │  POST /functions/v1/ai-chat
   │  Authorization: Bearer <access_token>
   │  body: { type, events[], weekStart/rangeStart, ... }
   ▼
Edge Function ai-chat
   │  1. valida header Authorization
   │  2. lê secrets (SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY)
   │  3. supabase.auth.getUser() com o JWT do chamador
   │  4. valida body (type, events, limite de 500 eventos)
   │  5. monta o prompt (weekly_summary | study_suggestion | schedule_analysis)
   │  6. POST para GEMINI_API/{model}:generateContent?key=...
   ▼
Google Gemini API
   │  gera texto (modelo padrão: gemini-2.5-flash)
   ▼
Edge Function ai-chat
   │  extrai candidates[0].content.parts[0].text
   ▼
Resposta JSON { text, ms } para o Frontend
```

- **Entradas:** JSON `{ type: 'weekly_summary' | 'study_suggestion' | 'schedule_analysis', events: EventItem[], weekStart?, weekEnd?, rangeStart?, rangeEnd?, model?, temperature?, maxTokens? }`. `model`, `temperature` e `maxTokens` são opcionais e sobrescritos pelo `config/ai.js` do frontend antes do envio.
- **Saídas:** `{ text: string, ms: number }` em caso de sucesso; `{ error: string }` com status HTTP apropriado em caso de falha.
- **Autenticação:** exige header `Authorization: Bearer <JWT>`. O JWT é o `access_token` da sessão Supabase do usuário logado — a função cria um client Supabase com esse header e chama `auth.getUser()` para validar a sessão antes de processar qualquer coisa.
- **Validação do usuário:** se o header estiver ausente, mal formado, ou `auth.getUser()` falhar/retornar vazio, a função responde `401` sem chamar o Gemini.
- **Leitura do secret `GEMINI_API_KEY`:** lido via `Deno.env.get("GEMINI_API_KEY")`, configurado como secret do projeto Supabase (nunca commitado). Se ausente, a função responde `503` imediatamente, sem tentar autenticar o usuário primeiro na sequência de execução ele é checado logo após ler os secrets — ou seja, falha rápido antes de qualquer chamada externa.
- **Construção do prompt:** três funções puras (`buildWeeklySummaryPrompt`, `buildStudySuggestionPrompt`, `buildScheduleAnalysisPrompt`) formatam os eventos recebidos em texto e compõem um prompt em português, instruindo o Gemini a responder de forma objetiva e com limite de palavras.
- **Chamada ao Gemini:** `POST {GEMINI_API}/{model}:generateContent?key={GEMINI_API_KEY}`, com `contents`, `generationConfig.temperature` e `generationConfig.maxOutputTokens`.
- **Tratamento de erros:**
  - corpo JSON inválido → `400`
  - `type` fora de `['weekly_summary','study_suggestion','schedule_analysis']` → `400`
  - `events` não é array, ou tem mais de 500 itens → `400`
  - Gemini retorna `429` → repassado como `429` (rate limit)
  - Gemini retorna `401`/`403` → repassado como `503` (erro de autenticação com o provedor, não do usuário final)
  - Gemini retorna outro erro HTTP → `502`
  - Gemini retorna corpo sem texto → `502`
  - qualquer exceção não tratada → `500`, com log do tipo de prompt e tempo decorrido
- **Integrações externas:** Google Gemini API (`generativelanguage.googleapis.com`). Nenhuma outra dependência externa.
- **Observação:** a função registra `console.log`/`console.error` com tipo de prompt, usuário, status HTTP e latência — mas não persiste nada na tabela `ai_metrics` (ver seção "Auditoria Arquitetural").

---

### send-push-notifications

**Objetivo:** disparar notificações Web Push para lembretes de eventos (incluindo eventos recorrentes) no horário configurado por cada usuário.

**Como identifica eventos:** busca em `public.events` todos os registros com `reminder_minutes IS NOT NULL` (independente do usuário — a função roda com `service_role` e não é escopada a um único chamador).

**Como calcula recorrência:** para cada evento, chama `expandEvent(event, todayStr, todayStr)` (de `_shared/recurrence-core.js`) passando a data de hoje como início e fim do intervalo. Se o evento for uma ocorrência válida hoje (considerando `recurrence_type`, `recurrence_interval`, `recurrence_until`, `recurrence_days_of_week`), a função retorna um array com uma ocorrência; caso contrário, um array vazio — e o evento é pulado. Essa é a mesma lógica usada pelo frontend para desenhar o calendário, garantindo consistência.

**Cálculo do horário de disparo:** combina `start_time` do evento com `reminder_minutes` para obter `fireTime = eventTime - reminder_minutes`. Como o cron roda a cada minuto, a função processa o lembrete apenas se `now` estiver dentro de uma janela de 5 minutos após `fireTime` (`0 <= diffMs <= 5min`), tolerando pequenos atrasos de execução do cron sem duplicar envios fora da janela.

**Como encontra assinaturas Push:** para cada ocorrência elegível, consulta `push_subscriptions` filtrando por `user_id`, retornando todas as assinaturas do usuário (múltiplos dispositivos/navegadores).

**Como envia notificações:** usa a biblioteca `web-push` (`npm:web-push`), configurada com as chaves VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), enviando um payload JSON (`title`, `body`, `tag`, `data.eventId/eventDate/url`) para cada `endpoint` assinado, com TTL de 1 hora.

**Como evita duplicação:** antes de enviar, verifica se já existe uma linha em `notification_logs` para a combinação `(user_id, event_id, event_date)`; se existir, pula o evento (`skipped`). Após o envio (sucesso ou falha), grava um `upsert` em `notification_logs` com `onConflict: "user_id,event_id,event_date"`, o que também é reforçado por um índice único no banco (`notification_logs_dedup`) — duas camadas de proteção contra envio duplicado da mesma ocorrência.

**Registro de logs:** cada tentativa de envio (por ocorrência de evento, não por assinatura individual) resulta em uma linha em `notification_logs` com `status: 'sent' | 'failed'` e, em caso de falha total, uma mensagem de erro. A resposta HTTP final também retorna um resumo agregado `{ sent, failed, skipped, timestamp }` com as contagens de toda a execução (por assinatura individual, não por evento).

**Tratamento de falhas:**
- Falha ao enviar para uma assinatura específica com status `410` (Gone) ou `404` (Not Found) → a assinatura é considerada revogada e removida de `push_subscriptions` automaticamente.
- Outras falhas de envio → apenas contabilizadas e logadas via `console.error`, sem remover a assinatura.
- Erro ao consultar `events` → propagado (`throw`), interrompendo toda a execução com resposta `500`.
- Exceção não tratada em qualquer ponto → capturada no `try/catch` externo, resposta `500` com `{ error: err.message }`.

**Como é executada:** não é chamada pelo frontend. É agendada para rodar a cada minuto (`* * * * *`), configurada via **Supabase Dashboard → Edge Functions → Schedule** (opção recomendada, documentada no cabeçalho de `sql/04_push_notifications.sql`) ou, alternativamente, via `pg_cron` + `pg_net` chamando a função por HTTP com a `service_role` key.

**Autenticação:** roda com `SUPABASE_SERVICE_ROLE_KEY`, contornando RLS deliberadamente — é a única forma de a função ler eventos e assinaturas de todos os usuários. Não há validação de JWT de chamador porque não é invocada por um usuário final; é invocada pelo agendador do Supabase.

---

### delete-account

**Objetivo:** excluir permanentemente a conta do usuário autenticado e todos os dados associados, de forma atômica do ponto de vista do usuário (uma única chamada).

**Responsabilidade:** apagar, na ordem correta (respeitando FKs), os dados do usuário nas tabelas de domínio, remover os arquivos de avatar do Storage e por fim excluir o usuário em `auth.users`.

**Fluxo:**

```
Frontend (accountView.js)
   │  supabase.functions.invoke('delete-account')
   │  Authorization: Bearer <access_token>  (injetado automaticamente pelo SDK)
   ▼
Edge Function delete-account
   │  1. valida Authorization header
   │  2. cria client com o JWT do usuário → auth.getUser() identifica quem chama
   │  3. cria client admin (service_role)
   │  4. deleta: notification_logs, push_subscriptions, events, categories (por user_id)
   │  5. lista e remove arquivos em storage "avatars/{user_id}/*"
   │  6. admin.auth.admin.deleteUser(userId)
   │     → cascade FK remove profiles automaticamente
   ▼
Resposta { success: true } para o Frontend
   ▼
Frontend chama signOut() e redireciona
```

- **Entradas:** nenhum corpo — apenas o header `Authorization`.
- **Saídas:** `{ success: true }` ou `{ error: string }`.
- **Autenticação:** dupla identidade de client — um client com o JWT do usuário (`userClient`) apenas para descobrir *quem* está pedindo a exclusão via `auth.getUser()`, e um client `admin` com `service_role` para de fato executar as exclusões privilegiadas (incluindo `auth.admin.deleteUser`, que não pode ser feito com uma chave anônima).
- **Dependências:** tabelas `notification_logs`, `push_subscriptions`, `events`, `categories`; bucket `avatars`; `auth.users`. Não deleta `academic_calendars`/`academic_events` explicitamente — eles são removidos via `ON DELETE CASCADE` a partir de `auth.users` (ver observação na "Auditoria Arquitetural").
- **Tratamento de erros:** ausência/invalidade do JWT → `401`; falha ao deletar o usuário em `auth.admin.deleteUser` → `500` com a mensagem de erro; qualquer exceção não tratada → `500` com `String(err)`.
- **Integrações externas:** nenhuma — apenas Supabase (Auth, Postgres, Storage).
- **Observação:** diferente das outras duas funções, importa o SDK via `esm.sh` e usa `serve` de `deno.land/std` em vez de `Deno.serve` nativo — inconsistência estilística menor entre as três funções (ver "Auditoria Arquitetural").

---

## Autenticação

A autenticação é inteiramente delegada ao **Supabase Auth**; não há tabela de usuários própria além de `auth.users` (gerenciada pelo Supabase) e `profiles` (dados de perfil estendidos, 1:1 com `auth.users`).

- **Login:** `auth.js` → `signIn(email, password)` chama `supabase.auth.signInWithPassword`. Em caso de sucesso, o SDK armazena a sessão (JWT + refresh token) no `localStorage` do navegador.
- **Cadastro:** `signUp(email, password, fullName)` chama `supabase.auth.signUp`, passando `full_name` em `options.data` (metadata do usuário) e `emailRedirectTo: APP_URL`. Um trigger no banco (`on_auth_user_created`, em `sql/05_profiles.sql`) cria automaticamente a linha correspondente em `public.profiles` assim que o usuário é inserido em `auth.users`.
- **JWT:** o Supabase emite um JWT assinado (access token) a cada login/refresh, contendo `sub` (= `user.id`), tempo de expiração e claims padrão. Esse token é o mecanismo de identidade usado em toda a aplicação — tanto para RLS no Postgres (`auth.uid()`) quanto para autorizar chamadas às Edge Functions.
- **Sessão:** mantida pelo SDK `@supabase/supabase-js` no cliente. `getSession()` retorna a sessão atual (ou `null`). `onAuthStateChange` notifica a aplicação sobre `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`, `TOKEN_REFRESHED`.
- **Refresh:** feito automaticamente pelo SDK em segundo plano, usando o refresh token, antes do access token expirar — transparente para o restante do código.
- **Logout:** `signOut()` chama `supabase.auth.signOut()`, invalidando a sessão local e (dependendo da configuração) o refresh token no servidor.
- **Reset de senha:** `sendPasswordReset(email)` chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL })`, que dispara um e-mail transacional do Supabase com link de redefinição. `updatePassword(newPassword)` chama `supabase.auth.updateUser({ password })` já dentro da sessão de recuperação.
- **Confirmação de e-mail:** disparada automaticamente pelo Supabase Auth no cadastro (`signUp`), usando `emailRedirectTo` para direcionar o usuário de volta ao `APP_URL` correto após confirmar.
- **Proteção das Edge Functions:** as três funções (`ai-chat`, `send-push-notifications`, `delete-account`) exigem/usam autenticação, mas de formas diferentes:
  - `ai-chat` e `delete-account` exigem o header `Authorization: Bearer <JWT do usuário>` e chamam `supabase.auth.getUser()` (usando `SUPABASE_ANON_KEY` + esse JWT) para validar a sessão antes de processar qualquer coisa — se inválido, respondem `401` imediatamente.
  - `send-push-notifications` não recebe/valida um JWT de usuário porque é acionada pelo agendador do Supabase, não por um cliente final; ela usa `SUPABASE_SERVICE_ROLE_KEY` diretamente para operar sobre todos os usuários.
- **Como o JWT é validado:** a validação não é feita "manualmente" (decodificando/verificando assinatura na função) — é delegada ao próprio SDK do Supabase (`auth.getUser()`), que consulta o serviço de Auth do projeto para confirmar que o token é válido, não expirou e corresponde a um usuário real. Isso garante que a mesma lógica de validação usada pelo Postgres/RLS (`auth.uid()`) seja a fonte de verdade também nas Edge Functions.

---

## Banco de Dados

O banco é um **PostgreSQL** gerenciado pelo Supabase, com 8 tabelas de domínio (`events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`), todas com **RLS habilitado** e políticas baseadas em `auth.uid()` (diretamente ou via `EXISTS` para tabelas filhas como `academic_events`). Há uma função e trigger compartilhados (`update_updated_at`) para manter `updated_at` sincronizado, e índices compostos para as consultas mais frequentes (por `user_id` + data).

As migrations SQL ficam em `/sql`, numeradas e aplicadas manualmente no SQL Editor do Supabase (não há uso da CLI de migrations do Supabase neste projeto).

Para o detalhamento completo de cada tabela, coluna, constraint, trigger, índice e política RLS, consulte **[`DATABASE.md`](./DATABASE.md)** — este documento não duplica esse conteúdo.

---

## Storage

**Buckets existentes:** um único bucket, **`avatars`**, criado manualmente no Supabase Dashboard (Storage → New Bucket → público), com políticas definidas em `sql/06_storage.sql`.

**Uploads (avatares):** `avatarService.js` implementa `uploadAvatar(file)`:
- valida tipo MIME (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) e tamanho máximo (2 MB) no frontend antes de enviar;
- monta o caminho `{user_id}/avatar.{ext}`;
- faz `supabase.storage.from('avatars').upload(path, file, { upsert: true })`;
- obtém a URL pública com `getPublicUrl` e adiciona um cache-buster (`?v=timestamp`).

`removeAvatar()` lista os arquivos na pasta do usuário e os remove via `storage.from('avatars').remove(paths)`.

**Permissões / RLS do Storage:** políticas em `storage.objects` restritas ao bucket `avatars`, usando o primeiro segmento do caminho (`storage.foldername(name)[1]`) como identificador de dono:
- `avatars_insert_own` — só pode inserir se `auth.uid()::text = foldername[1]`.
- `avatars_update_own` — mesma regra, para `UPDATE`.
- `avatars_delete_own` — mesma regra, para `DELETE`.
- `avatars_select_public` — leitura liberada para qualquer requisição (`bucket_id = 'avatars'`), pois o bucket é público e as URLs de avatar precisam funcionar sem autenticação (ex.: exibidas em `<img>`).

**Fluxo:**

```
Frontend (accountView.js)
   │  arquivo selecionado pelo usuário
   ▼
avatarService.uploadAvatar()
   │  valida tipo/tamanho
   │  supabase.storage.from('avatars').upload({user_id}/avatar.ext)
   ▼
Storage (bucket avatars, RLS por pasta)
   │  storage.from('avatars').getPublicUrl(path)
   ▼
URL pública (https://.../storage/v1/object/public/avatars/{user_id}/avatar.ext?v=...)
   ▼
profileService.upsertProfile({ avatar_url: url })  →  tabela profiles
```

A exclusão de conta (`delete-account`) também remove os arquivos do usuário no bucket antes de excluir o usuário em `auth.users`.

---

## Comunicação Frontend ↔ Backend

O padrão geral, para CRUD de domínio, é:

```
View (ex: eventFormView.js)
   ↓
Service (ex: eventService.js)
   ↓
Supabase Client (supabase.js → @supabase/supabase-js)
   ↓
REST/PostgREST (auto-gerado pelo Supabase, com RLS aplicada)
   ↓
PostgreSQL
   ↓
Resposta (JSON) → Service devolve dados/erros → View atualiza a UI
```

Todos os serviços de domínio (`eventService.js`, `categoryService.js`, `profileService.js`, `academicCalendarService.js`) seguem exatamente esse padrão: chamam `supabase.from('tabela')...` diretamente, sem passar por nenhuma Edge Function, confiando inteiramente na RLS do Postgres para isolar os dados por usuário. Todos usam o helper `currentUserId()` (de `supabase.js`) para obter o `user_id` da sessão atual e incluí-lo explicitamente nos filtros/inserts (redundante com a RLS, mas explícito no código).

**Eventos:** `eventFormView.js` / `calendar.js` → `eventService.js` → `supabase.from('events')` → Postgres (RLS `user_id = auth.uid()`).

**Categorias:** `categoryView.js` → `categoryService.js` → `supabase.from('categories')` → Postgres.

**Perfil:** `accountView.js` → `profileService.js` → `supabase.from('profiles')` → Postgres.

**IA (fluxo diferente — passa por Edge Function):**

```
assistantView.js / aiPanelView.js
   ↓
services/ai/aiService.js  (AI Gateway do frontend)
   ↓
services/ai/providers/geminiProvider.js
   ↓
fetch POST {SUPABASE_URL}/functions/v1/ai-chat  (Authorization: Bearer JWT)
   ↓
Edge Function ai-chat
   ↓
Google Gemini API
   ↓
Edge Function ai-chat (parseia resposta)
   ↓
geminiProvider → aiService → parsers/responseParser.js → View
```

**Push (mistura Postgres direto + Edge Function agendada):**

```
accountView.js (toggle de notificações)
   ↓
pushService.js
   ↓
supabase.from('push_subscriptions').upsert(...)   ← grava a assinatura direto no Postgres
```

```
Supabase Scheduler (cron * * * * *)
   ↓
Edge Function send-push-notifications  (service_role — não passa pelo frontend)
   ↓
Postgres (events, push_subscriptions, notification_logs)
   ↓
Web Push API dos navegadores dos usuários
```

**Storage (avatar):** `accountView.js` → `avatarService.js` → `supabase.storage.from('avatars')` → Storage → URL pública → `profileService.upsertProfile({ avatar_url })` → Postgres.

**Exclusão de conta (Edge Function crítica):** `accountView.js` → `supabase.functions.invoke('delete-account')` → Edge Function `delete-account` (com `service_role`) → Postgres + Storage + `auth.admin.deleteUser` → `signOut()` no frontend.

---

## Segurança

- **JWT:** identidade central do sistema. Emitido pelo Supabase Auth no login/cadastro, contém o `user_id` (`sub`) e é a base tanto da RLS (via `auth.uid()`) quanto da autorização nas Edge Functions.
- **Authorization Header / Bearer Token:** todas as chamadas autenticadas (REST do Postgres via SDK, e as Edge Functions `ai-chat`/`delete-account`) enviam `Authorization: Bearer <access_token>`. O SDK do Supabase injeta esse header automaticamente em `supabase.functions.invoke()` e nas chamadas ao PostgREST.
- **RLS (Row Level Security):** habilitada em todas as tabelas de domínio. É a principal barreira contra um usuário acessar/alterar dados de outro, mesmo que a `anon key` seja pública (a `anon key` sozinha não concede acesso a dados de outros usuários — apenas identifica a aplicação perante o Supabase; quem concede acesso é a combinação JWT + política RLS).
- **Secrets:** `GEMINI_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` e `SUPABASE_SERVICE_ROLE_KEY` vivem exclusivamente como *secrets* do projeto Supabase (`supabase secrets set ...`), nunca no repositório nem no bundle do frontend. O frontend só recebe `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `VAPID_PUBLIC_KEY` (as duas primeiras são projetadas para serem públicas; a VAPID pública também é pública por definição do protocolo Web Push).
- **Edge Functions como fronteira de privilégio:** são o único lugar do sistema onde segredos e a `service_role` existem. Isso restringe a "zona de confiança total" (bypass de RLS) a três arquivos pequenos e auditáveis, em vez de espalhar lógica privilegiada pela aplicação.
- **Storage Policies:** análogas à RLS, mas para `storage.objects` — restringem upload/update/delete de avatares à própria pasta (`{user_id}/`) do usuário, permitindo apenas leitura pública.
- **Service Role:** usada apenas dentro das Edge Functions `send-push-notifications` (leitura cross-user necessária para o cron) e `delete-account` (exclusão administrativa, incluindo `auth.admin.deleteUser`, que exige privilégios que a `anon key` não tem). Nunca é exposta ao frontend.
- **Auth UID:** `auth.uid()` é a função do Postgres (fornecida pelo Supabase) que extrai o `user_id` do JWT da requisição atual e é usada em praticamente todas as políticas RLS do projeto para comparar com a coluna `user_id`/`id` da linha, garantindo que cada usuário só acesse suas próprias linhas.

---

## Configurações

| Variável | Onde vive | Finalidade |
|---|---|---|
| `SUPABASE_URL` | `config.js` (frontend, gerado no deploy) e secret nas Edge Functions | Endpoint do projeto Supabase (REST, Auth, Storage, Functions). Pública por definição do SDK. |
| `SUPABASE_ANON_KEY` | `config.js` (frontend) e secret nas Edge Functions (`ai-chat`, `delete-account`) | Chave pública de identificação da aplicação perante o Supabase; usada junto com o JWT do usuário para chamadas autenticadas via RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret apenas nas Edge Functions (`send-push-notifications`, `delete-account`) | Chave administrativa que ignora RLS; nunca exposta ao frontend. |
| `GEMINI_API_KEY` | Secret apenas na Edge Function `ai-chat` | Autentica as chamadas ao Google Gemini API. |
| `VAPID_PUBLIC_KEY` | `config.js` (frontend, pública) e secret na Edge Function `send-push-notifications` | Chave pública do protocolo Web Push, usada pelo navegador para criar a subscription e pelo servidor para assiná-la. |
| `VAPID_PRIVATE_KEY` | Secret apenas na Edge Function `send-push-notifications` | Chave privada usada para assinar as notificações push enviadas. |
| `VAPID_SUBJECT` | Secret na Edge Function `send-push-notifications` (com fallback `mailto:admin@medagenda.app` no código) | Identifica o remetente das notificações push perante os serviços de push dos navegadores. |
| `APP_URL` | `config.js` (frontend) | URL base usada em redirecionamentos de e-mail (confirmação, reset de senha) — não é um segredo, mas precisa estar cadastrada nas "Redirect URLs" do Supabase Auth. |

`config.js` é gerado a partir de secrets do repositório GitHub (`Settings → Secrets and variables → Actions`) durante o workflow `deploy.yml`, e nunca é versionado (está no `.gitignore`; existe um `config.example.js` como modelo).

---

## Tratamento de Erros

Códigos HTTP usados/retornados pelas Edge Functions e pelo Supabase:

| Status | Quando ocorre |
|---|---|
| **401** | JWT ausente, mal formado, expirado ou inválido em `ai-chat` e `delete-account` (falha em `auth.getUser()`). |
| **403** | Não emitido explicitamente pelas Edge Functions do projeto, mas pode ocorrer no PostgREST quando uma política RLS nega uma operação, ou quando o Gemini rejeita a `GEMINI_API_KEY` (repassado como `503` pela `ai-chat`, não como `403`). |
| **404** | Não usado como resposta HTTP das Edge Functions; ocorre a nível de subscription Web Push (endpoint removido pelo navegador) — tratado internamente por `send-push-notifications`, que remove a assinatura, e não é propagado ao chamador. |
| **429** | Repassado por `ai-chat` quando o Gemini retorna rate limit — indica que o usuário deve aguardar antes de tentar novamente. |
| **500** | Erro interno inesperado em qualquer uma das três Edge Functions (exceção não tratada), ou falha ao excluir o usuário em `delete-account`. |
| **502** | `ai-chat` quando o Gemini responde com erro HTTP não mapeado ou retorna corpo sem texto. |
| **503** | `ai-chat` quando `GEMINI_API_KEY` não está configurada, ou quando o Gemini rejeita a autenticação (401/403 do Gemini viram 503 para o usuário final, pois é uma falha do serviço, não do usuário). |

Erros de validação de entrada (`400`) também ocorrem em `ai-chat` para corpo JSON inválido, `type` desconhecido, ou `events` malformado/excedendo o limite de 500 itens.

---

## Logs

- **Edge Functions:** todas as três funções usam `console.log`/`console.error`/`console.warn` para registrar eventos relevantes (ex.: `[ai-chat] type=... user=... status=... ms=...`, erros do Gemini, falhas de envio de push por assinatura, erros inesperados). Não há um sistema de logging estruturado além disso.
- **Supabase Dashboard:** os logs de `console.*` de cada Edge Function ficam disponíveis em **Project → Edge Functions → {função} → Logs**, com filtro por período e nível — é o principal ponto de diagnóstico em produção, já que não há agregador externo de logs configurado.
- **Telemetria (frontend):** `telemetryService.js` mantém um buffer em memória (`_buffer`, máx. 200 eventos) de eventos de produto (`signup`, `login`, `appointment_created`, `push_subscribed`, `sync_failure`, `notification_failure`, `error`, etc.), exibidos no console apenas em modo dev (`console.groupCollapsed`). Não há envio desses eventos para um backend/serviço de analytics — o código já deixa isso explícito com o comentário `// Future: forward to analytics provider`.
- **Diagnóstico (frontend):** `diagnosticService.js` executa checagens ativas de conectividade (`supabase.from('events').select(...).limit(1)`), sessão de auth, service worker e permissão de push, retornando um relatório usado na tela de diagnóstico do app — não é telemetria enviada ao backend, é uma leitura local sob demanda.
- **Métricas de IA (`ai_metrics`):** existe uma tabela dedicada no banco para registrar `prompt_type`, `duration_ms`, `success` e `error_code` por chamada de IA, mas **nenhum código do projeto (frontend ou Edge Function) insere dados nela** — ver "Auditoria Arquitetural".

---

## Deploy

**Fluxo automatizado (Edge Functions):**

```
GitHub (push em main, alterando supabase/functions/**)
   ↓
GitHub Actions — workflow deploy-functions.yml
   ↓
Supabase CLI (supabase/setup-cli@v1)
   ↓
supabase functions deploy ai-chat --project-ref $SUPABASE_PROJECT_REF
   ↓
Projeto Supabase (Edge Runtime atualizado)
```

O workflow é disparado por push em `main` que altere arquivos em `supabase/functions/**`, ou manualmente (`workflow_dispatch`). Usa os secrets do repositório `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`.

**Fluxo automatizado (Frontend):** um segundo workflow (`deploy.yml`) gera `config.js` a partir de secrets do GitHub (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`) e publica o site estático no GitHub Pages — é o processo de deploy do frontend, não do backend, mas é o que conecta o app publicado ao projeto Supabase correto.

**Deploy manual via CLI:**

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy ai-chat
supabase functions deploy send-push-notifications
supabase functions deploy delete-account
```

Os secrets são configurados manualmente (ou via `setup-push.sh` para os relacionados a Push) com:

```bash
supabase secrets set GEMINI_API_KEY="..."
supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:..."
```

As migrations SQL (`/sql/*.sql`) **não** fazem parte de nenhum pipeline de deploy — são aplicadas manualmente pelo SQL Editor do Supabase Dashboard, em ordem numérica, conforme documentado no cabeçalho de cada arquivo.

---

## Infraestrutura

- **Projeto Supabase:** um único projeto hospeda todos os ambientes descritos neste documento (Auth, Postgres, Storage, Edge Functions); não há evidência no repositório de projetos separados por ambiente (dev/staging/prod) — a configuração é feita via secrets do GitHub Actions apontando para um `SUPABASE_PROJECT_REF`.
- **Região:** não versionada no repositório (definida na criação do projeto pelo Supabase Dashboard); não documentada em nenhum arquivo do projeto.
- **Banco:** PostgreSQL gerenciado pelo Supabase, versão determinada pelo plano/projeto Supabase (não fixada no código).
- **Storage:** bucket único `avatars`, público, sem CDN customizado além do que o Supabase Storage já fornece.
- **Edge Runtime:** Deno, hospedado pelo Supabase (Supabase Edge Functions), com dependências carregadas via `npm:` specifiers (`@supabase/supabase-js`, `web-push`) ou `esm.sh`/`deno.land/std` (no caso de `delete-account`).
- **Versionamento:** o código das Edge Functions e das migrations SQL está versionado neste repositório Git; não há um sistema de versionamento de schema (tipo `supabase migration list`) — a ordem é garantida pela numeração dos arquivos em `/sql`.

---

## Fluxos Backend

**Criação de evento:**

```
eventFormView.js
   ↓
eventService.createEvent(fields)
   ↓
supabase.from('events').insert({ ...fields, user_id })
   ↓
Postgres — RLS "Users can insert own events" (WITH CHECK user_id = auth.uid())
   ↓
Trigger events_updated_at → update_updated_at()
   ↓
Linha criada, devolvida ao frontend
```

**Assistente IA:**

```
assistantView.js (usuário pede resumo/sugestão/análise)
   ↓
aiService.getWeeklySummary(events) [ou getStudySuggestion / getScheduleAnalysis]
   ↓
geminiProvider.callGemini(payload)  — anexa JWT da sessão
   ↓
Edge Function ai-chat — valida usuário, monta prompt
   ↓
Google Gemini API — gera texto
   ↓
Edge Function ai-chat — extrai texto, responde JSON
   ↓
responseParser.parseResponse() → texto exibido na UI
```

**Notificações Push:**

```
Supabase Scheduler (cron a cada minuto)
   ↓
Edge Function send-push-notifications
   ↓
Postgres: SELECT events WHERE reminder_minutes IS NOT NULL
   ↓
expandEvent() (recurrence-core.js) — confirma ocorrência hoje
   ↓
Verifica janela de disparo (fireTime ± 5min) e notification_logs (dedup)
   ↓
Postgres: SELECT push_subscriptions WHERE user_id = ...
   ↓
web-push.sendNotification() → navegador do usuário (Web Push)
   ↓
Postgres: UPSERT notification_logs (status sent/failed)
```

**Upload de Avatar:**

```
accountView.js (usuário seleciona imagem)
   ↓
avatarService.uploadAvatar(file) — valida tipo/tamanho
   ↓
Storage: upload({user_id}/avatar.ext) — RLS por pasta
   ↓
Storage: getPublicUrl() → URL pública
   ↓
profileService.upsertProfile({ avatar_url: url })
   ↓
Postgres: UPDATE/INSERT profiles (RLS auth.uid() = id)
```

---

## Dependências

- **Frontend → Backend:** o frontend depende inteiramente do Supabase estar disponível — não há modo offline completo para escrita (leitura de cache pode existir via service worker/PWA, mas escrita de dados exige conectividade com o Supabase). Dependência crítica.
- **Backend → Banco:** todas as três Edge Functions e todos os serviços de domínio do frontend dependem do Postgres estar acessível; é o componente mais crítico de toda a arquitetura — sua indisponibilidade paralisa toda a aplicação.
- **Backend → Gemini:** apenas a função `ai-chat` depende do Gemini. Uma falha do Gemini degrada apenas o recurso de IA (tratada com códigos `429`/`502`/`503` específicos) — não crítica para o restante do app (eventos, categorias, perfil continuam funcionando normalmente).
- **Backend → Push:** `send-push-notifications` depende dos serviços de push dos navegadores (FCM, Mozilla Push, etc., abstraídos pela Web Push API) para efetivamente entregar notificações. Falha aqui não afeta o restante da aplicação — apenas os lembretes deixam de ser entregues, e o próprio código já cuida de limpar assinaturas mortas.
- **Backend → Storage:** `avatarService.js` e `delete-account` dependem do Storage. Não crítico para o núcleo do app (agenda funciona sem avatar), mas crítico para o fluxo de perfil e para a limpeza completa em exclusão de conta.
- **Dependência crítica consolidada:** Supabase (Auth + Postgres) é a única dependência de que **toda** a aplicação depende para funcionar; Gemini, Push e Storage são dependências de funcionalidades específicas, não do núcleo (agenda de eventos).

---

## Auditoria Arquitetural

Revisão documental da arquitetura atual, sem alteração de código:

- **Edge Functions existentes:** exatamente 3 (`ai-chat`, `send-push-notifications`, `delete-account`), cada uma com responsabilidade única e bem definida — não há sobreposição de propósito entre elas.
- **Responsabilidades bem definidas:** confirmado. `ai-chat` só fala com Gemini; `send-push-notifications` só lida com o ciclo de notificações; `delete-account` só lida com exclusão de conta. Nenhuma mistura lógica de domínios diferentes.
- **Integração com Supabase:** consistente — todas as três funções usam `@supabase/supabase-js`, na mesma versão fixa `2.110.0` (sem range flutuante), ainda que importado de fontes diferentes (`npm:@supabase/supabase-js@2.110.0` em `ai-chat`/`send-push-notifications`, `https://esm.sh/@supabase/supabase-js@2.110.0` em `delete-account`). Essa divergência de fonte de import não é um erro funcional, mas é uma inconsistência de estilo/manutenção entre as funções que vale padronizar.
- **Estilo de servidor divergente:** `ai-chat` e `send-push-notifications` usam `Deno.serve` nativo; `delete-account` usa `serve` de `https://deno.land/std@0.177.0/http/server.ts`. Funcionalmente equivalente, mas inconsistente.
- **Integração com Gemini:** correta e isolada — a chave nunca é exposta ao frontend, e apenas `ai-chat` a utiliza. O modelo (`gemini-2.5-flash`) é definido no frontend (`config/ai.js`) e enviado como parâmetro, o que significa que a Edge Function confia no valor de `model` vindo do cliente sem validá-lo contra uma lista permitida — um cliente malicioso poderia, em tese, solicitar um modelo Gemini diferente do pretendido (não um risco de segurança de dados, mas uma falta de validação de allowlist no servidor).
- **Uso dos Secrets:** adequado — segredos sensíveis (`GEMINI_API_KEY`, chaves VAPID, `SUPABASE_SERVICE_ROLE_KEY`) só existem como secrets de Edge Function, nunca no frontend ou no repositório.
- **Isolamento frontend/backend:** bem mantido para a maior parte dos fluxos (CRUD via RLS, IA e exclusão de conta via Edge Function). Uma exceção notável: `pushService.js` grava diretamente em `push_subscriptions` via `supabase.from(...)` a partir do frontend (com RLS `auth.uid() = user_id`), enquanto o *consumo* dessa tabela é feito com `service_role` na Edge Function — um desenho consistente (o usuário só pode gerenciar a própria assinatura; só o servidor agendado pode ler todas), mas que mistura os dois padrões de acesso (direto ao Postgres vs. via Edge Function) dentro do mesmo domínio funcional (push).
- **Tabela `ai_metrics` sem gravação:** a migration `sql/08_ai_metrics.sql` cria a tabela e sua política de leitura, e a documentação a descreve como "Etapa 19 — AI Gateway", mas nenhum código (Edge Function `ai-chat` ou frontend) insere dados nela atualmente. A telemetria de IA existente fica apenas em `console.log` na Edge Function — a tabela é infraestrutura pronta, porém não conectada à aplicação.
- **`delete-account` não limpa `academic_calendars`/`academic_events` explicitamente:** essas tabelas têm FK `ON DELETE CASCADE` a partir de `auth.users`/`academic_calendars`, então são removidas corretamente quando `auth.admin.deleteUser` executa — mas isso depende inteiramente do cascade do banco, diferente das outras quatro tabelas (`notification_logs`, `push_subscriptions`, `events`, `categories`), que são deletadas explicitamente pela função antes de excluir o usuário. Funciona, mas não é auditável só de ler a Edge Function — é preciso conhecer o schema para saber que essas tabelas também são limpas.
- **Deploy automatizado cobre apenas 1 de 3 funções:** o workflow `deploy-functions.yml` só executa `supabase functions deploy ai-chat`. As funções `send-push-notifications` e `delete-account` não têm deploy automatizado via CI/CD — dependem de deploy manual via CLI. Isso é uma lacuna real de consistência entre o pipeline documentado e a superfície completa de Edge Functions do projeto.
- **Documentação duplicada:** já existem `docs/ARCHITECTURE.md` (inglês) e `docs/ARQUITETURA.md` (português), com conteúdo aparentemente sobreposto sobre a arquitetura geral do sistema. Este documento (`BACKEND.md`) foi escrito para ser a referência específica de backend, mas a sobreposição entre os três arquivos de arquitetura é algo que a equipe pode querer consolidar.
- **Consistência geral da arquitetura:** apesar dos pontos acima, a arquitetura é coerente: RLS como mecanismo primário de autorização, Edge Functions como exceção pontual e bem justificada, segredos nunca expostos ao cliente, e um único ponto de verdade para autenticação (Supabase Auth). Os itens listados são lacunas de acabamento/consistência, não falhas estruturais.

---

## Estado Atual

- **Edge Functions:** 3 (`ai-chat`, `send-push-notifications`, `delete-account`).
- **Integrações externas:** 2 (Google Gemini API; Web Push API dos navegadores/serviços de push).
- **Secrets utilizados:** 6 (`GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` como secret de função — além de `SUPABASE_URL`, que também é configurada como secret embora não seja sensível).
- **Serviços Supabase utilizados:** 4 (Auth, PostgreSQL, Storage, Edge Functions).
- **Tabelas de domínio:** 8 (`events`, `categories`, `profiles`, `push_subscriptions`, `notification_logs`, `academic_calendars`, `academic_events`, `ai_metrics`), todas com RLS habilitado.
- **Arquitetura backend consolidada:** Backend-as-a-Service (Supabase) como núcleo, com PostgreSQL + RLS fazendo a maior parte da autorização de dados, e três Edge Functions Deno cobrindo os casos que exigem segredos, privilégios elevados ou execução agendada. Sem servidor de aplicação próprio.
- **Avaliação geral da infraestrutura:** arquitetura enxuta e adequada ao porte do projeto — baixa complexidade operacional, segurança apoiada em mecanismos nativos do Supabase (RLS, JWT, secrets), e separação clara entre o que roda no cliente e o que exige o servidor. As lacunas identificadas na auditoria (deploy parcial via CI/CD, tabela `ai_metrics` não utilizada, pequenas inconsistências de estilo entre Edge Functions, documentação de arquitetura duplicada) são pontos de manutenção, não riscos estruturais.
