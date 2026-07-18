# MedAgenda — Arquitetura

---

## Visão Geral

O **MedAgenda** é uma Progressive Web App (PWA) de gerenciamento de agenda projetada especificamente para estudantes de medicina. A aplicação permite organizar um calendário acadêmico e pessoal intenso, cobrindo aulas, plantões, ambulatórios, laboratórios, ligas, estudos, provas, congressos e compromissos pessoais.

**Problema que resolve:** a rotina de estudantes de medicina é fragmentada entre múltiplos calendários institucionais, turnos irregulares e períodos de estudo, sem uma ferramenta centralizada que entenda essa realidade. Agendas genéricas não diferenciam categorias médicas nem oferecem análise de carga de trabalho adaptada ao contexto acadêmico.

**Público-alvo:** estudantes de medicina, residentes médicos e profissionais de saúde em formação que precisam gerenciar agendas de alta complexidade e densidade.

---

## Stack Tecnológica

### Frontend
- HTML5, CSS3, JavaScript ES6+ (módulos nativos, sem frameworks)
- Single Page Application (SPA) com roteamento via visibilidade de elementos DOM

### Backend
- Supabase (plataforma gerenciada): Authentication, PostgreSQL, Storage, Edge Functions

### Banco de Dados
- PostgreSQL com Row Level Security (RLS) ativado em todas as tabelas
- Migrações versionadas via scripts SQL em `/sql/`

### IA
- Google Gemini API (modelo `gemini-2.5-flash`)
- Acesso exclusivamente via Edge Function (chave API nunca exposta no frontend)

### Infraestrutura
- GitHub Pages (hospedagem do frontend, HTTPS gratuito)
- Supabase Cloud (backend gerenciado, região configurável)
- Supabase Storage (armazenamento de avatares)

### Deploy
- GitHub Actions (CI/CD automático em push para `main`)
- Supabase CLI (deploy de Edge Functions)

### PWA
- Service Worker com cache App Shell
- Web App Manifest (`manifest.webmanifest`)
- Web Push API com VAPID para notificações push
- Suporte offline para visualização de dados em cache

### Testes
- Node.js `assert` nativo com ES Modules (`--experimental-vm-modules`)
- Sem dependências externas de test runner

---

## Arquitetura Geral

O sistema segue uma arquitetura cliente–BaaS (Backend as a Service): não há servidor próprio. O frontend estático é servido pelo GitHub Pages e toda a persistência, autenticação e segurança é delegada ao Supabase.

```
Usuário (navegador / PWA instalada)
          ↓
    GitHub Pages
  (HTML + CSS + JS)
          ↓
       Supabase
   ┌──────────────┐
   │     Auth     │  JWT + sessão do usuário
   ├──────────────┤
   │   Database   │  PostgreSQL + RLS
   ├──────────────┤
   │   Storage    │  Avatares dos usuários
   ├──────────────┤
   │Edge Functions│  ai-chat / send-push-notifications / delete-account
   └──────────────┘
          ↓
     Gemini API
  (Google AI Studio)
```

A comunicação entre o frontend e o Supabase ocorre exclusivamente via Supabase JavaScript SDK, carregado via CDN. Nenhuma query SQL é construída no frontend — o SDK abstrai toda a comunicação com o banco.

---

## Modelo de Domínio

Desde a F6, o MedAgenda separa duas grandes áreas conceituais: **Planejamento** (o que o usuário pretende fazer — `events`, `categories`, `academic_calendars`) e **Execução** (o que o usuário efetivamente fez — `activity_sessions`, `questions`, `reviews`, `reflections`). A Execução não substitui o Planejamento; ela registra o fato real, que pode ou não corresponder a um compromisso planejado.

A cadeia de domínio da Execução é:

```
Compromisso (events)
    ↓  (event_id opcional — uma Sessão pode ser avulsa, source: "manual")
Sessão de Estudo (activity_sessions)
    ↓  (session_id obrigatório, 1:N)
Questões (questions)
    ↓
Revisões (reviews)                    ← vínculo opcional Sessão↔Revisão via reviews.session_id
    ↓
Reflexão (reflections, 1:1)
    ↓
Projeções (derivadas, nunca persistidas)
    ├── Dashboard          (activityDashboardService.js)
    ├── Diário de Estudos  (studyJournalView.js + studySummaryService/studyMilestoneService/studyTimelineService;
    │                       inclui as abas "Canceladas"/"Todas" — activityHistoryView.js, F10 #4.2)
    ├── Subject Progress   (subjectProgressService.js)
    ├── Study Streak       (studyStreakService.js)
    └── Achievements       (achievementService.js)
```

**Princípio central: a Sessão é o fato principal.** `activity_sessions` é a única entidade raiz do domínio de Execução — todo o resto (Questões, Reflexão) é composição dela (`ON DELETE CASCADE`), e todo indicador exibido ao usuário (progresso por matéria, sequência de estudo, conquistas, resumos do Dashboard, narrativa do Diário) é **derivado** dela em tempo de leitura, nunca gravado em uma tabela própria. Não existe tabela `milestones`, `streaks` ou `achievements` no banco — ver `DATABASE.md` para o schema completo e a justificativa de cada FK.

Essa é uma escolha arquitetural deliberada, não uma omissão: qualquer mudança na regra de cálculo de um indicador (ex.: como uma "sequência de estudo" é contada) se aplica retroativamente a todo o histórico, porque não há estado duplicado para migrar ou ficar desatualizado.

---

## Session Event Bus

