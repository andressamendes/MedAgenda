# F9.1 — Auditoria Técnica Completa do Anoti

**Data:** 2026-07-09
**Escopo:** todo o repositório (frontend, serviços, banco, Edge Functions, testes, documentação)
**Regra da fase:** somente identificação e priorização — **nenhuma correção foi aplicada**.

---

## Sumário Executivo

- **Suite de testes: 1055/1055 verdes** (`npm ci && npm test`). Nenhuma regressão funcional detectada nos testes existentes.
- A arquitetura definida na F6 (Sessão como entidade raiz, serviços de domínio puros, barramento de eventos com publicador único, projeções nunca persistidas) está **majoritariamente respeitada**. As violações encontradas são pontuais.
- O trabalho de simetria init/reset das fases anteriores (A1.3) está quase completo, mas **quatro views ainda deixam dados do usuário anterior no DOM após logout** (Histórico, Dashboard, Insights, painel de IA, barra de filtros acadêmica).
- **Nenhum problema P0** (que quebre um fluxo principal hoje) foi encontrado.
- **3 problemas P1**, **6 problemas P2** e **10 problemas P3** catalogados abaixo.
- Três domínios inteiros (Study Streak, Subject Progress, Achievements) existem como serviços testados, porém **sem nenhum consumidor de UI** — o fluxo A7 "… → Subject Progress → Achievements → …" não é executável ponta a ponta no app.
- A documentação de banco (`DATA_MODEL.md`, `DATABASE.md`, `BANCO_DE_DADOS.md`) **parou nas migrations 07–10**; as migrations 11–18 (activity_sessions, metas, reviews, questions, vínculo revisão↔sessão, pausas, reflections) não estão documentadas. **Resolvido em PR6** — ver AUD-015 abaixo.

---

## Metodologia

1. Leitura integral dos módulos de ciclo de vida (script.js, authView, sessionEventBus, todas as views com init/reset) e dos serviços de domínio.
2. Varredura sistemática de listeners globais, timers, `setInterval`/`setTimeout`, assinaturas do barramento e seus cancelamentos.
3. Revisão das 18 migrations SQL (FKs, índices, constraints, RLS, CASCADE/SET NULL, schema_version).
4. Verificação de escape de HTML em todos os pontos de `innerHTML` com dado do usuário.
5. Execução da suíte completa de testes e do `check:app-shell`.
6. Varredura de código morto por contagem de importadores.
7. Comparação docs ↔ código (migrations, serviços, views, fluxos).

---

# Problemas Encontrados

Formato: **ID · Categoria · Prioridade**, com descrição, reprodução, causa raiz, impacto, risco, arquivos e estratégia de correção.

---

## P1 — Corrigir primeiro

### AUD-001 · Banco / Concorrência · **P1**
**Duas sessões "running" simultâneas quebram a tela de Sessão de Estudo.**

- **Descrição:** a regra "um usuário nunca tem duas sessões running" é garantida só no frontend por *check-then-insert* (`startSession()` consulta `getRunningSession()` e depois insere). Não há constraint no banco (índice único parcial) que impeça duas linhas `running` para o mesmo usuário.
- **Como reproduzir:** abrir o app em duas abas (ou dois dispositivos) e clicar "Iniciar sessão" nas duas quase ao mesmo tempo. As duas passam pela checagem antes do insert da outra.
- **Causa raiz:** ausência de `CREATE UNIQUE INDEX ... ON activity_sessions (user_id) WHERE status = 'running'` em `sql/11_activity_sessions.sql`; a validação é apenas otimista no cliente.
- **Impacto:** uma vez duplicada, `getRunningSession()` usa `.maybeSingle()`, que **lança erro quando há mais de uma linha** — a partir daí `startSession`, `pauseSession` e `resumeSession` falham para sempre até limpeza manual no banco. A tela de Sessão de Estudo fica inutilizável.
- **Risco:** médio de ocorrer, alto de dano quando ocorre (estado irrecuperável pela UI).
- **Arquivos:** `sql/11_activity_sessions.sql`, `activitySessionService.js` (89–136, 233–258).
- **Estratégia:** migration 19 com índice único parcial `(user_id) WHERE status = 'running'`; no service, tratar o erro de violação (23505) como `SESSION_ALREADY_RUNNING`; em `getRunningSession()`, trocar `.maybeSingle()` por `.limit(1)` defensivo (ou tratar o erro de multiplicidade) para que dados legados duplicados não travem a tela.

