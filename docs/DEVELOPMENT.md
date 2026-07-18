# Desenvolvimento do Anoti

> Guia oficial para desenvolver, manter e evoluir o Anoti. Este documento reflete o estado atual do repositório e serve como referência para qualquer pessoa que vá contribuir com o projeto.

---

## Visão Geral

### Organização do projeto

O Anoti é mantido por um time pequeno (essencialmente um único mantenedor, `andressamendes`) e organizado como um monorepo simples: frontend, migrations SQL e Edge Functions convivem no mesmo repositório Git, sem separação em múltiplos pacotes/workspaces. Não há `node_modules` de produção — o `package.json` existe apenas para padronizar os scripts de teste.

### Filosofia de desenvolvimento

- **Sem build step.** O frontend é servido como está: HTML, CSS e JavaScript puro com ES Modules nativos do navegador. Não há transpilação, bundling ou minificação.
- **Sem framework de UI.** Nenhuma dependência de React/Vue/Angular. A UI é manipulada diretamente via DOM.
- **BaaS ao invés de backend próprio.** Toda a persistência, autenticação e autorização são delegadas ao Supabase (PostgreSQL + Auth + Storage + Edge Functions). Não existe servidor de aplicação mantido pelo time.
- **RLS como camada de autorização.** As regras de "quem pode ver/alterar o quê" vivem no banco (Row Level Security), não em middlewares de aplicação.
- **Edge Functions apenas onde é estritamente necessário.** Usadas somente para os três casos que exigem segredo de servidor ou privilégio elevado: chamar a API do Gemini, enviar push agendado, e excluir conta.
- **Documentação como parte do processo.** O projeto mantém documentação extensa em `docs/`, escrita à medida que cada etapa é implementada, incluindo seções de "Auditoria" que registram inconsistências encontradas sem necessariamente corrigi-las de imediato.

### Arquitetura adotada

```
Usuário
  │
  ▼
GitHub Pages (frontend estático: HTML + CSS + JS)
  │
  ▼
Supabase (Auth + PostgreSQL com RLS + Storage + Edge Functions)
  │
  ├─► Google Gemini API      (via Edge Function ai-chat)
  └─► Web Push (navegadores) (via Edge Function send-push-notifications)
```

Para o detalhamento completo da arquitetura, ver [`ARCHITECTURE.md`](ARCHITECTURE.md), [`BACKEND.md`](BACKEND.md) e [`FRONTEND.md`](FRONTEND.md).

### Stack utilizada

| Camada           | Tecnologia                                                |
|------------------|------------------------------------------------------------|
| Frontend         | HTML5, CSS3, JavaScript ES6+ (ES Modules nativos, sem framework) |
| Backend          | Supabase (PostgreSQL + Auth + Storage + Edge Functions)   |
| Edge Functions   | Deno (TypeScript/JavaScript), hospedadas pelo Supabase    |
| IA               | Google Gemini API (`gemini-2.5-flash`), acessada apenas via Edge Function |
| Push             | Web Push Protocol (W3C) + VAPID                           |
| PWA              | Service Worker + Web App Manifest                         |
| Hospedagem       | GitHub Pages (frontend) + Supabase (backend)               |
| Testes           | Node.js nativo (`node --experimental-vm-modules` + módulo `assert`) |
| CI/CD            | GitHub Actions                                             |

---

## Requisitos

Para desenvolver localmente, são necessários:

| Ferramenta | Versão mínima | Uso |
|---|---|---|
| **Node.js** | `>=18` (definido em `package.json` → `engines`) | Rodar os testes (`npm test`) |
| **npm** | Distribuído com o Node.js | Executar os scripts definidos em `package.json` |
| **Supabase CLI** | Última versão estável | `supabase login`, `supabase link`, deploy de Edge Functions, `supabase secrets set` |
| **Git** | Qualquer versão recente | Controle de versão |
| **Conta GitHub** | — | Hospedar o repositório, abrir PRs, disparar GitHub Actions e publicar no GitHub Pages |
| **Conta Supabase** | — | Criar o projeto de backend (PostgreSQL, Auth, Storage, Edge Functions) |
| **Conta Google AI Studio** | — | Gerar a `GEMINI_API_KEY` usada pela Edge Function `ai-chat` |

### Ferramentas recomendadas

- Um servidor HTTP estático para desenvolvimento local, por exemplo:
  - `python3 -m http.server 8080`
  - `npx serve .`
  - Extensão "Live Server" do VS Code
- Editor com suporte a ES Modules e TypeScript (para as Edge Functions em Deno) — VS Code é o mais usado no projeto.
- `npx web-push generate-vapid-keys` — geração das chaves VAPID para Push Notifications (não requer instalação prévia).

---

