# Auditoria UX/UI — Página "Sessão" (Anoti)

> Auditoria conceitual. Nenhum arquivo de produto foi alterado. Nenhuma funcionalidade foi adicionada ou removida — apenas diagnóstico e proposta de reorganização. Baseada na implementação real (`index.html` `#page-study-session`, `studySessionView.js`, `style.css` seção `.ss-*`, `activeSessionIndicatorView.js`, `abandonedSessionDialog.js`).

---

## 1. Objetivo da página

A página **Sessão** é o único lugar do aplicativo onde o estudante permanece continuamente, por dezenas de minutos ou horas, em vez de passar rapidamente. Diferente de "Hoje" (gatilho de ação) ou "Diário" (leitura retrospectiva), Sessão precisa sustentar **atenção prolongada sem se tornar ela mesma uma fonte de distração**. Seu papel não é informar tudo o que é possível fazer — é confirmar continuamente uma única coisa: *"você está estudando, e está tudo sob controle."*

As perguntas que a tela precisa responder, em ordem de prioridade, e em qualquer instante durante a sessão:

1. **Estou estudando agora?** (rodando vs. pausado — estado imediato, sem leitura)
2. **Há quanto tempo?** (o cronômetro — a única métrica que importa segundo a segundo)
3. **Posso pausar ou finalizar?** (as duas únicas ações que precisam estar sempre ao alcance)
4. **O que estou estudando?** (contexto mínimo — nome do compromisso/estudo, sem exigir leitura)
5. **Posso registrar uma questão rapidamente, sem sair do fluxo?** (só quando o estudante decide agir, nunca por padrão)
6. **Se eu quiser, onde encontro o resto (categoria, revisões, cancelar)?** (deve existir, mas nunca competir visualmente com 1–4)
7. **Ao finalizar, meu esforço foi reconhecido?** (fechamento com sensação de conclusão, não só um formulário salvo)

Avaliando a implementação atual, a página **já resolve estruturalmente bem** as perguntas 1, 2 e 3 — o card `#ss-active` mostra status, cronômetro e no máximo dois botões primários (`Pausar`/`Continuar` + `Finalizar`) por padrão, e o resto do conteúdo (categoria completa, conteúdo, data, questões, revisões, cancelar) foi consolidado em um único painel sob demanda (`#ss-panel`, "Detalhes da sessão"), com modo foco (`.focus-mode`) que oculta header/sidebar/bottom-nav. Isso já é uma arquitetura de informação mais madura do que a de um painel administrativo típico — não se trata de uma tela lotada de módulos soltos, e sim de uma tela que já tentou (e em parte conseguiu) reduzir ruído em rodadas anteriores de auditoria (comentários `F1`–`F18`, `V5.x` no próprio código atestam isso).

O que falta não é remover módulos — é o **acabamento**: o cronômetro ainda não é visualmente o único protagonista inquestionável (tipografia de 3rem, cor cinza `--gray-800`, mesmo peso de superfície que qualquer outro cartão do app); o card ativo ainda expõe simultaneamente badge de status + botão de foco + barra de progresso + cartão de contexto + dois botões + botão de "Detalhes" — 6 blocos verticais antes de qualquer interação, quando o ideal para "modo estudo" seria 2 a 3; e o encerramento (`#ss-finish-modal`) é um formulário funcional, mas não devolve nenhuma sensação de conquista.

---

## 2. Diagnóstico geral

### Nota: **7,0 / 10**

Esta é, das páginas centrais do produto, a que já recebeu mais rodadas de refinamento consciente (consolidação de painéis, modo foco, redução de ações simultâneas, campos condicionais em vez de "—"). A base é sólida. O que resta é essencialmente um problema de **hierarquia visual e peso emocional**, não de excesso de funcionalidades ou de arquitetura errada — a tela sabe o que esconder, mas ainda não sabe fazer o que mostra parecer inevitável e premium.

### Pontos positivos

- **Ação principal nunca ambígua**: no máximo dois botões primários visíveis por vez (`Pausar`/`Continuar` + `Finalizar`); tudo o resto (Cancelar, contexto completo, Questões, Revisões) foi deliberadamente movido para dentro de um único painel sob demanda.
- **Um único ponto de entrada para o "resto"**: `#ss-btn-open-panel` ("Detalhes da sessão") substitui o que antes eram múltiplos disclosures — reduz decisão sobre "onde clico para X" a uma escolha só.
- **Modo foco real**: `.focus-mode` oculta header, sidebar e bottom-nav via CSS, deixando literalmente só o cartão de sessão na tela — a intenção de "ambiente de concentração" já existe no código, só não é o estado padrão.
- **Campos condicionais, não campos vazios**: linhas de contexto (categoria, conteúdo, data, tempo previsto) só aparecem quando têm valor — elimina "—" repetidos que sujavam a leitura em versões anteriores.
- **Indicador global sem duplicar controles**: `activeSessionIndicatorView.js` (mini-timer flutuante) mostra que uma sessão está rodando em qualquer outra página, mas se oculta propositalmente dentro da própria página de Sessão para não duplicar informação — decisão de design consciente e correta.
- **Registro de questão com atrito mínimo**: o formulário rápido (`#ss-q-quick-total`/`#ss-q-quick-errors` + botão "Registrar") cobre o caso comum em 2 campos, com o formulário detalhado (tipo, status, dificuldade, matéria, tópico) escondido atrás de "+ Adicionar com detalhes".
- **Progresso temporal opcional e silencioso**: a barra `#ss-progress` só aparece quando existe tempo previsto vinculado ao compromisso — não força uma métrica onde não há contexto para ela.

### Principais problemas

