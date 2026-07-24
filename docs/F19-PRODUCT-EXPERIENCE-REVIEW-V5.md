# Product Experience Review — Anoti V5

**Produto:** Anoti — ambiente diário de estudo para estudantes de Medicina
**Data:** 24/07/2026
**Papel assumido:** Product Designer sênior preparando o produto para lançamento comercial.
**Escopo desta auditoria:** exclusivamente experiência do usuário, design emocional, inovação, identidade visual, percepção de qualidade e sensação de aplicativo premium. Nenhuma regra de negócio foi avaliada; nenhum bug foi procurado.
**Método:** leitura integral de `index.html` (1627 linhas), `style.css` (4590 linhas, incluindo todos os `:root`, `@keyframes` e breakpoints), das telas centrais do ciclo diário (`todayView.js`, `studySessionView.js`, `navigationView.js`, `closeDayService.js`, `progressNarrativeService.js`, `achievementService.js`, `studyStreakService.js`, `smartCardView.js`, `quickAdd.js`, `onboardingTourView.js`, `transitionUtils.js`, `themeService.js`, `icons.js`), do manifesto PWA, do ícone do app e da paleta de categorias — comparado, tela por tela, contra o padrão de dez aplicativos premium de referência (lista no fim do documento).
**Ponto de partida:** esta auditoria começa depois de duas rodadas que já resolveram problemas estruturais reais. O **F14** (19/07/2026) reorganizou a jornada diária — o app abre em "Hoje", sugere em vez de perguntar, tem modo foco e fecha o dia. O **F18** (23/07/2026, concluído até a Onda 3) higienizou o sistema de design — tokens de cor, tipografia, ícones e componentes de cartão foram consolidados; a navegação para "Progresso" foi restaurada. Nenhuma das duas rodadas é repetida aqui. Esta auditoria responde a uma pergunta diferente das duas anteriores: **não "a arquitetura da informação está certa?" (F14), nem "o CSS é consistente?" (F18), mas "o produto dá vontade de ser usado?"**

---

## Nota geral do produto

### 5,8 / 10 como aspirante a aplicativo premium

O Anoti hoje é **um sistema web muito bem organizado, não um aplicativo que as pessoas amam abrir**. A distância entre essas duas coisas não está em nenhum bug, nem em nenhuma decisão de fluxo — está inteiramente na camada sensorial: o que o produto usa para fazer o usuário *sentir* algo, e hoje essa caixa de ferramentas está quase vazia.

| Eixo (conforme solicitado na auditoria) | Nota | Leitura |
|---|---|---|
| Personalidade do produto | 4/10 | Correto, neutro, "SaaS de agenda". Nada nele é inconfundivelmente Anoti se a marca for coberta. |
| Primeira impressão (30s) | 4/10 | Login genérico → carregamento com spinner cinza → "Hoje" com um botão azul sólido. Organizado, mas frio. |
| Fluxo diário / fadiga em 6 meses | 6/10 | O arco diário (F14) está certo; o que cansa é a monotonia sensorial — todo dia parece visualmente igual a ontem. |
| Design emocional | 3/10 | Existem dados de sobra para gerar emoção (streak, conquistas, heatmap de constância) e nenhum deles é usado para isso. |
| Layout / excesso de elementos | 7/10 | F14/F18 já podaram bastante; o que resta é mais "denso" do que "cheio". |
| Navegação | 6/10 | Cinco destinos claros e um "Mais" — sólida, mas puramente utilitária; nenhuma inovação de navegação. |
| Mobile first | 5/10 | Funciona bem, mas ainda *parece* um site responsivo com bottom-nav — ver §7. |
| Movimento (motion) | 4/10 | Fade/slide/spin genéricos de framework; zero movimento autoral, zero celebração. |
| Microinterações | 3/10 | O catálogo existe (`transitionUtils.js`) mas é puramente funcional; nenhum momento de alegria. |
| Espaço em branco | 7/10 | Bom, sobretudo pós-F14/F18. |
| Design System | 7/10 | Maduro em tokens (pós-F18); imaturo em *voz* — nada nele comunica "isto é Anoti". |
| Identidade de marca | 4/10 | Um wordmark discreto e um ícone de app mais vívido que tudo o que ele representa por dentro. |

**Resposta direta à pergunta principal:** depois de 30 minutos usando o Anoti, o usuário sente que está usando **um sistema web bonito e bem-comportado**, não um aplicativo premium. Ele nota que nada trava, que tudo tem seu lugar, que o app "sabe o que fazer" (o convite a continuar o último estudo, o fechamento do dia) — isso é real e vale muito. Mas em nenhum momento desses 30 minutos alguém diria "uau" em voz alta. Não há um único momento desenhado para produzir prazer — só momentos desenhados para não produzir atrito. **Ausência de fricção não é a mesma coisa que presença de deleite**, e é exatamente essa lacuna que separa "sistema web maduro" de "aplicativo premium" nos dez produtos de referência desta auditoria.

O motivo estrutural, resumido: **o produto tem os dados para gerar emoção e não os usa para isso.** `studyStreakService.getStudyCalendar()` já devolve um mapa de dias estudados pronto para um heatmap de constância — nunca desenhado. `achievementService.js` já define cinco conquistas com ícone próprio (`clock`, `check-circle`, `target`, `flame`, `book`) — nunca renderizadas como ícones, reduzidas a uma fração de texto ("3/5") dentro de um card dentro de um disclosure. O ritual de "Fechar o dia" (a melhor ideia de produto emocional do Anoti, uma citação direta do *shutdown ritual* do Sunsama) termina num toast idêntico ao de "questão registrada". O ícone do app usa um gradiente vívido; o produto inteiro por dentro é 100% chapado, numa única cor de acento. **A infraestrutura emocional já foi construída pelo lado dos dados — falta construí-la pelo lado da apresentação.**

---

## O que ainda transmite aspecto amador

