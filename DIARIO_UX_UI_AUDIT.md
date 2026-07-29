# Auditoria UX/UI — Página "Diário" (Anoti)

> Escopo: exclusivamente `#page-journal` (index.html) e os módulos que renderizam nela: `studyJournalView.js`, `activityHistoryView.js` (aba "Histórico"), e os serviços puros associados (`studyTimelineService.js`, `studyMilestoneService.js`, `studySearchService.js`, `studyStatisticsService.js`, `studyReflectionService.js`). Nenhum código foi alterado nesta auditoria. Não foram analisadas outras páginas do produto, não foram procurados bugs, e nenhuma funcionalidade nova foi sugerida.
>
> Nota de contexto: assim como a página Progresso (ver `PROGRESSO_UX_UI_AUDIT.md`), o Diário já passou por diversas rodadas de redução de densidade — os comentários no próprio código documentam pelo menos 8 iterações anteriores (F8.3 a F18.16, "Etapa 1" a "Etapa 6", "auditoria UX radical"): a busca deixou de ficar sempre aberta, os filtros avançados foram movidos para um painel lateral sob demanda, o resumo semanal narrativo foi removido por redundância com o Progresso, o card de comparação diária foi reduzido a uma linha dentro do cabeçalho do dia. Isso significa que a página já não sofre do problema mais grosseiro ("dashboard cru") — mas ainda assim transmite a sensação de excesso de informação relatada, porque a redução aconteceu por remoção pontual de campos, não por uma reformulação da experiência como um todo. Esta auditoria parte desse estado já maduro e busca o próximo nível.

---

## 1. Objetivo da página

O Diário não existe para "listar sessões de estudo". Ele existe para responder, em menos de 5 segundos e sem esforço de leitura, a uma pergunta que muda de tom conforme o momento em que o estudante abre o app:

**"O que eu fiz, e isso me deixa orgulhoso de continuar amanhã?"**

Essa pergunta se decompõe, em ordem real de importância para quem abre o Diário todos os dias por meses ou anos:

1. **O que estudei hoje/recentemente?** (memória imediata — a primeira coisa que os olhos procuram)
2. **Quanto estudei?** (volume, sem precisar somar manualmente)
3. **Estou evoluindo, ou este período foi mais fraco que o anterior?** (comparação com o próprio passado)
4. **Existe algo pendente que eu deveria revisar?** (ação, não só leitura)
5. **Como me senti / o que aprendi de fato — não só o que "fiz"?** (a Reflexão é a única escrita da tela; é onde mora o "diário" de verdade)
6. **Onde estou na minha jornada como um todo?** (marcos, constância, sensação de progresso acumulado — não apenas o dia isolado)

Perguntas que o Diário **não** precisa responder com destaque — e que hoje competem por atenção com as seis acima: "quantas questões respondi no período todo, em número absoluto", "qual a taxa de acerto exata em %", "quais sessões batem com os 8 filtros avançados que configurei uma vez". Essas são ferramentas de análise pontual, legítimas, mas pertencem a uma camada secundária — nunca à primeira leitura.

**Veredito**: a página responde bem às perguntas 1, 2 e 4 (título, duração, badge de questões, seção "Revisões" no detalhe). Responde de forma fraca à pergunta 3 (a comparação com o dia anterior existe, mas é uma linha discreta de badges técnicos, sem nenhuma leitura emocional). Responde mal à pergunta 5 (Reflexão está tecnicamente sempre presente, mas visualmente é apenas mais uma das quatro seções do detalhe expandido — "Salvar reflexão" tem o mesmo peso visual que "ver lista de questões"). E praticamente não responde à pergunta 6 na primeira leitura — os "Marcos da Evolução", que são exatamente a resposta a essa pergunta, estão escondidos dentro de um `<details>` recolhido, abaixo da toolbar, antes mesmo da lista de sessões — location correta em teoria, mas sem nenhum convite visual para abrir.

---

## 2. Diagnóstico geral

### Nota: **6 / 10**

O Diário já eliminou o pecado mais grave (formulário de filtros permanente, resumo narrativo duplicado, card de comparação diária pesado) — isso é trabalho real e deve ser reconhecido. Mas o que sobrou é uma pilha de mecanismos de disclosure empilhados uns sobre os outros, cada um resolvendo seu próprio problema local, sem uma visão de conjunto de "como é a primeira leitura da tela". O resultado é uma tela que não parece mais um formulário, mas ainda parece um sistema de arquivo com boa organização — não um diário que alguém sente vontade de abrir.

### Principais pontos positivos

1. O redesenho do card de sessão (regra dos "3 segundos") é a melhor decisão de UX de toda a página: o card fechado mostra só título, horário, duração e contagem de questões — e seções vazias no detalhe (Questões/Revisões/Observações) simplesmente não aparecem, em vez de mostrar "Nenhuma questão registrada."
2. Remoção honesta de redundância: o resumo semanal narrativo foi removido explicitamente por duplicar o Progresso; o filtro de "matéria" foi removido por ser sempre idêntico ao de categoria. Isso mostra disciplina editorial real, rara em produtos que só acumulam funcionalidades.
3. Busca com highlight de trecho encontrado (`highlightMatches`) e indicação de "Encontrado em: X" — feedback de busca bem acima da média de apps de produtividade.
4. Filtros avançados e estatísticas de questão vivem atrás de um único painel lateral ("Analisar"), não mais espalhados pela tela principal — reduz a primeira dobra de forma real.
5. Marcos da Evolução, Reflexão e comparação com o dia anterior são recursos com potencial emocional genuíno (conquista, memória pessoal, progresso) que já existem tecnicamente — o problema atual é de hierarquia, não de ausência.

### Principais problemas

1. **A tela tem quatro mecanismos de disclosure independentes empilhados** (busca escondida atrás de ícone, painel "Analisar" escondido atrás de ícone, `<details>` de Marcos recolhido, e cada card de sessão individualmente recolhido) — cada um reduz densidade isoladamente, mas juntos criam uma tela onde quase tudo está escondido atrás de um clique, inclusive o conteúdo que deveria ser a atração principal (Marcos).
2. **A comparação com o dia anterior e os Marcos da Evolução — os dois elementos com maior potencial de "sensação de progresso" da tela — têm o menor peso visual dela**: a comparação é uma linha de texto com badges (↑+2 sessão, ↓−15 minuto) sem nenhuma cor de destaque nem leitura em português; os Marcos vivem atrás de um `<summary>` de `<details>` nativo, com a mesma aparência austera de um componente de sistema operacional.
3. **A Reflexão — a única escrita da tela, o componente mais "diário pessoal" que existe — está posicionada como a quarta e última seção do detalhe expandido**, atrás de Questões/Revisões/Observações, com o mesmo `<h3>` e a mesma caixa que os dados frios. Ela deveria ser o elemento mais convidativo da tela, não o último item de uma lista técnica.
4. **Quatro convenções visuais diferentes de "status" convivem na mesma tela**: cor de badge (`.review-status--{status}`), cor de ponto de timeline (severidade de marco), emoji + porcentagem (índice de acerto), e texto plano (tipo/status de questão) — o olho precisa reaprender o código de cor a cada seção do card expandido.
5. **Dois sistemas visuais de "linha do tempo" coexistem na mesma tela sem relação entre si**: a lista principal (`.sj-day-group`/`.sj-entry`, cartões) e o padrão `.ah-timeline` (linha vertical + ponto), usado tanto nos Marcos quanto na aba "Histórico" — um estudante que abre Marcos, depois a aba Histórico, e volta para Concluídas vê três linguagens visuais diferentes para o mesmo conceito de "registro datado".
6. **A toolbar mistura três affordances de interação diferentes numa única linha** (grupo de chips de período, toggle de busca, botão que abre um painel inteiro) sem nenhuma separação visual entre elas — tudo compete pelo mesmo espaço horizontal com o mesmo peso.

