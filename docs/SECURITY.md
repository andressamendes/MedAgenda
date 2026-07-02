# Segurança do MedAgenda

> Documentação oficial da arquitetura de segurança do MedAgenda. Reflete exatamente o estado atual do código — nenhuma política, função, Edge Function ou fluxo de autenticação foi alterado para a produção deste documento. Onde há lacunas ou inconsistências, elas são apenas relatadas, não corrigidas.

---

## Visão Geral

### Filosofia de segurança

O MedAgenda não possui um servidor de aplicação próprio: é um frontend estático (HTML/CSS/JS, publicado no GitHub Pages) que fala diretamente com um projeto **Supabase** (Backend-as-a-Service). A filosofia de segurança adotada decorre diretamente dessa arquitetura:

- **RLS como camada de autorização primária.** Em vez de reimplementar checagens de "este dado pertence a este usuário?" em cada tela ou serviço do frontend, essa regra é declarada uma única vez no banco, via Row Level Security. Mesmo que o frontend tenha um bug e envie uma query mal filtrada, o Postgres nega o acesso a dados de outro usuário.
- **Chave pública (`anon key`) não é segredo de acesso.** A `anon key` do Supabase, embutida no frontend, apenas identifica a aplicação perante o Supabase — ela não concede acesso a dados de terceiros. Quem concede acesso é a combinação **JWT do usuário + política RLS**.
- **Segredos sensíveis só existem no servidor.** Chaves de terceiros (Gemini) e chaves privilegiadas (`service_role`, VAPID privada) nunca são incluídas no bundle do frontend — vivem exclusivamente como *secrets* de Edge Functions no Supabase.
- **Edge Functions como fronteira de privilégio.** As únicas três Edge Functions do projeto concentram toda a lógica que precisa de segredos ou de privilégios elevados (`service_role`). Fora delas, o frontend nunca "engana" a RLS.
- **Falha seguindo para o estado menos privilegiado.** Erros de autenticação, timeouts e falhas de rede levam o usuário de volta à tela de login, nunca a um estado de app parcialmente autenticado.

### Camadas de proteção

1. **Frontend** — validações de formulário, escapamento de HTML antes de renderizar dados do usuário, tratamento de erros que evita vazar detalhes internos.
2. **JWT / Sessão** — identidade emitida pelo Supabase Auth, renovada automaticamente, usada em toda chamada autenticada.
3. **Supabase (Auth + PostgREST)** — valida o JWT em toda requisição antes de tocar o banco.
4. **RLS (Row Level Security)** — políticas por tabela, baseadas em `auth.uid()`, aplicadas pelo próprio Postgres.
5. **Banco (PostgreSQL)** — constraints, triggers e chaves estrangeiras com `ON DELETE CASCADE` garantindo integridade mesmo se a camada de aplicação falhar.
6. **Edge Functions** — fronteira isolada onde vivem segredos (`GEMINI_API_KEY`, VAPID, `service_role`), com validação própria de autenticação.
7. **Google Gemini** — alcançado apenas pela Edge Function `ai-chat`, nunca diretamente pelo navegador.

### Diagrama de camadas

```
                Usuário
                   │
                   ▼
               Frontend
        (GitHub Pages · HTML/CSS/JS)
                   │
                   ▼
                  JWT
      (access_token emitido no login,
       enviado como Authorization: Bearer)
                   │
                   ▼
               Supabase
     ┌─────────────────────────────┐
     │  Auth (valida o JWT)        │
     └─────────────────────────────┘
                   │
                   ▼
                  RLS
      (políticas por tabela, auth.uid())
                   │
                   ▼
                 Banco
           (PostgreSQL + constraints
            + triggers + FKs CASCADE)
                   │
                   ▼
             Edge Functions
      (ai-chat / delete-account /
       send-push-notifications —
       segredos de servidor, service_role)
                   │
                   ▼
             Google Gemini
        (somente a partir de ai-chat,
         chave nunca chega ao navegador)
```

---

# Autenticação

A autenticação é inteiramente delegada ao **Supabase Auth**. Não existe tabela de usuários própria além de `auth.users` (gerenciada pelo Supabase) e `public.profiles` (extensão de perfil, 1:1 com `auth.users`, criada automaticamente por trigger).

### Login

1. Usuário informa e-mail e senha em `#login-screen`.
2. `auth.js` → `signIn(email, password)` chama `supabase.auth.signInWithPassword({ email, password })`.
3. Supabase valida as credenciais contra `auth.users` e, em caso de sucesso, retorna um **access token (JWT)** e um **refresh token**.
4. O SDK persiste a sessão automaticamente no `localStorage` do navegador.
5. O evento `SIGNED_IN` é emitido por `onAuthStateChange`, que dispara `showApp(session)` em `authView.js` e carrega o restante da aplicação.
6. Mensagens de erro são normalizadas no frontend (`authView.js`) para não expor detalhes internos do Supabase: `Invalid login`/`invalid_credentials` → "E-mail ou senha incorretos"; `Email not confirmed` → "Confirme seu e-mail antes de fazer login".

### Cadastro

1. Usuário preenche nome completo, e-mail, senha (mínimo 8 caracteres validado no frontend) e confirmação; precisa aceitar os Termos de Uso.
2. `signUp(email, password, fullName)` chama `supabase.auth.signUp()`, enviando `full_name` como metadata do usuário (`options.data`) e `emailRedirectTo: APP_URL`.
3. Supabase cria o registro em `auth.users` e envia e-mail de confirmação.
4. O trigger `on_auth_user_created` (`sql/05_profiles.sql`), executado com `SECURITY DEFINER`, cria automaticamente a linha correspondente em `public.profiles`.
5. O frontend trata dois sinais de e-mail já cadastrado como proteção contra enumeração de contas do próprio Supabase: `user === null` ou `identities.length === 0`.
6. Após confirmação do e-mail (clique no link), o usuário é redirecionado a `APP_URL` e o evento `SIGNED_IN` estabelece a sessão.

