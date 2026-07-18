# Deploy — Anoti

Guia completo de publicação da Anoti no GitHub Pages.

---

## URL de produção

```
https://andressamendes.github.io/MedAgenda/
```

---

## Arquitetura de deploy

```
GitHub repo (main)
      │
      ▼
GitHub Actions — workflow: deploy.yml
      │  1. Cria config.js a partir dos Secrets
      │  2. Empacota todos os arquivos estáticos
      │  3. Publica no GitHub Pages
      ▼
GitHub Pages (estático)
      │  HTML + CSS + JS + Service Worker
      ▼
Supabase (backend)
      │  PostgreSQL + Auth + Edge Functions
      ▼
Usuário final
```

---

## Pré-requisitos

- Repositório no GitHub (já configurado)
- Projeto no Supabase com as migrations aplicadas
- Chaves VAPID geradas (opcional, para Push Notifications)

---

## 1. Configurar o Supabase

### 1.1 Criar o projeto

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Aguarde o banco de dados inicializar

### 1.2 Executar as migrations

No SQL Editor do Supabase, execute nesta ordem:

```sql
-- Arquivo: sql/02_categories.sql
-- Arquivo: sql/03_recurrence.sql
-- Arquivo: sql/04_push_notifications.sql
```

### 1.3 Configurar autenticação

Em **Authentication → URL Configuration**:

- **Site URL:** `https://andressamendes.github.io/MedAgenda/`
- **Redirect URLs:** `https://andressamendes.github.io/MedAgenda/**`

Em **Authentication → Providers → Email**:
- Confirmar que o provider Email está habilitado

### 1.4 Configurar CORS (se necessário)

O Supabase aceita requisições de qualquer origem por padrão via anon key.
Nenhuma configuração adicional de CORS é necessária para a anon key.

---

## 2. Configurar os GitHub Secrets

No repositório GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Descrição | Onde encontrar |
|--------|-----------|----------------|
| `SUPABASE_URL` | URL do projeto Supabase | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Chave pública anon | Project Settings → API → anon public |
| `VAPID_PUBLIC_KEY` | Chave pública VAPID | Gerada com `npx web-push generate-vapid-keys` |

> O `VAPID_PUBLIC_KEY` é opcional. Deixe vazio para desativar Push Notifications.

---

## 3. Habilitar GitHub Pages

No repositório GitHub:
**Settings → Pages → Source → GitHub Actions**

Pronto. O deploy acontece automaticamente a cada push na branch `main`.

---

## 4. Deploy

### Deploy automático (produção)

Todo push na branch `main` dispara o workflow `.github/workflows/deploy.yml`:

1. Cria o arquivo `config.js` a partir dos Secrets configurados
2. Empacota o site estático
3. Publica no GitHub Pages

O status do deploy pode ser acompanhado em:
**Actions → Deploy — GitHub Pages**

### Deploy manual

```
GitHub → Actions → Deploy — GitHub Pages → Run workflow
```

---

## 5. Executar localmente

### 5.1 Clonar e configurar

```bash
git clone https://github.com/andressamendes/medagenda.git
cd medagenda
cp config.example.js config.js
# Editar config.js com suas credenciais do Supabase
# Ajustar APP_URL para a porta local que você usar (padrão: http://localhost:8080)
```

### 5.2 Servir localmente

Como o projeto usa ES Modules (`type="module"`), é necessário um servidor HTTP — não funciona via `file://`:

```bash
# Python (qualquer versão 3.x)
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Instalar extensão "Live Server" e clicar em "Go Live"
```

Acesse: `http://localhost:8080`

---

## 6. Push Notifications — configuração completa

### 6.1 Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

Saída esperada:
```
Public Key: BNx...abc
Private Key: def...xyz
```

### 6.2 Configurar no Supabase (Edge Function)

```bash
supabase secrets set VAPID_PUBLIC_KEY="BNx...abc"
supabase secrets set VAPID_PRIVATE_KEY="def...xyz"
supabase secrets set VAPID_SUBJECT="mailto:seu@email.com"
```

### 6.3 Deploy da Edge Function

```bash
supabase functions deploy send-push-notifications
```