---

## 3. Inventário completo

| Componente | Finalidade | Importância | Manter | Simplificar | Fundir | Remover | Redesenhar |
|---|---|---|---|---|---|---|---|
| **Abas "Concluídas" / "Histórico"** `#sj-status-tabs` | Alternar entre visão rica (sessões concluídas) e visão compacta (todos os status) | Média — uso ocasional (auditoria/canceladas) | ✔ | — | — | — | Rótulo "Histórico" ainda soa técnico; considerar "Todas as sessões" |
| **Chips de período rápido** `.sj-quick-filters` (Hoje/Semana/Todas) | Atalho visual para o `<select>` de período | Alta — é o filtro mais usado no dia a dia | ✔ | — | Sim — hoje convive solto ao lado da busca e do painel; deveria ter respiro visual próprio | — | — |
| **Toggle de busca** `#sj-search-toggle` + `#sj-search-wrap` | Abrir campo de busca textual | Média — usada sob demanda, não a cada visita | ✔ | — | — | — | — |
| **Botão "Analisar"** `#sj-btn-open-panel` (+ badge de contagem) | Abrir painel lateral de estatísticas + filtros avançados | Alta como mecanismo, baixa como rótulo (não fala a língua do estudante) | ✔ | — | — | — | Sim: nome e ícone deveriam comunicar "estatísticas e filtros", não um verbo genérico |
| **Linha de estatísticas da busca** `#sj-search-stats` | "N sessão(ões) encontrada(s) · Xh estudadas" | Baixa isolada — só aparece com filtro ativo | ✔ | — | Sim — poderia viver dentro do próprio cabeçalho da lista, não como linha solta | — | — |
| **Painel "Marcos da Evolução"** `#sj-milestones-panel` (`<details>`) | Timeline de conquistas/marcos da jornada de estudo | Altíssima — é a resposta visual a "estou evoluindo?" | ✔ | — | — | — | Sim: é o componente com maior potencial emocional da tela e está com a menor prioridade visual — merece posição e tratamento de destaque, não um `<details>` recolhido |
| **Painel lateral "Analisar"** `#sj-panel` (modal/dialog) | Agrupa estatísticas de questões + todos os filtros | Alta como container, mas mistura dois propósitos (consulta vs. filtro) | ✔ | Sim — separar conceitualmente "ver meus números" de "filtrar minha lista" mesmo que compartilhem o mesmo painel | — | — | — |
| **Stat cards de questões (4x)** `.stat-cards.sj-stats` (Total/Acertos/Erros/Índice) | Estatísticas agregadas de questões no período filtrado | Média — útil, mas é a 4ª pergunta na lista de prioridades do estudante | ✔ | Sim — 4 cards `.stat-card--sm` lado a lado num painel estreito é denso; poderia virar 1 linha de texto + 1 número em destaque (índice de acerto) | — | — | — |
| **Select de período** `#sj-filter-period` | Período completo (todo/hoje/7d/30d) | Média — já duplicado pelos chips rápidos para os 3 casos mais comuns | ✔ | — | Sim — já é essencialmente redundante com os chips; poderia existir só dentro do painel para os casos não cobertos pelos chips | — | — |
| **Select de categoria** `#sj-filter-category` | Filtrar por categoria do compromisso vinculado | Média | ✔ | — | — | — | — |
| **Checkbox "com reflexão"** `#sj-filter-reflection` | Filtrar sessões com reflexão registrada | Baixa — uso raro/avançado | ✔ | — | Sim — os 3 checkboxes (reflexão/revisões/observações) + 2 selects (questões/duração) formam 5 controles avançados quase nunca usados juntos | — | — |
| **Checkbox "com revisões"** `#sj-filter-reviews` | Filtrar sessões com revisão agendada | Baixa | ✔ | — | Ver acima | — | — |
| **Checkbox "com observações"** `#sj-filter-notes` | Filtrar sessões com observações | Baixa | ✔ | — | Ver acima | — | — |
| **Select "questões" (com/sem/todas)** `#sj-filter-questions` | Filtrar por presença de questões | Baixa | ✔ | — | Ver acima | — | — |
| **Select "duração" (longa/curta)** `#sj-filter-duration` | Filtrar por duração da sessão | Baixa | ✔ | — | Ver acima | — | — |
| **Contador de filtros avançados** `#sj-advanced-filters-count` | Badge numérico mostrando quantos filtros avançados estão ativos | Alta como mecanismo (evita abrir painel só para checar) | ✔ | — | — | — | — |
| **Aviso de carregamento parcial** `#sj-filter-partial-notice` | Avisar que o histórico completo ainda está sendo buscado para o filtro | Necessária, uso raríssimo (só com histórico grande + filtro ativo) | ✔ | — | — | — | Tom mais discreto — hoje é texto de rodapé genérico |
| **Cabeçalho do grupo de dia** `.sj-day-header` (data + "Xh em N sessão(ões)") | Identificar o dia e resumir volume | Altíssima — é a âncora de leitura de toda a lista | ✔ | — | — | — | Sim: "Hoje"/"Ontem" merecem peso tipográfico maior que dias antigos — hoje todos os cabeçalhos têm o mesmo estilo |
| **Linha de comparação com dia anterior** `.sj-day-header-comparison` | Badges de delta (sessões/minutos/questões) vs. dia anterior | Alta em conceito — responde "estou evoluindo?" | ✔ | — | — | — | Sim: hoje é técnica (↑+2, −15min) sem cor nem linguagem humana; deveria ser a segunda coisa mais celebrada da tela |
| **Card de sessão (fechado)** `.sj-entry` | Título, horário, duração, contagem de questões, prévia de conteúdo | Altíssima — é o átomo da tela | ✔ | — | — | — | Pequenos ajustes de peso tipográfico (ver §5) |
| **Badge "Encontrado em: X"** `.sj-entry-matches` | Mostrar em qual campo a busca encontrou o termo | Baixa — só aparece com busca ativa | ✔ | — | — | — | — |
| **Chevron de expandir/recolher** `.sj-toggle.disclosure-toggle` | Abrir/fechar detalhe do card | Alta — mecanismo central da regra dos 3 segundos | ✔ | — | — | — | — |
| **Seção "Questões" (detalhe)** | Resumo (total/acertos/erros/índice) + lista de questões da sessão | Alta quando existe | ✔ | — | — | — | — |
| **Seção "Revisões" (detalhe)** | Lista de revisões agendadas com status | Alta quando existe — é acionável em potencial | ✔ | — | — | — | Considerar tornar clicável (leva à revisão real) |
| **Seção "Observações" (detalhe)** | Texto livre sobre a sessão (o que foi estudado) | Média-alta | ✔ | — | — | — | — |
| **Seção "Reflexão" (detalhe, sempre visível)** | Único campo de escrita da tela — a reflexão pessoal sobre o aprendizado | Altíssima conceitualmente, tratada como baixa visualmente | ✔ | — | — | — | Sim: merece tratamento visual de "diário pessoal" (fonte serifada/itálica, fundo diferenciado), não uma caixa `<h3>` igual às demais |
| **Botão "Carregar mais"** `#sj-load-more` | Paginação manual da lista | Média — necessária, mas interrompe o fluxo de leitura | ✔ | — | — | — | Avaliar scroll infinito discreto no lugar do botão explícito (fora do escopo de "sem código" — só citar como direção conceitual) |
| **Estado vazio "diário em branco"** `SJ_EMPTY_MARKUP` | Primeira experiência de um estudante sem sessões | Alta — primeira impressão do produto | ✔ | — | — | — | Já tem ilustração própria (`illustrationEmptyJournal`) — ponto positivo, manter tom |
| **Skeleton de carregamento** `skeletonRowsMarkup(4)` | Placeholder durante carregamento inicial | Necessária | ✔ | — | — | — | — |
| **Aba "Histórico" — checkbox "somente canceladas"** | Filtrar histórico completo para só sessões canceladas | Baixa — uso raro | ✔ | — | — | — | — |
| **Aba "Histórico" — lista com timeline** `.ah-timeline` | Lista compacta de todas as sessões (qualquer status) | Média — ferramenta de auditoria, não de uso diário | ✔ | — | — | — | Ver §5/§9: usa linguagem visual diferente da lista principal |