## Configuração Inicial

### 1. Clonar o repositório

```bash
git clone https://github.com/andressamendes/medagenda.git
cd medagenda
```

### 2. Instalar dependências

O projeto não possui dependências de runtime instaláveis via `npm install` — não há `dependencies` declaradas em `package.json`. O único uso do npm é para rodar os scripts de teste (que utilizam apenas módulos nativos do Node.js).

```bash
npm install   # opcional; não há pacotes a instalar hoje, mas garante que engines seja respeitado
```

### 3. Configurar variáveis locais

Copie o arquivo de exemplo e preencha com as credenciais do seu projeto Supabase:

```bash
cp config.example.js config.js
```

Edite `config.js`:

```js
export const SUPABASE_URL      = "https://SEU-PROJETO.supabase.co";
export const SUPABASE_ANON_KEY = "sua-anon-key";
export const APP_URL           = "http://localhost:8080"; // ajuste para a porta usada localmente
export const VAPID_PUBLIC_KEY  = ""; // opcional — deixe vazio para desativar Push
```

`config.js` está listado em `.gitignore` e **nunca deve ser versionado**.

### 4. Configurar o Supabase (novo projeto)

1. Criar um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, executar as migrations em `sql/` na ordem numérica (ver seção "Banco de Dados").
3. Em **Authentication → URL Configuration**:
   - Site URL: a URL de produção (`https://andressamendes.github.io/MedAgenda/`) ou a URL local durante desenvolvimento.
   - Redirect URLs: a mesma URL com `/**`.
4. Copiar **Project URL** e **anon public key** (Project Settings → API) para `config.js`.

### 5. Login e link do projeto (Supabase CLI)

Necessário apenas para quem for fazer deploy manual de Edge Functions ou rodar migrations via CLI:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
```

### 6. Configurar secrets das Edge Functions

```bash
supabase secrets set GEMINI_API_KEY="sua-chave-gemini"
supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:seu@email.com"
```

O script `setup-push.sh` automatiza a configuração completa de Push (secrets, deploy da função, migration e agendamento via `pg_cron`), lendo os valores de variáveis de ambiente — nunca de valores hardcoded no script.

### 7. Configurar os Secrets do GitHub (para deploy)

Em **Settings → Secrets and variables → Actions** do repositório:

| Secret | Usado por |
|---|---|
| `SUPABASE_URL` | `deploy.yml` |
| `SUPABASE_ANON_KEY` | `deploy.yml` |
| `VAPID_PUBLIC_KEY` | `deploy.yml` (opcional) |
| `SUPABASE_ACCESS_TOKEN` | `deploy-functions.yml` |
| `SUPABASE_PROJECT_REF` | `deploy-functions.yml` |

### 8. Servir localmente

Como o projeto usa `<script type="module">`, é obrigatório um servidor HTTP (não funciona via `file://`):

```bash
python3 -m http.server 8080
# ou
npx serve .
```

Acesse `http://localhost:8080`.

---

## Estrutura do Projeto

```
medagenda/
├── index.html                    # SPA — único ponto de entrada HTML
├── style.css                     # Estilos globais (único arquivo CSS)
├── script.js                     # Bootstrap e controlador principal
├── manifest.webmanifest          # Manifesto PWA
├── service-worker.js             # Cache offline + handler de push
├── config.js                     # Credenciais locais (não versionado)
├── config.example.js             # Template de configuração (versionado)
├── package.json                  # Scripts de teste (sem dependências de runtime)
├── CHANGELOG.md                  # Histórico de versões e correções de bugs
├── setup-push.sh                 # Script de setup automatizado de Push Notifications
│
├── *Service.js                   # Camada de acesso a dados (Supabase)
│   (eventService, categoryService, academicCalendarService,
│    profileService, avatarService, notificationService, pushService)
│
├── *View.js                      # Camada de UI/DOM
│   (authView, navigationView, eventFormView, categoryView, accountView,
│    academicCalendarView, academicCalendarEventsView, academicCalendarICSView,
│    assistantView, aiPanelView)
│
├── Módulos de domínio puro       # Sem DOM, sem rede
│   (recurrence.js, smartAssistant.js, analytics.js, utils.js,
│    icsImporter.js, icsExporter.js)
│
├── calendar.js / weekView.js     # Renderização das views de calendário
├── quickAdd.js / confirmDialog.js# Modais reutilizáveis
├── auth.js / supabase.js         # Cliente Supabase e wrapper de autenticação
├── pwa.js                        # Registro do Service Worker / instalação PWA
├── errorService.js               # Tratamento e classificação de erros
├── telemetryService.js           # Buffer de eventos de telemetria (em memória)
├── diagnosticService.js          # Checagens de saúde do sistema
├── toastService.js               # Notificações toast
│
├── config/
│   └── ai.js                     # Configuração estática do gateway de IA (sem segredos)
│
├── services/ai/                  # Subsistema de IA (Gemini)
│   ├── aiService.js               # Gateway público — único ponto de entrada de IA
│   ├── providers/geminiProvider.js
│   ├── prompts/                   # weeklySummary.js, studySuggestion.js, scheduleAnalysis.js
│   └── parsers/responseParser.js
│
├── supabase/functions/           # Edge Functions (Deno)
│   ├── _shared/recurrence-core.js # Lógica de recorrência canônica (compartilhada com o frontend)
│   ├── ai-chat/index.ts
│   ├── send-push-notifications/index.ts
│   └── delete-account/index.ts
│
├── sql/                          # Migrations do banco (numeradas, aplicadas manualmente)
│   ├── 01_events.sql
│   ├── 02_categories.sql
│   ├── 03_recurrence.sql
│   ├── 04_push_notifications.sql
│   ├── 05_profiles.sql
│   ├── 06_storage.sql
│   ├── 07_academic_calendar.sql
│   └── 08_ai_metrics.sql
│
├── tests/                        # Testes automatizados (Node.js nativo)
│   ├── utils.test.js
│   ├── recurrence.test.js
│   ├── recurrence-notification.test.js
│   ├── smartAssistant.test.js
│   └── analytics.test.js
│
├── icons/                        # Ícones PWA (72px a 512px)
│
├── .github/workflows/            # CI/CD
│   ├── ci.yml
│   ├── deploy.yml
│   └── deploy-functions.yml
│
└── docs/                         # Documentação técnica
```