### AUD-002 · Performance · **P1**
**Diário de Estudos dispara ~5 consultas por sessão (≈50 por página).**

- **Descrição:** para cada sessão da página, `_fetchSessionExtras()` chama `listQuestions()`, `listBySession()` (revisões) e `getBySession()` (reflexão). As duas primeiras ainda fazem, cada uma, um `getActivitySessionById()` prévio (`_requireExistingSession`) — para sessões **que acabaram de vir de `listSessions()`**, ou seja, cuja existência já é conhecida.
- **Como reproduzir:** abrir o Diário com 10+ sessões e observar a aba Network: ~50 requisições para uma página de 10 itens; cada clique em "Carregar mais" repete o padrão; cada evento do barramento (fim de sessão) recarrega tudo do zero (`_loadPage(true)`), descartando as páginas já acumuladas.
- **Causa raiz:** consultas por item em vez de consultas em lote (`.in("session_id", ids)`), somadas a checagens de existência redundantes nas camadas de orquestração (`sessionQuestionsService`, `reviewSessionService`).
- **Impacto:** latência de carregamento do Diário cresce linearmente com o número de sessões; consumo desnecessário de cota do Supabase; contraste direto com o padrão em lote já adotado por `getEventExecutionSummaries()` (F1.7).
- **Risco:** degradação progressiva e certa conforme o histórico cresce.
- **Arquivos:** `studyJournalView.js` (250–262, 750–759), `sessionQuestionsService.js`, `reviewSessionService.js`, `questionService.js`, `studyReflectionService.js`.
- **Estratégia:** criar funções de listagem em lote (questions/reviews/reflections com `.in("session_id", ids)`, 3 consultas por página em vez de 5×N) e um caminho de leitura no Diário que não re-valide existência de sessões recém-listadas. Avaliar recarga incremental (só a primeira página) no evento do barramento.

### AUD-003 · Bug / Estado obsoleto · **P1**
**Histórico de Sessões mostra "Compromisso removido" para compromissos criados após o login.**

- **Descrição:** `initActivityHistoryView()` carrega `_eventsById`/`_categoriesById` **uma única vez por login** (`_loadLookups()`). As recargas disparadas pelo barramento (`_scheduleReload → _loadPage(true)`) **não** re-executam `_loadLookups()`.
- **Como reproduzir:** logar → criar um compromisso novo → iniciar e finalizar uma sessão vinculada a ele → abrir Histórico: a sessão aparece como "Compromisso removido" (e sem categoria) até um novo login/reload.
- **Causa raiz:** cache de lookups com ciclo de vida mais longo do que os dados que ele resolve; a recarga da lista não invalida o cache.
- **Impacto:** informação incorreta exibida ao usuário num fluxo comum (criar compromisso → estudar → conferir histórico), minando a confiança no Histórico.
- **Risco:** ocorre em uso normal, sem condição de corrida.
- **Arquivos:** `activityHistoryView.js` (75–98, 204–221).
- **Estratégia:** re-executar `_loadLookups()` dentro de `_scheduleReload`/`_loadPage(true)` (ou invalidar o cache ao receber eventos do barramento). Mesma revisão vale para o Diário (`_loadEventsLookup()` também roda uma vez, mas o Diário recarrega no `initStudyJournalView` — verificar o caminho do bus, que chama só `_loadPage(true)`, com o mesmo problema para o campo Matéria/Conteúdo).

---

## P2 — Corrigir em seguida

### AUD-004 · Segurança / Vazamento de estado (A10, A1.3) · **P2**
**Quatro resets não limpam o DOM: dados do usuário anterior sobrevivem ao logout.**

- **Descrição:** ao contrário de `resetStudyJournalView()`, `destroyWeekView()` e `resetCalendar()` (que limpam DOM + memória, conforme CHANGELOG F9), os resets abaixo só cancelam assinaturas/timers:
  - `resetActivityHistoryView()` — mantém a lista renderizada (`#ah-list`), `_eventsById`, `_categoriesById` e o filtro `_status` em memória;
  - `resetActivityDashboardView()` — mantém os cards com tempos/metas do usuário anterior;
  - `resetInsightsView()` — mantém os quatro blocos renderizados;
  - `resetAIPanel()` — o comentário afirma que "limpa o resultado exibido", mas `_resetPanel` não zera `resultBody`/`resultTitle` (a última análise de IA permanece no DOM oculto);
  - `resetAcademicCalendarView()` — não limpa a barra de filtros (`#filter-bar`) com os nomes dos calendários do usuário anterior.