---

## 4. Problemas de UX (por impacto)

1. **Os dois elementos com maior potencial de "sensação de progresso" (Marcos da Evolução e comparação com o dia anterior) têm o menor destaque visual da tela.** Um estudante que estuda 3 dias seguidos e bate um recorde pessoal não recebe nenhum sinal forte disso ao abrir o Diário — só descobre se abrir manualmente um `<details>` recolhido ou ler uma linha discreta de badges no cabeçalho do dia.
2. **Quatro disclosures independentes na mesma tela** (busca / painel Analisar / Marcos / cada card) significam que, na primeira visita do dia, o estudante frequentemente precisa de 2-3 cliques antes de ver qualquer coisa além da lista crua de títulos — mesmo already tendo reduzido bastante a densidade inicial.
3. **A Reflexão, único ponto de escrita pessoal da tela, está posicionalmente enterrada** atrás de "abrir o card" → "rolar até a 4ª seção do detalhe". Para um produto que se define como "diário", esse é o comportamento inverso do esperado — a reflexão deveria ser tão acessível quanto o "conteúdo" que já aparece no card fechado.
4. **Os filtros avançados (5 controles) resolvem um problema que a maioria dos estudantes provavelmente nunca tem** ("mostre só sessões sem questões E com duração curta") — são uma ferramenta de auditoria pessoal ocasional, mas ocupam o mesmo painel, com o mesmo peso de acesso, que as estatísticas de questões (uma pergunta muito mais comum).
5. **Nenhum elemento da tela, exceto Reflexão, é acionável.** "Revisões" no detalhe expandido lista revisões pendentes mas não linka para a tela real de revisão — informa, mas não convida à ação, perdendo a chance de transformar o Diário em ponto de partida do dia de estudo, não só em arquivo do que já passou.
6. **A comparação com o dia anterior só aparece quando existe um dia anterior no conjunto filtrado** — em qualquer filtro que quebre a sequência (ex.: filtrar só por uma categoria específica, ou aplicar "somente com questões"), a comparação desaparece silenciosamente, sem indicar por quê, criando uma inconsistência percebida ("ontem tinha comparação, hoje com filtro não tem").
7. **A aba "Histórico" e a lista "Concluídas" respondem à mesma pergunta de fundo ("o que aconteceu") com estruturas de dado e visual diferentes** — um estudante que alterna entre elas (ex.: para conferir uma sessão cancelada) precisa reaprender a leitura da tela a cada troca de aba.

---

## 5. Problemas de UI (por impacto)

1. **Quatro convenções visuais de "status" diferentes convivem na mesma tela** (cor de badge para revisão, cor de ponto para severidade de marco, emoji+% para acerto, texto plano para tipo/status de questão) — sem um sistema único de cor/forma para "isto é bom" / "isto é neutro" / "isto precisa de atenção".
2. **`.sj-day-header` trata "Hoje" e "12/03/2024" com o mesmo peso tipográfico** — o dia mais relevante da tela (hoje) não se destaca de um dia de três meses atrás.
3. **A linha de comparação com o dia anterior usa símbolos técnicos (↑ +2 sessão, ↓ −15 minuto) em vez de linguagem humana** ("2 sessões a mais que ontem") — força uma pequena decodificação mental toda vez que aparece.
4. **Dois sistemas de "lista de eventos datados" com aparência totalmente diferente**: cartões com borda/sombra (`.sj-entry`) vs. linha do tempo com ponto e conector (`.ah-timeline`) — usados para o mesmo tipo de conteúdo (Marcos, aba Histórico) sem nenhuma razão perceptível para a diferença.
5. **O ícone do botão "Analisar" (`sliders-horizontal`, ícone de "controles deslizantes") não comunica "estatísticas"** — comunica apenas "ajustes", escondendo metade do conteúdo real do painel (os 4 stat cards) atrás de uma metáfora visual de filtro.
6. **Os ícones dos Marcos da Evolução são reaproveitados de ícones de navegação sem relação semântica** — o marco de tipo "flame" (sequência/constância) renderiza o ícone de "sparkle" (usado no menu para IA), e o marco "book" renderiza o ícone de calendário acadêmico. Um estudante que conhece os ícones do menu pode estranhar vê-los fora de contexto.
7. **A Reflexão usa exatamente a mesma caixa/`<h3>` que Questões/Revisões/Observações** — nenhuma pista visual (cor, textura, ícone, tipografia) diferencia "isto é um registro técnico" de "isto é algo que eu escrevi sobre mim mesmo".
8. **Espaçamento inconsistente dentro das regras `.sj-*` do CSS** — algumas usam os tokens de espaçamento do design system (`var(--space-4)`), outras usam valores rem soltos (`.4rem`, `.75rem`) — não é visível ao usuário final como um bug isolado, mas indica que a página não herda 100% do ritmo vertical do resto do produto.
9. **O badge do contador de filtros avançados e o contador de estatísticas de questão usam tratamentos visuais não relacionados** apesar de estarem lado a lado conceitualmente no mesmo painel "Analisar".

---

## 6. Problemas de carga cognitiva

- **Cinco controles de filtro avançado (3 checkboxes + 2 selects) para casos de uso que a maioria dos estudantes provavelmente usa raramente, se alguma vez** — ocupam o mesmo painel e o mesmo nível de acesso que as 4 estatísticas de questões, uma informação de consulta muito mais frequente.
- **O select de período duplica os 3 chips rápidos** (Hoje/Semana/Todas) e ainda adiciona 2 opções extras (7 dias/30 dias) — dois controles diferentes para o mesmo conceito, um visível sempre, outro escondido no painel.
- **Quatro seções condicionais no detalhe do card** (Questões/Revisões/Observações/Reflexão), cada uma com seu próprio `<h3>`, resumo e lista — um card com muito conteúdo (questões + revisões + observações + reflexão) vira, ao expandir, uma tela dentro da tela com 4 sub-títulos, cada um exigindo sua própria leitura.
- **A aba "Histórico" existe como uma segunda forma de ver essencialmente a mesma informação** (sessões, datas, status) que a lista "Concluídas" já mostra (para sessões concluídas) — a existência de duas abas para "sessões" versus "todas as sessões incluindo não concluídas" é logicamente justificável, mas obriga o estudante a entender a diferença entre "Concluídas" e "Histórico" antes de saber onde procurar algo.
- **A linha de comparação com o dia anterior soma três métricas ao mesmo tempo** (sessões, minutos, questões) — para uma leitura de "2 segundos", três números simultâneos com sinais e setas já é mais do que o cérebro processa de forma automática; uma frase teria menor carga.