### Responsabilidade de cada pasta

- **Raiz (`*.js`)** — não há pastas formais `/views` ou `/services`; a separação entre camadas é conceitual, indicada pelo sufixo do nome do arquivo (`*Service.js` = dados, `*View.js` = UI, sem sufixo = domínio puro ou infraestrutura).
- **`config/`** — configurações estáticas que não são segredos (hoje, apenas os parâmetros do modelo de IA).
- **`services/ai/`** — todo o subsistema de IA, isolado do restante do frontend, dividido em gateway, providers, prompts e parsers.
- **`supabase/functions/`** — todo o código de servidor do projeto (Deno). Não existe `supabase/migrations/` gerenciado pela CLI — as migrations vivem em `/sql`.
- **`sql/`** — migrations numeradas, aplicadas manualmente pelo SQL Editor do Supabase Dashboard, cada uma autocontida.
- **`tests/`** — testes de módulos puramente lógicos (sem Supabase, sem DOM).
- **`icons/`** — ícones exigidos pelo `manifest.webmanifest`.
- **`docs/`** — documentação técnica, um arquivo por domínio.

---

## Fluxo de Desenvolvimento

```
Nova feature
     │
     ▼
Nova branch (a partir de main)
     │
     ▼
Implementação (frontend, SQL e/ou Edge Function conforme o escopo)
     │
     ▼
Testes (npm test — para lógica pura; testes manuais no navegador para UI)
     │
     ▼
Commit (mensagens descritivas, em português, referenciando a etapa/bug quando aplicável)
     │
     ▼
Push da branch
     │
     ▼
Pull Request (para main)
     │
     ▼
CI (.github/workflows/ci.yml executa `npm test` automaticamente)
     │
     ▼
Review
     │
     ▼
Merge em main
     │
     ▼
Deploy automático
     ├─► deploy.yml           → GitHub Pages (sempre, a cada push em main)
     └─► deploy-functions.yml → Supabase (apenas se supabase/functions/** mudou)
```

Alterações em `sql/*.sql` **não** disparam nenhum deploy automático — precisam ser aplicadas manualmente no SQL Editor do Supabase após o merge (ver seção "Banco de Dados").

---

## Convenções

Convenções observadas no código atual do projeto (não são novas regras — apenas o padrão já em uso):