### Logout

1. Usuário aciona "Sair".
2. `signOut()` chama `supabase.auth.signOut()`, invalidando a sessão local (e o refresh token no servidor, conforme configuração do projeto).
3. O evento `SIGNED_OUT` redireciona para a tela de login e todo estado da aplicação é limpo (`onBeforeSignOut`, fechamento de modais, `destroyWeekView()`).

### Recuperação de senha

1. Usuário informa o e-mail em "Esqueci minha senha".
2. `sendPasswordReset(email)` chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl })`.
3. Supabase envia e-mail com link de redefinição de uso único.
4. Ao clicar no link, o usuário retorna ao app com um token de recuperação na URL; o SDK dispara `onAuthStateChange` com `event === 'PASSWORD_RECOVERY'`, que a aplicação usa para exibir a tela "Nova senha" em vez de logar o usuário diretamente na agenda.
5. `updatePassword(newPassword)` chama `supabase.auth.updateUser({ password })` dentro dessa sessão de recuperação.
6. Após sucesso, o usuário é redirecionado para a tela de login.

### Alteração de senha (usuário já autenticado)

Disponível em "Minha Conta → Alterar Senha": chama `supabase.auth.updateUser({ password })` diretamente, sem exigir a senha atual — o JWT da sessão já autentica o pedido.

### Sessão

- O SDK `@supabase/supabase-js` mantém a sessão em `localStorage` e a restaura automaticamente ao recarregar a página (`getSession()`).
- Um timer de segurança de 10 segundos em `authView.js` força a exibição da tela de login caso nem `onAuthStateChange` nem `getSession()` respondam (ex.: Supabase inacessível, refresh travado) — evita que o usuário fique preso indefinidamente na tela de carregamento.
- `showApp()` protege contra dupla inicialização: se `onAuthStateChange` (evento `INITIAL_SESSION`) e a chamada `getSession()` resolverem para o mesmo usuário, a inicialização do app roda apenas uma vez.

### Refresh Token

O SDK renova o access token automaticamente em segundo plano, usando o refresh token, antes da expiração — de forma transparente para o restante da aplicação. Não há código customizado de refresh no projeto; a responsabilidade é inteiramente do SDK oficial.

### JWT

O JWT (access token) emitido pelo Supabase Auth é a identidade central do sistema:

- Contém `sub` (= `user.id`) e claims padrão, incluindo tempo de expiração.
- É a base tanto da RLS no Postgres (via `auth.uid()`) quanto da autorização nas Edge Functions (`ai-chat`, `delete-account`).
- É enviado como header `Authorization: Bearer <access_token>` em toda chamada autenticada — o SDK injeta esse header automaticamente nas chamadas ao PostgREST e em `supabase.functions.invoke()`.
- A validação do JWT nas Edge Functions **não é feita manualmente** (decodificação/verificação de assinatura local); é delegada ao próprio `supabase.auth.getUser()`, que consulta o serviço de Auth do projeto. Isso garante que a mesma fonte de verdade usada pelo Postgres (`auth.uid()`) seja usada também nas Edge Functions.

### Expiração

A expiração do access token segue a configuração padrão do projeto Supabase (não fixada em código do repositório). Quando o token expira e o refresh falha (ex.: refresh token também expirado ou revogado), o SDK emite `SIGNED_OUT` e a aplicação retorna à tela de login.

---

# Autorização

### Row Level Security

Toda tabela de domínio do projeto (`events`, `categories`, `push_subscriptions`, `notification_logs`, `profiles`, `academic_calendars`, `academic_events`, `ai_metrics`) tem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ativado. Não existe tabela de dados de usuário no schema `public` sem RLS.

### `auth.uid()`

Função fornecida pelo Supabase que retorna o UUID do usuário autenticado na sessão da requisição atual (extraído do JWT), ou `NULL` para requisições sem sessão válida — o que bloqueia efetivamente qualquer acesso não autenticado às tabelas protegidas.

### Isolamento entre usuários

O isolamento é garantido inteiramente pelo banco, com três padrões de política, dependendo da relação da tabela com o usuário:

**1. Acesso direto por `user_id`** — usado em `events`, `categories`, `push_subscriptions`, `academic_calendars`:

```sql
USING (user_id = auth.uid())
```

**2. Acesso por chave primária = FK de `auth.users`** — usado em `profiles`, onde `id` é ao mesmo tempo PK e FK:

```sql
USING (auth.uid() = id)
```

**3. Acesso via subquery/JOIN** — usado em `academic_events`, que não tem `user_id` próprio; a posse é verificada através do calendário pai:

```sql
USING (
  EXISTS (
    SELECT 1 FROM academic_calendars
    WHERE id = calendar_id AND user_id = auth.uid()
  )
)
```

**4. Leitura pelo usuário, escrita apenas por `service_role`** — usado em `notification_logs` e `ai_metrics`: o usuário só tem política de `SELECT` (`auth.uid() = user_id`); inserções são feitas exclusivamente pelas Edge Functions com a chave de serviço, contornando RLS de forma intencional e controlada.

### Quais tabelas utilizam RLS

| Tabela | RLS habilitado | Padrão de política |
|---|---|---|
| `events` | Sim | `user_id = auth.uid()` (SELECT/INSERT/UPDATE/DELETE) |
| `categories` | Sim | `user_id = auth.uid()` (SELECT/INSERT/UPDATE/DELETE) |
| `push_subscriptions` | Sim | `auth.uid() = user_id` (SELECT/INSERT/UPDATE/DELETE) |
| `notification_logs` | Sim | `auth.uid() = user_id` (SELECT apenas; INSERT via `service_role`) |
| `profiles` | Sim | `auth.uid() = id` (SELECT/INSERT/UPDATE com USING+WITH CHECK/DELETE) |
| `academic_calendars` | Sim | `user_id = auth.uid()` (SELECT/INSERT/UPDATE/DELETE) |
| `academic_events` | Sim | via `EXISTS` sobre `academic_calendars.user_id = auth.uid()` |
| `ai_metrics` | Sim | `auth.uid() = user_id` (SELECT apenas; INSERT via `service_role`) |
| `storage.objects` (bucket `avatars`) | Sim (Storage Policies) | leitura pública; escrita restrita a `auth.uid()::text = pasta` |

Total: **26 políticas RLS** em tabelas + **4 políticas** de Storage.

### Redundância explícita no código

Apesar da RLS já garantir o isolamento no banco, os serviços do frontend (`eventService.js`, `categoryService.js`, `profileService.js`, `academicCalendarService.js`) também incluem `user_id`/`id` explicitamente nos filtros de `select`/`update`/`delete` (obtido via `currentUserId()` em `supabase.js`). Essa dupla checagem é redundante com a RLS, mas deliberada — torna a intenção do código explícita e evita depender apenas de uma camada.

---

# Edge Functions

O projeto possui **3 Edge Functions**, todas em Deno, hospedadas pelo Supabase, todas respondendo em JSON. `delete-account` e `send-push-notifications` mantêm CORS liberado (`Access-Control-Allow-Origin: *`); `ai-chat` restringe `Access-Control-Allow-Origin` a uma allowlist (origem oficial de produção `https://andressamendes.github.io` + `http://localhost`/`http://127.0.0.1` em qualquer porta, para desenvolvimento local). Todas usam `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`.