---

## 7. Problemas de hierarquia

- Ao abrir o Diário, os olhos vão primeiro para a toolbar (chips + busca + Analisar) — mas nenhum desses três elementos é, de fato, o motivo pelo qual o estudante abriu a tela; são ferramentas de acesso ocasional competindo por espaço com o topo da página.
- O `<h1>Diário</h1>` não tem subtítulo/frase de apoio — diferente da tendência de produtos como Apple Journal/Day One, que sempre ancoram a abertura da tela com uma frase contextual ("Sua jornada até aqui", "N dias seguidos estudando") antes de qualquer lista.
- Os Marcos da Evolução — o componente com maior potencial de orgulho — estão posicionados corretamente (antes da lista), mas visualmente **abaixo** em prioridade: um `<details>` recolhido tem, por definição, menos peso visual que qualquer elemento sempre visível ao redor dele.
- Dentro do card expandido, todas as 4 seções (Questões/Revisões/Observações/Reflexão) têm exatamente o mesmo peso de `<h3>` — nenhuma delas se destaca como "isto é o que você escreveu", vs. "isto é um registro automático".
- O cabeçalho do dia trata "Hoje" com o mesmo peso que qualquer data histórica — o dia mais relevante (o de hoje, para quem está construindo o hábito) não recebe nenhum destaque tipográfico ou cromático especial.

---

## 8. Problemas de mobile

- **Nenhuma regra `@media` no CSS é dedicada às classes `.sj-*`/`.ah-*`** — todo o comportamento em telas de 360-430px depende inteiramente de `flex-wrap`/grid `auto-fit` naturais, sem ajuste fino de espaçamento ou tipografia testado explicitamente para esta página.
- **A toolbar com 3 affordances diferentes (chips + busca + Analisar) depende de quebra de linha automática** em telas estreitas — sem controle explícito de como isso se comporta, o resultado provável é uma segunda linha de controles logo no topo da tela, empurrando a lista para baixo da dobra.
- **O painel lateral "Analisar" com 4 stat cards + período + categoria + 5 filtros avançados é bastante conteúdo para uma única tela de 360px** — mesmo sendo um painel sob demanda (não permanente), quando aberto em mobile ele concentra praticamente todos os controles da página numa rolagem só, misturando "meus números" com "meus filtros" num único scroll.
- **Cards de sessão empilhados verticalmente sem nenhuma redução de densidade em mobile** — em telas pequenas, o cabeçalho do dia + N cards + o detalhe expandido de um deles geram rolagem longa sem pontos de resumo intermediários (ex.: sem "voltar ao topo do dia" ou indicação de quantos cards restam no dia atual).
- **Pull-to-refresh e long-press estão implementados** (bom sinal de atenção a mobile-first), mas não têm nenhum indicador visual dedicado a esta página — dependem inteiramente de estilo genérico compartilhado, o que é aceitável, mas significa que a "sensação de app nativo" não foi verificada especificamente aqui.

---

## 9. Problemas de consistência

- A página segue o design system de botões (`.btn`/`.btn-primary`/`.btn-ghost`/`.btn-icon`) de forma consistente — ponto positivo, sem botões "avulsos".
- **Inconsistência real**: dois padrões visuais de "lista cronológica" (`.sj-entry` cartão vs. `.ah-timeline` linha+ponto) coexistem dentro da mesma tela (Marcos usa timeline, Concluídas usa cartão, Histórico usa timeline) sem que o usuário entenda por que a mesma ideia ("uma linha de eventos no tempo") aparece desenhada de duas formas diferentes a poucos cliques de distância.
- **Ícones dos Marcos reaproveitados semanticamente incorretos** (ver §5, item 6) — quebra a expectativa de que o mesmo ícone sempre significa a mesma coisa em todo o produto.
- **Espaçamento**: uso misto de tokens de espaçamento (`var(--space-*)`) e valores rem soltos dentro das regras `.sj-*` — inconsistência de implementação que se traduz, na prática, em um ritmo vertical ligeiramente menos previsível que o resto do app.
- **Nomenclatura**: "Analisar" (botão) não corresponde ao conteúdo real do painel (que é majoritariamente filtros, com estatísticas anexadas) — um desalinhamento pequeno mas perceptível entre rótulo e conteúdo.
- O painel "Analisar" reaproveita a mesma estrutura visual/comportamental do painel de IA (`aiPanelView.js`) — ponto positivo de consistência (mesmo padrão de overlay, foco, Escape).

---

## 10. Oportunidades de redesign (conceitual, sem código)

1. **Trazer os Marcos da Evolução para fora do `<details>` recolhido** e dar a eles um tratamento visual de destaque (ex.: uma faixa horizontal de "conquistas recentes" logo abaixo do cabeçalho, sempre visível quando existir algo novo) — é o componente com maior potencial de orgulho e hoje está tecnicamente presente, mas emocionalmente invisível.
2. **Reformular a comparação com o dia anterior como frase humana com cor de destaque**, não como badges técnicos — "Hoje você estudou 40 minutos a mais que ontem" em vez de "↑ +40 minuto".
3. **Elevar a Reflexão para um tratamento visual distinto de diário pessoal** — tipografia diferenciada (ex.: itálico, fonte de leitura), talvez um pequeno ícone de "caderno" e um convite mais pessoal ("Como foi este estudo para você?") em vez do rótulo neutro "Reflexão" ao lado de Questões/Revisões/Observações.
4. **Unificar a linguagem visual de "linha do tempo"** — escolher um único padrão (cartão OU linha+ponto) para Marcos, Concluídas e Histórico, variando apenas densidade de informação por contexto, não a metáfora visual inteira.
5. **Separar conceitualmente, dentro do painel "Analisar", "meus números" de "meus filtros"** — mesmo compartilhando o mesmo painel físico, uma pequena divisão visual (não uma tela nova) ajudaria a comunicar que são duas coisas diferentes.
6. **Dar ao cabeçalho "Hoje" um tratamento tipográfico ou cromático distinto** de dias passados — reforça a sensação de "este é o meu presente", coerente com o objetivo de hábito diário.
7. **Tornar "Revisões" e "Observações", dentro do detalhe, pontos de entrada acionáveis** quando fizer sentido (ex.: revisão pendente linkando para a tela real de revisão) — sem criar telas novas, apenas reaproveitando navegação já existente.
8. **Reconsiderar a necessidade de 5 filtros avançados como controles permanentes no painel** — avaliar se poderiam virar uma única busca mais inteligente (a busca textual já é avançada via `studySearchService.js`), reduzindo o painel "Analisar" a estatísticas + os 2-3 filtros realmente usados.

---

## 11. Nova proposta de organização do Diário

Ordem ideal dos blocos, do topo para baixo:

**1. Cabeçalho com contexto, não só o título "Diário".**
Uma frase curta de abertura (ex.: streak/constância recente, reaproveitando dado já calculado em outro lugar do produto, como o Progresso) substitui o `<h1>` solto — dá à tela uma sensação de "abertura de diário", não de "título de seção de sistema".
*Justificativa*: hoje a tela começa direto em controles técnicos (abas, toolbar); um produto de journaling sempre ancora a abertura em algo humano antes de qualquer lista.

