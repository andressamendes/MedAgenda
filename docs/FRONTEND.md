# Frontend MedAgenda

## Visão Geral

O frontend do MedAgenda é construído com **JavaScript Vanilla** usando **ES Modules nativos do navegador**, sem frameworks como React, Vue ou Angular. A aplicação é uma Single Page Application (SPA) cujo roteamento funciona por visibilidade de elementos DOM — não há troca de URL ou rerenderização de página.

### Pilares da arquitetura

**JavaScript Vanilla com ES Modules**
Cada arquivo é um módulo com `import`/`export` explícitos. O navegador resolve o grafo de dependências diretamente, sem etapa de build ou bundler. Isso mantém o ciclo de desenvolvimento simples e elimina tooling desnecessário.

**Organização por responsabilidades**
Os arquivos são classificados em três camadas: Views (UI e interação com o DOM), Services (acesso a dados e lógica de negócio) e módulos de domínio (lógica pura, sem efeitos colaterais). Não existe uma pasta `/views/` ou `/services/` formal para a maioria dos módulos — a separação é conceitual e refletida nos nomes dos arquivos.

**Comunicação entre módulos via imports e callbacks**
Módulos de UI importam Services diretamente. O ponto de entrada (`script.js`) inicializa os módulos de UI e injeta callbacks para coordenar ações entre domínios — por exemplo, `refreshAll` é passado como callback para `eventFormView.js` e `quickAdd.js`, garantindo que a UI refresque após qualquer mutação de dados.

**Separação entre UI e Services**
Os módulos `*Service.js` contêm exclusivamente chamadas ao Supabase e lógica de dados. Os módulos `*View.js` contêm exclusivamente manipulação de DOM e interação com o usuário. Módulos como `smartAssistant.js` e `analytics.js` são puramente computacionais — sem DOM e sem Supabase.

---

## Estrutura de Diretórios

```
/
├── index.html               Única página HTML — carrega script.js como módulo
├── script.js                Bootstrap e controlador principal da aplicação
├── style.css                Estilos globais da aplicação (único arquivo CSS)
├── manifest.webmanifest     Manifesto PWA (nome, ícones, display mode)
├── service-worker.js        Service Worker para cache offline e push notifications
│
├── config/                  Configurações da aplicação
│   └── ai.js               Parâmetros do modelo de IA (provider, model, temperature)
│
├── services/                Módulos de serviço organizados por domínio
│   └── ai/                 Gateway de Inteligência Artificial
│       ├── aiService.js         Ponto de entrada público do subsistema de IA
│       ├── providers/
│       │   └── geminiProvider.js    Integração com a Edge Function ai-chat
│       ├── prompts/
│       │   ├── weeklySummary.js     Preparação de payload para resumo semanal
│       │   ├── studySuggestion.js   Preparação de payload para sugestão de estudo
│       │   └── scheduleAnalysis.js  Preparação de payload para análise de agenda
│       └── parsers/
│           └── responseParser.js    Normalização do texto retornado pela IA
│
├── supabase/                Backend Supabase (Edge Functions e shared modules)
│   └── functions/
│       └── _shared/
│           └── recurrence-core.js   Fonte canônica da lógica de recorrência
│
├── tests/                   Testes automatizados (Jest)
│   ├── recurrence.test.js
│   ├── recurrence-notification.test.js
│   ├── smartAssistant.test.js
│   ├── analytics.test.js
│   └── utils.test.js
│
├── docs/                    Documentação do projeto
├── icons/                   Ícones PWA (múltiplos tamanhos)
└── sql/                     Scripts SQL de migração do banco de dados
```

### Responsabilidade de cada diretório

**/config**
Configurações estáticas da aplicação que não são segredos. Atualmente contém apenas `ai.js` com os parâmetros do modelo Gemini. Credenciais (SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY, APP_URL) ficam em `config.js` (não versionado — ver `config.example.js`).

**/services/ai**
Implementação do subsistema de Inteligência Artificial em três subcamadas: prompts (preparam os dados dos eventos), providers (fazem a chamada HTTP), parsers (normalizam a resposta). Isola completamente a lógica de IA do restante da aplicação.

**/supabase/functions/_shared**
Módulo compartilhado entre frontend e Edge Functions. `recurrence-core.js` implementa a expansão de eventos recorrentes e é importado tanto pelo frontend quanto pela Edge Function `send-push-notifications`, garantindo comportamento idêntico nos dois ambientes.

**/tests**
Testes unitários com Jest para módulos puramente lógicos. Cobrem recorrência, assistente inteligente, analytics e utilitários.

**/docs**
Documentação técnica do projeto. Cada arquivo cobre um domínio específico.

**/icons**
Ícones nos tamanhos exigidos pelo manifesto PWA (152px, 192px, 512px).

**/sql**
Migrações do banco de dados PostgreSQL versionadas. Não fazem parte do bundle frontend.

---

## Arquitetura Geral

```
Usuário
   │
   ▼
index.html  (única página, carrega script.js como <script type="module">)
   │
   ▼
script.js  (Bootstrap: inicializa serviços, Views e AuthView)
   │
   ├──► authView.js  (controla sessão e alternância entre telas)
   │        │
   │        ▼
   │    auth.js  (wrap das funções do Supabase Auth)
   │        │
   │        ▼
   │    supabase.js  (cliente Supabase, currentUserId())
   │
   ├──► Views de UI  (navigationView, eventFormView, categoryView, etc.)
   │        │
   │        ▼
   │    Services  (eventService, categoryService, academicCalendarService, etc.)
   │        │
   │        ▼
   │    supabase.js  → Supabase (PostgreSQL)
   │
   ├──► aiPanelView.js
   │        │
   │        ▼
   │    services/ai/aiService.js
   │        │
   │        ▼
   │    services/ai/providers/geminiProvider.js
   │        │
   │        ▼
   │    Edge Function ai-chat  →  Google Gemini API
   │
   └──► pwa.js  (service-worker.js, offline detection, install prompt)
```

### Camadas

**index.html**
Define a estrutura estática de toda a UI: tela de carregamento, telas de autenticação (login, cadastro, recuperação de senha), aplicação principal (header, sidebar, páginas, bottom nav), todos os modais e o painel de IA. Carrega `script.js` como `<script type="module">`. Declara a Content Security Policy da aplicação via `<meta http-equiv="Content-Security-Policy">` (ver `SECURITY.md`) — não há inline scripts nem inline styles no documento.

**script.js (Bootstrap)**
Único ponto de entrada do bundle. Importa e inicializa todos os módulos de UI. Mantém o estado compartilhado `allEvents` (lista de eventos do usuário). Coordena a sequência de inicialização após login.

**Views**
Módulos responsáveis por manipular DOM, responder a eventos de usuário e chamar Services. São inicializados pelo bootstrap e recebem callbacks para coordenar ações entre si.

**Services**
Módulos responsáveis por chamadas ao Supabase. Retornam Promises e lançam erros quando a operação falha. Não tocam no DOM.

**Módulos de domínio puro**
`smartAssistant.js`, `analytics.js`, `recurrence.js` e `utils.js` são funções puras: recebem dados, retornam resultados, sem efeitos colaterais.

**Supabase**
Backend gerenciado: banco de dados PostgreSQL com RLS, autenticação, armazenamento de arquivos e Edge Functions para operações que exigem segredos.

---

## Bootstrap da Aplicação

### Ponto de entrada

O `index.html` carrega um único módulo:

```html
<script type="module" src="script.js"></script>
```

`script.js` importa `registerServiceWorker`, `initInstallButton` e `initOfflineDetection` de `pwa.js` e os chama ao final de sua execução, junto com os demais `init*()`. Esse bootstrap era antes um segundo `<script type="module">` inline em `index.html`; foi movido para dentro de `script.js` para que a página não dependa de script inline (permitindo uma Content Security Policy sem `'unsafe-inline'` em `script-src` — ver `SECURITY.md`).

### Sequência de inicialização

**1. Serviços de observabilidade (imediato)**
As primeiras linhas de `script.js` chamam `initErrorService()` e `initTelemetry()`, instalando handlers globais de erro (`window.onerror`, `unhandledrejection`) e inicializando o buffer de telemetria.

**2. Inicialização de módulos de UI**
`script.js` chama sequencialmente: `initNavigation()`, `initCategoryView()`, `initEventForm(refreshAll)`, `initAssistantView()`, `initAIPanel()`. Esses módulos registram listeners de DOM mas não fazem chamadas à rede ainda.

**3. Controle de sessão (`initAuthView`)**
`authView.js` é inicializado por último. Ele:
- Registra um timer de segurança de 10 segundos (garante que o usuário nunca fique preso na tela de carregamento).
- Chama `onAuthStateChange()` para reagir a mudanças de estado da sessão Supabase.
- Chama `getSession()` imediatamente para verificar se já existe uma sessão ativa.

**4. Fluxo de sessão existente**
Se `getSession()` ou `onAuthStateChange` retornam uma sessão válida, `showApp(session)` é chamado. Ele esconde a tela de carregamento, exibe a aplicação e chama o callback `_initApp(session)` (definido em `script.js`).

**5. `_initApp(session)` — inicialização pós-login**
```
restoreSidebarState()
→ exibe e-mail e inicial do avatar no header
→ initAccountView(userId)
→ initNotifications(userId)
→ initPushService(userId, vapidPublicKey)
→ syncPushSubscription()
→ initAcademicModal()
→ initAcademicCalendarView(onChangeCb)     [carrega calendários acadêmicos]
→ renderFilterBar("filter-bar")
→ setCalendarAcademicProvider / setWeekViewAcademicProvider
→ initCategories()                         [carrega/cria categorias padrão]
→ initWeekView / initCalendar / loadEvents  [em paralelo com Promise.all]
→ restoreLastPage()                        [restaura a página ativa salva no localStorage]
```

**6. Renderização inicial**
`loadEvents()` busca os eventos do usuário, renderiza a lista de compromissos, agenda lembretes e dispara `renderAssistant()` com os dados carregados.