1. **O cronômetro não é visualmente dominante o suficiente para ser o "herói" da tela** — 3rem (`--font-size-4xl`), cor `--gray-800`, mesma família tipográfica de outros valores serifados do app (stat-cards, anel de meta); nada no tratamento visual comunica "isto é o motivo de esta tela existir".
2. **O card ativo ainda empilha 6 blocos verticais por padrão** (header com badge+foco, timer, barra de progresso condicional, cartão de contexto com 2 itens, 2 botões de ação, botão "Detalhes da sessão") — abaixo do ideal para uma tela que quer parecer "um só gesto", mesmo já sendo enxuta comparada ao histórico do próprio código.
3. **Modo foco é opt-in, não o padrão** — a tela que mais deveria "sumir ao redor do usuário" ainda abre com header, sidebar (desktop) e bottom-nav visíveis; o estudante precisa descobrir e clicar em "Foco" para obter a experiência que o produto já sabe entregar.
4. **O encerramento (`#ss-finish-modal`) é apenas um formulário de confirmação, sem nenhum reforço emocional** — mostra os mesmos dados já vistos durante a sessão, pede uma reflexão em texto livre e tem dois botões; não há nenhuma resposta visual ao esforço concluído (tempo total, sequência, comparação, celebração).
5. **O modal de início (`#ss-start-modal`) tem uma decisão binária logo na abertura (Novo estudo vs. Compromisso da agenda) que nem sempre é a pergunta certa** — quando o usuário chegou a esta tela a partir de "Continuar sessão" de um compromisso específico, ainda assim vê duas abas, criando uma escolha desnecessária em um momento que deveria ser de fricção mínima.
6. **Botão "Foco" e badge de status dividem a mesma linha de topo do card**, competindo por atenção logo no primeiro elemento visível da sessão ativa — nenhum dos dois é a informação que o usuário busca primeiro (tempo/status já está no timer abaixo).
7. **O painel "Detalhes da sessão" mistura três naturezas de conteúdo em um só lugar** (contexto estático de leitura, formulário de Questões, formulário de Revisões) sem nenhuma separação visual além de títulos `h3` — tecnicamente organizado, mas visualmente uma lista contínua de blocos parecidos.

---

## 3. Inventário completo

| # | Componente | Finalidade | Importância | Manter | Simplificar | Fundir | Remover | Redesenhar |
|---|---|---|---|---|---|---|---|---|
| 1 | `.page-header` / `h1.page-title "Sessão"` | Identificar a tela | Baixa (redundante com nav) | — | — | ✔ (fundir/ocultar durante sessão ativa) | — | ✔ |
| 2 | `#ss-empty` (estado sem sessão) | Convidar a iniciar | Alta | ✔ | — | — | — | leve (já é enxuto: ilustração + texto + 1 botão) |
| 3 | `#ss-start-modal` (modal de início) | Coletar nome/compromisso antes de iniciar | Alta | ✔ | ✔ (reduzir decisão de abas quando o contexto já é conhecido) | — | — | ✔ |
| 4 | Abas "Novo estudo" / "Compromisso da agenda" | Escolher origem da sessão | Média | ✔ | ✔ | — | — | ✔ (default inteligente conforme ponto de entrada) |
| 5 | "Mais opções" (categoria/conteúdo/data/duração) | Detalhar o estudo antes de começar | Baixa | ✔ | — | — | — | — (já colapsado corretamente) |
| 6 | `#ss-active` / `.ss-card` (card da sessão ativa) | Container único da sessão em andamento | Máxima | ✔ | ✔ (reduzir nº de blocos visíveis por padrão) | — | — | ✔ |
| 7 | `#ss-status-badge` | Indicar rodando/pausado | Alta | ✔ | — | ✔ (fundir com o timer, não linha própria) | — | ✔ |
| 8 | `#ss-btn-focus-toggle` ("Foco") | Ligar modo de concentração | Alta (mecanismo), baixa (descoberta) | ✔ | — | — | — | ✔ (virar padrão automático, não botão a descobrir) |
| 9 | `#ss-timer` / `.ss-timer-value` (cronômetro) | Mostrar tempo decorrido | Máxima | ✔ | — | — | — | ✔ (escala, peso, cor — tornar inconfundível protagonista) |
| 10 | `.ss-timer-label` | Explicar que pausas são descontadas | Baixa | ✔ | ✔ (mover para tooltip/estado pausado só) | — | — | — |
| 11 | `#ss-progress` (barra de progresso temporal) | Comparar tempo decorrido vs. previsto | Média (condicional) | ✔ | — | — | — | leve (aproximar visualmente do timer) |
| 12 | `#ss-pause-note` | Avisar que pausa não conta | Baixa | ✔ | — | ✔ (fundir com o badge "Pausada") | — | — |
| 13 | `.ss-status-card` (Compromisso + Categoria) | Contexto mínimo sempre visível | Alta | ✔ | ✔ (uma linha de texto, não 2 cartões) | — | — | ✔ |
| 14 | `#ss-btn-pause` / `#ss-btn-resume` | Pausar/retomar | Máxima | ✔ | — | — | — | leve (peso visual maior) |
| 15 | `#ss-btn-finish` | Finalizar sessão | Máxima | ✔ | — | — | — | leve |
| 16 | `#ss-btn-open-panel` ("Detalhes da sessão" + badge) | Único acesso ao resto do conteúdo | Alta | ✔ | — | — | — | leve (garantir que não pareça 3º botão de ação primária) |
| 17 | `#ss-panel` (painel "Detalhes da sessão") | Contexto completo + Questões + Revisões + Cancelar | Alta | ✔ | ✔ (separar visualmente as 3 naturezas de conteúdo) | — | — | ✔ |
| 18 | Bloco "Contexto" (conteúdo/data/início/tempo previsto) | Dados complementares de leitura | Média | ✔ | — | — | — | — |
| 19 | Bloco "Questões Resolvidas" (registro rápido + lista) | Registrar questões sem sair da sessão | Alta | ✔ | — | — | — | leve (reforçar contraste com formulário detalhado) |
| 20 | Formulário detalhado de questão (tipo/status/dificuldade/matéria/tópico) | Registro completo, opcional | Baixa (uso raro) | ✔ | ✔ (menos campos por padrão) | — | — | — |
| 21 | Bloco "Revisões" (associar/criar) | Vincular revisões à sessão | Média | ✔ | — | — | — | — |
| 22 | `#ss-btn-cancel` ("Cancelar sessão") | Ação destrutiva rara | Baixa (uso raro), alta (quando necessária) | ✔ | — | — | — | ✔ (garantir hierarquia de perigo clara dentro do painel) |
| 23 | `#ss-finish-modal` (Resumo da sessão) | Confirmar encerramento | Alta | ✔ | ✔ (menos campos redundantes com o que já foi visto) | — | — | ✔ (transformar em momento de reconhecimento) |
| 24 | Campo de reflexão (`#ssf-reflection`) | Registrar aprendizado no calor do momento | Alta | ✔ | — | — | — | leve (dar mais presença emocional ao convite) |
| 25 | `activeSessionIndicatorView.js` (mini-timer flutuante) | Lembrar de sessão ativa fora desta página | Alta | ✔ | — | — | — | — (já corretamente oculto dentro desta página) |
| 26 | `abandonedSessionDialog.js` | Recuperar sessões esquecidas ao reabrir o app | Média | ✔ | — | — | — | — |