**2. Faixa de Marcos/conquistas recentes, sempre visível quando houver algo novo (sem `<details>`).**
Mantém `buildMilestones()` como fonte de dado (nenhum cálculo novo), mas muda o tratamento visual de "painel recolhido" para "destaque sempre visível quando há conteúdo, oculto por completo quando não há" (o padrão já usado corretamente pelas seções condicionais do detalhe do card).
*Justificativa*: é o elemento de maior potencial emocional da tela — dar-lhe visibilidade permanente (não escondida atrás de um clique) é a mudança de maior impacto possível sem alterar nenhum dado.

**3. Toolbar compacta: apenas os 3 chips de período + busca.**
O botão "Analisar" perde as estatísticas de questão (que migram para o topo do painel, mas com hierarquia clara de "seus números" vs. "seus filtros") e mantém-se como o único ponto de acesso a filtros avançados — sem tentar comunicar "estatísticas" com um ícone de controle deslizante.
*Justificativa*: reduz a mistura de 3 affordances diferentes numa única linha visual; a busca e os chips são uso frequente, o painel é uso ocasional — hoje têm o mesmo peso.

**4. Lista de dias, cada um com:**
   - Cabeçalho de dia com "Hoje"/"Ontem" tipograficamente destacados de datas antigas.
   - Comparação com o dia anterior como frase humana com cor (não badges técnicos).
   - Cards de sessão no padrão atual (já bem resolvido pela regra dos 3 segundos) — mantidos como estão.
   - Dentro do detalhe expandido, a Reflexão reposicionada como **primeira** seção (não a última), com tratamento visual distinto (tipografia/ícone de diário pessoal) das seções técnicas (Questões/Revisões/Observações), que passam a viver logicamente agrupadas depois dela.
*Justificativa*: inverte a prioridade visual atual (dados técnicos primeiro, reflexão pessoal por último) para refletir o propósito real da tela — o "diário" é sobre o que o estudante pensa do que fez, não só sobre o que fez.

**5. Painel "Analisar" reorganizado em duas seções visualmente separadas**: "Seus números" (estatísticas de questão) e "Filtrar lista" (período completo, categoria, os 5 filtros avançados).
*Justificativa*: elimina a ambiguidade de nome/conteúdo do botão "Analisar" sem precisar dividir em dois botões — a separação acontece dentro do mesmo painel.

**6. Aba "Histórico" permanece como está estruturalmente**, mas migra para o mesmo padrão visual de cartão da lista "Concluídas" (em vez de `.ah-timeline`), preservando sua densidade mais compacta apenas via menos campos por card, não via um sistema visual inteiro diferente.
*Justificativa*: elimina a inconsistência mais visível da página (duas linguagens de "lista de eventos") sem exigir nenhuma mudança de dado ou funcionalidade.

### Redução de informação visível inicialmente

Hoje, a primeira dobra sem nenhum clique mostra: abas + toolbar completa (chips+busca+Analisar) + linha de estatística de busca (quando há filtro) + `<summary>` de Marcos fechado + skeleton/lista. Com a proposta acima, a primeira dobra mostra: frase de abertura + faixa de Marcos (quando houver, já expandida — mais informação útil, porém mais compacta que o painel de filtros que ela substitui em prioridade) + toolbar reduzida a 2 affordances + lista. A contagem de *mecanismos de disclosure* na tela cai de 4 para 2 (busca continua sob demanda; painel "Analisar" continua sob demanda; Marcos deixa de ser um disclosure e vira conteúdo direto; cada card individual continua sendo o único disclosure "natural" e esperado em uma lista de registros) — uma redução de aproximadamente 40-45% na quantidade de decisões de interação que o estudante precisa tomar antes de chegar ao conteúdo que importa.

---

## 12. As 30 decisões de design que mais prejudicam a experiência do Diário

Ordenadas por impacto (maior → menor).

1. Marcos da Evolução — o componente de maior potencial emocional da tela — está escondido atrás de um `<details>` recolhido por padrão.
2. A Reflexão (única escrita pessoal da tela) é a última das 4 seções do detalhe expandido, com o mesmo peso visual que dados técnicos.
3. A comparação com o dia anterior usa símbolos técnicos (↑/↓, sinais, unidades abreviadas) em vez de linguagem humana.
4. "Hoje" no cabeçalho do dia tem o mesmo peso tipográfico que qualquer data antiga.
5. Quatro convenções visuais de "status" diferentes convivem na mesma tela sem sistema unificado.
6. Dois sistemas visuais de "linha do tempo" (cartão vs. linha+ponto) coexistem para o mesmo tipo de conteúdo.
7. O botão "Analisar" usa um ícone de "controles deslizantes" que não comunica as estatísticas que também vivem ali dentro.
8. Os ícones dos Marcos são reaproveitados de ícones de navegação sem relação semântica com o tipo de marco.
9. A toolbar mistura 3 affordances de interação (chips/busca/painel) numa única linha sem separação visual.
10. O select de período duplica os 3 chips rápidos sem uma relação visual clara entre os dois controles.
11. Cinco filtros avançados de baixo uso ocupam o mesmo nível de acesso que as estatísticas de questão, de uso mais frequente.
12. A comparação com o dia anterior desaparece silenciosamente quando um filtro quebra a sequência de dias, sem explicação.
13. O `<h1>Diário</h1>` não tem nenhuma frase de contexto/abertura — a tela começa "fria".
14. O card expandido pode variar de 1 a 4 seções empilhadas sem nenhuma previsibilidade de altura/leitura.
15. Nenhum item do detalhe (Revisões, Observações) é clicável/acionável além da própria Reflexão.
16. A aba "Histórico" usa estrutura de dado e visual diferentes da lista "Concluídas" para o mesmo tipo de conteúdo.
17. O painel "Analisar" mistura "meus números" (consulta) e "meus filtros" (ação) sem separação visual interna.
18. Espaçamento inconsistente entre tokens de design system e valores rem soltos dentro do CSS específico da página.
19. Nenhuma regra `@media` dedicada a esta página — comportamento em mobile depende inteiramente de wrap automático.
20. A linha "N sessão(ões) encontrada(s) · Xh estudadas" vive solta, sem vínculo visual com a lista que ela descreve.
21. O rótulo "Analisar" não corresponde ao conteúdo majoritário do painel (que é filtro, não análise).
22. A toolbar de busca esconde o campo atrás de um ícone mesmo sendo, ao lado do período, um dos filtros mais usados no dia a dia.
23. A ausência de qualquer hierarquia entre título ("o que estudei"), horário e duração no card — tudo tem peso visual parecido.
24. Nenhum indicador de "quanto ainda falta rolar" antes de abrir o painel "Analisar" ou os Marcos em mobile.
25. Revisões, Questões e Observações têm rótulos `<h3>` idênticos entre si e à Reflexão, sem hierarquia de "dado técnico" vs. "conteúdo pessoal".
26. O botão "Carregar mais" interrompe abruptamente o fluxo de leitura vertical, sem indicação de quanto conteúdo resta.
27. A badge "Encontrado em: X" usa um estilo de alerta neutro que não se conecta visualmente ao highlight já aplicado no texto do card.
28. O ícone de "Analisar" não muda de estado quando o painel está aberto — falta de feedback visual persistente do estado atual.
29. Nenhuma diferenciação visual entre "sessão de hoje" e "sessão de uma semana atrás" dentro do próprio card (fora do cabeçalho de dia).
30. A skeleton de carregamento é genérica (4 linhas) e não reflete o formato real dos cards que vão aparecer (cabeçalho de dia + card), criando um pequeno salto de layout ao carregar.

