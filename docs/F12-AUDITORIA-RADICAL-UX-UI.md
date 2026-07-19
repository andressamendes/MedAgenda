# F12 — Auditoria Radical de UX/UI (Redesenho da Experiência)

**Produto:** Anoti — agenda e gestão de estudos para estudantes de Medicina
**Data:** 19/07/2026
**Método:** leitura integral de `index.html` (1330 linhas), `style.css` (4276 linhas) e das ~25 views que compõem a SPA, com foco deliberado em contagem de elementos por tela, não em funcionalidade ou bug.
**Escopo:** exclusivamente densidade de informação, hierarquia visual, quantidade de componentes e sensação de foco. **Nenhuma regra de negócio foi avaliada ou deve ser alterada.**
**Ponto de partida:** este documento assume que o F11 (Auditoria de Product Readiness) já foi executado — wordmark, ícones PWA, iconografia SVG única, atalhos de teclado, transições de página e Termos de Uso já existem no código atual. Este documento **não repete** aquele diagnóstico. O que resta depois de corrigir todos os problemas técnicos e de acabamento do F11 é um problema estrutural: **o produto tem excesso de componentes, não falta de polish.**

---

## Por que o produto ainda parece amador — a resposta em uma frase

**O Anoti nunca decidiu o que esconder.** Cada fase anterior (F9, F10, F11) resolveu um sintoma local — moveu um campo, trocou um emoji por SVG, colapsou uma seção — mas a arquitetura de informação de cada tela continua sendo "mostrar tudo o que existe, organizado em caixas". Progressive disclosure foi aplicado como *acréscimo* (um toggle a mais) em vez de como *princípio de layout* (a tela por padrão mostra uma coisa). O resultado: toda tela do produto tem entre 4 e 10 blocos visuais independentes competindo pela mesma atenção, cada um com seu próprio título, borda e ação. Isso é o oposto de como Linear, Notion e Things são desenhados — lá, cada tela tem **um** protagonista visual e todo o resto é texto simples, hover state ou está a um clique de distância.

Prova concreta no próprio código: 25 classes CSS diferentes contêm a palavra "card", 13 variantes de `.btn-*`, 4 componentes de aba distintos ainda coexistem (`ah-filter-tab`, `dash-tab`, `ss-start-tab`, `theme-tab`), e 70 ocorrências de `border:` explícito em `style.css`. Nenhum desses números é "errado" isoladamente — juntos, produzem uma interface onde tudo tem moldura.

---

## Avaliação pelos 10 eixos

### 1. Quantidade de informação por tela

O padrão dominante é **acumulação, não substituição**. Exemplos medidos diretamente no HTML:

- **Sessão ativa** (`#ss-active`): badge de status + timer + label do timer + barra de progresso + nota de pausa + `<dl>` com 6 pares rótulo/valor + 4 botões de ação + 2 blocos colapsáveis (Questões, Revisões), cada um com título, contador, toggle, lista, empty state, botão rápido, botão "com detalhes" e formulário de até 5 campos. Isso é **mais de 25 elementos de interface diferentes visíveis ou a um clique em uma única tela**, cujo único trabalho real é "mostrar um cronômetro rodando".
- **Modal de Novo/Editar compromisso**: CTA de iniciar sessão + formulário de 9 campos (alguns em disclosure) + bloco de recorrência (7 botões de dia da semana) + `smart-cards` de insight + bloco de histórico de sessões com 5 "tiles" de estatística + lista de histórico. Um modal que deveria durar 10 segundos ("mudar o horário") carrega o peso visual de uma página inteira.
- **Diário (Concluídas)**: busca + select de período + toggle "Filtros avançados" que revela 4 selects + 3 checkboxes + 2 selects (9 controles) + aviso de contagem parcial + painel de marcos + lista. Mesmo com o trabalho de disclosure do F10/F11, a tela ainda tem **19 controles de filtro possíveis** antes de chegar ao conteúdo.
- **Dashboard**: cards "Hoje" + 2 abas que revelam mais grades de cards + 2 seções de insights (Revisões, Produtividade), cada uma com título, aviso, erro e grade própria. Estruturalmente são **5 grades de card empilhadas na mesma página**.