---

## 4. Problemas de UX (ordenados por impacto)

1. **Modo foco exige descoberta e um clique extra** — a experiência que mais define "ambiente de concentração" no produto (ocultar navegação) é opcional e não descoberta por padrão; a maioria dos estudantes nunca vai clicar em "Foco" e vai viver a versão "com painel administrativo ao redor" da tela.
2. **Finalizar uma sessão não devolve nenhuma sensação de progresso** — o resumo mostra os mesmos dados de contexto já vistos, sem comparação, sem número de destaque, sem reforço; horas de concentração terminam num formulário neutro.
3. **A decisão de "Novo estudo" vs. "Compromisso da agenda" nem sempre é necessária** — quando o usuário já veio de um contexto conhecido (ex.: clicou em "Iniciar sessão" dentro de um compromisso específico), a tela ainda pergunta a mesma coisa que ele acabou de responder com o clique.
4. **Cancelar sessão está dentro do mesmo painel que Questões/Revisões**, misturando uma ação destrutiva e rara com o fluxo de registro rotineiro — aumenta a chance de o usuário topar com "Cancelar" enquanto procura outra coisa.
5. **O badge de status (Executando/Pausada) e o cronômetro comunicam a mesma informação de formas diferentes**, sem estarem visualmente unificados — dois elementos respondendo à mesma pergunta ("estou estudando agora?") competem por leitura em vez de se reforçarem.

---

## 5. Problemas de UI (ordenados por impacto)

1. **O cronômetro usa `--font-size-4xl` (3rem)**, a mesma escala máxima do sistema tipográfico, mas com peso `800` em cinza `--gray-800` — não há nenhum tratamento (cor de destaque, espaço dedicado, elevação) que o separe do resto do cartão como "isto é diferente de tudo".
2. **`.ss-card` usa o mesmo `border-radius`, `box-shadow` (com exceção do `--shadow-lg` já aplicado a `#ss-active`) e paleta cinza que qualquer outro cartão do app** — visualmente, a tela de concentração é "mais um card bonito", não um espaço com identidade própria.
3. **Botão "Foco" (`.ss-focus-toggle`, `btn-ghost btn-sm`) tem peso visual menor que os botões de ação primária**, mesmo sendo o único controle capaz de mudar o caráter inteiro da experiência — sua importância real não corresponde ao seu peso visual.
4. **`.ss-status-card` usa grid com fundo `--gray-50` para "Compromisso" e "Categoria"**, o mesmo tratamento visual de qualquer bloco de dados do app (idêntico ao usado no modal de resumo) — não diferencia "isto é o que estou fazendo agora" de um dado burocrático qualquer.
5. **`#ss-btn-open-panel` usa `btn-secondary`, a mesma classe de "Continuar"**, deixando três botões de estilo/peso semelhante (`Pausar`/`Continuar`, `Finalizar`, "Detalhes da sessão") na tela — a hierarquia entre "ação da sessão" e "ver mais" fica achatada.
6. **A barra de progresso temporal (`.ss-progress-bar`) usa a cor `--color-primary`, a mesma do botão de ação principal**, criando ambiguidade sutil entre "isto é uma métrica" e "isto é clicável".

---

## 6. Problemas de carga cognitiva

- **Card ativo com até 6 unidades de atenção simultâneas por padrão**: badge de status, toggle de foco, timer, (opcional) barra de progresso, cartão de contexto de 2 itens, 2 botões de ação + botão de detalhes. Comparado a apps de referência (Forest, Focus To-Do), isso ainda é 2–3 unidades acima do ideal para uma tela que deveria caber em "cronômetro + 1 ação".
- **Não há excesso de módulos escondidos** — aqui a arquitetura já está correta: Questões, Revisões, Cancelar e contexto completo estão todos atrás de um único painel. O problema não é volume de conteúdo, é volume de blocos visíveis por padrão na superfície principal.
- **O modal de início pede uma decisão de navegação (abas) antes de pedir a única informação obrigatória (nome do estudo)** — a primeira decisão do usuário ao iniciar deveria ser digitar/confirmar o que vai estudar, não escolher entre dois modos de preenchimento.
- **Nenhum excesso de textos de ajuda** — os poucos textos existentes (`.ss-timer-label`, `.ss-pause-note`, `.ss-questions-empty`) são objetivos e curtos; não há parágrafos explicativos competindo com a ação.

---

## 7. Problemas de foco

- **O maior elemento que "atrapalha o foco" não é um componente da própria tela — é a navegação ao redor dela**, que só desaparece se o usuário ativar manualmente o modo foco. Enquanto isso não muda, "header + sidebar/bottom-nav + card de sessão" formam três zonas de atenção competindo durante o próprio ato de estudar.
- **A barra de progresso e o cartão de contexto, mesmo discretos individualmente, ficam entre o timer e os botões de ação**, obrigando o olho a atravessar informação secundária para chegar da métrica principal até a ação principal.
- **O botão "Detalhes da sessão" fica na mesma linha de visão que "Pausar"/"Finalizar"**, e ambos são acionáveis — durante uma sessão longa, cada vislumbre da tela mostra 3 caminhos de clique possíveis, não 1.
- **O que realmente sustenta foco**: cronômetro, badge de status implícito no próprio cronômetro (cor/animação), e dois botões. Tudo o resto (contexto detalhado, progresso temporal, badge textual separado, atalho de foco) é auxiliar e deveria recolher-se visualmente até ser necessário.