---

## Organização dos Módulos

### script.js

**Objetivo:** bootstrap e controlador principal da aplicação.

**Responsabilidade:** único ponto de entrada do bundle. Inicializa todos os módulos de UI na ordem correta, mantém o estado compartilhado `allEvents`, implementa os domínios que ainda não foram extraídos (configurações de notificações, lista de compromissos com filtros, modal de diagnóstico, modo desenvolvedor).

**Quem utiliza:** o `index.html` como `<script type="module">`.

**Quem ele utiliza:** eventService, calendar, weekView, quickAdd, notificationService, pushService, telemetryService, errorService, diagnosticService, accountView, academicCalendarView, assistantView, aiPanelView, confirmDialog, navigationView, categoryView, eventFormView, authView, utils, toastService.

**Estado interno:**
- `allEvents` — lista de todos os eventos do usuário, atualizada a cada `loadEvents()`.

**Principais funções:**
- `_initApp(session)` — inicializa toda a aplicação após login bem-sucedido.
- `refreshAll()` — recarrega eventos, weekView e calendar em paralelo; atualiza timestamp de sincronização.
- `loadEvents()` — busca eventos, atualiza `allEvents`, renderiza lista, agenda notificações, atualiza assistente. Em caso de falha, chama `renderListError()` — nunca renderiza a lista vazia como se não houvesse compromissos (ver Auditoria A2.7).
- `renderFilteredList()` — aplica filtros de busca/categoria/ordenação e renderiza a lista de compromissos.
- `renderList(events)` — constrói os cards de evento no DOM.
- `renderListError(message)` — exibe o estado de erro da lista (mensagem amigável categorizada por `errorService` + botão "Tentar novamente"), distinto do estado "sem compromissos".
- `handleDelete(id, card)` — exclui evento com confirmação via `confirmDialog`.
- `openSettings() / closeSettings()` — controla o modal de configurações.
- `renderSettingsState() / renderPushState()` — atualiza o estado visual das configurações de notificação.
- `openDiagnostic()` — executa diagnóstico e exibe o overlay.
- `_isDevMode() / _setDevMode()` — lê e grava o modo desenvolvedor no localStorage.

---

### authView.js

**Objetivo:** gerenciar toda a experiência de autenticação e controle de sessão.

**Responsabilidade:** renderiza e controla as telas de login, cadastro, confirmação de e-mail, recuperação de senha e redefinição de senha. Observa o estado da sessão Supabase e coordena a transição entre a tela de auth e a aplicação principal. Garante que a aplicação nunca seja inicializada duas vezes para o mesmo usuário.

**Quem utiliza:** `script.js` (via `initAuthView()`).

**Quem ele utiliza:** auth.js, telemetryService, toastService, weekView (para destruir a view ao fazer logout).

**Estado interno:**
- `_loginScreen`, `_appScreen`, `_appLoading` — referências ao DOM.
- `_initializedUserId` — ID do usuário já inicializado (guarda contra dupla inicialização).
- `_onSignedIn`, `_onBeforeSignOut` — callbacks injetados por `script.js`.

**Principais funções exportadas:**
- `initAuthView({ onSignedIn, onBeforeSignOut })` — inicializa o módulo e começa a observar a sessão.
- `showAuthView(name)` — exibe uma sub-view específica (login, register, forgot, etc.).
- `showLogin()` — atalho para `showAuthView('login')`.
- `showApp(session)` — transição para a aplicação principal; chama `onSignedIn` uma vez por sessão.

---

### auth.js

**Objetivo:** encapsular todas as chamadas ao Supabase Auth.

**Responsabilidade:** exposição de funções puras de autenticação: login, cadastro, logout, sessão, reset de senha, atualização de senha e listener de mudança de estado.

**Quem utiliza:** authView.js, accountView.js.

**Quem ele utiliza:** supabase.js, config.js (APP_URL para redirectTo).

**Principais funções exportadas:**
- `signIn(email, password)` — autenticação com e-mail e senha.
- `signUp(email, password, fullName)` — cadastro de novo usuário.
- `signOut()` — encerramento de sessão.
- `getSession()` — retorna a sessão atual ou null.
- `sendPasswordReset(email)` — envia e-mail de recuperação.
- `updatePassword(newPassword)` — atualiza a senha do usuário autenticado.
- `onAuthStateChange(callback)` — registra listener de mudanças de sessão.

---

### supabase.js

**Objetivo:** criar e exportar o cliente Supabase único da aplicação.

**Responsabilidade:** instancia o cliente Supabase com as credenciais de `config.js`. Exporta `currentUserId()`, função utilitária usada por todos os Services para obter o ID do usuário autenticado com verificação de sessão.

**Quem utiliza:** todos os módulos `*Service.js`, aiPanelView, accountView, diagnosticService.

**Principais exportações:**
- `supabase` — instância do cliente Supabase JS.
- `currentUserId()` — retorna o ID do usuário ou lança erro se não autenticado.

---

### navigationView.js

**Objetivo:** controlar a navegação entre páginas, sidebar e bottom nav.

**Responsabilidade:** gerencia qual página está visível (`agenda`, `calendar`, `appointments`), controla a abertura/fechamento da sidebar (incluindo comportamento adaptativo desktop/mobile), controla o dropdown do menu do usuário, persiste e restaura a última página visitada.

**Quem utiliza:** `script.js` (via `initNavigation()`), e indiretamente todos os elementos `[data-page]` do DOM.

**Estado interno:**
- `appSidebar`, `sidebarOverlay` — referências ao DOM.
- `localStorage` — persiste última página (`medagenda_last_page`) e estado da sidebar (`medagenda_sidebar_collapsed`).

**Principais funções exportadas:**
- `initNavigation()` — registra todos os listeners de navegação.
- `showPage(name)` — exibe a página indicada e atualiza o estado visual dos nav items.
- `restoreLastPage()` — restaura a página salva no localStorage.
- `openSidebar() / closeSidebar()` — controla sidebar em mobile.
- `restoreSidebarState()` — restaura estado colapsado/expandido em desktop.

---

### eventFormView.js

**Objetivo:** modal de criação e edição de compromissos.

**Responsabilidade:** gerencia o modal de formulário de eventos com todos os campos (título, data, hora, duração, categoria, cor, local, observação, lembrete, recorrência). Distingue entre modo criação e modo edição via `editingId`. Para eventos recorrentes, exibe confirmação antes de abrir o formulário.

**Quem utiliza:** `script.js` (inicialização e injeção de `refreshAll`), calendar.js e weekView.js indiretamente via callback `handleEventClick`.

**Quem ele utiliza:** eventService (createEvent, updateEvent), confirmDialog, telemetryService, toastService.

**Estado interno:**
- `editingId` — ID do evento sendo editado (null quando em modo criação).
- `_onSave` — callback injetado por `script.js` para acionar `refreshAll` após salvar.
- Referências a todos os campos do formulário DOM.

**Principais funções exportadas:**
- `initEventForm(onSave)` — inicializa o módulo e registra todos os listeners.
- `openEventForm(ev?)` — abre o modal; se `ev` fornecido, preenche o formulário para edição.
- `handleEventClick(ev)` — valida se o evento é recorrente, exibe confirmação e abre o formulário.

---

### quickAdd.js

**Objetivo:** modal de adição rápida de compromissos diretamente do calendário.

**Responsabilidade:** modal leve com apenas título e hora, acionado ao clicar em um dia (calendar.js) ou em um slot de horário (weekView.js). Cria o evento e chama o callback de refresh. O modal é criado dinamicamente no DOM na primeira vez que é usado (lazy init).

**Quem utiliza:** `script.js` (passa `openQuickAdd` como `onDayClick`/`onSlotClick` para calendar e weekView).

**Quem ele utiliza:** eventService (createEvent).

**Estado interno:**
- `selectedDate`, `onSaveCallback` — persistem entre o momento de abertura e o salvamento.
- Elementos do modal criados dinamicamente e reutilizados.

**Principais funções exportadas:**
- `openQuickAdd(date, onSave, time?)` — abre o modal para a data especificada; `time` é opcional (preenchido quando acionado pelo weekView).

---

### calendar.js

**Objetivo:** calendário mensal com visualização de eventos.

**Responsabilidade:** renderiza a grade mensal com navegação por mês. Exibe eventos pessoais (via `eventService`) e acadêmicos (via provider injetado) em chips coloridos. Chama callbacks ao clicar em dia (quickAdd) ou em evento (eventForm). Suporta filtragem de visibilidade de eventos pessoais. Em caso de falha ao buscar eventos, exibe um estado de erro distinto (`.cal-error`, mensagem amigável categorizada por `errorService` + botão "Tentar novamente") em vez de renderizar a grade vazia (ver Auditoria A2.7).

**Quem utiliza:** `script.js` (inicializa e injeta providers e callbacks).

**Quem ele utiliza:** eventService (getEventsByRange), recurrence (expandEvents), utils (pad, isoDate, isoToday).

**Estado interno:**
- `container`, `calYear`, `calMonth`, `callbacks` — estado da view atual.
- `_academicProvider` — função injetada por `script.js` para buscar eventos acadêmicos.
- `_showPersonal` — predicado injetado por `script.js` para controlar visibilidade de eventos pessoais.

**Principais funções exportadas:**
- `initCalendar(el, cbs)` — inicializa o calendário no elemento fornecido.
- `refreshCalendar()` — rebusca e rerenderiza o mês atual.
- `resetCalendar()` — limpa o DOM renderizado e o estado do módulo (chamado no logout, via `onBeforeSignOut`); `refreshCalendar()` volta a ser no-op até o próximo `initCalendar()`.
- `setCalendarAcademicProvider(fn)` — injeta o provider de eventos acadêmicos.
- `setCalendarPersonalVisibility(fn)` — injeta o predicado de visibilidade pessoal.

---

### weekView.js

**Objetivo:** agenda semanal com grade de horários (time grid).