- **Como reproduzir:** logar com usuário A, visitar Dashboard/Histórico/Insights, deslogar e inspecionar o DOM na tela de login: os dados de A continuam presentes (ocultos). Com usuário B, há uma janela assíncrona até o `init*` sobrescrever.
- **Causa raiz:** simetria init/reset aplicada de forma incompleta — o critério "nenhum estado, listener, timer ou cache sobrevive à troca de sessão" (script.js 477–481) foi aplicado a listeners mas não ao DOM/memória dessas views.
- **Impacto:** exposição de dados entre contas no mesmo navegador (inspeção do DOM, flash de conteúdo antigo em conexões lentas); inconsistência com a política declarada do projeto.
- **Risco:** baixo em uso pessoal, relevante em máquina compartilhada.
- **Arquivos:** `activityHistoryView.js` (229–236), `activityDashboardView.js` (240–249), `insightsView.js` (235–244), `aiPanelView.js` (`_resetPanel`), `academicCalendarView.js` (101–106), `script.js`.
- **Estratégia:** replicar o padrão de `resetStudyJournalView()`: limpar `innerHTML` das listas/cards, zerar caches em memória e estados de filtro em cada reset. Adicionar teste de simetria (já existe precedente em `tests/integration/`).

### AUD-005 · Ciclo de vida / Listener leak · **P2**
**Listener de `btn-academic-cals` é re-registrado a cada login.**

- **Descrição:** `_initApp()` roda a cada login (após logout na mesma página) e executa `document.getElementById("btn-academic-cals")?.addEventListener("click", openAcademicCalendarModal)` sem guarda de idempotência — todos os outros inits por login têm guarda (`initAccountView`, `initAcademicModal`, `initStudySessionView`, etc.).
- **Como reproduzir:** logar → deslogar → logar N vezes; clicar em "Calendários": `openAcademicCalendarModal` executa N vezes (re-render e re-fetch N vezes por clique).
- **Causa raiz:** único ponto de `_initApp` que registra listener direto sem guarda.
- **Impacto:** trabalho duplicado (fetch/render em N-plicata) crescendo por ciclo de login; risco de efeitos visíveis se o handler deixar de ser idempotente.
- **Risco:** baixo hoje, mas é exatamente a classe de bug que a A1.3 se propôs a eliminar.
- **Arquivos:** `script.js` (231).
- **Estratégia:** mover o bind para o bootstrap único (fora de `_initApp`) ou usar a mesma guarda das demais views.

### AUD-006 · Banco / Constraint inconsistente · **P2**
**`monthly_goal_minutes` é SMALLINT, mas o CHECK e a UI permitem até 44640.**

- **Descrição:** `sql/12_time_goals.sql` declara `monthly_goal_minutes SMALLINT` com `CHECK (... BETWEEN 5 AND 44640)`. O SMALLINT do Postgres vai só até **32767**. `timeGoals.js` (`GOAL_LIMITS.monthly.max = 44640`) e o formulário de conta aceitam o intervalo completo.
- **Como reproduzir:** em Minha Conta, definir meta mensal de 40000 minutos (~666h, válido pela UI) e salvar → erro de banco "smallint out of range", exibido como erro genérico.
- **Causa raiz:** tipo da coluna menor que o domínio declarado no CHECK.
- **Impacto:** falha de gravação com mensagem não amigável para valores 32768–44640.
- **Risco:** baixo (valores altos são raros), mas é uma inconsistência objetiva entre camadas.
- **Arquivos:** `sql/12_time_goals.sql`, `timeGoals.js`, `accountView.js`.
- **Estratégia:** migration alterando a coluna para INTEGER (mantendo o CHECK), ou reduzir o limite da UI/CHECK para 32767 — decidir e alinhar as três camadas.

### AUD-007 · UX / Condição de corrida de navegação · **P2**
**Navegação rápida na Agenda Semanal / Calendário pode renderizar dados da semana/mês errado.**