`sessionEventBus.js` é um barramento de eventos em memória (pub/sub puro, sem persistência — o estado se perde em um reload) que desacopla `activitySessionService.js` (o único publicador) de todos os seus consumidores. O barramento nunca conhece os consumidores específicos, e `activitySessionService.js` nunca importa nenhuma View ou Service consumidor — a comunicação é inteiramente indireta.

### Os seis eventos oficiais

| Evento | Publicador (função) | Payload | Responsabilidade |
|---|---|---|---|
| `SessionStarted` | `startSession(fields)` | Sessão recém-criada (`status: "running"`) | Sinaliza início de uma nova sessão. Bloqueado se já existir uma sessão `running` (erro `SESSION_ALREADY_RUNNING`, reforçado pelo índice único parcial `activity_sessions_one_running_per_user`). |
| `SessionPaused` | `pauseSession(id)` | Sessão com `status: "paused"`, `paused_at: <now>` | Sinaliza pausa; só permitida a partir de `running`. |
| `SessionResumed` | `resumeSession(id)` | Sessão com `status: "running"`, `paused_at: null`, `paused_ms` incrementado do intervalo pausado | Sinaliza retomada; só permitida a partir de `paused`. |
| `SessionUpdated` | Toda chamada a `updateActivitySession(id, fields)` | Linha completa atualizada | Evento genérico ("algo na sessão mudou") — publicado internamente por toda transição de status além do seu evento específico, pois todas passam por `updateActivitySession`. |
| `SessionFinished` | `finishSession(id, endedAt)` | Sessão com `status: "finished"`, `ended_at`, `duration_minutes` (líquido, descontando pausas), `paused_at: null` | Sinaliza conclusão; permitida a partir de `running` ou `paused`. |
| `SessionCancelled` | `cancelSession(id)` | Sessão com `status: "cancelled"` | Sinaliza cancelamento; a linha não é excluída — permanece para auditoria com status final `cancelled`, assim como `finished`. |

Cada evento é entregue como `{ session, timestamp, eventType }`. Um listener que lança exceção é capturado e logado sem interromper os demais listeners nem o publicador.

### Consumidores atuais