**Responsabilidade:** renderiza a semana atual com colunas por dia (Seg–Dom) e linhas de 30 minutos. Posiciona eventos como blocos na grade com altura proporcional à duração. Exibe uma linha do "agora" que atualiza a cada minuto via `setInterval`. Distingue eventos pessoais de acadêmicos visualmente. Auto-scroll para o horário atual ao carregar. Em caso de falha ao buscar eventos, exibe um banner de erro distinto (`#wk-error`, mensagem amigável + botão "Tentar novamente") em vez de deixar a grade silenciosamente vazia (ver Auditoria A2.7).

**Quem utiliza:** `script.js`.

**Quem ele utiliza:** eventService (getEventsByRange), recurrence (expandEvents), utils (pad, isoDate, isoToday, mondayOf, escapeHtml).

**Estado interno:**
- `_el`, `_cbs`, `_mon` — elemento container, callbacks e segunda-feira da semana exibida.
- `_nowTimer` — ID do `setInterval` para atualização da linha do agora.
- `_academicProvider`, `_showPersonal` — injetados externamente.

**Principais funções exportadas:**
- `initWeekView(el, cbs)` — inicializa a view e começa o timer da linha do agora.
- `refreshWeekView()` — rebusca e rerenderiza a semana atual.
- `destroyWeekView()` — limpa o timer, o DOM renderizado (grade, dica de IA e plano da semana) e o estado do módulo, incluindo o cache `_weeklyPlan` (chamado no logout).
- `setWeekViewAcademicProvider(fn)` / `setWeekViewPersonalVisibility(fn)` — injetores de estado externo.

---

### categoryView.js

**Objetivo:** modal de gerenciamento de categorias.

**Responsabilidade:** lista, cria, edita e exclui categorias. Mantém um cache local (`categoriesCache`) que alimenta o `<select>` de categoria no formulário de evento. Ao selecionar uma categoria no formulário, sincroniza automaticamente a cor. Ao inicializar, garante a existência das categorias padrão via `ensureDefaultCategories`. Uma falha ao carregar a lista de categorias no modal exibe um estado de erro distinto (`.cat-empty.cat-error` + botão "Tentar novamente") em vez de "Nenhuma categoria cadastrada." (ver Auditoria A2.7).

**Quem utiliza:** `script.js` (via `initCategoryView()` e `initCategories()`).

**Quem ele utiliza:** categoryService, utils (escapeHtml), confirmDialog.

**Estado interno:**
- `categoriesCache` — array de categorias em memória; sincronizado com o banco ao criar/editar/excluir.
- Referências aos elementos DOM do modal.

**Principais funções exportadas:**
- `initCategoryView()` — registra listeners do modal de categorias.
- `initCategories()` — garante categorias padrão e preenche o select do formulário de evento.
- `categoryColor(name)` — retorna a cor da categoria pelo nome (usada em `script.js` ao renderizar a lista).
- `openCategoryModal()` — abre o modal de gerenciamento.

---

### accountView.js

**Objetivo:** modal "Minha Conta" com perfil, senha e exclusão de conta.

**Responsabilidade:** carrega e exibe o perfil do usuário (nome, universidade, curso, semestre, fuso horário, avatar). Permite atualizar o perfil, fazer upload/remoção de foto, alterar senha e excluir a conta (via Edge Function `delete-account`).

**Quem utiliza:** `script.js` (via `initAccountView(userId)`), navigationView (o botão "Minha Conta" no header).

**Quem ele utiliza:** supabase (para invocar a Edge Function `delete-account`), auth (updatePassword), profileService (getProfile, upsertProfile), avatarService (uploadAvatar, removeAvatar), toastService, telemetryService, utils (escapeHtml), confirmDialog.

**Estado interno:**
- `_overlay`, `_profile`, `_userId` — overlay DOM, perfil carregado e ID do usuário.

**Principais funções exportadas:**
- `initAccountView(userId)` — inicializa o módulo e registra o listener do botão "Minha Conta".
- `open()` — carrega o perfil e exibe o modal.
- `close()` — fecha o modal.

---

### assistantView.js

**Objetivo:** assistente inteligente local baseado em regras.

**Responsabilidade:** exibe o painel do assistente na página Agenda com quatro cards: Alertas/Conflitos, Sugestões, Estatísticas do mês e Próximos 7 dias. Permite fechar e reexibir o painel. O assistente é repopulado toda vez que `loadEvents()` é chamado em `script.js`.

**Quem utiliza:** `script.js` (via `initAssistantView()` e `renderAssistant(events)`).

**Quem ele utiliza:** smartAssistant (analyzeEvents), analytics (computeStats), utils (escapeHtml).

**Estado interno:**
- `_assistantSection`, `_assistantBody` — referências ao DOM.
- `_assistantHidden` — bool que persiste o estado de oculto durante a sessão; resetado no logout por `resetAssistant()`.
- `_lastEvents` — último array de eventos recebido, usado para rerenderizar ao exibir novamente.

**Principais funções exportadas:**
- `initAssistantView()` — registra os listeners de fechar/reexibir o painel.
- `renderAssistant(events)` — atualiza o conteúdo do painel com novos dados.
- `resetAssistant()` — resetado no logout para que o assistente apareça automaticamente no próximo login.

---

### aiPanelView.js

**Objetivo:** painel lateral de Inteligência Artificial (Gemini).

**Responsabilidade:** controla o painel deslizante de IA com três ações disponíveis (resumo semanal, sugestão de horários de estudo, análise de conflitos). Gerencia os estados do painel: ações, loading e resultado. Respeita o filtro de visibilidade de eventos pessoais ao buscar dados para a IA.

**Quem utiliza:** `script.js` (via `initAIPanel()`), navigationView (botão "Assistente IA" na sidebar e bottom nav).

**Quem ele utiliza:** eventService (getEvents), academicCalendarView (isPersonalVisible), services/ai/aiService (getWeeklySummary, getStudySuggestion, getScheduleAnalysis).

**Principais funções exportadas:**
- `initAIPanel()` — registra todos os listeners do painel de IA.

---

### academicCalendarView.js

**Objetivo:** modal de gestão de calendários acadêmicos.

**Responsabilidade:** orquestra a UI completa dos calendários acadêmicos: lista de calendários, formulário de criação/edição, lista de eventos por calendário, importação/exportação ICS. Mantém um cache de calendários em memória. Expõe `getAcademicEventProvider()` — uma função que retorna eventos acadêmicos filtrados por visibilidade, usada pelo calendar e weekView. Se `showCalendarList()` falhar ao buscar e não houver cache anterior, exibe um estado de erro distinto com botão "Tentar novamente"; se já houver cache (atualização), degrada mantendo a última lista conhecida + toast de aviso (ver Auditoria A2.7).

**Quem utiliza:** `script.js`.

**Quem ele utiliza:** academicCalendarService, academicCalendarFilter (isPersonalVisible, isCalendarVisible, renderFilterBar), academicCalendarEventsView (initEventsView, showEventList), academicCalendarICSView (initICSView, triggerICSImport, handleICSExport), toastService, utils (escapeHtml), confirmDialog.

**Estado interno:**
- `_calendarsCache` — lista de calendários acadêmicos do usuário em memória.
- `_onChange` — callback injetado por `script.js` para recarregar views após mutações.
- `_activeCalendar` — calendário sendo visualizado no momento.
- `_modalOverlay`, `_modalTitle`, `_modalBody` — referências ao modal DOM.

**Principais funções exportadas:**
- `initAcademicCalendarView(onChangeCb)` — inicializa o módulo e carrega calendários.
- `initAcademicModal()` — registra listeners do modal DOM.
- `openAcademicCalendarModal()` — abre o modal na lista de calendários.
- `getAcademicEventProvider()` — retorna a função provider para calendar e weekView.
- `renderFilterBar(containerId)` — renderiza a barra de filtros na sidebar.
- `getCachedCalendars()` — retorna o cache atual de calendários.
- `isPersonalVisible` / `isCalendarVisible` — re-exportados de academicCalendarFilter.

---

### academicCalendarEventsView.js

**Objetivo:** sub-view de eventos dentro do modal de calendários acadêmicos.

**Responsabilidade:** lista, cria, edita e exclui eventos acadêmicos de um calendário específico. Implementada como módulo de UI puro que recebe suas dependências via `initEventsView()` para evitar acoplamento direto com `academicCalendarView.js`. Uma falha ao buscar os eventos exibe um estado de erro distinto com botão "Tentar novamente", em vez de "Nenhum evento neste calendário." (ver Auditoria A2.7).

**Quem utiliza:** academicCalendarView.js (via `initEventsView()`).

**Quem ele utiliza:** academicCalendarService (getAcademicEvents, createAcademicEvent, updateAcademicEvent, deleteAcademicEvent), toastService, utils (escapeHtml), confirmDialog.

**Principais funções exportadas:**
- `initEventsView(deps)` — injeta dependências do módulo pai.
- `showEventList(calId)` — exibe a lista de eventos do calendário especificado.
- `ACADEMIC_CATEGORIES` — array de categorias padrão para eventos acadêmicos.

---

### academicCalendarICSView.js

**Objetivo:** importação e exportação de calendários no formato ICS.

**Responsabilidade:** ao importar, abre um `<input type="file">` virtual, parseia o ICS, deduplica contra eventos existentes, confirma com o usuário e faz bulk insert. Ao exportar, busca os eventos, gera o ICS e faz download via link virtual.

**Quem utiliza:** academicCalendarView.js (via `initICSView()`).

**Quem ele utiliza:** academicCalendarService, icsImporter (parseICS, deduplicateEvents), icsExporter (exportToICS, downloadICS), toastService, confirmDialog.

**Principais funções exportadas:**
- `initICSView(deps)` — injeta dependências.
- `triggerICSImport(calId)` — abre o seletor de arquivo e inicia o fluxo de importação.
- `handleICSExport(calId)` — exporta o calendário como arquivo ICS.