- **Descrição:** `weekView.navigate()` e `calendar.navigate()` disparam `fetchAndRender()` sem identificador de requisição. Dois cliques rápidos em ‹/› geram duas buscas concorrentes; se a mais antiga resolver por último, os eventos renderizados são de uma semana/mês diferente do rótulo exibido (o rótulo é atualizado sincronamente, os eventos chegam depois).
- **Como reproduzir:** com rede lenta (throttling), clicar › duas vezes rápido; observar eventos da semana N+1 sob o rótulo da semana N+2 (ou vice-versa).
- **Causa raiz:** ausência do padrão *request-id* que o próprio projeto já usa em `eventFormView._loadSessionHistory`/`_loadInsights` e `studySessionView._loadReviewOptions`.
- **Impacto:** dados exibidos sob rótulo errado — compromisso "no dia errado" aos olhos do usuário.
- **Risco:** médio em redes móveis.
- **Arquivos:** `weekView.js` (171–209), `calendar.js` (82–117).
- **Estratégia:** aplicar o mesmo contador de geração/requestId já padronizado no repositório, descartando respostas obsoletas.

### AUD-008 · Arquitetura / Domínios não integrados · **P2**
**Study Streak, Subject Progress e Achievements não têm nenhum consumidor de UI.**

- **Descrição:** `studyStreakService.js`, `subjectProgressService.js` e `achievementService.js` (F6.9/F6.11/F6.12) são importados **apenas** por testes e uns pelos outros (`achievementService` é o único importador dos outros dois, e ele próprio tem **zero** importadores de produção).
- **Como reproduzir:** `grep -rl "achievementService" --include="*.js" .` → só `tests/`.
- **Causa raiz:** as etapas F6.9–F6.12 entregaram a camada de domínio; a integração com views nunca aconteceu.
- **Impacto:** o fluxo A7 (… → Subject Progress → Achievements → …) não é executável no app; código morto "com testes" cria falsa sensação de cobertura de funcionalidade; risco de divergir silenciosamente do resto do domínio.
- **Risco:** baixo em runtime (não executa), alto em manutenção/roadmap.
- **Arquivos:** `studyStreakService.js`, `subjectProgressService.js`, `achievementService.js`.
- **Estratégia:** decisão de produto — ou priorizar as views consumidoras (nesse caso, resolver antes o AUD-009), ou registrar explicitamente como "domínio pronto aguardando UI" no ROADMAP. **Não remover** (regra da fase).

### AUD-010 · Performance / Consultas pesadas · **P2**
**Central de Insights e resumos de execução carregam tabelas inteiras com `select *`.**

- **Descrição:**
  - `insightsService._getEventExecutionCounts()` busca **todos os eventos do usuário** e depois **todas as sessões de todos esses eventos** (`getEventExecutionSummaries(ids)` com `select("*")`) só para contar executados/nunca executados. Roda a cada evento do barramento (fim/cancelamento/edição de sessão) via recarga da Central.
  - `getEventExecutionSummaries()` seleciona todas as colunas quando só `status`/`duration_minutes`/`started_at`/`event_id` são usados.
  - `achievementService.listAchievements()` (quando for integrado) refaz `getActivitySessions()`/`getQuestions()` várias vezes na mesma rodada (uma por helper).
- **Como reproduzir:** conta com 1–2 anos de uso → abrir Insights e finalizar uma sessão; observar o volume transferido.
- **Causa raiz:** contagens feitas no cliente em vez de agregação no banco; ausência de projeção de colunas.
- **Impacto:** crescimento linear de payload/latência com o histórico; hoje aceitável, tende a degradar.
- **Risco:** certo a médio prazo.
- **Arquivos:** `insightsService.js` (38–53), `activitySessionService.js` (325–347), `achievementService.js`.
- **Estratégia:** usar `count: "exact", head: true` para contagens, projetar colunas nos selects em lote, e (futuro) mover "executados/nunca executados" para uma consulta agregada.

### AUD-018 · Ciclo de vida / Diálogos dinâmicos no logout · **P2** (limítrofe P3)
**Diálogos criados dinamicamente não são fechados por `showAuthView`.**

