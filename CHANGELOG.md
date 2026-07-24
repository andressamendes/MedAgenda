# Changelog

---

## [Unreleased] — V5.11: Mini-timer flutuante

- **O chip de sessão ativa (`activeSessionIndicatorView.js`, F11 E13) evolui
  de um botão só dentro do header para um mini-timer fixo na tela**, que
  sobrevive a qualquer rolagem em qualquer página. Um toque no tempo expande
  um painel com "Abrir sessão" (navega para `study-session`) e "+1 questão"
  (registro rápido via `sessionQuestionsService.addQuestion()`, mesmo padrão
  de defaults do registro rápido de `studySessionView.js` — múltipla
  escolha/média/já respondida). Continua sem duplicar nenhum controle
  completo (pausar/retomar/finalizar/formulário detalhado): o widget se
  esconde sozinho enquanto a página de Sessão está ativa, observando
  diretamente o atributo `hidden` de `#page-study-session` (nenhum evento
  novo de navegação foi introduzido). Posicionamento fixo respeita as safe
  areas e sobe acima da bottom nav em telas mobile (`style.css`).

## [Unreleased] — V5.10: Paleta de comando (Ctrl/Cmd+K)

- **`commandPaletteView.js` unifica navegação, ações rápidas e busca numa
  única superfície de comando, aberta por Ctrl+K/Cmd+K** — os atalhos "N"
  (novo compromisso), "G + tecla" (ir para uma página) e "/" (focar busca)
  já existiam, mas eram invisíveis fora de um `title=""`; a paleta os torna
  descobríveis sem mudar nenhum deles. Cobre os 9 comandos mínimos: 5
  destinos de navegação (Hoje/Agenda/Sessão/Diário/Progresso, via
  `showPage()`), 2 ações rápidas ("Novo compromisso" delega ao mesmo clique
  em `#btn-new-event` que "N" já usa; "Iniciar sessão de estudo" abre o
  mesmo modal de configuração pré-início de `#ss-btn-start-standalone`,
  só quando não há sessão em andamento) e 2 atalhos de busca ("Buscar no
  Diário"/"Buscar compromissos", que navegam e focam o campo já existente
  de cada página). Fuzzy simples (prefixo > substring > subsequência de
  caracteres, sem dependência externa) filtra a lista ao digitar. Totalmente
  navegável por teclado (setas para mover a seleção com wrap-around, Enter
  confirma, Esc fecha — reaproveitando o Focus Trap/Escape/clique-fora
  compartilhado de `modalController.js`, mesmo padrão de todo modal do
  produto). `keyboardService.js` intercepta especificamente Ctrl/Cmd+K (sem
  Shift/Alt) antes da guarda geral que ignora combinações
  Ctrl/Cmd/Alt+tecla — funciona mesmo com o foco num campo de texto, sem
  colidir com nenhum atalho existente.

## [Unreleased] — V5.9: Onboarding com propósito emocional

- **A lista numerada de 4 passos do tour de boas-vindas (`onboardingTourView.js`)
  dá lugar a 2-3 telas curtas de propósito emocional** — o tour antigo era
  puramente funcional ("o que cada tela faz": Agenda, Sessão, Diário,
  Progresso) e nunca explicava por que isso importa para quem estuda
  Medicina, perdendo a chance de uma primeira impressão emocional. As novas
  telas (`SLIDES` em vez de `STEPS`) contam o "porquê" do Anoti — constância
  em vez de intensidade, a curva do esquecimento, progresso visível — e só a
  última tela oferece uma ação concreta ("Marcar meu primeiro horário" →
  Agenda). Navegação por "Continuar"/pontos (`.onboarding-tour-dots`,
  `style.css`) substitui a lista clicável de páginas. As regras já existentes
  seguem intactas: nunca um modal, sempre dispensável a qualquer momento
  (botão "Pular" em toda tela), nunca reaparece após visto
  (`medagenda_tour_seen` em `localStorage`), e continua condicionado a nunca
  ter havido nenhuma sessão de estudo (`hasAnySession()`).

## [Unreleased] — V5.7: Celebração de conquista desbloqueada

- **Uma tela cheia própria (`.achv-celebration-screen`,
  `achievementCelebrationView.js`) revela o momento em que uma conquista
  cruza de "em progresso" para "concluída"** — até aqui as conquistas eram
  puramente derivadas e recalculadas a cada carregamento (F6.12), então não
  existia nenhum instante em que essa transição fosse reconhecida pelo
  usuário; era o único "momento de vitória" verdadeiramente novo da
  auditoria F19. `achievementService.js` ganha `consumeNewlyCompleted()`,
  que compara o resultado já computado de `listAchievements()` contra uma
  marca "já celebrada" em `localStorage` (por device e por usuário, mesmo
  padrão de `TOUR_SEEN_KEY` em `onboardingTourView.js`) — o princípio
  arquitetural "conquistas nunca são persistidas" continua intacto: nada
  além dessa marca de "visto" é salvo, nenhum `current`/`target`/`progress`
  grava em lugar nenhum. A primeira checagem de sempre para um usuário
  preenche silenciosamente as conquistas já concluídas como "vistas" (sem
  celebração), para que quem já tinha as 5 completas antes desta feature
  não veja todas de uma vez após o deploy. `activityDashboardView.js`
  dispara a checagem a cada recarga do dashboard (boot, eventos de sessão,
  atualização de meta); se mais de uma conquista se completa na mesma
  carga, cada uma ganha sua própria revelação, em fila, nunca empilhadas.
  Paleta e animação (badge com "burst" de anéis) próprias, para nunca ser
  confundida com o Fechamento do Dia (V5.6) nem com um toast padrão.
  `prefers-reduced-motion` desativa a animação do badge.

## [Unreleased] — V5.6: Tela própria para o Fechamento do Dia

- **`#close-day-modal` deixa de ser um `.modal-overlay`/`.modal-card` genérico**
  e ganha uma experiência de tela cheia (`.close-day-screen`, `index.html`/
  `style.css`) — o ritual de fechamento do dia (F14.8) era a melhor ideia de
  design emocional do produto (auditoria F19) escondida dentro do componente
  de modal mais reaproveitado do app. Os números do recap (tempo, sessões,
  questões, sequência — mesmos dados de `closeDayService.getDayRecap()`,
  nenhum cálculo novo) agora são revelados em sequência, um a um, via
  `--cd-delay` inline por elemento (`index.html`) e uma única animação
  `close-day-reveal` que lê essa variável (`style.css`) — sem JS extra, a
  troca de `hidden` já reinicia a sequência a cada abertura. `todayView.js`
  não mudou nenhuma lógica (mesmo `initModal()`, mesmo
  `getDayRecap()`/`setNextStudyPlan()`), só a moldura visual do elemento
  overlay. Acessibilidade preservada e reforçada: mesmo Focus Trap/Escape/
  clique-fora de `modalController.js`, foco inicial no campo "o que você vai
  estudar amanhã", e o recap ganhou `aria-live="polite"` (ausente no modal
  antigo) para que a leitura dos números seja anunciada assim que carrega.
  `prefers-reduced-motion` desativa a sequência (todo o conteúdo aparece de
  uma vez, sem `translateY`).

## [Unreleased] — V5.2: Anel de progresso para a meta diária

- **Anel circular (SVG) substitui a barra linear** no card "Meta diária" do
  Dashboard de Execução (`activityDashboardView.js`) — o primeiro "momento
  Apple Health" do produto (F19 roadmap). Mesmo dado de entrada
  (`dailyGoal.percentage`/`.state`), mesmo contrato de acessibilidade da
  barra anterior: `role="progressbar"` + `aria-valuenow` espelham o
  percentual, que continua escrito em texto (`.stat-card-value`/
  `.stat-card-desc`) — o anel nunca é a única forma de ler o progresso.
  Meta semanal e mensal continuam com a barra linear de sempre
  (`_progressBarMarkup`), sem nenhuma mudança — só a meta diária ganhou o
  anel (`_progressRingMarkup`), reaproveitável depois na meta semanal
  (V5.17).

## [Unreleased] — V5.1: Heatmap de constância no Progresso

- **Heatmap de dias estudados** (`constancyHeatmapView.js`) no topo da página
  Progresso, acima da narrativa — 84 células (12 semanas), cada uma
  refletindo `studyStreakService.getStudyCalendar()`, que já existia,
  testado, desde a F6.11, documentado como "pensado para consumo futuro por
  um widget de calendário" sem nunca ter sido conectado a nenhuma view.
  Leitura pura (nenhuma alteração em `studyStreakService.js`): dá ao
  Progresso uma resposta visual instantânea à pergunta "como tenho sido",
  antes de qualquer frase da narrativa. Grid responsivo via CSS Grid
  (`grid-auto-flow: column`, sem markup aninhado por semana), cores só via
  tokens `--color-N` (acompanha tema claro/escuro automaticamente), e
  recarrega sozinho a cada evento do barramento de sessão (F6.2), mesmo
  padrão de `activityDashboardView.js`.