Resposta à pergunta do briefing: **muito pouco do que está visível por padrão precisa estar.** O usuário abrindo a Sessão precisa ver o cronômetro e um botão de finalizar — o resto (contexto, questões, revisões) é *registro*, não *monitoramento*, e registro pode viver fora do campo de visão principal.

### 2. Quantidade de componentes

Sim, em todas as categorias listadas no briefing:
- **Cards demais:** Dashboard empilha 5 grades de card; qualquer tela de resumo vira uma parede de retângulos com título+número+texto.
- **Badges/chips demais:** status badge da sessão, contadores `ss-section-count`, filtros "Somente:" como chips, badges de categoria — cada um com sua própria cor de fundo.
- **Botões demais e iguais:** praticamente toda ação secundária é `btn btn-ghost btn-sm`, incluindo ações que deveriam ter peso diferente ("Adicionar questão" tem o mesmo peso visual de "Cancelar").
- **Bordas/caixas demais:** cada bloco (`ss-questions-block`, `insights-block`, `session-history`, `.filter-bar`) desenha sua própria caixa com borda — nenhuma tela usa espaço em branco como divisor.
- **Ícones demais:** cada botão de ação tem um SVG próprio ao lado do texto (correto para navegação primária, redundante em botões secundários de formulário — "Cancelar" não precisa de ícone).

### 3. Hierarquia visual

Em quase nenhuma tela existe **um** ponto focal claro. A Sessão ativa é o melhor candidato do produto (timer grande, `ss-timer-value`) mas imediatamente abaixo dele competem 6 linhas de metadado + 4 botões do mesmo tamanho. O Dashboard não tem hierarquia nenhuma: cards "Hoje" e cards de "Progresso e Conquistas" usam exatamente a mesma classe (`dashboard-cards`), então o olho não sabe o que é mais importante — tudo é do mesmo tamanho, cor e peso. O event modal tem uma hierarquia correta no topo (CTA "Iniciar sessão" com destaque primário — mérito do F11 E14) mas ela se perde 15 elementos depois.

### 4. Espaço em branco