---

## 13. As 30 melhorias com maior impacto visual

1. Dar destaque cromático/tipográfico ao cabeçalho "Hoje" em relação a dias antigos.
2. Tirar os Marcos da Evolução do `<details>` e transformá-los em uma faixa sempre visível quando houver conteúdo.
3. Trocar os badges técnicos de comparação diária (↑/↓) por uma frase com cor de destaque.
4. Unificar o padrão visual de "linha do tempo" entre Marcos, Concluídas e Histórico.
5. Dar à Reflexão um tratamento tipográfico distinto (ex. itálico/serifada) das demais seções do detalhe.
6. Trocar o ícone do botão "Analisar" por um que reflita estatísticas, não apenas "ajustes".
7. Corrigir os ícones dos Marcos para refletirem semanticamente o tipo real de cada marco.
8. Unificar as 4 convenções de "status" (cor de badge, cor de ponto, emoji, texto plano) num único sistema visual.
9. Separar visualmente, dentro do painel "Analisar", a seção de números da seção de filtros (título, divisor, ou agrupamento visual).
10. Adicionar uma frase de abertura contextual acima da lista, substituindo o `<h1>` solto.
11. Padronizar o espaçamento das regras `.sj-*` para os tokens do design system, eliminando valores rem soltos.
12. Criar um esqueleto de carregamento que reflita a forma real dos cards (cabeçalho de dia + card), evitando salto de layout.
13. Dar peso visual maior ao número de streak/constância se aparecer nos Marcos, similar ao tratamento dado na página Progresso.
14. Reduzir os 4 stat cards do painel "Analisar" para um layout menos apertado (2x2 com mais respiro, ou 1 número em destaque + 3 secundários).
15. Adicionar um pequeno ícone de "caderno"/pessoal à seção de Reflexão para diferenciá-la visualmente das demais.
16. Dar contraste visual mais forte ao chip de período ativo (Hoje/Semana/Todas) em relação aos inativos.
17. Redesenhar a badge "Encontrado em: X" para se conectar visualmente ao highlight já aplicado no texto.
18. Dar ao botão "Analisar" um estado visual persistente de "aberto" enquanto o painel estiver visível.
19. Ajustar a hierarquia tipográfica do card fechado (título com peso maior que horário/duração).
20. Uniformizar a tipografia de todos os `<h3>` do detalhe expandido para refletir a nova hierarquia (técnico vs. pessoal).
21. Dar tratamento visual mais leve/discreto ao aviso de carregamento parcial, hoje com aparência de erro.
22. Revisar o contraste/peso do texto da linha "N sessão(ões) encontrada(s)" para não competir com o cabeçalho do primeiro grupo de dia logo abaixo.
23. Uniformizar o raio de borda e sombra entre `.sj-entry` (cartão) e `.stat-card--sm` (painel), hoje ligeiramente diferentes em contexto.
24. Dar um tratamento visual de "vitrine"/destaque ao primeiro Marco mais recente, se houver mais de um.
25. Adicionar uma pequena transição/realce visual (já existe `pulseUpdate` para o contador de filtros) também à mudança do resumo do dia, reforçando "isto mudou".
26. Revisar o alinhamento vertical entre os 3 chips de período e o botão de busca/Analisar na mesma linha da toolbar, hoje com alturas potencialmente distintas por serem tipos de elemento diferentes.
27. Dar destaque visual (cor de fundo sutil) ao card do dia atual como grupo, não só ao rótulo "Hoje".
28. Revisar o peso visual do botão "Carregar mais" para parecer convite de continuação, não fim abrupto da lista.
29. Padronizar o tamanho/proporção dos ícones reaproveitados de navegação quando usados fora de contexto (Marcos).
30. Ajustar o espaçamento entre o fim da lista de um dia e o início do cabeçalho do próximo, hoje potencialmente igual ao espaçamento interno entre cards do mesmo dia.

---

## 14. As 30 melhorias com maior impacto na experiência

1. Tornar os Marcos da Evolução visíveis por padrão — resposta direta a "estou evoluindo?" sem exigir um clique.
2. Reposicionar a Reflexão como primeira seção do detalhe, refletindo que é o coração do "diário", não um acessório técnico.
3. Traduzir a comparação com o dia anterior para linguagem humana, tornando-a lida em vez de decodificada.
4. Unificar o sistema de "status" para reduzir o esforço de reaprendizado a cada seção do card.
5. Separar "meus números" de "meus filtros" dentro do painel "Analisar", tornando a intenção de cada controle óbvia antes de clicar.
6. Reduzir os filtros avançados aos 2-3 realmente úteis, avaliando fusão dos demais na busca textual já avançada.
7. Tornar "Revisões" (no detalhe) um link real para a revisão correspondente, convertendo leitura passiva em ação.
8. Dar à comparação diária e aos Marcos prioridade de leitura acima da lista de sessões, não abaixo/escondidos.
9. Adicionar uma frase de abertura contextual (streak, constância) que dê à tela uma sensação de "chegada", não de "tela de sistema".
10. Unificar visualmente e estruturalmente a aba "Histórico" com a lista "Concluídas", reduzindo a curva de reaprendizado ao trocar de aba.
11. Corrigir a semântica dos ícones de Marcos, evitando associações erradas para quem já reconhece os ícones da navegação.
12. Explicar (mesmo que discretamente) por que a comparação com o dia anterior às vezes desaparece com filtros ativos.
13. Dar destaque emocional explícito ao primeiro/mais recente Marco, reforçando "conquista recém-desbloqueada".
14. Renomear o botão "Analisar" para algo que reflita o conteúdo real (estatísticas e filtros), reduzindo a hesitação antes de clicar.
15. Tornar a linha de estatística de busca parte visual do resultado (não uma linha solta), reforçando que ela descreve a lista abaixo.
16. Garantir que "Hoje" seja sempre a primeira coisa lida e reconhecida ao abrir a tela, reforçando o hábito diário.
17. Revisar o texto do estado vazio do painel "Analisar" (se houver) para tom de convite, não de ausência técnica.
18. Tornar o toggle de busca mais descoberto (ex. placeholder textual visível antes de expandir) para quem usa busca com frequência.
19. Considerar exibir o total de dias/streak recente próximo ao topo, reaproveitando dado já calculado no Progresso, sem duplicar cálculo.
20. Garantir consistência de comportamento entre long-press e o chevron explícito, hoje ambos levam à mesma ação sem reforço mútuo.
21. Reduzir a ambiguidade entre o `<select>` de período completo e os chips rápidos, evitando que o estudante ache que são filtros diferentes.
22. Garantir que abrir o painel "Analisar" em mobile não pareça uma segunda tela cheia de opções desconectadas do resto do fluxo.
23. Dar um caminho de saída rápida do painel/Marcos que não exija rolar até o topo (ex. já ter fechamento acessível — validar se está claro o suficiente).
24. Revisar se a badge de contagem de filtros avançados comunica claramente "isto está te escondendo dados" quando ativa.
25. Garantir, na aba Histórico, que "somente canceladas" tenha o mesmo nível de clareza de rótulo que os filtros da aba Concluídas.
26. Avaliar se o aviso de carregamento parcial deveria aparecer de forma mais proativa (antes de o usuário perceber dados faltando) do que reativa.
27. Garantir que a transição entre abrir e fechar um card individual não quebre a posição de leitura do estudante na lista (scroll jump).
28. Tornar claro, ao abrir "Analisar", quantos filtros avançados diferentes existem antes de rolar até eles (sumário rápido).
29. Avaliar se "Observações" poderia, quando muito longa, ter um resumo/preview truncado no card fechado (hoje é tudo ou nada — aparece só expandido).
30. Reforçar, textualmente, a diferença entre Observações ("o que fiz") e Reflexão ("o que aprendi/senti"), hoje distinguíveis só por quem já leu os comentários do código-fonte.

