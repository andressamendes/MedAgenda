# DESIGN QUALITY REVIEW V2 — Auditoria Definitiva de UX/UI, Front-end e Percepção de Produto

**Produto:** Anoti — ambiente diário de estudo para estudantes de Medicina
**Data:** 24/07/2026
**Papel assumido:** Head of Product Design, com a régua de Apple, Linear, Notion, Things 3, Craft, Arc, Raycast, Todoist, TickTick, Sunsama, Capacities, Readwise, Apple Health e Gentler Streak.
**Método:** leitura completa e atualizada de `index.html` (1713 linhas), `style.css` (5668 linhas, ~871 blocos de regra, ~597 seletores de classe distintos), das 27 `*View.js` e dos serviços/diálogos associados (fluxos de compromisso, sessão, questões, revisões, diário, configurações e conta) — com contagens refeitas na íntegra, não herdadas da rodada anterior. Ponto de partida: `docs/F18-AUDITORIA-UX-UI-V4.md` (23/07/2026, nota 6,2/10) e o `CHANGELOG.md` entre essa data e hoje (V5.1–V5.22, F18.1–F18.17), que documentam 9 correções diretas dos achados do F18. Cada achado desta rodada foi **verificado contra o código atual**, não presumido a partir do changelog — onde uma correção declarada não se sustentou por completo, isso está registrado explicitamente.

Esta auditoria não procura bugs, não revisa regra de negócio e não sugere funcionalidade nova. Ela responde a uma pergunta: **por que o Anoti ainda não é confundido, nos primeiros cinco segundos, com um produto comercial premium** — mesmo depois de o sistema de tokens, a unificação de cartões, a escala de ícones e a arquitetura de navegação terem sido corrigidos.

---

# 1. Nota geral do produto (0–10)

## 7,1 / 10

| Dimensão | Nota | F18 (23/07) |
|---|---|---|
| Pensamento de produto | 8,8/10 | 8,5/10 |
| Sistema de tokens (cor/tipografia/espaço/ícone) | 7,4/10 | ~4/10 |
| Execução visual por componente | 6,3/10 | ~4,5/10 |
| **Percepção "produto premium" nos 5 primeiros segundos** | **5,5/10** | não medida separadamente |

A divergência entre a segunda e a quarta linha é o achado central desta rodada. O trabalho feito entre F18 e hoje foi real, verificável e bem direcionado: 79% das declarações de `font-size` agora usam token (eram ~23%), a duplicação de `@keyframes spin`/`ai-spin` sumiu, `--red` legado foi removido, a escala de ícones (F18.7) está 100% aplicada ao glifo SVG, os rótulos "eyebrow" convergiram (17 de 24 usos no token), a página Progresso voltou a ser alcançável, a colisão "Todas"/"Todas" foi resolvida, o painel "Analisar" do Diário parou de misturar filtro com leitura, Notificações locais/Push viraram um único toggle, e o registro de questões rápido/detalhado parou de duplicar digitação.

Isso é, ponto a ponto, exatamente o tipo de correção que uma auditoria de design system pede — e todas aconteceram. **E mesmo assim a percepção "isto parece feito por profissionais" não subiu na mesma proporção que a limpeza do CSS.** Essa é a descoberta que esta V2 precisa nomear com precisão na Etapa 2: arrumar os tokens não resolveu o problema, porque o problema nunca foi principalmente os tokens.

---

# 2. Resumo executivo

**Por que o Anoti ainda não parece um produto premium**, apesar de nove correções estruturais reais desde o F18:

1. **O sistema de tokens existe, mas não é aplicado com disciplina — é um menu, não uma regra.** 37 de 180 valores de `font-size`, 40 de 112 `border-radius`, 24 de 37 `box-shadow` e um "meio-degrau" inteiro de espaçamento (.6/.65/.7/.85/.9/1.3rem) continuam sendo escritos como literais. Não existe nenhum lint de CSS ou verificação automatizada (`npm run verify` cobre app-shell, testes e schema — nada de design) que impeça um valor novo de entrar fora do token na próxima PR. Cada rodada de auditoria consolida o token e a próxima feature reintroduz literais — porque nada além de outra auditoria manual pega isso. **Essa é uma causa estrutural, não estética**: sem um mecanismo automático, o padrão vai continuar se desfazendo a cada ciclo de desenvolvimento, não importa quantas vezes for arrumado à mão.

2. **A família "cartão" ainda está bifurcada em dois pesos de elevação, e ninguém tinha medido isso até agora.** O comentário em `style.css:359-368` afirma que `.card`/`.ss-card`/`.modal-card`/`.smart-card` compartilham `--radius-lg`/`--shadow-md` — e compartilham, de fato. Mas `.event-card`/`.stat-card` (a família que aparece em Hoje, Progresso e nas listas — ou seja, as telas mais vistas do produto) usa `var(--radius)` (8px, não 12px) e `var(--shadow-sm)` (não `-md`), com padding literal. O produto tem, hoje, **duas linguagens de elevação diferentes coexistindo sem que a unificação declarada as cubra** — e é sutil o bastante para nunca ter sido nomeado antes desta auditoria.

3. **Um único componente de "painel lateral" (`.ai-panel`) foi reaproveitado para quatro conteúdos de natureza completamente diferente** — Questões/Revisões da Sessão, Análise do Diário, Histórico de um Compromisso e o Assistente de IA. Isso é eficiência de engenharia, mas achata a personalidade do produto: um painel de filtro, um painel de leitura analítica, um painel histórico e uma conversa com IA deveriam *parecer* coisas diferentes, porque são coisas diferentes para quem usa. Reduzir tudo à mesma gaveta cinza é o tipo de decisão que, sozinha, faz um produto parecer "gerado" em vez de desenhado — um padrão reconhecido, reaplicado sem questionar se ainda serve ao conteúdo.

4. **A tela mais usada do produto é também a mais densa.** `#page-study-session` — a tela de "Executar", o coração da tese do produto ("planeje pouco, estude muito, feche o dia") — tem hoje 2 modais, 1 painel lateral, 4 blocos `dl`, 2 formulários com disclosure aninhado e mais de 6 seções encaixotadas empilhadas, 3 níveis de aninhamento. Nenhum concorrente de referência (Forest, Session, o próprio cronômetro do Things) deixa a tela do "estou estudando agora" competir com tanta coisa. A complexidade dessa tela é orgânica — cada peça faz sentido isolada — e é exatamente por isso que ninguém a cortou: nenhuma PR individual "quebrou" a tela, a densidade é a soma de oito PRs bem-intencionadas.

5. **O sistema de confirmação/perigo foi unificado no mecanismo (só existe `confirmDialog`, nenhum `window.confirm()` solto), mas não na calibração.** "Cancelar sessão" — reversível, sem perda de dado — usa o mesmo botão vermelho sólido que excluir um compromisso para sempre. Excluir um compromisso recorrente pelo card da lista apaga a série inteira sem opção de escopo (o modal de edição pergunta; o card da lista, não). Excluir a conta inteira pede uma confirmação; trocar a senha exige reautenticação completa. Um produto premium usa cor de perigo como um contrato de confiança — o usuário aprende "vermelho = sério" e passa a confiar nisso sem ler. Aqui o vermelho às vezes significa "sério" e às vezes só significa "não é a ação primária".

6. **A voz do produto existe em um lugar (o onboarding) e não se espalha para o resto.** As telas de boas-vindas (`onboardingTourView.js`) têm texto genuinamente escrito com intenção — "Medicina não se aprende numa noite — se aprende em constância" — e são a única superfície do produto com personalidade verbal reconhecível. Todo o resto (mensagens de validação, textos de erro, confirmações) é prosa utilitária de formulário SaaS genérico ("Preencha e-mail e senha.", "As senhas não coincidem."). Um produto premium tem uma voz que sobrevive ao clique errado, não só à tela de boas-vindas.

**Nenhum destes seis pontos pede uma funcionalidade nova.** Os cinco primeiros pedem consolidação do que já existe; o sexto pede reescrita de texto que já existe. É exatamente o mesmo tipo de trabalho que funcionou de F13 a F18 — aplicado agora à camada que a poda de token não alcança: arquitetura de reaproveitamento de componente, calibração semântica de cor e disciplina de enforcement, não mais inventário de valores soltos.

---

# 3. Design Inventory completo

## Componentes existentes