### 6.4 Agendar execução (a cada minuto)

No Supabase Dashboard:
**Database → Extensions → pg_cron** (habilitar)

```sql
SELECT cron.schedule(
  'send-push-notifications',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
  $$
);
```

---

## 7. Checklist de validação pós-deploy

Após cada deploy, validar:

- [ ] App carrega em `https://andressamendes.github.io/MedAgenda/`
- [ ] Login com email/senha funciona
- [ ] Logout funciona
- [ ] Criar compromisso funciona
- [ ] Editar compromisso funciona
- [ ] Excluir compromisso funciona
- [ ] Calendário mensal exibe eventos
- [ ] Agenda semanal exibe eventos
- [ ] Categorias personalizadas funcionam
- [ ] Recorrência funciona (criar evento recorrente)
- [ ] PWA instalável (botão "Instalar Anoti" aparece)
- [ ] Modo offline funciona (ativar modo avião e recarregar)
- [ ] Console sem erros críticos

---

## 8. Variáveis de ambiente

| Variável | Ambiente | Como configurar |
|----------|----------|-----------------|
| `SUPABASE_URL` | Produção (GitHub) | GitHub Secret |
| `SUPABASE_ANON_KEY` | Produção (GitHub) | GitHub Secret |
| `APP_URL` | Produção (GitHub) | Fixo no `deploy.yml` (`https://andressamendes.github.io/MedAgenda/`) |
| `VAPID_PUBLIC_KEY` | Produção (GitHub) | GitHub Secret |
| `SUPABASE_URL` | Local | `config.js` (não versionado) |
| `SUPABASE_ANON_KEY` | Local | `config.js` (não versionado) |
| `APP_URL` | Local | `config.js` — use `http://localhost:PORTA` |
| `VAPID_PUBLIC_KEY` | Local | `config.js` (não versionado) |

**Regra:** nunca versionar `config.js`. Ele está no `.gitignore`.

### Por que APP_URL existe

`APP_URL` é a URL base enviada nos links de e-mail (confirmação de conta, recuperação de senha, alteração de e-mail). Ela é definida explicitamente no `config.js` para garantir que os links sempre apontem para o destino correto, independentemente de onde o navegador está executando o código no momento do envio.

Sem `APP_URL`, a URL seria calculada via `window.location` — o que fazia com que e-mails enviados durante testes locais tivessem links apontando para `localhost`, inacessíveis para usuários reais.

---

## 9. Arquitetura de branches

```
feature/...  →  PR  →  CI (testes automáticos)
                          │
                          ▼ merge
                        main  →  Deploy automático → GitHub Pages
```

- Cada PR executa os testes (`.github/workflows/ci.yml`)
- Merge na `main` dispara o deploy (`.github/workflows/deploy.yml`)

---

## 10. Solução de problemas

### App não carrega após deploy

1. Verificar status em **Actions → Deploy — GitHub Pages**
2. Confirmar que **Settings → Pages → Source** está em **GitHub Actions**
3. Aguardar 1–2 minutos para propagação do CDN

### Login não funciona em produção

1. Confirmar `SUPABASE_URL` e `SUPABASE_ANON_KEY` nos Secrets
2. Verificar **Authentication → URL Configuration** no Supabase:
   - Site URL: `https://andressamendes.github.io/MedAgenda/`
   - Redirect URLs: `https://andressamendes.github.io/MedAgenda/**`

### PWA não instalável

1. O app deve ser acessado via HTTPS (GitHub Pages já usa HTTPS)
2. O Service Worker precisa estar registrado sem erros (verificar console)
3. O manifest precisa ser válido (verificar em DevTools → Application → Manifest)

### Erros 404 em assets

Todos os caminhos no projeto usam referências relativas (`./arquivo.js`), compatíveis com qualquer subdiretório. Se houver 404, verificar se o arquivo existe no repositório.

### Service Worker com cache desatualizado

Quando o SW é atualizado (mudança no `CACHE_VERSION`), o banner "Nova versão disponível" aparece. Clicar em "Atualizar agora" força a atualização.

Para forçar limpeza manual no DevTools:
**Application → Storage → Clear site data**