- **Descrição:** `_closeAllModals()` (authView) fecha só os IDs fixos de `MODAL_IDS`. Overlays criados dinamicamente — `confirmDialog`, `abandonedSessionDialog`, `quickAdd` — e o modal de encerramento `ss-finish-modal` não estão na lista (o de encerramento é fechado por `resetStudySessionView`, os demais por ninguém).
- **Como reproduzir:** deixar o diálogo de sessão abandonada (F7.9) ou um quickAdd aberto e forçar expiração de sessão (`forceReauth`): a tela de login aparece **atrás** do diálogo do usuário anterior.
- **Causa raiz:** logout centrado em IDs estáticos; os diálogos dinâmicos não expõem reset.
- **Impacto:** UI residual sobre a tela de login; os handlers desses diálogos já são defensivos (ex.: `_resolveAbandonedSession` re-verifica `_session`), então o dano é visual/confuso, não de dados.
- **Risco:** baixo-médio (depende de expirar sessão com diálogo aberto).
- **Arquivos:** `authView.js` (23–42), `confirmDialog.js`, `abandonedSessionDialog.js`, `quickAdd.js`.
- **Estratégia:** cada diálogo dinâmico expõe um `close()/reset()` registrado no `onBeforeSignOut`, ou adota uma classe/atributo comum varrido por `_closeAllModals()`.

---

## P3 — Backlog priorizado

### AUD-011 · Estado global / Isolamento por usuário · **P3**
Chaves de `localStorage` **não escopadas por usuário**: `medagenda_last_page`, `medagenda_sidebar_collapsed`, `medagenda_filter_personal`, `medagenda_filter_academic`. Ao trocar de conta no mesmo navegador, o usuário B herda a última página, o estado da sidebar e — mais relevante — os filtros de visibilidade (pode abrir o app com "Compromissos pessoais" ocultos sem saber por quê). Contraste: `notificationService`/`pushService` já escopam por `userId` (`medagenda_notif_<uid>`). **Arquivos:** `navigationView.js`, `academicCalendarFilter.js`. **Estratégia:** adotar a convenção `chave_<userId>` já existente; decidir explicitamente o que é "do dispositivo" (sidebar) vs "do usuário" (filtros, última página).

### AUD-012 · UX / Estados de carregamento · **P3**
Dashboard, Histórico, Diário e Insights **não têm estado de loading**: entre o `init` e a resposta, a tela fica em branco (nem skeleton, nem "Carregando…"). Calendário (`showLoading()`), Conta e painel de IA têm. Em rede lenta, "em branco" é indistinguível de "vazio" até a resposta chegar. **Arquivos:** `activityDashboardView.js`, `activityHistoryView.js`, `studyJournalView.js`, `insightsView.js`, `index.html`. **Estratégia:** reutilizar o padrão de `cal-loading`/skeleton em cada `_load()`.

### AUD-013 · UX / Fluxo inconsistente de encerramento · **P3**
`startSessionForEvent()` (conflito "já existe sessão em andamento") e o diálogo de sessão abandonada finalizam via `finishSession()` **direto**, pulando o resumo de encerramento (F7.3) — sem questões, revisões ou observações para aquela sessão. É o único caminho em que uma sessão termina sem passar pelo resumo. Para a sessão abandonada isso é documentado como decisão; para o fluxo de conflito não há registro de decisão. **Arquivos:** `studySessionView.js` (841–858, 804–818). **Estratégia:** decidir e documentar; ou direcionar o usuário para a tela de sessão para finalizar pelo fluxo completo.

### AUD-014 · Event bus / Publicações duplicadas · **P3**
Toda transição publica **dois eventos** (o específico + `SessionUpdated`, dentro de `updateActivitySession`). As views coalescem via `_scheduleReload`, mas `studySessionView._handleBusEvent` executa duas vezes por transição vinda de outra aba — com **dois** `getEventById()` cada. `aiContextService` também assina os três eventos redundantemente (documentado como intencional). **Arquivos:** `activitySessionService.js` (50–62), `studySessionView.js` (733–748). **Estratégia:** debounce no `_handleBusEvent` (mesmo padrão `_scheduleReload`) ou cache curto de `getEventById`.