1. **A tela de login é o cartão de um formulário genérico.** É literalmente `.card` — o mesmo componente de superfície elevada usado em qualquer outro lugar do produto — com e-mail, senha e um botão azul sólido. Nenhuma imagem, nenhum recorte de marca, nenhuma pista de que existe um produto com ponto de vista por trás. É a primeira coisa que qualquer pessoa vê, antes de qualquer outro pixel do Anoti, e é a tela menos desenhada do produto inteiro.
2. **O carregamento inicial é texto + spinner cinza girando.** `.app-loading-spinner` é um círculo cinza genérico com `border-top-color: var(--blue)` girando — o componente de loading mais commodity que existe em CSS, herdado de qualquer tutorial de "como fazer um spinner". Nenhum produto da lista de inspiração usa esse padrão sem alguma assinatura própria.
3. **Todo feedback de sucesso usa o mesmo toast, com a mesma animação, para eventos de peso emocional completamente diferentes.** Registrar uma questão e fechar o dia inteiro de estudo disparam a mesma caixa verde deslizando da direita (`@keyframes slide-in-right`). Um produto amador trata todo "sucesso" como um único estado técnico; um produto premium sabe que "1 questão registrada" e "seu dia terminou, parabéns" merecem pesos diferentes.
4. **Onboarding é uma lista numerada dentro de um cartão dispensável.** Quatro `<li>` com número, título e frase — sem nenhuma ambição de contar por que o Anoti existe. Comparado ao primeiro contato de Headspace ou Duolingo (que gastam a primeira tela inteira só para estabelecer *por que* o produto importa antes de pedir qualquer ação), o tour do Anoti é um changelog disfarçado de boas-vindas.
5. **O ícone do app promete mais do que o produto entrega.** `icons/icon.svg`/`icon-512.png` é um "A" geométrico branco sobre um gradiente índigo-roxo generoso — um ativo de marca genuinamente bom. Mas abrir o app depois de tocar nesse ícone leva a uma experiência 100% chapada, sem gradiente, sem profundidade, em nenhuma tela. É a assinatura clássica de "a marca foi desenhada por fora, o produto foi construído por dentro, sem conversar".
6. **Uma única cor de acento carrega o produto inteiro.** `--color-primary` (o índigo `#4954a8`) é literalmente a única cor viva usada em botão primário, link, foco de campo, item de navegação ativo, ícone destacado — em toda tela, todo dia, para toda ação. Isso não é "consistência", é monotonia: nenhum momento do produto tem uma cor própria que sinalize "isto é diferente/especial" (conquista, celebração, streak).
7. **Os rótulos da navegação principal em mobile são o menor texto do aplicativo.** `.bottom-nav-label { font-size: .62rem; }` (~10px) é menor que qualquer outro texto funcional do produto — inclusive menor que legendas e microcópias. A navegação primária de um app mobile-first não deveria ser o elemento com menos confiança visual da tela.
8. **O painel de IA, o painel de Questões/Revisões e o painel "Analisar" do Diário são, literalmente, o mesmo componente com rótulos trocados** (`.ai-panel*` reaproveitado três vezes para três domínios distintos). Eficiente para construir; para quem usa, comunica "isto foi montado com um molde", não "isto foi desenhado para esta necessidade específica".
9. **O bottom-nav termina em "Mais" com um ícone de três pontos.** É o item de navegação clássico de "não sabíamos o que colocar no quinto lugar" — abre a mesma sidebar inteira, sem curadoria própria do que faz sentido em mobile.
10. **Nenhuma tela usa profundidade, textura ou variação de contraste além de `border` + `box-shadow` uniforme.** Every surface — card, modal, painel — usa exatamente `--radius-lg` + `--shadow-md` (pós-F18.8). Coerente, mas também é a receita mais "template de admin dashboard" que existe: nenhuma superfície do produto tem uma textura, gradiente sutil ou tratamento que a torne memorável.

---

## O que transmite qualidade

- **Coerência de sistema pós-F18.** Um único componente de cartão, uma escala de ícones, tokens de cor semânticos com tema escuro completo (`:root[data-theme="dark"]`) — a fundação técnica de um design system maduro está pronta.
- **O cronômetro da Sessão de Estudo.** `.ss-timer-value` usa a família serifada de destaque (`--font-display`) em 3rem/800 com `font-variant-numeric: tabular-nums` — é o único momento tipográfico do produto com peso e autoridade reais. É também a prova de que o time sabe fazer um momento bonito quando decide investir nele.
- **O respeito a `prefers-reduced-motion`.** Toda a animação do produto (fade, reveal, pulse, modal) desliga de forma limpa para quem pede menos movimento — decisão de acessibilidade que muitos produtos "bonitos" ignoram.
- **A paleta de categorias.** Oito cores vívidas e bem diferenciadas (azul, vermelho, verde, roxo, âmbar, rosa, ciano, cinza) para Aula/Plantão/Ambulatório/Laboratório/Estudo/Prova/Congresso/Pessoal — um recurso cromático rico que hoje está subutilizado (confinado a bolinhas de `1.5px` de raio).
- **O ícone do aplicativo.** Um glifo geométrico simples ("A" como um pico/montanha), legível em 72px e em 512px, com gradiente próprio — um ativo de marca genuinamente competitivo com os apps de referência.
- **A disciplina de "silêncio como política" (herdada do F14).** No máximo um smart card por tela, nunca um card crítico espontâneo — isso já é comportamento de app premium (Craft, Arc), só falta a superfície visual estar à altura da disciplina de conteúdo.

---

## O que transmite inovação

Honestamente: pouco, hoje. Os dois pontos genuinamente inovadores do produto são de **arquitetura de comportamento**, não de superfície visual — e por isso não aparecem nesta lista de "impacto visual", mas merecem registro porque são a base sobre a qual a inovação visual desta auditoria pode ser construída sem inventar produto novo:

- **O Decision Engine e o teto de "1 card espontâneo".** A maioria dos apps de produtividade erra para o lado do excesso de avisos; o Anoti decidiu, deliberadamente, calar-se. É uma escolha de produto rara.
- **"Fechar o dia" com plano para amanhã.** A ponte entre o encerramento de hoje e a sugestão de abertura de amanhã (`closeDayService.setNextStudyPlan` → chip "Continuar" em `todayView.js`) é uma ideia de produto no nível de Sunsama/Things — só falta o invólucro visual condizente.
- **`getStudyCalendar()` pronto e nunca desenhado** é, ao mesmo tempo, a maior oportunidade perdida de inovação visual do produto e a prova de que a inovação de dados já existe — falta só a inovação de apresentação.

Fora isso: nenhuma micro-interação assinada, nenhuma forma nova de mostrar informação, nenhum uso de gestos, nenhuma navegação alternativa (palette de comando, atalhos descobríveis por UI). O roadmap desta auditoria é, em boa parte, uma lista de como converter as duas ideias de produto acima (e outras já existentes nos dados) em experiências visuais que peçam para ser mostradas.

---

## O que transmite excesso de "IA"

O briefing pede para caçar sinais de "interface gerada por IA" — sinais que sobrevivem mesmo depois de um design system tecnicamente maduro (F18 já eliminou a ilha cromática do Assistente de IA; isto aqui é outra coisa, mais sutil):