---

### academicCalendarFilter.js

**Objetivo:** gerenciar o estado dos filtros de visibilidade dos calendários.

**Responsabilidade:** persiste no `localStorage` quais calendários acadêmicos estão visíveis e se os eventos pessoais estão ativos. Renderiza a barra de filtros na sidebar com checkboxes para cada calendário.

**Quem utiliza:** academicCalendarView.js (re-exporta `isPersonalVisible` e `isCalendarVisible`).

**Estado externo:**
- `localStorage` — chaves `medagenda_filter_personal` e `medagenda_filter_academic` (JSON com mapa calendarId → bool).

**Principais funções exportadas:**
- `isPersonalVisible()` — retorna se eventos pessoais devem ser exibidos.
- `isCalendarVisible(calendarId)` — retorna se o calendário especificado está visível.
- `renderFilterBar(containerId, calendarsCache, onChangeCb)` — renderiza os checkboxes de filtro.

---

### smartAssistant.js

**Objetivo:** motor de análise de agenda baseado em regras.

**Responsabilidade:** recebe o array de eventos e retorna `{ alerts, suggestions }`. Completamente puro: sem DOM, sem chamadas à rede. Detecta conflitos de horário, plantões longos, plantões seguidos de aula cedo, plantões consecutivos, duplicatas, dias muito cheios, dias sem intervalo, provas concentradas em uma semana e ausência de estudos por mais de 12 dias.

**Quem utiliza:** assistantView.js.

**Quem ele utiliza:** recurrence (expandEvents), utils (isoDate, localDate).

**Principais funções exportadas:**
- `analyzeEvents(allBaseEvents)` — retorna `{ alerts: [...], suggestions: [...] }`.

---

### analytics.js

**Objetivo:** cálculo de estatísticas da agenda.

**Responsabilidade:** recebe o array de eventos e retorna estatísticas do mês atual (total de eventos, total de horas, top categorias por horas) e os próximos 5 eventos nos próximos 7 dias. Completamente puro.

**Quem utiliza:** assistantView.js.

**Quem ele utiliza:** recurrence (expandEvents), utils (isoDate).

**Principais funções exportadas:**
- `computeStats(allBaseEvents)` — retorna objeto com `totalThisMonth`, `totalHours`, `topCategories`, `countByCategory`, `upcoming`.

---

### notificationService.js

**Objetivo:** agendamento de notificações locais do navegador.

**Responsabilidade:** agenda `setTimeout`s para disparar `Notification` nativas nos horários corretos, respeitando a janela de 7 dias. Respeita a preferência do usuário (salva no localStorage por userId). Expande eventos recorrentes para calcular todas as ocorrências dentro da janela.

**Quem utiliza:** `script.js` (via `initNotifications()`, `scheduleReminders()`, `isSupported()`, `isEnabled()`, `setEnabled()`, `permissionStatus()`, `requestPermission()`).

**Quem ele utiliza:** recurrence (expandEvent), utils (isoDate).

**Estado interno:**
- `_userId` — necessário para chave de preferência no localStorage.
- `_scheduled` — Map de key → timeoutId para poder cancelar lembretes existentes antes de reagendar.

---

### pushService.js

**Objetivo:** gerenciar assinaturas de Push Notifications.

**Responsabilidade:** encapsula todo o ciclo de vida de Push: solicitar permissão, criar assinatura via PushManager, salvar no Supabase (`push_subscriptions`), remover ao cancelar, re-sincronizar ao login. A chave VAPID pública é configurada em `config.js` — a chave privada fica exclusivamente no Supabase.

**Quem utiliza:** `script.js`.

**Quem ele utiliza:** supabase.js.

**Estado interno:**
- `_userId`, `_vapidPubKey` — injetados via `initPushService()`.
- `localStorage` — persiste estado habilitado/desabilitado por userId.

**Principais funções exportadas:**
- `initPushService(userId, vapidPublicKey)`.
- `isPushSupported() / isPushEnabled()`.
- `subscribeToPush() / unsubscribeFromPush()`.
- `syncPushSubscription()` — re-sincroniza a assinatura existente com o Supabase após login.

---

### errorService.js

**Objetivo:** centralizar o tratamento e classificação de erros.

**Responsabilidade:** instala handlers globais de erro no `window`. Classifica erros em categorias (auth, network, database, ai, push, service_worker, unknown). Gera mensagens amigáveis em português. Mantém um log circular dos últimos 100 erros, consultável via `getRecentErrors()` (usado por `diagnosticService.js`). Registra erros via telemetry. Opcionalmente exibe toast ao usuário.

**F4.2 (causa raiz da divergência entre Dashboard/Insights/Revisões):** `categorize()` classificava erros de autenticação só por substrings em inglês na mensagem (`'jwt'`, `'session'`, `'invalid login'`...). Erros reais do auth-js do Supabase (GoTrueClient) — refresh token inválido/ausente/já usado, sessão ausente — têm mensagens que não batem com nenhuma dessas substrings (ex.: `"Auth session missing!"`, `"Invalid Refresh Token: Refresh Token Not Found"`), e caíam em `unknown`/`database` → "Erro ao comunicar com o servidor" em vez de "Sessão expirada". A correção: todo erro do auth-js carrega a flag interna `__isAuthError`, independentemente da subclasse ou do idioma da mensagem — `categorize()` agora verifica essa flag primeiro, antes das substrings. `friendlyMessage()` também tinha um efeito colateral: checava a palavra solta `"invalid"`, então "Invalid Refresh Token..." virava por engano "E-mail ou senha incorretos." — restrito agora ao texto que realmente indica credenciais de login erradas. Em `supabase.js`, `currentUserId()` descartava o `error` retornado por `getSession()` (a falha real do refresh, com `__isAuthError`) e sempre lançava um texto genérico próprio — agora preserva o erro real do Supabase quando ele existe.

**Quem utiliza:** `script.js` (via `initErrorService()`). `handleError()` é chamado explicitamente por praticamente todas as views que fazem CRUD ou chamam um service (ver Auditoria A2.6 em `OPERATIONS.md`), além dos handlers globais.

**Quem ele utiliza:** toastService (showToast), telemetryService (track).

**Estado interno:**
- `_logs` — array circular de até 100 entradas de erro.
- `_devMode` — controla se os erros são detalhados no console.

**Principais funções exportadas:**
- `initErrorService(devMode)` — instala handlers globais.
- `setErrorDevMode(enabled)`.
- `handleError(err, context)` — classifica, loga e trata um erro. Retorna `{ category, friendly }`; a mensagem `friendly` é reaproveitada pelos fluxos de carregamento (lista, calendário, semana, categorias, calendário acadêmico) para exibir um estado de erro distinto do estado vazio (ver Auditoria A2.7 em `OPERATIONS.md`).
- `getRecentErrors(limit)` — retorna cópia dos últimos erros registrados (usado por `diagnosticService.js`).

---

### stateView.js

**Objetivo:** componente único de estado de carregamento — sessão expirada / erro de rede / servidor indisponível (F4.1).

**Responsabilidade:** traduz o `{ category, friendly }` já produzido por `errorService.handleError()` num dos três estados de UI acionáveis (`session_expired` / `network` / `server`) e renderiza sempre o mesmo layout — ícone, título, descrição e ação — nas telas de carregamento/listagem: lista de compromissos (`script.js`), calendário, agenda semanal, Central de Insights (todos os quatro blocos), Dashboard de Execução, categorias, calendário acadêmico (calendários e eventos), histórico de sessões e Painel de IA. Nenhuma dessas telas decide mensagem, ícone ou ação por conta própria; todas chamam `errorToState(handleError(err, {...}))` e passam o resultado para este módulo. `session_expired` nunca oferece "Tentar novamente" — a única ação é "Entrar novamente", que aciona o fluxo oficial de reautenticação (`authView.forceReauth()`) registrado uma única vez no bootstrap via `setReauthHandler()` (ver `script.js`). Isso resolve a divergência histórica em que cada tela tratava sessão expirada, erro de rede e "servidor indisponível" com mensagens e comportamentos próprios (algumas sem nenhuma ação de recuperação).

**Quem utiliza:** script.js, calendar.js, weekView.js, insightsView.js, activityDashboardView.js, activityHistoryView.js, categoryView.js, academicCalendarView.js, academicCalendarEventsView.js, aiPanelView.js.

**Quem ele utiliza:** utils.js (`escapeHtml`, só na variante em string). Nunca importa `errorService.js` diretamente — cada tela chama `handleError()` ela mesma e repassa o resultado, mantendo a classificação num único lugar sem acoplar este módulo a ele.

**Estado interno:**
- `_reauthHandler` — função registrada via `setReauthHandler()`; por padrão (antes do bootstrap registrar o handler real), recarrega a página.

**Principais funções exportadas:**
- `STATES` — `{ SESSION_EXPIRED, NETWORK, SERVER }`.
- `errorToState({ category, friendly })` — mapeia a categoria de `errorService` para um dos três estados.
- `categoryToState(category)` — mesma tradução, para telas que só têm a categoria (ex.: `aiPanelView.js`).
- `renderStateBlock(container, { state, message, onRetry })` — substitui o conteúdo de `container` pelo bloco de estado completo.
- `stateBlockMarkup({ state, message })` / `wireStateBlock(root, onRetry)` — mesma coisa em duas etapas, para telas que montam um template maior de uma vez (categorias, calendário acadêmico).
- `clearStateBlock(container)` — remove as classes do bloco de estado quando a tela volta ao conteúdo normal.
- `setReauthHandler(fn)` / `triggerReauth()` — registra e aciona o fluxo oficial de reautenticação.

---

### diagnosticService.js

**Objetivo:** verificar a saúde dos serviços da aplicação.

**Responsabilidade:** executa verificações assíncronas de conectividade com o Supabase (com medição de latência), status de autenticação (usuário, expiração do token), estado do Service Worker e permissão de Push. Retorna um objeto de diagnóstico estruturado.