| Componente | Onde aparece | Variantes | Base compartilhada |
|---|---|---|---|
| **Botão** (`.btn`) | Todo o produto | primary, secondary, ghost, outline, danger, success, sm/lg, icon/icon-sm/icon-lg, loading | `--radius`, `--font-size-sm`, transições consistentes |
| **Cartão "elevado"** | Login, modais, sessão, dashboard | `.card`, `.modal-card`, `.ss-card`, `.smart-card` | `--radius-lg`/`--shadow-md` (unificado F18.8) |
| **Cartão "de dado"** | Hoje, Progresso, listas | `.event-card`, `.stat-card`, `.stat-card--sm` | `--radius` (8px)/`--shadow-sm` — **linhagem separada, não coberta pela unificação acima** |
| **Painel lateral (drawer)** | Sessão (Q&R), Diário (Analisar), Detalhe de evento, IA | `.ai-panel` reaproveitado 4× | mesmo overlay+aside+header+close |
| **Modal padrão** | Evento, Categorias, Configurações, Conta, Diagnóstico, Calendário Acadêmico, Início/Fim de Sessão | `.modal-card`, `.modal-lg`, `.modal-account`, `.modal-academic`, `.modal-session` | `.modal-overlay`/`.modal-card` (8 instâncias) |
| **Modal de tela cheia (ritual)** | Fechamento do dia, Celebração de conquista | `.close-day-screen`, `.achv-celebration-screen` | composição própria, staged reveal |
| **Badge/pill** | Categorias, status, contadores | `.badge` (pill, --radius-full), `.ss-status-badge`, `.session-history-status` | consistentes entre si |
| **Chip retangular** | Calendário (mês), dia inteiro | `.cal-chip` (radius 3px), `.wk-allday-chip` (radius 3px) | família visual **diferente** do badge pill — mesma função semântica (rotular), forma diferente |
| **Chip de sugestão** | Início de sessão, Diário (rápidos) | `.ss-suggestion-chip`, `.sj-quick-filter` | pill-shaped, consistente com `.badge` |
| **Disclosure/accordion** | Hoje, Sessão, Progresso, Diário, formulário de evento | botão `disclosure-toggle` + chevron — **7 instâncias idênticas** | mesmo padrão, nunca variado |
| **Empty state** | Agenda, Sessão, Diário, listas | `.state-block` (rico: ícone+título+desc+CTA), `.list-empty` (texto simples), `.ss-questions-empty` | 3 níveis de riqueza, sem critério explícito de quando usar qual |
| **Toast** | Toda ação de escrita | success, error, info, warning, milestone | consistentes em mecanismo; ver §4 para inconsistência de uso |
| **Skeleton/loading** | Listas assíncronas | `skeletonView.js`, `.app-loading-spinner` | reaproveitado, mas 3 telas (`accountView`, `diagnosticModal`, `academicCalendarView`) ainda usam "Carregando…" de texto solto em vez do padrão |
| **Confirmação/diálogo destrutivo** | Excluir, Cancelar | `confirmDialog` (10 usos), `recurrenceScopeDialog` (nunca danger, mesmo quando resulta em exclusão), `abandonedSessionDialog` (não dispensável, por design) | mecanismo único; calibração de perigo não |
| **Ícone** | Todo o produto | 52 `<svg>` inline, sem `<symbol>`/sprite, escala de glifo tokenizada (`--icon-sm/md/lg/xl`) | glifo consistente; **contêiner do ícone não** (ver §3, candidatos a unificação) |
| **Indicador de execução (anel)** | Mês e Semana da Agenda | `.exec-ring`, unificado desde V5.18 | um único componente, dois contextos |
| **Anel de meta/progresso** | Hoje (stat-card), Progresso (hero) | mesmo cálculo, duas renderizações — intencional (V5.17) | consistente |
| **Heatmap de constância** | Progresso | componente único | — |
| **Navegação** | Sidebar (desktop), bottom-nav (mobile), header, chip de sessão flutuante | 5 itens sidebar, 5 bottom-nav (5º = "Mais"), 1 header dropdown | mapeamento 1:1 confirmado entre nav e páginas reais |

## Componentes duplicados

- **Duas famílias de "cartão elevado"** fazendo o mesmo trabalho perceptual (superfície branca com radius+sombra) em duas alturas de elevação diferentes: `.card/.modal-card/.ss-card/.smart-card` (12px/md) vs `.event-card/.stat-card` (8px/sm). A auditoria F18 tratou isso como resolvido; não está — apenas metade da família foi unificada.
- **Dois formatos de "rótulo curto colorido"**: `.badge` (pill) e `.cal-chip`/`.wk-allday-chip` (retângulo 3px) resolvem o mesmo problema de produto ("marcar uma categoria/estado com uma cor") com geometrias diferentes, sem justificativa funcional — só justificativa de "onde no código foi escrito primeiro".
- **`.btn-danger`/`.btn-success` continuam com peso "soft"** (fundo tintado, nunca preenchimento sólido) — mesmo peso visual de um botão secundário. Já era P1 no F18; não mudou.
- **`toast.success` vs `toast.info` para a mesma classe de evento**: toda exclusão do produto dispara `toast.success` ("Compromisso excluído.", "Calendário excluído.", "Evento excluído.", "Foto removida.") — exceto excluir a conta inteira, que dispara `toast.info('Conta excluída. Até logo!')`. É a única exclusão do produto com tom de toast diferente das demais.

## Componentes inconsistentes

- **Confirmação de exclusão de compromisso recorrente**: o modal de edição oferece 3 escopos (esta/estas e próximas/série); o card na lista (`script.js:618-638`) e o evento acadêmico (`academicCalendarEventsView.js:107-129`) **excluem a série inteira direto, sem pedir escopo** — mesma ação de produto, três comportamentos diferentes dependendo de onde o clique começou.
- **`recurrenceScopeDialog` nunca usa estilo de perigo**, mesmo quando a escolha resulta em apagar uma série inteira — os três botões são `btn-secondary` neutros. O mesmo resultado (apagar dado permanentemente), tratado como decisão neutra num fluxo e como decisão perigosa (vermelho) em outro.
- **"Cancelar sessão"** usa `confirmDialog({danger:true})` — o mesmo vermelho sólido reservado, em toda a documentação e em todo o resto do produto, para "isto não pode ser desfeito". Cancelar uma sessão não perde dado (é reversível: pode-se iniciar de novo). É a única ação reversível do produto vestida com o traje de uma irreversível.
- **QuickAdd não dá toast de sucesso; o formulário completo, sim** — a mesma ação de produto ("criar um compromisso") tem feedback de conclusão em um caminho e silêncio no outro.
- **Remover uma revisão associada não pede confirmação; excluir uma questão registrada, também não** — internamente consistentes entre si, mas ambos destoam do resto do produto, onde toda remoção de dado passa por `confirmDialog`.
- **Três níveis de riqueza de empty state** (`.state-block` completo vs `.list-empty` textual vs texto solto tipo "Carregando…") sem critério documentado de quando cada um se aplica — parece decisão de quem escreveu aquela tela naquele dia, não de um sistema.
- **Contêiner de ícone tem sua própria "escala fantasma"**: mesmo com o glifo SVG 100% tokenizado (F18.7), a caixa/círculo ao redor do ícone usa valores crus não relacionados aos tokens de ícone — `.btn-icon-sm` 28px, `.btn-icon-lg` 42px, `.nav-icon` 1.2rem, `.smart-card-icon` 1.9rem, e mais 6 outros valores em rem espalhados. O mesmo problema que a auditoria anterior resolveu para o SVG existe, sem nome, um nível acima, no invólucro.

## Componentes candidatos à unificação

1. `.event-card`/`.stat-card` → migrar para a base `.card` (radius-lg/shadow-md) ou documentar e nomear formalmente por que precisam ser mais discretos (uma terceira variante *nomeada*, não um desvio silencioso).
2. `.cal-chip`/`.wk-allday-chip` → migrar para a geometria pill de `.badge` (`--radius-full`), ou criar um segundo token de chip retangular deliberado (`--radius-chip`) se a forma retangular for uma decisão consciente de legibilidade em grade densa — hoje não há evidência de que seja consciente.
3. **Contêiner de ícone** → 2-3 tamanhos de "cápsula" (`--icon-box-sm/md/lg`) do mesmo jeito que o glifo já tem `--icon-sm/md/lg/xl`.
4. `.btn-danger`/`.btn-success` → preenchimento sólido para paridade de peso com `.btn-primary`, reservando o "soft/tint" para um novo `.btn-tertiary` se esse peso intermediário for necessário em algum lugar.
5. **Sombras de um único uso** (11 valores bespoke fora dos 4 tokens — anéis de pulso, drawer, day-btn) → nomear os 2-3 padrões recorrentes (pulso de destaque, elevação de drawer lateral) como tokens novos em vez de repetir `rgba(0,0,0,.XX)` cru em cada lugar.
6. **`999px` hardcoded (5 ocorrências)** → trocar por `var(--radius-full)`, que já existe e já vale exatamente isso.
7. **Cluster de `font-size` entre .58rem–.95rem (10 valores distintos)** → mapear cada um para `--font-size-xs`/`--font-size-sm` ou, onde a diferença for real e intencional (micro-badges vs. texto de apoio), formalizar 1-2 tamanhos novos nomeados — não deixar 10 literais fazendo o trabalho de 2 tokens.
8. **`#fff` hardcoded 26×** para texto sobre fundo colorido → um token `--color-on-primary` (ou `--color-on-accent`), inclusive porque hoje ele nunca muda com o tema (mesmo `#fff` cru em modo claro e escuro — funciona por coincidência, não por design).

## Componentes candidatos à remoção

- **Nenhum componente novo precisa ser removido nesta rodada** — a rodada F18 já removeu os candidatos claros (Resumos Semanais, `source: "quick"`/rótulo "Rápida", bypass do Decision Engine em `eventFormView.js`). O inventário atual é enxuto o suficiente para que o trabalho agora seja consolidação, não exclusão.
- Único candidato remanescente: **o padrão "Carregando…" de texto solto** em `accountView.js`/`diagnosticModal.js`/`academicCalendarView.js` deveria ser removido em favor do `skeletonView.js`/`stateView.js` já padronizado — não é um componente a mais, é uma reimplementação paralela de um que já existe.

---

# 4. O que ainda faz o produto parecer amador