A interface não respira porque o espaço em branco é tratado como "o que sobra", não como elemento de design. Todo bloco tem padding interno e margem externa parecidos, então nada se destaca por estar mais isolado — o "Diário" e a "Sessão ativa" são as telas mais comprimidas porque têm mais blocos por polegada quadrada. Em contraste, Sessão vazia e Dashboard em telas grandes (já apontado no F11 #22) sofrem do problema oposto: espaço vazio sem composição, não espaço vazio como respiro.

### 5. Leitura

Volume de texto residual mesmo após F10/F11:
- `<dl class="ss-context">` ainda usa rótulo+valor para 6 campos onde 2–3 (Compromisso, Categoria) bastariam visíveis por padrão.
- Painel IA: cada um dos 6 botões tem título **e** subtítulo explicativo — 12 linhas de texto para 6 ações. Podem virar tooltip/hover em vez de texto permanente.
- Diário ainda tem um aviso de "contagem parcial" em texto corrido toda vez que há filtro ativo — pode virar um badge discreto no contador em vez de parágrafo.
- Rodapé do painel IA ("Assistente de IA · Dados protegidos · Sem armazenamento de conversas") é texto permanente que 100% dos usuários leem uma vez e nunca mais precisam — candidato a tooltip de um ícone de informação.

### 6. Progressive Disclosure

O produto já pratica disclosure (mérito real do F10), mas de forma **local e não hierárquica**: cada tela decide sozinha o que esconder, sem uma regra de produto ("iniciante nunca vê X até Y"). Resultado: um usuário no primeiro dia de uso já vê, sem nenhuma ação prévia, os 4 selects de filtro avançado do Diário (atrás de 1 clique, não de necessidade real), o formulário completo de questão com dificuldade/tipo/status (atrás de "+ Adicionar com detalhes", mas o botão rápido "Registrar questão" já está sempre visível ao lado), e o histórico de sessões dentro do modal de evento. Nada disso é "escondido até precisar" — é "escondido até clicar", o que é diferente: a *opção* de complexidade ainda está sempre visível como um botão a mais.

### 7. Fluxos — telas "central de controle"

Duas telas se qualificam claramente como central de controle:

- **Diário (Concluídas)**: acumula busca, filtro de período, 9 controles de filtro avançado, aviso de parcialidade, marcos de evolução e lista — é literalmente um painel de BI com narrativa de sessão embutida.
  - *Como dividir:* separar "ler o diário" (lista narrativa, busca simples) de "analisar o diário" (filtros avançados, marcos, contagens) em dois modos ou duas rotas, não uma tela que tenta ser as duas.
- **Sessão ativa**: acumula timer + progresso + contexto + questões + revisões em uma coluna vertical só. Funciona como central de controle mesmo sendo, na essência, "um cronômetro".
  - *Como dividir:* o timer é a tela; Questões e Revisões deveriam abrir como um painel/gaveta separado (mesmo padrão do Assistente IA, que já é um painel lateral), não competir por scroll na mesma coluna do cronômetro.
- **Modal de evento** é a terceira candidata, mas por acumulação: formulário + insights + histórico + estatísticas no mesmo scroll. Já tem disclosure, mas o modal deveria se limitar ao formulário; estatísticas e histórico pertencem a uma visão de detalhe do compromisso, não a um modal de edição.

### 8. Minimalismo — meta de 30–60% de redução

Aplicando a regra do briefing por tela:

| Tela | Elementos visíveis hoje (contagem aproximada) | Corte proposto | Fica |
|---|---|---|---|
| Sessão ativa | ~25 (timer, progresso, 6 linhas de `<dl>`, 4 botões, 2 blocos com 8+ subelementos cada) | Contexto vira 2 linhas + expansão; Questões/Revisões saem para painel próprio | ~10 |
| Modal de evento | ~22 (9 campos + recorrência + CTA + insights + 5 stat tiles + histórico) | Stats e histórico saem do modal; recorrência vira 1 linha resumida + editor sob demanda | ~12 |
| Diário | ~19 controles de filtro + lista + marcos | Busca + 1 select "Ordenar/Filtrar" único que abre um único painel; marcos viram destaque temporal na própria lista | ~7 |
| Dashboard | 5 grades de card empilhadas | 1 grade "Hoje" com 3–4 números reais + 1 link "Ver tudo" para o resto | 1 grade + 1 link |
| Painel IA | 6 botões com título+subtítulo (12 linhas de texto) | 6 botões só com título; subtítulo vira tooltip | 6 linhas |

### 9. Design emocional

- **Ansiedade real:** Diário (excesso de controle antes do conteúdo), Sessão ativa (métricas e formulários competindo com o cronômetro — a própria atividade que o usuário está tentando fazer, estudar, é interrompida pela interface que deveria apoiá-la), modal de evento (abrir para "só mudar o horário" e encontrar um documento).
- **Calma real:** Agenda vazia (empty state didático, sem ruído), tela de login (poucos campos, hierarquia clara).
- **Causa raiz emocional:** o produto trata "mostrar todos os dados que tenho" como sinônimo de "ser útil". Nos benchmarks (Sunsama, Things), a sensação de calma vem exatamente do oposto: o produto decide por você o que merece atenção agora e esconde o resto sem culpa.

### 10. Benchmarks (conceitual, não de layout)

| Dimensão | Anoti hoje | Linear/Notion/Things |
|---|---|---|
| Clareza | Média — muita informação correta, mal hierarquizada | Alta — 1 protagonista por tela |
| Minimalismo | Média-baixa — disclosure existe mas não reduz volume padrão | Alta — omissão é a regra, não a exceção |
| Hierarquia | Baixa — tudo do mesmo peso visual | Alta — tipografia e espaço fazem o trabalho que aqui é feito por borda/caixa |
| Uso de espaço | Comprimido nas telas de dado, vazio sem intenção nas telas simples | Generoso e proposital nos dois casos |
| Tipografia | Uma escala, pouco usada para hierarquizar (tudo tende ao mesmo tamanho de texto dentro de um bloco) | Escala usada agressivamente para substituir bordas |
| Densidade | Alta em 3 telas centrais (Sessão, Diário, modal de evento) | Baixa por padrão, alta só sob demanda explícita |
| Ritmo | Irregular — blocos de tamanhos e estilos diferentes sem grid consistente | Regular — grid e ritmo vertical previsíveis |

---

## Padrões ruins encontrados (evidência no código)

- **Muitas caixas/bordas:** 70 declarações de `border:` e 25 variações de classe "card" em `style.css` — praticamente todo agrupamento de conteúdo ganha moldura própria em vez de espaçamento.
- **Muitos títulos/subtítulos por bloco:** `ss-questions-block`, `insights-block`, `session-history` repetem o padrão "h3/h2 + descrição" mesmo quando o contexto já deixa claro o que é o bloco.
- **Muitos botões iguais:** 13 variantes de `.btn-*`, mas o uso real concentra quase tudo em `btn-ghost btn-sm`, inclusive para ações de peso muito diferente (abrir formulário vs. cancelar).
- **Muitos níveis de informação empilhados verticalmente:** nenhuma tela do produto usa um painel lateral, uma gaveta (drawer) ou uma visão mestre-detalhe — tudo é scroll vertical único, mesmo quando o conteúdo é logicamente "principal + secundário" (Sessão, modal de evento).
- **4 componentes de aba distintos ainda coexistindo:** `.ah-filter-tab`, `.dash-tab`, `.ss-start-tab`, `.theme-tab` — já apontado no F11 (#19), continua sem unificação.
- **Múltiplos formulários de criação de evento com pesos diferentes:** QuickAdd vs. modal completo — o modal completo, mesmo após o F11, ainda concentra o problema de acumulação descrito acima.

---

## Propostas estruturais (não pequenas correções)

1. **Sessão de estudo vira "modo foco":** o cronômetro ocupa a tela sozinho. Questões e Revisões saem da coluna principal e passam a viver em um painel lateral deslizante (reaproveitando o mesmo padrão de `ai-panel`), aberto sob demanda, nunca por padrão.
2. **Modal de evento vira dois destinos:** um modal enxuto só de formulário (criar/editar) e uma visão de detalhe do compromisso (estatísticas + histórico de sessões), acessada a partir do card do evento na agenda — não dentro do mesmo modal de edição.
3. **Diário vira timeline narrativa + 1 painel de análise:** a lista de sessões vira uma timeline por dia sem toolbar de filtro visível por padrão; um único botão "Analisar" abre o painel com todos os filtros/marcos atuais, fora do fluxo de leitura.
4. **Dashboard vira 1 tela + 1 destino:** a grade "Hoje" com 3–4 números reais fica; tudo o que hoje vive em abas (Períodos, Progresso e Conquistas, Revisões, Produtividade) se funde em uma única página "Progresso", acessada por um link, não por abas empilhadas na mesma tela.
5. **Componente único de card estatístico:** substituir as 25 variações de "-card" por um único componente com 2–3 variantes de tamanho (não de estrutura), usado em Dashboard, Insights e stats do modal de evento.
6. **Componente único de aba:** eliminar as 4 implementações (`.ah-filter-tab`, `.dash-tab`, `.ss-start-tab`, `.theme-tab`) em favor de um único `.tabs`.
7. **Hierarquia por tipografia, não por caixa:** reduzir bordas visíveis nos blocos internos de uma mesma tela; usar peso/tamanho de fonte e espaçamento vertical para separar seções, reservando borda/caixa só para o elemento verdadeiramente independente da tela (ex.: um card clicável na Agenda).

---

# Novo roadmap — F13 (baseado em experiência, não em bugs)

Nenhuma etapa altera regra de negócio, schema ou lógica de serviço — todas são UX, UI e front-end. Cada fase é dimensionada para uma ou mais PRs pequenas e reversíveis, na ordem em que aparecem.

## F13.1 — Redução da carga cognitiva

- **Objetivo:** cortar entre 30% e 60% dos elementos visíveis por padrão nas 3 telas mais densas (Sessão ativa, modal de evento, Diário), sem remover nenhuma funcionalidade.
- **Motivação:** essas três telas concentram a maior parte da sensação de "central de controle" apontada nesta auditoria; são também as telas de maior frequência de uso real (estudar, agendar, revisar o que foi feito).
- **Problema:** `ss-context` mostra 6 linhas mesmo com metade em "—"; o modal de evento mescla formulário, insights e histórico no mesmo scroll; o Diário expõe 19 controles de filtro possíveis antes do conteúdo.
- **Estratégia:** reduzir o `<dl>` da sessão para 2 linhas visíveis + expansão; extrair histórico/estatísticas do modal de evento para um estado "somente leitura" separado do estado "edição"; consolidar os 9 controles de filtro avançado do Diário em um único ponto de entrada com resumo (ex.: "3 filtros ativos") em vez de expor todos de uma vez.
- **Arquivos envolvidos:** `studySessionView.js`, `index.html` (`#ss-active`, `#event-modal`, `#page-journal`), `style.css`.
- **Impacto:** alto — as 3 telas mais usadas do produto passam a ter 1 protagonista visual claro.
- **Complexidade:** M.
- **Critério de aceite:** contagem de elementos DOM visíveis por padrão em cada uma das 3 telas cai em pelo menos 30% comparado ao estado atual, sem remover nenhum caminho de ação existente (tudo continua acessível, só não visível por padrão).

## F13.2 — Redesenho da navegação

- **Objetivo:** navegação com um único modelo mental — sidebar = destinos de página; painéis/gavetas = ações contextuais.
- **Motivação:** hoje a sidebar mistura páginas (Agenda, Compromissos, Dashboard, Diário) com ações que abrem painel/modal (Assistente IA, Calendários Acadêmicos, Categorias), o que já foi parcialmente corrigido (grupo "Gerenciar") mas ainda deixa 2 modelos visíveis na mesma lista vertical.
- **Problema:** "Assistente IA" continua no grupo primário sem ser um destino de página; "Agenda" e "Compromissos" continuam sendo duas visões do mesmo dado sem uma pista visual de que são parentes.
- **Estratégia:** mover ações que abrem painel/modal para fora da lista de destinos (ex.: ação de header, não item de sidebar); agrupar Agenda/Compromissos sob um rótulo visual comum (não necessariamente fundir as páginas).
- **Arquivos envolvidos:** `index.html` (`.app-sidebar`), `navigationView.js`, `style.css`.
- **Impacto:** médio — melhora orientação, principalmente para usuário novo.
- **Complexidade:** S.
- **Critério de aceite:** todo item da lista principal de navegação leva a uma página real (troca de `#app-content`); ações que abrem painel/modal vivem fora dessa lista.

## F13.3 — Novo Design System Minimalista

- **Objetivo:** um componente por padrão visual — 1 card, 1 aba, 1 botão de disclosure, 1 badge — eliminando as variações paralelas encontradas nesta auditoria.
- **Motivação:** 25 classes de "card", 4 componentes de aba e 13 variantes de botão tornam qualquer tela nova propensa a reinventar um padrão em vez de reusar; é a causa raiz da inconsistência visual entre telas.
- **Problema:** duplicação de padrão sem unificação (`ah-filter-tab`/`dash-tab`/`ss-start-tab`/`theme-tab`; `dashboard-cards`/`smart-cards`/`insights-block`/`session-stat`).
- **Estratégia:** definir `.tabs` único (com variante pill), `.stat-card` único (com variantes de tamanho, não de estrutura), consolidar hierarquia de botões (reservar `btn-primary` para 1 ação por tela, `btn-secondary`/`btn-ghost` para o resto — hoje quase tudo é `ghost`).
- **Arquivos envolvidos:** `style.css` (novos componentes), migração tela a tela em `index.html` e nas views correspondentes (`activityDashboardView.js`, `insightsView.js`, `studySessionView.js`, `settingsModal.js`).
- **Impacto:** alto, cumulativo — toda fase seguinte fica mais barata de implementar.
- **Complexidade:** M-G (dividir em PRs por componente: 1 PR para abas, 1 para cards, 1 para hierarquia de botões).
- **Critério de aceite:** `grep` por `ah-filter-tab|dash-tab|ss-start-tab|theme-tab` retorna vazio (substituídos por `.tabs`); toda tela usa a mesma classe de card estatístico; nenhuma tela tem mais de 1 `btn-primary` visível ao mesmo tempo fora de um formulário.

## F13.4 — Reorganização completa das telas

- **Objetivo:** aplicar as propostas estruturais (Sessão em "modo foco", modal de evento dividido em edição/detalhe, Diário como timeline + painel de análise, Dashboard consolidado) usando os componentes definidos no F13.3.
- **Motivação:** F13.1 reduziu volume; esta fase corrige a arquitetura de informação por trás do volume, para que o corte não precise ser refeito a cada nova funcionalidade.
- **Problema:** as 3 telas "central de controle" identificadas (Sessão, modal de evento, Diário) continuam estruturalmente empilhadas em coluna única, mesmo depois de reduzidas.
- **Estratégia:** introduzir o padrão "painel lateral sob demanda" (reusando `ai-panel` como referência de implementação) para Questões/Revisões da sessão; separar modal de edição de evento de uma visão de detalhe/histórico; Diário como lista + 1 ponto de entrada para análise; Dashboard consolidado em 1 página com link para "Progresso".
- **Arquivos envolvidos:** `studySessionView.js`, `eventFormView.js`, `weekView.js` (ponto de entrada para detalhe do evento), `studyJournalView.js`, `activityDashboardView.js`, `insightsView.js`, `index.html`, `style.css`.
- **Impacto:** muito alto — é a mudança que resolve a percepção de "central de controle" na raiz, não só no volume.
- **Complexidade:** G (dividir em 4 PRs, uma por tela).
- **Critério de aceite:** nenhuma das 4 telas reorganizadas tem mais de 1 painel/coluna de conteúdo visível por padrão; toda ação secundária (registrar questão, ver histórico, filtrar) abre um painel/gaveta separado sem navegar para fora da tela principal.

## F13.5 — Polimento visual

- **Objetivo:** hierarquia por tipografia e espaço, não por borda — reduzir bordas/caixas visíveis nos blocos internos de uma mesma tela.
- **Motivação:** 70 declarações de `border:` produzem uma interface "emoldurada"; benchmarks (Linear, Notion) usam espaço em branco e peso tipográfico para separar seções, reservando borda para o elemento genuinamente independente (card clicável, item de lista).
- **Problema:** cada bloco de conteúdo (mesmo dentro da mesma tela) desenha sua própria caixa, mesmo quando é logicamente "seção", não "objeto".
- **Estratégia:** auditar `style.css` bloco a bloco: manter borda só em elementos clicáveis/independentes (cards de evento, cards de dashboard); trocar borda por espaçamento vertical + peso de fonte em headers de seção internos.
- **Arquivos envolvidos:** `style.css` (regras de `.ss-questions-block`, `.insights-block`, `.session-history`, `.filter-bar` e afins).
- **Impacto:** médio-alto — impressão imediata de "mais leve" sem mudar nenhuma estrutura de dado.
- **Complexidade:** S-M.
- **Critério de aceite:** contagem de `border:` em `style.css` cai de forma mensurável (meta: -30%); nenhuma tela perde a distinção visual entre seções (validado por screenshot antes/depois).

## F13.6 — Microinterações

- **Objetivo:** dar vida a ações que hoje são instantâneas e "secas": expandir/colapsar, trocar de aba, adicionar item a uma lista, finalizar sessão.
- **Motivação:** o F11 já cobre transição de página; falta o nível abaixo — o feedback de que uma ação pequena teve efeito (chevron girando de forma suave, item entrando na lista sem "pop" abrupto, contador atualizando com uma transição curta).
- **Problema:** todo toggle/disclosure hoje é instantâneo (`hidden` bruto); listas recebem itens sem transição de entrada.
- **Estratégia:** usar os tokens de transição já existentes (`transitionUtils.js`, tokens de `style.css`) para animar altura/opacidade em disclosures, entrada de itens de lista e troca de aba — sempre respeitando `prefers-reduced-motion`.
- **Arquivos envolvidos:** `style.css`, `transitionUtils.js`, pontos de toggle em `studySessionView.js`, `studyJournalView.js`, `activityDashboardView.js`.
- **Impacto:** médio — é o tipo de detalhe que separa "funciona" de "parece caro".
- **Complexidade:** S-M.
- **Critério de aceite:** todo `aria-expanded`/toggle do produto anima abertura/fechamento em ≤200ms; `prefers-reduced-motion: reduce` desliga todas as microinterações sem quebrar o estado final.

## F13.7 — Refinamento final para lançamento

- **Objetivo:** checagem cruzada de consistência após F13.1–F13.6 — garantir que nenhuma tela regrediu para o padrão antigo e que o produto lido de ponta a ponta parece um sistema único.
- **Motivação:** fases estruturais grandes (F13.3, F13.4) tendem a deixar pontas soltas (uma tela migrada, outra esquecida); esta fase é a auditoria de fechamento, não uma fase de criação.
- **Problema:** risco de inconsistência residual entre telas migradas e não migradas durante a transição.
- **Estratégia:** nova varredura completa (mesmo método deste documento) comparando cada tela contra os componentes definidos no F13.3; checklist final de: 1 protagonista por tela, densidade dentro da meta de -30%/-60%, zero componente duplicado, zero borda desnecessária.
- **Arquivos envolvidos:** todos os tocados nas fases anteriores; nenhum arquivo novo.
- **Impacto:** alto — é o que garante que o trabalho das fases anteriores não se perca.
- **Complexidade:** S (é auditoria, não implementação — pode gerar uma lista curta de PRs de ajuste fino).
- **Critério de aceite:** repetição da tabela do item 8 desta auditoria (minimalismo por tela) mostra que todas as telas atingiram a meta de redução; nenhuma tela usa um componente fora do design system definido no F13.3.

---

## Critério final

**Se o Anoti fosse apresentado hoje ao lado de Linear, Notion, TickTick, Motion e Sunsama, o que ainda entregaria o produto na primeira olhada?**

1. **Quantidade de caixas visíveis ao mesmo tempo.** Nenhum dos cinco benchmarks empilha 4–5 blocos com borda própria na mesma tela como o Dashboard ou o Diário do Anoti fazem hoje. A primeira coisa que o olho registra comparando lado a lado é "esse aqui tem mais moldura".
2. **Ausência de hierarquia tipográfica forte.** Nos benchmarks, o tamanho e peso da fonte fazem o trabalho de separar "principal" de "secundário" — no Anoti, quase todo texto dentro de um bloco tem o mesmo peso, e a separação é feita por caixa. Isso é perceptível em menos de 2 segundos de comparação.
3. **Telas com mais de um protagonista.** Em Sessão ativa e no modal de evento, o olho não sabe onde pousar primeiro — cronômetro, contexto, questões e revisões competem igualmente. Em Sunsama (o benchmark mais próximo em domínio — planejamento de estudo/trabalho), a tela de execução tem exatamente uma coisa em foco por vez.
4. **Estatísticas dispersas em vez de uma verdade única.** Motion e Sunsama centralizam progresso em um único lugar visualmente dominante; o Anoti espalha número em Dashboard, aba "Progresso e Conquistas", stats do modal de evento e resumo do Diário — a comparação lado a lado expõe que o usuário do Anoti precisa "caçar" o mesmo tipo de dado que os benchmarks entregam de uma vez.
5. **Painéis de filtro sempre à mostra em vez de sob demanda.** TickTick e Todoist escondem filtros avançados atrás de um único ponto de entrada compacto (ícone, não um bloco de controles); o Diário do Anoti, mesmo após disclosure, ainda expõe uma lista longa de opções assim que o usuário toca em "Filtros avançados" uma vez.

Nenhum desses cinco pontos é um problema de funcionalidade — o Anoti já faz, em termos de recursos, tudo o que esses produtos fazem no seu nicho. É inteiramente um problema de **quantas coisas a interface insiste em mostrar ao mesmo tempo**. O roadmap F13 acima ataca exatamente essa lista, nesta ordem de prioridade, e é a base recomendada para a última fase de refinamento antes do lançamento comercial.
