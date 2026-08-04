# Auditoria UX/UI — Página "Agenda" (Anoti)

> Auditoria conceitual e exclusiva da página **Agenda** (`#page-agenda`: abas Dia/Semana/Mês/Lista, `weekView.js`, `calendar.js`, `script.js#renderList`, `eventFormView.js`, `quickAdd.js`, `academicCalendarFilter.js`). Nenhum arquivo de produto foi alterado, nenhuma funcionalidade foi adicionada ou removida — apenas diagnóstico e proposta de reorganização. Não avalia Hoje, Sessão, Diário, Progresso ou qualquer outra página.

---

## 1. Objetivo da página

A Agenda é o centro de planejamento do Anoti — o lugar onde o estudante decide **quando** vai estudar, comparece a compromissos clínicos/acadêmicos e enxerga sua rotina inteira de uma vez. Diferente de "Hoje" (gatilho de ação para *agora*), a Agenda precisa responder, em segundos e sem esforço de leitura, a perguntas de **planejamento**:

1. **Como está minha semana/mês, de relance?** (visão geral de carga)
2. **Tenho conflitos de horário?**
3. **O que já estudei vs. o que ainda não aconteceu?**
4. **Onde cabe um novo compromisso?**
5. **Qual é meu próximo compromisso a partir de agora?**
6. **Tenho compromissos recorrentes/acadêmicos importados corretamente?**
7. **Como acho rapidamente um compromisso específico?** (busca/lista)
8. **Como registro algo novo com o mínimo de fricção possível?**

Avaliando a implementação atual, a Agenda **entrega a maior parte dos dados certos**, mas exige um esforço de leitura e decisão superior ao que um app "premium" deveria pedir:

- ✅ As quatro granularidades (Dia/Semana/Mês/Lista) cobrem bem os casos de uso, com abas simples (`#agenda-view-tabs`) e Dia como padrão mobile — decisão correta.
- ✅ Conflitos de horário já têm tratamento estrutural na grade (`_layoutOverlaps` em `weekView.js`): eventos sobrepostos dividem a largura da coluna em vez de se empilharem escondidos.
- ✅ Execução (estudado / em andamento) já é comunicada em Semana, Dia e Mês via um indicador único e compartilhado (`describeExecutionIndicator`) — não há divergência de regra entre visualizações.
- ✅ Existe uma via rápida de criação (`quickAdd.js`, dois campos) para clique em qualquer horário/dia, com "Mais opções" que expande para o formulário completo sem perder o que já foi digitado — um padrão de captura leve digno de Fantastical/Things 3.
- ⚠️ "Tenho conflitos?" é resolvido *visualmente* no grid, mas não existe nenhum resumo textual ("2 conflitos esta semana") — o estudante só percebe se olhar a grade com atenção.
- ⚠️ "Qual é meu próximo compromisso?" não tem nenhuma resposta dedicada na Agenda — ela assume que o estudante vai escanear a grade/lista inteira para achar "agora"; esse dado já existe (e é destacado) em Hoje, mas na Agenda ele se dissolve entre dezenas de outros blocos.
- ❌ A tela abre com **muita coisa competindo ao mesmo tempo**: tour opcional, filtro, abas, tip de IA, plano da semana, grade cheia — antes mesmo do estudante decidir o que olhar primeiro.
- ❌ O filtro "Exibir: Compromissos pessoais / calendários acadêmicos" é renderizado **duas vezes** na mesma página (`#filter-bar-agenda` e `#filter-bar-appointments`, ambos usando `renderFilterBar()`), redundância nem sempre percebida como tal pelo usuário — parece dois controles diferentes.

---

## 2. Diagnóstico geral

### Nota: **6,5 / 10**

A Agenda tem uma arquitetura de dados sólida e decisões de produto maduras (execução compartilhada entre visões, algoritmo de sobreposição, captura leve via QuickAdd, tour dispensável). O problema central não é falta de recurso — é **acúmulo vertical sem hierarquia**: cada melhoria (tip de IA, plano semanal, tour, filtro, abas) foi empilhada em cima da anterior, e a tela nunca foi reorganizada como um todo. O resultado é uma tela tecnicamente completa, mas que exige do estudante ler de cima a baixo antes de tocar em qualquer coisa — o oposto de "sentir a rotina organizada em segundos".

### Pontos positivos