---

## 8. Problemas de mobile

- **Em 360–390px, `.ss-card` (max-width 480px, padding `--space-6`) mais os 6 blocos internos empilhados provavelmente exigem rolagem** para ver o botão "Detalhes da sessão" quando a barra de progresso e o cartão de contexto (grid `auto-fit` de 2 itens) também estão presentes — a tela mais "de permanência" do app é justamente a que corre risco de não caber inteira na primeira dobra em aparelhos pequenos.
- **`.ss-status-card` em grid `minmax(140px, 1fr)` tende a empilhar em coluna única em 360px**, tornando o bloco de contexto mais alto verticalmente do que em telas largas, empurrando os botões de ação para mais longe do topo.
- **O painel "Detalhes da sessão" (`.ai-panel`, reaproveitado de outros painéis do app) herda um padrão de painel lateral/gaveta que em mobile normalmente vira tela cheia** — correto como mecanismo, mas depende de o conteúdo interno (3 blocos de naturezas diferentes) estar bem escalonado para não parecer "formulário longo" ao abrir em um aparelho pequeno.
- **Modo foco tem impacto desproporcional em mobile**: em telas pequenas, esconder bottom-nav libera uma fração maior da altura útil do que em desktop — reforça por que o modo foco deveria ser o padrão, não opcional, especialmente no celular.

---

## 9. Problemas de consistência

- **Tipografia**: o cronômetro usa `--font-display` (serifada) como o anel de meta e os stat-cards de outras páginas — consistente entre páginas, mas dentro desta página não há nenhuma outra ocorrência de `--font-display`, então o efeito de "elemento de destaque" que a fonte deveria comunicar aqui fica diluído por ser a única peça de texto na tela com esse tratamento, sem reforço adicional de escala/cor que a acompanhe.
- **Botões**: `#ss-btn-open-panel` (`btn-secondary`) tem o mesmo peso visual de `#ss-btn-resume` (`btn-secondary`), embora sejam semanticamente muito diferentes (uma é ação de estudo, a outra é navegação para "ver mais") — a escala de prioridade de botões usada no restante do app (`btn-primary` > `btn-secondary` > `btn-ghost`) não distingue "ação de sessão" de "ação de navegação".
- **Cards**: `.ss-card` reaproveita a mesma base visual (`border-radius`, `box-shadow`, cor de fundo) de `.card`/`.stat-card` genéricos do app, com apenas uma elevação extra (`--shadow-lg`) pontual em `#ss-active` — não há nenhum traço visual exclusivo desta página que a diferencie como "o lugar onde o tempo passa", diferente de todas as outras que são "lugares onde se lê informação".
- **Ícones**: o ícone de "Foco" (`maximize`) e os ícones dentro do painel (`check`, `repeat`, `calendar-week`, `x`) seguem o sistema geral de ícones do app corretamente — não há inconsistência aqui, mas também nenhum ícone reforça visualmente o cronômetro em si (ex.: nenhum indicador de "play"/pulso perto do tempo).

---

## 10. Oportunidades de redesign (conceitual, sem código)

1. **Modo foco como padrão, não como opção.** Ao iniciar uma sessão, a tela já entra no estado "concentração" (navegação oculta); o botão de alternância vira "Sair do foco" por padrão, disponível mas nunca a barreira inicial.
2. **Cronômetro tratado como elemento de marca da tela, não como um dado a mais.** Escala maior, espaço dedicado próprio (não dividido com badge/progresso na mesma faixa vertical), e um sinal visual sutil de "vivo" (ex.: leve pulsação ou cor que só aparece quando `running`) para reforçar "isto está acontecendo agora".
3. **Fusão do badge de status dentro do próprio cronômetro** (ex.: cor do tempo ou um ponto de status junto ao número) em vez de uma pílula de texto separada acima — uma única fonte de verdade visual para "estou estudando".
4. **Contexto da sessão como uma linha de texto, não um cartão em grid.** "Cardiologia · Insuficiência cardíaca" como legenda simples abaixo do cronômetro resolve a pergunta "o que estou estudando" sem um bloco cinza de card próprio.
5. **"Detalhes da sessão" reposicionado como acesso claramente secundário** (ex.: ícone discreto de canto, não um botão de largura/peso comparável a "Finalizar") — sinaliza visualmente "isto é opcional", sem escondê-lo.
6. **Separação visual real dentro do painel de detalhes**: Contexto (leitura), Questões (ação frequente) e Revisões (ação ocasional) ganham tratamento de superfície diferente entre si (não apenas títulos `h3` iguais), para que abrir o painel não pareça um único formulário longo.
7. **Cancelar sessão isolado visualmente do fluxo de registro**, com maior distância/separador do restante do painel — ação rara e destrutiva não deveria compartilhar ritmo visual com "Registrar questão".
8. **Encerramento como recompensa, não como formulário.** Resumo com destaque para 1 número (tempo total de estudo) em tipografia grande, seguido do convite à reflexão — em vez de uma lista de 6 pares rótulo/valor lidos em sequência.
9. **Início contextual sem pergunta redundante.** Quando a sessão nasce de um compromisso específico (clique em "Iniciar sessão" dentro de um evento), pular direto para a confirmação, sem reabrir a escolha entre abas.

---

## 11. Nova proposta de organização da página

**Estado "sem sessão"** — mantém-se como está: ilustração + frase curta + botão único "Iniciar sessão". É o único estado da tela hoje já alinhado ao conceito de "convite simples", sem alteração necessária.

**Estado "sessão ativa" (ordem vertical ideal):**