| Função | Autenticação | Chave usada | Invocada por |
|---|---|---|---|
| `ai-chat` | JWT do usuário, validado via `auth.getUser()` | `SUPABASE_ANON_KEY` + JWT do chamador | Frontend (`geminiProvider.js`) |
| `delete-account` | JWT do usuário, validado via `auth.getUser()` | `SUPABASE_ANON_KEY` + JWT (identificação) e `SUPABASE_SERVICE_ROLE_KEY` (execução) | Frontend (`accountView.js`) |
| `send-push-notifications` | Nenhuma validação de JWT — não é chamada por um usuário final | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Scheduler (cron `* * * * *`) |

### Autenticação e validação do Bearer Token

- **`ai-chat`** e **`delete-account`** exigem o header `Authorization: Bearer <access_token>`. Se ausente ou mal formado, respondem `401` imediatamente, sem processar o restante da requisição. Com o header presente, cada função cria um client Supabase (`createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })`) e chama `auth.getUser()`; se a validação falhar (token inválido, expirado, ou sem usuário correspondente), respondem `401` antes de qualquer efeito colateral (antes de chamar o Gemini, ou antes de apagar qualquer dado).
- **`send-push-notifications`** não recebe nem valida um JWT de usuário porque é disparada pelo agendador interno do Supabase, não por uma requisição de cliente final. Ela opera diretamente com `service_role`, que dá acesso irrestrito ao banco (ignorando RLS) — coerente com a necessidade de ler eventos e assinaturas de **todos** os usuários em cada execução do cron.

### Uso de `service_role`

O `service_role` (chave administrativa que ignora RLS) é usado em exatamente dois pontos:

- **`delete-account`** — usa um client `admin` separado do client de identificação do usuário, para de fato apagar registros em `notification_logs`, `push_subscriptions`, `events`, `categories`, arquivos no Storage e o próprio usuário em `auth.users` via `admin.auth.admin.deleteUser(userId)` (operação que a `anon key` não tem permissão de executar).
- **`send-push-notifications`** — usa `service_role` para ler `events` e `push_subscriptions` de todos os usuários e para gravar/atualizar `notification_logs`, cruzando o limite normal de RLS de forma intencional e documentada.

`ai-chat` **não** usa `service_role` — opera inteiramente sob a identidade (JWT) do próprio usuário que fez a requisição.

### Isolamento

Cada Edge Function tem responsabilidade única, sem sobreposição de propósito: `ai-chat` só fala com o Gemini; `send-push-notifications` só lida com o ciclo de notificações agendadas; `delete-account` só lida com exclusão de conta. Nenhuma das três acumula lógica de mais de um domínio.

### Tratamento de erros

**`ai-chat`:**

| Situação | Status |
|---|---|
| Header `Authorization` ausente/mal formado | 401 |
| `auth.getUser()` falha ou retorna vazio | 401 |
| `GEMINI_API_KEY` não configurada | 503 |
| Corpo JSON inválido | 400 |
| `type` fora de `weekly_summary`/`study_suggestion`/`schedule_analysis` | 400 |
| `events` não é array, ou excede 500 itens | 400 |
| Gemini retorna 429 | 429 (repassado) |
| Gemini retorna 401/403 | 503 (erro do provedor, não do usuário final) |
| Gemini retorna outro erro HTTP, ou corpo sem texto | 502 |
| Exceção não tratada | 500, com log de tipo de prompt e tempo decorrido |

**`delete-account`:** ausência/invalidez do JWT → `401`; falha em `auth.admin.deleteUser` → `500` com a mensagem de erro do Supabase; qualquer exceção não tratada → `500` com `String(err)`.

**`send-push-notifications`:** erro ao consultar `events` é propagado (`throw`) e interrompe a execução com `500`; falhas de envio por assinatura individual (ex.: `410 Gone`/`404 Not Found`) são tratadas internamente — a assinatura revogada é removida de `push_subscriptions` — sem interromper o processamento das demais; qualquer exceção não tratada no laço externo resulta em `500` com `{ error: err.message }`.

### Como a segurança é aplicada, resumo