### AUD-015 · Documentação desatualizada · **P3** — **Resolvido em PR6 (consolidação de documentação técnica)**
- `docs/DATA_MODEL.md` e `docs/DATABASE.md` cobrem só até a migration 10 — não mencionam `activity_sessions` (11), metas (12), `reviews` (13), `schema_version` (14), `questions` (15), vínculo revisão↔sessão (16), pausas (17) nem `reflections` (18).
- `docs/BANCO_DE_DADOS.md` cita apenas até `sql/07_academic_calendar.sql`.
- Duplicação PT/EN com conteúdo divergente: `ARQUITETURA.md` × `ARCHITECTURE.md`, `BANCO_DE_DADOS.md` × `DATABASE.md` × `DATA_MODEL.md` — três fontes concorrentes para o mesmo assunto, nenhuma completa.
- Comentário incorreto: `reviewService.list()` diz "mais recente prevista primeiro" mas ordena `ascending: true`.
- `README.md` não menciona o pré-requisito `config.js` deduzível só pelo `.gitignore`/deploy (verificar seção de setup).
**Estratégia:** eleger um documento canônico por assunto (e idioma), atualizar até a migration 18, e apontar os demais para ele.

**Resolução (PR6):** `docs/DATABASE.md` passou a ser o documento canônico de schema, atualizado até a migration `20` (inclui `activity_sessions`, `reviews`, `questions`, `reflections`, `schema_version` e as metas de tempo em `profiles`). `docs/ARCHITECTURE.md` passou a ser o documento canônico de arquitetura, com as seções novas "Modelo de Domínio", "Session Event Bus", "Fluxo da Sessão de Estudo" e "Diário de Estudos". `docs/ARQUITETURA.md`, `docs/BANCO_DE_DADOS.md` e `docs/DATA_MODEL.md` foram convertidos em redirecionamentos para os documentos canônicos. O comentário incorreto em `reviewService.list()` e a ausência de menção a `config.js` no `README.md` não fazem parte do escopo desta PR (documentação apenas) e permanecem em aberto.

### AUD-016 · Estado / Filtro de categorias da lista · **P3**
`_syncCategoryFilter()` (script.js) restaura `filterCategorySelect.value = current` após reconstruir as opções; se a categoria filtrada deixou de existir (excluída/renomeada), o select volta a "Todas" **mas a lista já foi renderizada com o filtro antigo** — lista vazia sob um select que diz "Todas as categorias" até a próxima interação. **Arquivos:** `script.js` (343–359). **Estratégia:** se o valor não existir mais nas opções, re-renderizar a lista com filtro limpo.

### AUD-017 · Métricas / Arredondamento de metas · **P3**
`calculateGoalPercentage` arredonda antes de classificar o estado: 99,5%–100,4% viram `percentage === 100` → "Meta atingida" (inclusive quando faltam minutos); 100,4% nunca vira "ultrapassada". Cosmético, mas o estado exibido pode contradizer "Restam X min". **Arquivos:** `timeGoals.js` (46–56, 76–99). **Estratégia:** classificar o estado pelos minutos brutos (`actual >= goal`), arredondar só para exibição.

### AUD-019 · Código morto / APIs não usadas · **P3**
Catalogado (não remover nesta fase):
- `sessionEventBus.clear()` — exportado, nunca chamado em produção (o logout confia nos resets individuais; se um deles falhar, não há "fail-safe").
- `profiles.theme` — coluna + upsert aceitos, nenhuma UI lê/grava (documentado no código).
- `achievementService`/`studyStreakService`/`subjectProgressService` — ver AUD-008.
- `objectiveEl` em studySessionView sempre "—" (campo reservado, documentado).
- `getQuestionById`/`updateQuestion`/`removeQuestion` (sessionQuestionsService) — sem consumidores de UI.
**Estratégia:** revisar junto com AUD-008 na decisão de roadmap.

### AUD-020 · Testes / Lacunas · **P3**
Cobertura geral é boa (1055 testes, incluindo integração e RLS), mas há lacunas alinhadas aos achados:
- nenhum teste cobre a recarga do Histórico com lookups desatualizados (AUD-003);
- nenhum teste de simetria DOM pós-logout para Histórico/Dashboard/Insights/painel IA (AUD-004) — existe precedente para Diário/weekView;
- nenhum teste da corrida de navegação (AUD-007) nem do conflito de duas sessões running (AUD-001);
- `script.js` (bootstrap/_initApp) não tem teste direto — as guardas de re-login são verificadas só indiretamente.
**Estratégia:** cada correção P1/P2 deve chegar com o teste de regressão correspondente.