| Consumidor | Eventos assinados | Reação |
|---|---|---|
| `activityDashboardView.js` | `STARTED`, `FINISHED`, `CANCELLED`, `UPDATED` | Recarrega os indicadores do Dashboard (debounced). |
| `activityHistoryView.js` | `STARTED`, `FINISHED`, `CANCELLED`, `UPDATED` | Recarrega a aba "Canceladas"/"Todas" do Diário de Estudos (F10 #4.2 — não é mais uma página própria). |
| `insightsView.js` | `FINISHED`, `CANCELLED`, `UPDATED` | Recarrega a Central de Insights. Não assina `STARTED`/`PAUSED`/`RESUMED` deliberadamente — todos os blocos de Insights são derivados apenas de sessões já finalizadas. |
| `studyJournalView.js` | `FINISHED`, `CANCELLED`, `UPDATED` | Recarrega a primeira página do Diário de Estudos. |
| `studySessionView.js` | Todos os seis | Re-renderiza a tela de sessão/cronômetro em andamento, refletindo início/pausa/retomada/finalização disparados por outra aba ou fluxo (ex.: "Iniciar Sessão" a partir do formulário de compromisso). |
| `aiContextService.js` | `FINISHED`, `CANCELLED`, `UPDATED` | Marca o contexto de IA em cache como obsoleto (`_dirty`); o próximo `getAIContext()` reconstrói sob demanda. |

Note que `achievementService.js`, `studyStreakService.js`, `subjectProgressService.js` e `activityDashboardService.js` (o Service, distinto da View) **não** assinam o barramento — são projeções puras recalculadas a cada chamada, sob demanda, sem reagir a eventos.

`reviewService.js` mantém um pub/sub próprio (`onReviewStatusChanged`), independente e anterior ao Session Event Bus — não publica nem consome os seis eventos acima.

---

## Fluxo da Sessão de Estudo

Fluxo completo introduzido na F7, do planejamento à reflexão:

```
Planejamento (events, academic_calendars)
    ↓  usuário clica "Iniciar Sessão" num compromisso, ou inicia avulsa
Sessão (activity_sessions: running → paused ⇄ running → finished | cancelled)
    ↓  studySessionView.js — cronômetro, pausa/retomada, Observações (notes)
Questões (questions — resolvidas durante running/paused, via sessionQuestionsService.js)
    ↓
Revisões (reviews — associadas à Sessão que as executou via reviewSessionService.js)
    ↓
Finalização (finishSession() — persiste notes em activity_sessions.notes, calcula duration_minutes líquido, publica SessionFinished)
    ↓  toast de confirmação + navegação direta (F10 #3.4 — sem tela intermediária)
Diário (studyJournalView.js — a sessão finalizada aparece agrupada por dia)
    ↓
Reflexão (reflections — texto livre sobre o aprendizado, 1:1 com a Sessão, editável a qualquer momento a partir do Diário)
```

Cada etapa é opcional além da própria Sessão: é possível finalizar uma sessão sem nunca ter adicionado uma Questão, sem revisão associada e sem escrever uma Reflexão — nenhuma dessas etapas bloqueia a seguinte.

---

## Diário de Estudos

O Diário de Estudos (`studyJournalView.js`, F8) é a tela que consolida a Sessão finalizada com tudo o que foi registrado nela. Ele busca apenas quatro conjuntos de dados por página carregada — sessões finalizadas paginadas (`listSessions`), eventos para metadados (`getEvents`), e Questões/Revisões/Reflexões em lote por lista de `session_id`s (evitando N+1, auditoria AUD-002) — e **deriva tudo o mais em memória**, sem gravar nada além da própria Reflexão:

| Recurso exibido | Módulo | Persistido? |
|---|---|---|
| Agrupamento por dia | `studyJournalView.js` | Não — reorganização visual das sessões já carregadas |
| Filtros e busca | `studySearchService.js` | Não — módulo stateless, opera sobre as entradas já em memória |
| Resumos narrativos semanais | `studySummaryService.js` | Não — texto gerado a partir das sessões visíveis, sem IA |
| Marcos (Milestones) | `studyMilestoneService.js` | Não — recalculados do zero a cada chamada; não existe tabela `milestones`, cache ou evento publicado |
| Timeline / evolução | `studyTimelineService.js` | Não — agregação em memória sobre o subconjunto já filtrado, sem nova consulta ao banco |
| Reflexão | `studyReflectionService.js` | **Sim** — única escrita real da tela, em `reflections` (upsert por `session_id`) |

Nenhum resumo, marco ou narrativa é persistido: Sessão, Questão, Revisão e Reflexão são fatos gravados no banco; tudo o mais que o Diário exibe é interpretação derivada, recalculada a cada carregamento. Isso elimina uma classe inteira de bugs de sincronização (dado derivado desatualizado em relação ao dado bruto) ao custo de recomputar a cada leitura — aceitável dado o volume de dados por usuário.

---

## Estrutura do Projeto

```
MedAgenda/
├── index.html
├── style.css
├── manifest.webmanifest
├── package.json
├── config.example.js
├── config.js                    (gerado pelo CI, não versionado)
├── service-worker.js
├── script.js
├── supabase.js
├── auth.js
├── pwa.js
│
├── .github/workflows/           (pipelines de CI/CD)
│
├── config/
│   └── ai.js
│
├── services/ai/
│   ├── aiService.js
│   ├── providers/
│   ├── parsers/
│   └── prompts/
│
├── sql/                         (migrações do banco)
│
├── supabase/
│   └── functions/               (Edge Functions TypeScript/Deno)
│       ├── ai-chat/
│       ├── send-push-notifications/
│       ├── delete-account/
│       └── _shared/
│
├── tests/                       (testes automatizados)
│
├── docs/                        (documentação)
│
└── icons/                       (ícones PWA 72px–512px)
```

### Responsabilidade de cada diretório

**`/` (raiz):** contém o SPA completo. `index.html` define toda a estrutura DOM da UI. `style.css` contém os estilos globais sem dependências de frameworks CSS. `script.js` é o bootstrap e controlador principal. Os demais arquivos `.js` na raiz são módulos ES6 independentes.

**`/config/`:** configurações de comportamento da aplicação. `ai.js` define o provider de IA ativo, modelo, temperatura e timeout — permite trocar de provider sem alterar código de negócio.

**`/services/ai/`:** camada de integração com IA. Segue o padrão gateway + provider + prompt + parser: `aiService.js` é o único ponto de acesso, `providers/` abstrai qual API é chamada, `prompts/` constrói os contextos enviados ao modelo, `parsers/` normaliza as respostas.

**`/sql/`:** scripts de migração numerados e ordenados (01 a 20). Cada arquivo corresponde a uma funcionalidade — as dez primeiras cobrem Planejamento (eventos, categorias, recorrência, push, perfis, storage, calendário acadêmico, métricas de IA); as dez seguintes (11 a 20) cobrem Execução (sessões de atividade, metas de tempo, revisões, versionamento de schema, questões, vínculo revisão↔sessão, tempo líquido de pausas, reflexões, integridade de sessão única, correção de tipo de meta mensal). Devem ser executados em ordem no banco Supabase. Detalhamento completo em [`DATABASE.md`](DATABASE.md).

**`/supabase/functions/`:** Edge Functions escritas em TypeScript/Deno. Executam no ambiente Supabase — têm acesso a secrets de servidor (chave Gemini, chaves VAPID). O subdiretório `_shared/` contém código compartilhado entre as funções (atualmente `recurrence-core.js`).

**`/tests/`:** testes automatizados de funções puras. Não dependem de banco ou rede — testam lógica de recorrência, cálculos de notificação, análise do assistente e utilitários.

**`/docs/`:** documentação técnica e de produto. Cada arquivo cobre um aspecto específico; este documento (`ARCHITECTURE.md`) serve como ponto de entrada e visão consolidada.

**`/icons/`:** conjunto de ícones PWA em múltiplos tamanhos (72, 96, 128, 144, 152, 192, 384, 512 px) exigidos pelo Web App Manifest para instalação em diferentes plataformas.

---

## Organização dos Módulos

### Infraestrutura e Cliente

| Módulo | Responsabilidade |
|--------|-----------------|
| `supabase.js` | Singleton do cliente Supabase; expõe `currentUserId()` |
| `auth.js` | signIn, signUp, signOut, password reset, onAuthStateChange |
| `pwa.js` | Registro do Service Worker, prompt de instalação, banner offline |
| `service-worker.js` | Cache App Shell, estratégia offline, handler de push |
| `script.js` | Bootstrap: inicializa todos os módulos e coordena o estado global |

### Serviços de Dados

| Módulo | Responsabilidade |
|--------|-----------------|
| `eventService.js` | CRUD completo de eventos pessoais; consultas por intervalo de datas |
| `categoryService.js` | CRUD de categorias; criação das categorias padrão no primeiro acesso |
| `academicCalendarService.js` | CRUD de calendários acadêmicos e seus eventos; expansão de eventos multi-dia |
| `profileService.js` | Leitura e escrita do perfil (nome, universidade, semestre, timezone, tema) |
| `avatarService.js` | Upload e remoção de avatares via Supabase Storage |

### Lógica de Negócio — Planejamento

| Módulo | Responsabilidade |
|--------|-----------------|
| `recurrence.js` | Re-exporta `recurrence-core.js` — expansão de eventos recorrentes |
| `icsImporter.js` | Parser RFC 5545 para importação de arquivos `.ics` |
| `icsExporter.js` | Geração de arquivos `.ics` para exportação de eventos |
| `timeGoals.js` | Validação e limites das Metas de Tempo (`profiles.daily/weekly/monthly_goal_minutes`) |

### Domínio de Execução — Sessão, Questões, Revisões, Reflexão (F6–F8)

| Módulo | Responsabilidade |
|--------|-----------------|
| `sessionEventBus.js` | Barramento de eventos em memória dos 6 eventos oficiais da Sessão — ver seção "Session Event Bus" |
| `activitySessionService.js` | Único publicador do Session Event Bus; CRUD e máquina de estados da Sessão (`running`/`paused`/`finished`/`cancelled`), cálculo de duração líquida |
| `activitySessionStats.js` | Estatísticas puras sobre um conjunto de sessões (sem acesso ao banco) |
| `questionService.js` | CRUD puro de Questões (`questions`), sem regras de negócio |
| `sessionQuestionsService.js` | Orquestra Sessão + Questão: só permite adicionar questão a sessão ativa (`running`/`paused`) |
| `reviewService.js` | CRUD de Revisões (`reviews`), geração automática de datas de repetição espaçada; pub/sub próprio (`onReviewStatusChanged`), independente do Session Event Bus |
| `reviewSessionService.js` | Vincula/desvincula uma Revisão à Sessão que a executou (`reviews.session_id`) |
| `reflectionService.js` | Motor de indicadores do "Coach Inteligente" (F3.4) — analisa taxa de conclusão, tempo vs. meta, categorias negligenciadas; **não** é a Reflexão da Sessão |
| `studyReflectionService.js` | CRUD 1:1 da Reflexão da Sessão (`reflections`), upsert por `session_id` — é a única escrita do Diário de Estudos |
| `subjectProgressService.js` | Projeção pura: progresso por matéria, derivado de Sessões + Questões + Eventos, nunca persistido |
| `studyStreakService.js` | Projeção pura: sequência de dias de estudo, derivada apenas de sessões `finished`, nunca persistida |
| `achievementService.js` | Projeção pura: conquistas fixas (tempo total, sessões concluídas, questões resolvidas, sequência, matérias estudadas), recalculadas a cada chamada |
| `activityDashboardService.js` | Indicadores do Dashboard (minutos hoje/semana/mês, progresso de metas) — funções puras sobre `listByDateRange()` + `getProfile()` |
| `studySummaryService.js` | Resumo narrativo semanal do Diário de Estudos, derivado das sessões visíveis, sem IA |
| `studyMilestoneService.js` | Marcos (Milestones) do Diário de Estudos, recalculados do zero a cada chamada, nunca persistidos |
| `studyTimelineService.js` | Timeline/evolução do Diário de Estudos, agregação em memória sobre entradas já filtradas |
| `studySearchService.js` | Busca e filtros do Diário de Estudos, módulo stateless |
| `planningService.js` | Sugestão de plano semanal de estudo (`computeWeeklyPlan`) — função pura, nunca cria evento/sessão nem grava no banco |
| `decisionEngine.js` / `recommendationEngine.js` | Regras de decisão e recomendação usadas pelo Assistente/Coach |
| `userMemoryService.js` | Memória de preferências do usuário consumida pela camada de IA/recomendação |
| `aiContextService.js` | Consolida o contexto usado pela IA a partir de Sessões/Questões/Revisões; invalidado via Session Event Bus |

### Notificações

| Módulo | Responsabilidade |
|--------|-----------------|
| `notificationService.js` | Notificações locais via Notification API (requer app aberto); agenda janela de 7 dias |
| `pushService.js` | Assinaturas Web Push via VAPID; persiste subscriptions no banco |

### Serviços de Suporte

| Módulo | Responsabilidade |
|--------|-----------------|
| `errorService.js` | Captura, categorização e exibição de erros; modo dev ativa logging detalhado |
| `telemetryService.js` | Rastreamento de eventos para observabilidade (sem PII) |
| `diagnosticService.js` | Verificações de saúde: Service Worker, storage, rede, banco |
| `toastService.js` | Exibição de mensagens toast (sucesso, erro, informação) |
| `utils.js` | Funções puras: `pad()`, `isoDate()`, `localDate()`, `escapeHtml()`, `truncate()`, `mondayOf()` |
| `transitionUtils.js` | `revealWithAnimation()` — microinteração de revelação (F10 #5.1) aplicada na troca skeleton→conteúdo e na abertura de seções expansíveis; puro CSS (`@keyframes content-reveal`), respeita `prefers-reduced-motion` automaticamente via media query |

### Módulos de View

| Módulo | Responsabilidade |
|--------|-----------------|
| `authView.js` | Telas públicas: login, cadastro, confirmação de e-mail, recuperação de senha |
| `navigationView.js` | Sidebar, bottom-nav mobile, roteamento de páginas, drawer toggle |
| `eventFormView.js` | Modal de criação e edição de compromissos, incluindo seletor de recorrência |
| `categoryView.js` | Modal de gerenciamento de categorias (criar, editar, excluir) |
| `accountView.js` | Modal "Minha Conta": perfil, upload de avatar, troca de senha |
| `academicCalendarView.js` | Modal de gerenciamento de calendários acadêmicos |
| `academicCalendarEventsView.js` | Gerenciamento de eventos dentro de um calendário acadêmico |
| `academicCalendarICSView.js` | UI de importação e exportação ICS para calendários acadêmicos |
| `academicCalendarFilter.js` | Barra de filtros para visibilidade dos calendários |
| `aiPanelView.js` | Drawer do chat com Gemini: resumo semanal, sugestões de estudo, análise de conflitos |
| `calendar.js` | Renderização do calendário mensal com sobreposição de calendários acadêmicos; renderiza dentro da aba "Mês" da página Agenda (F10 #4.1 — não é mais uma página própria) |
| `weekView.js` | Grade semanal com slots de tempo (7h–23h), 7 dias; renderiza dentro da aba "Semana" da página Agenda, aba padrão (F10 #4.1) |
| `quickAdd.js` | Criação rápida de evento via clique em slot de tempo |
| `confirmDialog.js` | Modal de confirmação reutilizável |
| `studySessionView.js` | Tela de sessão em andamento: cronômetro, pausa/retomada, registro de Questões/Revisões (persistidas imediatamente ao adicionar, durante running/paused — F10 #4.3, não mais só no encerramento); ao finalizar, o resumo mostra um recap somente-leitura + Observações, confirma com um toast e navega direto ao Diário (F10 #3.4 — sem tela de resumo intermediária); assina todos os 6 eventos do Session Event Bus |
| `activityDashboardView.js` | Renderiza o Dashboard de Atividade; assina `SessionStarted/Finished/Cancelled/Updated` |
| `activityHistoryView.js` | Lista paginada de sessões por status (todas/canceladas); embutida na aba "Canceladas"/"Todas" do Diário de Estudos (F10 #4.2 — não é mais uma página própria); assina `SessionStarted/Finished/Cancelled/Updated` |
| `insightsView.js` | Central de Insights (execução, metas, revisões, produtividade); assina `SessionFinished/Cancelled/Updated` |
| `studyJournalView.js` | Diário de Estudos — aba "Concluídas": agrupamento por dia, filtros, busca, resumos, marcos, narrativa, timeline e Reflexão; abas "Canceladas"/"Todas" delegadas a `activityHistoryView.js`; assina `SessionFinished/Cancelled/Updated` |
| `onboardingTourView.js` | Tour de boas-vindas leve e opcional (F10 #5.4): cartão dispensável no topo da Agenda (nunca um modal), mostrado uma única vez para quem nunca teve nenhuma sessão de estudo (`hasAnySession()`); mesmo padrão visual/de dispensa do estado vazio didático de `weekView.js` (F10 #1.6) |
| `planListView.js` | Exibe a sugestão de plano semanal de `planningService.js` |
| `smartCardView.js` | Cartão de sugestão/insight reutilizável exibido em várias telas |
| `abandonedSessionDialog.js` | Diálogo de recuperação de sessão `running`/`paused` deixada aberta (F7.8) |
| `stateView.js` | Estados vazios/carregando/erro reutilizáveis entre telas |
| `modalController.js` | Coordenação genérica de abertura/fechamento de modais |
| `diagnosticModal.js` / `settingsModal.js` | Modais de diagnóstico do sistema e configurações |
| `authError.js` | Normalização de mensagens de erro de autenticação |
| `healthService.js` | Verificações de saúde complementares ao `diagnosticService.js` |
| `schemaService.js` | Lê `public.schema_version` no bootstrap e compara com `EXPECTED_SCHEMA_VERSION`, bloqueando o app contra schema desatualizado |

### Camada de IA

| Módulo | Responsabilidade |
|--------|-----------------|
| `config/ai.js` | Provider ativo, modelo, temperatura, timeout, max tokens |
| `services/ai/aiService.js` | Único ponto de acesso à IA pelo frontend |
| `providers/geminiProvider.js` | Chama a Edge Function `ai-chat` com JWT do usuário |
| `parsers/responseParser.js` | Normaliza e valida a resposta retornada pelo modelo |
| `prompts/weeklySummary.js` | Prepara eventos da semana atual para análise narrativa |
| `prompts/studySuggestion.js` | Prepara eventos dos próximos 14 dias para sugestões de slots |
| `prompts/scheduleAnalysis.js` | Prepara eventos dos próximos 30 dias para análise de conflitos |

---

## Fluxos Principais

### Login

1. Usuário acessa a URL da aplicação
2. SDK verifica localStorage — sessão existente redireciona diretamente para o app
3. Sem sessão: exibe `#login-screen` com formulário de e-mail e senha
4. Usuário submete credenciais → `auth.signIn()` → Supabase Auth valida
5. JWT retornado é armazenado pelo SDK no localStorage
6. `onAuthStateChange` dispara → `script.js` carrega dados e exibe `#app-screen`

### Cadastro

1. Usuário clica em "Criar conta" no formulário de login
2. Preenche nome, e-mail e senha
3. `auth.signUp()` cria usuário no Supabase Auth
4. Trigger no banco cria automaticamente o registro em `profiles` com o nome informado
5. Supabase envia e-mail de confirmação
6. Usuário confirma e-mail → pode fazer login

### Recuperação de Senha

1. Usuário clica em "Esqueceu sua senha?"
2. Informa e-mail → `auth.resetPasswordForEmail()`
3. Supabase envia link de recuperação com token de uso único
4. Usuário clica no link → redirecionado para o app com token na URL
5. App detecta token → exibe formulário de nova senha
6. `auth.updateUser({ password })` atualiza a senha
7. Usuário é redirecionado para login

### Criação de Compromisso

1. Usuário clica no botão "+" ou em um slot da agenda semanal
2. Modal `#event-modal` abre com campos pré-preenchidos (data/hora se via slot)
3. Usuário preenche título, data, hora, categoria, recorrência, lembrete
4. `eventService.createEvent()` envia para Supabase
5. RLS valida que `user_id = auth.uid()`
6. Evento salvo → views de calendário e agenda são atualizadas
7. `notificationService` agenda lembretes locais para os próximos 7 dias

### Atualização de Compromisso

1. Usuário clica em um evento existente
2. Modal abre com dados carregados
3. Usuário edita campos e confirma
4. Para eventos recorrentes: apresenta opção de editar apenas esta ocorrência ou todas as futuras
5. `eventService.updateEvent()` envia PATCH para Supabase
6. Views são re-renderizadas

### Exclusão de Compromisso

1. Usuário abre modal de edição e clica em "Excluir"
2. `confirmDialog` solicita confirmação
3. Para eventos recorrentes: opção de excluir apenas esta ocorrência ou todos
4. `eventService.deleteEvent()` envia DELETE para Supabase
5. Views atualizadas

### Categorias

1. Usuário acessa "Categorias" via sidebar ou bottom-nav
2. Modal `#cat-overlay` exibe categorias padrão e customizadas
3. Padrão (8 fixas): Aula, Plantão, Ambulatório, Laboratório, Estudo, Prova, Congresso, Pessoal
4. Usuário pode criar categorias com nome e cor customizados
5. `categoryService.createCategory()` salva em `categories`
6. Índice único `(user_id, lower(name))` previne duplicatas (case-insensitive)

### Calendário Acadêmico

1. Usuário acessa "Calendários" via sidebar
2. Cria um ou mais calendários (ex: Faculdade UFMG, Liga de Cardiologia)
3. Cada calendário tem nome, instituição, cor e ano letivo
4. Dentro de cada calendário, usuário adiciona eventos com data início e fim (suporta multi-dia)
5. Eventos acadêmicos são exibidos no calendário mensal sobrepostos aos eventos pessoais
6. Barra de filtros permite mostrar/ocultar cada calendário independentemente
7. Suporte a importação/exportação via `.ics` (formato iCalendar)

### Assistente IA

1. Usuário clica em "Assistente IA" na sidebar (ícone de rascunho)
2. Drawer `#ai-panel` abre
3. Usuário escolhe o tipo de análise:
   - **Resumo da semana:** eventos da semana atual enviados ao Gemini; retorna análise narrativa em português
   - **Sugestões de estudo:** eventos dos próximos 14 dias; retorna 3–5 slots livres recomendados
   - **Análise de agenda:** eventos dos próximos 30 dias; identifica conflitos e riscos de sobrecarga
4. `aiPanelView` → `aiService` → `geminiProvider` → Edge Function `ai-chat` → Gemini API
5. Edge Function valida JWT, constrói prompt, chama Gemini, retorna resposta
6. Resposta exibida no drawer em português

### Push Notifications

1. Usuário ativa notificações em Configurações
2. Navegador solicita permissão (Notification API)
3. `pushService.subscribeToPush()` cria assinatura PushManager com chave VAPID pública
4. Assinatura (endpoint + p256dh + auth) salva em `push_subscriptions`
5. Edge Function `send-push-notifications` roda a cada minuto via Supabase Scheduler
6. Para cada evento com lembrete: calcula `hora_evento - reminder_minutes`
7. Se dentro da janela de 5 minutos: envia Web Push via VAPID para todas as assinaturas do usuário
8. `notification_logs` registra envio para evitar duplicatas em eventos recorrentes
9. Service Worker recebe push e exibe notificação, mesmo com app fechado

---

## Comunicação entre Camadas

```
Usuário (ação na UI)
        ↓
   View (*.View.js)
   — captura evento DOM
   — valida input local
        ↓
   Service (*.Service.js)
   — formata payload
   — chama Supabase SDK
        ↓
   Supabase SDK (CDN)
   — adiciona JWT ao header
   — envia requisição HTTPS
        ↓
   Supabase API (REST/PostgREST)
   — valida JWT
   — aplica RLS (auth.uid())
        ↓
   PostgreSQL
   — executa query
   — retorna dados filtrados
        ↓
   Supabase SDK
   — deserializa resposta
        ↓
   Service
   — retorna dados ao chamador
        ↓
   View
   — re-renderiza componente
```

Toda a comunicação é assíncrona (`async/await`). Erros são capturados pelos serviços e repassados ao `errorService.js`, que exibe toast ao usuário e loga detalhes em modo dev.

---

## Arquitetura da IA

```
aiPanelView.js
  — usuário seleciona tipo de análise
  — coleta eventos do período relevante
        ↓
aiService.js
  — único gateway de IA
  — lê config/ai.js para determinar provider
        ↓
providers/geminiProvider.js
  — monta request com JWT do usuário
  — envia para Edge Function (não chama Gemini diretamente)
        ↓
supabase/functions/ai-chat/index.ts
  — valida JWT (auth.getUser)
  — valida e sanitiza payload
  — constrói prompt final com contexto dos eventos
  — chama Gemini API com chave do ambiente (secret)
  — loga métricas (tipo, duração, sucesso)
        ↓
Google Gemini API (gemini-2.5-flash)
  — processa prompt
  — retorna texto em português
        ↓
parsers/responseParser.js
  — normaliza e valida resposta
        ↓
aiPanelView.js
  — exibe resposta no drawer
```

**Privacidade:** somente título, data, hora, duração e categoria dos eventos são enviados ao Gemini. Descrição, localização detalhada e IDs nunca são transmitidos. Não há histórico de conversa armazenado.

---

## Arquitetura PWA

### Service Worker

O `service-worker.js` implementa a estratégia **App Shell**:

- **Na instalação:** pré-cacheia todos os assets estáticos (HTML, CSS, JS, ícones, manifest)
- **Em fetch:** retorna do cache para assets do App Shell; passa direto para rede nas chamadas à API Supabase e recursos de terceiros
- **Atualizações:** detecta nova versão via hash de cache e ativa o novo Service Worker automaticamente (`self.skipWaiting()` na instalação), sem confirmação do usuário

### Cache

| Tipo de Recurso | Estratégia |
|-----------------|-----------|
| Assets estáticos (JS, CSS, HTML) | Cache-first (App Shell) |
| Supabase API | Network-only (sempre dados frescos) |
| Cross-origin (CDN) | Network-only |
| Mutações (POST, PUT, DELETE) | Network-only, nunca cacheado |

### Manifest

`manifest.webmanifest` define o comportamento da instalação PWA:
- **display:** `standalone` (interface sem barra do navegador)
- **start_url:** `/MedAgenda/`
- **theme_color:** `#3b82f6` (azul padrão)
- **lang:** `pt-BR`
- **orientation:** `portrait-primary`
- Ícones em 8 tamanhos (72px a 512px)

### Offline

- Dados já carregados ficam visíveis offline via cache do Service Worker
- Barra de aviso exibida quando sem conexão
- Escritas (criar/editar/excluir) requerem conexão — o SDK do Supabase não implementa fila offline
- Service Worker recebe push notifications mesmo com app fechado

### Push

- Utiliza Web Push Protocol (W3C) com autenticação VAPID
- Chave pública VAPID incluída no frontend via `config.js` (gerado pelo CI)
- Chave privada VAPID armazenada como secret no Supabase (nunca exposta)
- Assinaturas armazenadas em `push_subscriptions`; uma por dispositivo/navegador

---

## Deploy

```
Desenvolvedor faz push para branch main
        ↓
GitHub Actions — ci.yml
  — executa npm test
  — falha aqui bloqueia os próximos steps
        ↓
GitHub Actions — deploy.yml
  — gera config.js com secrets do repositório:
      SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY
  — faz upload do artefato para GitHub Pages
        ↓
GitHub Pages
  — serve os arquivos estáticos em HTTPS
  — URL: https://andressamendes.github.io/MedAgenda/
        ↓
GitHub Actions — deploy-functions.yml
  (executa apenas se /supabase/functions/** foi alterado)
  — autentica no Supabase com SUPABASE_ACCESS_TOKEN
  — deploya Edge Functions via Supabase CLI
        ↓
Supabase Cloud
  — Edge Functions disponíveis imediatamente
  — Scheduler send-push-notifications continua ativo (cron * * * * *)
```

### Segredos necessários no repositório GitHub

| Secret | Uso |
|--------|-----|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon pública do Supabase |
| `SUPABASE_PROJECT_REF` | ID do projeto (para CLI) |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal para autenticação no CLI |
| `VAPID_PUBLIC_KEY` | Chave pública para Web Push |

### Segredos necessários no Supabase

| Secret | Uso |
|--------|-----|
| `GEMINI_API_KEY` | Chave da Google AI Studio para Gemini |
| `VAPID_PRIVATE_KEY` | Chave privada VAPID para assinatura de push |
| `VAPID_SUBJECT` | E-mail do remetente VAPID (`mailto:...`) |

---

## Princípios Arquiteturais

**ES Modules nativos:** o projeto usa `import`/`export` nativos sem bundler. Cada arquivo é um módulo com responsabilidade única. Isso elimina dependências de build e mantém o debug direto no navegador.

**Separação entre UI e Services:** os módulos `*View.js` não fazem chamadas ao banco. Toda persistência passa pelos `*Service.js`. Views recebem dados prontos e se responsabilizam apenas pela renderização e captura de eventos DOM.

**RLS como camada de segurança principal:** o banco não depende de filtros aplicados pelo código. Políticas de Row Level Security garantem que, independentemente da query, um usuário só acessa seus próprios dados. Isso protege contra bugs no código frontend.

**Edge Functions para segredos:** nenhuma chave de API de terceiros (Gemini, VAPID privado) é incluída no frontend. Operações que requerem credenciais privilegiadas são delegadas a Edge Functions com acesso a secrets de servidor.

**Fonte única de verdade para recorrência:** `recurrence-core.js` é compartilhado entre frontend (`recurrence.js`) e Edge Functions (`_shared/recurrence-core.js`). A mesma lógica que expande eventos para exibição também determina o timing de notificações push — sem divergência de comportamento.

**Progressive Enhancement:** a aplicação funciona sem IA, sem push notifications e sem calendários acadêmicos. Cada funcionalidade avançada é uma camada adicional; a agenda básica funciona com apenas autenticação e banco.

**JavaScript Vanilla:** ausência deliberada de frameworks (React, Vue, Angular). Reduz a superfície de dependências, elimina overhead de bundle e mantém controle total sobre o ciclo de vida dos componentes.

**PWA-first:** a aplicação é projetada para ser instalável e funcionar offline. O Service Worker é parte central da arquitetura, não um add-on tardio.

**Separação entre Planejamento e Execução:** `events`/`categories`/`academic_calendars` representam o que o usuário *pretende* fazer; `activity_sessions`/`questions`/`reviews`/`reflections` representam o que ele *efetivamente* fez. As duas áreas se conectam por uma referência opcional (`activity_sessions.event_id`), nunca por herança ou tabela compartilhada — uma Sessão pode existir sem nenhum compromisso (`source: "manual"`).

**Serviços de domínio puros:** `activitySessionStats.js`, `subjectProgressService.js`, `studyStreakService.js`, `achievementService.js`, `studyMilestoneService.js`, `studyTimelineService.js`, `studySearchService.js` e `planningService.js` não escrevem no banco, não publicam eventos e não mantêm cache entre chamadas — recebem dados já carregados e devolvem um resultado derivado.

**Projeções derivadas, nunca persistidas:** todo indicador agregado (progresso por matéria, sequência de estudo, conquistas, resumos e marcos do Diário, indicadores do Dashboard) é recalculado a partir dos fatos brutos (`activity_sessions`, `questions`, `reviews`, `reflections`) a cada leitura. Não existe tabela `milestones`, `streaks` ou `achievements`.

**Ausência de estado duplicado:** a Sessão é a única fonte de verdade sobre tempo de estudo — `duration_minutes` (líquido, descontando pausas) nunca é recalculado ou espelhado em outra tabela. Reflexão (`reflections`) e Observações (`activity_sessions.notes`) são conceitos distintos e nunca compartilham coluna.

**Session Event Bus como único canal de propagação:** mudanças de estado da Sessão chegam às Views e Services interessados exclusivamente via `sessionEventBus.js`, nunca por polling ou acoplamento direto entre módulos consumidores. Ver seção "Session Event Bus" acima.

---

## Estado Atual

**Versão:** inclui Calendário Acadêmico (v1.1.0), Assistente IA, e o domínio completo de Execução de Estudo (Sessão, Questões, Revisões, Reflexão) introduzido nas fases F6–F8. Schema de banco na versão 20 (`public.schema_version`).

**Funcionalidades implementadas:**

- Autenticação completa: login, cadastro, recuperação de senha, confirmação de e-mail, exclusão de conta com cascade de dados
- CRUD de eventos pessoais com 8 tipos de recorrência
- Visualização mensal (calendário) e semanal (grade com slots de tempo)
- Criação rápida via clique em slot de tempo
- 8 categorias padrão + categorias customizadas com cores
- Calendários acadêmicos: múltiplos por usuário, sobreposição no calendário, filtros de visibilidade
- Importação e exportação de eventos via iCalendar (.ics)
- Notificações locais (app aberto) com janela de agendamento de 7 dias
- Notificações push Web Push com VAPID (app fechado), enviadas via Edge Function agendada
- Assistente IA com Google Gemini: resumo semanal, sugestões de estudo, análise de conflitos e sobrecarga
- Assistente inteligente local baseado em regras (fallback e uso independente)
- Perfil de usuário: nome, universidade, semestre, timezone, avatar, tema, Metas de Tempo (diária/semanal/mensal)
- Sessão de Estudo: cronômetro com pausa/retomada, duração líquida, recuperação de sessão abandonada, vínculo opcional a um compromisso
- Questões resolvidas durante a Sessão (tipo, dificuldade, matéria, status)
- Revisões com repetição espaçada, vinculáveis à Sessão que as executou
- Reflexão da Sessão (1:1) e Diário de Estudos: agrupamento por dia, filtros, busca, resumos narrativos, marcos e timeline — todos projeções em memória
- Dashboard de Atividade, Histórico de Sessões e Central de Insights, reativos ao Session Event Bus
- Subject Progress, Study Streak e Achievements como projeções derivadas de Sessões/Questões
- Proteção contra divergência de schema (`schema_version` + validação no deploy)
- PWA instalável com suporte offline para dados em cache
- Modo desenvolvedor com logging detalhado
- Diagnóstico de sistema (Service Worker, storage, rede, banco)
- Deploy automatizado via GitHub Actions (testes + frontend + Edge Functions)

**Arquitetura consolidada:** o projeto está modularizado em responsabilidades claras. A separação entre views, services e lógica de negócio está estabelecida, agora também refletindo a separação conceitual entre Planejamento e Execução. A fonte única de verdade para recorrência elimina divergências entre frontend e backend. O Session Event Bus elimina acoplamento direto entre `activitySessionService.js` e seus consumidores. O pipeline de CI/CD cobre testes e deploy de forma integrada.

**Observações para futuras evoluções:**
- Não existe sistema de autenticação via OAuth (apenas e-mail/senha)
- Não há cache offline para mutações; escrita requer conexão com internet
- O scheduler de push roda em cron (`* * * * *`) no Supabase — requer ativação manual no dashboard ou configuração via pg_cron
- A configuração de `config.js` é gerada em cada deploy; alterações locais são descartadas
- Todos os textos da interface estão em português (pt-BR); não há sistema de i18n
- Study Streak, Subject Progress e Achievements existem como serviços testados; a exposição direta em UI dedicada (fora do Diário de Estudos) é trabalho futuro (ver `docs/AUDITORIA_TECNICA_F9.md`)