1. **Cronômetro**, sozinho, em posição central e destaque máximo — nenhum outro elemento disputa a primeira leitura de tela.
2. **Legenda de contexto de uma linha** logo abaixo do tempo ("Cardiologia · Insuficiência cardíaca" ou "Estudo livre"), tipograficamente discreta — responde "o que" sem exigir um card.
3. **Barra de progresso temporal**, só quando existir tempo previsto, imediatamente colada ao cronômetro (não separada por outros blocos) — é a única informação que efetivamente estende a leitura do tempo.
4. **Duas ações primárias** (`Pausar`/`Continuar` + `Finalizar`), grandes, lado a lado, únicas com peso de `btn-primary`/`btn-secondary` reservado à sessão em si.
5. **Acesso a "Detalhes da sessão"** como elemento visualmente menor (ex.: link/ícone discreto, não um terceiro botão do mesmo porte), contendo contador combinado (questões + revisões) só como reforço textual pequeno, não como badge competindo com os botões.
6. **Alternância de modo foco** deixa de ser um controle no topo do card e passa a estar implícita (foco = padrão); quando o usuário quiser "ver o app ao redor de novo", a saída fica acessível de forma discreta (ex.: mesmo lugar do "Detalhes da sessão" ou um gesto simples), não como toggle competindo por atenção assim que a sessão começa.

**Justificativa geral**: a proposta não remove nenhum componente listado no inventário — apenas resolve, para cada um, se ele pertence à "primeira leitura de tela" (cronômetro, ação, contexto mínimo) ou à "camada sob demanda" (tudo o resto, já hoje dentro do painel). O ganho de redução de carga visual vem de tratar a *hierarquia* do que já está na superfície principal, não de esconder mais coisas — a tela já escondeu o suficiente; falta fazer o pouco que sobra parecer inevitável.

**Redução de ~50% da informação visível por padrão**: hoje a superfície principal tem 6 unidades de atenção (badge, foco, timer, progresso, cartão de contexto de 2 itens, 3 botões). A proposta reduz para 3 (timer com progresso fundido, legenda de contexto de 1 linha, par de ações), com o modo foco já ativo por padrão eliminando a quarta camada (navegação global) sem exigir nenhuma decisão do usuário.

---

## 12. As 30 decisões de design que mais prejudicam a experiência da Sessão

*(ordenadas por impacto)*

1. Modo foco ser opt-in em vez de padrão ao iniciar uma sessão.
2. Cronômetro não ter tratamento visual exclusivo (cor, escala, espaço) que o separe do resto do cartão.
3. Encerramento não devolver nenhum reforço emocional/reconhecimento de esforço.
4. Badge de status e cronômetro comunicarem a mesma informação de forma duplicada e não unificada.
5. "Detalhes da sessão" ter o mesmo peso visual (`btn-secondary`) que "Continuar", confundindo ação de sessão com navegação.
6. Cartão de contexto (`Compromisso`/`Categoria`) usar o mesmo tratamento de card cinza de qualquer outro dado do app.
7. Modal de início sempre abrir com a escolha de abas, mesmo quando o contexto de origem já é conhecido.
8. Cancelar sessão dividir o mesmo painel/ritmo visual com o fluxo de registro de Questões/Revisões.
9. `.ss-card` não ter nenhuma identidade visual própria que a diferencie das demais páginas do app.
10. A barra de progresso usar a mesma cor do botão de ação primária, criando ambiguidade de "isto é clicável?".
11. O botão "Foco" ter peso visual (`btn-ghost btn-sm`) menor que sua real importância na experiência.
12. Card ativo empilhar até 6 blocos verticais antes de qualquer interação.
13. `.ss-timer-label` ("pausas descontadas") ocupar espaço permanente mesmo quando irrelevante no estado "running".
14. Painel de detalhes não separar visualmente Contexto (leitura) de Questões/Revisões (ação).
15. Nenhum sinal visual de "isto está vivo agora" (ex. pulsação sutil) junto ao cronômetro quando rodando.
16. Resumo de encerramento repetir dados já vistos durante a sessão sem agregar nenhuma leitura nova.
17. Campo de reflexão no encerramento não ter destaque emocional (é um `<textarea>` genérico entre outros blocos).
18. O grid de `.ss-status-card` poder quebrar para 1 coluna em telas pequenas, aumentando a altura do bloco de contexto.
19. Nenhuma distinção visual entre "ação rara e destrutiva" (Cancelar) e "ação frequente e segura" (Registrar questão).
20. O ícone "maximize" do botão de foco não comunicar por si só o conceito de "modo estudo"/silêncio.
21. Contador combinado de Questões+Revisões (`#ss-panel-badge`) competir visualmente com o rótulo do próprio botão de detalhes.
22. Ausência de qualquer elemento que reforce sequência/consistência (ex. "3º dia seguido estudando") durante ou ao final da sessão.
23. `#ss-progress-text` ("00:00 / 00:00") ser outra leitura textual de tempo concorrendo com o cronômetro principal.
24. Falta de hierarquia cromática clara entre "informação" (contexto) e "ação" (botões) — ambos usam tons neutros semelhantes.
25. O título de página "Sessão" (`h1.page-title`) permanecer visível mesmo durante a sessão ativa, redundante com a navegação.
26. `#ss-status-badge` mudar de cor (sucesso/aviso) mas manter a mesma forma de pílula usada em badges de categoria em outras páginas — perde força semântica por reaproveitamento genérico.
27. Painel "Detalhes da sessão" reaproveitar 1:1 a estrutura de `#ai-panel`, sem nenhum ajuste que reflita a diferença entre "assistente" e "sessão em andamento".
28. Nenhuma transição/animação de entrada dedicada ao iniciar uma sessão que marque a passagem para "modo estudo".
29. A pergunta "posso registrar rapidamente?" só ser resolvida depois de um clique extra (abrir o painel) — correto como decisão de não abrir por padrão, mas sem nenhum atalho visual residual (ex. contador discreto) que lembre que a opção existe sem abrir nada.
30. Modal de início e modal de encerramento usarem a mesma classe genérica `.modal-session`, sem nenhuma diferenciação de tom entre "começar" (expectativa) e "terminar" (conclusão).

---

## 13. As 30 melhorias com maior impacto visual