- **Unificação Dia/Semana/Mês/Lista em uma única página com abas** (`#agenda-view-tabs`) — decisão de arquitetura de informação correta, evita navegação fragmentada entre páginas que mostravam o mesmo dado.
- **Indicador de execução único e compartilhado** entre Semana, Dia e Mês (`describeExecutionIndicator`/`executionRingHTML`) — consistência real de dado, não só visual.
- **Algoritmo de sobreposição de horários** (`_layoutOverlaps`) resolve de forma elegante um problema clássico de agendas (compromissos concorrentes um em cima do outro, invisíveis).
- **QuickAdd de dois campos** para criação a partir de um clique na grade — o app já entende o valor de reduzir fricção de captura, só não aplica essa filosofia em todo ponto de entrada (ver #8).
- **Anel de progresso no número do dia** no Mês (`.cal-day-badge`, conic-gradient) é um detalhe sutil e elegante — comunica "quanto do dia já foi estudado" sem nenhum texto extra.
- **"+N mais" em vez de corte silencioso** nos chips do Mês — nenhum compromisso desaparece sem aviso.
- **Tour de boas-vindas dispensável, nunca modal** (`#onboarding-tour-card`) e estado vazio didático na Semana (`#wk-empty-tip`, visto uma única vez) — bom instinto de "explicar sem interromper".
- **Menu "⋯" nos cards da Lista** em vez de botões Editar/Excluir sempre visíveis — reduz ruído por item, com swipe e long-press como atalhos mobile equivalentes.

### Principais problemas

1. **Excesso de blocos verticais competindo por atenção antes da grade aparecer** — header, tour, filtro, abas, tip de IA, toggle de plano semanal: até seis elementos antes do primeiro compromisso.
2. **Filtro duplicado na mesma página** (`#filter-bar-agenda` + `#filter-bar-appointments`), mesmo estado, dois lugares — usuário pode nem perceber que são a mesma coisa.
3. **Nenhuma resposta direta para "qual é meu próximo compromisso"** dentro da Agenda — a tela pede leitura ativa da grade em vez de entregar a resposta.
4. **Header com CTA "+ Novo compromisso" abre direto o formulário completo** (18+ campos possíveis), enquanto um clique na grade abre o QuickAdd (2 campos) — dois pesos para a mesma ação, sem motivo aparente para o estudante.
5. **Cor como único diferenciador de categoria** na grade — sem indicação textual reforçada visualmente, times daltônicos ou paletas parecidas colidem; e cada `--card`/chip tem sua própria cor de fundo inline, criando uma superfície colorida em excesso quando a semana tem muitas categorias diferentes.
6. **Densidade tipográfica dos eventos da Semana é alta para o espaço disponível** — título + categoria + hora + indicador de execução, todos dentro de um bloco de ~22px de altura mínima.
7. **Formulário de evento é longo e linear**, mesmo com "Mais opções" já escondendo a cor — lembrete, recorrência e campos de recorrência estendida ainda aparecem como uma sequência de decisões, não como um fluxo guiado.

---

## 3. Inventário completo

| # | Componente | Finalidade | Importância | Manter | Simplificar | Fundir | Remover | Redesenhar |
|---|---|---|---|---|---|---|---|---|
| 1 | `.page-header` (`h1 "Agenda"` + `#btn-new-event`) | Identificar a tela e criar | Alta | ✔ | — | — | — | ✔ (título redundante com nav; CTA deveria abrir captura leve) |
| 2 | `#onboarding-tour-card` | Onboarding dispensável | Baixa (só 1ª visita) | ✔ | — | — | — | — |
| 3 | `#filter-bar-agenda` | Mostrar/ocultar pessoais e calendários acadêmicos | Média | ✔ (1 instância) | ✔ | ✔ (fundir com a de `#filter-bar-appointments`) | — | ✔ |
| 4 | `#filter-bar-appointments` | Mesmo filtro, dentro da aba Lista | Baixa (duplicado) | — | — | ✔ (mesma instância acima) | considerar | — |
| 5 | `#agenda-view-tabs` (Dia/Semana/Mês/Lista) | Alternar granularidade | Máxima | ✔ | — | — | — | leve (destaque visual maior do item ativo) |
| 6 | `#day-container` (vista Dia) | Grade de 1 dia, padrão mobile | Alta (mobile) | ✔ | — | — | — | — |
| 7 | `#week-container` (vista Semana) | Grade de 7 dias | Máxima | ✔ | ✔ | — | — | ✔ (hierarquia temporal, densidade) |
| 8 | `#wk-empty-tip` / `#dv-empty-tip` | Ensinar a criar quando vazio | Média (1ª vez) | ✔ | — | — | — | — |
| 9 | `#wk-tip` (smart card contextual) | Dica/decisão prioritária da semana | Alta | ✔ | — | ✔ (avaliar fusão com cabeçalho da Semana) | — | ✔ (mais destaque) |
| 10 | `#wk-plan-toggle` + `#wk-plan-list` | Plano da semana sob demanda | Média | ✔ | — | — | — | leve (copy do toggle) |
| 11 | `wk-head-row` (nomes/números dos dias) | Orientação temporal | Alta | ✔ | — | — | — | — |
| 12 | `wk-allday-row` / `.wk-allday-chip` | Eventos de dia inteiro (acadêmicos) | Média | ✔ | — | — | — | — |
| 13 | `wk-time-col` (rótulos de hora) | Referência de horário | Alta | ✔ | ✔ (24 rótulos podem poluir; considerar a cada 2h fora do foco) | — | — | leve |
| 14 | `.wk-event` (bloco de compromisso) | Representar 1 compromisso na grade | Máxima | ✔ | ✔ (menos elementos por bloco pequeno) | — | — | ✔ |
| 15 | `.wk-event-academic` | Compromisso de calendário acadêmico | Alta | ✔ | — | — | — | leve (diferenciação mais clara vs. pessoal) |
| 16 | Indicador de execução (anel + texto) | "Já estudei isso?" | Alta | ✔ | ✔ (texto pode ocultar-se em blocos pequenos) | — | — | — |
| 17 | `.wk-now-line` (linha do agora) | Onde estou no tempo | Alta | ✔ | — | — | — | ✔ (mais presença visual) |
| 18 | `_layoutOverlaps` (colunas de conflito) | Evitar sobreposição invisível | Alta | ✔ | — | — | — | ✔ (badge textual de conflito, não só largura menor) |
| 19 | `#calendar-container` (vista Mês) | Visão panorâmica do mês | Máxima | ✔ | ✔ | — | — | ✔ |
| 20 | `cal-header` (nav + título + Hoje) | Navegar entre meses | Alta | ✔ | — | — | — | — |
| 21 | `.cal-cell` | Container de 1 dia no mês | Máxima | ✔ | — | — | — | ✔ (densidade) |
| 22 | `.cal-day-badge` (anel de progresso) | "Quanto já estudei neste dia" | Alta | ✔ | — | — | — | — |
| 23 | `.cal-chip` (evento no mês) | Representar compromisso no mês | Alta | ✔ | ✔ (texto mínimo, cor como sinal primário) | — | — | ✔ |
| 24 | `.cal-chip-more` ("+N mais") | Comunicar itens ocultos sem cortar | Média | ✔ | — | — | — | — |
| 25 | `#appointments-list-container` (aba Lista) | Buscar/ordenar/filtrar todos os compromissos | Alta | ✔ | — | — | — | leve |
| 26 | `#search-appointments` | Busca textual | Alta | ✔ | — | ✔ (unificar com busca global, se existir) | — | — |
| 27 | `#filter-category-apt` / `#sort-appointments` | Filtrar por categoria / ordenar | Média | ✔ | ✔ (fundir em 1 disclosure "Filtros") | ✔ | — | ✔ |
| 28 | `.event-card` (item da Lista) | Detalhe de 1 compromisso em lista | Alta | ✔ | ✔ | — | — | leve |
| 29 | Botão "Iniciar sessão" no card | Atalho de estudo | Alta (só compromissos de estudo) | ✔ | — | — | — | — |
| 30 | Menu "⋯" do card (Editar/Excluir) | Ações secundárias | Média | ✔ | — | — | — | — |
| 31 | Badge de categoria + badge "↻ Recorrente" | Metadado do compromisso | Média | ✔ | ✔ (fundir categoria+recorrência em 1 linha compacta) | ✔ | — | — |
| 32 | Swipe actions / long-press (mobile) | Atalho tátil para Editar/Excluir | Média (mobile) | ✔ | — | — | — | — |
| 33 | `p#list-empty` (estado vazio da Lista) | Comunicar ausência de resultado | Baixa | ✔ | — | — | — | leve (tom) |
| 34 | `quickAdd.js` (modal leve) | Criar rápido a partir de 1 clique na grade | Alta | ✔ | — | — | — | ✔ (deveria ser também a porta de entrada do botão do header) |
| 35 | `#event-modal` (formulário completo) | Criar/editar com todos os campos | Alta | ✔ | ✔ | — | — | ✔ (reduzir decisões simultâneas) |
| 36 | `#btn-start-session` (CTA no topo do modal) | Iniciar estudo a partir do compromisso | Alta (edição) | ✔ | — | — | — | — |
| 37 | Campo Título / Data / Hora / Duração | Dados essenciais do compromisso | Máxima | ✔ | — | — | — | — |
| 38 | `#f-conflict-warning` | Alertar sobreposição ao salvar | Alta | ✔ | — | — | — | ✔ (mais visível, não só texto) |
| 39 | Categoria + cor (`#f-color-wrap` sob "Mais opções") | Classificar compromisso | Média | ✔ | — | — | — | — |
| 40 | Local / Observação | Metadado opcional | Baixa-média | ✔ | ✔ (já opcional; considerar disclosure) | — | — | — |
| 41 | Lembrete (`#f-reminder` + custom) | Notificação prévia | Média | ✔ | — | — | — | — |
| 42 | Recorrência (`+ Repetir` → bloco estendido) | Repetir compromisso | Média | ✔ | ✔ (já é disclosure — bom) | — | — | — |
| 43 | `#event-detail-trigger` + painel "Histórico e estatísticas" | Ver sessões associadas ao compromisso | Baixa-média (edição) | ✔ | — | — | — | — |
| 44 | 5 `stat-card--sm` do histórico | Métricas do compromisso | Baixa | ✔ | ✔ (fundir em resumo textual + 1-2 destaques) | ✔ | — | — |
| 45 | Cabeçalho de dia da vista Dia (`.dv-nav`) | Navegar entre dias | Alta (mobile) | ✔ | — | — | — | — |

---

## 4. Problemas de UX (ordenados por impacto)

1. **Ordem de leitura obrigatória antes de qualquer ação útil.** Tour → filtro → abas → tip → toggle de plano → grade: o estudante precisa passar por até 6 blocos antes de ver um compromisso.
2. **Dois pontos de entrada para "criar compromisso" com fricção muito diferente** — header (`+ Novo compromisso`) abre o formulário completo; clique na grade abre o QuickAdd de 2 campos. O caminho "mais óbvio" (o botão visível no topo) é o mais custoso.
3. **Nenhum resumo textual de conflitos ou de "próximo compromisso"** — a Agenda depende inteiramente de leitura visual da grade, sem nenhuma frase de apoio equivalente ao que Hoje já oferece.
4. **Filtro de exibição duplicado** em dois containers (`#filter-bar-agenda`, `#filter-bar-appointments`) — o mesmo estado, renderizado em dois lugares fisicamente distantes da tela, sem nenhuma explicação de por que existem dois.
5. **Alternância de abas não preserva contexto temporal entre si** — trocar de Semana para Mês não navega automaticamente para o mês da semana que estava sendo vista (nem o oposto); o estudante perde a posição no tempo a cada troca de visualização.
6. **Aviso de conflito no formulário é só texto** (`#f-conflict-warning`), sem o mesmo reforço visual (cor, ícone, borda) que outras confirmações importantes do app recebem.
7. **Excesso de decisões simultâneas no formulário completo** — título, data, hora, duração, categoria, lembrete e recorrência aparecem lado a lado sem sequência guiada; poucas dessas decisões são obrigatórias, mas todas competem visualmente como se fossem.
8. **Aba "Lista" e busca/filtro/ordenação vivem isoladas das outras 3 visões** — encontrar "aquele compromisso de terça" exige trocar de aba e usar busca, quando a vista Semana já está mostrando aquele dia.
9. **Nenhuma diferenciação de estado temporal dentro da própria grade** (passado vs. futuro vs. agora) além da linha do agora — compromissos já concluídos têm o mesmo peso visual dos futuros.
10. **Painel de histórico do compromisso (5 stat cards) é desproporcional à decisão que o formulário pede** — abrir "Ver histórico e estatísticas" para mudar um horário devolve uma quantidade de dado que não ajuda nesse momento.

---

## 5. Problemas de UI (ordenados por impacto)

1. **Blocos de evento na Semana (`.wk-event`) acumulam até 4 elementos de texto** (título, categoria, hora, indicador) em uma altura mínima de 22px — em compromissos curtos, o texto se sobrepõe ou é cortado sem hierarquia clara de qual informação prevalece.
2. **Cor de fundo inline por evento** (`ev.color`) sem faixa neutra de apoio — uma semana com 5+ categorias diferentes vira um mosaico de cores saturadas competindo entre si, sem nenhuma modulação (opacidade, tom pastel) que sinalize "isso é secundário".
3. **Chips do Mês (`.cal-chip`) usam fonte muito pequena** (`--font-size-3xs`) para caber título + indicador de execução — em compromissos com títulos longos, o texto trunca sem indicação visual de truncamento.
4. **Rótulos de hora a cada 30 minutos** ocupam a coluna de tempo com 24 marcações cheias — mais densidade do que a maioria dos apps de calendário usa por padrão (geralmente hora cheia, com meia-hora como linha sutil sem rótulo).
5. **`.tab--active` (abas Dia/Semana/Mês/Lista) usa a mesma cor sólida de botão primário** — funciona, mas não comunica "estou aqui" com a mesma leveza que uma pill neutra teria; a paleta de destaque primário fica "gasta" competindo com o CTA "+ Novo compromisso" do mesmo header.
6. **Badges de categoria e "↻ Recorrente" na Lista têm o mesmo peso visual** (`.badge`) mesmo comunicando coisas de importância muito diferente (identidade vs. metadado raro).
7. **`.cal-cell` com `min-height: 92px`** força meses com 6 linhas a ocupar bastante altura de rolagem em mobile, sem nenhuma opção de visão mais compacta.
8. **Onboarding tour card, tip de IA e empty-tip usam o mesmo componente visual** (`.state-block`) em contextos com propósitos diferentes (ensinar uma vez vs. decisão recorrente vs. estado vazio) — a semelhança visual dilui a distinção de urgência entre eles.

---

## 6. Problemas de carga cognitiva

- **Sim, existe informação demais na dobra inicial.** Header + tour + filtro + abas + tip + plano semanal antes da primeira célula de grade — para um estudante que só quer saber "o que tenho essa semana".
- **Sim, existe excesso de cores simultâneas** — cada categoria tem sua própria cor livre (picker de cor no cadastro), sem paleta curada nem limite de saturação; a grade pode acumular tons concorrentes sem nenhuma lógica de agrupamento.
- **Sim, existe excesso de filtros visíveis ao mesmo tempo na aba Lista** — busca + categoria + ordenação + filtro de exibição (duplicado) todos abertos por padrão, quando a maioria das sessões de uso não precisa de nenhum deles.
- **Não há excesso de botões isolados** — os CTAs por tela são poucos e bem escolhidos (Novo compromisso, Iniciar sessão, menu "⋯"). O problema é a soma de blocos inteiros, não de botões soltos.
- **Existe excesso de leitura no formulário completo** — textos de ajuda, múltiplos labels e uma sequência de campos opcionais aparecem juntos, exigindo que o estudante leia tudo antes de perceber que só título/data/hora são obrigatórios.
- **O indicador de execução (ícone + texto) é o único indicador realmente usado com frequência** — cor de categoria e badges são notados, mas raramente acionam uma decisão nova por parte do estudante; texto de recorrência ("↻ Recorrente"), embora correto, comunica um dado que o estudante já sabe (ele mesmo cadastrou a recorrência).
- **O plano semanal e a dica contextual (`#wk-tip`) fixos no topo da Semana podem gerar uma leve ansiedade de "mais uma coisa para eu conferir"** quando aparecem sempre visíveis mesmo sem interação recente do estudante com IA.

---

## 7. Problemas de hierarquia visual

- **Ao abrir a Agenda, os olhos não têm um destino claro.** Header, filtro e abas têm pesos tipográficos parecidos (mesma altura de linha, cores neutras similares); nada "puxa" o olhar antes da grade.
- **O próximo compromisso não recebe nenhum destaque na Agenda** — ele está lá, mas com o mesmo peso visual de qualquer outro bloco na grade; só a linha do agora (`.wk-now-line`) indica "estamos aqui", sem reforçar qual bloco vem a seguir.
- **O CTA "+ Novo compromisso" e as abas de visualização competem pela mesma faixa de atenção** (mesmo header, cores parecidas) — não fica óbvio que um é ação (criar) e o outro é navegação (ver).
- **O tip de IA (`#wk-tip`) e o plano semanal, quando presentes, disputam destaque com o próprio grid** — ambos aparecem antes da grade, sem clareza de que a grade é o conteúdo principal e eles são apoio contextual.
- **Elementos que deveriam desaparecer/recolher por padrão**: filtro duplicado, rótulos de hora a cada 30min, 5 stat-cards do histórico.
- **Elementos que deveriam ganhar mais destaque**: próximo compromisso (na Semana/Dia), contagem de conflitos (se houver), indicador de execução (hoje discreto dentro do bloco pequeno).

---

## 8. Problemas da visualização semanal

- **Transmite organização em parte** — a grade em si é bem estruturada (colunas, now-line, algoritmo de sobreposição), mas o acúmulo de blocos acima dela (tip, plano, filtro) diminui a sensação de clareza antes mesmo de chegar à grade.
- **Existe poluição visual pontual**: blocos de evento pequenos com 3-4 linhas de texto competindo em pouco espaço; múltiplas cores de categoria simultâneas sem faixa neutra de fundo entre elas.
- **Horários são legíveis, mas densos** — 24 rótulos de hora cheia mais linhas de meia hora sem rótulo aumentam a régua visual sem, necessariamente, ajudar a leitura ("são 14h" já seria suficiente sem contar 48 divisões).
- **Eventos são identificáveis por cor + texto**, mas dependem inteiramente da cor escolhida pelo estudante no cadastro — sem padronização, duas categorias podem ficar visualmente próximas (ex.: dois tons de azul).
- **Não há desperdício de espaço relevante** — a grade ocupa bem o espaço vertical disponível; o desperdício está mais em altura útil perdida com os blocos acima dela.
- **Como reduzir a carga visual**: menos elementos de texto por bloco de evento pequeno (priorizar título + hora; categoria e indicador só em blocos suficientemente altos), rótulos de hora só de hora em hora, e mover tip/plano para um espaço opcional de "resumo da semana" fora do fluxo principal de leitura.

---

## 9. Problemas do calendário mensal

- **Densidade dos dias é razoável, mas o limite de 3 chips + "+N mais" ainda deixa a célula com pouco espaço de respiro em meses cheios** (plantões diários, por exemplo).
- **Os eventos são legíveis no zoom padrão, mas o texto do chip (`--font-size-3xs`) fica no limite inferior de conforto de leitura**, especialmente em mobile.
- **Não há excesso de marcadores** — o anel de progresso no número do dia é um único indicador elegante, sem redundância com os chips.
- **Existe informação demais dentro da célula em dias muito cheios**: badge do dia + até 3 chips coloridos + chip "+N mais" — quatro elementos empilhados em ~92px de altura mínima.
- **Como melhorar a leitura**: permitir que dias sem nenhum compromisso "respirem" mais (menos borda/preenchimento visual), e considerar reduzir o limite de chips visíveis para 2 em telas menores, deixando o "+N mais" absorver mais cedo.
- **O mês já tende ao elegante** graças ao anel de progresso e ao cuidado de nunca cortar informação silenciosamente — falta só reduzir a saturação simultânea de cores quando o mês tem muitas categorias diferentes.

---

## 10. Problemas da visualização em lista

- **É razoavelmente agradável de percorrer**, mas cada card carrega uma linha de meta densa (data · hora · duração · local) que, para compromissos sem os quatro dados, gera uma linha "capenga" com poucos separadores.
- **Cards não são particularmente pesados** — `.event-card` é enxuto (título, meta, badges, ações no menu), o que é positivo.
- **Existe informação repetida entre a busca/filtro da Lista e o filtro de exibição** (pessoal/acadêmico), que também vive em `#filter-bar-appointments` duplicando `#filter-bar-agenda`.
- **Não há excesso de texto por card**, mas o conjunto (busca + 2 selects + filtro + toolbar) acima da lista é mais pesado do que a lista em si.
- **Menus contextuais ("⋯") estão claros** — Editar/Excluir bem rotulados, com Excluir marcado como ação perigosa só dentro do menu aberto.
- **Como tornar essa visualização mais premium**: reduzir a toolbar a um único controle de filtros (disclosure), manter busca sempre visível (é o uso mais frequente), e aplicar um agrupamento por data (ex.: "Esta semana", "Próxima semana") em vez de uma lista corrida — hoje a Lista é uma tabela disfarçada de cards.

---

## 11. Problemas dos formulários

**Novo Evento / Novo Compromisso (`#event-modal`):**

- Existe informação demais visível de uma vez: título, data, hora, duração, aviso de conflito, categoria, "mais opções" (cor), local, observação, lembrete + repetição — mesmo com boa parte opcional, tudo aparece com o mesmo peso.
- A sequência é majoritariamente lógica (identificação → tempo → classificação → detalhes → notificação/repetição), mas não é guiada — o estudante lê o formulário inteiro mentalmente antes de perceber que só 3 campos são obrigatórios.
- O picker de cor já está corretamente escondido atrás de "Mais opções" (boa decisão existente) — mas Local e Observação, igualmente opcionais e raramente usados, continuam sempre visíveis.
- **Como reduzir esforço mental**: abrir o formulário só com Título + Data + Hora + Categoria visíveis, com um único "Mais detalhes" agrupando Duração, Local, Observação, Lembrete e Repetição — não cinco disclosures diferentes, um só.
- **Como reduzir decisões**: pré-selecionar lembrete/categoria com base no último uso (já parcialmente resolvido pela categoria herdar a cor), e adiar a decisão de recorrência para depois de salvar o primeiro compromisso, quando fizer sentido.
- **Como parecer mais leve**: o CTA de "Iniciar sessão de estudo" já foi corretamente promovido ao topo (histórico documentado no próprio HTML) — mesma filosofia deveria se aplicar ao restante do formulário: menos é mais visível por padrão, exceto o essencial.

---

## 12. Problemas de mobile

**360 / 390 / 430 px:**

- A vista Dia (`initDayView`) já resolve corretamente o problema de a Semana forçar rolagem horizontal em telas estreitas — boa decisão de arquitetura.
- Ainda assim, a pilha de blocos antes da grade (tour, filtro, abas, tip) consome uma fatia desproporcional da viewport em telas pequenas, empurrando o primeiro compromisso para fora da dobra inicial.
- Os toques nos blocos de evento pequenos (~22px de altura mínima) ficam no limite inferior de conforto de toque (44px é a referência comum) — compromissos curtos (ex.: 15min) tendem a virar alvos difíceis de tocar com precisão.
- Os cards da aba Lista têm altura adequada para toque, mas a toolbar acima (busca + 2 selects + filtro) ocupa bastante espaço vertical fixo, competindo com a lista pela viewport.
- **Parece mais um "calendário web adaptado" do que um app nativo** nas visões Semana/Mês em telas pequenas — a estrutura de grade tradicional, embora funcional, não usa os padrões mobile-first (cards por dia, navegação por swipe) que Dia já começou a estabelecer.

---

## 13. Problemas de consistência

- **Dois "tamanhos" de captura de compromisso** (QuickAdd de 2 campos vs. formulário completo de 12+ campos) sem uma regra clara e visível de quando cada um aparece — o botão do header pula direto para o mais pesado.
- **Duas instâncias do mesmo componente de filtro** (`renderFilterBar` chamado duas vezes) na mesma tela — inconsistência de "isso é um controle único ou dois?".
- **Badges usam a mesma classe (`.badge`) para dados de importância muito diferente** (categoria de identidade vs. "↻ Recorrente", metadado ocasional) — a linguagem visual não diferencia por peso semântico.
- **Ícones de indicador de execução são textuais (●/✓)** em vez de ícones do mesmo sistema usado no resto do app (`icons.js`), gerando uma pequena dissonância visual entre esse indicador e outros ícones da agenda.
- **Espaçamento entre blocos empilhados na Semana** (empty-tip, tip, plano, grade) não segue um ritmo vertical consistente perceptível — cada bloco parece ter sido adicionado independentemente, sem um sistema de espaçamento único para a página.
- A linguagem visual de botões (primário/ghost/secundário) e do padrão de disclosure (chevron + label) já é consistente e bem estabelecida no resto do app — a Agenda deveria reaproveitar mais desse vocabulário (ex.: no formulário) em vez de introduzir variações próprias.

---

## 14. Oportunidades de redesign

*(Somente conceitos — sem código.)*

- **Uma "dobra de clareza" no topo da Semana/Dia**: uma única linha de resumo (ex.: "5 compromissos esta semana · 2 já estudados · 1 conflito") substituindo a necessidade de escanear a grade inteira para responder "como estou indo".
- **Fundir tip de IA + plano semanal em um único bloco opcional**, recolhido por padrão, com um rótulo que já entrega valor antes do clique (mesmo princípio já sugerido para a página Hoje).
- **Um único ponto de captura**, com dois níveis de profundidade dentro do mesmo fluxo (não dois modais distintos): título + data/hora sempre visíveis, todo o resto atrás de "Mais detalhes" — tanto para o clique na grade quanto para o botão do header.
- **Diferenciação de peso entre passado e futuro na grade**: compromissos já concluídos (ou cuja data já passou) recebem leve redução de opacidade, sem desaparecer — reforça "isso já aconteceu" sem exigir leitura de data.
- **Uma paleta de categorias curada por padrão**, com o picker de cor livre disponível só para quem quer personalizar — reduz o risco de colisão de cores entre categorias parecidas.
- **Badge de conflito textual e visualmente distinto**, não apenas a divisão de largura da coluna — algo como um pequeno indicador "⚠ conflito" no bloco, coerente com o que Hoje já sinaliza.
- **Unificar o filtro de exibição em um único lugar fixo da página** (ex.: dentro do cabeçalho da Agenda, não repetido por aba).
- **Mês com dois estados de densidade**: padrão (3 chips) e compacto (ponto colorido por compromisso, sem texto) para quem prefere uma visão puramente panorâmica.

---

## 15. Nova proposta de organização da Agenda

**Estrutura ideal, de cima para baixo:**

1. **Cabeçalho vivo**: "Agenda" + resumo de uma linha (compromissos da semana atual, conflitos se houver) + CTA único de criação (mesma leveza do QuickAdd, sempre).
2. **Abas de visualização** (Dia/Semana/Mês/Lista), com destaque visual mais neutro que o CTA de criação — a distinção "navegar" vs. "agir" precisa ser imediata.
3. **Filtro de exibição**, um único local, sempre no mesmo lugar independentemente da aba ativa — nunca duplicado.
4. **A grade/lista como conteúdo principal**, ocupando o máximo de espaço possível assim que a tela abre.
5. **Apoio contextual (tip de IA / plano da semana) fundido em um único bloco opcional**, recolhido por padrão, abaixo do cabeçalho e acima da grade, mas visualmente subordinado a ela (menor destaque que os compromissos reais).
6. **Onboarding e estados vazios** continuam como hoje (dispensáveis, nunca modais) — já bem resolvidos, só precisam herdar o novo ritmo de espaçamento da página.

**Justificativa**: a ordem prioriza primeiro "onde estou" (resumo), depois "o que eu quero ver" (abas + filtro), depois o conteúdo em si — e só then o apoio de IA, que é valioso mas não deve competir com o dado real da agenda. Isso reduz a distância entre abrir a tela e enxergar compromissos reais, sem remover nenhuma funcionalidade existente — apenas reordenando e recolhendo o que é secundário.

---

## 16. As 30 decisões de design que mais prejudicam a experiência da Agenda

*(Ordenadas por impacto.)*

1. Filtro de exibição renderizado duas vezes na mesma página, sem explicação de por que existem duas instâncias.
2. CTA principal do header ("+ Novo compromisso") abrir o formulário completo em vez da captura leve que a própria grade já oferece.
3. Nenhum resumo textual de "próximo compromisso" ou "conflitos" na Agenda.
4. Empilhamento vertical de blocos de apoio (tour, filtro, tip, plano) antes da grade em toda visita, não só na primeira.
5. Blocos de evento pequenos carregando até 4 elementos de texto sem hierarquia de qual prevalece em pouco espaço.
6. Ausência de diferenciação visual entre compromissos passados e futuros na grade.
7. Cor de categoria livre (picker) sem paleta curada, gerando colisão visual entre categorias parecidas.
8. Rótulos de hora a cada 30 minutos (48 marcações) em vez de hora cheia como padrão.
9. Aviso de conflito no formulário sendo apenas texto simples, sem reforço visual.
10. Formulário completo exibindo todos os campos opcionais com o mesmo peso visual dos obrigatórios.
11. Local e Observação sempre visíveis no formulário, mesmo sendo tão opcionais quanto a cor (já escondida).
12. Painel de histórico com 5 stat-cards abrindo para uma decisão simples de edição de horário.
13. Badges de categoria e "↻ Recorrente" com o mesmo peso visual (`.badge`) apesar de importância semântica diferente.
14. Troca de aba (Semana↔Mês) não preservar a posição temporal entre visões.
15. Ícones de execução textuais (●/✓) fora do sistema de ícones do resto do app.
16. `.tab--active` usando a mesma cor do CTA primário do header, competindo por destaque.
17. Chips do Mês com fonte no limite inferior de leitura confortável.
18. Célula do Mês acumulando badge + 3 chips + "+N mais" sem respiro para dias muito cheios.
19. Toolbar da aba Lista (busca + 2 selects + filtro) ocupando mais espaço vertical que muitas listas de resultado.
20. Nenhum agrupamento por período na aba Lista (é uma lista corrida, não segmentada por "esta semana"/"próxima").
21. Blocos de evento pequenos (~22px) abaixo do alvo de toque confortável em mobile.
22. Falta de destaque visual reforçado para a linha do "agora" (`.wk-now-line`) — hoje discreta.
23. Tip de IA e plano semanal sem hierarquia clara de que são apoio, não conteúdo principal.
24. Onboarding tour, tip de IA e estado vazio compartilhando o mesmo componente visual (`.state-block`) apesar de propósitos distintos.
25. Nenhuma modulação de opacidade/saturação para eventos secundários (ex.: acadêmicos vs. pessoais) na grade.
26. Espaçamento vertical entre blocos empilhados sem ritmo consistente perceptível.
27. Ausência de um resumo de "quanto tempo livre" na semana, mesmo o dado bruto já existindo (compromissos + duração).
28. "Mais opções" do formulário esconder só a cor, deixando outros campos igualmente pouco usados (Local, Observação) sempre visíveis.
29. Nenhuma indicação de "hoje" reforçada além da coluna/célula destacada — sem texto de apoio ("Hoje, 4 de agosto").
30. Botão "Hoje" (navegação) e "+ Novo compromisso" (criação) com estilos de botão muito próximos (`btn-ghost`/`btn-primary`), mas nem sempre lidos como categorias diferentes de ação à primeira vista.

---

## 17. As 30 melhorias com maior impacto visual

1. Reduzir texto dentro de blocos pequenos de evento na Semana: título + hora sempre, categoria/indicador só acima de uma altura mínima.
2. Aplicar uma paleta de categorias curada por padrão, com picker de cor livre como opção avançada.
3. Reduzir rótulos de hora da grade para hora cheia, com linha sutil de meia-hora sem texto.
4. Diferenciar visualmente eventos passados (opacidade reduzida) de futuros na grade.
5. Dar mais presença visual à linha do "agora" (`.wk-now-line`).
6. Unificar `.badge` em duas variantes de peso (identidade vs. metadado leve) em vez de um único estilo para tudo.
7. Substituir os ícones textuais de execução (●/✓) por ícones do sistema (`icons.js`).
8. Reduzir a fonte mínima dos chips do Mês para um tamanho mais confortável, ajustando truncamento com reticências visíveis.
9. Dar ao `.tab--active` uma cor distinta do CTA primário do header.
10. Aumentar o respiro (padding) das células do Mês em dias com poucos ou nenhum compromisso.
11. Redesenhar o aviso de conflito no formulário com cor/ícone de alerta, não só texto.
12. Compactar a toolbar da aba Lista em um único controle de filtros expansível.
13. Agrupar visualmente a Lista por período (Esta semana / Próxima semana / Mais tarde).
14. Tornar o filtro de exibição um componente único e fixo, eliminando a segunda instância.
15. Elevar visualmente o resumo de "próximo compromisso" quando presente na Semana/Dia.
16. Fundir tip de IA e plano semanal em um único cartão visualmente subordinado à grade.
17. Padronizar o espaçamento vertical entre todos os blocos acima da grade em um ritmo único.
18. Aumentar a altura mínima tocável dos blocos de evento curtos em mobile.
19. Dar tratamento visual mais leve (menor contraste) a compromissos acadêmicos vs. pessoais na grade, reforçando a hierarquia "meu plano" vs. "calendário institucional".
20. Reduzir o número de stat-cards do histórico do compromisso para 1-2 destaques + texto.
21. Ajustar o contraste de texto sobre cor de fundo de categoria para garantir legibilidade consistente em todas as cores possíveis do picker.
22. Suavizar bordas/backgrounds do `.cal-cell` para reduzir a sensação de "planilha administrativa".
23. Dar identidade visual mais clara ao "Hoje" na Semana/Mês além da cor de destaque (ex.: rótulo textual sutil).
24. Reduzir a saturação simultânea de cores em semanas com muitas categorias diferentes (aplicar opacidade padrão a blocos, cor plena só em hover/seleção).
25. Ajustar o alinhamento entre ícone do indicador de execução e texto para consistência com o resto do app.
26. Dar ao onboarding tour, tip e empty-state variações visuais distintas dentro do mesmo sistema `.state-block` (cor de borda ou ícone diferentes por propósito).
27. Reduzir a quantidade de bordas/divisores visíveis simultaneamente na aba Lista.
28. Tornar o botão "Hoje" (navegação) visualmente distinto do padrão `btn-ghost` genérico usado em outros contextos.
29. Dar destaque visual mais "premium" ao anel de progresso do dia no Mês (já elegante, pode ganhar leve animação/transição ao carregar).
30. Revisar a paleta de fundo dos calendários acadêmicos para não competir com as cores de categoria pessoal na mesma grade.

---

## 18. As 30 melhorias com maior impacto na experiência

1. Unificar os dois pontos de entrada de criação (header e clique na grade) em um único fluxo de captura leve com "mais detalhes" opcional.
2. Adicionar um resumo textual de uma linha (compromissos da semana, conflitos, já estudados) sempre visível no topo da Semana/Dia.
3. Eliminar a duplicação do filtro de exibição, mantendo um único controle acessível de qualquer aba.
4. Reduzir a quantidade de blocos que aparecem antes da grade em toda visita, não só a primeira.
5. Destacar visualmente o próximo compromisso dentro da grade (Semana/Dia), não só via a linha do "agora".
6. Tornar o aviso de conflito de horário impossível de ignorar, tanto na grade quanto no formulário.
7. Reduzir o número de campos sempre visíveis no formulário completo, mantendo só Título/Data/Hora/Categoria por padrão.
8. Agrupar Local, Observação, Lembrete e Repetição em um único "Mais detalhes", não disclosures separados.
9. Preservar a posição temporal ao trocar entre abas Semana/Mês/Dia.
10. Reduzir o histórico do compromisso a um resumo direto, reservando os 5 stat-cards para quem pedir "ver tudo".
11. Diferenciar visualmente compromissos concluídos de futuros na grade, reduzindo esforço de leitura de data/hora.
12. Adicionar agrupamento por período na aba Lista, facilitando "o que tenho essa semana" sem trocar de aba.
13. Garantir que a busca da aba Lista seja utilizável a partir de qualquer visualização (não só depois de trocar para Lista).
14. Ajustar a hierarquia entre navegação (abas, botão Hoje) e ação (criar compromisso) para eliminar ambiguidade de qual é qual.
15. Reduzir a carga de decisões simultâneas do formulário através de sequenciamento (obrigatório primeiro, opcional depois).
16. Comunicar "tenho tempo livre" de forma explícita (frase ou indicador), não apenas espaços em branco na grade.
17. Fundir tip de IA e plano semanal para reduzir a sensação de "mais uma coisa para checar" na abertura da tela.
18. Garantir que a criação rápida (QuickAdd) continue disponível a partir do CTA do header, não só do clique na grade.
19. Padronizar as regras de cor de categoria para reduzir colisões visuais entre compromissos de categorias diferentes.
20. Melhorar a legibilidade dos chips do Mês para reduzir a necessidade de abrir o compromisso só para ler o título completo.
21. Garantir toques confortáveis em blocos de evento curtos no mobile, sem prejudicar a densidade da grade.
22. Tornar a diferenciação entre compromissos pessoais e acadêmicos mais imediata visualmente (não só pela cor escolhida).
23. Reduzir a redundância entre os selects de filtro/ordenação da Lista e o filtro de exibição.
24. Garantir que o estado vazio da Semana/Dia/Mês comunique, de forma convidativa, como criar o primeiro compromisso.
25. Ajustar o texto do toggle "Mostrar plano da semana" para comunicar valor antes do clique (o que a Hoje já foi sugerida a fazer, reaplicado aqui).
26. Garantir consistência de nomenclatura de categorias/cores entre a Agenda e o restante do app (Hoje, Sessão).
27. Reduzir o tempo entre "abrir a Agenda" e "entender minha semana" ao mínimo de leitura possível.
28. Garantir que o formulário de edição não pareça mais pesado do que o de criação quando o compromisso não tem histórico algum.
29. Tornar o retorno visual de "compromisso criado/editado com sucesso" consistente entre QuickAdd e formulário completo.
30. Garantir que a experiência mobile (Dia como padrão) não pareça uma versão reduzida da Semana, mas uma visão própria e completa.

---

## 19. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR, não introduz novas funcionalidades — apenas reorganiza, redesenha ou ajusta o que já existe.

### Etapa 1 — Unificar o filtro de exibição em uma única instância
- **Objetivo**: remover a duplicação de `renderFilterBar()` entre `#filter-bar-agenda` e `#filter-bar-appointments`, mantendo um único controle visível independentemente da aba ativa.
- **Justificativa**: resolve o problema #1 do diagnóstico e a decisão #1 da Seção 16 — a duplicação hoje confunde mais do que ajuda.
- **Arquivos envolvidos**: `index.html` (`#page-agenda`), `script.js` (chamadas a `renderFilterBar`), `academicCalendarFilter.js`.
- **Impacto esperado**: médio-alto — remove um bloco inteiro redundante da tela sem perder nenhuma função.
- **Complexidade**: baixa.
- **Riscos**: garantir que o filtro continue afetando as 4 abas (Dia/Semana/Mês/Lista) mesmo vivendo em um único container fixo.
- **Critérios de aceite**: existe apenas 1 filtro de exibição na tela; alterá-lo afeta todas as abas; nenhuma regressão de estado (localStorage) existente.

### Etapa 2 — Unificar os pontos de entrada de criação (QuickAdd como padrão)
- **Objetivo**: fazer `#btn-new-event` abrir o mesmo QuickAdd leve usado no clique da grade, com "Mais opções" levando ao formulário completo.
- **Justificativa**: resolve o problema #2/#4 do diagnóstico e a decisão #2 da Seção 16.
- **Arquivos envolvidos**: `script.js` (handler de `#btn-new-event`), `quickAdd.js`, `eventFormView.js`.
- **Impacto esperado**: alto — reduz drasticamente a fricção do caminho de criação mais visível da tela.
- **Complexidade**: baixa-média (reaproveita `openQuickAdd`/`handleMoreOptions` já existentes).
- **Riscos**: garantir que o QuickAdd sem slot pré-selecionado continue pedindo data (já suportado via `editableDate`).
- **Critérios de aceite**: clicar em "+ Novo compromisso" abre o QuickAdd; "Mais opções" leva ao formulário completo com os dados já digitados preservados; nenhuma perda de campo.

### Etapa 3 — Resumo de uma linha no topo da Semana/Dia
- **Objetivo**: adicionar uma frase sempre visível (ex.: "5 compromissos esta semana · 2 já estudados") acima da grade.
- **Justificativa**: resolve o problema #3 do diagnóstico e a melhoria #2 da Seção 18.
- **Arquivos envolvidos**: `weekView.js` (`buildShell`, `fetchAndRender`), `style.css`.
- **Impacto esperado**: alto — entrega a resposta a "como está minha semana" sem exigir leitura da grade inteira.
- **Complexidade**: média (agregação simples sobre os dados já buscados em `fetchAndRender`).
- **Riscos**: nenhum dado novo é necessário — cuidado só para não duplicar cálculo já feito em outro lugar (ex. `decisionEngine`).
- **Critérios de aceite**: frase aparece sempre, mesmo com 0 compromissos (tom apropriado); dado bate com o que a grade mostra.

### Etapa 4 — Sinalização visual de conflito de horário
- **Objetivo**: adicionar um indicador visual (ícone/cor) de conflito nos blocos de evento afetados pela grade, além da divisão de largura já existente.
- **Justificativa**: resolve o problema de UX #6 e a decisão #9 da Seção 16.
- **Arquivos envolvidos**: `weekView.js` (`_layoutOverlaps`, `renderEvents`), `style.css` (`.wk-event`).
- **Impacto esperado**: alto — conflito passa a ser percebido sem exigir atenção detalhada à largura dos blocos.
- **Complexidade**: baixa-média.
- **Riscos**: cuidado para não adicionar mais um elemento de texto em blocos já densos — priorizar um sinal compacto (borda/ícone).
- **Critérios de aceite**: todo compromisso que hoje divide largura de coluna por sobreposição recebe também um sinal visual reconhecível sem precisar clicar.

### Etapa 5 — Redução de densidade textual nos blocos de evento pequenos
- **Objetivo**: em blocos de altura reduzida, mostrar só título + hora; categoria e indicador de execução só acima de um limiar de altura.
- **Justificativa**: resolve o problema de UI #1 e a melhoria visual #1 da Seção 17.
- **Arquivos envolvidos**: `weekView.js` (`renderEvents`, `renderDayEvents`), `style.css` (`.wk-event`).
- **Impacto esperado**: alto — melhora legibilidade de compromissos curtos sem remover nenhum dado (só reordena prioridade de exibição).
- **Complexidade**: média (precisa calcular altura renderizada e aplicar classe condicional).
- **Riscos**: garantir que a informação omitida continue acessível via clique/tooltip.
- **Critérios de aceite**: blocos abaixo de X px mostram só título+hora; blocos acima mostram tudo como hoje; nenhum dado é perdido, só reordenado por prioridade.

### Etapa 6 — Rótulos de hora cheia na grade (Semana/Dia)
- **Objetivo**: reduzir rótulos de tempo de 30 em 30 minutos para hora cheia, mantendo linha sutil sem texto na meia-hora.
- **Justificativa**: resolve o problema de UI #4 e a melhoria visual #3.
- **Arquivos envolvidos**: `weekView.js` (`buildTimeCol`, `buildDayTimeCol`), `style.css` (`.wk-hour-label`).
- **Impacto esperado**: médio — reduz densidade visual da coluna de horário sem perder precisão de leitura (a grade continua com 30min de granularidade).
- **Complexidade**: baixa.
- **Riscos**: mínimo, mudança isolada de renderização de rótulos.
- **Critérios de aceite**: coluna de horário mostra só horas cheias com rótulo; linhas de meia-hora continuam existindo visualmente, sem texto.

### Etapa 7 — Diferenciação visual de compromissos passados vs. futuros
- **Objetivo**: reduzir opacidade de compromissos cuja data/hora já passaram, na Semana e no Dia.
- **Justificativa**: resolve o problema de UX #9 e a decisão #6 da Seção 16.
- **Arquivos envolvidos**: `weekView.js` (`renderEvents`, `renderDayEvents`), `style.css`.
- **Impacto esperado**: médio-alto — reduz esforço de leitura para "o que vem a seguir".
- **Complexidade**: média (comparação de data/hora atual, considerar necessidade de refresh periódico).
- **Riscos**: cuidado com performance/atualização em tempo real; considerar reaproveitar o mesmo timer já usado por `updateNowLine`.
- **Critérios de aceite**: compromissos já concluídos recebem tratamento visual reduzido (sem desaparecer); atualiza corretamente ao cruzar o horário sem precisar recarregar a página.

### Etapa 8 — Compactação da toolbar da aba Lista
- **Objetivo**: agrupar busca (sempre visível) + categoria/ordenação (atrás de um único disclosure "Filtros").
- **Justificativa**: resolve o problema #19 da Seção 16 e a melhoria de UX #8 da Seção 4.
- **Arquivos envolvidos**: `index.html` (`.appointments-toolbar`), `script.js`, `style.css`.
- **Impacto esperado**: médio-alto — reduz a altura fixa ocupada antes da lista em si, especialmente relevante em mobile.
- **Complexidade**: baixa-média.
- **Riscos**: garantir que os filtros continuem descobríveis (label do toggle deve comunicar se há algum filtro ativo).
- **Critérios de aceite**: busca continua sempre visível; categoria/ordenação ficam atrás de um toggle único; toggle indica visualmente quando há filtro não-padrão ativo.

### Etapa 9 — Agrupamento por período na aba Lista
- **Objetivo**: segmentar a lista de compromissos em cabeçalhos de grupo (ex.: "Esta semana", "Próxima semana", "Mais tarde").
- **Justificativa**: resolve o problema #20 da Seção 16 e a melhoria de experiência #12 da Seção 18.
- **Arquivos envolvidos**: `script.js` (`renderList`, `getFilteredEvents`), `style.css`.
- **Impacto esperado**: médio-alto — melhora escaneabilidade sem alterar dado nenhum, só a apresentação.
- **Complexidade**: média (agrupamento por data em cima da lista já ordenada).
- **Riscos**: garantir que a ordenação por título (`A–Z`) continue fazendo sentido — agrupamento por período pode não se aplicar a todas as ordenações; desativar agrupamento quando a ordenação não for por data.
- **Critérios de aceite**: com ordenação por data, a lista mostra cabeçalhos de grupo; com ordenação por título, comportamento atual é preservado; busca continua funcionando normalmente dentro dos grupos.

### Etapa 10 — Simplificação do formulário completo (campos essenciais primeiro)
- **Objetivo**: reduzir os campos sempre visíveis do `#event-modal` a Título/Data/Hora/Categoria, movendo Local, Observação, Lembrete e Repetição para um único "Mais detalhes".
- **Justificativa**: resolve o problema #7 da Seção 4 e a melhoria de experiência #7/#8 da Seção 18.
- **Arquivos envolvidos**: `index.html` (`#event-modal`), `eventFormView.js`, `style.css`.
- **Impacto esperado**: alto — reduz a carga de decisão do formulário mais usado da Agenda sem remover nenhum campo.
- **Complexidade**: média (reorganizar disclosure existente para agrupar mais campos, sem duplicar a lógica já usada para "Mais opções"/cor).
- **Riscos**: cuidado para não esconder um campo que o usuário costuma preencher sempre (validar com dados de uso, se disponíveis) — o objetivo é reduzir ruído, não impor mais cliques a um fluxo já comum.
- **Critérios de aceite**: formulário abre só com campos essenciais + botão único "Mais detalhes"; nenhum campo é removido; dados preenchidos em campos ocultos continuam sendo salvos normalmente.

### Etapa 11 — Reforço visual do aviso de conflito no formulário
- **Objetivo**: dar ao `#f-conflict-warning` tratamento visual de alerta (cor, ícone, borda), em vez de texto simples.
- **Justificativa**: resolve o problema #6 da Seção 4 e a decisão #9 da Seção 16.
- **Arquivos envolvidos**: `index.html` (`#f-conflict-warning`), `eventFormView.js`, `style.css` (`.field-warning`).
- **Impacto esperado**: médio — reduz o risco de o estudante ignorar um conflito real ao salvar.
- **Complexidade**: baixa.
- **Riscos**: nenhum, mudança puramente visual.
- **Critérios de aceite**: aviso de conflito é visualmente impossível de confundir com um texto de ajuda comum; lógica de exibição/condição não muda.

### Etapa 12 — Redução do painel de histórico do compromisso
- **Objetivo**: substituir os 5 `stat-card--sm` por um resumo textual de 1-2 linhas + destaque para o dado mais relevante (tempo total ou última sessão).
- **Justificativa**: resolve o problema #10 da Seção 4 e a melhoria de experiência #10 da Seção 18.
- **Arquivos envolvidos**: `index.html` (`#session-stats`), `eventFormView.js`, `style.css`.
- **Impacto esperado**: médio — reduz o peso de um painel que hoje é desproporcional ao contexto (editar um compromisso).
- **Complexidade**: baixa-média.
- **Riscos**: garantir que quem quer o detalhe completo ainda tenha acesso (ex.: manter a lista de histórico abaixo do resumo).
- **Critérios de aceite**: resumo aparece por padrão de forma compacta; lista de sessões detalhada continua acessível sem informação perdida.

### Etapa 13 — Preservação de contexto temporal entre abas
- **Objetivo**: ao trocar de Semana para Mês (ou vice-versa), manter a navegação sincronizada com o período visível.
- **Justificativa**: resolve o problema #5 da Seção 4 e a decisão #14 da Seção 16.
- **Arquivos envolvidos**: `script.js` (`_setAgendaView`/controlador de abas), `weekView.js`, `calendar.js`.
- **Impacto esperado**: médio-alto — elimina uma pequena mas recorrente perda de contexto ao explorar a agenda.
- **Complexidade**: média (sincronizar estado de data entre os três módulos independentes).
- **Riscos**: cuidado para não introduzir race conditions entre `_fetchGeneration` de cada view ao sincronizar.
- **Critérios de aceite**: trocar de aba mantém o estudante no mesmo período (mês corrente da semana vista, ou semana corrente do mês vista) sempre que fizer sentido; navegação "Hoje" continua funcionando em qualquer aba.

### Etapa 14 — Paleta de categorias curada por padrão
- **Objetivo**: oferecer uma paleta pré-definida de cores para novas categorias, mantendo o picker livre como opção avançada.
- **Justificativa**: resolve o problema #7 da Seção 16 e a melhoria visual #2 da Seção 17.
- **Arquivos envolvidos**: `categoryView.js`, `index.html` (`#cat-new-color`), `style.css`.
- **Impacto esperado**: médio — reduz colisão visual de cores entre categorias ao longo do tempo.
- **Complexidade**: baixa-média.
- **Riscos**: usuários com categorias já cadastradas mantêm suas cores atuais; a paleta curada só se aplica à criação de novas categorias.
- **Critérios de aceite**: criação de categoria oferece uma paleta curada por padrão; opção de cor livre continua disponível; categorias existentes não são alteradas.

### Etapa 15 — Fusão de tip de IA e plano semanal em um único bloco
- **Objetivo**: consolidar `#wk-tip` e o toggle/lista de plano semanal em um único cartão de apoio, visualmente subordinado à grade.
- **Justificativa**: resolve o problema #23 da Seção 16 e a melhoria de experiência #17 da Seção 18.
- **Arquivos envolvidos**: `weekView.js` (`buildShell`, `loadTip`, `togglePlan`), `style.css`.
- **Impacto esperado**: médio — reduz a quantidade de blocos independentes competindo por atenção antes da grade.
- **Complexidade**: média (reorganizar dois fluxos de dados já existentes em um único componente visual, sem duplicar lógica).
- **Riscos**: garantir que a dica contextual (mais urgente) e o plano completo (mais denso) continuem distinguíveis dentro do bloco fundido.
- **Critérios de aceite**: um único bloco visual reúne dica + plano; dica continua aparecendo só quando há algo relevante; plano continua atrás de disclosure.

---

*Fim da auditoria. Nenhuma alteração de código foi realizada — este documento é exclusivamente diagnóstico e propositivo.*
