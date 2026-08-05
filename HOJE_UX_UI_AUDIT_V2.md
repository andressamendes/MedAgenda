# Auditoria UX/UI — Página "Hoje" (Anoti) — 2ª Rodada (Refinamento)

> Auditoria conceitual. Nenhum arquivo de produto foi alterado. Esta rodada não repete os achados da primeira auditoria (`HOJE_UX_UI_AUDIT.md`) — todos os itens dela já foram implementados: cabeçalho vivo com saudação, linha de progresso sempre visível no hero, elevação estrutural do bloco herói, hierarquia temporal nos compromissos, faixa de cor no lugar do badge de categoria, fusão dos stat cards num resumo compacto, remoção de affordance de clique falso, tokenização de espaçamento, reforço visual condicional do "Fechar o dia", e tom mais positivo no estado vazio. A base está sólida. Esta rodada vai mais fundo: questiona decisões que sobreviveram à primeira rodada porque, isoladamente, cada uma parecia certa — mas que juntas ainda impedem a tela de parecer um produto premium.

---

# 1. Diagnóstico Geral

### Nota atual: **7,3 / 10**

A primeira auditoria resolveu os problemas de **ausência** (sem saudação, sem progresso visível, sem hierarquia temporal). Esta segunda rodada expõe problemas de **excesso residual e falta de intenção**: a tela agora tem todas as peças certas, mas elas ainda se comportam como uma lista de seções resolvidas uma a uma — não como uma composição pensada como um todo único. Falta uma decisão de **qual é o herói real da tela quando há um alerta** (tip vs. hero competem de novo, agora ambos "resolvidos" individualmente), falta **um sistema de silêncio** (quantos blocos aparecem simultaneamente mesmo em um dia comum), e falta o acabamento de detalhe que separa "bem feito" de "impossível de fazer melhor" — motion, feedback tátil, densidade de container, peso de decisões secundárias.

---

# 2. O que ainda faz a página parecer amadora

1. **Cada seção parece ter sido resolvida isoladamente, não composta.** Cabeçalho, tip, hero, agenda, stats, close-day — cada bloco, sozinho, está bem desenhado. Mas a transição entre eles é sempre a mesma: título/rótulo + conteúdo + `margin-top`. Não existe um princípio de composição único (ex.: só o hero tem elevação de superfície; todo o resto é texto solto sobre o fundo da página) — o efeito é de uma "lista de componentes do design system", não de uma tela desenhada.
2. **A tela ainda pede para ser lida do início ao fim, não para ser vista.** Mesmo com hierarquia temporal e progresso em frase, quase todo conteúdo é texto corrido (frases, `<dt>/<dd>`, títulos de seção). Produtos como Things 3 e Apple Health resolvem isso com forma — barras, anéis, densidade tipográfica — não com mais uma frase bem escrita.
3. **Toda seção secundária ainda usa `h2` genérico do mesmo peso tipográfico** (`.today-section-title` para "Compromissos de hoje" e para "Hoje em números" dentro do disclosure) — o sistema não expressa "isto é principal" vs "isto é auxiliar" tipograficamente, só posicionalmente.
4. **Nenhuma personalidade de marca sobrevive à remoção do logo** (ver Etapa 10). A paleta é neutra, os ícones são de biblioteca de sistema, a serifa em números é a única assinatura visual e está espalhada por todo o produto — não é exclusiva da tela Hoje, então não cria identidade *desta* tela.
5. **O botão "Fechar o dia" resolve o "quando" mas não o "por quê"**: mesmo com a variante `--goal-met`, ele é um `btn-ghost` centralizado sem contexto — não comunica em nenhum momento *o que* vai acontecer ao clicar (fecha? arquiva? é reversível?). Um usuário novo hesita.
6. **Ainda existem três textos de rótulo fixos e redundantes**: "Compromissos de hoje" (dentro da tela "Hoje"), "Hoje em números" (idem) e a data por extenso no cabeçalho já dizem "hoje" três vezes na mesma tela sem necessidade.

---

# 3. O que ainda impede a página de parecer premium