1. Aumentar a escala do cronômetro além de `--font-size-4xl`, com peso e cor dedicados exclusivos a este elemento.
2. Fundir badge de status na cor/estado do próprio cronômetro em vez de pílula de texto separada.
3. Dar a `.ss-card` uma identidade de superfície própria (não idêntica a `.card`/`.stat-card` genéricos).
4. Substituir o cartão cinza de contexto por uma legenda tipográfica simples de uma linha.
5. Reduzir "Detalhes da sessão" a um elemento visualmente secundário (link/ícone), não um terceiro botão do mesmo porte dos primários.
6. Aproximar visualmente a barra de progresso do cronômetro (mesmo bloco, não blocos separados por espaçamento).
7. Dar aos botões `Pausar`/`Continuar` e `Finalizar` maior área de toque/presença — são as únicas ações que deveriam competir por atenção.
8. Redesenhar o resumo de encerramento com 1 número de destaque (tempo total) em vez de lista de 6 pares rótulo/valor.
9. Diferenciar visualmente, dentro do painel, os blocos "Contexto" / "Questões" / "Revisões" com tratamentos de superfície distintos.
10. Isolar "Cancelar sessão" com maior respiro/separador visual do resto do painel.
11. Introduzir uma micro-animação de transição ao entrar em "sessão ativa" (ex. fade/scale suave do cartão).
12. Dar ao botão "Foco" peso visual (tamanho, contraste) proporcional à sua importância real.
13. Remover a duplicação textual entre `.ss-progress-text` e o cronômetro principal (um só formato de tempo em destaque).
14. Aplicar cor de destaque (não neutra) ao número do cronômetro apenas quando `running`, esmaecendo levemente quando `paused`.
15. Ocultar `.ss-timer-label` no estado `running` (mostrar só quando pausas realmente ocorreram).
16. Unificar a paleta de "pílulas" (badge de status vs. badges de categoria em outras páginas) para não reaproveitar forma idêntica com significados diferentes.
17. Dar ao campo de reflexão do encerramento um tratamento visual mais convidativo (borda/placeholder mais expressivo, não `<textarea>` genérico).
18. Substituir o ícone genérico `maximize` do modo foco por um ícone que comunique "silêncio"/"concentração" com mais clareza.
19. Reduzir o grid `.ss-status-card` a layout de linha única sempre que couber (evitar quebra de coluna precoce).
20. Dar ao card de sessão ativa uma cor de fundo sutilmente distinta do restante do app (não apenas mais sombra).
21. Tratar o modal de início e o modal de encerramento com paletas/tons ligeiramente diferentes (expectativa vs. conclusão).
22. Suavizar a transição de abas do modal de início (evitar salto abrupto entre painéis).
23. Dar destaque visual mínimo ao contador de questões/revisões sem torná-lo um badge competindo com o texto do botão.
24. Uniformizar o espaçamento vertical entre os blocos do card ativo com tokens `--space-*` (evitar qualquer valor solto remanescente).
25. Reforçar visualmente o estado "pausado" com uma mudança perceptível no cronômetro (não só na pílula de status).
26. Dar ao botão "Registrar" (questão rápida) destaque de cor equivalente ao de uma ação primária dentro do painel.
27. Suavizar a borda/sombra de `.ss-status-item` para parecer menos "campo de formulário" e mais "etiqueta de leitura".
28. Introduzir alinhamento consistente entre ícone e rótulo em todos os botões do painel (Registrar, Associar, Criar).
29. Tratar visualmente a barra de progresso com gradiente sutil ou animação de preenchimento contínua, reforçando "tempo passando".
30. Dar ao estado vazio (`#ss-empty`) uma paleta de convite mais quente/pessoal, coerente com o tom "premium" pretendido para toda a tela.

---

## 14. As 30 melhorias com maior impacto na experiência de foco

1. Tornar o modo foco o estado padrão ao iniciar qualquer sessão.
2. Eliminar a decisão de abas do modal de início quando a origem já é conhecida (compromisso específico).
3. Reduzir o card ativo de 6 para 3 unidades de atenção por padrão (timer+progresso, contexto de 1 linha, par de ações).
4. Retirar o botão "Detalhes da sessão" da mesma linha de decisão visual dos botões de ação da sessão.
5. Unificar badge de status dentro do cronômetro, eliminando uma fonte de leitura redundante.
6. Adiar toda leitura de texto longo (contexto completo, formulário detalhado de questão) para dentro do painel sob demanda — já ocorre, mas reforçar visualmente que são camadas distintas.
7. Retirar `.ss-timer-label` da leitura constante quando não há pausa em curso.
8. Fazer a saída do modo foco (quando ativo) não exigir retorno visual à barra de navegação completa antes de decidir sair.
9. Priorizar, dentro do painel, a ação "Registrar questão" acima de "Cancelar sessão" tanto em ordem quanto em destaque.
10. Reduzir o número de campos visíveis por padrão no registro rápido de questão (já são 2 — manter, não expandir).
11. Evitar qualquer animação, badge ou notificação que pisque durante a sessão ativa fora da ação do próprio usuário.
12. Consolidar toda cor "chamativa" da tela (verde/laranja de status, azul de progresso) em um único sistema coerente que não distraia.
13. Garantir que o painel "Detalhes da sessão", ao abrir, não role automaticamente para o formulário de questão (deixar Contexto como primeira leitura).
14. Minimizar o texto de apoio nos formulários de Questões/Revisões a rótulos essenciais, sem frases de instrução adicionais.
15. Evitar qualquer contagem regressiva/urgência visual mesmo quando há tempo previsto e o progresso ultrapassa 100%.
16. Retirar decisões estéticas concorrentes entre "Pausar" e "Finalizar" (cores/formas suficientemente distintas para não exigir leitura do rótulo).
17. Garantir foco de teclado previsível ao abrir modais/painéis (evitar perda de contexto ao alternar Questões/Revisões).
18. Não reabrir automaticamente o painel de detalhes após registrar uma questão (o usuário volta sozinho ao cronômetro).
19. Simplificar `#ss-finish-modal` para menos campos redundantes com o que já foi visto durante a sessão.
20. Garantir que o convite à reflexão no encerramento seja a única ação textual pedida (não competir com múltiplos campos de dados).
21. Eliminar qualquer necessidade de rolagem para ver os botões de ação principais em mobile (360–390px).
22. Priorizar visualmente, na barra de progresso, apenas o essencial (percentual/tempo), sem texto duplicado.
23. Não exibir simultaneamente barra de progresso e cartão de contexto grande — escolher qual dado é realmente necessário no relance.
24. Garantir contraste suficiente do cronômetro em qualquer tema (claro/escuro) sem depender de leitura cuidadosa.
25. Eliminar sombra/hover de elementos não-clicáveis (ex. `.ss-status-item`) que sugerem interatividade inexistente.
26. Não permitir que o toggle de foco mude de posição/rótulo de forma abrupta (transição suave entre "Foco"/"Sair do foco").
27. Garantir que abandonar a aba/app e retornar restaure o mesmo estado de foco sem sobressaltos visuais.
28. Minimizar o número de cliques entre "quero registrar 1 questão" e "questão registrada" (hoje: abrir painel → preencher 2 campos → registrar — já é raso; preservar).
29. Não introduzir nenhum elemento de gamificação ruidoso (ex. confete constante) que quebre o tom de concentração durante a sessão — reservar reforço emocional só para o encerramento.
30. Garantir que o encerramento, mesmo reforçado emocionalmente, permaneça rápido (1 tela, sem múltiplos passos) para não virar nova fonte de atrito.