Causas estruturais, não estéticas — a resposta exigida pela Etapa 2, sem aceitar "trocar cor/aumentar padding/sombra" como resposta.

1. **Ausência de enforcement automático do design system.** `npm run verify` roda testes, checagem de app-shell e checagem de schema — nenhuma checagem de CSS. Um `stylelint` com regras contra `font-size`/`border-radius`/`box-shadow` fora de `var(--...)` custaria uma PR pequena e impediria a próxima feature de reintroduzir literais. Sem isso, cada rodada de auditoria manual é uma vitória temporária: a arquitetura de desenvolvimento (muitas PRs pequenas, cada uma tocando um componente por vez, sem revisão cruzada de sistema) *produz* deriva de token como efeito colateral estrutural, não como acidente pontual.
2. **Reaproveitamento de container por conveniência de engenharia, não por adequação de conteúdo.** O padrão `.ai-panel` sendo usado para filtro (Diário), leitura analítica (mesmo Diário), histórico (evento) e conversa (IA) é economia de CSS que custa personalidade: um usuário nunca aprende "isto é uma gaveta de filtro" vs. "isto é uma gaveta de insight", porque as duas parecem idênticas. Produtos percebidos como premium (Linear, Notion) frequentemente reaproveitam *padrões de interação* (abrir/fechar, foco, esc), mas variam a composição visual conforme a natureza do conteúdo.
3. **A tela de maior uso é a de maior densidade.** Ver §2.4 — a Sessão de Estudo acumula 2 modais + 1 painel + 4 `dl` + disclosures aninhados. Isso é o oposto do padrão de produtos de foco/tempo (Forest, o cronômetro do Things, Gentler Streak): a tela onde o usuário passa mais tempo contínuo deveria ser a mais silenciosa do produto, não a mais carregada.
4. **Calibração de risco desacoplada de peso visual.** Ver §3, "Componentes inconsistentes" — vermelho nem sempre significa irreversível, escopo de exclusão de recorrência varia por ponto de entrada. Um produto amador usa "confirmar?" genericamente; um produto premium usa gravidade visual como um contrato semântico absoluto.
5. **Nenhuma superfície do produto tem uma assinatura visual própria fora dos ícones de traço e da paleta índigo.** Nenhuma tela tem uma composição que só poderia ser do Anoti — o anel de meta e o heatmap de constância (Progresso) são os únicos elementos com identidade visual própria em todo o produto; todo o resto é layout de formulário/lista genérico com bom espaçamento. Isso explica por que, mesmo limpo, o produto ainda lê como "bem-feito" em vez de "com assinatura".

---

# 5. O que ainda transmite aparência de IA

1. **Sete instâncias idênticas do mesmo botão de disclosure**, copiadas verbatim (mesma estrutura `btn btn-ghost btn-sm disclosure-toggle` + chevron SVG) em vez de um componente único parametrizado — o tipo de repetição que aparece quando cada tela foi gerada/editada isoladamente, sem revisão cruzada.
2. **52 `<svg>` inline, sem `<symbol>`/sprite**, cada ícone com o path duplicado literalmente a cada aparição (o logo aparece 3× por extenso, o X de fechar 7×, o chevron 7×) — mecanicamente correto, mas é exatamente o padrão que uma geração assistida por IA produz quando cada tela é resolvida no isolamento do próprio arquivo, sem um catálogo central real de ícones injetados via JS (o app já tem `icons.js` com exports nomeados — o HTML simplesmente não os usa, e duplica o markup à mão).
3. **Quatro painéis (`#ss-panel`, `#sj-panel`, `#event-detail-panel`, `#ai-panel`) com a mesma estrutura textual repetida**: overlay + aside + header + título + botão fechar — sinal de "template aplicado", não de composição pensada por tela.
4. **Comentários de desenvolvedor mais extensos que o conteúdo visível do usuário em quase toda seção do HTML** (ex.: L342-346, L369-380, L392-395, L414-420, L487-491) — não é um problema do usuário final, mas é um sintoma real do processo: cada trecho de UI carrega uma justificativa por escrito de por que existe, o que é o comportamento de quem está constantemente convencendo um revisor (humano ou modelo) de que uma decisão pontual está correta, em vez de operar dentro de um sistema cuja existência já seria a justificativa.
5. **10 valores quase-idênticos de `font-size` na faixa .58–.95rem** e um "meio-degrau" de espaçamento (.6/.65/.7/.85/.9/1.3rem) fora da escala oficial — o padrão clássico de "cada componente decide seu próprio número, plausível isoladamente, sem referência ao vizinho", que é o sintoma mais citado nesta modalidade de crítica ("pouca hierarquia real, muita variação sem motivo").
6. **Um segundo cluster de ícone "fantasma"** (a caixa ao redor do glifo, não o glifo) com ~10 valores crus — ou seja, mesmo depois de o glifo ter sido resolvido, o problema idêntico ressurgiu um nível de composição acima, sem que ninguém tivesse notado, porque a resolução anterior tratou o sintoma (o SVG) e não a causa (nenhuma disciplina de token do lado do contêiner).
7. **Textos de erro/validação genéricos e intercambiáveis com qualquer outro produto SaaS** ("Preencha e-mail e senha.", "As senhas não coincidem.", "Informe seu e-mail.") — o oposto exato da voz autoral encontrada no onboarding. É o padrão mais reconhecível de "texto de sistema gerado" versus "texto de produto escrito": funcional, correto, sem impressão digital.

---

# 6. O que ainda denuncia projeto amador

1. **Sensação de "planilha com esteroides" na tela de Sessão** — 4 blocos `dl` (`dt`/`dd` pares) empilhados é literalmente o padrão HTML de tabela de definição, o oposto do "cronômetro que ocupa a tela" que produtos de foco usam.
2. **Simetria e caixas demais no disclosure de Progresso** — 5 grupos encaixotados irmãos (Períodos, Recordes, Conquistas, Revisões, Produtividade) atrás de um único toggle, remanescente direto do "12+ stat-cards soltos" que a página já tentou resolver uma vez (comentário do próprio código admite isso em L855-863) — a poda aconteceu na superfície (colocou atrás de um clique), não na estrutura (a grade continua sendo uma grade).
3. **Painel "Analisar" do Diário ainda aninha 3 níveis de caixa** (aside → stat-cards → toolbar-filtros → disclosure → filter-bar) numa área relativamente pequena — mesmo depois de a mistura de conteúdo ter sido corrigida (F18.15/16), a arquitetura de caixa-dentro-de-caixa continua.
4. **Ausência de foco visual único por tela**: cada página tem, em média, 3-5 blocos "importantes" competindo (Hoje: hero + lista + stats + close-day; Progresso: hero + narrativa + disclosure de 5 grupos) — nenhuma tela tem um "isto é o que importa agora" inequívoco além da tela de Sessão ativa (que erra pelo excesso oposto).
5. **Formulário de evento (`#event-modal`) aninha recorrência 3 níveis fundo**: campo → `.recurrence-extra-block` → `.recurrence-custom-block` → `.recurrence-days-wrap` (7 botões de dia) — para um caso de uso (plantão fixo às sextas) que deveria ser 1-2 decisões, não uma árvore.
6. **Nove seções verticais no shell de navegação** (sidebar: 3 primárias + 2 secundárias + 2 de gerência, separadas por divisores) — funcional, mas lê como menu de administração de sistema, não como as 3-4 âncoras que um app teria se cada uma fosse pesada o bastante para justificar existir sozinha.
7. **Falta de ritmo visual entre telas**: Hoje é aberta/respirada, Sessão é densa, Diário é técnica (toolbar + chips + selects), Progresso é narrativa + grade — nenhuma decisão de "quanto de grade cabe nesta tela" parece ter sido feita uma vez para o produto inteiro; cada tela resolveu sozinha, e o resultado é que passear entre elas não tem cadência.

---

# 7. Avaliação por percepção (5 segundos)