1. **Um padrão único resolve todo problema de "informação demais".** O par chevron + "Mostrar/Ocultar" (`.disclosure-toggle`) aparece em pelo menos seis lugares completamente diferentes — números de hoje, números do Progresso, opções do início de sessão, contexto da sessão ativa, filtros avançados do Diário, cor do compromisso. Um designer humano varia a solução (abas, telas próprias, sheets, progressive reveal por gesto) conforme o conteúdo; aplicar sempre o mesmo componente para tudo que "não sabemos onde colocar" é a assinatura mais reconhecível de um sistema construído por padrão-repetição.
2. **O card de "insight" com borda colorida à esquerda.** `.smart-card` (ícone + rótulo + mensagem + borda esquerda de 3px colorida por tipo) é, pixel a pixel, o componente "AI insight callout" mais genérico que existe — o mesmo padrão visual usado em centenas de dashboards gerados. É funcionalmente ótimo (a disciplina por trás dele é rara); visualmente é o componente do produto com menos personalidade própria.
3. **Estrutura de página 100% idêntica em todo lugar.** Todo `.app-page` é `page-header` (h1 + no máximo um botão) seguido de conteúdo — sem uma única exceção em cinco páginas de propósitos totalmente diferentes (chegar, estudar, agendar, refletir, revisar progresso). Previsibilidade é ótima para manutenção; para quem usa, cinco telas com a mesma anatomia exata comunicam "gerado a partir do mesmo template", não "cada tela pensada para o que faz".
4. **Cópia funcionalmente correta e emocionalmente neutra.** "Nenhuma sessão de estudo em andamento", "Dia encerrado. Até amanhã!", "Questão registrada" — cada frase está certa e nenhuma tem voz. Não existe um único lugar no produto em que o texto surpreenda, arranque um sorriso ou soe como se tivesse sido escrito por alguém que gosta do usuário (o padrão Duolingo/TickTick/Headspace). Voz neutra e sempre-correta é, ironicamente, o traço mais "gerado" que existe — texto humano tem variação de tom.
5. **Ícones universais, nunca autorais.** O conjunto de `icons.js` é consistente (ótimo) mas genérico — relógio, alvo, livro, chama são o vocabulário-padrão de qualquer kit de ícones open-source. Nenhum traço do produto sugere "isto foi desenhado para estudantes de Medicina" especificamente; o mesmo conjunto serviria para um app de finanças ou de hábitos.

O padrão comum a estes cinco pontos: **cada um deles é, individualmente, uma decisão de engenharia correta** (reuso, consistência, previsibilidade). A soma é que produz a sensação de "gerado", porque nenhuma dessas decisões foi revisitada depois de pronta perguntando "isto merece ser diferente aqui?" — exatamente o diagnóstico que o F18 já fez para o CSS, agora reaparecendo na camada de conteúdo e de padrão de interação.

---

## O que deveria desaparecer

- **O spinner cinza genérico da tela de carregamento** — substituído por algo com a identidade do ícone do app (ver roadmap V5.15).
- **O toast único para todo tipo de sucesso** — a intensidade do feedback deveria variar com o peso da ação.
- **A dependência exclusiva do padrão "chevron + Mostrar/Ocultar" para toda densidade de informação** — pelo menos os casos de maior peso emocional (Progresso, conquistas) merecem um tratamento visual próprio, não mais um disclosure.
- **O card único "Conquistas recentes" com fração de texto ("3/5")** dentro do disclosure "Ver números" do Progresso — hoje é a pior apresentação possível para o dado mais emocionalmente rico que o produto calcula.
- **O item de navegação "Mais" como catch-all sem curadoria** — merece decisão própria de que 1-2 destinos adicionais (não a sidebar inteira) fazem mais sentido em mobile.
- **A cor de acento única para tudo.** Não significa introduzir caos cromático — significa reservar um segundo tom (mesmo que só para estados de celebração) para que nem todo pixel colorido do produto grite a mesma mensagem.
- **O grid semanal com scroll horizontal forçado em telas estreitas** (`min-width: 480px` documentado em CSS) como única visão mobile da Agenda — nota adicional a favor de uma "Vista Dia" (ver roadmap).

---

## O que deveria nascer

- **Um heatmap de constância** — o dado (`getStudyCalendar()`) já existe pronto, documentado como "pensado para consumo futuro por um widget de calendário", nunca conectado a nenhuma tela.
- **Um anel de meta diária** (padrão Apple Watch/Apple Health) substituindo a barra linear atual — o dado (percentual da meta) já é calculado, só falta a forma.
- **Um momento de celebração de conquista desbloqueada** — hoje as cinco conquistas de `achievementService.js` são recalculadas silenciosamente a cada carregamento; nunca há um instante em que o produto reconhece "você acabou de passar de 50 para 100 horas".
- **Uma paleta de comando (⌘K)** — os atalhos já existem (`g h`, `g a`, `g s`, `g j`, `g p`, `n`, `/`) mas são invisíveis para quem não leu a documentação; uma paleta os torna descobríveis e telegrafa velocidade (o traço mais citado de Linear/Raycast).
- **Uma tela própria (não um modal) para o Fechamento do Dia** — o melhor ritual emocional que o Anoti já projetou merece mais do que um `<dl>` dentro de `.modal-card`.
- **Uma "Vista Dia" mobile-first na Agenda** — para a persona majoritariamente mobile, uma lista vertical do dia (padrão Apple Calendar/Fantastical) é mais natural que um grid semanal que exige rolagem horizontal.
- **Uma segunda camada tipográfica com intenção de marca** — hoje `--font-display` (a serifada) é usada só no cronômetro e nos números de stat-card; estendê-la a streak, conquistas e ao recap do fechamento do dia criaria uma assinatura tipográfica reconhecível em todo "número que importa" do produto.

---

## As 20 melhorias com maior impacto visual

1. **Heatmap de constância na página Progresso**, usando `getStudyCalendar()` (já pronto, nunca desenhado) — estilo GitHub/Duolingo, cada dia estudado como um quadrado preenchido.
2. **Anel de progresso circular para a meta diária**, substituindo `.dashboard-progress` (barra linear de 6px) — o mesmo dado, apresentado com muito mais peso visual.
3. **Timer circular na Sessão de Estudo** — um anel de progresso ao redor de `.ss-timer-value` quando há tempo previsto, substituindo `.ss-progress` (barra linear atual).
4. **Renderizar de fato os ícones de conquista** já definidos em `achievementService.js` (`clock`, `check-circle`, `target`, `flame`, `book`) — hoje nunca desenhados em nenhuma tela.
5. **Redesenho da tela de login/cadastro** com identidade visual própria (hoje é o `.card` genérico reaproveitado de qualquer superfície elevada do produto).
6. **Tela de carregamento com identidade própria**, ecoando o gradiente do ícone do app em vez do spinner cinza genérico.
7. **Segunda cor de acento reservada a momentos de celebração** (conquista, fechamento do dia, marco de streak) — sem substituir o índigo como cor primária de ação.
8. **Peso visual maior nos rótulos do bottom-nav** (hoje `.62rem`, o menor texto funcional do produto) — a navegação primária do modo mobile merece mais confiança visual.
9. **Substituir os grids de stat-cards do Progresso por uma composição visual** (anéis + heatmap + narrativa), abandonando o formato "grade de números soltos" herdado do antigo Dashboard.
10. **Wordmark com mais presença no header** — hoje `.app-title` (1.05rem) compete visualmente com o ícone de menu ao lado; o nome do produto deveria ser o elemento mais confiante do cabeçalho.
11. **Motion própria para o toast de Fechamento do Dia**, distinta do `slide-in-right` genérico usado em toda confirmação trivial.
12. **Uso mais amplo da paleta de categorias** (hoje confinada a bolinhas de 1.5px) — ex. borda lateral colorida nos itens de compromisso de "Hoje", faixa de cor no cabeçalho da sessão ativa.
13. **Ilustrações de linha simples para estados vazios**, substituindo o par ícone-de-24px + texto centralizado (`.state-block`) usado identicamente em 5+ contextos diferentes.
14. **Tratamento visual autoral para os 5 tipos de smart card**, hoje resolvidos só por uma borda esquerda de 3px colorida — o componente de "insight" mais genérico possível.
15. **Estender a tipografia serifada de destaque (`--font-display`)** ao número de streak, à fração de conquistas e aos números do recap de fechamento do dia — hoje restrita a `.ss-timer-value` e `.stat-card-value`.
16. **Composição visual própria para o Modo Foco** — hoje é literalmente a mesma tela com header/sidebar ocultos; merece um fundo/centralização que comunique "modo diferente", não só "menos coisas visíveis".
17. **Indicador de execução do compromisso como anel/barra por dia** (não só percentual em texto/tooltip) na Agenda — visão Mês e Semana.
18. **Profundidade sutil em superfícies-chave** (cartão de sessão ativa, cronômetro) — hoje toda superfície do produto usa exatamente o mesmo `--shadow-md` plano, sem hierarquia de elevação entre "cartão qualquer" e "o momento mais importante da tela".
19. **Ícone do bottom-nav "Mais" substituído por algo com curadoria própria** (ex. avatar do usuário, ou os 1-2 destinos secundários mais usados) em vez do ícone genérico de três pontos.
20. **Splash screen / meta tags de tema mais expressivas** — `theme-color` já usa o índigo da marca; falta o mesmo cuidado no motion de entrada do app instalado como PWA (primeiro frame antes do JS carregar).