### AUD-021 · Segurança / Observações positivas e ressalvas menores · **P3**
**Positivo (sem ação):** RLS presente e correta em todas as tabelas; Edge Function `ai-chat` valida JWT + origem e mantém a chave Gemini fora do browser; escape de HTML consistente (`escapeHtml`/`highlightMatches` escapam corretamente); `reauthenticate()` antes de troca de senha; categorização de erros estruturada sem heurística de texto para auth.
**Ressalvas menores:**
- `reviews.session_id` não tem validação no banco de que a sessão pertence ao mesmo `user_id` (a RLS protege a linha de review, e o frontend valida — defesa em profundidade apenas);
- políticas de UPDATE sem `WITH CHECK` explícito (o Postgres reaproveita o `USING`, comportamento correto, mas explicitar documenta a intenção);
- dois usuários no mesmo navegador compartilham o mesmo endpoint de push se ambos ativarem (comportamento aceitável, mas não documentado).
**Arquivos:** `sql/16_review_session_link.sql`, `sql/*.sql`, `pushService.js`.

---

# Lista Priorizada (ordem recomendada de correção)

| # | ID | Prioridade | Tema | Esforço estimado | Impacto |
|---|---------|------------|------------------------------------------------------|------------------|---------|
| 1 | AUD-001 | P1 | Constraint de sessão running única + tratamento no service | Pequeno (migration + service + teste) | Evita estado irrecuperável na tela principal |
| 2 | AUD-003 | P1 | Lookups obsoletos no Histórico (e Diário) | Pequeno | Corrige dado errado em fluxo comum |
| 3 | AUD-002 | P1 | Consultas em lote no Diário | Médio | Latência do Diário cai ~an ordem de grandeza |
| 4 | AUD-004 | P2 | Limpeza de DOM/memória nos 5 resets faltantes | Pequeno-médio | Fecha a política A10/A1.3 |
| 5 | AUD-005 | P2 | Guarda no listener `btn-academic-cals` | Trivial | Elimina último leak de listener por login |
| 6 | AUD-006 | P2 | Tipo da coluna de meta mensal | Pequeno (migration 19 pode agrupar com AUD-001) | Elimina erro de gravação |
| 7 | AUD-007 | P2 | Request-id na navegação semana/mês | Pequeno | Corrige render sob rótulo errado |
| 8 | AUD-018 | P2 | Fechar diálogos dinâmicos no logout | Pequeno | Fecha resíduo visual pós-reauth |
| 9 | AUD-010 | P2 | Contagens agregadas / projeção de colunas | Médio | Prepara escala do histórico |
| 10 | AUD-008 | P2 | Decisão de roadmap: Streak/Progress/Achievements | Decisão + (opcional) UI | Destrava fluxo A7 ou limpa o roadmap |
| 11 | AUD-012 | P3 | Estados de loading nas 4 telas | Pequeno | UX em rede lenta |
| 12 | AUD-011 | P3 | Escopar localStorage por usuário | Pequeno | Isolamento entre contas |
| 13 | AUD-013 | P3 | Fluxo de encerramento no conflito de sessão | Decisão + pequeno | Consistência do domínio |
| 14 | AUD-016 | P3 | Filtro de categoria órfão na lista | Trivial | Estado consistente |
| 15 | AUD-014 | P3 | Debounce no handler de bus da Sessão | Trivial | Menos fetches redundantes |
| 16 | AUD-017 | P3 | Estado de meta pelo valor bruto | Trivial | Coerência dos cards |
| 17 | AUD-015 | P3 | Atualizar/canonizar docs de banco e arquitetura | Médio (só escrita) | Documentação confiável |
| 18 | AUD-019 | P3 | Catálogo de código morto (decisões) | Decisão | Higiene |
| 19 | AUD-020 | P3 | Testes de regressão dos itens acima | Junto de cada fix | Prevenção |
| 20 | AUD-021 | P3 | Ressalvas menores de segurança (defesa em profundidade) | Pequeno | Robustez |