---

## 15. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR e não adiciona nenhuma funcionalidade nova — apenas reorganiza, redesenha ou ajusta comportamento padrão de recursos já existentes.

### Etapa 1 — Modo foco como padrão

- **Objetivo**: ativar `.focus-mode` automaticamente ao entrar em uma sessão ativa, mantendo o toggle existente para o usuário sair/voltar manualmente.
- **Justificativa**: é a mudança de maior impacto em "sensação de ambiente de concentração" e já existe 100% do mecanismo (`_setFocusMode`, CSS `.focus-mode`); falta apenas o gatilho automático.
- **Arquivos envolvidos**: `studySessionView.js` (chamar `_setFocusMode(true)` ao renderizar sessão ativa pela primeira vez), `style.css` (nenhuma mudança esperada).
- **Impacto esperado**: alto — remove a navegação global da experiência de estudo para todos os usuários, não só os que descobrem o botão.
- **Complexidade**: baixa.
- **Riscos**: usuários que preferem navegação visível durante o estudo podem se sentir surpreendidos; mitigar preservando o toggle sempre visível e talvez lembrando a preferência por sessão.
- **Critérios de aceite**: ao iniciar qualquer sessão, header/sidebar/bottom-nav ficam ocultos sem ação do usuário; o botão de alternância continua funcional em ambos os sentidos; sessão retomada após reload preserva o mesmo comportamento padrão.

### Etapa 2 — Cronômetro como protagonista visual

- **Objetivo**: aumentar escala, peso e destaque de cor do `.ss-timer-value`, e dar ao bloco `.ss-timer` espaço vertical próprio, sem outros elementos na mesma faixa.
- **Justificativa**: hoje o cronômetro divide espaço com badge/progresso/contexto sem nenhum tratamento que o torne inconfundivelmente central.
- **Arquivos envolvidos**: `style.css` (`.ss-timer`, `.ss-timer-value`, possivelmente novo token de cor de destaque).
- **Impacto esperado**: alto em percepção de "premium" e hierarquia.
- **Complexidade**: baixa.
- **Riscos**: mínimo; ajuste é só de CSS, sem lógica.
- **Critérios de aceite**: cronômetro visualmente maior/mais destacado que qualquer outro texto da tela em qualquer largura de tela testada (360–1280px); contraste adequado em tema claro e escuro.

### Etapa 3 — Fusão do status no cronômetro

- **Objetivo**: remover `#ss-status-badge` como pílula isolada e comunicar rodando/pausado via cor/estado do próprio bloco do cronômetro.
- **Justificativa**: elimina uma fonte de leitura duplicada da mesma informação.
- **Arquivos envolvidos**: `index.html` (`#ss-status-badge` reposicionado ou removido da linha de topo), `studySessionView.js` (`_render` — aplicar classe de estado ao invés de/além do texto do badge), `style.css`.
- **Impacto esperado**: médio-alto — reduz 1 unidade de atenção do card ativo.
- **Complexidade**: média (precisa preservar acessibilidade — leitura de status por leitor de tela não pode depender só de cor).
- **Riscos**: perda de clareza para usuários de leitor de tela se a informação textual for removida sem substituto acessível; manter texto oculto visualmente (`sr-only`) equivalente.
- **Critérios de aceite**: estado rodando/pausado continua comunicado de forma acessível (texto para leitores de tela); pílula de badge separada deixa de ocupar linha própria no topo do card.

### Etapa 4 — Contexto da sessão como legenda de uma linha

- **Objetivo**: substituir `.ss-status-card` (grid de 2 itens) por uma linha de texto simples abaixo do cronômetro no estado "sessão ativa" (o painel de detalhes continua com o cartão completo).
- **Justificativa**: reduz um bloco visual inteiro da superfície principal sem perder informação, que continua acessível no painel.
- **Arquivos envolvidos**: `index.html` (`#ss-active`, remover/reduzir `.ss-status-card` da vista principal), `studySessionView.js` (ajustar `_render` para popular a nova legenda), `style.css`.
- **Impacto esperado**: alto — maior redução isolada de carga visual da superfície principal.
- **Complexidade**: média.
- **Riscos**: perda de destaque do nome do compromisso se o tratamento tipográfico da legenda for fraco demais; validar legibilidade.
- **Critérios de aceite**: card ativo não exibe mais grid de contexto por padrão; nome do compromisso/categoria continuam visíveis em uma linha de texto; painel de detalhes mantém a versão completa (Contexto) inalterada.

### Etapa 5 — Rebaixar "Detalhes da sessão" a acesso secundário