1. **Falta silêncio deliberado.** Mesmo resolvendo "esconder por padrão", a dobra inicial ainda mostra, no pior caso (tip presente + hero + primeiro compromisso visível), 3 blocos de leitura antes de qualquer rolagem. Produtos premium (Things 3, Sunsama) aceitam mostrar *menos* que o disponível, não *tudo, só que organizado*.
2. **Falta gesto.** Não há nenhuma transição, nenhuma resposta tátil a ações centrais (iniciar sessão, fechar o dia, expandir números) além do que o navegador já dá de graça (troca de `hidden`). O único lugar com motion real é o modal de fechamento (`--cd-delay`), o que faz esse ser o único ponto da tela com "vida" — o resto parece estático por contraste.
3. **Falta uma superfície verdadeiramente translúcida/em camadas.** Tudo é `--color-surface` sólido com borda de 1px — o mesmo tratamento visual para card de compromisso, resumo de stats e (por extensão de sistema) qualquer outro card do produto. Nada na tela Hoje specificamente comunica "esta é a tela mais importante do app".
4. **Falta consequência visual ao progresso.** A frase de progresso (`#today-hero-progress`) é só texto cinza — não muda de peso, cor ou ícone conforme o estado (0%, em andamento, meta batida). Um app premium faria essa frase *reagir* ao dado, não só relatá-lo.
5. **A lista de compromissos trata cada item como uma linha de tabela.** `time + title + stripe + badge + button` é essencialmente uma tabela HTML disfarçada de lista de cartões. Falta uma composição que pareça desenhada para "hoje", não reaproveitada 1:1 da Agenda.

---

# 4. Problemas de UX (ordenados por impacto)

1. **Concorrência não resolvida entre Smart Card e Hero.** A primeira auditoria identificou o problema; a implementação atual não criou nenhuma relação visual entre os dois — o tip continua um bloco independente acima do hero, sem seta, sem conexão, sem indicação de que "isto é o motivo pelo qual você deveria fazer aquilo". Continuam sendo dois avisos sequenciais, não uma frase causal.
2. **"Fechar o dia" não é reversível aos olhos do usuário.** Não há confirmação do que muda depois de fechar (o dia "acaba"? os compromissos futuros do dia somem da lista? pode reabrir?) — a ação tem peso semântico ("fechar") sem que a interface explique a reversibilidade real.
3. **A frase de progresso e o resumo do disclosure contam a mesma história duas vezes, com atritos diferentes.** `formatGoalSentence()` no hero e `_summaryMarkup()` no disclosure usam a mesma fonte de dado (`dailyGoal`) mas em formatos diferentes (frase vs. rótulo+valor) — abrir o disclosure depois de já ler a frase é, na prática, reler a mesma informação com mais precisão, o que é válido, mas não é comunicado ("ver detalhes" vs. repetição não é sinalizado no rótulo do toggle).
4. **Nenhuma pista de "e depois de estudar, o que eu faço"** — o CTA cobre "começar", os compromissos cobrem "agenda", os stats cobrem "quanto". Não há nenhum reforço de que, ao terminar uma sessão, a tela mostrará algo diferente/novo (o retorno do estudo termina em silêncio, sem nenhum feedback na própria tela Hoje além dos números mudarem).
5. **O botão "Iniciar sessão" por compromisso é uma segunda forma de fazer a mesma coisa que o hero já oferece** ("Começar a estudar"), sem nenhuma diferenciação de contexto na interface — o usuário tem dois pontos de entrada para "estudar agora" na mesma tela, e nada explica quando usar um ou outro (o hero é genérico; o botão por item é vinculado a um compromisso específico — essa diferença semântica não está visível, só está na lógica).
6. **Continue (`today-cta--alt`) ainda depende de o usuário ler o texto completo do botão** para saber o que vai acontecer ("Continuar: {título}") — em títulos longos, span sem tratamento algum de truncamento (ver §5.4) transforma uma ação secundária em ruído de leitura.

---

# 5. Problemas de UI (ordenados por impacto)