| Tela | Impressão em 5s | Justificativa técnica |
|---|---|---|
| **Splash/Loading** | Produto comercial | Spinner cônico com o degradê da marca, wordmark estável — pequeno, mas correto; não é distintivo o bastante para "premium". |
| **Login** | Produto comercial | Composição de duas colunas com painel de marca é a decisão certa (V5.13); ainda genérico no copy fora do onboarding. |
| **Cadastro** | Sistema interno | Mesma lista vertical de campos de qualquer formulário de cadastro; nenhuma diferenciação do restante do mercado. |
| **Hoje (Dashboard)** | Produto comercial, quase premium | Hero de 1 CTA + lista curta é a melhor tela do produto em termos de foco; a densidade dos "Compromissos"/stats atrás de disclosure ainda lembra dashboard administrativo se aberta. |
| **Agenda — Dia** | Produto comercial | Lista vertical de horário limpa, mobile-first genuína (V5.12) — a melhor visão de Agenda. |
| **Agenda — Semana/Mês** | Dashboard administrativo | Grade densa, `min-width: 480px` força scroll horizontal em mobile — a visão "padrão" em telas grandes é a mais burocrática do produto. |
| **Sessão de Estudo (ativa)** | Dashboard administrativo | Ver §2.4/§6.1 — timer competindo com 4 `dl`, 2 formulários, 1 painel lateral. |
| **Diário** | Produto comercial | Toolbar + chips + painel "Analisar" já resolvido estruturalmente; ainda com textura de ferramenta de análise, não de "memória do que estudei". |
| **Histórico (aba do Diário)** | Sistema interno | Lista crua com filtros de checkbox — funcional, sem composição própria. |
| **IA (Assistente)** | Produto comercial | Paleta tokenizada (F18.6), ações reduzidas a 2 — a melhor recuperação de uma "ilha visual" antiga; ainda usa a mesma gaveta genérica dos outros 3 painéis. |
| **Insights (dentro de Progresso)** | Dashboard administrativo | Duas seções `.insights-block` com grade de stat-cards — o resíduo do "BI pessoal" que a Visão do Produto declara estar fora de escopo (§"Fora do Escopo"), ainda visualmente presente. |
| **Revisões (dentro de Sessão)** | Sistema interno | `<select>` + botão, sem composição visual própria — funcional, invisível como produto. |
| **Configurações** | Produto comercial | Abas Aparência/Lembretes/Ferramentas com toggle único — bem resolvido depois do F18.17. |
| **Modais (em geral)** | Produto comercial / Sistema interno (varia) | `.close-day-screen`/`.achv-celebration-screen` são premium; `.modal-lg` genéricos (Categorias, Diagnóstico) são sistema interno puro. |
| **Formulários (em geral)** | Sistema interno | Disclosure ajuda, mas o formulário de evento com recorrência aninhada 3 níveis ainda lê como formulário de CRUD administrativo. |
| **Navegação (sidebar/bottom-nav)** | Produto comercial | Mapeamento correto, ícones consistentes — a melhor peça de "infra" do produto. |

**Padrão da tabela**: as telas de **entrada e navegação** (Hoje, Login, Sidebar, Configurações, IA) já leem como produto comercial. As telas de **execução e análise densa** (Sessão ativa, Agenda Semana/Mês, Histórico, Insights, Revisões) ainda leem como ferramenta administrativa. Isso não é acaso — são exatamente as telas que carregam a maior quantidade de dado bruto por unidade de área, e nenhuma delas recebeu ainda o mesmo tratamento de "poda para narrativa" que Hoje e Progresso (hero) já receberam.

---

# 8. Avaliação detalhada por tela

### Splash — 7/10
**Profissional:** spinner com degradê de marca, wordmark estável entre SOs (correção documentada do F11). **Amador:** nada de errado, mas nada memorável — é o "correto mínimo", não uma primeira impressão desenhada. **Deveria desaparecer:** nada. **Reconstrução:** não necessária; considerar 1 frame de personalidade (não mais que isso) sem adicionar tempo de carregamento percebido.

### Login — 7,5/10
**Profissional:** composição de duas colunas com painel de marca (V5.13), rompeu com o `.card` genérico. **Amador:** 7 `.auth-view` empilhados como "estados" reforçam a sensação de máquina de estados visível — tecnicamente correto, esteticamente é um formulário mudando de rótulo. **Deveria desaparecer:** nada estrutural. **Reconstrução:** não a tela inteira — só o texto de apoio/erro, que é o único elemento sem voz própria nesta tela (ver §5.7).

### Cadastro — 6/10
**Profissional:** validação client-side clara, mensagens específicas por campo. **Amador:** lista vertical padrão de campo+campo+campo+termos+botão — nenhuma composição própria além do painel de marca herdado do login. **Deveria desaparecer:** nada. **Reconstrução:** não a estrutura, só o tom das mensagens de erro.

### Dashboard "Hoje" — 8/10
**Profissional:** 1 CTA hero, no máximo 1 card espontâneo, "silêncio como política" aplicado de verdade — a tela mais alinhada à Visão do Produto do app inteiro. **Amador:** o disclosure de stats ainda usa a família `.event-card`/`.stat-card` de elevação divergente (§3). **Deveria desaparecer:** nada. **Reconstrução:** não necessária — é a tela-referência do que o resto do produto deveria copiar em espírito.

### Agenda (Dia/Semana/Mês/Lista) — 6/10 (varia por aba)
**Profissional:** aba "Dia" (V5.12), mobile-first genuína, sem scroll horizontal forçado. **Amador:** Semana/Mês com grade `min-width:480px`, chip `.cal-chip` com forma diferente do resto do badge system, densidade típica de agenda corporativa. **Deveria desaparecer:** nada — só reequilibrar qual aba é "padrão" por contexto. **Reconstrução:** a visão de Mês merece um segundo olhar de composição (hoje é uma grade de calendário genérica, sem nenhum elemento que a diferencie de qualquer biblioteca de calendário open-source).

### Sessão de Estudo — 5/10
**Profissional:** state machine robusta, anti-abandono bem pensado, cronômetro central. **Amador:** ver §2.4/§4.3/§6.1 — a tela mais carregada do produto é a mais usada. **Deveria desaparecer:** os 4 blocos `dl` como HTML de definição — a informação é boa, o formato é de tabela técnica. **Reconstrução recomendada:** sim — é a candidata nº 1 desta auditoria para reconstrução completa (ver §15).

### Diário — 7/10
**Profissional:** busca sempre visível, painel de análise já corrigido estruturalmente (F18.15/16). **Amador:** ainda 3 níveis de caixa dentro do painel "Analisar". **Deveria desaparecer:** nada de conteúdo — já foi podado. **Reconstrução:** não a tela inteira, só achatar o aninhamento do painel lateral.

### Histórico (aba do Diário) — 5,5/10
**Profissional:** filtros funcionais, dados corretos. **Amador:** lista crua de checkbox sem composição visual própria — é a aba menos desenhada do produto. **Reconstrução recomendada:** dar a esta aba a mesma atenção de composição que a timeline de Marcos já recebeu.

### IA — 7,5/10
**Profissional:** paleta tokenizada, 2 ações apenas, mensagens de espera progressivas honestas ("Isso está demorando mais que o esperado…") — um dos melhores exemplos de microcopy do produto. **Amador:** usa a mesma gaveta genérica dos outros 3 painéis — a única superfície verdadeiramente conversacional do produto não parece conversacional, parece um formulário de resultado. **Reconstrução:** a composição do painel (não a lógica) merece uma linguagem visual própria, dado que é a única interação de "pergunta e resposta em prosa" do app.

### Insights (dentro de Progresso) — 5/10
**Profissional:** dados corretos, bem categorizados (Revisões, Produtividade). **Amador:** exatamente o "BI pessoal" que a Visão do Produto declara fora de escopo — duas seções de grade de stat-cards atrás do mesmo disclosure do resto de Progresso. **Deveria desaparecer:** como seções de grade separadas — deveriam ser absorvidas pela narrativa (que já existe acima, no hero) em vez de coexistir como uma segunda camada de números.

### Revisões (dentro de Sessão) — 4,5/10
**Profissional:** lógica de associação correta, evita duplicar revisões já vinculadas (bug fix documentado). **Amador:** `<select>` nativo + botão — zero composição visual, a peça menos "desenhada" de toda a tela de Sessão. **Reconstrução recomendada:** sim, junto com o resto do painel de Sessão.

### Configurações — 7,5/10
**Profissional:** notificações unificadas num único toggle (F18.17), abas claras. **Amador:** nada saliente — é a melhor tela "de utilidade" do produto agora. **Reconstrução:** não necessária.

### Todos os modais — 6/10 (média, alta variância)
`.close-day-screen`/`.achv-celebration-screen` são o teto do produto (8,5/10 isolados); `.modal-lg` de Categorias/Diagnóstico/Calendário Acadêmico são o piso (5/10, formulário-em-caixa puro). **Reconstrução recomendada:** aplicar o vocabulário de "revelação em sequência" dos modais rituais (mesmo que sem a cerimônia completa) aos modais utilitários, para reduzir a distância entre os dois extremos.

### Todos os formulários — 5,5/10
Disclosure ajuda a esconder complexidade, mas a arquitetura de campo ainda é "todos os campos existem, alguns escondidos" em vez de "o formulário muda de forma conforme a decisão anterior". Recorrência 3 níveis fundo é o pior caso.

### Navegação — 8/10
Sidebar/bottom-nav mapeiam 1:1 com páginas reais (bug do F18 corrigido), ícones consistentes, "Gerenciar" corretamente separado de páginas de conteúdo. A melhor peça estrutural do produto hoje.

---

# 9. Avaliação dos fluxos

