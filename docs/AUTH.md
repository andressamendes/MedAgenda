# MedAgenda — Autenticação e Gestão de Usuários

Este documento descreve toda a arquitetura de autenticação, cadastro, recuperação de senha, gerenciamento de perfil e exclusão de conta.

---

## Fluxo de Autenticação

### Login

1. Usuário preenche e-mail e senha na tela inicial.
2. Frontend chama `supabase.auth.signInWithPassword()`.
3. Supabase valida as credenciais e retorna um JWT + refresh token.
4. O evento `SIGNED_IN` dispara `onAuthStateChange`, que carrega o app.
5. A sessão é persistida automaticamente no `localStorage` pelo SDK.

### Sessão Persistente

- O Supabase JS SDK renova o access token automaticamente via refresh token.
- Ao recarregar a página, `getSession()` restaura a sessão sem novo login.
- Sessões expiradas disparam `SIGNED_OUT` → redirecionamento para login.

### Logout

1. Usuário clica em "Sair".
2. Frontend chama `supabase.auth.signOut()`.
3. Tokens são invalidados. Evento `SIGNED_OUT` redireciona para login.

---

## Fluxo de Cadastro

1. Usuário acessa "Criar conta" na tela de login.
2. Preenche: nome completo, e-mail, senha (mín. 8 caracteres), confirmação de senha.
3. Aceita os Termos de Uso.
4. Frontend chama `supabase.auth.signUp()` com `data.full_name`.
5. Supabase envia e-mail de confirmação para o endereço informado.
6. O trigger `on_auth_user_created` cria automaticamente um registro em `public.profiles` com o nome fornecido.
7. App exibe a tela "Verifique seu e-mail".
8. Após clicar no link, o usuário é redirecionado de volta ao app (via `emailRedirectTo`).
9. O evento `SIGNED_IN` é disparado e a sessão é estabelecida.

### Configuração obrigatória no Supabase Dashboard

- **Authentication → URL Configuration → Site URL:** `https://andressamendes.github.io/MedAgenda/`
- **Redirect URLs:** adicione `https://andressamendes.github.io/MedAgenda/**` e `http://localhost:*`

> **Por que isso importa:** o Supabase usa o "Site URL" como fallback quando a URL fornecida em `emailRedirectTo` não está na lista de Redirect URLs. Se o Site URL estiver apontando para `localhost`, todos os links de e-mail (confirmação, recuperação de senha) vão redirecionar para `localhost` em produção.

### Configuração de APP_URL (obrigatória no config.js local)

A URL de redirecionamento é controlada pelo campo `APP_URL` em `config.js`:

| Ambiente | Valor de `APP_URL` |
|---|---|
| Desenvolvimento local | `http://localhost:8080` (ou a porta que você usar) |
| Produção (GitHub Pages) | `https://andressamendes.github.io/MedAgenda/` (definido automaticamente pelo `deploy.yml`) |

Nunca use `http://localhost:3000` (ou qualquer URL local) como `APP_URL` quando for testar o fluxo de e-mail com usuários reais — os links enviados por e-mail ficarão inacessíveis para eles.

---

## Recuperação de Senha

1. Usuário clica em "Esqueci minha senha".
2. Informa o e-mail cadastrado.
3. Frontend chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl })`.
4. Supabase envia e-mail com link de redefinição.
5. Usuário clica no link → é redirecionado ao app com hash `#type=recovery&access_token=...`.
6. O SDK dispara `onAuthStateChange` com `event === 'PASSWORD_RECOVERY'`.
7. App exibe a tela "Nova senha".
8. Usuário define nova senha → `supabase.auth.updateUser({ password })`.
9. App redireciona para login com mensagem de sucesso.

---

## Alteração de Senha (usuário autenticado)

Disponível em **Minha Conta → Alterar Senha**:

1. Usuário informa nova senha (mín. 8 caracteres) e confirmação.
2. Frontend chama `supabase.auth.updateUser({ password })` (sem necessidade da senha atual — o JWT já autentica).
3. Supabase atualiza a senha e emite novo JWT.

---

## Gerenciamento de Perfil

### Tabela `profiles`

Cada usuário tem exatamente um registro, criado automaticamente no cadastro via trigger.