1. Toda função valida a origem da requisição antes de qualquer efeito colateral (JWT para as duas invocadas pelo usuário; nenhuma validação externa para a agendada, que roda sob controle exclusivo do Supabase).
2. Segredos (`GEMINI_API_KEY`, chaves VAPID, `SUPABASE_SERVICE_ROLE_KEY`) só existem como variáveis de ambiente das Edge Functions — nunca chegam ao frontend.
3. `service_role` é usado apenas onde é estritamente necessário (operação cross-user ou administrativa), nunca como atalho de conveniência.
4. Erros são normalizados em português para o usuário final, sem vazar stack traces ou detalhes internos do Gemini/Postgres nas respostas.

---

# Secrets

| Secret | Onde vive | Utilizado em |
|---|---|---|
| `GEMINI_API_KEY` | Secret da Edge Function no Supabase | `ai-chat` — autentica as chamadas à API do Google Gemini |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret da Edge Function no Supabase (injetado automaticamente) | `delete-account`, `send-push-notifications` — operações administrativas que ignoram RLS |
| `SUPABASE_URL` | `config.js` (frontend, gerado no deploy) **e** disponível como variável de ambiente nas Edge Functions | Endpoint do projeto Supabase; pública por definição do SDK |
| `SUPABASE_ANON_KEY` | `config.js` (frontend) **e** variável de ambiente em `ai-chat`/`delete-account` | Chave pública de identificação da aplicação; usada junto ao JWT do usuário para chamadas autenticadas |
| `VAPID_PUBLIC_KEY` | `config.js` (frontend, pública por definição do protocolo Web Push) e secret da Edge Function `send-push-notifications` | Criação de assinaturas Push no navegador e assinatura das mesmas no servidor |
| `VAPID_PRIVATE_KEY` | Secret da Edge Function `send-push-notifications` | Assina as notificações push enviadas via `web-push` |
| `VAPID_SUBJECT` | Secret da Edge Function `send-push-notifications` (com fallback `mailto:admin@medagenda.app` no código) | Identifica o remetente perante os serviços de push dos navegadores |
| `SUPABASE_ACCESS_TOKEN` | Secret do repositório GitHub | Usado pelo workflow `deploy-functions.yml` para autenticar a Supabase CLI no deploy de Edge Functions |
| `SUPABASE_PROJECT_REF` | Secret do repositório GitHub | Identifica o projeto Supabase de destino no deploy via CLI (`--project-ref`) |

**Nenhum valor real de secret é versionado neste repositório.** `config.js` (onde `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL` e `VAPID_PUBLIC_KEY` residem no frontend) está listado em `.gitignore` e é gerado a cada deploy a partir dos GitHub Secrets; existe apenas `config.example.js` como modelo versionado, sem valores reais.

**Fronteira clara:** os únicos secrets que chegam ao navegador são `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `VAPID_PUBLIC_KEY` — todos projetados para serem públicos por definição (a `anon key` não concede acesso sem JWT + RLS; a VAPID pública é pública por definição do protocolo Web Push). `GEMINI_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `SUPABASE_SERVICE_ROLE_KEY` nunca saem do ambiente de servidor (Edge Functions).

---

# Google Gemini

### Como a IA é acessada

O frontend **nunca** chama a API do Google Gemini diretamente. Todo acesso passa por proxy através da Edge Function `ai-chat`:

```
aiPanelView.js / assistantView.js
        ↓  (usuário escolhe: resumo semanal | sugestão de estudo | análise de agenda)
services/ai/aiService.js
        ↓  (gateway único de IA do frontend; lê config/ai.js)
services/ai/providers/geminiProvider.js
        ↓  POST {SUPABASE_URL}/functions/v1/ai-chat
        ↓  Authorization: Bearer <access_token da sessão>
Edge Function ai-chat  (Deno, Supabase)
        ↓  valida JWT via auth.getUser()
        ↓  valida payload (type, events[], limite de 500 eventos)
        ↓  monta o prompt em português a partir dos eventos
        ↓  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=GEMINI_API_KEY
Google Gemini API (gemini-2.5-flash por padrão)
        ↓  gera texto
Edge Function ai-chat
        ↓  extrai candidates[0].content.parts[0].text
        ↓  responde { text, ms } ao frontend
geminiProvider.js → aiService.js → parsers/responseParser.js → View
```

### Proteção da chave

`GEMINI_API_KEY` é lida via `Deno.env.get("GEMINI_API_KEY")` dentro da Edge Function, configurada como secret do projeto Supabase — nunca aparece em nenhum arquivo versionado, nem é enviada ao navegador em nenhum momento. Se o secret não estiver configurado, a função responde `503` antes mesmo de validar o restante da requisição.

### Comunicação

- Requisição do frontend → Edge Function: HTTPS, autenticada via `Authorization: Bearer <JWT>`.
- Requisição Edge Function → Gemini: HTTPS, autenticada via query param `key=` com `GEMINI_API_KEY`, exclusivamente do lado do servidor.
- Nenhuma comunicação direta navegador ↔ Gemini existe no projeto.

### Resposta

A Edge Function extrai apenas o texto gerado (`candidates[0].content.parts[0].text`) e o repassa em `{ text, ms }`. Se o Gemini retornar corpo sem texto, a função responde `502` em vez de repassar uma resposta vazia ao usuário.

### Privacidade dos dados enviados

Somente **título, data, hora, duração e categoria** dos eventos são enviados ao Gemini (ver construtores de prompt em `ai-chat/index.ts`). Descrição, localização detalhada e identificadores internos (`id`, `user_id`) não são transmitidos. Não há histórico de conversa armazenado — cada chamada é independente (stateless).

### Fallback local