| Fluxo | Cliques (caso comum) | Decisões | Confirmações | Achado |
|---|---|---|---|---|
| **Criar compromisso** | 2 (QuickAdd) | 0 | 0 | QuickAdd não dá toast de sucesso; formulário completo dá — mesma ação, feedback diferente. |
| **Editar compromisso** | 1 (não recorrente) / 2 (recorrente, com escolha de escopo) | 0-1 | 0 | Consistente. |
| **Excluir compromisso** | 2-3 | 0-1 (depende da origem do clique) | 1 | **Escopo de recorrência disponível no modal, ausente no card da lista e no evento acadêmico** — mesma ação, três comportamentos. |
| **Iniciar sessão** | 2-3 | 1 (manual vs. compromisso) | 0 | Chips de sugestão eliminam digitação no caso comum — bem resolvido. |
| **Pausar/Retomar sessão** | 1 | 0 | 0 | Sem atrito, correto. |
| **Finalizar sessão** | 2 | 0 | 0 (recap funciona como confirmação suave) | Bem resolvido; único ponto fraco é a ausência de toast diferenciando "concluída" de "cancelada" em intensidade. |
| **Cancelar sessão** | 2 | 0 | 1 (com estilo de **perigo**, apesar de reversível) | Peso visual desproporcional à consequência real. |
| **Registrar questão** | 2 (rápido) | 0 | 0 | F17 realmente eliminou a redigitação — confirmado no código, não só no changelog. |
| **Registrar/associar revisão** | 1 | 0-1 | 0 | Sem toast (diferente de Finalizar/Cancelar) — consistente internamente, mas quebra o padrão geral de "toda escrita relevante recebe toast". |
| **Consultar/pesquisar Diário** | 0 (busca sempre visível) | 0-1 (abrir filtros avançados) | 0 | Bem resolvido — painel "Analisar" já não mistura mais filtro com leitura. |
| **Configurações — lembretes** | 1 | 0 | 0 | Toggle único, resolvido. |
| **Trocar senha** | 3 campos + reautenticação completa | 1 | 0 explícita (a reautenticação *é* a fricção) | Fricção proporcional ao risco. |
| **Excluir conta** | 1 + 1 confirmação | 0 | 1 | **Menos fricção que trocar a senha, para uma ação irreversível de maior consequência** — inversão de risco confirmada no código (`accountView.js`). |

**Achado consolidado:** os fluxos de **criação/consulta** (compromisso, sessão, diário) estão hoje bem calibrados — poucos cliques, poucas decisões, feedback presente. Os pontos fracos remanescentes estão todos em **exclusão, cancelamento e conta** — exatamente onde a calibração de risco visual (§3/§4.4) mais importa, e é onde a inconsistência mais se concentra.

---

# 10. Problemas críticos (P0)

Bloqueiam a sensação de produto profissional na primeira semana de uso real.

### P0.1 — A tela mais usada do produto é a mais carregada
`#page-study-session`: 2 modais + 1 painel lateral + 4 blocos `dl` + 2 formulários com disclosure aninhado + >6 seções encaixotadas, 3 níveis de profundidade. É a tela de "Executar" da tese do produto ("planeje pouco, estude muito, feche o dia") — deveria ser a mais silenciosa, é a mais barulhenta.

### P0.2 — Duas linguagens de elevação coexistindo sem que a unificação declarada as cubra
`.card/.modal-card/.ss-card/.smart-card` (radius-lg/shadow-md) vs. `.event-card/.stat-card` (radius 8px/shadow-sm) — a segunda família aparece exatamente nas telas mais vistas (Hoje, Progresso, listas) e nunca foi incluída na unificação documentada em `style.css:359-368`.

### P0.3 — Calibração de perigo/reversibilidade quebrada
Cancelar sessão (reversível) = vermelho sólido = mesmo peso que excluir permanentemente. Excluir conta (irreversível, grave) < trocar senha em fricção. Escopo de recorrência ao excluir depende de onde o clique começou. Um produto premium usa gravidade visual como contrato absoluto — aqui ele varia por ponto de entrada.

### P0.4 — Nenhum enforcement automatizado do design system
Zero lint de CSS no pipeline (`npm run verify` não cobre isso). Cada rodada de auditoria manual é uma vitória temporária porque nada impede a próxima feature de reintroduzir `font-size`/`border-radius`/`box-shadow` fora do token — o padrão já se repetiu uma vez (F18 → hoje: token adoption subiu, mas não chegou a 100%, e um cluster novo de "contêiner de ícone" surgiu exatamente onde o glifo já tinha sido resolvido).

### P0.5 — Reaproveitamento de container por conveniência, não por conteúdo
`.ai-panel` serve 4 propósitos perceptualmente distintos (filtro, leitura analítica, histórico, conversa) com a composição visual idêntica — a superfície mais "de produto" do app (o Assistente de IA) parece uma gaveta de configuração.

---

# 11. Problemas importantes (P1)

- **`.btn-danger`/`.btn-success` continuam "soft"** — mesmo peso visual que um botão secundário, para as duas categorias de ação com maior consequência (destruir, confirmar positivamente).
- **Cluster de `font-size` .58–.95rem (10 valores)** — nenhuma justificativa documentada para 10 tamanhos quase indistinguíveis nesta faixa.
- **Contêiner de ícone com escala própria e não-tokenizada** (~10 valores crus) — o mesmo problema do glifo (já resolvido) reaparecendo um nível de composição acima.
- **`.cal-chip`/`.wk-allday-chip` divergem geometricamente de `.badge`** (retângulo 3px vs. pill) sem justificativa funcional aparente.
- **QuickAdd sem toast de sucesso** enquanto o formulário completo tem, para a mesma ação.
- **Delete de compromisso recorrente inconsistente entre card da lista, modal e evento acadêmico.**
- **Toast de exclusão de conta usa tom `info`, único caso do produto** onde uma exclusão não usa `success`.
- **999px hardcoded em 5 lugares** em vez de `var(--radius-full)`.
- **~11 sombras bespoke fora dos 4 tokens** — a maioria efeitos de pulso/realce que se repetem sem nome compartilhado.
- **`#fff` hardcoded 26×** para texto sobre cor — funciona por coincidência nos dois temas, não por design (`--color-on-primary` inexistente).
- **Voz do produto isolada no onboarding** — textos de validação/erro no resto do app são genéricos, sem a assinatura verbal do tour.
- **3 telas ("Carregando…") reimplementam estado de loading fora do padrão** (`accountView.js`, `diagnosticModal.js`, `academicCalendarView.js`) em vez de usar `stateView.js`/`skeletonView.js`.
- **52 SVGs inline duplicados, sem sprite**, apesar de `icons.js` já existir como catálogo — o HTML não o usa.
- **7 disclosures idênticos copiados verbatim** em vez de um único componente parametrizado.
- **Painel "Analisar" do Diário ainda aninha 3 níveis de caixa** mesmo após a separação de conteúdo (F18.15/16) ter corrigido o problema de mistura.

---

# 12. Refinamentos (P2)

- Sub-radius cluster (2px/3px/4px) abaixo do menor token (`--radius-sm` 6px), sem nome nem justificativa — provavelmente hairlines que mereceriam seu próprio `--radius-hairline`.
- "Meio-degrau" de espaçamento (.6/.65/.7/.85/.9/1.3/1.75rem) coexistindo com a escala oficial de 7 degraus.
- Letter-spacing: 2 sites (`3114`, `3139`) reinventam o valor do token eyebrow em vez de referenciá-lo.
- Animações com 9 durações distintas não tokenizadas (esperado para animações longas, mas vale nomear 2-3 recorrentes: pulso, reveal, spin).
- `.event-card` com padding literal (`.9rem 1rem`) fora da escala de espaço.
- Abas "Concluídas"/"Histórico" do Diário e "Períodos"/"Recordes" de Progresso têm nomenclatura ligeiramente técnica para o tom emocional que o resto do produto (onboarding, fechamento do dia) já demonstra saber fazer melhor.
- `.wk-wrap`/`.wk-error` usam `var(--radius)` (alias legado de 8px) em vez de nomear explicitamente `--radius-md`.
- Onboarding tour usa ícones (`iconSparkle`, `iconRepeat`, `iconFlame`) que não se repetem em nenhum outro lugar do produto — oportunidade perdida de reforçar a mesma iconografia depois, quando o app "cumpre" a promessa (ex.: o mesmo ícone de chama no primeiro streak real).

---

# 13. As 30 decisões de design que mais prejudicam a percepção do produto

*(ordenadas por impacto)*

1. Reaproveitar `.ai-panel` para 4 conteúdos perceptualmente distintos (filtro, análise, histórico, conversa).
2. Deixar a tela de Sessão ativa acumular 2 modais + 1 painel + 4 `dl` sem nunca revisitar a composição como um todo.
3. Não incluir `.event-card`/`.stat-card` na unificação de elevação declarada em `style.css:359-368`.
4. Usar vermelho sólido de "irreversível" para "Cancelar sessão" (reversível).
5. Não oferecer escolha de escopo de recorrência ao excluir pelo card da lista.
6. Não ter nenhum lint/enforcement de CSS no pipeline (`npm run verify`).
7. Excluir conta com menos fricção que trocar senha.
8. Duplicar 52 SVGs inline em vez de usar o catálogo `icons.js` que já existe.
9. Copiar o botão de disclosure 7 vezes em vez de um componente único.
10. Deixar o contêiner de ícone (não o glifo) com ~10 valores de tamanho crus.
11. Manter `.cal-chip`/`.wk-allday-chip` com geometria retangular divergente do resto do badge system.
12. Deixar a grade de Semana/Mês da Agenda forçar scroll horizontal em mobile (`min-width: 480px`).
13. Não dar toast de sucesso no QuickAdd (mas dar no formulário completo).
14. Deixar `.btn-danger`/`.btn-success` com peso "soft", igual a um botão secundário.
15. Deixar a página Insights (dentro de Progresso) sobreviver como grade de stat-cards duplicando a narrativa que já está acima.
16. Confinar a voz de produto (texto com personalidade real) só ao onboarding.
17. Manter recorrência do formulário de evento 3 níveis de campo aninhado.
18. Deixar `999px` hardcoded em 5 lugares em vez de `var(--radius-full)`.
19. Não ter um token `--color-on-primary` para os 26 usos de `#fff` sobre cor.
20. Deixar 3 telas reimplementarem "Carregando…" fora do padrão de skeleton/state já existente.
21. Deixar o toast de exclusão de conta com tom `info` em vez de `success`, único caso do produto.
22. Não nomear as ~11 sombras bespoke que se repetem (pulso, drawer) como tokens.
23. Deixar o painel "Analisar" do Diário com 3 níveis de caixa aninhada mesmo após a separação de conteúdo.
24. Deixar a aba "Histórico" do Diário sem nenhuma composição visual própria (lista + checkbox cru).
25. Deixar "Revisões" dentro da Sessão como `<select>` + botão, sem nenhuma composição.
26. Deixar 10 valores de `font-size` quase indistinguíveis na faixa .58–.95rem.
27. Não reutilizar os ícones do onboarding (`iconSparkle`/`iconFlame`) em nenhum momento posterior do produto real (ex.: primeiro streak).
28. Deixar os modais utilitários (Categorias, Diagnóstico, Calendário Acadêmico) sem nenhum elemento de composição além de "formulário em caixa".
29. Deixar 2 sites reescreverem o valor do token eyebrow em vez de referenciá-lo.
30. Não ter nenhuma tela do produto, fora Hoje e Progresso (hero), com uma composição que só poderia ser do Anoti.