---

## 15. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR, e não introduz nenhuma funcionalidade nova — apenas reorganiza, simplifica ou redesenha o que já existe.

### Etapa 1 — Tirar os Marcos da Evolução do `<details>` recolhido
- **Objetivo**: exibir os Marcos da Evolução como bloco sempre visível (quando existir conteúdo), em vez de atrás de um `<summary>` fechado por padrão.
- **Justificativa**: é o componente de maior potencial emocional da tela e hoje tem a menor prioridade visual — a mudança de maior impacto possível sem tocar em nenhum cálculo.
- **Arquivos envolvidos**: `index.html` (`#sj-milestones-panel`, trocar de `<details>`/`<summary>` para um contêiner sempre expandido), `studyJournalView.js` (`_renderMilestonesPanel` — remover a lógica de `hidden` ligada ao estado de abertura do `<details>`, manter a lógica de ocultar quando `milestones.length === 0`), `style.css` (`.sj-milestones-panel*`).
- **Impacto esperado**: aumenta a percepção imediata de progresso/conquista ao abrir o Diário, sem nenhuma mudança de dado.
- **Complexidade**: baixa.
- **Riscos**: garantir que o bloco continue com boa altura/rolagem quando houver muitos marcos; validar que a remoção do `<details>` não quebre a navegação por teclado/leitor de tela que dependia do `<summary>`.
- **Critérios de aceite**: Marcos aparecem sem exigir clique quando existir ao menos 1 marco; painel continua oculto por completo quando não há marcos; nenhum dado ou cálculo foi alterado.

### Etapa 2 — Humanizar a comparação com o dia anterior
- **Objetivo**: substituir os badges técnicos (↑ +2 sessão, ↓ −15 minuto) por uma frase única em linguagem natural, com destaque de cor quando o dia for melhor que o anterior.
- **Justificativa**: hoje exige decodificação de símbolos; uma frase é lida instantaneamente e reforça a sensação de evolução.
- **Arquivos envolvidos**: `studyJournalView.js` (`_comparisonBadge`, `_renderDayComparison`), `style.css` (`.sj-summary-badge`, `.sj-summary-comparison-label`).
- **Impacto esperado**: leitura mais rápida e mais emocionalmente positiva da comparação diária, sem alterar `compareDailySummaries()` (studyTimelineService.js, já existente).
- **Complexidade**: baixa-média (é majoritariamente template de texto; decidir a regra de priorização de qual delta virar frase quando há mais de um sinal).
- **Riscos**: garantir que a frase não fique ambígua quando os deltas forem mistos (ex. mais sessões, porém menos tempo).
- **Critérios de aceite**: comparação aparece como 1 frase legível; nenhum cálculo foi alterado; comportamento de "não aparece sem dia anterior" é preservado.

### Etapa 3 — Reposicionar a Reflexão como primeira seção do detalhe, com tratamento visual próprio
- **Objetivo**: mover a seção "Reflexão" para o topo de `_renderDetail` (antes de Questões/Revisões/Observações) e diferenciá-la visualmente (tipografia/fundo) das demais seções técnicas.
- **Justificativa**: é a única escrita pessoal da tela e o elemento mais alinhado ao conceito de "diário" — hoje é tratada como a menos importante das quatro.
- **Arquivos envolvidos**: `studyJournalView.js` (`_renderDetail`, ordem de `sections.push`), `style.css` (nova classe para o bloco de reflexão, ex. `.sj-detail-section--reflection`).
- **Impacto esperado**: reforça o propósito emocional da tela sem alterar o mecanismo de salvar/editar já existente.
- **Complexidade**: baixa.
- **Riscos**: mínimo — é reordenação de blocos já renderizados e uma nova classe CSS.
- **Critérios de aceite**: Reflexão aparece antes de Questões/Revisões/Observações no detalhe expandido; possui tratamento visual distinguível das demais seções; nenhuma lógica de salvar/editar foi alterada.

### Etapa 4 — Dar destaque tipográfico/cromático ao cabeçalho "Hoje"
- **Objetivo**: diferenciar visualmente o cabeçalho de dia quando o rótulo for "Hoje", em relação a "Ontem" e datas antigas.
- **Justificativa**: reforça a sensação de presente/hábito diário, hoje ausente — todos os cabeçalhos de dia têm o mesmo peso visual.
- **Arquivos envolvidos**: `studyJournalView.js` (`_createDayGroup`/`_dayLabel` — adicionar uma classe condicional quando o dia for hoje), `style.css` (`.sj-day-header`, nova modificação `.sj-day-header--today`).
- **Impacto esperado**: leitura mais rápida de "onde estou agora" ao abrir a tela.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional.
- **Critérios de aceite**: o grupo do dia atual é visualmente distinguível dos demais; nenhuma mudança de agrupamento ou dado.

### Etapa 5 — Unificar a linguagem visual de "linha do tempo" entre Marcos, Concluídas e Histórico
- **Objetivo**: escolher um único padrão visual (cartão ou linha+ponto) para os três contextos que hoje usam desenhos diferentes para o mesmo conceito de "lista de eventos datados".
- **Justificativa**: elimina a inconsistência mais visível da página — o mesmo tipo de conteúdo (registro no tempo) aparece com 2 linguagens visuais diferentes a poucos cliques de distância.
- **Arquivos envolvidos**: `studyJournalView.js` (`_renderMilestonesPanel`, markup `.ah-timeline*`), `activityHistoryView.js` (markup dos itens da lista), `style.css` (`.ah-timeline*`, `.sj-entry*`).
- **Impacto esperado**: maior coerência visual sem alterar nenhum dado — usuário reconhece o mesmo padrão em qualquer contexto de "lista cronológica" do Diário.
- **Complexidade**: média-alta (é a mudança visual mais ampla do roadmap, toca 2 módulos e reaproveita/adapta CSS existente).
- **Riscos**: maior risco de regressão visual; testar cuidadosamente os 3 contextos (Marcos, Concluídas, Histórico) em todos os estados (vazio, poucos itens, muitos itens) após a padronização.
- **Critérios de aceite**: os três contextos usam a mesma linguagem visual de linha do tempo/cartão; nenhum dado, cálculo ou comportamento de expansão foi alterado.