---

## As 20 melhorias com maior impacto na experiência

1. **Paleta de comando (⌘K / Ctrl+K)** unificando os atalhos já existentes (`g h/a/s/j/p`, `n`, `/`) numa superfície descobrível e digitável — o salto de velocidade percebida mais citado em Linear/Raycast.
2. **Tela própria (não modal) para Fechar o Dia**, com uma sequência curta e motion de encerramento — transforma o melhor ritual de produto do Anoti numa experiência à altura da ideia.
3. **Momento de celebração na primeira vez que uma conquista é concluída** — hoje a transição de "quase lá" para "completo" acontece em silêncio, recalculada a cada carregamento sem nenhum instante reconhecido.
4. **Heatmap de constância clicável** — cada dia do heatmap abre a sessão daquele dia no Diário, transformando um enfeite visual em navegação útil.
5. **Vista "Dia" mobile-first na Agenda**, substituindo o grid semanal com scroll horizontal forçado como padrão em telas estreitas — lista vertical do dia, no espírito Apple Calendar/Fantastical.
6. **Gestos de swipe em mobile** — deslizar um compromisso de "Hoje" para iniciar sessão; deslizar a sessão ativa para pausar — reduzindo toque-preciso-em-botão-pequeno a um gesto natural.
7. **Mini-timer flutuante evoluído** a partir do chip atual (`activeSessionIndicatorView.js`) — um elemento mais presente, no espírito "Dynamic Island", que acompanha a rolagem em qualquer tela durante a sessão.
8. **Onboarding com propósito emocional**, não só funcional — trocar a lista numerada de 4 itens por 2-3 telas curtas que respondem "por que estudar aqui, e não numa agenda qualquer" antes de pedir qualquer ação.
9. **Diferenciação de peso emocional entre confirmações triviais e significativas** — "questão registrada" e "dia encerrado" não deveriam soar (nem parecer) igualmente importantes.
10. **Login/cadastro com identidade própria**, não um formulário genérico — a primeira impressão de qualquer usuário novo.
11. **Progresso sem grades de números** — narrativa (já existe) + anel de meta + heatmap substituindo por completo o padrão "Ver números" que ainda entrega uma grade de 12 cartões.
12. **Reconhecimento visível ao concluir todos os compromissos do dia** — hoje nenhum marco de "dia cumprido" existe antes do fechamento manual.
13. **Destino de navegação próprio para Conquistas**, tirando-as de dentro de um disclosure dentro de outro disclosure (`Progresso → Ver números → Progresso e Conquistas`).
14. **Resposta física nos botões de ação primária** (Iniciar sessão, Registrar, Fechar o dia) — um leve scale/bounce no toque, hoje ausente (`.btn-primary` só troca de cor no hover).
15. **Destaque visual maior para o botão "Continuar: {título}"** — a melhor ideia de retomada do produto hoje tem o mesmo peso visual (`btn-secondary`) de qualquer ação secundária.
16. **Indicador de execução do compromisso acessível e rico em todas as visões da Agenda** (não só tooltip no Mês) — consolidando com mais substância visual do que texto solto.
17. **Um "porquê" mostrado no primeiro card de conquista quase concluída** ("faltam 3 sessões para sua primeira conquista") em vez de números frios — reforça a mecânica de progresso próxima, padrão Duolingo/Forest.
18. **Feedback tátil-equivalente para o registro rápido de questões** — quem resolve 40 questões numa sessão faz o mesmo gesto 40 vezes; um retorno visual sutil e satisfatório por toque (sem som) vale muito nesse volume de repetição.
19. **Streak apresentada como objeto visual, não só número** — mesmo que simples (uma chama que preenche, um traço que cresce), na linha de Forest/Duolingo, em vez de só "7 dias" em texto.
20. **Estado "sessão pausada" com tratamento temporal-visual diferenciado** (não só troca de cor do badge) — o usuário pausado precisa sentir "o relógio não está correndo", não só ler isso.

---

## Ideias criativas de alto impacto

Uma curadoria das ideias acima com mais profundidade — as que, se bem executadas, mudam a categoria de percepção do produto (de "sistema" para "aplicativo"):

### 1. O Heatmap de Constância como coração visual do Progresso
`studyStreakService.getStudyCalendar()` devolve exatamente `{ "2026-07-24": true, ... }` — o formato de dado padrão de qualquer heatmap de contribuição (GitHub, Duolingo, Readwise). Hoje esse dado não alimenta nenhum pixel. Um heatmap de constância no topo do Progresso, acima até da narrativa em texto, daria ao estudante uma resposta visual instantânea a "como tenho sido nas últimas semanas" — sem ler uma frase, sem abrir um disclosure. É a única ideia desta lista que não exige nenhum cálculo novo: os dados já existem, testados, prontos.

### 2. Anéis, não barras
Toda meta no Anoti hoje é uma barra linear cinza-e-azul de 6px de altura (`.dashboard-progress`). O anel de progresso (Apple Watch/Apple Health) comunica a mesma informação com muito mais peso emocional — um círculo que se completa é satisfatório de um jeito que uma barra nunca é. Meta diária, meta semanal e o próprio cronômetro da sessão (quando há tempo previsto) são os três candidatos naturais.

### 3. "Fechar o dia" como uma cerimônia, não um modal
A ideia de produto já é ótima: recap + plano de amanhã. A execução hoje é um `<dl>` dentro de `.modal-card`, indistinguível de qualquer outro modal do app. Merece uma tela cheia (ou quase cheia), com os números do recap aparecendo em sequência com motion (não todos de uma vez), terminando num "até amanhã" que realmente pareça o fim de alguma coisa — o equivalente Anoti do "streak salvo" do Duolingo ou do "sessão completa" do Headspace.