---

# 14. As 30 melhorias com maior impacto visual

1. Unificar `.event-card`/`.stat-card` à base `.card` (ou nomear formalmente uma terceira variante intencional).
2. Migrar `.cal-chip`/`.wk-allday-chip` para a geometria pill do `.badge`.
3. Preencher `.btn-danger`/`.btn-success` com cor sólida, igualando o peso de `.btn-primary`.
4. Substituir os 5 `999px` crus por `var(--radius-full)`.
5. Criar `--color-on-primary` e substituir os 26 `#fff` crus.
6. Consolidar os 10 valores de `font-size` da faixa .58–.95rem em 2 tokens.
7. Nomear 2-3 tokens de sombra para os padrões bespoke recorrentes (pulso, drawer).
8. Criar 2-3 tokens de "cápsula de ícone" (`--icon-box-sm/md/lg`) para o contêiner, espelhando o que já existe para o glifo.
9. Substituir os 52 SVGs inline por injeção via `icons.js` (já existe, não é usado).
10. Extrair o botão de disclosure repetido 7× em um único componente parametrizado.
11. Redesenhar a tela de Sessão ativa como uma composição hero-first (timer dominante, resto sob demanda).
12. Achatar os 4 blocos `dl` da Sessão em um layout de cartão de contexto, não tabela de definição.
13. Dar à página Insights uma composição visual própria em vez de grade de stat-cards residual.
14. Compor a aba "Histórico" do Diário com o mesmo cuidado visual da timeline de Marcos.
15. Compor "Revisões" (dentro da Sessão) além de `<select>` + botão.
16. Diferenciar visualmente os 4 usos de `.ai-panel` por natureza de conteúdo (filtro vs. leitura vs. histórico vs. conversa).
17. Reduzir o aninhamento de recorrência do formulário de evento de 3 para no máximo 2 níveis.
18. Trazer a visão de Mês da Agenda para uma composição própria, não grade de calendário genérica.
19. Achatar o aninhamento do painel "Analisar" do Diário de 3 para 2 níveis de caixa.
20. Padronizar os 3 níveis de riqueza de empty state em um critério documentado (quando usar cada um).
21. Substituir "Carregando…" solto em 3 telas pelo padrão `skeletonView.js`/`stateView.js`.
22. Consolidar o "meio-degrau" de espaçamento (.6/.65/.7/.85/.9/1.3rem) na escala oficial.
23. Referenciar o token eyebrow nos 2 sites que hoje reescrevem seu valor.
24. Nomear 2-3 durações de animação recorrentes (pulso, reveal) como tokens.
25. Redesenhar os modais utilitários (Categorias, Diagnóstico, Calendário Acadêmico) com pelo menos um elemento de composição além de "formulário em caixa".
26. Adicionar um lint de CSS (`stylelint` com regra de "no hardcoded value") ao `npm run verify`.
27. Levar 1-2 ícones do onboarding para reaparecerem em momentos reais do produto (ex.: primeiro streak com `iconFlame`).
28. Resolver o scroll horizontal forçado da grade Semana/Mês em telas <480px.
29. Dar padding em escala de `--space-*` a `.event-card` (hoje literal `.9rem 1rem`).
30. Unificar os 2 valores de `border-radius` da família de "wrap" (`.wk-wrap` etc.) para nomear explicitamente `--radius-md` em vez do alias legado `--radius`.

---

# 15. As 30 melhorias com maior impacto na experiência

1. Calibrar `confirmDialog({danger:true})` para refletir reversibilidade real — remover de "Cancelar sessão".
2. Padronizar escopo de recorrência em toda exclusão (card da lista e evento acadêmico, não só o modal).
3. Aumentar a fricção de exclusão de conta para pelo menos o nível de troca de senha (reautenticação).
4. Adicionar toast de sucesso ao QuickAdd, igualando o feedback do formulário completo.
5. Trocar o tom do toast de exclusão de conta de `info` para `success`, igualando o resto do produto.
6. Reduzir a densidade da tela de Sessão ativa — menos simultâneo visível, mais sob demanda.
7. Dar à Sessão de Estudo uma hierarquia clara: cronômetro como único elemento sempre visível, resto atrás de um único ponto de entrada.
8. Revisar se os 3 níveis de disclosure/aninhamento do formulário de recorrência podem virar 2 decisões sequenciais em vez de uma árvore.
9. Reescrever as mensagens de erro/validação do login/cadastro com a mesma voz do onboarding.
10. Levar a narrativa (frases interpretativas) também para Insights, substituindo parte da grade de stat-cards.
11. Dar um critério único e documentado para quando um empty state usa `.state-block` completo vs. texto simples.
12. Unificar o padrão de loading nas 3 telas que ainda usam "Carregando…" solto.
13. Revisitar se `recurrenceScopeDialog` deveria usar estilo de perigo quando a opção escolhida é "toda a série" (resultado destrutivo).
14. Dar feedback consistente (toast) em toda ação de escrita relevante — hoje Questões/Sessão têm, Revisões não.
15. Reduzir o número de grupos irmãos no disclosure de Progresso (5 hoje) — considerar fundir Recordes em Períodos.
16. Dar à aba "Histórico" do Diário uma experiência de consulta, não só uma lista filtrável.
17. Simplificar a visão de Mês da Agenda como uma consulta rápida, deixando o trabalho pesado para Dia/Semana.
18. Revisitar se "Revisões" (dentro da Sessão) precisa de composição própria equivalente à de Questões.
19. Levar o vocabulário de "revelação em sequência" dos modais rituais para pelo menos 1-2 modais utilitários.
20. Reduzir a arquitetura de 9 itens de navegação (sidebar) para uma hierarquia mais curta, se alguma combinação fizer sentido.
21. Investigar se "Analisar" (Diário) precisa mesmo de 3 níveis de disclosure ou se período+categoria podem ficar sempre visíveis.
22. Padronizar mensagens de sucesso/erro para o mesmo padrão de tom entre features (hoje cada `*View.js` escreve o próprio texto solto).
23. Reaproveitar o `iconFlame` do onboarding no momento real de primeiro streak, criando continuidade emocional.
24. Revisitar o tempo de espera da IA — hoje 4 estágios textuais (0/2s/6s/12s); considerar um indicador visual de progresso além do texto.
25. Simplificar a árvore de decisão do modal de início de sessão (manual vs. compromisso) se o caso "compromisso" puder ser sempre a aba padrão quando há compromisso de hoje.
26. Investigar se os 3 selects de "salvar metas" em `accountView.js` (cada um com o próprio botão/toast) poderiam virar 1 salvamento único.
27. Dar tratamento visual distinto a "Excluir categoria"/"Excluir calendário" (cascata para eventos filhos) vs. exclusões simples — hoje o mesmo `confirmDialog` genérico serve para consequências de escopo muito diferente.
28. Reduzir o tempo de leitura da recap de fechamento do dia (`.close-day-screen`) se a sequência de 4 números revelados um a um estiver competindo com a intenção de "15 segundos" já documentada.
29. Levar o padrão de sugestão-por-chip (já usado em início de sessão) para a criação de compromisso, reduzindo ainda mais a necessidade de digitação no caso comum.
30. Revisitar se a distinção "Notificações" (agora unificada) precisa de uma segunda camada de configuração (horário, antecedência) exposta de forma mais direta, já que a unificação escondeu a granularidade que talvez ainda seja necessária para alguns usuários.

---

# 16. Componentes que deveriam ser completamente redesenhados

1. **`.ai-panel` como padrão único de painel lateral** — não a mecânica (abrir/fechar/foco), mas a composição visual precisa se ramificar em pelo menos 2 variantes: "gaveta de filtro/controle" (Diário, Questões/Revisões) e "gaveta de leitura/conversa" (IA, Histórico).
2. **Os blocos `dl` de contexto da Sessão (`.ss-context-row`)** — formato de tabela de definição para o que deveria ser uma composição de cartão de status.
3. **`.event-card`/`.stat-card`** — decidir deliberadamente se são uma terceira variante nomeada da família de cartão ou se devem se fundir com `.card`.
4. **O contêiner de ícone** (não o glifo) — precisa da mesma disciplina de token que o SVG já tem.
5. **Modais utilitários genéricos** (Categorias, Diagnóstico, Calendário Acadêmico) — hoje são `.modal-lg` sem nenhuma composição além de formulário empilhado.
6. **`.cal-chip`/`.wk-allday-chip`** — decidir entre migrar para pill ou formalizar como família retangular deliberada.