- **Nomes de arquivo:** `camelCase.js` para módulos JavaScript (`eventFormView.js`, `academicCalendarICSView.js`). Documentação em `docs/` usa `SCREAMING_SNAKE_CASE.md`, com `ARCHITECTURE.md` e `DATABASE.md` como referências únicas de arquitetura e banco (documentos PT/EN divergentes anteriores — `ARQUITETURA.md`, `DATA_MODEL.md`, `BANCO_DE_DADOS.md` — foram convertidos em redirecionamentos na consolidação de documentação técnica).
- **Nomes de funções e variáveis:** `camelCase` em todo o código JavaScript (`createEvent`, `expandEvents`, `currentUserId`). Constantes de configuração usam `SCREAMING_SNAKE_CASE` (`AI_CONFIG`, `SUPABASE_URL`).
- **Sufixos de arquivo por papel:** `*Service.js` para acesso a dados, `*View.js` para UI/DOM. Módulos sem sufixo são domínio puro (`recurrence.js`, `utils.js`, `analytics.js`) ou infraestrutura (`supabase.js`, `pwa.js`).
- **ES Modules:** todo o frontend usa `import`/`export` nativo (`type="module"` em `index.html`, `"type": "module"` em `package.json`). Não há `require`/`module.exports`.
- **Imports:** relativos (`./arquivo.js`), sempre com extensão `.js` explícita (exigido por ES Modules nativos no navegador).
- **Exports nomeados:** a maioria dos módulos usa `export function`/`export const` nomeados; não há uso predominante de `export default`.
- **Organização interna dos arquivos:** estado privado do módulo (`_variavel`) declarado no topo, seguido de funções privadas, seguido de funções exportadas ao final ou intercaladas conforme a lógica do módulo.
- **Comentários:** usados com moderação, priorizando explicar o "porquê" (ex: por que `APP_URL` existe, por que uma allowlist de campos é usada em `upsertProfile`) e não o "o quê". Cabeçalhos de arquivos SQL frequentemente documentam dependências e ordem de aplicação.
- **Idioma:** código (identificadores) em inglês; comentários, mensagens de UI, documentação e mensagens de commit em português.

---

## Banco de Dados

### Como criar migrations

- Cada migration é um arquivo `.sql` autocontido em `/sql`, numerado sequencialmente (`NN_nome_descritivo.sql`).
- O cabeçalho do arquivo documenta o propósito e, quando relevante, dependências de outras migrations.
- Migrations habilitam RLS e declaram as políticas de acesso na própria migration que cria a tabela (não em um arquivo separado).

### Ordem das migrations

Aplicar sempre em ordem numérica crescente, pois migrations posteriores podem depender de tabelas/funções criadas anteriormente (ex: `update_updated_at()` é reutilizada por várias tabelas; `academic_events` depende de `academic_calendars`):

```
01_events.sql
02_categories.sql
03_recurrence.sql
04_push_notifications.sql
05_profiles.sql
06_storage.sql
07_academic_calendar.sql
08_ai_metrics.sql
09_notification_logs_integrity.sql
10_ai_metrics_observability.sql
11_activity_sessions.sql
12_time_goals.sql
13_reviews.sql
14_schema_version.sql
15_questions.sql
16_review_session_link.sql
17_activity_sessions_paused_time.sql
18_reflections.sql
19_activity_sessions_running_unique.sql
20_monthly_goal_minutes_integer.sql
```

Detalhamento de cada migration (objetivo, tabelas, dependências): [`DATABASE.md`](DATABASE.md).

Aplicação: SQL Editor do Supabase Dashboard (não há uso da CLI de migrations do Supabase — `supabase db push`/`migration` — neste projeto).

### Quando alterar SQL

- Nova tabela ou coluna → nova migration numerada (não editar migrations já aplicadas em produção).
- Nova política de RLS → incluída na mesma migration da tabela, sempre com `auth.uid()` como base de comparação.
- Mudança que afeta a lógica de recorrência → também revisar `supabase/functions/_shared/recurrence-core.js` e `recurrence.js` (frontend), que devem permanecer sincronizados.

### Boas práticas em uso

- RLS habilitado em toda tabela de domínio, sem exceção.
- Toda tabela de usuário referencia `auth.users(id)` com `ON DELETE CASCADE`.
- Índices compostos por `(user_id, data)` para as consultas mais frequentes.
- Trigger compartilhada `update_updated_at()` para manter `updated_at` consistente sem repetir lógica em cada tabela.
- Cada migration documenta em seu cabeçalho se é opcional e como aplicá-la manualmente.

Detalhamento completo do schema: [`DATABASE.md`](DATABASE.md).

---

## Edge Functions

O projeto possui 3 Edge Functions, todas em Deno, hospedadas pelo Supabase, em `supabase/functions/`:

| Função | Responsabilidade |
|---|---|
| `ai-chat` | Proxy autenticado para a API do Google Gemini |
| `send-push-notifications` | Envio agendado de notificações Web Push |
| `delete-account` | Exclusão completa e irreversível de conta |

### Criação

Cada função vive em sua própria pasta com um `index.ts`. Lógica compartilhada com o frontend (expansão de recorrência) fica em `supabase/functions/_shared/recurrence-core.js`, importada tanto pela Edge Function `send-push-notifications` quanto pelo `recurrence.js` do frontend.

### Deploy