**Quem utiliza:** `script.js` (via `runDiagnostics()`).

**Quem ele utiliza:** supabase.js.

**Principais funções exportadas:**
- `runDiagnostics()` — retorna objeto com status de todos os serviços.
- `updateLastSync()` — grava o timestamp da última sincronização no localStorage.
- `APP_VERSION` — constante com a versão atual da aplicação (`'1.0.0-rc1'`).

---

### telemetryService.js

**Objetivo:** rastrear eventos de uso da aplicação.

**Responsabilidade:** mantém um buffer circular de até 200 eventos de telemetria em memória. Em modo desenvolvedor, exibe os eventos no console em formato de tabela. A integração com um provider externo (Google Analytics, etc.) é um ponto de extensão futuro.

**Quem utiliza:** authView, eventFormView, accountView, errorService, script.js.

**Estado interno:**
- `_buffer` — array circular de eventos.
- `_devMode` — controla exibição no console.

**Principais funções exportadas:**
- `initTelemetry(devMode)`.
- `track(event, data)` — registra um evento.
- `EVENTS` — objeto com os nomes dos eventos disponíveis (SIGNUP, LOGIN, LOGOUT, APPOINTMENT_CREATED, etc.).
- `getEventLog()` — retorna cópia do buffer.

---

### toastService.js

**Objetivo:** exibir notificações temporárias (toasts) na interface.

**Responsabilidade:** cria elementos de toast no container `#toast-container`, os anima com CSS e os remove após o tempo configurado (padrão: 4500ms). Limita o máximo de toasts simultâneos a 5.

**Quem utiliza:** praticamente todos os módulos de UI e services de suporte.

**Principais exportações:**
- `showToast(message, type, duration)` — função base.
- `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)` — atalhos.

---

### confirmDialog.js

**Objetivo:** diálogo de confirmação modal reutilizável.

**Responsabilidade:** cria dinamicamente um único modal de confirmação no DOM (lazy init) e o reutiliza. Retorna uma Promise que resolve `true` (confirmou) ou `false` (cancelou/Escape/clique fora). Restaura o foco ao elemento anterior ao fechar.

**Quem utiliza:** script.js (handleDelete), eventFormView, categoryView, accountView, academicCalendarView, academicCalendarEventsView, academicCalendarICSView.

**Principais funções exportadas:**
- `confirmDialog({ title, message, confirmText, cancelText, danger })` — retorna `Promise<boolean>`.

---

### recurrence.js

**Objetivo:** ponto de re-exportação da lógica de recorrência.

**Responsabilidade:** re-exporta `expandEvents` e `expandEvent` do módulo canônico em `supabase/functions/_shared/recurrence-core.js`. Essa estratégia garante que frontend e Edge Function `send-push-notifications` sempre usem exatamente a mesma implementação de expansão de recorrência, sem duplicação de código.