# 17. Telas que deveriam ser reconstruídas

1. **Sessão de Estudo (ativa)** — candidata única de reconstrução completa desta auditoria; todo o resto é refinamento incremental.
2. **Insights (dentro de Progresso)** — a grade de stat-cards residual deveria ser substituída, não só reorganizada.
3. **Histórico (aba do Diário)** — sem composição visual própria hoje; merece o mesmo nível de cuidado da timeline de Marcos.
4. **Agenda — visão de Mês** — grade de calendário genérica sem nenhuma assinatura visual do produto.

# 18. Fluxos que deveriam ser simplificados

1. **Exclusão de compromisso recorrente** — unificar comportamento entre modal, card da lista e evento acadêmico.
2. **Fricção de exclusão de conta vs. troca de senha** — inverter a proporção atual.
3. **Recorrência no formulário de evento** — reduzir de 3 para 2 níveis de decisão aninhada.
4. **Registro de revisão** — decidir deliberadamente se merece toast (hoje é o único registro de escrita relevante sem um).

---

# 19. Design emocional

**Existe prazer em usar?** Sim, em momentos pontuais bem desenhados: o fechamento do dia (`.close-day-screen`, revelação sequenciada de números) e a celebração de conquista (`.achv-celebration-screen`, badge com burst de anéis) são os dois melhores momentos do produto — e, não por acaso, os dois únicos que romperam deliberadamente com o padrão `.modal-card` genérico.

**Existe recompensa visual?** Parcialmente. O anel de meta e o heatmap de constância (Progresso) são recompensas visuais reais. Fora disso, a maior parte do produto responde a uma ação com um toast de texto — funcional, nunca celebratório, mesmo quando a ação merece (ex.: finalizar uma sessão longa dá o mesmo peso de toast que salvar uma foto de perfil).

**Existe sensação de progresso/evolução?** Sim — streak, heatmap, anel de meta e a narrativa de Progresso cobrem isso de forma genuína e sem gamificação artificial, coerente com a Visão do Produto ("conquistas existem como constatação, não como cobrança").

**Existe personalidade?** Só em dois lugares: o onboarding (texto) e os dois momentos rituais (fechamento do dia, celebração). O resto do produto — formulários, erros, toasts, painéis — fala com a voz neutra de qualquer software.

**Onde criar momentos memoráveis sem adicionar funcionalidade:**
- Reaproveitar o vocabulário visual do onboarding (ícones `iconSparkle`/`iconRepeat`/`iconFlame`) em marcos reais do produto — hoje eles são usados uma única vez e nunca mais.
- Dar ao "Continuar: {título}" da tela Hoje (retomar a última sessão) um tratamento visual levemente mais caloroso que um botão secundário padrão — é literalmente o momento de "bem-vindo de volta" do produto, hoje visualmente idêntico a qualquer outro botão.
- Diferenciar o toast de "sessão longa concluída" do toast de "questão anotada" — mesma classe de UI, pesos emocionais completamente diferentes na vida real do usuário.
- Levar a revelação sequenciada (já validada no fechamento do dia) para pelo menos um outro momento de "resumo" do produto — hoje é uma técnica usada uma única vez.

---

# 20. Benchmark

Comparação de princípios, não de interface:

| Princípio | Referência | Anoti hoje |
|---|---|---|
| **Hierarquia** | Coisas importantes ficam sozinhas (Apple Health: 1 anel domina a tela) | Hoje/Progresso hero fazem isso bem; Sessão e Insights, não |
| **Simplicidade** | Um comportamento por componente (Things: uma lista é sempre uma lista) | `.ai-panel` serve 4 comportamentos com a mesma forma |
| **Densidade** | Densidade varia por intenção (Linear: denso para navegar, aberto para focar) | Densidade não correlaciona com "modo foco" — a tela de Sessão (que tem literalmente um "modo foco" no código) é a mais densa do produto |
| **Ritmo** | Cada tela tem seu próprio compasso, mas o produto inteiro tem uma cadência reconhecível (Craft) | Cada tela resolveu a própria densidade isoladamente; não há cadência de produto |
| **Clareza** | Cor de perigo nunca mente (Todoist: vermelho é sempre "vai sumir") | Vermelho às vezes é reversível (Cancelar sessão), às vezes não é aplicado onde deveria (recorrência via card) |
| **Foco** | Uma tela, uma pergunta (TickTick: a tela de tarefa de hoje não pergunta nada além de "o que fazer agora") | Hoje faz isso bem; Sessão faz o oposto |
| **Elegância** | Um token center, aplicado sem exceção (Raycast) | Tokens existem e cobrem ~75-80% do CSS; a exceção ainda é grande o bastante para ser notada |
| **Personalidade** | Voz consistente em toda superfície, inclusive erro (Sunsama, Readwise) | Voz existe só no onboarding e nos 2 momentos rituais |

**O que não copiar**: nenhuma dessas referências resolve o domínio de "estudante de Medicina com rotina de plantão" — a arquitetura de produto do Anoti (Hoje → Sessão → Reflexão → Fechar) já é mais adequada ao público do que qualquer analogia direta com essas referências permitiria. O benchmark serve só para os oito eixos da tabela, nunca para "parecer com".

---

# 21. Propostas de redesign estrutural

1. **Reconstruir `#page-study-session` como composição hero-first.** Cronômetro + 1-2 ações primárias sempre visíveis; Questões, Revisões e contexto do compromisso migram para um único ponto de entrada ("Detalhes da sessão") em vez de coexistirem simultaneamente na tela. Justificativa: é a tela mais usada e a mais densa do produto — nenhuma outra mudança desta auditoria tem impacto de percepção maior.
2. **Ramificar `.ai-panel` em 2 composições visuais** — uma para controle/filtro (borda mais dura, densidade de formulário) e outra para leitura/conversa (mais respiro, tipografia maior, sem grade). Justificativa: a mesma "gaveta cinza" hoje serve tanto para "escolher filtros" quanto para "ler uma resposta de IA" — dois modos mentais diferentes tratados como um.
3. **Absorver Insights dentro da narrativa de Progresso**, eliminando a grade de stat-cards residual como segunda camada de números. Justificativa: é o único remanescente real do "BI pessoal" que a própria Visão do Produto declara fora de escopo.
4. **Reorganizar a navegação de 9 para uma hierarquia mais curta**, avaliando se "Calendários Acadêmicos" e "Categorias" (hoje itens de "Gerenciar" na sidebar) deveriam viver dentro de Configurações em vez de ao lado de páginas de conteúdo. Justificativa: nenhuma delas é uma página no sentido dos outros 5 itens — misturar "gerenciar" com "navegar" é o tipo de decisão que faz a sidebar parecer um menu de admin.
5. **Substituir `.cal-chip`/`.wk-allday-chip` pela geometria pill do resto do badge system**, ou formalizar deliberadamente por que a Agenda precisa de uma forma diferente (ex.: legibilidade em grade densa) — hoje é uma divergência sem decisão por trás.

---

# 22. Roadmap Final

Cada etapa é pequena o suficiente para uma única PR, na mesma tradição das rodadas F13–F18 (poda, fusão, correção de costura — nunca produto novo).

### Fase A — Enforcement (a causa estrutural raiz)

**A1. Adicionar `stylelint` com regras de token ao `npm run verify`**
- Objetivo: impedir que `font-size`/`border-radius`/`box-shadow`/cor hex fora de `var(--...)` seja mesclado sem sinalização.
- Motivação: sem isso, cada rodada de auditoria manual é temporária — a arquitetura de muitas PRs pequenas reintroduz literais estruturalmente.
- Impacto esperado: interrompe a deriva de token na origem, não só na auditoria.
- Arquivos: `package.json` (script `verify`), novo `.stylelintrc`, `.github/workflows/ci.yml`.
- Complexidade: média (a regra vai acusar o backlog de literais existente — decidir se falha o CI hoje ou só relata).
- Riscos: ruído inicial alto se todo o backlog de literais virar erro de CI de uma vez; considerar `warn` antes de `error`.
- Critério de aceite: `npm run verify` falha (ou avisa) ao introduzir um `font-size`/`border-radius` fora de token num arquivo tocado pela PR.

### Fase B — Unificação de elevação e forma

**B1. Migrar `.event-card`/`.stat-card` para `--radius-lg`/`--shadow-md`**
- Objetivo: fechar a bifurcação de elevação identificada em P0.2.
- Arquivos: `style.css` (linhas ~1906-1911 e correlatas).
- Complexidade: baixa. Riscos: nenhum funcional, só visual — checar contraste em telas onde os cards aparecem lado a lado com `.card`.
- Critério de aceite: nenhum seletor `*-card` restante referenciando `var(--radius)`/`var(--shadow-sm)` sem justificativa documentada.

**B2. Migrar `.cal-chip`/`.wk-allday-chip` para `var(--radius-full)`**
- Objetivo/Motivação/Impacto: unificar geometria de rótulo curto com `.badge`.
- Arquivos: `style.css` (~1337, ~5049).
- Complexidade: baixa. Riscos: checar legibilidade em grade densa da Agenda antes de mesclar.
- Critério de aceite: `.cal-chip`/`.wk-allday-chip` usam `var(--radius-full)` ou um novo `--radius-chip` documentado.