**Automático:** o workflow `deploy-functions.yml` faz deploy de `ai-chat` a cada push em `main` que altere `supabase/functions/**`. As outras duas funções (`send-push-notifications`, `delete-account`) **não** têm deploy automatizado — é uma lacuna conhecida do pipeline (ver seção "Auditoria").

**Manual (via CLI), necessário para as outras funções ou para testar antes do merge:**

```bash
supabase functions deploy ai-chat
supabase functions deploy send-push-notifications
supabase functions deploy delete-account
```

### Secrets

Configurados via `supabase secrets set`, nunca versionados:

| Secret | Função que usa |
|---|---|
| `GEMINI_API_KEY` | `ai-chat` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `send-push-notifications` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `ai-chat`, `delete-account` (validação de JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | `send-push-notifications`, `delete-account` |

### Testes

Não há testes automatizados para as Edge Functions no repositório — o diretório `tests/` cobre apenas lógica do frontend. Validação é feita manualmente: chamar a função via `supabase functions serve` localmente ou testar após deploy, observando a resposta HTTP e os logs.

### Logs

Disponíveis em **Supabase Dashboard → Project → Edge Functions → {função} → Logs**. As três funções usam `console.log`/`console.error`/`console.warn` como único mecanismo de observabilidade — não há agregador externo de logs configurado.

---

## Frontend

### Estrutura

Aplicação estática single-page, sem build step, com roteamento por visibilidade de elementos DOM (não há troca de URL). `index.html` define toda a estrutura estática; `script.js` é o bootstrap que inicializa os demais módulos.

### Módulos

Classificados em três camadas conceituais (sem pastas formais para a maioria):

- **Views** (`*View.js`) — manipulação de DOM e interação com o usuário.
- **Services** (`*Service.js`) — chamadas ao Supabase; retornam Promises, não tocam no DOM.
- **Domínio puro** (`recurrence.js`, `smartAssistant.js`, `analytics.js`, `utils.js`) — funções sem efeitos colaterais.

### Services

Cada domínio de dados tem seu próprio service dedicado (`eventService.js`, `categoryService.js`, `academicCalendarService.js`, `profileService.js`, `avatarService.js`), todos usando `currentUserId()` de `supabase.js` para escopar as consultas ao usuário autenticado.

### Views

Cada modal/página tem sua própria view (`eventFormView.js`, `categoryView.js`, `accountView.js`, `academicCalendarView.js`, `assistantView.js`, `aiPanelView.js`, `navigationView.js`, `authView.js`), inicializada explicitamente por `script.js` na sequência de bootstrap.

### Componentes reutilizáveis

`confirmDialog.js` (diálogo de confirmação genérico, retorna `Promise<boolean>`) e `toastService.js` (notificações temporárias) são usados por praticamente todos os módulos de UI.

Detalhamento completo módulo a módulo: [`FRONTEND.md`](FRONTEND.md).

---

## Testes

### Testes existentes

Organizados em quatro camadas (Auditoria A4 + A2.5), cada uma isolada das demais via `t.mock.module()` — nenhuma bate em Supabase ou em uma Edge Function real:

| Camada | Pasta | Cobertura |
|---|---|---|
| Domínio puro | `tests/*.test.js` (raiz) | `utils.js`, `recurrence.js`, timing de notificações, `smartAssistant.js`, `analytics.js` |
| Services | `tests/services/*.test.js` | `eventService.js`, `categoryService.js`, `academicCalendarService.js`, `notificationService.js`, `auth.js` — CRUD, escopo por `user_id`, propagação de erros do Supabase (mockado via `tests/mocks/supabaseMock.js`) |
| Views | `tests/views/*.test.js` | `modalController.js`, `categoryView.js`, `academicCalendarView.js`, `settingsModal.js`, `navigationView.js`, `aiPanelView.js` (IA mockada via `tests/mocks/aiMock.js`), `eventFormView.js` (criar/editar/excluir compromisso), `weekView.js` (agenda semanal), `calendar.js` (calendário mensal) |
| Integração | `tests/integration/*.test.js` | Login/logout de ponta a ponta (`authFlow.test.js`) |

Views e integração usam `tests/mocks/domFixture.js`, que carrega o `index.html` real via `jsdom` — os testes exercitam a marcação de produção, não uma cópia paralela.

### Como executar

```bash
npm test                # roda todos os testes em sequência
npm run test:unit       # apenas módulos de domínio puro
npm run test:services   # apenas tests/services/
npm run test:views      # apenas tests/views/
npm run test:integration # apenas tests/integration/
```

Os testes usam o módulo nativo `assert` e `node:test` (com `--experimental-vm-modules --experimental-test-module-mocks`), sem qualquer framework de teste externo (não há Jest, Mocha, Vitest etc. instalado, apesar de `FRONTEND.md` mencionar "Jest" na descrição da pasta `tests/` — ver "Auditoria"). Não requerem credenciais reais do Supabase: services e views mockam `supabase.js`/o service correspondente por `t.mock.module()`.

### Quando criar novos testes

- Domínio puro (sem DOM, sem rede): sempre que uma nova função for adicionada em `recurrence.js`, `smartAssistant.js`, `analytics.js` ou `utils.js`.
- Services: ao adicionar uma função nova a um `*Service.js`, mockando `supabase.js` como em `tests/services/eventService.test.js`.
- Views: ao alterar um fluxo crítico (autenticação, CRUD de compromisso, categorias, agenda semanal, calendário, IA), mockando o service correspondente e reaproveitando `domFixture.js`.

Não é objetivo cobrir 100% da base — a prioridade são os fluxos críticos acima. Ainda sem teste automatizado (validação manual no navegador): `diagnosticModal.js`, `accountView.js`, `quickAdd.js`, `confirmDialog.js`, `assistantView.js` (assistente local, distinto do painel de IA), e os services `pushService.js`, `avatarService.js`, `diagnosticService.js`, `icsExporter.js`/`icsImporter.js`, `profileService.js`.

### Organização

Um arquivo de teste por módulo, nomeado `<módulo>.test.js`, na subpasta correspondente à camada (`services/`, `views/`, `integration/`) ou na raiz de `tests/` para módulos de domínio puro. Mocks reutilizáveis ficam em `tests/mocks/`.

---

## Git

### Branches

- `main` — branch de produção; todo push dispara deploy automático no GitHub Pages e, condicionalmente, deploy de Edge Functions.
- Branches de feature são criadas a partir de `main` e mescladas de volta via Pull Request.

### Commits

Mensagens descritivas em português, frequentemente referenciando a etapa do roadmap ou o identificador do bug corrigido (ex: `BUG-011`, `BUG-014`), como registrado em `CHANGELOG.md`.

### Pull Requests

Todo PR contra `main` dispara o workflow `ci.yml`, que executa `npm test`. O PR só deve ser mesclado com CI verde e após revisão.

### Merge

Merge em `main` é o evento que dispara o deploy automático — não há branch de staging/homologação separada no pipeline atual.

### Releases

Não há tags de release Git no fluxo documentado; o versionamento é comunicado via `package.json` (`version`) e o cabeçalho de `README.md`, além do histórico textual em `CHANGELOG.md`, organizado por "Etapas" em vez de por versão semântica estrita.

---

## Deploy

### Ordem correta

```
1. Migrations SQL (sql/*.sql)      → aplicadas manualmente no SQL Editor do Supabase, ANTES do deploy do código que as usa
2. Edge Functions (supabase/functions/**) → deploy automático (ai-chat) ou manual (demais) após merge em main
3. Frontend (GitHub Pages)         → deploy automático a cada push em main
```

Como as migrations não fazem parte de nenhum workflow de CI/CD, alterações de schema devem ser aplicadas manualmente **antes** de mesclar o código que depende delas, para evitar que o frontend/Edge Function em produção referencie colunas ou tabelas inexistentes.

### GitHub Pages

Workflow `deploy.yml`: disparado por push em `main` ou manualmente (`workflow_dispatch`). Gera `config.js` a partir dos GitHub Secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`), empacota todos os arquivos estáticos e publica via `actions/deploy-pages@v4`.

### Supabase

Não há workflow de deploy para o projeto Supabase em si (é criado e configurado manualmente uma única vez pelo Dashboard). O que é automatizado é o deploy de uma das três Edge Functions.

### Edge Functions

Workflow `deploy-functions.yml`: disparado por push em `main` que altere `supabase/functions/**`, ou manualmente. Executa `supabase functions deploy ai-chat --project-ref $SUPABASE_PROJECT_REF`, usando os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`. As demais funções exigem deploy manual via CLI (ver seção "Edge Functions").

### Validação pós-deploy

Ver checklist detalhado em [`DEPLOY.md`](DEPLOY.md#7-checklist-de-validação-pós-deploy) — cobre login, CRUD de eventos, recorrência, PWA, modo offline e ausência de erros no console.

---

## Checklist antes do Merge

- [ ] Código funcionando localmente (testado manualmente no navegador para mudanças de UI)
- [ ] `npm test` executado localmente e passando
- [ ] Documentação relevante atualizada (`docs/*.md`, `README.md`, `CHANGELOG.md` quando aplicável)
- [ ] Migrations SQL revisadas — numeração sequencial correta, RLS habilitado, políticas cobrindo SELECT/INSERT/UPDATE/DELETE conforme necessário
- [ ] Edge Functions revisadas — validação de entrada, tratamento de erros com o código HTTP correto, nenhum segredo hardcoded
- [ ] CI verde (`ci.yml` — `npm test` no PR)
- [ ] Revisão concluída (Pull Request aprovado)
- [ ] `config.js` e outros segredos não incluídos no commit

---

## Boas Práticas

Padrões já em uso no projeto (nenhuma regra nova):

- Nunca versionar `config.js` ou qualquer segredo — apenas `config.example.js` fica no repositório.
- Toda tabela nova recebe RLS desde a migration que a cria, nunca depois.
- Segredos de servidor (`GEMINI_API_KEY`, chaves VAPID privadas, `SERVICE_ROLE_KEY`) existem apenas como secrets de Edge Function, nunca no frontend.
- O frontend nunca chama serviços externos (Gemini) diretamente — sempre através de uma Edge Function autenticada.
- Mutação de dados no frontend é sempre seguida por `refreshAll()` (ou equivalente local) para manter a UI sincronizada com o backend.
- Ações destrutivas (excluir evento, categoria, calendário, conta) sempre passam por `confirmDialog()` antes de executar.
- Erros são capturados e traduzidos para mensagens em português amigáveis ao usuário, mantendo um código interno para depuração (`AIError.code`, categorias de `errorService.js`).
- Uploads validam tipo MIME e tamanho no frontend antes de enviar ao Storage.
- Campos gravados via `upsert` em tabelas sensíveis (ex: `profiles`) usam allowlist explícita de campos permitidos.

---

## Troubleshooting

### Secrets ausentes

**Sintoma:** Edge Function responde `503` (`ai-chat` sem `GEMINI_API_KEY`) ou push não é enviado.
**Solução:** verificar com `supabase secrets list --project-ref <PROJECT_REF>` se todos os secrets esperados pela função estão configurados; configurar os que faltam com `supabase secrets set`.

### Edge Function não deployada

**Sintoma:** chamada ao endpoint da função retorna 404 ou erro de rede.
**Solução:** confirmar que a função foi de fato publicada (`supabase functions deploy <nome>`). Lembrar que apenas `ai-chat` tem deploy automático via CI/CD — `send-push-notifications` e `delete-account` exigem deploy manual após qualquer alteração.

### Modelo Gemini inválido

**Sintoma:** `ai-chat` responde `502` (erro genérico do Gemini).
**Solução:** conferir se `model` em `config/ai.js` corresponde a um modelo válido e disponível na conta do Google AI Studio (`gemini-2.5-flash` é o valor atual). A Edge Function não valida o nome do modelo contra uma allowlist — um valor incorreto só é percebido no erro retornado pela própria API do Gemini.

### RLS bloqueando dados

**Sintoma:** consultas retornam vazio mesmo com dados existentes no banco, ou inserts falham silenciosamente.
**Solução:** confirmar que a política RLS da tabela usa `auth.uid()` corretamente e que o usuário está autenticado (JWT válido). Testar a política diretamente no SQL Editor do Supabase simulando o `auth.uid()` do usuário, ou revisar `DATABASE.md` para a política esperada da tabela.

### Erros de autenticação

**Sintoma:** login falha em produção, ou Edge Function retorna `401`.
**Solução:** verificar `SUPABASE_URL`/`SUPABASE_ANON_KEY` em `config.js`/Secrets do GitHub; conferir **Authentication → URL Configuration** no Supabase (Site URL e Redirect URLs devem apontar exatamente para a URL usada, incluindo `/**` nas Redirect URLs); para Edge Functions, confirmar que o header `Authorization: Bearer <token>` está sendo enviado.

### GitHub Actions falhando

**Sintoma:** `ci.yml` falha no PR, ou `deploy.yml`/`deploy-functions.yml` falham após merge.
**Solução:** conferir os logs do workflow em **Actions**; para `ci.yml`, rodar `npm test` localmente primeiro; para os workflows de deploy, confirmar que todos os Secrets necessários (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`) estão configurados no repositório.

### Cache do navegador desatualizado

**Sintoma:** alterações no frontend não aparecem após deploy.
**Solução:** o Service Worker exibe um banner "Nova versão disponível" quando detecta uma nova versão (mudança em `CACHE_VERSION` de `service-worker.js`); clicar em "Atualizar agora". Para limpeza manual: DevTools → Application → Storage → Clear site data.

### Service Worker

**Sintoma:** PWA não instalável, ou comportamento offline inconsistente.
**Solução:** confirmar que o app é servido via HTTPS (obrigatório, exceto `localhost`); verificar no console se o registro do Service Worker (`pwa.js` → `registerServiceWorker()`) ocorreu sem erros; inspecionar em DevTools → Application → Service Workers e → Manifest.

---

## Auditoria

Avaliação do fluxo de desenvolvimento atual, sem alteração de código — apenas registro de inconsistências encontradas na documentação e no pipeline existentes:

- **Deploy automatizado cobre apenas 1 de 3 Edge Functions.** `deploy-functions.yml` só publica `ai-chat`. `send-push-notifications` e `delete-account` dependem inteiramente de deploy manual via CLI, criando risco de divergência entre o código no repositório e o código efetivamente em produção para essas duas funções.
- **Migrations SQL fora de qualquer pipeline.** Não há automação (CI/CD ou CLI de migrations do Supabase) aplicando os arquivos de `/sql`; a ordem e a aplicação corretas dependem inteiramente de disciplina manual, sem registro automático de quais migrations já foram aplicadas em produção.
- ~~Documentação de arquitetura duplicada.~~ **Resolvido** (PR6): `docs/ARCHITECTURE.md` é agora a única fonte da verdade para arquitetura geral e `docs/DATABASE.md` para o schema; `docs/ARQUITETURA.md`, `docs/DATA_MODEL.md` e `docs/BANCO_DE_DADOS.md` foram convertidos em redirecionamentos. `docs/BACKEND.md` e `docs/FRONTEND.md` continuam como referências específicas de cada camada, sem duplicar o conteúdo consolidado.
- **`FRONTEND.md` referencia Jest indevidamente.** O documento descreve a pasta `tests/` como testes "Jest", mas o projeto não depende de Jest — os testes usam exclusivamente o módulo `assert` nativo do Node.js com `--experimental-vm-modules`, conforme os próprios scripts em `package.json`.
- **Versão divergente entre `package.json` e `README.md`.** `package.json` declara `"version": "1.0.0-rc1"`, enquanto `README.md` anuncia "**v1.1.0** — Calendário Acadêmico (Etapa 17)". Não há um processo único de bump de versão sincronizando os dois arquivos.
- ~~**Tabela `ai_metrics` criada mas não alimentada.**~~ Resolvido (Auditoria A2.2): a Edge Function `ai-chat` agora insere uma linha por chamada em `ai_metrics` (`10_ai_metrics_observability.sql` adiciona `model`, `http_status`, `error_message`), além do `console.log` existente.
- **Inconsistência de estilo entre Edge Functions.** `ai-chat` e `send-push-notifications` usam `Deno.serve` nativo e importam o SDK via `npm:@supabase/supabase-js@2`; `delete-account` usa `serve` de `deno.land/std` e importa via `esm.sh`. Funcionalmente equivalente, mas sem padronização.
- **Sem testes automatizados para Edge Functions.** A cobertura de `tests/` é inteiramente do frontend; validação de `ai-chat`, `send-push-notifications` e `delete-account` é manual.
- **Sem ambientes separados (dev/staging/prod).** Um único projeto Supabase é referenciado nos workflows via `SUPABASE_PROJECT_REF`; não há evidência de projetos distintos por ambiente.

Nenhuma alteração de código foi feita a partir destas observações — estão documentadas apenas para registro, seguindo o mesmo princípio já adotado nas seções de "Auditoria" de outros documentos do projeto (`AI.md`, `BACKEND.md`).

---

## Estado Atual

- **Stack oficial:** frontend em HTML/CSS/JavaScript puro com ES Modules (sem framework, sem build step); backend em Supabase (PostgreSQL + Auth + Storage + Edge Functions em Deno); IA via Google Gemini (`gemini-2.5-flash`), isolada em uma Edge Function; Push via Web Push/VAPID.
- **Ferramentas utilizadas:** Node.js (`>=18`) e npm apenas para rodar testes; Supabase CLI para login, link e deploy de funções/secrets; GitHub Actions para CI e deploy automatizado; servidor HTTP estático qualquer para desenvolvimento local.
- **Fluxo de desenvolvimento:** branch de feature a partir de `main` → implementação → `npm test` → commit → push → Pull Request → CI (`npm test`) → review → merge em `main`.
- **Processo de deploy:** merge em `main` dispara automaticamente o deploy do frontend (GitHub Pages) e, se `supabase/functions/**` mudou, o deploy da Edge Function `ai-chat`. Migrations SQL e as outras duas Edge Functions permanecem manuais.
- **Avaliação geral do ambiente de desenvolvimento:** o projeto é enxuto e coerente com seu porte — sem complexidade de tooling desnecessária, com testes automatizados cobrindo a lógica de domínio pura e CI validando cada Pull Request. As lacunas identificadas na Auditoria (cobertura parcial de deploy automatizado, documentação de arquitetura duplicada, ausência de testes para Edge Functions, divergência de versão entre arquivos) são pontos de manutenção e consistência, não riscos estruturais ao funcionamento do produto.