```
id                   UUID  PK, FK → auth.users(id) ON DELETE CASCADE
full_name            TEXT
avatar_url           TEXT
university           TEXT
course               TEXT
semester             SMALLINT (1–12)
timezone             TEXT    DEFAULT 'America/Sao_Paulo'
notification_enabled BOOLEAN DEFAULT true
theme                TEXT    DEFAULT 'light' ('light' | 'dark' | 'system')
created_at           TIMESTAMPTZ
updated_at           TIMESTAMPTZ  (atualizado por trigger)
```

### Edição de perfil

1. Usuário abre **Minha Conta** no header.
2. `getProfile()` carrega o registro do Supabase.
3. Usuário edita os campos e clica em "Salvar perfil".
4. `upsertProfile()` faz upsert na tabela `profiles`.

---

## Avatar

### Setup (Supabase Dashboard)

1. Vá em **Storage → New Bucket**.
2. Nome: `avatars` | Visibilidade: **Public** (permite URLs públicas).
3. Execute `sql/06_storage.sql` no editor SQL do Supabase para criar as políticas de RLS.

### Upload

1. Usuário seleciona arquivo na seção "Foto de Perfil".
2. `uploadAvatar(file)` valida tipo (JPG/PNG/WebP/GIF) e tamanho (máx. 2 MB).
3. Arquivo é enviado para `storage/avatars/{user_id}/avatar.{ext}` com `upsert: true`.
4. URL pública é gerada com parâmetro `?v=timestamp` (evita cache do navegador).
5. `upsertProfile({ avatar_url })` salva a URL no perfil.

### Remoção

1. `removeAvatar()` lista todos os arquivos na pasta do usuário e os remove.
2. `upsertProfile({ avatar_url: null })` limpa o campo no perfil.

---

## Exclusão de Conta

### Fluxo

1. Usuário acessa **Minha Conta → Zona de Perigo → Excluir minha conta**.
2. Confirmação dupla via dialog.
3. Frontend chama `supabase.functions.invoke('delete-account')`.
4. A Edge Function (com service role key) exclui:
   - `notification_logs`
   - `push_subscriptions`
   - `events`
   - `categories`
   - Arquivos de avatar no Storage
   - O usuário em `auth.users` (cascata apaga `profiles` via FK)
5. Frontend chama `supabase.auth.signOut()`.

### Deploy da Edge Function

```bash
# Instalar Supabase CLI
npm install -g supabase

# Fazer login
supabase login

# Vincular ao projeto
supabase link --project-ref SEU_PROJECT_REF

# Deploy
supabase functions deploy delete-account

# Não é necessário configurar segredos adicionais —
# SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY
# são injetados automaticamente pelo Supabase.
```

---

## Políticas RLS

### Tabela `profiles`

| Policy | Operação | Condição |
|---|---|---|
| `profiles_select_own` | SELECT | `auth.uid() = id` |
| `profiles_insert_own` | INSERT | `auth.uid() = id` |
| `profiles_update_own` | UPDATE | `auth.uid() = id` |
| `profiles_delete_own` | DELETE | `auth.uid() = id` |

### Storage `avatars`

| Policy | Operação | Condição |
|---|---|---|
| `avatars_insert_own` | INSERT | `user_id` = primeiro segmento do caminho |
| `avatars_update_own` | UPDATE | `user_id` = primeiro segmento do caminho |
| `avatars_delete_own` | DELETE | `user_id` = primeiro segmento do caminho |
| `avatars_select_public` | SELECT | público (bucket público) |

---

## Módulos JavaScript

| Arquivo | Responsabilidade |
|---|---|
| `auth.js` | signIn, signUp, signOut, sendPasswordReset, updatePassword, onAuthStateChange |
| `profileService.js` | getProfile, upsertProfile |
| `avatarService.js` | uploadAvatar, removeAvatar |
| `accountView.js` | Modal "Minha Conta": perfil, avatar, senha, exclusão de conta |
| `supabase.js` | Client singleton, currentUserId() |

---

## Configuração do Ambiente

### Supabase Dashboard

| Configuração | Valor |
|---|---|
| Site URL | `https://andressamendes.github.io/MedAgenda/` |
| Redirect URLs | `https://andressamendes.github.io/MedAgenda/`, `http://localhost:*` |
| Confirm email | Habilitado |
| Storage bucket | `avatars` (público) |

### GitHub Secrets (para deploy no GitHub Pages)

| Secret | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima pública |
| `VAPID_PUBLIC_KEY` | Chave pública VAPID para Push |

> `APP_URL` **não é um Secret** — seu valor de produção (`https://andressamendes.github.io/MedAgenda/`) é fixo e injetado diretamente pelo `deploy.yml`.