### 4. Paleta de comando como superfície de velocidade
O Anoti já pensa em atalhos de teclado (`g h`, `n`, `/`) mas eles são invisíveis fora de um `title=""`. Uma paleta de comando (⌘K) unifica navegação + ações + busca do diário numa única superfície digitável, telegrafa "isto é rápido" a qualquer usuário que já usou Linear, Notion ou Raycast, e dá um segundo caminho de uso para usuários avançados sem competir com a simplicidade do caminho por toque.

### 5. Conquistas como coleção, não como fração
Cinco conquistas com ícone próprio já existem no domínio (`clock`, `check-circle`, `target`, `flame`, `book`). Merecem uma superfície visual própria — uma grade pequena de "selos", cada um com estado visual distinto (bloqueado/em progresso/concluído), e uma revelação diferenciada na primeira vez que cada um se completa. Isso não é gamificação no sentido que `VISAO_DO_PRODUTO.md` exclui (XP, níveis, ranking) — é dar forma visual a um fato que o produto já mede e já decidiu que quer contar.

### 6. Vista "Dia" como padrão mobile da Agenda
A grade semanal exige `min-width: 480px` e força scroll horizontal em qualquer tela mais estreita — uma persona majoritariamente mobile encontra essa fricção todos os dias. Uma vista "Dia" (lista vertical de horários, ao estilo Apple Calendar/Fantastical) como padrão em telas estreitas, com "Semana" disponível como opção secundária, serve melhor o uso real sem remover nenhuma capacidade.

### 7. Mini-timer flutuante como "Dynamic Island" do Anoti
O chip de sessão ativa no header já resolve "não perder a sessão de vista". A evolução natural — um elemento flutuante, discreto, que acompanha a rolagem e se expande com um toque para mostrar tempo + ação rápida ("+1 questão") — daria ao produto um elemento de assinatura visual que nenhum concorrente direto (agendas de estudo) tem hoje.

---

## Inspirações utilizadas

Princípios extraídos (nunca copiados) dos produtos indicados no briefing, mapeados ao achado que cada um informou:

| Produto | Princípio extraído | Onde se aplica nesta auditoria |
|---|---|---|
| **Things 3** | Um "Hoje" com peso tipográfico e ritual próprios; tipografia confiante como voz de marca | Base do "Hoje" (já existe via F14) — falta a confiança tipográfica |
| **Sunsama** | *Shutdown ritual* — encerrar o dia é uma cerimônia com começo, meio e fim | Ideia criativa #3 (Fechar o Dia como cerimônia) |
| **Linear** | Velocidade como estética; paleta de comando como cidadã de primeira classe | Ideia criativa #4 (paleta de comando) |
| **Raycast** | Atalhos descobríveis, não escondidos em `title=""` | Ideia criativa #4 |
| **Craft** | Hierarquia tipográfica ousada; uma serifada usada com intenção, não decoração | Melhoria visual #15 (estender `--font-display`) |
| **Arc Browser** | Personalidade em detalhes pequenos; um único ponto de cor viva usado com parcimônia | "O que deveria desaparecer" — segunda camada cromática reservada |
| **Apple Calendar** | Vista Dia como o modo natural em telas estreitas; indicador de execução sempre visível, nunca só em tooltip | Ideia criativa #6 |
| **Google Calendar** | Densidade equilibrada; cores de categoria como linguagem, não decoração | Melhoria visual #12 (uso mais amplo da paleta de categorias) |
| **TickTick** | Timer embutido no item, a um toque de distância, nunca em outra página | Já resolvido pelo F14 (Sessão) — reforçado pelo timer circular (#3) |
| **Capacities** | Cartões com profundidade sutil; tipografia editorial | Melhoria visual #18 (profundidade em superfícies-chave) |
| **Readwise** | Heatmap de constância como resposta visual instantânea a "como tenho sido" | Ideia criativa #1 |
| **Headspace** | Motion celebratório contido; tom de voz gentil; onboarding que explica o "porquê" antes do "como" | Melhoria de experiência #8 (onboarding com propósito) |
| **Forest** | A sequência como objeto visual (uma árvore), não como número solto | Melhoria de experiência #19 (streak como objeto visual) |
| **Duolingo** | Celebração de marcos; streak como núcleo emocional da experiência diária | Ideia criativa #5 (conquistas como coleção) |
| **Apple Health** | Anéis de meta; narrativa em frases antes de qualquer grade | Ideia criativa #2 (anéis, não barras) — já parcialmente citado pelo F14 para a narrativa |
| **Gentler Streak** | Positividade sem culpa; motion suave até nos estados de "pausa"/"recuperação" | Melhoria de experiência #20 (estado "pausado" com tratamento próprio) |

---

## Roadmap de implementação

Fases pequenas, independentes, uma PR cada — mesma convenção das ondas F14/F18 já usadas neste repositório. Nenhuma fase altera regra de negócio ou schema de dados além do estritamente necessário para persistir um novo estado visual (ex. detectar transição de conquista); a maioria é CSS + pequenas views novas sobre dados que já existem.

### Onda 1 — Vitórias rápidas de personalidade (baixo risco, alto impacto perceptível)

**V5.1 — Heatmap de constância no Progresso**
- **Objetivo:** desenhar um heatmap de dias estudados (últimas ~12 semanas) no topo da página Progresso, acima da narrativa.
- **Motivação:** `studyStreakService.getStudyCalendar()` já existe, testado, e está documentado como "pensado para consumo futuro por um widget de calendário" sem nunca ter sido conectado — é a maior lacuna entre dado pronto e apresentação visual do produto.
- **Impacto esperado:** alto — dá ao Progresso uma resposta visual instantânea, reduzindo a dependência de texto/grades para a pergunta "como tenho sido".
- **Arquivos:** novo `constancyHeatmapView.js`, `index.html` (`#page-progress`), `style.css`, leitura de `studyStreakService.getStudyCalendar()` (sem alteração).
- **Complexidade:** média (renderização de grade responsiva + legenda de intensidade).
- **Riscos:** baixo — leitura pura, sem escrita; cuidado com desempenho em contas muito antigas (limitar a ~90 dias visíveis).
- **Critérios de aceite:** heatmap visível em Progresso sem nenhum clique adicional; cada célula reflete corretamente `getStudyCalendar()`; funciona em tema claro/escuro.

**V5.2 — Anel de progresso para a meta diária**
- **Objetivo:** substituir `.dashboard-progress` (barra linear) por um anel circular (SVG) no card de meta diária.
- **Motivação:** o mesmo dado numérico (percentual da meta) hoje é apresentado da forma visualmente menos satisfatória possível — uma barra fininha idêntica à de qualquer formulário de upload.
- **Impacto esperado:** alto — é o primeiro "momento Apple Health" do produto, reaproveitável depois na meta semanal.
- **Arquivos:** `activityDashboardView.js`, `style.css`.
- **Complexidade:** baixa-média (SVG `stroke-dasharray` sobre o percentual já calculado).
- **Riscos:** baixo — puramente visual, mesmo dado de entrada.
- **Critérios de aceite:** anel reflete o mesmo percentual hoje mostrado em texto/`aria-valuenow`; acessível (texto do percentual continua presente, não só a cor).

**V5.3 — Renderizar os ícones de conquista já definidos**
- **Objetivo:** o card "Conquistas recentes" do Progresso passa a mostrar as cinco conquistas individualmente, cada uma com seu ícone (`clock`/`check-circle`/`target`/`flame`/`book`, já definidos em `achievementService.js`) e estado visual (bloqueado/em progresso/concluído).
- **Motivação:** hoje o domínio de conquistas — cinco metas com ícone próprio, já implementado e testado — é reduzido a uma única fração de texto ("3/5") dentro de um disclosure dentro de outro disclosure.
- **Impacto esperado:** alto — ativa um recurso de dados já pronto que nunca ganhou forma visual.
- **Arquivos:** novo `achievementsView.js` (ou extensão de `activityDashboardView.js`), `index.html`, `style.css`, leitura de `achievementService.listAchievements()` (já existe).
- **Complexidade:** média.
- **Riscos:** baixo — leitura pura.
- **Critérios de aceite:** as 5 conquistas aparecem individualmente com ícone e progresso; nenhuma mudança na lógica de cálculo de `achievementService.js`.

**V5.4 — Peso visual do bottom-nav**
- **Objetivo:** aumentar o tamanho/peso dos rótulos do bottom-nav (hoje `.62rem`) para um valor que não seja o menor texto funcional do produto.
- **Motivação:** a navegação primária do modo mobile tem hoje menos confiança visual que qualquer legenda secundária — dissonante com a ideia de "app", não "site com menu embaixo".
- **Impacto esperado:** médio-alto na sensação de solidez mobile; toca a percepção "isto é a navegação principal" imediatamente.
- **Arquivos:** `style.css` (`.bottom-nav-label`).
- **Complexidade:** trivial.
- **Riscos:** nenhum — checar que 5 rótulos continuam cabendo sem quebra de linha nas larguras mínimas suportadas (360px).
- **Critérios de aceite:** rótulos legíveis com peso equivalente a outros textos funcionais do produto; sem overflow em 360×640.

**V5.5 — Motion própria para o toast de Fechamento do Dia**
- **Objetivo:** o toast de sucesso ao confirmar "Fechar o dia" ganha uma variante visual/animada distinta do toast padrão usado em ações triviais.
- **Motivação:** hoje "Dia encerrado. Até amanhã!" usa a mesma caixa verde e a mesma animação de "questão registrada" — o momento de maior peso emocional do ciclo diário não tem nenhum tratamento diferenciado.
- **Impacto esperado:** médio — pequeno investimento, primeiro sinal de que nem todo sucesso é igual.
- **Arquivos:** `toastService.js`, `style.css`.
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** o toast de fechamento do dia é visualmente distinguível de um toast padrão (duração, motion ou composição); toasts triviais permanecem inalterados.

### Onda 2 — Ritual e motion de marca

**V5.6 — Tela própria para o Fechamento do Dia**
- **Objetivo:** substituir `#close-day-modal` (modal padrão) por uma experiência de tela cheia (ou quase cheia) com os números do recap aparecendo em sequência.
- **Motivação:** o ritual de fechamento é a melhor ideia de design emocional já implementada no Anoti; hoje está dentro do componente de modal mais genérico do produto.
- **Impacto esperado:** alto — o momento mais citável do ciclo diário passa a parecer desenhado, não reaproveitado.
- **Arquivos:** `todayView.js`, `index.html` (`#close-day-modal` → nova estrutura), `style.css`, `closeDayService.js` (sem mudança de lógica, só de consumo).
- **Complexidade:** média.
- **Riscos:** médio — precisa manter os mesmos dados/testes existentes (`getDayRecap`, `setNextStudyPlan`); revisão cuidadosa de acessibilidade (foco, `aria-live`) na nova estrutura.
- **Critérios de aceite:** todos os dados do recap continuam corretos; fluxo de "primeiro estudo de amanhã" preservado; navegável por teclado; testes de `todayView`/`closeDayService` continuam verdes.

**V5.7 — Celebração de conquista desbloqueada**
- **Objetivo:** detectar, no momento em que uma conquista cruza de "em progresso" para "concluída", e mostrar uma revelação visual única (não um toast padrão).
- **Motivação:** hoje as conquistas são puramente derivadas e recalculadas a cada carregamento (arquitetura correta, F6.12) — não existe nenhum instante em que a transição é reconhecida pelo usuário.
- **Impacto esperado:** alto — é o único "momento de vitória" verdadeiramente novo desta auditoria.
- **Arquivos:** `achievementService.js` (guarda leve de "última conquista vista", ex. `localStorage`, sem tocar na regra "nunca persistir conquista" — só o *já visto*), novo componente de celebração, `style.css`.
- **Complexidade:** média — cuidado para não violar o princípio arquitetural existente ("conquistas nunca são persistidas"); a marca de "já celebrada" é local ao dispositivo, não ao domínio.
- **Riscos:** médio — exige comparar estado anterior/atual sem armazenar o domínio em si; testar cuidadosamente para não celebrar a mesma conquista duas vezes nem deixar de celebrar por race condition.
- **Critérios de aceite:** cada conquista é celebrada uma única vez, no dispositivo em que foi concluída; recarregar a página não repete a celebração; nenhuma tabela nova criada.

**V5.8 — Resposta física nos botões de ação primária**
- **Objetivo:** adicionar uma microinteração de toque (leve `scale`/translação) a `.btn-primary` nos três momentos de maior peso (Iniciar sessão, Registrar questão, Fechar o dia).
- **Motivação:** hoje `.btn-primary` só troca de cor no hover — nenhuma resposta ao clique além do padrão do navegador; falta a sensação "física" de apertar algo.
- **Impacto esperado:** médio — barato de implementar, sentido em todo toque do produto.
- **Arquivos:** `style.css` (`:active` de `.btn-primary` e variantes específicas).
- **Complexidade:** baixa.
- **Riscos:** baixo — checar `prefers-reduced-motion`.
- **Critérios de aceite:** feedback visível ao pressionar (não só ao soltar); desativado quando `prefers-reduced-motion: reduce`.

**V5.9 — Onboarding com propósito emocional**
- **Objetivo:** substituir a lista numerada de 4 passos por 2-3 telas curtas que estabelecem o "porquê" do Anoti antes de qualquer ação pedida.
- **Motivação:** o tour atual é funcional (o que cada tela faz) e nunca emocional (por que isso importa para quem estuda Medicina) — oportunidade perdida de primeira impressão.
- **Impacto esperado:** médio-alto especificamente para retenção na primeira semana.
- **Arquivos:** `onboardingTourView.js`, `index.html`, `style.css`.
- **Complexidade:** média.
- **Riscos:** baixo — manter a regra existente de "nunca obrigatório, sempre dispensável, nunca modal".
- **Critérios de aceite:** onboarding continua dispensável a qualquer momento; nunca reaparece após visto; não bloqueia nenhuma ação do usuário.

### Onda 3 — Navegação e velocidade percebida

**V5.10 — Paleta de comando (⌘K / Ctrl+K)**
- **Objetivo:** uma superfície de comando único unificando navegação (`g h/a/s/j/p`), ações rápidas (novo compromisso, iniciar sessão) e busca do diário.
- **Motivação:** os atalhos já existem mas são invisíveis fora de um `title=""` — uma paleta os torna descobríveis e telegrafa velocidade, o traço mais citado de Linear/Raycast.
- **Impacto esperado:** alto para usuários avançados/recorrentes; sinaliza maturidade de produto mesmo para quem nunca a abre.
- **Arquivos:** novo `commandPaletteView.js`, `keyboardService.js` (novo atalho de abertura), `index.html`, `style.css`.
- **Complexidade:** média-alta (busca fuzzy simples, navegação por teclado dentro da paleta).
- **Riscos:** médio — cuidado para não colidir com atalhos de navegador/SO; acessibilidade de teclado completa (Esc fecha, setas navegam, Enter confirma).
- **Critérios de aceite:** abre com atalho dedicado; cobre no mínimo navegação entre páginas + iniciar sessão + novo compromisso; totalmente navegável por teclado; não interfere em nenhum atalho existente.

**V5.11 — Mini-timer flutuante evoluído**
- **Objetivo:** evoluir `active-session-chip` (hoje só no header) para um elemento flutuante que acompanha a rolagem e se expande com um toque para mostrar tempo + "+1 questão".
- **Motivação:** o chip atual resolve "não perder a sessão de vista" mas desaparece do campo de visão em telas longas; um elemento persistente e expansível dá ao produto uma assinatura visual própria.
- **Impacto esperado:** médio-alto, especialmente em uso mobile de sessões longas.
- **Arquivos:** `activeSessionIndicatorView.js`, `style.css`.
- **Complexidade:** média-alta (posicionamento fixo + expansão sem conflitar com bottom-nav/teclado virtual).
- **Riscos:** médio — testar cuidadosamente sobreposição com teclado virtual em mobile e com o bottom-nav.
- **Critérios de aceite:** timer visível e correto em qualquer página durante sessão ativa; expansão por toque funciona sem cobrir controles essenciais; não duplica os controles completos já existentes na tela de Sessão (mantém o princípio já documentado no chip atual).

**V5.12 — Vista "Dia" mobile-first na Agenda**
- **Objetivo:** nova aba/visão "Dia" (lista vertical de horários do dia) tornando-se o padrão em telas estreitas, com "Semana"/"Mês" continuando disponíveis.
- **Motivação:** a grade semanal exige `min-width: 480px` e força scroll horizontal — decisão já documentada como consciente em CSS, mas o F18 mobile já sinalizou como candidata a revisão; nesta auditoria é a evidência de "ainda parece site responsivo" mais concreta.
- **Impacto esperado:** alto para a persona majoritariamente mobile.
- **Arquivos:** `weekView.js` (nova função de renderização "Dia" reaproveitando dados já expandidos), `index.html` (`#agenda-view-tabs`), `style.css`.
- **Complexidade:** média-alta.
- **Riscos:** médio — não pode regredir nenhuma funcionalidade hoje disponível na Semana; testar recorrência/múltiplos compromissos no mesmo horário.
- **Critérios de aceite:** "Dia" disponível como aba em telas ≤767px, torna-se padrão nessa faixa; Semana/Mês continuam intactos e acessíveis; sem scroll horizontal forçado na nova vista.

### Onda 4 — Identidade visual e primeira impressão

**V5.13 — Redesenho da tela de login/cadastro**
- **Objetivo:** dar à autenticação uma composição própria (não o `.card` genérico reaproveitado de qualquer superfície do produto) — no mínimo, um painel de contexto/marca ao lado do formulário em telas largas, e tratamento visual diferenciado em mobile.
- **Motivação:** é a primeira tela que qualquer pessoa vê, antes de qualquer prova de que o Anoti é diferente de um formulário de SaaS genérico.
- **Impacto esperado:** alto na primeira impressão; risco baixo por não tocar em nenhuma lógica de autenticação.
- **Arquivos:** `index.html` (`#login-screen`), `style.css`, `authView.js` (sem mudança de lógica).
- **Complexidade:** média.
- **Riscos:** baixo — cuidado para não introduzir regressão em nenhum dos 7 estados de `.auth-view` (login, cadastro, e-mail enviado, esqueci senha, link enviado, nova senha, link inválido).
- **Critérios de aceite:** todos os 7 estados de autenticação mantêm sua funcionalidade completa; identidade visual claramente diferenciada de um formulário genérico; responsivo em mobile.

**V5.14 — Tela de carregamento com identidade própria**
- **Objetivo:** substituir `.app-loading-spinner` (círculo cinza genérico) por algo que ecoe o gradiente do ícone do app.
- **Motivação:** é o primeiro pixel visível depois do ícone tocado — hoje o ponto de maior queda de qualidade visual entre "abrir o app" e "ver o app".
- **Impacto esperado:** médio — janela de exposição curta, mas universal (todo usuário vê isso toda vez).
- **Arquivos:** `style.css` (`.app-loading-spinner`, `.app-loading-logo`).
- **Complexidade:** baixa.
- **Riscos:** baixo — manter tempo de carregamento percebido igual ou menor; não adicionar dependência externa (a CSP do app já restringe fontes/scripts externos).
- **Critérios de aceite:** carregamento inicial usa uma peça visual com identidade própria da marca, sem novo request de rede, respeitando `prefers-reduced-motion`.

**V5.15 — Segunda camada cromática para celebração**
- **Objetivo:** introduzir um token de cor reservado exclusivamente a estados de celebração (conquista, marco de streak, fechamento do dia) — sem alterar `--color-primary` como cor de ação.
- **Motivação:** hoje uma única cor de acento serve tanto para "clique aqui" quanto para "isto é especial", achatando toda hierarquia emocional de cor do produto.
- **Impacto esperado:** médio-alto, pré-requisito visual para V5.6/V5.7 (fechamento do dia e celebração de conquista).
- **Arquivos:** `style.css` (`:root`, tema escuro).
- **Complexidade:** baixa.
- **Riscos:** baixo — mesma disciplina de tokens já estabelecida pelo F18 (claro + escuro juntos, nunca hex solto).
- **Critérios de aceite:** novo token documentado e usado em pelo menos um contexto de celebração; responde ao tema escuro pelo mesmo mecanismo do resto do app.

**V5.16 — Estender a tipografia serifada de destaque**
- **Objetivo:** aplicar `--font-display` também ao número de streak, à fração de conquistas e aos números do recap de fechamento do dia.
- **Motivação:** hoje a única família tipográfica com personalidade do produto é usada em dois lugares (`.ss-timer-value`, `.stat-card-value`) — estendê-la a todo "número que importa" cria uma assinatura tipográfica reconhecível.
- **Impacto esperado:** médio-alto, baixo custo de implementação.
- **Arquivos:** `style.css`.
- **Complexidade:** baixa.
- **Riscos:** baixo — checar legibilidade em tamanhos pequenos (a regra documentada em `:root` já avisa para nunca usar em texto de UI/formulário — manter essa disciplina).
- **Critérios de aceite:** streak, conquistas e recap do dia usam a mesma família serifada do cronômetro; nenhum texto de formulário/lista passa a usá-la.

### Onda 5 — Progresso como experiência visual

**V5.17 — Consolidar Progresso numa composição visual única**
- **Objetivo:** reunir heatmap (V5.1), anel de meta (V5.2) e narrativa (já existente) como a experiência *primária* de Progresso, relegando as grades de stat-cards a um "Ver detalhes" ainda mais secundário do que hoje.
- **Motivação:** consolidação das melhorias anteriores desta onda numa página coerente, evitando que o Progresso vire "narrativa + heatmap + anel + ainda as mesmas 12 grades por baixo" sem nenhuma reorganização de prioridade visual.
- **Impacto esperado:** alto — é o resultado combinado das fases 1-2 desta onda, mas exige uma passada de revisão de hierarquia que nenhuma fase individual cobre sozinha.
- **Arquivos:** `index.html` (`#page-progress`), `activityDashboardView.js`, `style.css`.
- **Complexidade:** média (reorganização, não lógica nova).
- **Riscos:** baixo-médio — checklist visual completo da página em ambos os temas.
- **Critérios de aceite:** heatmap e anel aparecem antes de qualquer grade de números; grades continuam acessíveis, um nível mais atrás do que hoje.

**V5.18 — Indicador de execução do compromisso como anel por dia**
- **Objetivo:** substituir o indicador percentual (hoje tooltip no Mês, texto na Semana — já sinalizado pelo F18 como inconsistência de acessibilidade) por um pequeno anel/barra visual consistente nas duas visões.
- **Motivação:** mesma informação, forma mais rica e mais consistente entre visões — uma correção de acessibilidade (já roteirizada no F18.20) que esta auditoria propõe resolver com um upgrade visual, não só textual.
- **Impacto esperado:** médio.
- **Arquivos:** `calendar.js`, `weekView.js`, `style.css`.
- **Complexidade:** média.
- **Riscos:** baixo-médio — testar espaço disponível no chip do Mês em telas pequenas.
- **Critérios de aceite:** mesma informação visualmente acessível (não só em `title`) nas duas visões, com tratamento visual consistente entre si.

### Onda 6 — Polimento sensorial

**V5.19 — Ilustrações de linha simples para estados vazios**
- **Objetivo:** substituir o ícone de 24-40px + texto centralizado (`.state-block`) por uma pequena ilustração de linha própria em pelo menos os 3 estados vazios mais vistos (Sessão sem sessão ativa, Diário sem sessões, Agenda sem compromissos).
- **Motivação:** hoje o mesmo padrão genérico se repete idêntico em cinco ou mais contextos diferentes — nenhuma oportunidade de charme nos momentos "não há nada aqui ainda", que em produtos premium costumam ser os mais ilustrados (não os mais esquecidos).
- **Impacto esperado:** médio.
- **Arquivos:** novos assets SVG inline (seguindo o padrão de `icons.js`, sem dependência externa — mantém a CSP atual), `index.html`, `style.css`.
- **Complexidade:** média (depende de produção de ilustração, não só código).
- **Riscos:** baixo.
- **Critérios de aceite:** pelo menos 3 estados vazios de maior tráfego usam ilustração própria; nenhum novo request de rede (SVG inline, como todo o resto do produto).

**V5.20 — Tratamento visual autoral para os smart cards**
- **Objetivo:** revisar a composição dos 5 tipos de `.smart-card` (hoje: ícone + rótulo + mensagem + borda esquerda de 3px) para algo menos idêntico ao padrão genérico de "AI insight callout".
- **Motivação:** é o componente mais funcionalmente disciplinado do produto (nunca mais de 1 por tela, nunca crítico espontâneo) e o mais visualmente genérico — a disciplina de conteúdo merece uma superfície à altura.
- **Impacto esperado:** médio.
- **Arquivos:** `smartCardView.js`, `style.css`.
- **Complexidade:** baixa-média.
- **Riscos:** baixo — manter os 5 tipos semanticamente distinguíveis (cor/ícone), só mudar a composição.
- **Critérios de aceite:** os 5 tipos continuam distinguíveis entre si; nova composição testada em ambos os temas.

**V5.21 — Profundidade sutil em superfícies-chave**
- **Objetivo:** dar ao cartão de sessão ativa (`#ss-active`) e ao cronômetro uma elevação visual maior que o `--shadow-md` padrão usado em qualquer outro cartão do produto.
- **Motivação:** hoje toda superfície do produto — da lista de compromissos ao momento mais importante da tela mais importante — usa exatamente a mesma sombra; nenhuma hierarquia de elevação existe entre "conteúdo qualquer" e "o que está acontecendo agora".
- **Impacto esperado:** médio.
- **Arquivos:** `style.css`.
- **Complexidade:** baixa.
- **Riscos:** baixo — manter consistência com a base compartilhada de cartões (F18.8); este é um modificador pontual, não uma nova variante geral.
- **Critérios de aceite:** o cartão de sessão ativa é visualmente mais elevado que um `.card`/`.stat-card` padrão; nenhuma outra superfície do produto muda.

**V5.22 — Copy com mais personalidade nos momentos de vitória**
- **Objetivo:** revisar o texto de confirmação dos momentos de maior peso emocional (fechar o dia, concluir sessão, bater streak) para uma voz mais humana, mantendo a mesma clareza funcional.
- **Motivação:** hoje toda confirmação do produto usa o mesmo tom neutro-correto ("Dia encerrado. Até amanhã!") — funcional, nunca memorável.
- **Impacto esperado:** médio, custo de implementação muito baixo.
- **Arquivos:** `todayView.js`, `studySessionView.js`, `toastService.js` (strings), sem lógica nova.
- **Complexidade:** trivial (mudança de texto).
- **Riscos:** baixo — manter clareza e idioma (pt-BR); evitar humor forçado ou tom infantilizado, coerente com o público (estudantes de Medicina).
- **Critérios de aceite:** pelo menos 5 mensagens de confirmação de momentos significativos revisadas; nenhuma mudança de comportamento, só de texto.

---

**Ordem sugerida:** Onda 1 primeiro (baixo risco, ativa dados já prontos, ganho de percepção imediato) → Onda 2 (ritual e motion, o núcleo emocional do produto) → Onda 3 (navegação e velocidade, maior complexidade técnica) → Onda 4 (primeira impressão e identidade) → Onda 5 (consolidação do Progresso, depende da Onda 1) → Onda 6 (polimento sensorial, fecha o ciclo).

Assim como em F14 e F18, nenhuma das 22 fases exige inventar produto novo. A diferença desta rodada é que boa parte do material-prima — o heatmap de constância, os ícones de conquista, a serifada de destaque, o ritual de fechamento do dia — **já existe, testado, e nunca ganhou forma visual.** O trabalho não é decidir o que construir; é decidir, finalmente, como fazer o que já existe parecer que alguém se importou com a forma como aparece na tela.