Se a Edge Function estiver indisponível, `smartAssistant.js` executa uma análise baseada em regras diretamente no navegador (conflitos de horário, plantões longos, dias sobrecarregados), sem qualquer chamada externa — não é uma alternativa de IA, mas garante que o app continue útil mesmo sem o Gemini.

---

# Storage

### Buckets

Um único bucket, **`avatars`**, criado manualmente no Supabase Dashboard (Storage → New Bucket → **público**). As políticas de acesso são definidas em `sql/06_storage.sql`, aplicadas sobre `storage.objects`.

### Autenticação

O bucket é público para leitura, mas escrita (upload/update/delete) é restrita ao próprio dono da pasta, identificado pelo primeiro segmento do caminho do arquivo:

```sql
-- Upload
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Update / Delete: mesma condição, para as respectivas operações

-- Leitura pública
CREATE POLICY "avatars_select_public" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
```

### Upload

`avatarService.js` implementa `uploadAvatar(file)`:

1. Valida tipo MIME no frontend contra uma allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
2. Valida tamanho máximo de 2 MB no frontend.
3. Monta o caminho `{user_id}/avatar.{ext}` — o `{user_id}` como primeiro segmento é o que a política RLS de Storage verifica.
4. `supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })`.
5. Gera a URL pública com `getPublicUrl()` e adiciona um cache-buster (`?v=timestamp`) para evitar cache desatualizado no navegador.

A validação de tipo/tamanho ocorre **apenas no frontend** — não há trigger ou constraint no banco que revalide o `contentType` ou o tamanho do arquivo do lado do servidor além do que o próprio Supabase Storage impõe por padrão.

### Acesso

- **Leitura:** pública, sem autenticação — necessária para que URLs de avatar funcionem em `<img>` sem exigir sessão.
- **Escrita:** restrita ao próprio usuário via `auth.uid()::text = (storage.foldername(name))[1]`.
- **Exclusão de conta:** `delete-account` remove os arquivos do usuário (`admin.storage.from("avatars").list(userId)` + `.remove(...)`) usando `service_role`, antes de excluir o usuário em `auth.users`.

---

# Push Notifications

### Subscriptions

Cada dispositivo/navegador gera uma assinatura Web Push própria, armazenada em `push_subscriptions` (`user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`). Um usuário pode ter múltiplas assinaturas simultâneas (ex.: celular + notebook).

`pushService.js`:

- `subscribeToPush()` — solicita permissão de notificação, cria a subscription via `PushManager.subscribe()` com a chave VAPID pública, e grava/atualiza em `push_subscriptions` via `upsert(..., { onConflict: 'user_id,endpoint' })`, sob a identidade do usuário logado (RLS aplica-se normalmente aqui — é o único ponto de escrita nessa tabela feito pelo frontend).
- `unsubscribeFromPush()` — remove a subscription do navegador e a linha correspondente no banco.
- `syncPushSubscription()` — resincroniza a subscription após login, cobrindo o caso em que ela foi revogada externamente (ex.: configurações do navegador limpas).

### Autenticação

A gravação da assinatura pelo frontend é protegida pela RLS padrão de `push_subscriptions` (`auth.uid() = user_id`). O **consumo** dessa tabela (leitura de todas as assinaturas de todos os usuários, para disparo de notificações) é feito exclusivamente pela Edge Function `send-push-notifications`, com `service_role` — nenhum outro ponto do sistema lê assinaturas de outros usuários.

### VAPID

- `VAPID_PUBLIC_KEY` é enviada ao frontend via `config.js` (pública por definição do protocolo Web Push) e usada para criar a subscription no navegador.
- `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` existem exclusivamente como secrets da Edge Function `send-push-notifications`, usados por `webpush.setVapidDetails()` para assinar as notificações antes do envio.

### Envio

A Edge Function `send-push-notifications` roda agendada (cron `* * * * *`, configurado no Supabase Dashboard ou via `pg_cron`+`pg_net`) e, sob `service_role`:

1. Busca todos os eventos com `reminder_minutes IS NOT NULL`.
2. Usa `expandEvent()` (`_shared/recurrence-core.js` — mesma lógica canônica usada no frontend) para confirmar se hoje é uma ocorrência válida do evento.
3. Calcula `fireTime = event_time - reminder_minutes` e só processa se `now` estiver dentro de uma janela de 5 minutos após `fireTime`.
4. Verifica em `notification_logs` se já existe um envio registrado para `(user_id, event_id, event_date)` — se sim, pula (evita duplicação).
5. Busca as assinaturas do usuário em `push_subscriptions` e envia via `webpush.sendNotification()` para cada `endpoint`.
6. Assinaturas que retornam `410 Gone`/`404 Not Found` (revogadas) são removidas automaticamente.
7. Registra o resultado (`sent`/`failed`) em `notification_logs`, protegido também por um índice único (`notification_logs_dedup`) como segunda camada de proteção contra duplicidade.

---

# Segurança do Banco

### RLS

Detalhada nas seções "Autorização" acima — ativada em todas as 8 tabelas de domínio do schema `public`, com o padrão de nomes de política em inglês descritivo (`"Users can view own events"`) ou abreviado (`push_subscriptions_select`).

### Constraints

| Tabela | Constraint | Regra |
|---|---|---|
| `events` | `events_recurrence_type_check` | `recurrence_type ∈ {none, daily, weekdays, weekly, biweekly, monthly, yearly, custom}` |
| `profiles` | CHECK em `semester` | `semester BETWEEN 1 AND 12` |
| `profiles` | CHECK em `theme` | `theme ∈ {light, dark, system}` |

Todas as colunas `user_id`/`id`/`calendar_id` que referenciam outra tabela usam `NOT NULL` e `FOREIGN KEY ... ON DELETE CASCADE`.

### Triggers