**Agrupamentos sugeridos por PR (fase de correção):**
1. **PR "Banco"** — AUD-001 + AUD-006 (uma migration 19 + ajustes de service).
2. **PR "Lifecycle/logout"** — AUD-004 + AUD-005 + AUD-018 (mesma família A1.3/A10, testes de simetria juntos).
3. **PR "Dados obsoletos e corrida"** — AUD-003 + AUD-007 + AUD-016 (padrão request-id/invalidacão).
4. **PR "Performance"** — AUD-002 + AUD-010 + AUD-014.
5. **PR "UX"** — AUD-012 + AUD-013 + AUD-017.
6. **PR "Docs"** — AUD-015 (+ decisões registradas de AUD-008/AUD-019).

---

# Verificações por Área do Escopo (resultado resumido)

| Área | Resultado |
|------|-----------|
| **A1 Arquitetura** | Conforme F6 na quase totalidade: serviços de domínio não chamam `handleError`, views não acessam banco, `activitySessionService` é o único publicador do bus, projeções (streak/progress/achievements) nunca persistem. Desvios: AUD-008 (domínios sem consumidor), pub/subs paralelos ao bus em `reviewService`/`profileService` (documentados como legado consciente — sem ação). Sem dependências circulares detectadas. |
| **A2 Ciclo de vida** | Simetria init/reset presente em todas as views; timers (`_nowTimer`, `_tickId`, `_rescheduleTimer`, `_reloadTimer`, stageTimers) todos com clear correspondente. Falhas pontuais: AUD-004 (DOM/memória), AUD-005 (1 listener), AUD-018 (diálogos dinâmicos). |
| **A3 Estado global** | Estado de módulo é resetado no logout via `onBeforeSignOut` (16 resets). Exceções: caches de lookup (AUD-003/AUD-004) e localStorage não escopado (AUD-011). `aiContextService` tem cache + dirty-flag corretos, com guarda de virada de dia. |
| **A4 Session Event Bus** | 6 eventos oficiais; publicador único; toda assinatura tem cancelamento no reset da view; guardas de re-assinatura idempotentes em todos os assinantes; `publish` é defensivo. Achados: duplicação específico+UPDATED (AUD-014), `clear()` nunca usado (AUD-019). Nenhum listener órfão encontrado. |
| **A5 Banco** | RLS completa; FKs com CASCADE/SET NULL coerentes (questions CASCADE, reviews.session_id SET NULL, sessions.event_id SET NULL); índices adequados; `schema_version = 18` alinhado com `EXPECTED_SCHEMA_VERSION`. Achados: AUD-001 (falta unique parcial), AUD-006 (SMALLINT), AUD-021 (ressalvas). |
| **A6 Domínios** | Responsabilidades respeitadas (Sessão raiz; Questões/Revisões/Reflexão sempre via camada de orquestração; Reflexão separada de Observações). "Matéria" ainda é alias de categoria (documentado no código). AUD-008 para domínios sem UI. |
| **A7 Fluxos** | Compromisso→Sessão→Questões→Revisões→Resumo→Histórico→Diário→Dashboard→Insights→IA: executável e consistente (com AUD-003 afetando o elo Histórico e AUD-013 no conflito de sessões). Subject Progress→Achievements: **não executável** (AUD-008). |
| **A8 Performance** | Padrões bons já estabelecidos (batch de execution summaries, cache do Context Engine, coalescing de reloads, índice de busca do Diário). Achados: AUD-002, AUD-010, AUD-014. |
| **A9 UX** | Estados vazios/erro/retry padronizados via `stateView` (F4.1) em praticamente todas as telas; sessão expirada tem fluxo único. Achados: AUD-012 (loading ausente em 4 telas), AUD-007, AUD-013, AUD-016. |
| **A10 Segurança** | RLS + escopo `user_id` em todo service; escape de HTML consistente; Edge Function autenticada com CORS restrito; senha exige reautenticação; campos de senha limpos no logout. Achados: AUD-004 (DOM pós-logout), AUD-011, AUD-021. |
| **A11 Código morto** | Catalogado em AUD-019/AUD-008. Nada removido. |
| **A12 Testes** | 1055/1055 verdes; integração cobre RLS, sessão expirada, schema mismatch e fluxo completo de estudo. Lacunas em AUD-020. |
| **A13 Documentação** | CHANGELOG e comentários de código excelentes e atualizados; docs/ de banco e arquitetura defasados e duplicados (AUD-015). |

---

*Relatório produzido na fase F9.1. Nenhuma correção foi aplicada; todas as estratégias acima são propostas para as fases seguintes.*