1. **Ausência de qualquer camada/elevação diferenciada por prioridade.** `.today-hero` tem `--shadow-lg`; `.today-appt-item` tem borda simples sem sombra; `.stat-summary` tem `--shadow-sm`. A escala existe, mas não está a serviço de comunicar "isto importa mais" de forma consistente — o hero tem sombra grande simplesmente porque é `.card`-like, não porque foi desenhado como o centro de gravidade visual da tela.
2. **Ícones ausentes onde fariam diferença.** O smart card tem ícone (`smart-card-icon`); o hero, a lista de compromissos e "Fechar o dia" não têm nenhum. Resultado: o único elemento "ilustrado" da tela é o alerta — o que inverte a hierarquia emocional (alertas chamam mais atenção visual que a ação positiva de estudar).
3. **O traço de cor de categoria (`.today-appt-category`, 0.3rem) é fino a ponto de, em 360px com tema escuro e cores de categoria próximas em luminância, ser praticamente imperceptível** — resolveu o excesso de badges, mas criou um extremo oposto (informação quase invisível) sem meio-termo (ex.: um traço um pouco mais largo, ou reforçado por um ícone pequeno de categoria já usado em outras telas do produto).
4. **Nenhum tratamento de overflow no `.today-cta--alt`** ("Continuar: {título}") — diferente de `.today-appt-title`, que já tem `text-overflow: ellipsis`, o botão Continue não trunca, podendo quebrar o layout do hero em títulos de sessão longos.
5. **O ícone de conflito e o de atenção do smart card comunicam "cuidado" com vocabulário visual diferente** — o smart card usa ícone (`iconAlertTriangle`) + rótulo "Atenção"; o conflito de compromisso usa só borda + badge de texto "Conflito de horário", sem ícone. Duas gramáticas para o mesmo nível de severidade.
6. **`.today-stats-toggle-row` some visualmente demais quando fechado** — é um botão ghost pequeno sem nenhuma prévia de valor (diagnóstico #18/#19 da 1ª auditoria continua parcialmente não resolvido: o rótulo ainda é só "Ver números de hoje", sem nenhum número-âncora antes do clique, apesar de o dado já estar disponível na mesma chamada usada pela frase do hero).
7. **`.today-close-day` é um `<div>` centralizado isolado com `margin-top: var(--space-7)`** — o maior espaço em branco da tela inteira separa o encerramento do resto, o que é correto como intenção, mas sem nenhuma transição visual (linha, gradiente, mudança de fundo) parece um elemento esquecido no rodapé, não o fim proposital de um percurso.

---

# 6. Problemas de hierarquia

- **Quando tip + hero + próximo compromisso coexistem, a tela ainda apresenta 3 "primeiros elementos" candidatos** — a elevação do hero ajuda, mas o tip (que vem antes, no fluxo de leitura) continua competindo por ser o primeiro contato visual, já que tem cor de fundo própria (`smart-card--atencao` etc.) que pode ser mais saturada que o hero neutro.
- **Título "Compromissos de hoje" e título "Hoje em números" usam a mesma classe (`.today-section-title`)** apesar de terem importância claramente diferente (um é sempre visível e é conteúdo primário; o outro só aparece dentro de um disclosure fechado por padrão) — nada tipograficamente sinaliza esse contraste de importância.
- **A cor de destaque do compromisso "próximo"** (`--color-primary-300`/`--color-primary-50`) usa a mesma família de azul do CTA principal (`.btn-primary`) — quando os dois aparecem na tela ao mesmo tempo (hero + próximo compromisso destacado), competem pelo mesmo significado de "isto é importante", diluindo qual dos dois é a prioridade real.
- **Não existe hierarquia entre os dois motivos de "Fechar o dia" ganhar destaque** (meta batida) **e "Continuar sessão em andamento" ganhar destaque** (sessão ativa) — ambos usam reforço de cor (verde-sucesso vs. azul-primário) mas não seguem a mesma lógica de "quando algo muda de estado, o usuário deveria perceber sem ler".

---

# 7. Problemas de carga cognitiva

- **A pergunta "por que este compromisso está destacado?" não tem resposta visual sozinha.** O item "próximo" muda de cor de fundo/borda, mas nada no item comunica textualmente "próximo" — o usuário precisa inferir a partir da posição/cor, o que funciona bem para quem já usa o app, mas exige uma pequena curva de aprendizado na primeira vez (não há legenda, tooltip ou rótulo, mesmo discreto).
- **A diferença semântica entre "Iniciar sessão" (por compromisso) e "Começar a estudar" (hero) exige que o usuário já saiba, de antemão, que uma cria uma sessão vinculada ao compromisso e outra não** — a interface não ensina essa diferença em lugar nenhum da tela Hoje.
- **O disclosure de estatísticas ainda pede uma decisão binária sem prévia de valor** ("vale a pena abrir isso?") — mesmo que a filosofia "mede em silêncio" seja correta, o toggle atual não dá nenhuma pista do que tem lá dentro além do rótulo genérico.
- **Cabeçalho + smart card + hero + lista, todos com fundo transparente/plano**, exigem do usuário decidir sozinho onde um bloco termina e o outro começa — sem nenhuma pista de agrupamento visual (fundo alternado, separador sutil, cartão de container), a leitura depende só de espaçamento vertical.

---

# 8. Problemas de mobile

- **Em 360px, quando tip + hero (com Continue visível) + 3 compromissos aparecem juntos, a "ação de estudar" só fica visível após rolagem parcial** em aparelhos com barra de navegação/status alta — o bloco herói, mesmo elevado, ainda concorre por espaço vertical com o tip acima dele.
- **`.today-cta` tem `min-width: 220px`**, o que em 360px (com padding lateral da página) deixa pouquíssima folga — texto mais longo de estado (ex. variantes de idioma/acessibilidade de fonte do sistema aumentada) arrisca quebra de linha dentro do botão primário, o elemento mais crítico da tela.
- **O traço de categoria (`.today-appt-category`, 0.3rem)** fica ainda mais difícil de perceber em telas pequenas com o dedo cobrindo parte do item ao tocar — não há redundância tátil/de área que compense a redução do sinal visual em relação ao badge textual anterior.
- **`.today-close-day` com `margin-top: var(--space-7)`** empurra o botão de encerramento para bem abaixo da dobra em qualquer dia com mais de 3–4 compromissos + stats abertos, exigindo rolagem "às cegas" (sem indicação de que o botão existe logo abaixo) — sensação de app com fim solto, não de app com estrutura fixa.
- **Nenhum elemento da tela usa área tocável ampliada além do botão primário** — o traço de categoria, o rótulo do disclosure e o botão "Fechar o dia" (ghost, padding pequeno) têm alvo de toque abaixo do que se espera de um app "nativo" premium (referência: 44×44pt da HIG).

---

# 9. Problemas de design emocional

- **A tela comunica competência, não calor.** Depois da saudação, tudo volta a ser neutro e funcional — não há nenhum reforço emocional entre o cabeçalho e o "Fechar o dia" (que só reage visualmente se a meta foi batida). Em dias medianos (nem vazios, nem de meta batida), a tela é emocionalmente plana do início ao fim.
- **O "Fechar o dia" neutro (dia sem meta ou em andamento) é visualmente idêntico a qualquer botão ghost secundário do resto do app** — não carrega nenhuma expectativa própria de ritual, mesmo sabendo (pela documentação do código) que a intenção é ser um "gesto de encerramento".
- **Não existe nenhum reconhecimento de esforço parcial.** Um usuário que estudou 20 dos 60 minutos da meta só vê isso relatado em uma frase neutra — nada na tela comemora progresso incremental (mesmo pequeno), só o estado final "meta batida" tem tratamento emocional (cor verde no fechamento).
- **O streak/constância, que é um dos maiores motivadores de hábito em apps de produtividade (Apple Health, TickTick, Rotinize), só aparece dentro do modal de fechamento** — o usuário só vê seu streak depois de decidir encerrar o dia, quando esse dado poderia (com moderação, sem virar gamificação ruidosa) reforçar a decisão de continuar estudando *antes* de fechar.

---

# 10. Os 25 refinamentos de maior impacto

*(ordenados do maior para o menor ganho — reorganizar, simplificar, remover, fundir, refinar, priorizar; nenhuma funcionalidade nova)*

1. Unificar visualmente Smart Card + Hero num único bloco de abertura quando o tip existir (mesmo container, sem duas caixas separadas competindo por serem "o primeiro elemento").
2. Dar ao hero uma identidade cromática/de superfície que nenhum outro bloco da tela reutiliza (hoje ele só tem "mais sombra"; precisa de um tratamento que nenhum stat/compromisso copie, para nunca dividir o centro de gravidade).
3. Adicionar um rótulo curto e discreto ("próximo") ao compromisso destacado, para que a hierarquia temporal seja lida, não só percebida por contraste de cor.
4. Trocar a cor de destaque do "próximo compromisso" para uma família cromática distinta da do CTA principal, eliminando a competição de significado entre "ação" e "próximo evento".
5. Adicionar prévia de valor ao toggle de estatísticas (reaproveitando o mesmo dado já usado na frase do hero) para que o clique deixe de ser uma aposta.
6. Truncar (`text-overflow: ellipsis`) o texto do botão "Continuar: {título}" para impedir quebra de layout com títulos longos.
7. Aumentar a área de toque do traço de categoria e do botão "Fechar o dia" para o mínimo confortável (referência HIG), sem alterar sua forma visual.
8. Adicionar uma pequena transição de estado (fade/scale sutil) ao trocar Resume/Start/Continue e ao expandir/colapsar o disclosure — hoje a troca é abrupta via `hidden`.
9. Diferenciar tipograficamente "Compromissos de hoje" (primário) de "Hoje em números" (secundário, dentro do disclosure) — não apenas pela posição, mas pelo peso/tamanho da fonte.
10. Explicar, com uma microcópia de uma linha ou um estado de confirmação leve, o que muda ao clicar em "Fechar o dia" (reforça confiança, reduz hesitação).
11. Criar uma resposta visual mínima e única (não numérica) na tela Hoje para reconhecer progresso parcial, não só meta batida — ex. um leve reforço na frase de progresso conforme o percentual avança.
12. Aproximar o botão "Fechar o dia" da parte visível da tela em dias com agenda longa — reduzir o `margin-top` atual ou fixá-lo com tratamento visual mais leve, sem torná-lo sticky (mantendo simplicidade).
13. Adicionar ícone consistente ao hero e ao "Fechar o dia", alinhando a linguagem de iconografia já usada no smart card.
14. Diferenciar visualmente (não só textualmente) o alerta de "Conflito de horário" do restante da lista com um ícone, alinhando a gramática visual à do smart card `atencao`.
15. Reduzir a distância emocional entre cabeçalho e fechamento do dia — inserir algum fio visual de continuidade (ex. uma borda/gradiente leve) entre os blocos da tela, evitando a sensação de "seções empilhadas".
16. Rever o traço de categoria (0.3rem) para uma largura/contraste mínimo garantido em qualquer cor de categoria, validando contraste mesmo em tema escuro.
17. Unificar a explicação implícita entre "Iniciar sessão" por compromisso e "Começar a estudar" do hero via posicionamento/agrupamento visual (o botão do item deveria parecer claramente "uma variação vinculada", não uma ação nova concorrente).
18. Adicionar delay de entrada sutil (mesmo princípio do `--cd-delay` do modal de fechamento) na composição inicial da tela Hoje, para que a chegada tenha o mesmo polimento que a saída.
19. Reduzir a "sensação de tabela" dos itens de compromisso — dar respiro/composição vertical em vez de tudo em uma linha `flex` rígida.
20. Trazer o streak de dias (hoje só visível no modal) para um sinal discreto e opcional na tela principal, sem virar um novo card.
21. Uniformizar o tratamento de elevação (`shadow`) entre hero, itens de compromisso e stat summary numa escala clara e proposital, não incidental.
22. Adicionar um pequeno estado de "carregado com sucesso" (feedback tátil/visual) quando "Iniciar sessão" é clicado a partir de um item da lista, hoje sem nenhuma confirmação antes da navegação.
23. Revisar o rótulo do botão "Fechar o dia" para comunicar reversibilidade/expectativa ("Fechar o dia" → algo que deixe claro que é seguro e não perde nada).
24. Ajustar o peso visual do "Continue" (`.today-cta--alt`) para que, quando visível ao lado do Start, sua diferença de prioridade fique óbvia mesmo para quem não lê o texto completo (hoje depende só de tamanho/cor de fonte).
25. Validar e documentar formalmente o uso de `--font-display` como assinatura de marca (não acidente) — se for intencional, estendê-lo com critério a mais pontos-chave da tela Hoje (ex. valor da frase de progresso quando destacado); se não for, restringir seu uso.

---

# 11. Nova direção para a página Hoje

A página Hoje deve deixar de ser percebida como **"uma lista de blocos bem resolvidos"** e passar a ser percebida como **"um único gesto guiado"**.

Hoje, tecnicamente, cada seção resolve seu próprio problema — mas o usuário não experimenta seções, experimenta uma tela inteira, de uma vez. A nova direção é:

- **Um só centro de gravidade por vez.** Quando há um alerta, ele *é* a razão de abrir o app — o hero deveria nascer dessa mesma superfície, não ao lado dela. Quando não há alerta, o hero é sozinho o centro, sem nenhum outro elemento disputando peso visual equivalente.
- **A tela reage, não relata.** Cor, peso e presença de cada frase (progresso, "próximo" compromisso, botão de fechar) devem mudar de acordo com o estado do dia — não porque alguém decidiu "isso fica verde quando bate a meta", mas porque a tela inteira segue uma lógica única de intensidade crescente conforme o dia avança e o esforço se acumula.
- **Chegar e sair têm o mesmo cuidado.** O modal de fechamento (com seu `--cd-delay`, sua composição de tela cheia, seu ritmo) é hoje o único momento "desenhado" da experiência. A chegada — abrir o app pela manhã — merece o mesmo nível de polimento, não porque precisa de mais elementos, mas porque precisa da mesma intenção de composição.
- **Menos "seções", mais "momentos".** Cabeçalho, alerta e ação deveriam ser lidos como um único momento de decisão ("é isto que você faz agora"); agenda e progresso, como um segundo momento de contexto ("é assim que seu dia está"); fechamento, como o terceiro e último momento ("foi assim que seu dia foi"). Três momentos, não seis blocos.

O critério final: se, ao remover todos os rótulos e textos de apoio da tela, um usuário ainda entender — só pela forma, cor e posição — qual é a ação certa agora, o que já aconteceu e o que está por vir, a tela terá alcançado o padrão que este briefing pede.

---

# 12. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR, não introduz funcionalidade nova e não altera regra de negócio — apenas reorganiza, funde, simplifica, remove ou refina o que já existe.

### Etapa 16 — Fundir Smart Card e Hero num único bloco de abertura
- **Objetivo**: quando houver um tip ativo, renderizá-lo dentro do mesmo container do hero (não como bloco separado acima), preservando a mesma leitura sequencial (alerta → ação), mas como uma única superfície.
- **Justificativa**: resolve o problema #1 de hierarquia (dois "primeiros elementos" concorrentes) e o achado de composição do diagnóstico geral (§3.1).
- **Arquivos envolvidos**: `index.html` (`#today-tip`, `.today-hero`), `todayView.js` (`_refreshTip`, ordem de montagem), `style.css` (`.today-hero`, `.smart-card` no contexto aninhado).
- **Impacto esperado**: alto — resolve a maior fonte de competição visual da dobra inicial.
- **Complexidade**: média (requer decidir o comportamento do container quando não há tip — não pode sobrar espaço vazio nem mudar o tamanho do hero perceptivelmente).
- **Riscos**: `.smart-card` é componente reutilizado em outras telas (Semana); garantir que a fusão seja escopada só ao contexto "today" via classe/wrapper, sem alterar `smartCardView.js` globalmente.
- **Critérios de aceite**: com tip, alerta e ação aparecem como uma composição única; sem tip, o hero ocupa o mesmo espaço de hoje sem "buraco"; nenhuma mudança de comportamento em `weekView.js`.

### Etapa 17 — Rótulo textual discreto no compromisso "próximo"
- **Objetivo**: adicionar um rótulo curto (ex. "Próximo") ao item da lista já destacado por `.today-appt-item--next`.
- **Justificativa**: resolve o problema de carga cognitiva #1 — hoje a hierarquia temporal só é perceptível por cor/contraste, exigindo aprendizado prévio.
- **Arquivos envolvidos**: `todayView.js` (`_buildApptItem`/`_applyApptTemporalStates`), `style.css` (`.today-appt-item--next` — novo elemento de rótulo).
- **Impacto esperado**: médio-alto — pequena mudança, resolve ambiguidade real para novos usuários.
- **Complexidade**: baixa.
- **Riscos**: mínimo — cuidado para o rótulo não competir em peso com o horário/título (deve ser o menor elemento textual da linha).
- **Critérios de aceite**: rótulo aparece só no item "próximo"/"em andamento"; não aparece em itens passados nem futuros; passa em 360px sem quebra de linha.

### Etapa 18 — Diferenciar cor do "próximo compromisso" da cor do CTA principal
- **Objetivo**: trocar a paleta de destaque de `.today-appt-item--next` (hoje `--color-primary-*`, mesma família do botão de estudo) por uma cor neutra-destacada distinta.
- **Justificativa**: resolve o problema de hierarquia #3 — evita que "próximo compromisso" e "ação principal" disputem o mesmo significado de "isto é a prioridade".
- **Arquivos envolvidos**: `style.css` (`.today-appt-item--next`, `.today-appt-item--next .today-appt-time`).
- **Impacto esperado**: médio — clareza de prioridade sem adicionar elementos novos.
- **Complexidade**: baixa.
- **Riscos**: garantir que a nova cor mantenha contraste adequado em tema claro/escuro.
- **Critérios de aceite**: cor do item "próximo" e do CTA principal são visivelmente distintas; ambas continuam legíveis nos dois temas.

### Etapa 19 — Prévia de valor no toggle de estatísticas
- **Objetivo**: mostrar um valor-âncora (ex. tempo estudado hoje) já no rótulo do `#today-stats-toggle`, antes do clique.
- **Justificativa**: resolve o problema de UI #6 e o item #18/#19 pendente da 1ª auditoria — reduz a "aposta" de abrir o disclosure.
- **Arquivos envolvidos**: `todayView.js` (`_refreshHeroProgress` — reuso do mesmo dado), `disclosureToggle.js` (suporte a rótulo dinâmico, se necessário), `index.html`.
- **Impacto esperado**: médio — melhora escaneabilidade sem reintroduzir números crus fora do disclosure.
- **Complexidade**: baixa (dado já calculado e já disponível na mesma função).
- **Riscos**: mínimo — cuidado para não duplicar literalmente a frase do hero (o valor no toggle deve ser mais telegráfico, tipo "45min").
- **Critérios de aceite**: rótulo do toggle muda conforme o dado do dia; nenhuma chamada de rede nova; segue escondendo o detalhe completo até o clique.

### Etapa 20 — Truncamento do texto do botão "Continuar"
- **Objetivo**: aplicar `text-overflow: ellipsis` (ou truncamento equivalente) ao texto de `#today-btn-continue`.
- **Justificativa**: resolve o problema de UX #6 e UI #4 — protege o layout do hero contra títulos de sessão longos.
- **Arquivos envolvidos**: `style.css` (`.today-cta--alt`).
- **Impacto esperado**: baixo-médio, mas correção de robustez simples.
- **Complexidade**: trivial.
- **Riscos**: nenhum.
- **Critérios de aceite**: títulos longos não quebram o layout do hero em nenhuma largura testada (360/390/430).

### Etapa 21 — Ícone consistente no hero e no "Fechar o dia"
- **Objetivo**: adicionar ícone (do mesmo conjunto usado em `smartCardView.js`/`icons.js`) ao CTA principal do hero e ao botão de fechar o dia.
- **Justificativa**: resolve o problema de UI #2 — hoje só o alerta tem ícone, invertendo a hierarquia emocional.
- **Arquivos envolvidos**: `index.html` (`#today-btn-start`/`#today-btn-resume`/`#today-btn-close-day`), `icons.js`, `style.css`.
- **Impacto esperado**: médio — reforça linguagem visual consistente e aumenta reconhecimento visual (Etapa 5 da auditoria original, escaneabilidade).
- **Complexidade**: baixa.
- **Riscos**: mínimo — cuidado com alinhamento vertical ícone+texto em todos os estados do botão.
- **Critérios de aceite**: hero e "Fechar o dia" têm ícone; alinhamento consistente com o padrão já usado no smart card.

### Etapa 22 — Ícone no alerta de conflito de horário
- **Objetivo**: adicionar o mesmo ícone de atenção (`iconAlertTriangle`) ao badge `.today-appt-conflict-badge`.
- **Justificativa**: resolve o problema de UI #5 — unifica a gramática visual de "cuidado" entre smart card e lista de compromissos.
- **Arquivos envolvidos**: `todayView.js` (`_buildApptItem`), `icons.js`, `style.css`.
- **Impacto esperado**: baixo-médio, ganho de consistência.
- **Complexidade**: trivial.
- **Riscos**: nenhum.
- **Critérios de aceite**: badge de conflito exibe o mesmo ícone usado no smart card `atencao`; nenhuma mudança de comportamento/lógica de detecção de conflito.

### Etapa 23 — Área de toque mínima em elementos secundários
- **Objetivo**: garantir alvo de toque confortável (referência ~44×44pt) no traço de categoria (via área clicável invisível, se aplicável) e no botão "Fechar o dia".
- **Justificativa**: resolve o problema de mobile #5.
- **Arquivos envolvidos**: `style.css` (`.today-appt-category`, `#today-btn-close-day`).
- **Impacto esperado**: médio em mobile, baixo em desktop.
- **Complexidade**: baixa.
- **Riscos**: mínimo — cuidado para não alterar a forma visual atual, só a área de interação/padding.
- **Critérios de aceite**: alvo de toque mensuravelmente maior nos elementos citados, sem mudança visual perceptível de tamanho da forma.

### Etapa 24 — Aproximar "Fechar o dia" da parte visível em dias com agenda longa
- **Objetivo**: reduzir o espaçamento fixo (`--space-7`) acima de `.today-close-day` para algo proporcional ao conteúdo acima, sem torná-lo sticky.
- **Justificativa**: resolve o problema de mobile #4 — hoje o botão pode ficar "perdido" bem abaixo da dobra em dias com agenda longa + stats expandidos.
- **Arquivos envolvidos**: `style.css` (`.today-close-day`).
- **Impacto esperado**: médio em usabilidade mobile.
- **Complexidade**: baixa.
- **Riscos**: mínimo — validar que a redução de espaço não faça o botão parecer "colado" em dias com pouco conteúdo.
- **Critérios de aceite**: botão continua alcançável com menos rolagem em dias de agenda longa; mantém respiro visual adequado em dias vazios.

### Etapa 25 — Microcópia de reversibilidade em "Fechar o dia"
- **Objetivo**: adicionar uma linha curta de apoio (ou tooltip/aria-description) explicando o que acontece ao fechar o dia.
- **Justificativa**: resolve o problema de UX #2 — reduz hesitação por falta de expectativa clara.
- **Arquivos envolvidos**: `index.html` (`.today-close-day`), `style.css`.
- **Impacto esperado**: médio, ganho de confiança.
- **Complexidade**: trivial.
- **Riscos**: nenhum — texto novo, nenhuma lógica nova.
- **Critérios de aceite**: usuário consegue entender, sem clicar, que a ação é segura e o que muda ao confirmá-la.

### Etapa 26 — Transições de estado no hero e no disclosure
- **Objetivo**: adicionar uma transição sutil (opacidade/altura) na troca Resume/Start/Continue e na abertura/fechamento do disclosure de estatísticas.
- **Justificativa**: resolve o problema de microinterações (Etapa 9 do briefing) — hoje a única tela com motion desenhado é o modal de fechamento.
- **Arquivos envolvidos**: `style.css` (`.today-cta`, `.today-stats-body`), `disclosureToggle.js` (se precisar de hook de transição).
- **Impacto esperado**: médio-alto em percepção de qualidade ("sensação de app nativo").
- **Complexidade**: média (cuidado com `prefers-reduced-motion` e com não introduzir layout shift).
- **Riscos**: performance em dispositivos mais fracos; respeitar `prefers-reduced-motion: reduce`.
- **Critérios de aceite**: transições visíveis e curtas (~150–200ms); nenhuma mudança de comportamento funcional; respeita preferência de movimento reduzido do usuário.

### Etapa 27 — Diferenciação tipográfica entre título primário e secundário de seção
- **Objetivo**: dar a "Compromissos de hoje" um peso/tamanho maior que "Hoje em números", hoje ambos em `.today-section-title`.
- **Justificativa**: resolve o problema de hierarquia #2 — sinaliza tipograficamente a diferença de importância, não só posicionalmente.
- **Arquivos envolvidos**: `style.css` (nova classe modificadora, ex. `.today-section-title--secondary`, aplicada só ao título dentro do disclosure), `index.html`.
- **Impacto esperado**: baixo-médio, mas reforça a leitura correta de prioridade.
- **Complexidade**: trivial.
- **Riscos**: nenhum.
- **Critérios de aceite**: os dois títulos são visivelmente diferentes em peso/hierarquia; nenhuma mudança de estrutura semântica (ambos continuam `h2`).

### Etapa 28 — Trazer o streak para a tela principal, discreto
- **Objetivo**: exibir o streak de dias atual (hoje só visível dentro do modal de fechamento) como um sinal pequeno e opcional na tela Hoje — sem virar um novo card.
- **Justificativa**: resolve o problema de design emocional #4 — reforço motivacional que hoje só chega tarde demais (no fechamento).
- **Arquivos envolvidos**: `todayView.js` (reuso do dado já calculado por `closeDayService.getDayRecap()` ou equivalente), `index.html`, `style.css`.
- **Impacto esperado**: médio-alto em motivação percebida, sem aumentar complexidade visual.
- **Complexidade**: média — decidir onde esse sinal cabe sem competir com o hero (provável candidato: dentro do próprio hero, junto da frase de progresso).
- **Riscos**: cuidado para não reintroduzir um "card de métrica" — deve continuar como texto/sinal discreto, alinhado à filosofia "mede em silêncio, fala em frases".
- **Critérios de aceite**: streak aparece de forma discreta na tela principal quando > 0; não aparece (ou aparece neutro) quando o streak foi quebrado; nenhum cálculo novo, mesmo dado do modal de fechamento.

---

*Fim da 2ª auditoria. Nenhuma alteração de código foi realizada — este documento é exclusivamente diagnóstico e propositivo, complementar a `HOJE_UX_UI_AUDIT.md`.*