- `update_updated_at()` — função `PL/pgSQL` centralizada (definida em `01_events.sql`), reutilizada por 6 triggers `BEFORE UPDATE` em 6 tabelas (`events`, `categories`, `push_subscriptions`, `profiles`, `academic_calendars`, `academic_events`), mantendo `updated_at` sincronizado sem depender da aplicação.
- `handle_new_user()` — trigger `AFTER INSERT` em `auth.users`, executado com **`SECURITY DEFINER`** e `SET search_path = public`. Cria automaticamente o registro em `profiles` no cadastro. O uso de `SECURITY DEFINER` é necessário porque o trigger, registrado no schema `auth`, precisa de permissão de escrita em `public.profiles` — um padrão de segurança sensível (executa com os privilégios de quem definiu a função, não de quem disparou o evento), mas escopado a uma única operação idempotente (`ON CONFLICT (id) DO NOTHING`).

### UUID

Toda chave primária do projeto usa `UUID PRIMARY KEY DEFAULT gen_random_uuid()` — identificadores não sequenciais, que não vazam contagem de registros nem permitem enumeração previsível de IDs de outros usuários.

### Integridade

- `ON DELETE CASCADE` em toda FK que referencia `auth.users(id)`: excluir um usuário remove automaticamente `events`, `categories`, `push_subscriptions`, `notification_logs`, `profiles`, `academic_calendars`, `ai_metrics`.
- `academic_events.calendar_id → academic_calendars(id) ON DELETE CASCADE`: excluir um calendário remove seus eventos acadêmicos.
- Índices únicos reforçam regras de negócio no nível do banco, não apenas na aplicação: `categories_user_name_idx` (nome único por usuário, case-insensitive), `push_subscriptions_user_endpoint` (uma assinatura por dispositivo/usuário), `notification_logs_dedup` (uma notificação por evento/ocorrência/usuário).
- `notification_logs.event_id → events(id) ON DELETE CASCADE`: excluir um evento remove automaticamente seu histórico de notificações, evitando logs órfãos (migration `09_notification_logs_integrity.sql`, Auditoria P1.3).

---

# Segurança do Frontend

### `escapeHtml`

Definida em `utils.js`:

```js
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

### Prevenção de XSS

O projeto não usa nenhum framework que escape automaticamente conteúdo interpolado em templates (React, Vue etc.) — é JavaScript vanilla manipulando o DOM diretamente. Onde dados fornecidos pelo usuário (título de evento, nome de categoria, localização, nome de perfil etc.) são inseridos via `innerHTML`, os módulos de view (`script.js`, `eventFormView.js`, `quickAdd.js`, `categoryView.js`, `accountView.js`, `aiPanelView.js`, `assistantView.js`, `academicCalendarEventsView.js`, `academicCalendarFilter.js`, `academicCalendarView.js`, `weekView.js`, `calendar.js`, `confirmDialog.js`, `pwa.js`, `toastService.js`) usam `escapeHtml()` para neutralizar caracteres especiais antes da interpolação — mitigando XSS refletido/persistido a partir de dados salvos pelo próprio usuário (ex.: título de evento contendo `<script>`).

### Tratamento de erros

`errorService.js` centraliza captura e categorização de erros (`window.onerror`, `unhandledrejection`, chamadas explícitas de `handleError()`):

- Categoriza erros em `auth`, `network`, `database`, `push`, `service_worker`, `ui`, `unknown` com base em heurísticas de mensagem/código.
- Converte mensagens técnicas em mensagens amigáveis em português, **sem expor stack traces, nomes de tabelas ou detalhes internos do Supabase ao usuário final** — mensagens originais só são exibidas se "parecerem" seguras (curtas, sem palavras como `TypeError`, `Cannot read`, `undefined`, sem quebras de linha).
- Em modo produção (`_devMode = false`), o log detalhado (`console.group`, stack completo) não é exibido; em modo dev, é.
- Mantém um buffer local de até 100 entradas (`getErrorLog()`), usado pela tela de diagnóstico — não é enviado a nenhum backend externo.

### Validações

- **Cadastro/senha:** mínimo de 8 caracteres, confirmação de senha, aceite obrigatório dos Termos de Uso — validados no frontend antes de chamar `supabase.auth.signUp()`.
- **Avatar:** allowlist de MIME types e limite de tamanho (2 MB) antes do upload (`avatarService.js`).
- **Perfil:** `upsertProfile()` filtra os campos recebidos contra uma allowlist explícita (`full_name`, `avatar_url`, `university`, `course`, `semester`, `timezone`, `notification_enabled`, `theme`) antes de enviar ao Supabase — impede que campos arbitrários sejam gravados via chamada da função, ainda que a RLS já restrinja a linha acessível.
- **IA (`ai-chat`):** validação de `type` contra uma lista fixa de prompts e limite de 500 eventos por requisição, do lado do servidor (Edge Function), não confiando apenas em validação de frontend.

### Content Security Policy

Declarada em `index.html` via `<meta http-equiv="Content-Security-Policy">` (não há servidor próprio para enviar o header HTTP equivalente — o site é estático, servido pelo GitHub Pages):

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;
style-src 'self';
img-src 'self' data: https://*.supabase.co;
font-src 'self';
connect-src 'self' https://*.supabase.co;
manifest-src 'self';
worker-src 'self';
base-uri 'self';
form-action 'self';
object-src 'none';
```

