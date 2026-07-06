# Operação do MedAgenda

> Manual operacional oficial do MedAgenda. Documenta exatamente como o sistema é operado, mantido e administrado em produção, refletindo o estado atual do repositório. Nenhum procedimento aqui descrito foi inventado — onde um processo não existe (ex.: backup automatizado), isso é registrado explicitamente em vez de presumido. Nenhuma alteração de código, workflow, banco ou Edge Function foi feita para produzir este documento.

---

## Visão Geral

O MedAgenda não possui infraestrutura própria para operar. É uma aplicação **cliente-BaaS** (Backend as a Service): o frontend é um site estático publicado no GitHub Pages, e todo o backend — autenticação, banco de dados, storage e funções de servidor — é fornecido pelo Supabase. Não há servidor de aplicação, container, VM ou processo próprio para monitorar, reiniciar ou escalar; "operar o MedAgenda" significa, na prática, operar três coisas: o pipeline do GitHub Actions, o projeto Supabase e os Secrets que conectam um ao outro.

Não existem ambientes separados (dev/staging/prod). Um único projeto Supabase e uma única publicação no GitHub Pages atendem produção; desenvolvimento local usa o mesmo projeto Supabase (ou outro criado manualmente pelo desenvolvedor) apontado via `config.js` local.

### Diagrama do ciclo operacional

```
                 GitHub
        (código-fonte, branch main)
                    │
                    │ push / merge
                    ▼
             GitHub Actions
   ┌────────────────────────────────┐
   │ ci.yml               → testes  │
   │ deploy.yml           → frontend│
   │ deploy-functions.yml → Edge Fn │
   └────────────────────────────────┘
                    │
                    ▼
              GitHub Pages
        (frontend estático: HTML/CSS/JS,
         Service Worker, manifest)
                    │
                    ▼
                Supabase
   ┌────────────────────────────────┐
   │ Auth · PostgreSQL (RLS) ·      │
   │ Storage · Edge Functions ·     │
   │ Scheduler (cron)               │
   └────────────────────────────────┘
                    │
                    ▼
                 Usuários
        (navegador / PWA instalada)
```

O fluxo é unidirecional na maior parte do tempo: código sobe para o GitHub, o GitHub Actions publica o frontend e (condicionalmente) uma Edge Function, e os usuários finais falam diretamente com o Supabase a partir do navegador — não há reintermediação pelo GitHub Pages depois que a página carrega.

---

# Deploy

Existem quatro superfícies de deploy no projeto, com automação e frequência diferentes.

### Deploy Frontend

**Quando acontece:** automaticamente a cada `push` na branch `main`, ou manualmente via `workflow_dispatch`.

**Como:** o workflow `deploy.yml` gera `config.js` a partir dos GitHub Secrets, empacota todos os arquivos estáticos do repositório e publica no GitHub Pages via `actions/deploy-pages@v4`.

**Onde fica visível:** `https://andressamendes.github.io/MedAgenda/`.

### Deploy Edge Functions

**Quando acontece:** automaticamente, mas **apenas para a função `ai-chat`**, a cada `push` em `main` que altere arquivos em `supabase/functions/**`, ou manualmente via `workflow_dispatch`.

**Como:** o workflow `deploy-functions.yml` autentica a Supabase CLI com `SUPABASE_ACCESS_TOKEN` e executa `supabase functions deploy ai-chat --project-ref $SUPABASE_PROJECT_REF`.

**Importante:** as outras duas Edge Functions do projeto — `send-push-notifications` e `delete-account` — **não têm deploy automatizado**. Qualquer alteração nelas exige `supabase functions deploy <nome>` manual. Isso é uma lacuna real do pipeline, não uma omissão deste documento (ver seção "Auditoria").

### Deploy Banco

**Quando acontece:** não há gatilho automático. As migrations em `/sql` são aplicadas **manualmente**, uma por vez, colando o conteúdo do arquivo no **SQL Editor do Supabase Dashboard**, sempre em ordem numérica crescente.

**Por que é manual:** o projeto não usa a CLI de migrations do Supabase (`supabase db push`/`supabase migration`) nem qualquer outra ferramenta de versionamento de schema. Não existe pasta `supabase/migrations/`; as migrations vivem em `/sql` na raiz do repositório.