**Quem utiliza:** calendar.js, weekView.js, notificationService.js, smartAssistant.js, analytics.js, services/ai/prompts/*.

**Principais funções exportadas:**
- `expandEvents(baseEvents, rangeStart, rangeEnd)` — expande uma lista de eventos base em ocorrências dentro do range.
- `expandEvent(baseEvent, rangeStart, rangeEnd)` — expande um único evento.

---

### utils.js

**Objetivo:** funções utilitárias puras compartilhadas entre módulos.

**Responsabilidade:** funções sem efeitos colaterais e sem imports. Disponibiliza formatação de datas, escaping de HTML e cálculo de segunda-feira da semana.

**Quem utiliza:** praticamente todos os módulos.

**Principais funções exportadas:**
- `pad(n)` — zero-padding para 2 dígitos.
- `isoDate(d)` — Date → string YYYY-MM-DD.
- `localDate(str)` — string YYYY-MM-DD → Date (meia-noite local, sem offset UTC).
- `isoToday()` — data de hoje como string ISO.
- `mondayOf(date)` — retorna a segunda-feira da semana de uma data.
- `escapeHtml(str)` — escapa `&`, `<`, `>`, `"` para uso seguro em innerHTML.
- `truncate(str, maxLength)` — trunca string com reticências.

---

### profileService.js

**Objetivo:** CRUD de perfil do usuário.

**Responsabilidade:** leitura e atualização da tabela `profiles` no Supabase. `upsertProfile` implementa uma allowlist de campos para evitar gravação de campos não autorizados.

**Quem utiliza:** accountView.js.

**Principais funções exportadas:**
- `getProfile()` — carrega o perfil do usuário autenticado.
- `upsertProfile(fields)` — cria ou atualiza o perfil com os campos permitidos.

---

### avatarService.js

**Objetivo:** upload e remoção de foto de perfil no Supabase Storage.

**Responsabilidade:** valida tipo MIME (JPEG, PNG, WebP, GIF) e tamanho (máx. 2 MB) antes do upload. Armazena no bucket `avatars` usando o padrão `{userId}/avatar.{ext}`. Adiciona cache-buster na URL pública.

**Quem utiliza:** accountView.js.

**Principais funções exportadas:**
- `uploadAvatar(file)` — faz upload e retorna a URL pública com cache-buster.
- `removeAvatar()` — lista e remove todos os arquivos de avatar do usuário.

---

### pwa.js

**Objetivo:** integração PWA (Service Worker, install prompt, offline detection).

**Responsabilidade:** registra o Service Worker. Gerencia o prompt de instalação nativo do navegador (`beforeinstallprompt`). Detecta mudanças de conectividade e exibe/esconde a barra offline.

**Quem utiliza:** `script.js` (importado junto com os demais módulos e chamado ao final do bootstrap).

**Principais funções exportadas:**
- `registerServiceWorker()` — registra o SW.
- `initInstallButton()` — conecta o botão de instalação PWA.
- `initOfflineDetection()` — monitora `online`/`offline`.

---

### icsExporter.js / icsImporter.js

**Objetivo:** serialização e desserialização do formato ICS (iCalendar).

**icsExporter.js** gera o conteúdo ICS a partir de eventos acadêmicos e faz o download via `<a download>` virtual.

**icsImporter.js** parseia arquivos ICS, converte VEVENTs para o formato interno da aplicação e deduplica contra eventos já existentes (comparando título, data de início e data de fim).

**Quem utiliza:** academicCalendarICSView.js.

---

## Serviços

### eventService.js

**Objetivo:** acesso aos dados de eventos pessoais do usuário.

**Responsabilidade:** CRUD completo na tabela `events`. Todas as operações filtram por `user_id` (obtido via `currentUserId()`), garantindo que usuários só acessem seus próprios dados. `getEventsByRange` realiza duas queries paralelas para cobrir tanto eventos base dentro do range quanto bases de eventos recorrentes que têm ocorrências dentro do range.

**Dependências:** supabase.js.

**Operações disponíveis:**
- `createEvent(fields)` — insere e retorna o novo evento.
- `getEvents()` — retorna todos os eventos do usuário ordenados por data e hora.
- `updateEvent(id, fields)` — atualiza e retorna o evento.
- `deleteEvent(id)` — exclui o evento.
- `getEventsByRange(start, end)` — busca eventos (incluindo bases de recorrentes) que se sobrepõem ao range de datas.

---

### categoryService.js

**Objetivo:** acesso aos dados de categorias do usuário.

**Responsabilidade:** CRUD na tabela `categories`. Ao excluir, verifica se há eventos usando a categoria antes de permitir a exclusão. `ensureDefaultCategories` cria 8 categorias padrão (Aula, Plantão, Ambulatório, Laboratório, Estudo, Prova, Congresso, Pessoal) na primeira vez que o usuário acessa.

**Dependências:** supabase.js.

**Operações disponíveis:**
- `getCategories()` — lista categorias ordenadas por nome.
- `createCategory(name, color)` — cria categoria; lança erro amigável em caso de duplicata.
- `updateCategory(id, name, color)` — atualiza categoria.
- `deleteCategory(id)` — exclui categoria após verificar uso em eventos.
- `ensureDefaultCategories()` — garante a existência das categorias padrão.

---

### academicCalendarService.js

**Objetivo:** acesso aos dados de calendários e eventos acadêmicos.

**Responsabilidade:** CRUD em `academic_calendars` e `academic_events`. `getAcademicEventsByRange` busca eventos que se sobrepõem ao range. `expandAcademicEvents` converte eventos multi-dia em uma ocorrência por dia, enriquecida com metadados do calendário (nome, cor) para diferenciação visual. `bulkInsertAcademicEvents` é usado na importação ICS.

**Dependências:** supabase.js.

**Operações disponíveis:**
- `getCalendars()` — lista calendários do usuário.
- `createCalendar / updateCalendar / deleteCalendar`.
- `getAcademicEvents(calendarId)` — lista todos os eventos de um calendário.
- `getAcademicEventsByRange(calendarIds, start, end)` — busca eventos de múltiplos calendários no range.
- `createAcademicEvent / updateAcademicEvent / deleteAcademicEvent`.
- `bulkInsertAcademicEvents(events)` — insere múltiplos eventos de uma vez (importação ICS).
- `expandAcademicEvents(events, start, end)` — expansão client-side de eventos multi-dia.

---

### profileService.js

Ver seção de módulos acima.

---

### avatarService.js

Ver seção de módulos acima.

---

### diagnosticService.js

Ver seção de módulos acima.

---

### analyticsService (analytics.js)

Ver seção de módulos acima.

---

### telemetryService.js

Ver seção de módulos acima.

---

## Arquitetura da IA

O subsistema de IA é completamente isolado do restante da aplicação. A regra fundamental é que **a chave da API Gemini nunca chega ao navegador**.

### Fluxo completo

```
aiPanelView.js
   │  Usuário clica em uma das 3 ações
   │  Busca eventos via getEvents()
   ▼
services/ai/aiService.js  (gateway — único ponto de contato com a IA)
   │  Seleciona o provider via AI_CONFIG.provider
   │  Prepara o payload via módulo de prompt adequado
   ▼
services/ai/prompts/[weeklySummary|studySuggestion|scheduleAnalysis].js
   │  Expande eventos recorrentes para o período relevante
   │  Serializa apenas campos necessários (title, date, start_time, duration, category, location)
   │  Retorna { type, events, ...metadata }
   ▼
services/ai/providers/geminiProvider.js
   │  Obtém o access_token da sessão Supabase
   │  Faz POST para {supabaseUrl}/functions/v1/ai-chat
   │  Inclui Authorization: Bearer {access_token}
   │  Aplica timeout de 30s via AbortController
   ▼
Edge Function ai-chat  (Supabase)
   │  Valida o JWT do usuário
   │  Chama a API do Google Gemini com a chave armazenada como variável de ambiente
   │  Retorna { text: string }
   ▼
services/ai/parsers/responseParser.js
   │  Remove headings Markdown, normaliza bullets, faz trim
   ▼
aiPanelView.js
   │  Exibe o texto no painel
```

### config/ai.js

Define os parâmetros do modelo sem segredos:
- `provider: 'gemini'`
- `model: 'gemini-2.5-flash'`
- `temperature: 0.7`
- `maxTokens: 1024`
- `timeout: 30000` (ms)

### Providers

O mapa `PROVIDERS` em `aiService.js` associa identificadores de string a funções. Adicionar um novo provider requer apenas implementar a função e registrá-la no mapa — sem alterações nos módulos de UI ou prompts.

### Prompts

Cada módulo de prompt é responsável por:
1. Calcular o período de análise relevante.
2. Expandir eventos recorrentes para esse período via `expandEvents`.
3. Serializar apenas os campos necessários (nunca IDs, descrições completas ou campos sensíveis).
4. Retornar um objeto `{ type, events, ...metadata }` que a Edge Function interpreta.

### Tratamento de erros

`geminiProvider.js` mapeia erros HTTP e de rede para instâncias de `AIError` com código semântico (`AUTH`, `TIMEOUT`, `NETWORK`, `RATE_LIMIT`, `UNAVAILABLE`, `API_ERROR`, `EMPTY_RESPONSE`). `aiPanelView.js` captura esses erros e exibe a mensagem no próprio painel, sem toasts — o usuário vê a mensagem no contexto da ação.

---

## Fluxos do Frontend

### Login

```
authView.js: usuário clica "Entrar"
→ auth.js: signIn(email, password)
→ Supabase Auth: autenticação
→ onAuthStateChange dispara com event=SIGNED_IN
→ authView.js: showApp(session)
→ script.js: _initApp(session)
→ carregamento completo da aplicação
```

### Cadastro

```
authView.js: usuário preenche formulário e clica "Criar Conta"
→ auth.js: signUp(email, password, fullName)
→ Supabase Auth: cria usuário e envia e-mail de confirmação
→ authView.js: showAuthView('email-sent')
→ usuário confirma e-mail → pode fazer login
```

### Logout

```
authView.js: usuário clica "Sair"
→ auth.js: signOut()
→ onAuthStateChange dispara com session=null
→ authView.js: showAuthView('login')
   → closeAllModals()
   → destroyWeekView() (cancela o timer da linha do agora e limpa a grade,
     a dica de IA e o plano da semana renderizados)
   → resetAssistant(), resetCalendar(), demais resets (via _onBeforeSignOut)
   → _initializedUserId = null
```

### Criar compromisso

```
Opção A — Botão "+ Novo compromisso":
  eventFormView.js: openEventForm()
  → modal vazio, usuário preenche e submete
  → eventService.js: createEvent(fields)
  → script.js: refreshAll() → loadEvents() + refreshWeekView() + refreshCalendar()

Opção B — Clique em dia no calendário mensal:
  calendar.js: onDayClick(date)
  → quickAdd.js: openQuickAdd(date, refreshAll)
  → eventService.js: createEvent({ title, event_date, start_time })
  → refreshAll()

Opção C — Clique em slot na agenda semanal:
  weekView.js: onSlotClick(date, time)
  → quickAdd.js: openQuickAdd(date, refreshAll, time)
  → (mesmo fluxo do Opção B)
```

### Editar compromisso

```
Clique em "Editar" na lista OU clique em evento no calendário/agenda:
  eventFormView.js: handleEventClick(ev)
  → se recorrente: confirmDialog() → se cancelado, para
  → openEventForm(ev) → _populateForm(ev)
  → usuário edita e submete
  → eventService.js: updateEvent(id, fields)
  → refreshAll()
```

### Excluir compromisso

```
script.js: handleDelete(id, card)
→ confirmDialog({ danger: true })
→ eventService.js: deleteEvent(id)
→ telemetryService: track(APPOINTMENT_DELETED)
→ toastService: success
→ refreshAll()
```

### Categorias

```
navigationView sidebar → btn-categories
→ categoryView.js: openCategoryModal()
→ getCategories() → renderiza lista
→ Criar: createCategory(name, color) → _reloadCategories()
→ Editar: _enterEditMode() → updateCategory() → _reloadCategories()
→ Excluir: confirmDialog() → deleteCategory() → _reloadCategories()
```

### Calendário Acadêmico

```
navigationView → btn-academic-cals
→ academicCalendarView.js: openAcademicCalendarModal()
→ getCalendars() → showCalendarList()
→ Criar: createCalendar() → _onChange() → renderFilterBar() + refreshAll()
→ Eventos: showEventList(calId) → getAcademicEvents()
→ Importar ICS: triggerICSImport() → parseICS() → deduplicateEvents() → bulkInsertAcademicEvents()
→ Exportar ICS: getAcademicEvents() → exportToICS() → downloadICS()
```

### Perfil e Avatar

```
header → btn-my-account
→ accountView.js: open()
→ getProfile() → _renderProfile()
→ Salvar perfil: upsertProfile(fields)
→ Upload avatar: uploadAvatar(file) → upsertProfile({ avatar_url })
→ Remover avatar: confirmDialog() → removeAvatar() → upsertProfile({ avatar_url: null })
→ Alterar senha: updatePassword(newPwd)
→ Excluir conta: confirmDialog() → supabase.functions.invoke('delete-account') → signOut()
```

### Assistente IA

```
sidebar → nav-ai-assistant (ou bottom nav → bottom-nav-ai)
→ aiPanelView.js: openPanel()
→ usuário clica em uma ação
→ eventService.js: getEvents() (se eventos pessoais visíveis)
→ aiService.js: [getWeeklySummary|getStudySuggestion|getScheduleAnalysis](events)
→ prompts/*.js: prepara payload
→ geminiProvider.js: POST /functions/v1/ai-chat
→ responseParser.js: normaliza texto
→ aiPanelView.js: showResult(title, text)
```

### Notificações

```
script.js: renderSettingsState() → btn-notif-toggle
→ requestPermission() → setEnabled(true)
→ getEvents() → scheduleReminders(events)
→ notificationService.js: expandEvent() por evento → setTimeout()
→ na hora: new Notification(title, { body, tag })
```

---

## Comunicação entre Módulos

### Diagrama de dependências principais

```
script.js
├── eventService.js ──────────────► supabase.js
├── calendar.js ──────────────────► eventService.js, recurrence.js, utils.js
├── weekView.js ──────────────────► eventService.js, recurrence.js, utils.js
├── authView.js ──────────────────► auth.js, weekView.js, toastService.js
├── eventFormView.js ─────────────► eventService.js, confirmDialog.js
├── categoryView.js ──────────────► categoryService.js ──────► supabase.js
├── academicCalendarView.js ──────► academicCalendarService.js ► supabase.js
│                                 ► academicCalendarFilter.js
│                                 ► academicCalendarEventsView.js
│                                 ► academicCalendarICSView.js
├── assistantView.js ─────────────► smartAssistant.js, analytics.js
├── aiPanelView.js ───────────────► services/ai/aiService.js
│                                      └──► geminiProvider.js ──► supabase.js (auth)
│                                           └──► Edge Function ai-chat
├── accountView.js ───────────────► profileService.js, avatarService.js, auth.js
├── notificationService.js ───────► recurrence.js, utils.js
├── pushService.js ───────────────► supabase.js
├── errorService.js ──────────────► toastService.js, telemetryService.js
└── diagnosticService.js ─────────► supabase.js
```

### Fluxo de dados após qualquer mutação

```
eventFormView / quickAdd / script.js (handleDelete)
   └──► eventService (createEvent / updateEvent / deleteEvent)
            └──► refreshAll() [injetado como callback]
                     ├──► loadEvents() → allEvents → renderFilteredList() + renderAssistant()
                     ├──► refreshWeekView()
                     └──► refreshCalendar()
```

### Como calendar e weekView recebem eventos acadêmicos

```
script.js:
  academicProvider = getAcademicEventProvider()
  setCalendarAcademicProvider(academicProvider)
  setWeekViewAcademicProvider(academicProvider)

calendar.js / weekView.js:
  fetchAndRender():
    [getEventsByRange(), _academicProvider(start, end)]  ← Promise.all
    expandEvents(rawEvents)
    renderGrid([...personal, ...academic])
```

---

## Estado da Aplicação

Não existe store centralizado (Redux, Zustand, etc.). O estado é distribuído em variáveis de módulo JavaScript.

### Estado global compartilhado

| Variável | Localização | Produzido por | Consumido por |
|---|---|---|---|
| `allEvents` | script.js | `loadEvents()` | `renderFilteredList()`, `renderAssistant()` |

### Estado por módulo

| Módulo | Estado |
|---|---|
| authView.js | `_initializedUserId`, `_loginScreen`, `_appScreen` |
| categoryView.js | `categoriesCache` — cache de categorias em memória |
| academicCalendarView.js | `_calendarsCache`, `_activeCalendar`, `_onChange` |
| assistantView.js | `_assistantHidden`, `_lastEvents` |
| notificationService.js | `_userId`, `_scheduled` (Map de timeouts agendados) |
| pushService.js | `_userId`, `_vapidPubKey` |
| errorService.js | `_logs` (buffer circular de 100 entradas) |
| telemetryService.js | `_buffer` (buffer circular de 200 eventos) |
| weekView.js | `_el`, `_mon`, `_nowTimer` |
| calendar.js | `container`, `calYear`, `calMonth` |
| eventFormView.js | `editingId`, referências ao DOM do formulário |
| navigationView.js | `appSidebar`, `sidebarOverlay` |

### Estado persistido no localStorage

| Chave | Conteúdo |
|---|---|
| `medagenda_devmode` | `'1'` se modo desenvolvedor ativo |
| `medagenda_notif_{userId}` | `'enabled'` ou `'disabled'` |
| `medagenda_push_{userId}` | `'enabled'` ou `'disabled'` |
| `medagenda_last_page` | última página ativa (`'agenda'`, `'calendar'`, `'appointments'`) |
| `medagenda_sidebar_collapsed` | `'1'` se sidebar colapsada em desktop |
| `medagenda_last_sync` | timestamp da última sincronização (string pt-BR) |
| `medagenda_filter_personal` | `'1'` ou `'0'` — visibilidade de eventos pessoais |
| `medagenda_filter_academic` | JSON — mapa `{ [calendarId]: boolean }` |

### Caches em memória

- **categoriesCache** (categoryView.js) — sincronizado com o banco; alimenta o `<select>` de categoria.
- **_calendarsCache** (academicCalendarView.js) — sincronizado ao abrir o modal e após mutações.
- **_scheduled** (notificationService.js) — Map de timeouts para cancelamento ao reagendar.
- **_logs** (errorService.js) / **_buffer** (telemetryService.js) — buffers circulares em memória.

---

## Eventos

### DOM Events

A aplicação usa exclusivamente `addEventListener` padrão. Não há sistema de eventos customizado (EventEmitter, pubsub). A comunicação entre módulos é feita via callbacks injetados na inicialização.

### Eventos globais monitorados

| Evento | Módulo | Propósito |
|---|---|---|
| `keydown` (Escape) | script.js, authView.js, confirmDialog.js, quickAdd.js, aiPanelView.js, eventFormView.js, categoryView.js, accountView.js, academicCalendarView.js | Fechar modais e painéis |
| `click` (overlay) | todos os modais | Fechar modal ao clicar fora |
| `online` / `offline` | pwa.js | Exibir/ocultar barra offline |
| `resize` (implícito) | navigationView.js | Comportamento diferenciado desktop/mobile ao clicar no toggle da sidebar |
| `visibilitychange` | — | Não monitorado diretamente |
| `storage` | — | Não monitorado |
| `message` (ServiceWorker) | script.js | Receber `OPEN_EVENT` (clique em push notification abre o formulário do evento) |
| `beforeinstallprompt` | pwa.js | Capturar e adiar o prompt de instalação PWA |
| `appinstalled` | pwa.js | Ocultar o botão de instalação após instalação |
| `error` / `unhandledrejection` | errorService.js | Capturar erros globais não tratados |
| `authStateChange` | authView.js (via supabase) | Reagir a login, logout, password recovery |

### Timers

| Timer | Módulo | Propósito |
|---|---|---|
| `setInterval` (60s) | weekView.js | Atualizar linha do agora |
| `setTimeout` por evento | notificationService.js | Disparar notificação local na hora do lembrete |
| `setTimeout` (10s) | authView.js | Safety timer: redirecionar para login se Supabase não responder |
| `requestAnimationFrame` | weekView.js | Auto-scroll para o horário atual após render |

---

## Tratamento de Erros

### errorService.js (handler global)

Instala handlers em `window.error` e `window.unhandledrejection`. Classifica o erro em uma das categorias: `auth`, `network`, `database`, `ai`, `push`, `service_worker`, `unknown`. Gera mensagem amigável em português. Loga no buffer interno. Registra no telemetry. Exibe toast ao usuário quando apropriado (exceto erros silenciosos e erros de auth, que são tratados pelo redirecionamento para login). Desde a Auditoria A2.6, `handleError()` também é chamado explicitamente pela maioria das views (autenticação, CRUD de compromissos/categorias/calendários acadêmicos/conta, painel de IA, Service Worker) — não só pelos handlers globais.

### Erros de auth

Quando a sessão expira, o Supabase dispara `onAuthStateChange` com `session=null`, redirecionando o usuário para o login. Erros individuais de CRUD que retornam código de auth são classificados como `auth` pelo errorService mas não exibem toast — a re-autenticação é tratada automaticamente.

### Erros de IA

Tratados localmente em `aiPanelView.js` e `geminiProvider.js`. Erros específicos da IA são instâncias de `AIError` com código semântico. A mensagem é exibida no próprio painel de resultado, não como toast.

### Erros em Services

Todos os Services lançam o erro bruto do Supabase ou um `new Error` com mensagem em português. Os módulos de UI fazem try/catch e exibem a mensagem via `toast.error()` ou em elementos `<p class="error">` no DOM.

### Logs e diagnóstico

`errorService.getErrorLog()` e `telemetryService.getEventLog()` permitem inspecionar o histórico durante uma sessão. Em modo desenvolvedor, os logs são detalhados no console com `console.group`.

---

## Segurança Frontend

### escapeHtml()

Definida em `utils.js`, é chamada em **todo lugar** onde conteúdo de usuário é inserido via `innerHTML`. Escapa `&`, `<`, `>` e `"`. É usada em: renderização de cards de evento, chips de calendário, modais de categoria, eventos acadêmicos, toasts com nomes de usuário.

### Sanitização de inputs

- Inputs `maxlength` são definidos no HTML para limitar tamanho no lado do cliente.
- Campos de texto passam por `.trim()` antes de enviar ao Supabase.
- `upsertProfile` implementa uma allowlist de campos para evitar gravação de campos não autorizados.

### Autenticação

- O cliente Supabase JS gerencia tokens automaticamente (refresh transparente via `onAuthStateChange`).
- `currentUserId()` verifica a sessão ativa antes de cada operação de banco de dados.
- Todas as queries ao Supabase incluem `.eq("user_id", user_id)` — RLS no banco é a camada principal de segurança, sendo o filtro no cliente uma segunda linha de defesa.

### Proteção da chave de API

- A chave da API Gemini nunca chega ao navegador. Toda comunicação com a IA passa pela Edge Function, que recebe apenas o JWT do usuário.
- A VAPID private key para push notifications fica exclusivamente no Supabase.

### Credenciais no frontend

- `SUPABASE_URL` e `SUPABASE_ANON_KEY` são credenciais públicas (a anon key é projetada para ser exposta — a segurança é garantida pelo RLS).
- `config.js` (com as credenciais reais) não é versionado.

---

## Performance

### Paralelismo de queries

`_initApp` usa `Promise.all` para carregar `initWeekView`, `initCalendar` e `loadEvents` simultaneamente. `refreshAll` usa `Promise.all` para `loadEvents`, `refreshWeekView` e `refreshCalendar`. `fetchAndRender` em calendar e weekView busca eventos pessoais e acadêmicos em paralelo.

### Cache em memória

- `categoriesCache` — evita rebuscar categorias do banco a cada abertura do formulário.
- `_calendarsCache` — evita rebuscar calendários acadêmicos a cada operação.
- `_lastEvents` (assistantView) — permite rerenderizar o assistente sem nova query ao banco.

### Sincronização com indicador visual

O elemento `#sync-indicator` é exibido durante `refreshAll()` para feedback ao usuário.

### Shell do calendário e weekView

A estrutura HTML dos componentes (cabeçalho, grade de horas, colunas de dias) é construída uma única vez por `buildShell()`. As atualizações de dados apenas limpam e repopulam as células/eventos, sem reconstruir toda a estrutura.

### Lazy initialization de modais

`confirmDialog.js` e `quickAdd.js` criam seus elementos DOM apenas na primeira chamada, não no carregamento da página.

### Renderização condicional

`loadEvents()` respeita `isPersonalVisible()` — se eventos pessoais estão ocultos, nenhuma query ao banco é feita. O mesmo se aplica ao weekView, calendar e aiPanelView.

### Service Worker e cache offline

O `service-worker.js` implementa cache de assets estáticos, permitindo que a aplicação carregue mesmo sem conexão.

---

## Convenções do Projeto

### ES Modules

Todos os arquivos JavaScript usam `import`/`export` nativos. Não há CommonJS, AMD ou UMD. O navegador é o runtime de módulos.

### async/await

Toda lógica assíncrona usa `async/await`. Promises encadeadas com `.then()` não são usadas. Erros assíncronos são capturados com `try/catch`.

### Nomenclatura

- Arquivos: `camelCase.js` (ex: `eventService.js`, `weekView.js`, `academicCalendarView.js`).
- Funções e variáveis: `camelCase`.
- Constantes de módulo: `UPPER_SNAKE_CASE` (ex: `EVENTS`, `APP_VERSION`, `AI_CONFIG`).
- Funções internas (não exportadas): prefixo `_` opcional (ex: `_initApp`, `_renderProfile`).
- IDs no DOM: `kebab-case` (ex: `btn-new-event`, `event-modal`, `filter-category-apt`).

### Organização de módulos

- Módulos de dados: `*Service.js` (eventService, categoryService, etc.).
- Módulos de UI: `*View.js` (eventFormView, weekView, academicCalendarView, etc.).
- Módulos de domínio puro: sem sufixo (smartAssistant, analytics, recurrence, utils).
- Módulos de infraestrutura: errorService, telemetryService, toastService, diagnosticService.

### Exports

- Módulos de View exportam suas funções de inicialização (`initX`) e funções públicas que outros módulos precisam chamar diretamente.
- Services exportam exclusivamente as operações de dados (funções assíncronas que retornam dados ou lançam erros).
- Módulos de domínio puro exportam apenas as funções de computação.
- Não há `export default`.

### Inicialização

O padrão de inicialização é `initX()` para configurar listeners e `openX()` para exibir UIs. Módulos não executam código com efeitos colaterais no nível de módulo — apenas declaram funções e variáveis. A execução começa com as chamadas em `script.js`.

---

## Dependências entre Arquivos

### Matriz de dependências (A → importa → B)

```
index.html ──────────────────────────────► script.js
                                          ► pwa.js

script.js ───────────────────────────────► eventService.js
                                          ► calendar.js
                                          ► weekView.js
                                          ► quickAdd.js
                                          ► notificationService.js
                                          ► pushService.js
                                          ► config.js (VAPID_PUBLIC_KEY)
                                          ► utils.js
                                          ► toastService.js
                                          ► telemetryService.js
                                          ► errorService.js
                                          ► diagnosticService.js
                                          ► accountView.js
                                          ► academicCalendarView.js
                                          ► assistantView.js
                                          ► aiPanelView.js
                                          ► confirmDialog.js
                                          ► navigationView.js
                                          ► categoryView.js
                                          ► eventFormView.js
                                          ► authView.js

authView.js ─────────────────────────────► auth.js
                                          ► telemetryService.js
                                          ► toastService.js
                                          ► weekView.js

auth.js ─────────────────────────────────► supabase.js
                                          ► config.js (APP_URL)

supabase.js ─────────────────────────────► config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
                                          ► CDN @supabase/supabase-js

eventService.js ─────────────────────────► supabase.js

categoryService.js ──────────────────────► supabase.js

profileService.js ───────────────────────► supabase.js

avatarService.js ────────────────────────► supabase.js

academicCalendarService.js ──────────────► supabase.js

calendar.js ─────────────────────────────► eventService.js
                                          ► recurrence.js
                                          ► utils.js

weekView.js ─────────────────────────────► eventService.js
                                          ► recurrence.js
                                          ► utils.js

recurrence.js ───────────────────────────► supabase/functions/_shared/recurrence-core.js

notificationService.js ──────────────────► recurrence.js
                                          ► utils.js

eventFormView.js ────────────────────────► eventService.js
                                          ► confirmDialog.js
                                          ► telemetryService.js
                                          ► toastService.js

categoryView.js ─────────────────────────► categoryService.js
                                          ► utils.js
                                          ► confirmDialog.js

accountView.js ──────────────────────────► supabase.js
                                          ► auth.js
                                          ► profileService.js
                                          ► avatarService.js
                                          ► toastService.js
                                          ► telemetryService.js
                                          ► utils.js
                                          ► confirmDialog.js

academicCalendarView.js ─────────────────► academicCalendarService.js
                                          ► toastService.js
                                          ► utils.js
                                          ► confirmDialog.js
                                          ► academicCalendarFilter.js
                                          ► academicCalendarEventsView.js
                                          ► academicCalendarICSView.js

academicCalendarEventsView.js ───────────► academicCalendarService.js
                                          ► toastService.js
                                          ► utils.js
                                          ► confirmDialog.js

academicCalendarICSView.js ──────────────► academicCalendarService.js
                                          ► icsImporter.js
                                          ► icsExporter.js
                                          ► toastService.js
                                          ► confirmDialog.js

assistantView.js ────────────────────────► smartAssistant.js
                                          ► analytics.js
                                          ► utils.js

smartAssistant.js ───────────────────────► recurrence.js
                                          ► utils.js

analytics.js ────────────────────────────► recurrence.js
                                          ► utils.js

aiPanelView.js ──────────────────────────► eventService.js
                                          ► academicCalendarView.js (isPersonalVisible)
                                          ► services/ai/aiService.js

services/ai/aiService.js ────────────────► config/ai.js
                                          ► services/ai/providers/geminiProvider.js
                                          ► services/ai/prompts/weeklySummary.js
                                          ► services/ai/prompts/studySuggestion.js
                                          ► services/ai/prompts/scheduleAnalysis.js
                                          ► services/ai/parsers/responseParser.js

services/ai/providers/geminiProvider.js ─► supabase.js
                                          ► config/ai.js

services/ai/prompts/*.js ────────────────► utils.js
                                          ► recurrence.js

errorService.js ─────────────────────────► toastService.js
                                          ► telemetryService.js

diagnosticService.js ────────────────────► supabase.js

pushService.js ──────────────────────────► supabase.js

pwa.js ──────────────────────────────────► (sem imports — usa apenas DOM e navigator)

quickAdd.js ─────────────────────────────► eventService.js

academicCalendarFilter.js ───────────────► utils.js
```

### Módulos mais importados (hubs da arquitetura)

```
supabase.js        — importado por 9 módulos (todos os Services e módulos de dados)
utils.js           — importado por ~12 módulos
recurrence.js      — importado por 6 módulos
toastService.js    — importado por ~10 módulos
eventService.js    — importado por 4 módulos
telemetryService.js — importado por 4 módulos
confirmDialog.js   — importado por 6 módulos
```

---

## Auditoria Arquitetural

### Módulos muito grandes?

**script.js** (24KB, ~615 linhas) é o módulo mais extenso e concentra responsabilidades que deveriam ser extraídas. O próprio arquivo documenta isso com comentários `[DOMAIN: X]`. Os domínios ainda não extraídos são: configurações de notificações, lista de compromissos com filtros, modal de diagnóstico, modo desenvolvedor. Os demais domínios já foram extraídos para módulos próprios.

**academicCalendarView.js** (~11.5KB) é razoavelmente grande, mas a complexidade é inerente ao domínio de calendários acadêmicos com múltiplas sub-views.

**weekView.js** (~12KB) e **smartAssistant.js** (~11KB) são extensos mas coesos — cada um cobre um único domínio bem definido.

### Responsabilidades duplicadas?

Há uma leve sobreposição entre o **Assistente Inteligente local** (`smartAssistant.js` + `assistantView.js`) e o **Assistente IA** (`aiPanelView.js` + `services/ai/`): ambos analisam a agenda do usuário. A distinção é clara: o assistente local usa regras determinísticas e é síncrono; o painel IA usa um LLM via Edge Function. Não há sobreposição real de código.

`escapeHtml` é definida uma única vez em `utils.js` e importada de lá — sem duplicação.

### Dependências circulares?

Não foram identificadas dependências circulares. O grafo de dependências tem uma direção clara:
- `script.js` → Views → Services → `supabase.js`
- `script.js` → Views de domínio puro → módulos de cálculo
- `aiPanelView.js` → `academicCalendarView.js` (apenas `isPersonalVisible`) é uma importação pontual que não cria ciclo.

### Módulos altamente acoplados?

**script.js** é o módulo de maior acoplamento por design — é o bootstrap e orquestrador. Importa 20+ módulos mas é importado por nenhum.

**`supabase.js`** é importado por 9 módulos, o que é esperado e desejável — centraliza o cliente de banco de dados.

**`toastService.js`** e **`confirmDialog.js`** são amplamente usados mas se comportam como bibliotecas utilitárias, não como módulos de domínio — esse nível de acoplamento é aceitável.

### Módulos reutilizáveis?

Os seguintes módulos são claramente reutilizáveis em outros contextos:
- `utils.js` — funções puras sem dependências.
- `toastService.js` — UI de notificações sem lógica de negócio.
- `confirmDialog.js` — diálogo genérico de confirmação.
- `errorService.js` — classificação e tratamento de erros aplicável a qualquer projeto Supabase.
- `telemetryService.js` — buffer de eventos sem acoplamento a provider externo.
- `recurrence.js` / `recurrence-core.js` — lógica de recorrência genérica, já compartilhada com backend.

---

## Estado Atual

### Quantificação dos módulos

| Categoria | Quantidade | Arquivos |
|---|---|---|
| **Módulos de UI (Views)** | 11 | script.js, authView.js, navigationView.js, eventFormView.js, quickAdd.js, categoryView.js, accountView.js, assistantView.js, aiPanelView.js, academicCalendarView.js, academicCalendarEventsView.js |
| **Módulos de sub-UI** | 2 | academicCalendarFilter.js, academicCalendarICSView.js |
| **Services (dados)** | 7 | eventService.js, categoryService.js, academicCalendarService.js, profileService.js, avatarService.js, notificationService.js, pushService.js |
| **Services (IA)** | 5 | aiService.js, geminiProvider.js, weeklySummary.js, studySuggestion.js, scheduleAnalysis.js + responseParser.js |
| **Módulos de domínio puro** | 4 | smartAssistant.js, analytics.js, recurrence.js, utils.js |
| **Infraestrutura** | 5 | errorService.js, telemetryService.js, diagnosticService.js, toastService.js, confirmDialog.js |
| **Infraestrutura PWA** | 2 | pwa.js, service-worker.js |
| **Integração/utilitários** | 4 | auth.js, supabase.js, icsImporter.js, icsExporter.js |
| **Testes** | 5 | recurrence.test.js, recurrence-notification.test.js, smartAssistant.test.js, analytics.test.js, utils.test.js |
| **Total JavaScript** | ~45 arquivos | |

### Arquitetura atual

**SPA com ES Modules nativos, sem framework, sem bundler, sem step de build.**

A arquitetura segue um padrão de camadas implícito: a camada de UI (Views) orquestra a interação com o usuário e delega persistência para a camada de dados (Services). Módulos puramente computacionais (domínio puro) ficam completamente desacoplados de UI e infraestrutura. O bootstrap centralizado em `script.js` gerencia o ciclo de vida da aplicação via callbacks injetados.

### Avaliação geral

O frontend apresenta boa organização para um projeto de JavaScript Vanilla sem framework. A separação entre Views, Services e módulos de domínio puro é clara e consistente. O uso de ES Modules nativos é adequado ao escopo do projeto. Os pontos de atenção são: `script.js` ainda concentra domínios que estão documentados para extração futura, e o estado da aplicação é distribuído em variáveis de módulo sem um mecanismo formal de gerenciamento — o que é funcional no escopo atual mas pode se tornar um ponto de complexidade se a aplicação crescer significativamente.