- **`script-src`** permite apenas o próprio origin e o build fixo do SDK Supabase servido pelo jsDelivr (`supabase.js`). Não há `'unsafe-inline'` nem `'unsafe-eval'` — o único `<script>` inline que existia em `index.html` (bootstrap de `pwa.js`) foi movido para dentro de `script.js` para viabilizar essa política sem enfraquecê-la.
- **`style-src`** não usa `'unsafe-inline'` — o único atributo `style="..."` inline do HTML (placeholder de carregamento do modal de Calendários Acadêmicos) foi convertido para a classe `.academic-loading` em `style.css`. Não há `<style>` inline nem CSS-in-JS.
- **`img-src`** inclui `data:` (avatar placeholder SVG gerado inline em `accountView.js`) e `https://*.supabase.co` (avatares enviados ao Storage).
- **`connect-src`** inclui `https://*.supabase.co` para todas as chamadas ao Supabase (Auth, PostgREST, Storage, Edge Functions incluindo `ai-chat`). O frontend nunca chama a API do Google Gemini diretamente — apenas a Edge Function `ai-chat` faz isso, do lado do servidor — então `generativelanguage.googleapis.com` não precisa (e não deve) constar em `connect-src`.
- **`object-src 'none'`** — a aplicação não usa `<object>`/`<embed>`/plugins.
- Diretivas que dependem de header HTTP (`frame-ancestors`, `report-uri`/`report-to`, `sandbox`) são ignoradas pelos navegadores quando a CSP é entregue via `<meta>` — por isso não constam na política acima; ficariam como possível melhoria futura caso o hosting passe a permitir configurar headers HTTP customizados.

---

# CI/CD

### GitHub Secrets

Usados pelos workflows em `.github/workflows/`:

| Secret | Usado em |
|---|---|
| `SUPABASE_URL` | `deploy.yml` (gera `config.js`) |
| `SUPABASE_ANON_KEY` | `deploy.yml` (gera `config.js`) |
| `VAPID_PUBLIC_KEY` | `deploy.yml` (gera `config.js`) |
| `SUPABASE_ACCESS_TOKEN` | `deploy-functions.yml` (autentica a Supabase CLI) |
| `SUPABASE_PROJECT_REF` | `deploy-functions.yml` (`--project-ref`) |

### Deploy

Três workflows:

- **`ci.yml`** — em todo push/PR para `main`: instala Node 20 e roda `npm test` (testes puros, sem rede/banco). Bloqueia merge se falhar.
- **`deploy.yml`** — em todo push para `main`: gera `config.js` a partir dos GitHub Secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`, mais `APP_URL` fixo apontando para a URL de produção), empacota os arquivos estáticos e publica no GitHub Pages via `actions/deploy-pages@v4`.
- **`deploy-functions.yml`** — disparado por push para `main` que altere `supabase/functions/**`, ou manualmente: usa `supabase/setup-cli@v1` e executa `supabase functions deploy ai-chat --project-ref $SUPABASE_PROJECT_REF`, autenticado via `SUPABASE_ACCESS_TOKEN`.

### Edge Functions no pipeline

```
push em main (altera supabase/functions/**)
        ↓
GitHub Actions — deploy-functions.yml
        ↓
Supabase CLI (autenticada via SUPABASE_ACCESS_TOKEN)
        ↓
supabase functions deploy ai-chat --project-ref $SUPABASE_PROJECT_REF
        ↓
Projeto Supabase — Edge Runtime atualizado
```

**Importante:** este workflow só faz deploy automático de **`ai-chat`**. As funções `send-push-notifications` e `delete-account` **não** têm deploy automatizado — precisam ser publicadas manualmente via `supabase functions deploy <nome>`. Ver "Auditoria".

### GitHub Actions

Nenhum workflow executa testes de segurança dedicados (SAST, dependency scanning, secret scanning automatizado) além do `npm test` funcional em `ci.yml`. Não há Dependabot configurado no repositório (não verificado neste documento além da ausência de arquivo `.github/dependabot.yml`).

---

# Boas Práticas

Práticas de segurança já em uso no projeto (nenhuma nova regra introduzida aqui):

- **RLS como principal barreira de autorização**, aplicada de forma consistente nas 8 tabelas de domínio.
- **Nenhuma chave privilegiada (`service_role`) ou de terceiros (`GEMINI_API_KEY`, VAPID privada) no frontend** — confinadas às Edge Functions.
- **Validação de JWT delegada ao Supabase** (`auth.getUser()`), evitando implementação própria (e potencialmente falha) de verificação de assinatura de token.
- **`escapeHtml()` sistemático** antes de interpolar dados do usuário via `innerHTML`.
- **Allowlists explícitas** de campos graváveis em `profileService.upsertProfile()` e de tipos de prompt/tamanho de payload em `ai-chat`.
- **Mensagens de erro genéricas para o usuário final**, com detalhes técnicos restritos ao modo dev/console.
- **UUIDs não sequenciais** como chave primária em todas as tabelas, evitando enumeração de registros.
- **`ON DELETE CASCADE`** consistente para exclusão completa de dados de um usuário a partir de `auth.users`, reforçando o fluxo de exclusão de conta mesmo em tabelas não explicitamente tratadas pela Edge Function.
- **Deduplicação em duas camadas** (checagem lógica + índice único no banco) para envio de notificações push, evitando reenvio acidental.
- **Fail-fast em segredos ausentes**: `ai-chat` responde `503` imediatamente se `GEMINI_API_KEY` não estiver configurada, sem tentar prosseguir.
- **Sessão nunca travada**: timers de segurança no frontend garantem que falhas de rede/autenticação sempre levem a um estado conhecido (tela de login), nunca a uma tela presa indefinidamente.

---

# Auditoria

Revisão da consistência entre autenticação, RLS, Edge Functions e secrets, sem qualquer alteração de código. Itens já identificados nas auditorias existentes (`BACKEND.md`, `DATABASE.md`) são consolidados aqui sob a ótica de segurança:

| Item | Categoria | Observação |
|---|---|---|
| CORS `Access-Control-Allow-Origin: *` em `delete-account` e `send-push-notifications` | Configuração permissiva | Essas duas Edge Functions aceitam requisições de qualquer origem. Isso não é, por si, uma falha de autorização — a barreira real é o JWT (`delete-account`) ou a ausência total de exposição a clientes externos (`send-push-notifications`, que só é chamada pelo scheduler) — mas é uma configuração mais permissiva do que restringir a origem ao domínio de produção do GitHub Pages. **Corrigido em `ai-chat`**: agora restringe `Access-Control-Allow-Origin` a uma allowlist (produção + localhost/127.0.0.1 para dev). |
| `model` do payload de `ai-chat` não validado contra allowlist | Validação de entrada | O parâmetro `model` enviado pelo cliente é repassado diretamente à URL do Gemini (`{model}:generateContent`) sem checagem contra uma lista de modelos permitidos. Não é um risco de vazamento de dados de outro usuário, mas permite que um cliente altere qual modelo Gemini é chamado usando a chave do servidor. |
| Deploy automatizado cobre apenas `ai-chat` | CI/CD | `deploy-functions.yml` só executa `supabase functions deploy ai-chat`. `send-push-notifications` e `delete-account` dependem de deploy manual — o código pode divergir do que está publicado se o deploy manual for esquecido após uma alteração. |
| Estilo de importação divergente entre Edge Functions | Consistência de manutenção | `ai-chat` e `send-push-notifications` importam `@supabase/supabase-js` via `npm:`; `delete-account` importa via `https://esm.sh/`. Funcionalmente equivalente, mas inconsistente — dificulta auditoria rápida do código das três funções. |
| Estilo de servidor divergente | Consistência de manutenção | `ai-chat`/`send-push-notifications` usam `Deno.serve` nativo; `delete-account` usa `serve` de `deno.land/std`. Sem impacto de segurança, mas é uma superfície extra a revisar em auditorias futuras. |
| Tabela `ai_metrics` provisionada mas não populada | Observabilidade | RLS e schema existem, mas nenhuma Edge Function insere métricas nela hoje — a telemetria de uso da IA fica só em `console.log`, sem trilha de auditoria persistida no banco. |
| Validação de tipo/tamanho de avatar apenas no frontend | Validação de entrada | `avatarService.js` valida MIME e tamanho antes do upload, mas não há constraint/trigger no Postgres/Storage revalidando isso no servidor além do comportamento padrão do Supabase Storage. |
| `profiles.created_at`/`updated_at` nullable | Consistência de schema | Diferente das demais tabelas (`NOT NULL`), não gera problema funcional pois ambos têm `DEFAULT now()`, mas quebra a convenção do restante do schema. |

### O que foi verificado e está consistente

- **Autenticação:** consistente entre `ai-chat` e `delete-account` — ambas exigem e validam JWT da mesma forma (`auth.getUser()`), falhando com `401` antes de qualquer efeito colateral.
- **RLS:** consistente — todas as 8 tabelas de domínio têm RLS habilitado, sem exceções encontradas; os padrões de política (direto, PK=FK, JOIN, leitura-only) são aplicados de forma coerente com a modelagem de cada tabela.
- **Edge Functions protegidas:** as duas funções expostas a chamadas de usuário final (`ai-chat`, `delete-account`) validam autenticação antes de processar qualquer dado; a função agendada (`send-push-notifications`) não é alcançável por um cliente externo autenticado como usuário — depende inteiramente do isolamento do agendador do Supabase e da posse do `service_role`, que nunca é exposto.
- **Secrets:** nenhum secret sensível (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, VAPID privada) foi encontrado versionado no repositório ou embutido em código do frontend; `config.js` está corretamente listado em `.gitignore`.

---

# Estado Atual

**Mecanismos de autenticação:**
- Supabase Auth com e-mail/senha (sem OAuth/social login).
- Sessão JWT + refresh token, gerenciada e renovada automaticamente pelo SDK `@supabase/supabase-js`.
- Confirmação de e-mail obrigatória no cadastro; recuperação de senha via link de uso único.
- Perfil (`profiles`) criado automaticamente por trigger (`SECURITY DEFINER`) no momento do cadastro.

**Mecanismos de autorização:**
- Row Level Security habilitado em 100% das tabelas de domínio (8 tabelas), com 26 políticas de tabela + 4 políticas de Storage.
- `auth.uid()` como fonte única de verdade de identidade em todas as políticas.
- Três padrões de política (direto por `user_id`, PK=FK, JOIN via tabela pai) aplicados conforme a modelagem de cada tabela.

**Edge Functions protegidas:**
- 3 Edge Functions totais; 2 exigem e validam JWT do usuário (`ai-chat`, `delete-account`) antes de qualquer processamento; 1 roda exclusivamente sob controle do agendador do Supabase com `service_role` (`send-push-notifications`).
- `service_role` usado apenas nas duas funções que genuinamente precisam de acesso administrativo ou cross-user.

**Uso de secrets:**
- 9 variáveis sensíveis/de configuração mapeadas (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).
- Nenhum secret sensível presente no repositório versionado ou no bundle do frontend.
- Único ponto de exposição pública deliberada: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY` — todos seguros para exposição por design do próprio Supabase/protocolo Web Push.

**Avaliação geral da arquitetura de segurança:**

A arquitetura de segurança do MedAgenda é coerente e adequada ao porte do projeto: delega autenticação e a maior parte da autorização a mecanismos nativos e testados do Supabase (Auth + RLS), minimiza a superfície de código privilegiado a três Edge Functions pequenas e auditáveis, e não versiona nem expõe segredos sensíveis ao cliente. As lacunas identificadas na auditoria — CORS permissivo nas Edge Functions, ausência de allowlist para o parâmetro `model` em `ai-chat`, deploy automatizado incompleto (apenas 1 de 3 funções), inconsistências de estilo entre Edge Functions e validação de upload apenas no frontend — são pontos de acabamento e monitoramento contínuo, não falhas estruturais que comprometam o isolamento de dados entre usuários hoje.