**B3. Substituir os 5 `999px` hardcoded por `var(--radius-full)`**
- Arquivos: `style.css` (2133, 2294, 4061, 4298, 4306). Complexidade: trivial. Riscos: nenhum. Critério de aceite: `grep 999px style.css` retorna zero.

**B4. Criar `--color-on-primary` e substituir os 26 `#fff` crus sobre cor**
- Arquivos: `style.css` (`:root`, `[data-theme="dark"]`, + 26 sites). Complexidade: baixa. Riscos: nenhum (branco continua branco nos dois temas hoje; o token só documenta a decisão). Critério de aceite: zero `#fff` fora do `:root`.

### Fase C — Contêiner de ícone

**C1. Criar `--icon-box-sm/md/lg` e migrar `.btn-icon-sm/lg`, `.nav-icon`, `.smart-card-icon` e os ~6 outros wrappers**
- Objetivo: aplicar ao contêiner a mesma disciplina já aplicada ao glifo (F18.7).
- Arquivos: `style.css` (607-608, 826, 5563-5564, + demais).
- Complexidade: média (checar cada contexto visualmente). Riscos: mudança de 1-2px em alguns botões pode exigir ajuste fino.
- Critério de aceite: nenhum wrapper de ícone com valor cru fora dos novos tokens.

### Fase D — Calibração de perigo

**D1. Remover `danger:true` de "Cancelar sessão"**
- Arquivos: `studySessionView.js` (~340-346). Complexidade: trivial. Riscos: nenhum. Critério de aceite: o confirm de cancelar sessão usa `btn-secondary`/`btn-primary`, não `btn-danger`.

**D2. Adicionar escolha de escopo de recorrência ao excluir pelo card da lista e pelo evento acadêmico**
- Arquivos: `script.js` (618-638), `academicCalendarEventsView.js` (107-129), reaproveitando `recurrenceScopeDialog.js` já usado no modal.
- Complexidade: média. Riscos: precisa preservar o comportamento atual para itens não-recorrentes (delete direto). Critério de aceite: excluir uma ocorrência recorrente pelo card oferece os mesmos 3 escopos que o modal.

**D3. Igualar a fricção de exclusão de conta à de troca de senha**
- Arquivos: `accountView.js` (~478-509, reaproveitando o padrão de reautenticação de `_handleChangePassword`).
- Complexidade: média. Riscos: UX de reautenticação precisa de mensagem clara sobre por que está sendo pedida de novo. Critério de aceite: excluir conta exige reautenticação, não só um `confirmDialog`.

**D4. Trocar o toast de exclusão de conta de `info` para `success`**
- Arquivos: `accountView.js` (~499). Complexidade: trivial. Critério de aceite: `toast.success('Conta excluída. Até logo!')`.

### Fase E — Feedback consistente

**E1. Adicionar toast de sucesso ao QuickAdd**
- Arquivos: `quickAdd.js` (~125-128). Complexidade: trivial. Critério de aceite: criar um compromisso via QuickAdd dispara o mesmo `toast.success` do formulário completo.

**E2. Decidir e aplicar toast (ou ausência documentada) em registrar/remover revisão**
- Arquivos: `studySessionView.js` (~1331-1377). Complexidade: trivial. Critério de aceite: comportamento de toast consistente com Questões, ou uma linha de comentário explicando por que não.

### Fase F — Reconstrução da Sessão de Estudo (a etapa de maior impacto, dividida em sub-PRs pequenas)

**F1. Substituir os blocos `dl` de contexto por um cartão de status compacto**
- Arquivos: `index.html` (~607-636, 798-822), `style.css` (`.ss-context-row`). Complexidade: média. Riscos: preservar todos os dados hoje exibidos, só mudar o formato. Critério de aceite: nenhuma informação perdida, formato deixa de ser `dl`.

**F2. Mover Questões/Revisões para um único ponto de entrada ("Detalhes da sessão") em vez de painel sempre aberto ao lado**
- Arquivos: `studySessionView.js`, `index.html` (`#ss-panel`). Complexidade: alta (maior mudança estrutural desta auditoria). Riscos: usuários que hoje registram questão sem abrir nada perdem 1 clique de conveniência — mitigar mantendo o atalho "+1 questão" do mini-timer flutuante (`activeSessionIndicatorView.js`) como está. Critério de aceite: tela de Sessão ativa com cronômetro + no máximo 2 ações primárias visíveis por padrão; Questões/Revisões acessíveis em 1 clique.

**F3. Reduzir aninhamento de recorrência do formulário de evento de 3 para 2 níveis**
- Arquivos: `index.html` (~1390-1439), `eventFormView.js`. Complexidade: média. Critério de aceite: nenhum campo de recorrência a mais de 2 disclosures de profundidade.

### Fase G — Painéis diferenciados

**G1. Criar 2 variantes visuais de `.ai-panel`** (controle/filtro vs. leitura/conversa) sem alterar a mecânica de abrir/fechar/foco.
- Arquivos: `style.css` (`.ai-panel*`), aplicado seletivamente em `sj-panel` (filtro) vs. `ai-panel` (conversa).
- Complexidade: média. Riscos: manter acessibilidade (foco, Escape, aria) idêntica — só a composição visual muda. Critério de aceite: os 4 painéis continuam funcionalmente idênticos; pelo menos 2 variantes visuais distintas existem.

### Fase H — Texto e voz

**H1. Reescrever mensagens de validação/erro do login e cadastro com a voz do onboarding**
- Arquivos: `authView.js` (~191-349). Complexidade: baixa (é troca de string). Riscos: nenhum. Critério de aceite: nenhuma mensagem de erro genérica de formulário sem alguma calibração de tom, revisão de copy aprovada pelo dono do produto.

**H2. Substituir "Carregando…" solto por `stateView.js`/`skeletonView.js` em 3 telas**
- Arquivos: `accountView.js`, `diagnosticModal.js`, `academicCalendarView.js`. Complexidade: baixa. Critério de aceite: as 3 telas usam o padrão central de loading, zero string solta.

### Fase I — Ícones e repetição de markup

**I1. Substituir os 52 SVGs inline duplicados por injeção via `icons.js`**
- Arquivos: `index.html` (todas as ocorrências), `icons.js` (já existe). Complexidade: média-alta (toca muitos pontos do HTML). Riscos: verificar que nenhum ícone tem variação de `stroke-width`/`viewBox` que o catálogo central não cubra. Critério de aceite: zero `<svg>` com path duplicado — todos vêm de `icons.js`.

**I2. Extrair o botão de disclosure repetido 7× em um componente único**
- Arquivos: `index.html` (7 sites), possivelmente um pequeno helper em JS que gera o markup. Complexidade: baixa-média. Critério de aceite: um único template gera as 7 instâncias, com id/aria-controls/label parametrizados.

### Fase J — Telas de menor investimento visual

**J1. Compor visualmente a aba "Histórico" do Diário**
- Arquivos: `studyJournalView.js`, `style.css`. Complexidade: média. Critério de aceite: a aba deixa de ser lista+checkbox crus, ganha ao menos uma composição equivalente à timeline de Marcos.

**J2. Compor visualmente "Revisões" dentro da Sessão**
- Arquivos: `studySessionView.js`, `style.css`. Complexidade: média. Critério de aceite: `<select>` + botão vira uma composição com o mesmo nível de cuidado de Questões.

**J3. Dar à visão de Mês da Agenda uma composição própria**
- Arquivos: `calendar.js`, `style.css`. Complexidade: alta (é a view mais antiga e mais usada em desktop). Riscos: não regredir a densidade de informação que a visão de Mês precisa manter (é a única visão "panorâmica"). Critério de aceite: pelo menos um elemento visual que não existe em nenhuma biblioteca de calendário genérica.

**J4. Absorver Insights dentro da narrativa de Progresso**
- Arquivos: `activityDashboardView.js`, `insightsView.js`, `index.html` (~894-928). Complexidade: alta (decisão de produto sobre o que sobrevive da grade). Riscos: usuários que hoje consultam os números crus de Revisões/Produtividade podem sentir perda se a narrativa não cobrir os mesmos casos. Critério de aceite: nenhuma grade de stat-cards sobrevive fora de disclosure explícito, e a narrativa cobre pelo menos os mesmos insights.

---

## Ordem de execução recomendada

**Sprint 1 (fundação, baixo risco, alto valor de prevenção):** A1, B3, B4, D1, D4, E1, H2.
**Sprint 2 (unificação visual, risco médio):** B1, B2, C1, I2, H1.
**Sprint 3 (calibração de risco, toca lógica de produto):** D2, D3, E2.
**Sprint 4 (a etapa de maior impacto, feita em 3 PRs pequenas):** F1 → F3 → F2, nesta ordem (a mais estrutural, F2, por último, depois que o resto da tela já estiver mais limpo).
**Sprint 5 (personalidade e telas negligenciadas):** G1, I1, J1, J2.
**Sprint 6 (decisão de produto, não só de design):** J3, J4 — ambas exigem validação do dono do produto antes de qualquer PR, porque envolvem decidir o que desaparece, não só como algo se parece.

---

*Fim da auditoria. Nenhuma alteração de código foi feita como parte deste documento — só leitura e análise, conforme escopo definido.*