### Etapa 6 — Separar "seus números" de "filtrar lista" dentro do painel "Analisar"
- **Objetivo**: introduzir uma divisão visual clara (título de subseção ou agrupamento) entre os stat cards de questões e os controles de filtro dentro do mesmo painel, e revisar o ícone do botão que o abre.
- **Justificativa**: hoje o painel mistura dois propósitos diferentes (consulta vs. ação) sob um único rótulo/ícone que só reflete um deles.
- **Arquivos envolvidos**: `index.html` (`#sj-panel`, `#sj-stats`, `#sj-advanced-filters` — adicionar cabeçalhos de subseção), `studyJournalView.js` (nenhuma lógica nova, apenas se necessário ajustar seletores), `style.css` (`.ai-panel--control`, novo estilo de subtítulo).
- **Impacto esperado**: reduz a ambiguidade de "o que vou encontrar ao clicar em Analisar" e melhora a navegação dentro do painel.
- **Complexidade**: baixa-média.
- **Riscos**: mínimo — mudança estrutural pequena dentro de um painel já existente.
- **Critérios de aceite**: o painel exibe claramente duas seções distintas (números / filtros); ícone e/ou rótulo do botão refletem melhor o conteúdo; nenhum filtro ou estatística foi alterado em comportamento.

### Etapa 7 — Corrigir a semântica dos ícones dos Marcos
- **Objetivo**: substituir os ícones reaproveitados sem relação semântica (ex. "flame"/constância renderizando o ícone de IA) por ícones já existentes no acervo (`icons.js`) que representem melhor cada tipo de marco, sem desenhar ícones novos.
- **Justificativa**: elimina uma associação visual incorreta para quem já reconhece os ícones de navegação em outros contextos do produto.
- **Arquivos envolvidos**: `studyJournalView.js` (`MILESTONE_ICON_GLYPHS`), `icons.js` (apenas consulta, sem criar ícone novo).
- **Impacto esperado**: maior coerência simbólica, sem custo de design novo (reaproveita o acervo existente).
- **Complexidade**: baixa.
- **Riscos**: mínimo — checar se algum ícone mais adequado já existe no acervo antes de decidir o mapeamento final.
- **Critérios de aceite**: cada tipo de marco usa um ícone semanticamente mais próximo do seu significado, sem novos SVGs criados.

### Etapa 8 — Adicionar frase de abertura contextual acima da lista
- **Objetivo**: substituir o `<h1>Diário</h1>` solto por um cabeçalho com uma frase curta de contexto (ex. reaproveitando dado de constância já calculado em outro serviço do produto, como o streak usado no Progresso).
- **Justificativa**: dá à tela uma sensação de "abertura de diário pessoal" em vez de "título de tela de sistema", alinhado ao objetivo de calma/orgulho do produto.
- **Arquivos envolvidos**: `index.html` (`#page-journal`, cabeçalho), `studyJournalView.js` (buscar/exibir o dado de contexto, reaproveitando serviço já existente, sem criar cálculo novo), `style.css` (novo estilo de subtítulo).
- **Impacto esperado**: primeira impressão mais humana e alinhada ao tom do restante do produto.
- **Complexidade**: média (depende de decidir qual frase/dado reaproveitar sem duplicar cálculo já feito em `studyStreakService`/Progresso).
- **Riscos**: evitar duplicar uma narrativa que já existe na página Progresso — a frase aqui deve ser específica do contexto "abrir o Diário", não uma cópia do resumo do Progresso.
- **Critérios de aceite**: cabeçalho da tela inclui uma frase de contexto além do título; nenhum novo cálculo foi introduzido (reaproveita serviço existente); a frase nunca aparece vazia (tem fallback para estudante novo).

### Etapa 9 — Reavaliar e reduzir os filtros avançados de baixo uso
- **Objetivo**: avaliar (com dados de uso reais, se disponíveis) quais dos 5 filtros avançados (reflexão/observações/revisões/questões/duração) são efetivamente usados, e reduzir os que não forem, deixando-os disponíveis apenas via busca textual avançada já existente (`studySearchService.js`).
- **Justificativa**: reduz a densidade do painel "Analisar" sem remover capacidade real — a busca textual já cobre boa parte desses casos.
- **Arquivos envolvidos**: `index.html` (`#sj-advanced-filters`), `studyJournalView.js` (`_onFilterChange`, `ADVANCED_FILTER_KEYS`), `studySearchService.js` (avaliar se a lógica de correspondência pode ser exposta via busca textual combinada).
- **Impacto esperado**: painel mais enxuto, menos decisões de interface para o caso comum.
- **Complexidade**: média (requer decisão de produto sobre quais filtros manter — não é puramente visual).
- **Riscos**: remover um filtro que algum estudante avançado realmente usa; recomenda-se validar com dados de uso antes de remover, não apenas por suposição de design.
- **Critérios de aceite**: painel "Analisar" contém apenas os filtros validados como úteis; nenhuma capacidade de filtro é perdida sem alternativa (via busca) para quem precisar dela.

### Etapa 10 — Unificar visualmente a aba "Histórico" com a lista "Concluídas"
- **Objetivo**: migrar `activityHistoryView.js` para o mesmo padrão de cartão usado por `.sj-entry`, preservando sua densidade mais compacta apenas por meio de menos campos exibidos, não por uma estrutura visual inteiramente diferente.
- **Justificativa**: reduz o esforço de reaprendizado ao trocar de aba — hoje as duas abas mostram o mesmo tipo de conteúdo de formas visualmente incompatíveis.
- **Arquivos envolvidos**: `activityHistoryView.js` (markup dos itens), `style.css` (`.ah-timeline*` → reaproveitar/adaptar `.sj-entry*`).
- **Impacto esperado**: maior familiaridade e consistência entre as duas visões da mesma página.
- **Complexidade**: média-alta (depende da Etapa 5 já ter unificado o padrão de timeline; esta etapa aplica o padrão final também à aba Histórico).
- **Riscos**: validar que a aba Histórico continua com bom desempenho de leitura mesmo com mais tipos de status (concluída/cancelada/em andamento) representados no novo padrão de cartão.
- **Critérios de aceite**: a aba Histórico usa a mesma linguagem visual de cartão da aba Concluídas; todos os status continuam claramente identificáveis; nenhuma funcionalidade de filtro foi alterada.

---

## Princípios para a página Diário

- O estudante nunca deve precisar abrir mais de 1 painel para descobrir se está evoluindo — a resposta a "estou progredindo?" deve estar sempre visível, nunca atrás de um `<details>` fechado.
- A Reflexão é sempre o elemento mais convidativo da tela, nunca apenas mais uma seção técnica entre outras — é a única escrita pessoal do Diário e deve parecer isso.
- "Hoje" é sempre visualmente distinguível de qualquer outro dia — reforça o hábito, nunca trata o presente como só mais uma linha da lista.
- Comparações (dia anterior, marcos, recordes) são sempre expressas em linguagem humana, nunca em símbolos técnicos que exigem decodificação.
- Nenhum conceito visual (timeline, status, ícone) tem mais de uma representação diferente na mesma tela sem uma razão perceptível pelo usuário.
- Filtros e estatísticas são coisas diferentes e, mesmo compartilhando um painel, devem estar visualmente separados — um é ação, o outro é consulta.
- Todo sinal de pendência (revisão, observação) é, sempre que possível, uma porta de entrada clicável para resolvê-la, não apenas uma constatação.
- A busca e os filtros mais usados no dia a dia (período, texto) ficam sempre a um clique; os de uso raro (filtros avançados) podem ficar a dois.
- Marcos e conquistas têm sempre tratamento visual de celebração — nunca a mesma aparência neutra de uma seção de dados técnicos.
- A tela deve poder ser compreendida — o que foi feito, quanto, e se isso representa evolução — em menos de 5 segundos de leitura, sem exigir nenhum clique.