- **Objetivo**: trocar o botão `btn-secondary` de largura equivalente aos botões de ação por um elemento visualmente menor (ex. link com ícone), mantendo a mesma função e contador.
- **Justificativa**: hoje compete visualmente com "Pausar"/"Finalizar", que deveriam ser as únicas ações de destaque.
- **Arquivos envolvidos**: `index.html` (`#ss-btn-open-panel`), `style.css` (`.ss-quick-actions-row`, novo estilo de gatilho secundário).
- **Impacto esperado**: médio-alto.
- **Complexidade**: baixa.
- **Riscos**: reduzir demais a descoberta do painel; validar que o novo tratamento ainda é claramente clicável (área de toque mínima em mobile).
- **Critérios de aceite**: botão de detalhes visualmente distinto (menor peso) dos botões primários de ação; continua acessível via teclado e leitor de tela; contador de itens (`#ss-panel-badge`) preservado.

### Etapa 6 — Separação visual dentro do painel de detalhes

- **Objetivo**: dar tratamentos de superfície distintos aos blocos Contexto, Questões e Revisões dentro de `#ss-panel`.
- **Justificativa**: hoje os três blocos usam o mesmo padrão de título `h3` + conteúdo, parecendo uma lista contínua de formulário.
- **Arquivos envolvidos**: `index.html` (`.ss-questions-block` × 3), `style.css`.
- **Impacto esperado**: médio.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional — puramente visual.
- **Critérios de aceite**: os três blocos são visualmente diferenciáveis entre si (leitura vs. ação frequente vs. ação ocasional) sem alterar nenhum campo ou comportamento existente.

### Etapa 7 — Isolar "Cancelar sessão"

- **Objetivo**: dar maior separação visual (espaçamento, divisor, possivelmente posição) entre `#ss-btn-cancel` e o restante do painel.
- **Justificativa**: ação destrutiva e rara não deveria compartilhar ritmo visual com registro de questões/revisões.
- **Arquivos envolvidos**: `index.html`, `style.css` (`.ss-panel-cancel`).
- **Impacto esperado**: médio.
- **Complexidade**: baixa.
- **Riscos**: nenhum.
- **Critérios de aceite**: "Cancelar sessão" permanece funcional e acessível, mas visualmente destacado como ação de risco, separado das ações rotineiras.

### Etapa 8 — Encerramento como reconhecimento

- **Objetivo**: redesenhar `#ss-finish-modal` para dar destaque tipográfico a um número central (tempo total de estudo) antes da lista de dados, e dar mais presença visual ao convite de reflexão.
- **Justificativa**: hoje o encerramento é um formulário neutro; é o momento de maior potencial de reforço emocional do fluxo.
- **Arquivos envolvidos**: `index.html` (`#ss-finish-modal`), `style.css`.
- **Impacto esperado**: alto em percepção de "app premium" e em reforço de hábito.
- **Complexidade**: média.
- **Riscos**: exagerar no tom celebratório pode soar dissonante em sessões curtas/interrompidas; calibrar o destaque proporcionalmente ao tempo estudado, sem novo texto condicional complexo.
- **Critérios de aceite**: tempo total de estudo aparece em destaque tipográfico proeminente antes dos demais dados; campo de reflexão recebe tratamento visual mais convidativo; nenhum dado existente é removido, apenas reordenado/redesenhado.

### Etapa 9 — Início contextual sem decisão redundante

- **Objetivo**: quando `#ss-start-modal` é aberto a partir de um compromisso específico já conhecido (ex. clique em "Iniciar sessão" dentro de um evento), abrir diretamente na aba/contexto correspondente, sem exigir escolha manual de aba.
- **Justificativa**: elimina uma decisão desnecessária no momento de maior fricção potencial (início do estudo).
- **Arquivos envolvidos**: `studySessionView.js` (lógica de abertura do modal conforme origem da chamada).
- **Impacto esperado**: médio.
- **Complexidade**: média (depende de identificar corretamente todos os pontos de entrada que já carregam contexto).
- **Riscos**: caso a detecção de origem falhe, o usuário pode ver a aba "errada" pré-selecionada; testar todos os fluxos de entrada existentes (Hoje, compromisso da agenda, início avulso).
- **Critérios de aceite**: abrir o modal a partir de um compromisso específico não exige clique adicional em aba; abrir o modal de forma avulsa continua oferecendo as duas opções normalmente.
- **Status**: já satisfeito, sem alteração de código necessária. Os três pontos de entrada que já carregam um compromisso conhecido — card da Agenda (`script.js`/`handleStartSession`), "Iniciar Sessão" no formulário de compromisso (`eventFormView.js`) e o item de "Hoje" (`todayView.js`/`_buildApptItem`) — chamam `startSessionForEvent(event)` diretamente e nunca abrem `#ss-start-modal`: a sessão inicia sem nenhuma escolha de aba. `#ss-start-modal` só é aberto pelos fluxos genuinamente avulsos (`openStartModal()`/botão "Iniciar sessão" da própria tela de Sessão, "Começar a estudar" em Hoje), que continuam oferecendo as duas abas; dentro dele, os chips de sugestão de compromisso (ex. "Hoje: X") já trocam a aba sozinhos ao serem clicados, sem exigir um clique manual adicional em aba.

### Etapa 10 — Ajustes finos de consistência visual

- **Objetivo**: unificar tokens de espaçamento remanescentes, remover sombra/hover de `.ss-status-item` (elemento não clicável), e alinhar a paleta de badges/pílulas usadas nesta página com o restante do app.
- **Justificativa**: fecha as inconsistências residuais de UI listadas na Seção 5/9 sem exigir nenhuma mudança estrutural.
- **Arquivos envolvidos**: `style.css` (seção `.ss-*`).
- **Impacto esperado**: baixo-médio, mas cumulativo com as etapas anteriores.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional.
- **Critérios de aceite**: nenhum elemento não-interativo apresenta affordance de clique (hover/sombra); espaçamentos usam exclusivamente tokens `--space-*`; badges de status desta página não reutilizam forma idêntica a badges de categoria de outras páginas sem diferenciação adicional.

---

## Fechamento

Nenhuma das etapas acima adiciona um único recurso novo. Todas trabalham com o que já existe — cronômetro, ações, painel de detalhes, modo foco, modal de encerramento — reorganizando peso visual e comportamento padrão para que a tela pare de parecer um painel administrativo bem-comportado e passe a parecer o que o produto já quase entrega: um lugar onde o único trabalho do estudante é continuar estudando.