**Ordem obrigatória de aplicação:**

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
```

`01_events.sql` não tem dependências e deve ser a primeira. As demais (exceto `06_storage.sql`, `08_ai_metrics.sql` e `14_schema_version.sql`, que são independentes) dependem da função `update_updated_at()` definida em `01_events.sql`. `09_notification_logs_integrity.sql` depende de `01_events.sql` e `04_push_notifications.sql`; `10_ai_metrics_observability.sql` depende de `08_ai_metrics.sql` e deve ser aplicada antes do deploy da Edge Function `ai-chat` que a utiliza. Ver detalhamento completo em [`DATABASE.md`](DATABASE.md).

**Quando deve ser aplicado:** sempre **antes** de mesclar/publicar código (frontend ou Edge Function) que dependa das novas tabelas/colunas — caso contrário, o código em produção pode referenciar schema inexistente.

**Incidente histórico (motivo da seção "Proteção contra Divergência de Schema" abaixo):** o frontend chegou a ser publicado no GitHub Pages com as migrations `11_activity_sessions.sql`, `12_time_goals.sql` e `13_reviews.sql` ainda não aplicadas em produção — Dashboard, Central de Insights e Histórico de Sessões passaram a consultar tabelas inexistentes, produzindo "Erro ao comunicar com o servidor" para o usuário final, sem qualquer sinal de que a causa era uma migration pendente. `14_schema_version.sql` e o mecanismo descrito abaixo existem para que isso nunca mais aconteça de forma silenciosa.

---

# Proteção contra Divergência de Schema (P0)

Mecanismo permanente para impedir que o frontend rode contra um banco cujo schema ainda não recebeu as migrations que aquele build exige — a causa raiz do incidente das migrations 11–13 (ver acima).

### Como funciona

1. **Versão do banco** — a tabela `public.schema_version` (migration `14_schema_version.sql`) guarda uma única linha (`id = 1`) com o número da migration mais recente aplicada. Leitura liberada para `anon` e `authenticated` (é só um inteiro público, sem dado de usuário); escrita só pelo SQL Editor (fora de RLS), como qualquer outra migration.
2. **Versão esperada pelo frontend** — `EXPECTED_SCHEMA_VERSION`, uma constante em `schemaService.js`, versionada junto com o código. Deve ser incrementada no mesmo commit/PR que introduz uma migration da qual o frontend passe a depender.
3. **Verificação no bootstrap** — `_initApp()` (`script.js`) chama `schemaService.assertSchemaCompatible()` como primeiro passo, antes de inicializar qualquer subsistema. Se o banco estiver desatualizado (ou a tabela `schema_version` não existir/estiver vazia, ou a consulta falhar), a exceção resultante (`SchemaMismatchError`) é tratada por `errorService.js` (categoria própria `schema_mismatch`, nunca reaproveitando `database`/`network`/`server_unavailable`/`auth`) e `stateView.js` (estado dedicado `SCHEMA_MISMATCH`: título "Banco de dados desatualizado", ação "Recarregar"). **Dashboard, Central de Insights, Histórico de Sessões, IA e Sessões nunca chegam a inicializar** nesse caminho — a tela do app permanece oculta e a tela dedicada assume o lugar dela.
4. **Verificação no deploy** — o workflow `deploy.yml` tem um passo ("Validate database schema version") que consulta `schema_version` via REST (usando a `SUPABASE_ANON_KEY` já configurada como secret do repositório, sem credencial nova) e falha o job **antes de publicar o frontend** se a versão do banco for menor que `EXPECTED_SCHEMA_VERSION` lida de `schemaService.js`, ou se a tabela/linha não existir.

### Limite conhecido da verificação em CI

O passo em `deploy.yml` só consegue validar o projeto Supabase apontado pelos secrets `SUPABASE_URL`/`SUPABASE_ANON_KEY` do repositório — o mesmo projeto único usado em produção (ver "Visão Geral": não há ambientes separados). Ele **não** aplica migrations automaticamente, não faz rollback e não impede que alguém dispare `workflow_dispatch` manualmente ignorando o resultado de uma execução anterior falha — apenas garante que o pipeline automático (`push` em `main`) nunca publica um frontend cuja versão mínima de schema não esteja presente no banco no momento do deploy. A aplicação das migrations em si continua inteiramente manual (ver "Deploy Banco" acima) — este mecanismo é uma trava de saída, não uma trava de entrada.

### Checklist obrigatório — publicar código que depende de schema novo

- [ ] Migration nova criada em `/sql`, numerada sequencialmente, terminando com `UPDATE public.schema_version SET version = <N>, applied_at = now() WHERE id = 1;`
- [ ] `EXPECTED_SCHEMA_VERSION` incrementado em `schemaService.js` para `<N>`, no mesmo commit
- [ ] Migration aplicada manualmente no SQL Editor do Supabase (produção) — **antes** do merge/deploy do código que depende dela
- [ ] Validar schema: `SELECT version FROM public.schema_version;` confirma `<N>` (ou consultar via REST: `GET {SUPABASE_URL}/rest/v1/schema_version?select=version&id=eq.1` com a anon key)
- [ ] Confirmar versão: o valor lido no passo acima é `>= EXPECTED_SCHEMA_VERSION` do commit a publicar
- [ ] Publicar frontend: merge em `main` — o passo "Validate database schema version" de `deploy.yml` roda automaticamente e bloqueia o job se algo acima foi pulado

### Rollback

Não existe rollback automatizado de schema (ver "Banco → Rollback" acima) — reverter uma migration continua exigindo SQL manual escrito e revisado caso a caso. O que muda com este mecanismo:

1. Se o rollback do banco reduzir o schema para um estado anterior a uma versão já anunciada em `schema_version`, **atualize a linha manualmente** para refletir a realidade: `UPDATE public.schema_version SET version = <versão real após o rollback>, applied_at = now() WHERE id = 1;` — nunca deixe `schema_version` "adiantada" em relação ao schema de fato presente, ou o frontend seguirá em frente acreditando que tabelas/colunas já removidas ainda existem.
2. Se o rollback for do **frontend** (reverter um commit que dependia de schema novo), nenhuma ação em `schema_version` é necessária — `EXPECTED_SCHEMA_VERSION` volta com o commit revertido, e um banco mais novo continua compatível (a verificação é `dbVersion >= expectedVersion`, nunca igualdade estrita).
3. Sempre repetir a "Validação (pós-deploy)" abaixo após qualquer rollback, incluindo login e uma tela que dependa de schema recente (ex.: Dashboard de Execução).

### Deploy PWA

Não existe um "deploy" separado para a PWA — o manifest (`manifest.webmanifest`) e o Service Worker (`service-worker.js`) são arquivos estáticos publicados junto com o restante do frontend pelo mesmo workflow `deploy.yml`. A "atualização" da PWA acontece no navegador do usuário, não em um pipeline: veja a seção "PWA" para o mecanismo de detecção e ativação de nova versão.

### Resumo de quando cada deploy acontece

| Componente | Gatilho | Automação |
|---|---|---|
| Frontend (GitHub Pages) | Push em `main` (qualquer arquivo) ou `workflow_dispatch` | Total |
| Edge Function `ai-chat` | Push em `main` alterando `supabase/functions/**`, ou `workflow_dispatch` | Total |
| Edge Function `send-push-notifications` | Nenhum — decisão do mantenedor | Manual via CLI |
| Edge Function `delete-account` | Nenhum — decisão do mantenedor | Manual via CLI |
| Migrations SQL | Nenhum — decisão do mantenedor | Manual via SQL Editor (aplicação); versão validada automaticamente antes do deploy do frontend, ver P0 |
| PWA (manifest/Service Worker) | Empacotado junto ao deploy do Frontend | Total (como parte do frontend) |
| Projeto Supabase em si (criação/configuração) | Nenhum — feito uma única vez | Manual via Dashboard |

---

# GitHub Actions

O repositório define **3 workflows**, todos em `.github/workflows/`.

## `ci.yml` — CI — Tests

- **Objetivo:** garantir que a lógica de domínio pura (recorrência, notificações, assistente, analytics, utils) continua correta antes de qualquer merge.
- **Gatilho:** `push` para `main` e `pull_request` contra `main`.
- **Etapas executadas:**
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node.js 20)
  3. `npm test`
- **Artefatos produzidos:** nenhum. Apenas o resultado (sucesso/falha) do `npm test`, visível na aba **Actions** e no status check do Pull Request.
- **Efeito de falha:** bloqueia visualmente o PR (status check vermelho); não há branch protection documentada no repositório impedindo o merge por si só além do status check.

## `deploy.yml` — Deploy — GitHub Pages

- **Objetivo:** publicar o frontend estático no GitHub Pages.
- **Gatilho:** `push` para `main` e `workflow_dispatch` (disparo manual).
- **Permissões declaradas:** `contents: read`, `pages: write`, `id-token: write`.
- **Concorrência:** grupo `pages`, sem cancelamento de execuções em andamento (`cancel-in-progress: false`) — deploys enfileiram em vez de se cancelarem.
- **Etapas executadas:**
  1. `actions/checkout@v4`
  2. Gera `config.js` a partir dos Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`, com `APP_URL` fixo (`https://andressamendes.github.io/MedAgenda/`) escrito diretamente no workflow
  3. **Valida a versão do schema do banco** (P0 — ver "Proteção contra Divergência de Schema" acima): consulta `public.schema_version` via REST com a `SUPABASE_ANON_KEY`, compara com `EXPECTED_SCHEMA_VERSION` lida de `schemaService.js`, e falha o job (`exit 1`) — antes de qualquer etapa de publicação — se o banco estiver desatualizado ou a tabela/linha não existir
  4. `actions/configure-pages@v5`
  5. `actions/upload-pages-artifact@v3`, empacotando todo o diretório raiz (`path: '.'`)
  6. `actions/deploy-pages@v4`, publicando o artefato
- **Artefatos produzidos:** o artefato de páginas (site estático completo, incluindo o `config.js` gerado) enviado ao GitHub Pages; URL de deploy exposta em `steps.deployment.outputs.page_url` e no ambiente `github-pages` do repositório.

## `deploy-functions.yml` — Deploy — Supabase Edge Functions

- **Objetivo:** publicar a Edge Function `ai-chat` no projeto Supabase.
- **Gatilho:** `push` para `main` restrito a mudanças em `supabase/functions/**`, e `workflow_dispatch`.
- **Etapas executadas:**
  1. `actions/checkout@v4`
  2. `supabase/setup-cli@v1` (versão `latest`)
  3. `supabase functions deploy ai-chat --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}`, autenticado via variável de ambiente `SUPABASE_ACCESS_TOKEN`
- **Artefatos produzidos:** nenhum artefato do GitHub Actions — o resultado é o código da função atualizado diretamente no Edge Runtime do Supabase.
- **Escopo:** deploya **somente `ai-chat`**. Não há step para `send-push-notifications` nem `delete-account`.

### Como acompanhar

Todos os três workflows são visíveis em **GitHub → Actions**, filtráveis por nome do workflow. Logs completos de cada step ficam disponíveis por execução.

---

# Edge Functions

O projeto possui **3 Edge Functions**, todas em Deno, hospedadas pelo Supabase, em `supabase/functions/`: `ai-chat`, `send-push-notifications`, `delete-account`, além do módulo compartilhado `_shared/recurrence-core.js` (não é uma função invocável, é lógica importada pelas demais).

### Deploy

| Função | Mecanismo de deploy |
|---|---|
| `ai-chat` | Automático via `deploy-functions.yml`, a cada push em `main` que altere `supabase/functions/**` |
| `send-push-notifications` | Manual: `supabase functions deploy send-push-notifications` |
| `delete-account` | Manual: `supabase functions deploy delete-account` |

Deploy manual completo, para as três funções (útil ao provisionar um projeto novo ou reimplantar tudo de uma vez):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy ai-chat
supabase functions deploy send-push-notifications
supabase functions deploy delete-account
```

### Rollback

Não existe mecanismo de rollback automatizado nem histórico de versões de Edge Function gerenciado por este repositório. O Supabase mantém internamente as implantações de cada função, mas o projeto não documenta nem usa esse recurso. Na prática, o único "rollback" disponível é:

1. Identificar o commit anterior estável no Git (`git log` / `git revert`).
2. Fazer checkout ou reverter para esse commit.
3. Rodar novamente `supabase functions deploy <nome>` (manual) ou empurrar o revert para `main` (automático, apenas para `ai-chat`).

Não há ambiente de staging para validar a função antes do rollback afetar produção.

### Versionamento

Não há versionamento semântico de Edge Functions no projeto (sem tags `v1`, `v2` etc.). O código de cada função é versionado exclusivamente pelo histórico do Git no diretório `supabase/functions/<nome>/`. A versão "em produção" é sempre o conteúdo do `index.ts` no commit mais recente que foi efetivamente deployado — não necessariamente o commit mais recente da branch `main`, já que `send-push-notifications` e `delete-account` dependem de deploy manual.

### Atualização

Para atualizar uma Edge Function:

1. Editar o `index.ts` correspondente em `supabase/functions/<nome>/`.
2. Rodar `npm test` (cobre apenas lógica de frontend — as funções em si não têm teste automatizado).
3. Testar localmente, se necessário, com `supabase functions serve`.
4. Commit e push para `main`.
5. Para `ai-chat`: o deploy acontece automaticamente. Para `send-push-notifications`/`delete-account`: rodar `supabase functions deploy <nome>` manualmente.
6. Verificar os logs da função no Supabase Dashboard após a atualização.

---

# Banco

### Migrations

Localizadas em `/sql`, oito arquivos numerados sequencialmente (`01_` a `08_`), cada um autocontido e documentando suas dependências no cabeçalho. Cobrem: eventos (`01`), categorias (`02`), colunas de recorrência (`03`, redundante com `01` mas idempotente), push notifications (`04`), perfis (`05`), políticas de Storage (`06`), calendário acadêmico (`07`) e métricas de IA (`08`).

### Ordem

Aplicação obrigatória em ordem numérica crescente — ver lista completa na seção "Deploy → Deploy Banco" acima. A dependência mais relevante é a função `update_updated_at()`, definida em `01_events.sql` e reutilizada por triggers em seis das oito tabelas.

### Cuidados

- Nunca editar uma migration já aplicada em produção — criar uma nova migration numerada para qualquer alteração de schema.
- Toda tabela nova deve habilitar RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) e declarar suas políticas na mesma migration que a cria, não separadamente.
- Migrations SQL não fazem parte de nenhum workflow de CI/CD — aplicar **antes** de publicar código (frontend/Edge Function) que dependa do novo schema, para não deixar produção referenciando colunas/tabelas inexistentes.
- `06_storage.sql` tem um pré-requisito manual: o bucket `avatars` deve ser criado antes, pelo Supabase Dashboard (Storage → New Bucket → público) — a migration só cria as políticas, não o bucket em si.
- Alterações na lógica de recorrência devem manter sincronizados `recurrence.js` (frontend) e `supabase/functions/_shared/recurrence-core.js` (Edge Function), que compartilham o mesmo algoritmo.

### Rollback

Não existe mecanismo de rollback (`down migration`) para nenhuma das oito migrations — todas são escritas apenas no sentido de aplicação (`up`), sem script de reversão correspondente. A maioria usa `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, o que as torna seguras para reexecução, mas não oferece um caminho automatizado para desfazer uma migration já aplicada. Reverter uma mudança de schema em produção exige escrever e executar manualmente o SQL inverso (`DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, etc.) no SQL Editor, avaliando primeiro o impacto sobre dados já gravados.

---

# Secrets

Nenhum valor de secret é divulgado neste documento — apenas onde cada um vive e é consumido.

### Secrets do repositório GitHub

Configurados em **Settings → Secrets and variables → Actions**:

| Secret | Utilizado em |
|---|---|
| `SUPABASE_URL` | `deploy.yml` (geração de `config.js`) |
| `SUPABASE_ANON_KEY` | `deploy.yml` (geração de `config.js`) |
| `VAPID_PUBLIC_KEY` | `deploy.yml` (geração de `config.js`) — opcional; vazio desativa Push |
| `SUPABASE_ACCESS_TOKEN` | `deploy-functions.yml` (autenticação da Supabase CLI) |
| `SUPABASE_PROJECT_REF` | `deploy-functions.yml` (`--project-ref` no deploy da Edge Function) |

### Secrets do projeto Supabase

Configurados via `supabase secrets set` (ou pelo Dashboard → Edge Functions → Secrets), consumidos exclusivamente pelas Edge Functions:

| Secret | Utilizado em |
|---|---|
| `GEMINI_API_KEY` | `ai-chat` — autentica as chamadas à API do Google Gemini |
| `VAPID_PUBLIC_KEY` | `send-push-notifications` — assinatura de notificações Web Push |
| `VAPID_PRIVATE_KEY` | `send-push-notifications` — assinatura de notificações Web Push |
| `VAPID_SUBJECT` | `send-push-notifications` — identifica o remetente perante os serviços de push (fallback no código: `mailto:admin@medagenda.app`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `send-push-notifications`, `delete-account` — operações administrativas que contornam RLS. Injetada automaticamente pelo runtime do Supabase, não configurada manualmente |
| `SUPABASE_URL` | `ai-chat`, `delete-account` — validação de JWT via `auth.getUser()` |
| `SUPABASE_ANON_KEY` | `ai-chat`, `delete-account` — validação de JWT via `auth.getUser()` |

### Fronteira de exposição ao navegador

Apenas três valores chegam ao frontend, via `config.js` gerado no deploy: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `VAPID_PUBLIC_KEY`. Todos são seguros para exposição por definição (a `anon key` não concede acesso a dados sem JWT + RLS; a VAPID pública é pública por definição do protocolo Web Push). Nenhum outro secret listado acima sai do ambiente de servidor (GitHub Actions ou Edge Functions).

`config.js` está listado em `.gitignore` e nunca é versionado; o modelo versionado é `config.example.js`, sem valores reais.

---

# PWA

### Manifest

`manifest.webmanifest` define a instalação da aplicação: `display: standalone`, `start_url`/`scope: /MedAgenda/`, `theme_color: #3b82f6`, `background_color: #f9fafb`, `orientation: portrait-primary`, `lang: pt-BR`, e um conjunto de 8 ícones (72px a 512px, com propósito `any` e `maskable` nos tamanhos 192 e 512).

### Service Worker

`service-worker.js` implementa a estratégia **App Shell**, com versão de cache atual `CACHE_VERSION = 'v9'` (nome do cache: `medagenda-shell-v9`).

- **Instalação (`install`):** pré-cacheia toda a App Shell — HTML, CSS, os 44 módulos JS realmente importados pelo frontend, o manifest e os 8 ícones — e chama `self.skipWaiting()`.
- **Ativação (`activate`):** apaga qualquer cache cujo nome comece com `medagenda-` e seja diferente do `CACHE_NAME` atual, depois chama `self.clients.claim()`.
- **Fetch:** requisições não-GET passam direto (sem cache); chamadas para hosts `*.supabase.co` e qualquer origem cross-origin também passam direto para a rede. Para assets same-origin, usa cache-first: retorna do cache se existir, senão busca na rede e grava uma cópia no cache. Se a rede falhar e a requisição for de documento HTML, retorna o `index.html` em cache como fallback offline.
- **Mensagens:** escuta `{ type: 'SKIP_WAITING' }`, disparado por `pwa.js` para ativar imediatamente um Service Worker em espera.
- **Push:** escuta o evento `push`, exibe a notificação (título, corpo, ícone, badge, tag, ações "Abrir"/"Dispensar") e trata o clique — foca uma janela existente ou abre uma nova, repassando o `eventId` via `postMessage`.

#### Lista de módulos da App Shell (automatizada)

O bloco de módulos JS dentro de `APP_SHELL` (entre os marcadores `AUTO-GENERATED:BEGIN`/`END`) é gerado por `scripts/generate-app-shell.js`, que percorre o grafo real de `import` a partir dos entry points declarados em `index.html` (`script.js` e o módulo inline que carrega `pwa.js`). Isso elimina a manutenção manual da lista, que já havia ficado desatualizada (10 módulos usados pelo app — `modalController.js`, `eventFormView.js`, `assistantView.js`, `navigationView.js`, `categoryView.js`, `authView.js`, `aiPanelView.js`, `academicCalendarEventsView.js`, `academicCalendarICSView.js` e `academicCalendarFilter.js` — não estavam pré-cacheados).

- `npm run build:app-shell` — regenera o bloco em `service-worker.js` a partir do código-fonte atual.
- `npm run check:app-shell` — falha (exit 1) se o bloco estiver desatualizado; rodado no `ci.yml` a cada push/PR, para impedir que um novo módulo seja adicionado ao frontend sem entrar no pré-cache.

**Limitação conhecida:** `config.js` (credenciais Supabase/VAPID) é gerado em tempo de deploy pelo `deploy.yml` a partir de secrets do repositório e está no `.gitignore` — nunca existe no checkout do código-fonte, então o gerador não consegue incluí-lo no pré-cache. Ele continua sendo buscado e cacheado oportunisticamente pelo handler de `fetch` (cache-first) no primeiro carregamento online, como já acontecia antes desta automação.

### Cache

| Tipo de recurso | Estratégia |
|---|---|
| Assets estáticos same-origin (JS, CSS, HTML, ícones, manifest) | Cache-first |
| Chamadas ao Supabase (`*.supabase.co`) | Network-only — nunca cacheado, dados sempre frescos |
| Recursos cross-origin (CDN) | Network-only |
| Requisições não-GET (POST/PUT/DELETE) | Passam direto, nunca cacheadas |

### Offline

Dados e telas já carregadas ficam visíveis offline via cache do Service Worker. Escritas (criar/editar/excluir compromisso) exigem conexão — não há fila de sincronização offline; o SDK do Supabase não implementa isso. O Service Worker continua recebendo e exibindo push notifications mesmo com o app fechado.

### Update

Quando `CACHE_VERSION` é incrementado em um novo deploy, o navegador detecta o novo Service Worker em segundo plano. O frontend (`pwa.js`) exibe um banner "Nova versão disponível"; ao confirmar, envia `SKIP_WAITING` ao worker em espera, que assume o controle e a página recarrega com os assets atualizados. Limpeza manual, se necessário: DevTools → Application → Storage → Clear site data.

---

# Monitoramento

O projeto não possui um agregador de logs, APM ou serviço de observabilidade externo configurado. O monitoramento é composto por mecanismos independentes (Auditoria A2.6 os inventariou e ligou o que era possível ligar sem infraestrutura nova — ver detalhes abaixo):

### `errorService.js` (frontend — ponto único de categorização de erros)

Desde a Auditoria A2.6, é o ponto central por onde praticamente todo catch de erro do frontend passa — não só `window.onerror`/`unhandledrejection`, mas também os fluxos de autenticação (`authView.js`), CRUD de compromissos/categorias/calendários acadêmicos/conta (`eventFormView.js`, `categoryView.js`, `academicCalendarView.js`, `academicCalendarEventsView.js`, `accountView.js`, `quickAdd.js`, `script.js`), o painel de IA (`aiPanelView.js`) e o registro do Service Worker (`pwa.js`). Cada chamada:

- Categoriza o erro em `auth`, `network`, `database`, `ai`, `push`, `service_worker`, `ui` ou `unknown` (erros de `AIError` — ver `services/ai/providers/geminiProvider.js` — são reconhecidos pelo nome, não por texto, e preservam sua mensagem específica por código: `RATE_LIMIT`, `UNAVAILABLE`, `TIMEOUT`, `AUTH`, `NETWORK`, `API_ERROR`, `EMPTY_RESPONSE`).
- Grava no buffer em memória (máx. 100 entradas) — cada entrada inclui categoria, código (`err.code`, quando existe), mensagem e contexto (`{ context: '<módulo>.<ação>' }`).
- Dispara `track(EVENTS.ERROR, ...)` em `telemetryService.js` (exceto categoria `ui`).
- Mostra um toast amigável, a menos que a própria view já mostre seu próprio texto de erro inline (passando `{ silent: true }` — a maioria dos casos, para não duplicar feedback).

A mensagem exibida ao usuário em cada view **não mudou** com essa mudança — o que mudou é que agora todo erro relevante fica categorizado e registrado num único lugar, em vez de invisível em `console.error`/`console.warn` espalhados.

### Estados de carregamento: loading / vazio / erro (Auditoria A2.7)

Antes da Auditoria A2.7, um erro ao buscar dados (rede, timeout, erro do Supabase, sessão expirada) em vários fluxos acabava produzindo a mesma tela de "sem dados" de uma ausência real de registros — mascarando falhas reais como se a agenda/calendário/categoria estivesse genuinamente vazia. A auditoria separou os estados **vazio** e **erro** nos fluxos de listagem, reaproveitando 100% a categorização de `errorService.js` (nenhuma nova lógica de classificação de erro foi criada):

- **Lista principal** (`script.js` → `loadEvents()`/`renderListError()`): estado de erro exibido em `#list-empty.list-error`, com o texto amigável (`friendly`) retornado por `handleError()` e um botão "Tentar novamente" que re-executa `loadEvents()`.
- **Calendário** (`calendar.js` → `renderCalError()`): em vez de renderizar a grade com todas as células vazias, exibe `.cal-error` com mensagem + botão "Tentar novamente" (`fetchAndRender()`).
- **Agenda semanal** (`weekView.js` → `showWeekError()`/`hideWeekError()`): banner `#wk-error` acima da grade, com mensagem + botão "Tentar novamente".
- **Categorias** (`categoryView.js` → `_renderCatList()`): antes não havia tratamento de erro nenhum (uma falha virava uma promise rejeitada silenciosa); agora exibe `.cat-empty.cat-error` + botão "Tentar novamente".
- **Calendário acadêmico** (`academicCalendarView.js` → `showCalendarList()`, `academicCalendarEventsView.js` → `showEventList()`): uma falha ao listar calendários/eventos não é mais mascarada como "nenhum calendário/evento cadastrado" — exibe erro + retry. Exceção: se já havia uma lista de calendários carregada anteriormente (atualização em segundo plano), a lista antiga é mantida na tela com um toast de aviso, para não interromper o uso do restante do app.

Como a mensagem amigável já é categorizada por `errorService.js`, o texto muda de acordo com a causa (ex.: "Sem conexão com a internet..." para falha de rede, "Sua sessão expirou. Faça login novamente." para erro de autenticação, "Erro ao comunicar com o servidor..." para erro do Supabase/banco) — sem necessidade de nenhum código de classificação novo nessas views.

Fora de escopo desta auditoria (fluxos de ação/gravação, não de carregamento — já exibiam erro de forma visível, sem risco de mascaramento): formulário de evento (`eventFormView.js`), exclusão de evento (`script.js` → `handleDelete()`), importação/exportação ICS (`academicCalendarICSView.js`), painel de IA (`aiPanelView.js`, que já diferenciava erro de IA/rede antes desta auditoria).

### `diagnosticService.js` (frontend)

Executa checagens de saúde sob demanda (`runDiagnostics()`, usada na tela de diagnóstico do app):

- **Supabase:** faz `supabase.from('events').select('id').limit(1)` e mede a latência; erros de autenticação (`PGRST301`/`PGRST116`) não são tratados como falha de conectividade.
- **Auth:** verifica sessão ativa via `supabase.auth.getSession()`.
- **Service Worker:** verifica se `navigator.serviceWorker.controller` está ativo.
- **Push:** verifica suporte a `PushManager`/`Notification` e o estado da permissão.
- **Última sincronização:** lida de `localStorage` (`medagenda_last_sync`).
- **Ambiente:** deduzido do hostname (`localhost` → desenvolvimento; `*.github.io` → produção).
- **Erros recentes** (Auditoria A2.6): os últimos 10 erros de `errorService.js` (via `getRecentErrors()`) — o buffer de erros existia mas não era consultável de nenhum outro lugar antes desta auditoria. Não é renderizado na tela de diagnóstico hoje (`diagnosticModal.js` não mudou, para não alterar a interface); disponível chamando `runDiagnostics()` diretamente para investigação manual.

### `telemetryService.js` (frontend)

Mantém um **buffer em memória** (máx. 200 entradas) de eventos de produto (`signup`, `login`, `appointment_created`, `push_subscribed`, `sync_failure`, `notification_failure`, `error`, entre outros — o evento `error` agora chega de muito mais lugares, ver `errorService.js` acima). Em modo dev, os eventos são impressos no console (`console.groupCollapsed`); em produção, ficam apenas no buffer em memória — **não há envio para nenhum backend ou serviço de analytics**. O próprio código sinaliza isso com o comentário `// Future: forward to analytics provider`.

### Logs das Edge Functions

As três Edge Functions usam `console.log`/`console.error`/`console.warn` como mecanismo de observabilidade — não há logging estruturado, correlação de request-id nem exportação para fora do Supabase. Consulta em **Supabase Dashboard → Project → Edge Functions → {função} → Logs**, com filtro por período. Desde a Auditoria A2.6, as três funções prefixam suas mensagens de log com `[nome-da-função]` (`[ai-chat]`, `[send-push-notifications]`, `[delete-account]`) para consistência — `delete-account` não tinha nenhum log de erro antes.

### `ai_metrics` (backend — uso da Edge Function `ai-chat`)

Tabela populada pela Edge Function `ai-chat` a cada chamada (ver Auditoria A2.2): tipo de prompt, modelo, duração, status HTTP, sucesso/falha e um código + resumo curto de erro — sem prompt, resposta da IA, JWT ou dado pessoal. Consultável via SQL/dashboard do Supabase; não há relatório ou dashboard próprio no projeto.

### GitHub Actions

Cada execução de `ci.yml`, `deploy.yml` e `deploy-functions.yml` fica registrada em **GitHub → Actions**, com logs completos por step e status (sucesso/falha) por execução. É o único ponto de monitoramento do próprio pipeline de deploy; não há notificação automática configurada (e-mail, Slack, etc.) além do que o GitHub oferece nativamente por padrão.

### O que não existe

Não há dashboard de métricas de produção, alerta automatizado de indisponibilidade, health-check agendado externo, agregador central entre frontend/backend, ou qualquer ferramenta de APM (Sentry, Datadog, etc.) integrada ao projeto.

---

# Backup

**Não existe procedimento de backup documentado, configurado ou automatizado neste repositório.**

Nenhum workflow do GitHub Actions, script, migration ou configuração do Supabase presente no código realiza backup do banco de dados, do Storage (avatares) ou de qualquer outro dado de produção. O Supabase, como plataforma gerenciada, pode oferecer backups automáticos de infraestrutura dependendo do plano contratado do projeto — mas isso não é configurado, referenciado nem verificável a partir deste repositório, e portanto não é tratado aqui como parte do procedimento operacional do MedAgenda.

Isso é registrado explicitamente como lacuna, não como uma falha a ser corrigida silenciosamente — ver seção "Auditoria".

---

# Recuperação

Procedimentos de recuperação possíveis com o que existe hoje no repositório e no pipeline. Onde não há automação, isso é indicado.

### Frontend

O frontend é inteiramente reconstruível a partir do Git: qualquer commit da branch `main` pode ser reimplantado disparando `deploy.yml` manualmente (`workflow_dispatch`) ou empurrando um novo commit/revert para `main`. Como o site é 100% estático e gerado a partir do repositório, a recuperação equivale a garantir que o commit correto esteja em `main` e disparar o deploy — não há estado de servidor a restaurar.

### Banco

Não há procedimento de recuperação automatizado. Na ausência de um backup (ver seção "Backup"), a recuperação depende inteiramente do que a própria plataforma Supabase oferecer para o plano do projeto (point-in-time recovery, se disponível) — algo fora do controle deste repositório. O que o repositório oferece é a capacidade de **reconstruir o schema do zero**, reaplicando as 8 migrations de `/sql` em ordem no SQL Editor de um projeto Supabase novo; isso recria estrutura, funções, triggers e políticas RLS, mas **não recupera dados** perdidos, pois as migrations não contêm dados, apenas schema.

### Edge Functions

Como o código de cada função está versionado no Git, a recuperação é: identificar o commit correto de `supabase/functions/<nome>/index.ts` e rodar `supabase functions deploy <nome>` (ou disparar `deploy-functions.yml` manualmente, para `ai-chat`). Secrets precisam ser reconfigurados manualmente com `supabase secrets set` caso o projeto Supabase de destino seja novo (não são versionados nem exportáveis a partir deste repositório).

### GitHub Actions

Os três workflows são arquivos versionados em `.github/workflows/`; recuperá-los é o mesmo processo de recuperar qualquer arquivo do repositório (checkout do commit correto). Uma execução específica que falhou pode ser re-executada diretamente pela interface do GitHub Actions ("Re-run jobs"), sem necessidade de novo commit, contanto que os Secrets do repositório continuem configurados.

---

# Atualização de Produção

Fluxo oficial, conforme implementado nos workflows e descrito consistentemente em `DEPLOY.md` e `DEVELOPMENT.md`:

```
1. Nova branch a partir de main
2. Implementação (frontend, SQL e/ou Edge Function conforme o escopo)
3. npm test localmente
4. Commit e push da branch
5. Pull Request para main
        │
        ▼
   ci.yml roda `npm test` automaticamente no PR
        │
        ▼
   Revisão e aprovação do PR
        │
        ▼
   Merge em main
        │
        ├──► deploy.yml           → GitHub Pages (sempre)
        └──► deploy-functions.yml → ai-chat (somente se supabase/functions/** mudou)

6. Se a mudança envolveu SQL: aplicar manualmente as migrations novas
   no SQL Editor do Supabase — ANTES do merge, se o código novo depende
   do schema novo, para não deixar produção referenciando algo inexistente.

7. Se a mudança envolveu send-push-notifications ou delete-account:
   deploy manual via `supabase functions deploy <nome>` — não é coberto
   pelo merge em main.

8. Validação pós-deploy manual (ver checklist abaixo).
```

Não há branch de staging/homologação: o merge em `main` é o evento que dispara publicação direta em produção.

---

# Checklist Operacional

### Deploy (frontend)

- [ ] Testes (`npm test`) passando localmente e no CI
- [ ] PR revisado e aprovado
- [ ] Merge em `main` concluído
- [ ] `deploy.yml` concluído com sucesso (Actions → Deploy — GitHub Pages)
- [ ] App carrega em `https://andressamendes.github.io/MedAgenda/`
- [ ] Console do navegador sem erros críticos

### Atualização (geral)

- [ ] Código funcionando localmente (testado manualmente no navegador para mudanças de UI)
- [ ] `npm test` passando
- [ ] Documentação relevante atualizada (`docs/*.md`, `README.md`, `CHANGELOG.md` quando aplicável)
- [ ] `config.js` e demais segredos não incluídos no commit
- [ ] CI verde no PR

### Migração (SQL)

- [ ] Nova migration numerada sequencialmente em `/sql`, nunca uma migration já aplicada em produção editada
- [ ] RLS habilitado e políticas cobrindo SELECT/INSERT/UPDATE/DELETE conforme necessário, declaradas na própria migration
- [ ] Dependências de outras migrations documentadas no cabeçalho do arquivo
- [ ] Migration termina com `UPDATE public.schema_version SET version = <N>, applied_at = now() WHERE id = 1;` (P0 — ver "Proteção contra Divergência de Schema")
- [ ] `EXPECTED_SCHEMA_VERSION` incrementado em `schemaService.js` para `<N>`, no mesmo commit
- [ ] Migration aplicada manualmente no SQL Editor do Supabase **antes** de publicar código que dependa dela
- [ ] Se a mudança afeta recorrência: `recurrence.js` (frontend) e `_shared/recurrence-core.js` (Edge Function) revisados e mantidos sincronizados

### Rollback

- [ ] Commit/PR problemático identificado no histórico do Git
- [ ] Frontend: revert do commit + push em `main` (dispara `deploy.yml` automaticamente) ou re-run manual de um deploy anterior
- [ ] Edge Function `ai-chat`: revert + push em `main` (automático) ou `supabase functions deploy ai-chat` manual com o código revertido
- [ ] Edge Functions `send-push-notifications`/`delete-account`: `supabase functions deploy <nome>` manual, sempre — nunca automático
- [ ] Banco: **sem mecanismo de rollback automatizado** — reversão de schema exige SQL manual escrito e revisado caso a caso
- [ ] Validação pós-rollback repetindo o checklist de "Validação"

### Validação (pós-deploy)

- [ ] Login com e-mail/senha funciona
- [ ] Logout funciona
- [ ] Criar, editar e excluir compromisso funcionam
- [ ] Calendário mensal e agenda semanal exibem eventos
- [ ] Categorias personalizadas funcionam
- [ ] Recorrência funciona (criar evento recorrente)
- [ ] PWA instalável (botão "Instalar MedAgenda" aparece)
- [ ] Modo offline funciona (ativar modo avião e recarregar)
- [ ] Console sem erros críticos
- [ ] (Se Edge Function alterada) resposta HTTP e logs da função conferidos no Supabase Dashboard

---

# Auditoria

Verificação de cobertura da documentação operacional e do pipeline real, sem qualquer alteração de código. Inconsistências são apenas registradas.

| Item verificado | Status | Observação |
|---|---|---|
| Deploy do frontend documentado | Consistente | `deploy.yml` corresponde exatamente ao que está descrito em `DEPLOY.md`, `ARCHITECTURE.md`/`ARQUITETURA.md` e neste documento. |
| Todos os workflows documentados | Consistente | 3 workflows no repositório (`ci.yml`, `deploy.yml`, `deploy-functions.yml`); todos documentados acima com objetivo, gatilho, etapas e artefatos. |
| Todas as Edge Functions documentadas | Consistente | 3 funções (`ai-chat`, `send-push-notifications`, `delete-account`); todas cobertas nesta e em outras docs (`BACKEND.md`, `SECURITY.md`). |
| Deploy automatizado cobre todas as Edge Functions | **Inconsistência confirmada** | `deploy-functions.yml` só publica `ai-chat`. `send-push-notifications` e `delete-account` dependem de deploy manual — risco real de divergência entre o código no repositório e o que está de fato em produção, já apontado em `BACKEND.md`, `SECURITY.md` e `DEVELOPMENT.md`. |
| Migrations cobertas por CI/CD | **Lacuna parcialmente resolvida (P0)** | Nenhum workflow *aplica* migrations SQL — isso continua manual. Mas, desde `14_schema_version.sql` + o passo "Validate database schema version" em `deploy.yml`, o pipeline **valida automaticamente** que a versão mínima de schema exigida pelo frontend já foi aplicada, e bloqueia a publicação caso não tenha sido — o registro de quais migrations foram aplicadas agora existe (`public.schema_version`), mesmo que a aplicação em si continue manual. |
| Monitoramento documentado | Consistente, porém limitado | `diagnosticService.js`, `telemetryService.js`, `errorService.js`, `ai_metrics` e os logs nativos de Edge Functions/GitHub Actions são os únicos mecanismos existentes — todos documentados acima. Desde a Auditoria A2.6, `errorService.js` é o ponto único de categorização de erros do frontend e `diagnosticService.js` também expõe o buffer de erros recentes. Ainda não há agregador central entre frontend e backend nem alerta automatizado; isso não é uma omissão da documentação, é o estado real do projeto. |
| Backup documentado ou existente | **Ausência confirmada** | Nenhum backup de banco, Storage ou configuração é realizado, agendado ou documentado por este repositório. Registrado explicitamente na seção "Backup". |
| Ambientes separados (dev/staging/prod) | **Ausência confirmada** | Um único projeto Supabase é referenciado via `SUPABASE_PROJECT_REF` nos workflows; não há evidência de projetos distintos por ambiente. |
| Rollback de Edge Functions | **Ausência confirmada** | Não há histórico de versão gerenciado nem comando de rollback — apenas reverter o commit no Git e reimplantar manualmente/automaticamente. |
| Secrets sem exposição indevida | Consistente | Nenhum valor de secret sensível foi encontrado versionado no repositório; `config.js` está listado em `.gitignore`. |

Estas observações replicam e consolidam, sob a ótica operacional, achados já registrados independentemente nas seções "Auditoria" de `BACKEND.md`, `SECURITY.md` e `DEVELOPMENT.md` — não são novos problemas descobertos, mas a mesma realidade confirmada a partir da leitura direta de `.github/workflows/`, `supabase/` e `docs/` para este documento.

---

# Estado Atual

| Métrica | Quantidade |
|---|---|
| Workflows do GitHub Actions | 3 (`ci.yml`, `deploy.yml`, `deploy-functions.yml`) |
| Edge Functions | 3 (`ai-chat`, `send-push-notifications`, `delete-account`) |
| Edge Functions com deploy automatizado | 1 de 3 (`ai-chat`) |
| Migrations SQL | 8, aplicadas manualmente |
| Ambientes | 1 (produção única; sem dev/staging/prod separados) |
| Forma oficial de deploy | Push/merge em `main` → GitHub Actions → GitHub Pages (frontend, sempre) + Supabase (`ai-chat`, condicional) |
| Mecanismo de backup | Nenhum implementado neste repositório |
| Mecanismo de monitoramento centralizado | Nenhum (checagens locais no frontend + logs nativos do Supabase e do GitHub Actions) |

**Avaliação geral da operação:**

A operação do MedAgenda é enxuta e coerente com o porte do projeto — um site estático publicado por CI, um backend inteiramente gerenciado pelo Supabase, e uma superfície mínima de infraestrutura própria para manter. O caminho crítico de deploy (frontend) é totalmente automatizado e confiável. As lacunas reais da operação são conhecidas e já vinham sendo sinalizadas em outros documentos do projeto: deploy automatizado incompleto para Edge Functions (apenas `ai-chat`), migrations SQL fora de qualquer pipeline, ausência total de backup documentado, e ausência de monitoramento centralizado ou alerta automatizado de indisponibilidade. Nenhuma dessas lacunas impede a operação atual do produto, mas todas representam risco operacional real — principalmente a ausência de backup, que hoje depende inteiramente do que a plataforma Supabase oferecer por conta própria, sem qualquer garantia ou verificação por parte deste repositório.