## [Unreleased] — F18.17: Unificar Notificações locais e Push

- **Um único controle "Lembretes"** substitui as duas seções técnicas
  "Notificações locais" e "Notificações Push" em Configurações
  (`#settings-overlay`, `settingsModal.js`) — a distinção "app aberto" vs.
  "app fechado" era uma decisão técnica exposta ao usuário sem necessidade
  (auditoria F18, achado #11/P1). Ativar o botão único pede permissão do
  navegador, agenda os lembretes locais (`notificationService.js`) e, quando
  o navegador suporta push e o servidor está configurado (`VAPID_PUBLIC_KEY`),
  também tenta ativar a subscription push (`pushService.js`) em segundo
  plano — a indisponibilidade de push (navegador sem suporte, VAPID ausente,
  erro de rede) nunca bloqueia o lembrete local. Desativar cancela os dois
  mecanismos. Nenhuma migração de dado foi necessária: quem já tinha push
  ativo antes desta mudança continua sendo lido como "Ativado" pelo controle
  único (o estado é derivado das preferências já salvas de cada mecanismo,
  não reescrito).

## [Unreleased] — F18.16: Remover "Resumos Semanais" do Diário

- **Painel "Resumos Semanais" removido do Diário de Estudos** (`studyJournalView.js`)
  — era a segunda geração de texto narrativo formulaico respondendo à mesma
  pergunta ("como foi meu estudo") já respondida pelo Progresso narrativo
  (F14.5), com um template rígido de poucas variações e baixo valor
  incremental sobre olhar os números direto (auditoria F18, achado #77/#109).
  O agrupamento por semana existia só para alimentar esse painel; sem ele, a
  timeline volta a agrupar só por dia. `studySummaryService.js`
  (`buildWeeklySummary`/`buildMonthlySummary`, F8.6), consumido apenas por
  este painel, foi removido do produto. `#sj-week-summaries-panel` removido
  de `index.html`.

## [Unreleased] — F18.5: Remover o bypass do Decision Engine em `eventFormView.js`

- **Cards inteligentes do modal de compromisso removidos.** `eventFormView.js`
  montava seus próprios "smart cards" (`_loadInsights`/`_buildEventInsightCards`)
  lendo `aiContextService.getAIContext()` direto, com limiares próprios
  (`UNDERSTUDIED_DAYS`/`GOAL_NEAR_MIN_PCT`) duplicados dos já existentes em
  `recommendationEngine.js` — por fora do Decision Engine (`decisionEngine.js`,
  F3.7) usado pelo resto do produto. Isso produzia, para o mesmo dado
  ("categoria negligenciada"), um card calmo ("dica") quando passava pelo
  Decision Engine em outras telas e um card de alerta ("atenção") só neste
  formulário — a inconsistência de tom que a auditoria F18 (achado #8/P1)
  apontou. O formulário não decide mais isso por conta própria: nenhum card
  espontâneo é montado no modal de compromisso, em nenhum cenário. O
  retrospecto da categoria/compromisso continua acessível sob demanda pelo
  botão "Ver histórico e estatísticas" já existente (session-history/
  session-stats) — só deixou de ser empurrado sem pedido. `#event-insights`
  removido de `index.html`.

## [Unreleased] — F18.2: Resolver a colisão de "Todas" no Diário

- **Aba de status renomeada de "Todas" para "Histórico"** em `#sj-status-tabs`
  do Diário. A mesma tela tem um chip de período (`.sj-quick-filters`) também
  chamado "Todas", 37 linhas abaixo — as duas palavras idênticas tinham
  significados diferentes (todos os status vs. todo o período), empilhadas a
  poucas linhas de distância. `data-status="all"` não mudou, só o rótulo
  visível — sem lógica nova, sem mudança de comportamento.

## [Unreleased] — F18.1: Restaurar acesso à página Progresso

- **Item de navegação "Progresso" restaurado na sidebar** (grupo secundário,
  ao lado de "Diário") e atalho de teclado `g p`. A página `#page-progress`
  (Progresso narrativo, F14.5) já existia e funcionava, mas nenhum elemento
  de navegação apontava pra ela — `showPage("progress")` só era alcançável
  chamando a função diretamente, então a feature estava efetivamente morta
  em produção. Também acessível em mobile pelo botão "Mais" (abre a mesma
  sidebar). Sem nenhuma mudança na página em si.

## [Unreleased] — F17: Refatoração do Registro de Questões + Estatísticas do Diário

- **Registro de questões unificado:** o botão "+1 questão" (registro fora do
  painel, sem resultado) foi removido — "Questões e revisões" passa a ser o
  único ponto de entrada. Todo lançamento (registro rápido ou "+ Adicionar
  com detalhes") agora exige quantidade de questões resolvidas e número de
  erros; acertos são derivados (`questões - erros`), com validação (mínimo 1
  questão, erros nunca maiores que a quantidade).
- **Persistência:** `sql/25_question_results.sql` adiciona `correct_count`/
  `incorrect_count` a `public.questions` (`DEFAULT 0`, sem backfill manual —
  linhas antigas contam como zero, nenhuma perda de dado) e a função
  `get_question_statistics()`, que agrega total/acertos/erros no próprio
  Postgres (filtros opcionais de período, categoria e matéria) em vez de
  trazer todas as questões para o cliente. `EXPECTED_SCHEMA_VERSION` 24 → 25.
- **`studyStatisticsService.js` (novo):** único responsável por agregação de
  desempenho — `getUserQuestionStatistics(filters)` (RPC) para estatísticas
  globais e `summarizeSessionQuestions(questions)` (função pura) para o
  resumo por sessão, ambos evitando divisão por zero.
- **Diário de Estudos:** nova seção fixa "Estatísticas" acima da lista de
  sessões (questões respondidas/acertos/erros/índice de acerto, com indicador
  🟢/🟡/🔴), reagindo aos filtros de Período/Categoria já existentes na
  toolbar — nenhum controle novo. Cada sessão mostra um resumo no bloco
  "Questões" (`8 questões · 6 acertos · 2 erros · 🟢 75%`), ou "Nenhuma
  questão registrada." quando vazio.

## [Unreleased] — F15: pós-Auditoria Final 360° (confiança, rotina real, robustez)

Fases executadas a partir de `docs/02_IMPLEMENTATION_ROADMAP.md` (achados
M1–M20 da Auditoria Final 360°, `docs/01_FINAL_AUDIT_REPORT.md`). Uma PR por
fase.

### Onda 1 — Confiança (bloqueadores de lançamento)

- **F15.1 — XSS armazenado corrigido na narrativa do Progresso:**
  `escapeHtml(dominantCategory.name)` no único sink de `innerHTML` sem escape
  (`activityDashboardView.js`) — o nome da categoria é texto livre e gravável
  via importação `.ics` de terceiros. Teste de regressão com payload
  `<img onerror>` renderizando como texto literal.
- **F15.2 — Edge Function `ai-chat` endurecida:** allowlist de `model`
  (`gemini-2.5-flash`, 400 fora dela), `temperature` restrita a [0, 1] e
  `maxTokens` a [1, 2048], e rate limit de 20 chamadas/usuário/hora contadas
  em `ai_metrics` antes de chamar o Gemini (429 no excesso). O servidor decide
  modelo, limites e frequência — nunca o cliente.
- **F15.3 — Observabilidade mínima de produção:** nova tabela `client_errors`
  (`sql/23_client_errors.sql`, insert-only, RLS sem política de leitura, sem
  PII — mesmo padrão de `ai_metrics`); `errorService.handleError()` envia
  fire-and-forget categoria, contexto, mensagem truncada e user agent, com
  rate limit local (5/min) e deduplicação por assinatura.
  `EXPECTED_SCHEMA_VERSION` 22 → 23.

### Onda 2 — Rotina real

- **F15.4 — Plano de amanhã consumido no início real da sessão:** o chip
  "Amanhã: X" deixa de chamar `clearNextStudyPlan()` no clique; o plano só é
  consumido após `startSession()` bem-sucedido. Fechar o modal sem iniciar
  preserva a intenção registrada no "Fechar o dia".
- **F15.5 — Sugestões de início enxergam recorrência:** o chip
  "Hoje: {compromisso}" nasce de `getEventsByRange` + `expandEvents` (mesmo
  caminho da tela Hoje) — a aula fixa semanal vira sugestão de um toque, com
  prioridade para a categoria "Estudo" e deduplicação com o chip "Revisar:".
- **F15.6 — QuickAdd como caminho padrão do "+ Novo compromisso":** o botão
  mais visível de criação (e o atalho `N`) abre o QuickAdd (título + hora +
  Enter) com data de hoje editável; "Mais opções" leva ao formulário completo
  pré-preenchido. Criação típica cai de ~8 interações para 3.
- **F15.7 — "Continuar" preserva vínculo e ignora canceladas:** a retomada de
  1 clique usa `startSessionForEvent(event)` quando o compromisso ainda
  existe (mantendo `event_id`, categoria herdada e barra de progresso);
  títulos sugeridos vêm só de sessões `finished`.

### Onda 3 — Robustez

- **F15.8 — Guarda de estado nas transições de sessão:**
  finish/cancel/pause/resume passam pelo helper `_transition()` com UPDATE
  condicional (`.in("status", fromStatuses)`) avaliado atomicamente no banco;
  0 linhas afetadas vira erro de domínio `SESSION_STATE_CONFLICT` — fecha a
  corrida finalizar×cancelar entre abas, com o mesmo rigor do início de
  sessão (AUD-001).
- **F15.9 — `delete-account` mínima e consistente:** removidos os deletes
  manuais redundantes (todas as FKs de dados de usuário são
  `ON DELETE CASCADE`); resta autenticação → limpeza do bucket `avatars`
  (erro checado) → `deleteUser`. Padronizada com as demais functions
  (`Deno.serve`, import `npm:`, mesma allowlist de CORS do `ai-chat`).
- **F15.10 — Cache de leitura por carregamento:** `getEvents()` e
  `getCategories()` memoizam a promessa da consulta por usuário, com
  invalidação em toda escrita do próprio service e no logout — elimina as
  consultas redundantes de abertura do app (6+ call sites de `getEvents`).
- **F15.11 — Batch insert em `generateForEvent`:** as revisões padrão de um
  compromisso são criadas com 1 SELECT + 1 INSERT em lote, em vez de 3
  INSERTs sequenciais revalidando o evento a cada um.

### Onda 4 — Coerência

- **F15.13 — "Hoje em números" atrás de disclosure:** a grade de stat-cards da
  tela Hoje nasce colapsada atrás do botão "Ver números de hoje" (mesmo
  padrão do disclosure "Ver números" do Progresso, F14.5), em vez de
  competir com o CTA "Começar a estudar" no primeiro olhar do dia. Nenhum
  cálculo ou id muda (`dash-cards-today` intacto).
- **F15.15 — Busca do Diário sobre o histórico completo:** ativar qualquer
  busca ou filtro com páginas ainda não carregadas no servidor carrega o
  restante do histórico em lotes de 50 (mesma `listSessions`, com aviso de
  progresso) antes de filtrar em memória — a busca deixa de operar só sobre
  as sessões já paginadas. O antigo aviso de parcialidade
  (`#sj-filter-partial-notice`) permanece só como rede de segurança e nunca
  aparece com um filtro já resolvido.
- **F15.17 — Acessibilidade real das abas:** novo `tabsController.js`
  implementa o padrão WAI-ARIA Tabs (roving tabindex, setas ←/→, Home/End) e
  passa a ser usado pelas 4 superfícies com `role="tablist"` (Agenda,
  Diário, modal de início de sessão, tema em Configurações), cada uma
  mantendo sua própria lógica de seleção. `aria-controls` adicionado
  ligando cada aba ao seu painel (`role="tabpanel"`). Nenhuma mudança
  visual.

## [Unreleased] — Auditoria UX do Diário (Etapas 1–7)

Sete etapas de poda visual sobre `studyJournalView.js`, sem mudança de dado
ou regra de negócio:

1. Busca e "Analisar" viram botões de ícone.
2. Cartão de sessão fechado enxuto.
3. Cabeçalho do grupo do dia em uma linha só.
4. Remoção do cartão de resumo diário duplicado.
5. Resumo semanal movido para o painel Analisar.
6. Barra de estatísticas de busca reduzida a uma linha.
7. Aviso de paginação parcial rebaixado a nota de rodapé.

## [Unreleased] — F14: da agenda ao ambiente diário de estudo

Roadmap completo da auditoria PX (`docs/F14-AUDITORIA-PX.md`): o app passa a
abrir no estudo, sugerir em vez de perguntar e fechar o dia.

- **F14.1 — Tela "Hoje" como porta de entrada** (`todayView.js`): novo
  destino inicial com os compromissos do dia, "Começar a estudar" e
  "Continuar: {último estudo}" — a Agenda vira segunda tela. Atalho `G H`.
- **F14.2 — Início de sessão sem digitação:** o modal de pré-início ganha
  chips de um toque (estudos recentes, compromisso de hoje, revisão pendente
  mais próxima) que preenchem ou selecionam sem teclado.
- **F14.3 — Reflexão no encerramento:** campo único opcional ("O que ficou
  desta sessão?") no modal de resumo, gravando direto em
  `studyReflectionService` — a reflexão deixa de exigir uma visita separada
  ao Diário.
- **F14.4 — "+1 questão" na superfície:** botão com contador direto no card
  da sessão ativa, sem abrir o painel lateral.
- **F14.5 — Progresso narrativo** (`progressNarrativeService.js`): a página
  Progresso troca a grade de 12+ stat-cards por um resumo de 2–3 frases;
  os números continuam atrás do disclosure "Ver números". A antiga página
  "Dashboard" é absorvida pela tela Hoje.
- **F14.6 — Silenciar o software:** cards espontâneos limitados a decisões
  acionáveis (`filterSpontaneousDecisions()`); o painel de IA consolida 6
  ações em 2 ("Planejar minha semana" / "Como estou indo").
- **F14.7 — Menos superfícies:** "Compromissos" vira a aba "Lista" da Agenda;
  o Diário passa a 2 abas; bottom nav Hoje/Agenda/Sessão/Diário/Mais.
- **F14.8 — Fechar o dia** (`closeDayService.js` +
  `sql/22_next_study_plan.sql`): recap de 15 segundos ao fim do dia e campo
  opcional para o primeiro estudo de amanhã, que reaparece como chip
  "Amanhã: {título}" no próximo início de sessão.
  `EXPECTED_SCHEMA_VERSION` 21 → 22.
- **F14.9 — Modo foco:** botão "Foco" oculta header/sidebar/bottom-nav
  durante a sessão ativa (puro CSS); Esc restaura, e finalizar/cancelar
  desliga automaticamente.

## [Unreleased] — F13.6: microinterações

Penúltima etapa do roadmap F13 (docs/F12-AUDITORIA-RADICAL-UX-UI.md): dá
feedback visual curto a ações que hoje são instantâneas e "secas" —
expandir/colapsar, trocar de aba, um item entrando numa lista, um contador
mudando. Nenhuma estrutura de dado, view ou regra de negócio mudou.

- `style.css` — `.content-reveal` (revelação de disclosures/skeleton→conteúdo)
  passa de 300ms (`var(--transition-slow)`) para 200ms, cumprindo o critério
  de aceite do F13.6 (todo toggle anima em ≤200ms); nova classe `.count-pulse`
  (pulso curto de escala+cor) para sinalizar que um número mudou; bloco
  `prefers-reduced-motion: reduce` passa a desligar também o pulso de contador
  e a rotação do chevron de disclosure.
- `transitionUtils.js` — novo helper `pulseUpdate(el)`, mesmo padrão
  remove→reflow→add de `revealWithAnimation()`/`revealPageWithAnimation()`.
- `studySessionView.js` — os contadores de Questões/Revisões (`(N)` no título
  da seção) pulsam quando o número muda; só o item recém-adicionado às
  listas anima a entrada (não a lista toda, que é re-renderizada por
  inteiro a cada mudança); trocar entre as abas "Novo estudo"/"Compromisso
  existente" do modal de início agora revela o painel com o mesmo efeito já
  usado em disclosures.
- `studyJournalView.js` — o contador de "Filtros avançados" pulsa quando a
  quantidade de filtros ativos muda; trocar entre as abas "Concluídas" e
  "Canceladas/Todas" revela a visão recém-mostrada em vez de trocar
  instantaneamente.

## [Unreleased] — F13.5: polimento visual (hierarquia por tipografia/espaço)

Última etapa do roadmap F13 (docs/F12-AUDITORIA-RADICAL-UX-UI.md) antes das
microinterações: reduz o número de blocos internos com moldura própria em
`style.css`, deixando borda reservada a elementos genuinamente clicáveis ou
independentes (cards de evento, tabs, inputs, itens de lista com ação
própria). Nenhuma estrutura de dado, view ou marcação HTML mudou — só regras
de CSS.

- `style.css` — remove `border` de painéis internos que já usam fundo
  (`--gray-50`) e espaçamento para se agrupar (`.session-stats`,
  `.sj-week-summary`, `.sj-milestones-panel`, `.sj-search-stats`,
  `.cat-row`, `.settings-row`, `.auth-email-display`, `.diag-item`,
  `.devmode-panel`, `.acal-row`, `.acal-ev-row`, `.wk-empty-tip`,
  `.onboarding-tour-card`, `.ai-result-body`, `.ai-plan-empty`,
  `.ai-evolution-item`, `.ss-question-item`, `.sj-entry`); em
  `.ai-plan-item` e `.smart-card`, a moldura completa dá lugar ao
  `border-left` de destaque (cor de prioridade/categoria) que já existia;
  `.settings-hint` passa de borda inteira para `border-left` de aviso.
- Contagem de `border:` em `style.css` cai de 70 para 49 (-30%, meta da
  auditoria F12 #8/critério de aceite do F13.5), sem remover nenhuma ação ou
  caminho existente — apenas a moldura visual.

## [Unreleased] — F13.1: redução da carga cognitiva da Sessão ativa

Primeira etapa do roadmap F13 (docs/F12-AUDITORIA-RADICAL-UX-UI.md), que
ataca excesso de componentes visíveis por padrão em vez de bugs. O contexto
da sessão ativa (`<dl class="ss-context">`) sempre mostrou 6 linhas de uma
vez, várias com "—" quando a sessão não tinha aquele dado — a tela mais
usada do produto carregava metadado que não se aplicava à maioria das
sessões.

- `index.html`/`studySessionView.js` — só **Compromisso** e **Categoria**
  ficam visíveis por padrão no card de sessão ativa; **Conteúdo**, **Data**,
  **Horário de início** e **Tempo previsto** entram atrás de um disclosure
  "Mais detalhes" (mesmo padrão `aria-expanded`/"Mostrar"↔"Ocultar" já usado
  em Questões/Revisões), que nasce fechado a cada sessão nova. Cada linha
  (incluindo Categoria, que pode ficar sem valor) só é renderizada quando há
  dado real — nenhuma volta a exibir "—".
- Removida a distinção "Sem compromisso vinculado" vs. "—" (`_eventFieldText`/
  `NO_EVENT_TEXT`): como a linha some quando vazia, a diferenciação textual
  deixou de ser necessária — o título da sessão continua com o fallback
  "Sessão sem compromisso" para o caso de sessão avulsa sem contexto.
- `tests/views/studySessionView.test.js` — testes atualizados para a nova
  expectativa (linha oculta em vez de rótulo/traço) e um teste novo cobrindo
  o disclosure "Mais detalhes".

## [Unreleased] — Modal de configuração pré-início da Sessão de Estudo

Corrige o único ponto de entrada do fluxo "Sessão de Estudo" ("Iniciar sessão
avulsa"): antes, a sessão começava imediatamente ao clicar, sem nenhuma etapa
de configuração — Compromisso/Categoria/Conteúdo/Data/Tempo previsto ficavam
em branco pelo resto da sessão sempre que ela não vinha de um compromisso já
existente (`event_id` nulo).

- `studySessionView.js` — "Iniciar sessão" agora sempre abre um modal de
  configuração pré-início (`#ss-start-modal`) com dois caminhos mutuamente
  exclusivos: digitar livremente um **nome do estudo** (aba "Novo estudo",
  campo obrigatório, mais categoria/conteúdo/data/tempo previsto opcionais)
  ou selecionar um **compromisso já existente na agenda** (aba "Compromisso
  da agenda", populada a partir de `eventService.getEvents()` — reaproveita
  exatamente `startSessionForEvent()`, o mesmo caminho já usado pelo botão
  "Iniciar Sessão" do formulário de compromisso). A sessão só é criada ao
  confirmar o modal, nunca ao simples clique em "Iniciar sessão".
- `sql/21_activity_sessions_standalone_fields.sql` — `activity_sessions`
  ganha `title`, `content`, `session_date` e `planned_duration_minutes`
  (todas nullable), preenchidas apenas no caminho "Novo estudo" — uma sessão
  vinculada a um compromisso continua resolvendo os mesmos dados a partir de
  `events` via `event_id`, sem nenhuma duplicação. Bump de
  `schemaService.EXPECTED_SCHEMA_VERSION` para 21.
- `_resolveEventMeta()`/`_eventFieldText()` (studySessionView.js) passam a
  reconhecer as duas fontes de contexto (compromisso vinculado ou campos
  digitados no modal) — só uma sessão avulsa do formato antigo (sem
  `event_id` e sem `title`) continua mostrando o aviso "Sem compromisso
  vinculado".

---

## [Unreleased] — Auditoria completa de lifecycle (init ↔ reset) das Views (PR4)

Segue a mesma auditoria de simetria init/reset (A1.3) que já havia corrigido
Agenda Semanal e Calendário mensal, agora estendida a todas as demais Views —
sem tocar em regra de negócio, arquitetura, banco, serviços ou Event Bus. Cada
gap encontrado era do mesmo tipo: dado do usuário anterior permanecendo no DOM
(às vezes só oculto, nunca visível de fato) ou em cache de módulo, durante a
janela entre o logout e o próximo login — nesta SPA sem reload de página, um
reset incompleto abre espaço para vazamento entre sessões de usuários
diferentes.

- `activityHistoryView.js` — `resetActivityHistoryView()` passa a limpar
  também a lista renderizada (`listEl`), o estado vazio/"carregar mais" e as
  caches `_eventsById`/`_categoriesById`, além de `_offset`/`_status`.
- `activityDashboardView.js` — `resetActivityDashboardView()` passa a limpar
  os cards de execução e os cards inteligentes renderizados.
- `insightsView.js` — `resetInsightsView()` passa a limpar os cards, erros e
  avisos renderizados nos quatro blocos (Execução/Metas/Revisões/
  Produtividade).
- `assistantView.js` — `resetAssistant()` só zerava a flag de "assistente
  oculto"; agora também limpa a cache `_lastEvents` e o DOM já renderizado,
  e esconde a seção — sem isso, um clique em "Mostrar Assistente" logo após
  o logout reexibia os cards do usuário anterior.
- `studySessionView.js` — `resetStudySessionView()` já zerava o estado e
  escondia a seção ativa, mas deixava o texto (título, categoria, horários)
  e os campos/listas do modal de encerramento presentes no DOM, só ocultos;
  agora tudo é limpo explicitamente.
- `categoryView.js` — `resetCategories()` só zerava a cache; como o modal de
  categorias é apenas ocultado no logout (nunca fechado via `modal.close()`),
  a lista renderizada e o `<select>` de categoria do formulário de
  compromisso ficavam com os dados do usuário anterior até a próxima
  abertura do modal. Agora ambos são limpos.

Os demais módulos auditados (`weekView.js`/`calendar.js` — já corrigidos em
F9 —, `eventFormView.js`, `accountView.js`, `aiPanelView.js`,
`academicCalendarView.js`, `notificationService.js`, `pushService.js`,
`studyJournalView.js`) já tinham simetria completa init/reset. `navigationView.js`,
`settingsModal.js` e `diagnosticModal.js` são inicializados uma única vez no
carregamento da página (não a cada login) e não mantêm dado de usuário em
cache — fora do escopo desta correção.

Testes novos em `tests/views/{activityHistoryView,activityDashboardView,
insightsView,studySessionView,categoryView}.test.js` e no novo
`tests/views/assistantView.test.js` reproduzem cada vazamento antes da
correção.

## [Unreleased] — F9: limpeza completa da Agenda Semanal e do Calendário no logout

Correção de simetria init/reset (auditoria A1.3): no logout, a Agenda Semanal
e o Calendário mensal eram os únicos subsistemas que não descartavam o
conteúdo já renderizado nem o estado em memória — os compromissos do usuário
anterior (títulos, chips, dica de IA e plano da semana) permaneciam no DOM, e
o cache `_weeklyPlan` na memória, durante toda a janela entre o logout e o
próximo login, nesta SPA sem reload de página.

- `weekView.js` — `destroyWeekView()` passa a limpar também o DOM renderizado
  (grade, dica contextual e plano da semana) e o estado do módulo
  (`_cbs`, `_mon`, `_weeklyPlan`, `_planExpanded`, providers injetados), além
  do timer da linha do agora que já limpava.
- `calendar.js` — ganha `resetCalendar()` (não existia reset algum), que limpa
  o DOM da grade do mês e zera o estado do módulo; `refreshCalendar()` volta a
  ser no-op até o próximo `initCalendar()`.
- `script.js` — `resetCalendar()` entra na cadeia `onBeforeSignOut`, junto dos
  demais resets.

Nenhuma API pública foi alterada (`destroyWeekView` mantém contrato; providers
e callbacks já eram re-registrados a cada `_initApp`). Nenhum domínio foi
tocado. Testes novos em `tests/views/weekView.test.js` e
`tests/views/calendar.test.js` reproduzem o vazamento antes da correção.

## [Unreleased] — F8.5: Linha do Tempo da Evolução (Diário de Estudos)

Adiciona uma camada narrativa sobre o Diário de Estudos (`studyJournalView.js`,
F8.1-F8.4): além de responder "o que estudei?", a tela passa a responder "como
minha evolução aconteceu ao longo do tempo?" com resumos automáticos de dia e
de semana, e pequenos indicadores de evolução entre um dia e o anterior.

Toda a agregação vive em `studyTimelineService.js` (novo, função pura, sem
I/O) — mesma filosofia de `computeDashboardIndicators()` em
`activityDashboardService.js`/F2.1: separa o cálculo puro do ponto onde os
dados são buscados. Agrupamento semanal reaproveita `mondayOf()`/`isoDate()`
de `utils.js`, a mesma dupla já usada por `activityDashboardService.js` para
"semana" — nenhuma numeração de semana ISO é inventada. "Dia estudado" e
"maior sequência de dias consecutivos" seguem o mesmo conceito de
`studyStreakService.js`, e "matéria" o mesmo de `subjectProgressService.js`,
mas recalculados sobre as entradas já carregadas por `studyJournalView.js`
(sessão + questões + revisões, já buscadas para os cartões) em vez de chamar
essas services — que buscariam todo o histórico do banco de novo. Isso
garante que os resumos só consideram as sessões atualmente visíveis após os
filtros do F8.4, sem nenhuma consulta adicional.

Os cartões (`.sj-daily-summary` dentro do próprio `<li class="sj-day-group">`,
`.sj-week-summary` como `<li>` entre grupos) são elementos novos que nunca
substituem `.sj-day-group`/`.sj-entry` nem alteram seu conteúdo. Nenhum dado é
persistido, nenhum domínio (`activitySessionService.js`, `sessionEventBus.js`,
Dashboard, Insights, Achievement, Study Streak, Subject Progress, Question
Service, Reflection Service, Review Service) foi alterado.

`service-worker.js` (APP_SHELL) regenerado via `npm run build:app-shell`
(inclui `studyTimelineService.js`) e `CACHE_VERSION` incrementada.

## [Unreleased] — F7.5: Revisões Espaçadas no Pós-Sessão

Move definitivamente o fluxo de Revisões da tela "Editar Compromisso" para o
pós-sessão, alinhando a interface à arquitetura da F6.1 (Compromisso =
planejamento, Sessão = execução, Revisão = consequência do estudo realizado).

`eventFormView.js`/`index.html` perdem toda a seção de Revisões (listas de
pendentes/concluídas, "Gerar revisões", Concluir/Ignorar) — apenas interface:
nenhuma regra de domínio foi removida (`reviewService.js` intocado).

O resumo de encerramento da Sessão (`studySessionView.js`, F7.3/F7.4) ganha a
etapa opcional **Revisões**, entre Questões e Confirmar: o usuário pode criar
uma revisão nova (data livre, disponível quando a sessão tem compromisso
vinculado — `reviewService.create()` exige `event_id`), associar uma revisão
pendente existente (`reviewService.listPending()`), ou ignorar a etapa. Nada é
persistido antes da confirmação — mesmo contrato das Questões. Todo vínculo
Sessão↔Revisão passa exclusivamente por
`reviewSessionService.associateReview()`; nenhum `session_id` é manipulado
diretamente e nenhum CRUD novo foi criado.

Ordem de persistência na confirmação: Questões → Revisões (criação +
associação) → `finishSession()` — a Sessão continua sendo a entidade raiz e
`SessionFinished` continua sendo o único evento emitido ao final
(`activitySessionService.js` e `sessionEventBus.js` intocados). Dashboard,
Insights, IA, Recommendation, Reflection, Planning, Decision Engine,
Achievement, Study Streak e Subject Progress não foram alterados.

`service-worker.js` (APP_SHELL) regenerado via `npm run build:app-shell`
(inclui `reviewSessionService.js`) e `CACHE_VERSION` incrementada.

## [Unreleased] — F7.2: Tela "Sessão de Estudo" (Execução da Sessão)

Transforma a página "Sessão de Estudo" de placeholder na tela oficial de
execução de sessões — o cronômetro global flutuante (`activitySessionView.js`,
F1.3) é removido e substituído por `studySessionView.js`, renderizado na nova
página estática `#page-study-session` (nav lateral, entre Compromissos e
Assistente IA). Nenhuma regra de negócio foi movida ou duplicada: a tela só
reflete `activitySessionService.js` (start/pause/resume/finish/cancel) e se
mantém sincronizada assinando os seis eventos de `sessionEventBus.js`
(SessionStarted/Paused/Resumed/Finished/Cancelled/Updated, F6.2) — sem
polling, sem recarga completa, sem evento novo.

Máquina de estados explícita com apenas as ações válidas por estado: **Sem
sessão** (iniciar sessão avulsa), **Executando** (Pausar, Finalizar) e
**Pausada** (Continuar, Cancelar, Finalizar) — nunca mistura ações
incompatíveis. O contexto do compromisso vinculado (título, categoria,
horário de início, tempo previsto) é resolvido a partir do `event_id` da
sessão (mesmo princípio de exibição do widget antigo), e o cronômetro
(tempo líquido) é o elemento visual principal da página. Os campos Matéria/
Conteúdo/Objetivo citados na especificação ainda não têm campo próprio no
domínio (`activity_sessions`/`events`); a tela já reserva o layout para eles,
hoje preenchidos com a categoria/descrição do compromisso ou "—" quando não
há dado correspondente.

`eventFormView.js` ("Iniciar Sessão" no formulário de compromisso) agora
importa `startSessionForEvent` de `studySessionView.js` e navega para a nova
página após iniciar a sessão com sucesso, em vez de apenas fechar o modal.
Reload/login reconstrói corretamente uma sessão em andamento (mesma garantia
de compatibilidade do widget antigo) — nenhuma sessão nova é iniciada
silenciosamente. Dashboard, Histórico, Central de Insights, IA e demais
consumidores do domínio não foram alterados.

`service-worker.js` (APP_SHELL) regenerado via
`npm run build:app-shell` e `CACHE_VERSION` incrementada.

`tests/views/activitySessionView.test.js` (widget removido) é substituído por
`tests/views/studySessionView.test.js`, com os mesmos cenários (idle/
executando/pausada, erro de domínio, restauração ao reload, conflito de
sessão simultânea) mais os específicos desta etapa (estados/ações válidas,
reação a eventos publicados por outro fluxo, `resetStudySessionView()` no
logout). Suíte completa: 831 testes, todos passam.

---

## [Unreleased] — F6.11: Domínio de Constância (Study Streak)

Novo `studyStreakService.js`: serviço puro que deriva sequência de dias
estudados exclusivamente a partir de Sessões (`activitySessionService`) —
segue a arquitetura da F6.1 (Constância nunca é persistida: não existe
tabela "streak", nem contador salvo no banco, nem SQL novo). Sem
persistência, sem eventos, sem cache permanente — cada chamada recalcula a
partir das sessões correntes. Nenhum consumidor (Dashboard, Central de
Insights, Histórico, IA, Recommendation, Planning, Reflection, Decision
Engine, User Memory, Subject Progress, Questões, Revisões, Conquistas) foi
conectado ou alterado nesta etapa; nenhuma tela mudou.

Regras: só sessões `status = "finished"` contam como dia estudado;
canceladas e pausadas são ignoradas; múltiplas sessões no mesmo dia contam
como um único dia. "Dia estudado" é o dia civil local (não UTC) de
`started_at`, para uma sessão à noite não vazar para o dia seguinte em
fusos a oeste de UTC.

APIs públicas: `getCurrentStreak()`, `getLongestStreak()`, `getStudyDays()`,
`getStudyCalendar()` e `getStreakSummary()` (sequência atual, maior
sequência, total de dias estudados, último dia estudado e dias desde o
último estudo, em uma única chamada). Não calcula conquistas, níveis, XP
ou gamificação — pertencem ao domínio Conquistas, etapa futura.

15 novos testes em `tests/services/studyStreakService.test.js` (nenhum
estudo, um único dia, dias consecutivos, quebra de sequência, múltiplas
sessões no mesmo dia, sessões canceladas/pausadas/em andamento, isolamento
por usuário, calendário, resumo consolidado). Suíte completa: 551 testes,
527 passam (as 24 falhas restantes já existiam antes desta etapa, em
arquivos não relacionados — confirmado comparando a mesma suíte antes e
depois desta mudança).

---

## [Unreleased] — F6.10: Integração Sessão ↔ Revisão

Nova migration `sql/16_review_session_link.sql`: `reviews.session_id`
(nullable) + FK para `activity_sessions(id)` `ON DELETE SET NULL`. FK do
lado "N" da relação 1:N (uma Sessão pode cobrir várias Revisões; uma
Revisão aponta para no máximo uma Sessão), nullable porque a associação é
opcional nos dois sentidos, e `SET NULL` (não `CASCADE`) porque Sessão e
Revisão são dois ciclos de vida independentes — excluir a Sessão que
executou uma Revisão não apaga a Revisão, só a referência de "quem a
executou". Sem bump de `schema_version`, mesmo critério de
`15_questions.sql`: nenhum consumidor visual foi conectado nesta etapa.

Novo `reviewSessionService.js`: camada de integração mínima entre
`reviewService` (ciclo de revisão) e `activitySessionService` (ciclo de
vida da Sessão) — `associateReview()`, `unlinkReview()` e
`getReviewSession()`. Nenhum CRUD duplicado, nenhuma regra de Dashboard,
Central de Insights, IA, Recommendation, Planning, Reflection, Decision
Engine, User Memory, Subject Progress, Questões ou Conquistas. Nenhum
evento novo — `sessionEventBus.js` não foi alterado. Nenhuma tela
alterada.

24 novos testes: `tests/services/reviewSessionService.test.js` (15 — mocka
`reviewService`/`activitySessionService`/`supabase.js` inteiros, isola só a
orquestração) e `tests/integration/reviewSessionIntegration.test.js` (9 —
usa os services reais contra `supabase.js` mockado, cobrindo associação,
desassociação, sessão/revisão inexistente, isolamento entre usuários, leitura
da associação e o contrato de `ON DELETE SET NULL`). Suíte completa:
798/798 passam.

---

## [Unreleased] — F6.9: Agregação por Matéria (Projection)

Novo `subjectProgressService.js`: projeção pura que consolida Sessões
(`activitySessionService`) e Questões (`questionService`) por matéria, sem
gravar nada no banco, sem cache permanente e sem eventos próprios — segue a
arquitetura da F6.1 (Sessão e Questão são fatos; progresso é derivado, nunca
persistido). Nenhum consumidor (Dashboard, Central de Insights, IA,
Recommendation, Planning, Reflection, Decision Engine, User Memory,
Conquistas) foi conectado ou alterado nesta etapa.

Como `activity_sessions` não tem campo de matéria (só `category_id`), a
matéria de uma sessão é resolvida através do compromisso que a originou:
quando a sessão tem `event_id`, usa-se `events.category` (texto livre já
existente) — daí `eventService` entrar como fonte de dados. Sessões sem
`event_id` e questões sem `subject` caem no grupo "sem matéria". Nenhuma
tabela, coluna ou SQL novo.

APIs públicas: `listSubjectsProgress()`, `getSubjectProgress(subject)` e
`getOverallProgress()` — tempo total estudado, número de sessões (com
contagem por status finalizado/cancelado), número de questões, última
sessão, última atividade e status geral (`sem_atividade` /
`em_andamento` / `com_atividade`). Não calcula percentual de acerto,
desempenho, ranking, conquistas ou constância — ficam para serviços
próprios em etapas futuras.

23 novos testes em `tests/services/subjectProgressService.test.js` (matéria
sem sessões, múltiplas sessões, questões, múltiplas matérias, ordenação,
agregações, sessões canceladas/finalizadas/em andamento, isolamento por
usuário). Suíte completa: 774/774 passam.

---

## [Unreleased] — F5.3: Modernização do Layout, Navegação e Responsividade

Mudança puramente visual/estrutural sobre a casca compartilhada do app (header,
sidebar, bottom nav, container de página) — sem alterar regras de negócio,
services, banco, Edge Functions, IA ou fluxos existentes. Nenhuma rota, ID ou
comportamento de navegação foi alterado; `navigationView.js` permanece
intocado.

**Auditoria (Etapa 1):** o container de página (`.app-page`, `max-width: 960px`)
e o padrão de cabeçalho (`.page-header` + `.page-title`) já eram únicos e
reutilizados pelas 6 páginas do app (Agenda, Calendário, Compromissos,
Dashboard, Histórico, Insights) — nenhuma divergência de largura ou de
cabeçalho entre páginas foi encontrada. As lacunas reais estavam em três
pontos: (1) a escala de espaçamento e os tokens do design system (F5.1) nunca
tinham sido aplicados à própria casca — header, sidebar, conteúdo e página
usavam valores literais em vez de `var(--space-*)`; (2) não havia nenhum
tratamento de `env(safe-area-inset-*)`, nem `viewport-fit=cover`, então o
header, a bottom nav, o drawer da sidebar, o toast e o widget do assistente
inteligente ficam sob o notch/Dynamic Island/barra de gestos em iPhones e
Androids recentes; (3) os z-index da casca (header, overlay, sidebar,
bottom nav, menu do usuário, loading) eram números mágicos duplicados em
vários pontos do arquivo.

**Container principal e espaçamento (Etapas 2 e 5):** novo token
`--container-max-width: 960px` substitui o valor fixo em `.app-page`; `header`,
`sidebar`, `app-content`, `page-header` e `.card`/`.login-wrap` migrados para
`var(--space-*)` (com um novo degrau `--space-7: 2rem` para casar com o
padding do `.card`, já usado por login/semana/calendário/assistente/dashboard)
— zero mudança de valor visual, só substituição de literal por token.

**Safe areas (Etapa 8):** `viewport-fit=cover` adicionado ao `<meta
viewport>`; quatro novos tokens `--safe-top/right/bottom/left` (com fallback
`0px`) e dois tokens derivados, `--header-total-h` e `--bottom-nav-total-h`,
que somam a inset correspondente à altura fixa existente. Aplicados em
`.app-header` (altura + padding-top), `.bottom-nav` (altura + padding),
`.app-sidebar` (offset do drawer mobile e padding lateral/inferior),
`.app-layout` e `.app-content` (cálculos de altura/padding que dependiam de
`--header-h`/`--bottom-nav-h` passam a usar as versões "-total-h"),
`.toast-container` e `.as-widget` (que flutuam sobre a bottom nav). Testado
simulando insets de notch (47px topo / 34px rodapé) via override direto das
custom properties: header, bottom nav e drawer se ajustam corretamente, sem
sobreposição de conteúdo.

**Consistência de z-index (Etapa 10):** seis tokens (`--z-header`,
`--z-bottom-nav`, `--z-sidebar-overlay`, `--z-sidebar`, `--z-dropdown`,
`--z-loading`) substituem os números mágicos equivalentes já usados pela
casca — mesmos valores, mesmo empilhamento, agora nomeados. Os z-index de
componentes de página (modais, widgets, listas) não foram tocados, por estarem
fora do escopo desta etapa.

**Scroll e navegação (Etapas 3 e 7):** auditados e mantidos como estavam —
o app já usa o padrão de painéis com scroll independente (`.app-sidebar` e
`.app-content` cada um com seu próprio `overflow-y: auto`, `.app-layout` sem
scroll próprio), sem scrolls concorrentes; os estados de hover/focus-visible/
active de `.nav-item` e `.bottom-nav-item` (herdados do F5.2) já cobriam os
critérios pedidos. Nenhuma mudança de rota ou de estrutura de navegação foi
necessária.

**Validação:** `npm test` — 645/645 passam (nenhum teste depende de valor de
CSS). `npm run check:app-shell` — lista de módulos do service worker
inalterada. Verificação visual com Playwright/Chromium em três larguras
(390px mobile, 820px tablet, 1440px desktop) e com insets de notch simulados,
cobrindo header, sidebar (rail, colapsada e drawer), bottom nav e container de
página — sem overflow, sem scroll horizontal, sem elementos cortados.

### Arquivos alterados
- `style.css` — tokens novos (`--container-max-width`, `--space-7`, `--z-*`,
  `--safe-*`, `--header-total-h`, `--bottom-nav-total-h`) e migração da casca
  compartilhada (header, sidebar, bottom nav, app-content, app-page,
  page-header, login/card, toast, widget do assistente) para os tokens do
  design system.
- `index.html` — `viewport-fit=cover` no `<meta name="viewport">`.

---

## [Unreleased] — F3.3: Planejamento Assistido (Planning Engine)

Nova ação no Painel IA, "Gerar Plano da Semana": `planningService.js` interpreta
o Context Engine já existente (`aiContextService.js`, F3.1/F3.2) e produz uma
lista estruturada de sugestões (tipo, prioridade, categoria, tempo sugerido,
data sugerida, motivo e confiança), sem chamar o Gemini, sem consultar o
Supabase diretamente e sem recalcular nenhum indicador — tudo já vem pronto de
`eventService`, `activityDashboardService`, `reviewService` e
`activitySessionService`/`activitySessionStats`, do mesmo jeito que
`recommendationEngine.js` (F3.2) já faz para as Recomendações.

Nenhuma ação do plano cria evento, grava dado no banco ou dispara notificação —
o usuário decide tudo. Nenhuma alteração no Context Engine, no Recommendation
Engine, nas Edge Functions ou nos prompts já existentes. 21 novos testes em
`tests/planningService.test.js` (usuário novo, agenda vazia/cheia, metas
atingidas/atrasadas, muitas revisões/sessões, categorias negligenciadas,
contexto parcial, sanitização e estabilidade do planejamento) + 3 novos em
`tests/views/aiPanelView.test.js` para o painel.

---

## [Unreleased] — F2.7: UX, Responsividade e Manutenibilidade (A5 + M7 + M8 + M9 + B1–B9)

### Validado em 2026-07-03

| Item | Descrição                                                                 | Status    |
|------|----------------------------------------------------------------------------|-----------|
| A5   | Agenda semanal força scroll horizontal em telas pequenas                  | Corrigido |
| M7   | Contraste insuficiente (`--gray-400`, 2.54:1) em textos/ícones secundários | Corrigido |
| M8   | Domínios "configurações" e "diagnóstico" ainda em `script.js`             | Corrigido |
| M9   | Lembretes locais não reagendavam com o app aberto por vários dias         | Corrigido |
| B1–B9 | CSS duplicado, comentários mortos, `aria-hidden`, código morto, DOM cache, `escapeHtml`, campo `theme` | Corrigido |

**A5 — Detalhes:** `.wk-head-row`, `.wk-allday-row` e `.wk-body` fixavam `min-width: 480px`
dentro de `.wk-scroll { overflow-x: auto }`, forçando scroll horizontal em qualquer viewport
abaixo de ~504px (a maioria dos celulares). Adicionado um bloco `@media (max-width: 767px)`
(o mesmo breakpoint "mobile" já usado pelo resto do app) que troca para
`grid-template-columns: 34px repeat(7, minmax(0, 1fr))` e remove o `min-width` fixo — as
colunas agora encolhem para caber na tela, com fonte e gutter reduzidos para manter a
legibilidade. Nenhuma mudança na estrutura de 7 colunas ou no comportamento em desktop/tablet.

**M7 — Detalhes:** `--gray-400` (`#9ca3af`) rende 2.54:1 de contraste sobre fundo branco —
abaixo do mínimo WCAG AA (4.5:1 para texto normal, 3:1 para ícones de UI). Usado como `color`
em 24 seletores (textos secundários, estados vazios, badges, botões de fechar, itens de
navegação). Todos migrados para `--gray-500` (`#6b7280`, 4.83:1 — passa AA), variável já
existente no design system. As 2 ocorrências de `border-color`/`border-left-color` (decorativas,
não textuais) foram mantidas.

**M8 — Detalhes:** Extraídos `diagnosticModal.js` (zero estado compartilhado) e
`settingsModal.js` (modo desenvolvedor injetado via callback, seguindo o plano documentado em
`docs/MODULARIZACAO_SCRIPT.md`). `script.js` caiu de 649 para ~390 linhas. Nenhum comportamento
alterado — testado com uma nova suíte (`tests/views/settingsModal.test.js`, 6 casos) cobrindo
abrir/fechar, toggle de notificações, transição configurações → diagnóstico, escaping do
diagnóstico e o modo desenvolvedor.

**M9 — Detalhes:** `scheduleReminders()` recalculava a janela de 7 dias apenas quando chamada
(login, CRUD, toggle de configurações) — com o app aberto por vários dias sem recarregar, eventos
que "entravam" na janela nunca eram agendados. Adicionado um `setInterval` (6h) guardado contra
duplicação que reexecuta `scheduleReminders()` com a última lista de eventos conhecida,
deslizando a janela adiante automaticamente.

**B1–B9 — Detalhes:** regra `#event-list` duplicada e `.app-sidebar` dividida em dois blocos
(mesclados); 2 comentários de CSS morto removidos; `aria-hidden="true"` adicionado a ~15
ícones decorativos (nav, bottom-nav, painel IA, ícones de sucesso, SVGs); removidas 4 funções
mortas sem nenhum call site (`getErrorLog`, `getEventLog`, `getCachedCalendars`, `truncate` —
esta última também removida de `tests/utils.test.js`); referências DOM de busca/filtro/ordenação
da lista de compromissos cacheadas em `script.js`; `escapeHtml()` aplicado aos 3 campos de status
do diagnóstico que ainda iam direto para `innerHTML`; campo `profiles.theme` documentado em
`profileService.js` (aceito no allowlist para não quebrar upserts futuros, mas sem seletor de
tema na UI ainda).

### Arquivos modificados
- `style.css` — A5 (mobile), M7 (contraste), B1 (CSS duplicado)
- `script.js` — M8 (extração), B6 (cache DOM)
- `settingsModal.js`, `diagnosticModal.js` — M8 (novos módulos)
- `notificationService.js` — M9 (reagendamento periódico)
- `index.html` — B3 (`aria-hidden`)
- `academicCalendarView.js`, `errorService.js`, `telemetryService.js`, `utils.js` — B4 (código morto)
- `profileService.js` — B8 (campo `theme` documentado)
- `service-worker.js` — lista `APP_SHELL` regenerada (`npm run build:app-shell`) para incluir os 2 módulos novos
- `tests/utils.test.js` — remove os testes de `truncate()`
- `tests/views/settingsModal.test.js` — nova suíte para M8
- `docs/MODULARIZACAO_SCRIPT.md` — status atualizado

### Impacto
Nenhuma regra de negócio, endpoint, tabela ou Edge Function foi alterada. Todas as mudanças são
de CSS, organização de módulos front-end e um `setInterval` client-side — comportamento
observável preservado (106/106 testes automatizados verdes, incluindo 6 novos casos).

---

## [Unreleased] — Auditoria Backend P1.3: Integridade de notification_logs

### Validado em 2026-07-02

| Item | Descrição                                                        | Status      |
|------|-------------------------------------------------------------------|-------------|
| P1.3 | `notification_logs.event_id` sem FK para `events.id` permitia logs órfãos ao excluir um evento | Corrigido |

**P1.3 — Detalhes:** `notification_logs.event_id` não tinha chave estrangeira para `events.id`.
Como usuários não têm política de `DELETE` sobre `notification_logs` (só `SELECT`) e o Edge Function
`send-push-notifications` nunca revisita eventos já excluídos, as linhas de log de um evento apagado
via `eventService.deleteEvent` ficavam órfãs indefinidamente. Corrigido pela migration
`sql/09_notification_logs_integrity.sql`, que remove logs órfãos pré-existentes e adiciona
`FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE` — o mesmo padrão já usado nas
demais FKs do projeto. Eventos recorrentes continuam funcionando normalmente: cada ocorrência
permanece uma linha própria em `notification_logs` (chave `user_id + event_id + event_date`),
todas apontando para o mesmo `event_id` da linha-base em `events`. Validado localmente em Postgres:
limpeza de log órfão pré-existente, rejeição de novo `event_id` inexistente, e cascade-delete de
múltiplos logs de ocorrências ao excluir o evento-base.

---

## [Unreleased] — Etapa 4.1: Correções de Segurança e Robustez

### Validado em 2026-06-29

| Bug     | Descrição                                               | Status      |
|---------|---------------------------------------------------------|-------------|
| BUG-011 | `console.log` em `auth.js` expõe e-mail do usuário     | Corrigido   |
| BUG-014 | Toast injeta mensagem via `innerHTML` (XSS potencial)  | Corrigido   |
| BUG-015 | Botão "Salvar" de categoria sem disabled durante async  | Corrigido   |

**BUG-011 — Detalhes:** Três chamadas de `console.log`/`console.error` dentro de `signUp()` em `auth.js`
logavam o e-mail do usuário, o objeto de erro da API e dados internos da resposta (user_id, session,
identities) no console do navegador em produção. Removidas as três linhas; a função agora é idêntica
a `signIn()` em termos de logging (nenhum).

**BUG-014 — Detalhes:** `showToast()` em `toastService.js` montava o HTML do toast com `innerHTML`,
interpolando `${message}` diretamente. Qualquer mensagem contendo HTML (ex: vindo de uma API externa)
seria renderizada como markup. Corrigido: o template agora cria `<span class="toast-message"></span>`
vazio via `innerHTML` (apenas conteúdo estático/confiável), e a mensagem é atribuída separadamente via
`el.querySelector('.toast-message').textContent = message` — `textContent` trata qualquer string como
texto puro, nunca como HTML.

**BUG-015 — Detalhes:** O botão "Salvar" na edição inline de categoria em `script.js` não era
desabilitado durante a operação assíncrona `updateCategory()`. Um duplo clique disparava duas chamadas
simultâneas ao Supabase para o mesmo registro. Corrigido com o padrão já usado nos demais formulários
da aplicação: `catSaveBtn.disabled = true` antes do `await`, restaurado para `false` no `catch`.
No fluxo de sucesso, o botão é destruído junto com a linha de edição pelo `renderCatList()`.

### Arquivos modificados
- `auth.js` — removidos 3 `console.log`/`console.error` de debug em `signUp()`
- `toastService.js` — mensagem do toast movida de `innerHTML` para `textContent`
- `script.js` — `catSaveBtn.disabled = true/false` adicionado em `enterEditMode()`

---

## [Unreleased] — Etapa 3: Correção dos Bugs de Alta Severidade

### Validado em 2026-06-29

| Bug    | Descrição                                       | Status                               |
|--------|-------------------------------------------------|--------------------------------------|
| BUG-007 | Spinner "Consultando o Gemini" infinito após erro | Corrigido por dependência (BUG-002) |
| BUG-008 | Modal de Categorias com overflow horizontal     | Corrigido                            |
| BUG-009 | Menu do usuário inacessível                     | Corrigido por dependência (BUG-001)  |
| BUG-010 | Botão "Atualizar agora" sem feedback            | Corrigido                            |

**BUG-007 — Detalhes:** O spinner é encerrado em todos os caminhos de erro por meio do
`showResult()` chamado nos blocos `catch` de `runAIAction()`. O `finally` garante que os botões
sejam reativados. A correção de BUG-002 (Etapa 1) já cobria este caso: ambos os bugs envolvem
o mesmo fluxo assíncrono da IA.

**BUG-008 — Detalhes:** Dois problemas distintos. (1) A sobreposição do painel IA foi eliminada
pela correção de BUG-001 (`.ai-panel[hidden]{display:none}`), pois o painel (`z-index:201`)
sobrepunha o modal (`z-index:100`) mesmo quando deveria estar oculto. (2) O overflow horizontal
no seletor de cores era causado por `flex:1` sem `min-width:0` nos inputs dentro de `.cat-form-row`
e `.cat-edit-name` — o navegador não os deixava encolher abaixo da largura intrínseca.
Correção: `min-width:0` adicionado a ambos e `overflow:hidden` adicionado a `.modal-card`.

**BUG-009 — Detalhes:** O dropdown do usuário (`z-index:200`) era bloqueado pelo `.ai-panel`
(`position:fixed; z-index:201; display:flex`) que permanecia visível mesmo com o atributo
`[hidden]`. A correção de BUG-001 (Etapa 1) eliminou o bloqueio por completo.

**BUG-010 — Detalhes:** O botão "Atualizar agora" executava `window.location.reload()` imediatamente
após `postMessage({type:'SKIP_WAITING'})`, sem qualquer indicação visual de que algo estava
acontecendo. Corrigido: ao clicar, o botão exibe "Atualizando…" e é desabilitado; o reload
é disparado pelo evento `controllerchange` do Service Worker (padrão recomendado), garantindo
que o reload ocorra apenas após o novo SW tomar o controle.

### Arquivos modificados
- `style.css` — `overflow:hidden` em `.modal-card`; `min-width:0` em `.cat-edit-name` e `.cat-form-row input[type="text"]`
- `pwa.js` — feedback visual no botão "Atualizar agora"; reload via `controllerchange`

---

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased] — Etapa 2: Validação dos bugs críticos remanescentes

### Validado em 2026-06-29

Revalidação de todos os bugs críticos após as correções da Etapa 1.
Nenhuma regressão detectada. Nenhum bug adicional encontrado.

| Bug    | Descrição                                  | Status                          |
|--------|--------------------------------------------|---------------------------------|
| BUG-001 | Painel IA não fecha (X, ESC, overlay)     | Corrigido (Etapa 1)             |
| BUG-002 | Erro PostgREST trava painel IA            | Corrigido (Etapa 1)             |
| BUG-003 | Tela de login coexiste com app autenticado | Corrigido (Etapa 1)            |
| BUG-004 | Credenciais hardcoded em setup-push.sh    | Corrigido (Etapa 1)             |
| BUG-005 | Botão "+ Novo compromisso" inacessível    | Corrigido por dependência (BUG-001) |
| BUG-006 | Menu "Calendários" não exibe conteúdo     | Não reproduzido                 |

**BUG-005 — Detalhes:** O bloqueio do botão era causado pelo `.ai-panel`
permanecer visível (`display:flex`) mesmo com o atributo `[hidden]` presente,
pois a regra CSS sobrescrevia o comportamento padrão do HTML. A correção de
BUG-001 (`.ai-panel[hidden] { display: none }`) resolveu o problema: o painel
IA não bloqueia mais interações quando fechado.

**BUG-006 — Detalhes:** O botão "Calendários" (`#btn-academic-cals`) abre
corretamente o modal `#academic-overlay` via `openAcademicCalendarModal()`.
A estrutura do modal está completa, o conteúdo é renderizado e o roteamento
usa modal (não `data-page`). Nenhuma regressão ou bug identificado.

---

## [1.0.0-rc1] — 2026-06-28

### Release Candidate — Consolidação de Arquitetura e Qualidade

Esta versão consolida todas as funcionalidades implementadas nas etapas anteriores
e prepara a MedAgenda para uso em produção com foco em qualidade, performance e manutenibilidade.

### Adicionado
- **`utils.js`** — módulo de utilitários compartilhados (`pad`, `isoDate`, `isoToday`, `localDate`, `escapeHtml`, `mondayOf`, `truncate`)
- **`tests/utils.test.js`** — 30 testes unitários para utilitários (100% cobertura)
- **`tests/recurrence.test.js`** — 16 testes unitários para lógica de recorrência (todos os tipos cobertos)
- **`package.json`** — scripts de teste via `npm test`
- **ARIA `role="alert"` e `aria-live`** em todas as mensagens de erro da interface
- **`role="dialog"` e `aria-modal="true"`** nos modais de Categorias e Configurações
- **`aria-labelledby`** nos modais para associar títulos

### Corrigido
- **Service Worker** — registro alterado de caminho absoluto (`/service-worker.js`) para relativo (`./service-worker.js`), corrigindo compatibilidade com GitHub Pages em subdiretórios
- **App Shell do Service Worker** — caminhos dos assets migrados para URLs absolutas calculadas a partir da localização do SW (compatível com qualquer base URL)
- **Ícones de notificação Push** — URLs dos ícones no Service Worker agora usam caminho absoluto correto para qualquer deploy
- Consulta redundante em `eventService.getEventsByRange` — cláusula `.lte("event_date", end)` desnecessária removida da query de eventos recorrentes

### Refatorado
- **Eliminação de código duplicado**:
  - `pad()` — existia em `weekView.js`, `notificationService.js`, `calendar.js` → movido para `utils.js`
  - `isoDate()` — existia em `weekView.js`, `notificationService.js` → movido para `utils.js`
  - `isoToday()` — existia em `calendar.js`, `weekView.js` → movido para `utils.js`
  - `mondayOf()` — existia em `weekView.js` e `recurrence.js` → movido para `utils.js`
  - `escapeHtml()` / `esc()` — existia em `script.js` e `weekView.js` → movido para `utils.js`
  - `localDate()` — existia em `recurrence.js` → movido para `utils.js`
  - `currentUserId()` — existia em `eventService.js` e `categoryService.js` → movido para `supabase.js`
- Todos os módulos JS atualizados para importar utilitários de `utils.js`
- `supabase.js` agora exporta `currentUserId()` centralizado

---

## [0.12.0] — Push Notifications

### Adicionado
- Web Push API com VAPID
- Supabase Edge Function para envio de notificações
- Tabela `push_subscriptions` e `notification_logs`
- Deduplicação de notificações via banco de dados

---

## [0.11.0] — PWA

### Adicionado
- Service Worker com cache offline (Cache-first para assets, network-first para API)
- Manifesto PWA (`manifest.webmanifest`) com ícones para todos os tamanhos
- Banner de atualização ao detectar novo Service Worker
- Barra de modo offline
- Botão de instalação (Add to Home Screen)

---

## [0.10.0] — Recorrência

### Adicionado
- Tipos de recorrência: diária, semanal, quinzenal, mensal, anual, dias úteis, personalizada
- Expansão de ocorrências virtuais por intervalo de datas
- Campo `recurrence_until` para limite de recorrência
- Recorrência personalizada com seleção de dias da semana e intervalo em semanas

---

## [0.9.0] — Categorias

### Adicionado
- CRUD completo de categorias personalizadas
- 8 categorias padrão pré-criadas para estudantes de Medicina
- Seleção de cor por categoria
- Preenchimento automático de cor ao selecionar categoria no formulário

---

## [0.8.0] — Quick Add

### Adicionado
- Modal de criação rápida de compromisso (título + hora)
- Disparo ao clicar em dia no calendário mensal ou slot na agenda semanal

---

## [0.7.0] — Agenda Semanal

### Adicionado
- Vista de agenda semanal com grade de horários
- Linha "agora" atualizada a cada minuto
- Scroll automático para o horário atual
- Navegação entre semanas
- Criação de evento ao clicar em slot vazio

---

## [0.6.0] — Calendário Mensal

### Adicionado
- Vista de calendário mensal com chips de eventos
- Navegação entre meses
- Botão "Hoje"
- Clique em dia → Quick Add; clique em evento → edição

---

## [0.5.0] — CRUD de Eventos

### Adicionado
- Formulário completo de criação e edição de compromissos
- Campos: título, data, hora, duração, categoria, cor, local, descrição, lembrete
- Lista de compromissos com paginação visual
- Exclusão com confirmação

---

## [0.4.0] — Supabase e Banco de Dados

### Adicionado
- Integração com Supabase (PostgreSQL + Auth)
- Tabela `events` com índices e trigger de `updated_at`
- Row-Level Security (RLS) para isolamento de dados entre usuários
- Migrations SQL versionadas em `sql/`

---

## [0.3.0] — Notificações Locais

### Adicionado
- Notificações do navegador (Notification API)
- Agendamento de lembretes via `setTimeout` dentro da janela de 7 dias
- Persistência de preferência de notificação no localStorage

---

## [0.2.0] — Autenticação

### Adicionado
- Login e logout com email/senha via Supabase Auth
- Persistência de sessão entre recargas
- Proteção de rotas (tela de login vs. app)

---

## [0.1.0] — Versão Inicial

### Adicionado
- Estrutura do projeto (HTML, CSS, JS vanilla, sem framework)
- Configuração de deploy via GitHub Pages
- Documentação inicial (README, VISAO_DO_PRODUTO, ARQUITETURA, BANCO_DE_DADOS)
