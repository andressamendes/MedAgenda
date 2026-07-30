# Auditoria UX/UI — Página "Hoje" (Anoti)

> Auditoria conceitual. Nenhum arquivo de produto foi alterado. Nenhuma funcionalidade foi adicionada ou removida — apenas diagnóstico e proposta de reorganização.

---

## 1. Objetivo da página

A página **Hoje** é a tela de abertura do aplicativo e deve responder, em menos de 5 segundos, sem rolagem e sem esforço de leitura, às seguintes perguntas — nesta ordem de prioridade para um estudante:

1. **Tenho uma sessão de estudo ativa agora?** (retomar > começar)
2. **O que devo fazer agora?** (ação única e óbvia)
3. **Estou em dia ou atrasado?** (algum compromisso, revisão ou conflito pendente)
4. **Qual é meu próximo compromisso hoje?**
5. **Quanto eu já estudei / quanto falta para bater minha meta?** (opcional, sob demanda)
6. **Como fecho o meu dia com uma sensação de progresso?**

O papel da tela **não** é ser um dashboard analítico, nem uma lista completa de tudo o que existe no app. Seu papel é ser um **gatilho de ação**: reduzir a distância entre "abrir o app" e "começar a estudar" ao mínimo absoluto, e devolver ao estudante uma sensação de controle e progresso — não de cobrança.

Avaliando a implementação atual (`todayView.js`, `#page-today` em `index.html`, `smartCardView.js`, `activityDashboardView.js`, `disclosureToggle.js`), a página **entrega parcialmente** esse propósito:

- ✅ A pergunta "tenho sessão ativa?" é bem resolvida (botão Retomar tem prioridade estrutural).
- ✅ A pergunta "posso começar a estudar imediatamente?" é bem resolvida (CTA único, sem tela intermediária).
- ⚠️ A pergunta "qual é minha prioridade?" é resolvida de forma fria — o "smart card" existe, mas é visualmente discreto e concorre com o CTA logo abaixo.
- ⚠️ A pergunta "estou em dia?" depende de o estudante notar um badge de conflito dentro de uma lista, não de um sinal de status geral.
- ❌ Não há saudação, nem qualquer humanização da abertura de tela — a tela abre "fria", com um `<h1>Hoje</h1>` genérico, sem nome do usuário, sem data, sem tom emocional.
- ❌ A métrica de progresso do dia fica **escondida atrás de um clique** (disclosure), o que é uma decisão correta para reduzir ruído, mas tem o efeito colateral de não entregar "quanto falta para minha meta" no primeiro relance — é preciso decidir se isso é aceitável (ver Seção 11).

---

## 2. Diagnóstico geral

### Nota: **6,0 / 10**

A base estrutural é sólida e já reflete decisões maduras de produto (CTA único, smart card limitado a 1, stats colapsados por padrão). O problema não é falta de funcionalidade — é falta de **acabamento emocional e hierarquia de superfície**. A tela funciona como uma lista de blocos empilhados, não como uma experiência desenhada.

### Pontos positivos

- **Regra de "1 card só"**: o smart card já foi desenhado para nunca competir consigo mesmo — decisão de produto rara e correta, evita fadiga de decisão.
- **Stats colapsados por padrão** ("mede em silêncio, fala em frases"): já existe a intenção certa de não abrir a tela com números.
- **CTA de estudo é uma decisão binária clara**: "Retomar" ou "Começar" — sem tela de escolha extra.
- **Detecção de conflito de horário** nos compromissos é um recurso de alto valor, silencioso quando não necessário.
- **"Fechar o dia" como ritual de encerramento**: a ideia de um "recap" de 15 segundos com tela cheia é excelente para reforço emocional e está alinhada com apps como Gentler Streak / Forest.
- **Vínculo direto entre compromisso de estudo e sessão** ("Iniciar sessão" só aparece em itens de categoria estudo/simulado) evita ruído em compromissos não relacionados a estudo.

### Principais problemas

1. **Ausência total de acolhimento/saudação** — a tela abre sem nome, sem data, sem qualquer aquecimento emocional; é a tela mais fria de um app que quer parecer "premium e motivador".
2. **Hierarquia visual achatada** — tip banner, CTA, lista de compromissos e stats-toggle têm pesos visuais parecidos (mesma largura de container, tipografia parecida); não há um "herói" visual claro além do botão.
3. **Mistura tipográfica não intencional** — números de estatística usam fonte serifada (`--font-display`) enquanto o resto da tela é sans-serif, criando dissonância visual não justificada por uma decisão de marca clara.
4. **Espaçamento não tokenizado** — a seção `.today-*` mistura `--space-*` com valores mágicos (`.6rem`, `1.6rem`, `2rem`), quebrando a consistência vertical do ritmo da página.
5. **"Fechar o dia" é sub-explorado como reforço positivo no estado padrão** — é tratado como uma ação quase escondida (correto para não empurrar o usuário a sair), mas o app não usa esse momento para reforçar conquista antes de o usuário clicar (ex: nenhum indicador de "você já estudou hoje" perto do botão).
6. **Nenhum indicativo de progresso visível sem interação** — para saber "quanto estudei hoje" o estudante precisa abrir o disclosure; não existe nem um resumo textual de uma linha substituindo os cards.
7. **Compromissos sem diferenciação de estado temporal** — todos os itens do dia (passados, atual, futuros) têm o mesmo peso visual; não há indicação de "próximo compromisso" nem esmaecimento do que já passou.
8. **Título de página redundante com a navegação** — `<h1>Hoje</h1>` repete a label do menu ativo, sem agregar informação (nem data, nem contexto).

---

## 3. Inventário completo

| # | Componente | Finalidade | Importância | Manter | Simplificar | Fundir | Remover | Redesenhar |
|---|---|---|---|---|---|---|---|---|
| 1 | `.page-header` / `h1.page-title "Hoje"` | Identificar a tela | Baixa (redundante com nav) | — | — | ✔ (fundir com saudação/data) | — | ✔ |
| 2 | `#today-tip` (smart card) | Alertar 1 prioridade contextual (atraso/revisão) | Alta | ✔ | — | — | — | ✔ (elevar destaque visual quando ativo) |
| 3 | `.today-hero` (contêiner dos 3 botões) | Ação principal do dia | Máxima | ✔ | — | — | — | ✔ (transformar em bloco "herói" visualmente dominante) |
| 4 | `#today-btn-resume` | Retomar sessão ativa | Máxima (quando aplicável) | ✔ | — | — | — | leve (feedback de tempo decorrido) |
| 5 | `#today-btn-start` | Iniciar estudo | Máxima | ✔ | — | — | — | leve |
| 6 | `#today-btn-continue` | Sugestão de retomar último tema | Média | ✔ | ✔ (texto mais curto) | — | — | — |
| 7 | `section.today-appointments` (título + lista) | Mostrar agenda do dia | Alta | ✔ | ✔ (menos badges por item) | — | — | ✔ (hierarquia por tempo: próximo vs. passado) |
| 8 | `.today-appt-item` (cada linha de compromisso) | Detalhe de 1 compromisso | Alta | ✔ | ✔ | — | — | ✔ |
| 9 | `.badge.today-appt-category` | Categoria colorida | Média | ✔ | — | — | — | — |
| 10 | `.badge.today-appt-conflict-badge` | Alertar sobreposição de horário | Alta (quando ocorre) | ✔ | — | — | — | — |
| 11 | Botão "Iniciar sessão" por item | Atalho de início a partir de um compromisso de estudo | Média | ✔ | — | — | — | — |
| 12 | `p.list-empty` (estado vazio da agenda) | Comunicar dia livre | Média | ✔ | — | — | — | ✔ (tom mais positivo/visual) |
| 13 | `section.today-stats` + `disclosure-toggle` | Ocultar métricas por padrão | Alta (mecanismo), baixa (execução atual) | ✔ | — | — | — | ✔ (resumo de 1 linha sempre visível + expandir para detalhe) |
| 14 | `#dash-cards-today` (3 stat cards: meta, tempo, sessões) | Métrica do dia | Média | ✔ | ✔ (fundir 3 cards em 1 bloco compacto) | ✔ (meta + tempo estudado em um único indicador) | — | ✔ |
| 15 | `.today-close-day` (botão "Fechar o dia") | Encerrar o dia / ritual | Média-alta | ✔ | — | — | — | ✔ (dar mais presença emocional quando há progresso do dia) |
| 16 | `#close-day-modal` (tela cheia de recap) | Celebrar/fechar o ciclo do dia | Alta | ✔ | — | — | — | leve (já é o ponto mais "premium" da experiência) |
| 17 | Saudação personalizada | *(inexistente)* | Alta | — | — | — | — | ✔ (criar) |
| 18 | Data/dia da semana | *(inexistente)* | Média | — | — | — | — | ✔ (criar, fundida ao header) |
| 19 | Indicador de "próximo compromisso" isolado | *(inexistente, hoje é só 1º item da lista)* | Média | — | — | — | — | considerar (opcional) |

---

## 4. Problemas de UX (ordenados por impacto)

1. **Progresso do dia invisível por padrão.** Esconder os números é correto, mas não existe nenhum substituto textual leve ("Você já estudou 45min hoje"). O usuário perde completamente a noção de progresso até decidir abrir o disclosure — o que a maioria não fará.
2. **Nenhuma diferenciação temporal na lista de compromissos.** Um compromisso que já passou tem o mesmo destaque visual do próximo. O estudante precisa ler hora por hora para saber "o que vem agora".
3. **"Continuar: {título}" e "Começar a estudar" competem sem hierarquia clara quando ambos aparecem** — dois botões primários/secundários lado a lado empurram uma decisão que a tela deveria resolver sozinha (ex.: default para o que o usuário disse que estudaria amanhã).
4. **Estado vazio da agenda é neutro, não recompensador.** "Seu dia está livre" é informativo, mas não comunica nada de positivo (poderia reforçar liberdade para estudar, não apenas ausência de compromissos).
5. **O "Fechar o dia" não comunica se vale a pena fechar.** Não há sinalização de que o usuário já cumpriu (ou não) sua meta antes de decidir fechar — o momento de decisão mais emocional do dia (fechar com orgulho) é tratado com neutralidade total.
6. **Smart card e CTA de estudo não têm relação hierárquica combinada.** Quando existe um alerta (atraso/revisão pendente) e ao mesmo tempo o CTA de estudo, os dois pedem atenção simultânea sem indicar qual agir primeiro.
7. **Falta de feedback de "quanto tempo tem a sessão ativa".** O botão "Continuar sessão em andamento" não informa há quanto tempo a sessão está rodando, perdendo a chance de reforçar consistência.

---

## 5. Problemas de UI (ordenados por impacto)

1. **Tipografia mista não intencional**: números grandes em fonte serifada (`--font-display`) dentro de uma interface majoritariamente sem serifa — quebra a unidade visual sem propósito de marca evidente.
2. **Espaçamento não tokenizado na seção `.today-*`**: mistura de `--space-*` com valores soltos (`.6rem`, `1.6rem`, `2rem`), gerando ritmo vertical irregular entre blocos.
3. **Três botões possíveis no hero com estilos diferentes** (`btn-primary`, `btn-primary`, `btn-secondary`) sem um sistema visual único para "ação de estudo" — a alternância de estilo entre estados pode parecer inconsistente ao longo dos dias.
4. **Badges de categoria e badges de conflito usam a mesma forma (pill)**, tornando difícil, num relance rápido, diferenciar "isto é uma categoria" de "isto é um alerta".
5. **Botão "Fechar o dia" (ghost, discreto) tem peso visual quase idêntico a um link secundário qualquer**, fazendo um encerramento de dia (evento emocionalmente relevante) parecer uma ação de baixa importância.
6. **Cards de estatística (stat-cards) usam sombra e hover-lift**, sugerindo interatividade/clique, mas são apenas leitura — affordance enganosa.
7. **Título "Hoje" sem contexto (data, dia da semana)** — visualmente é apenas texto solto no topo, sem função além de rótulo redundante com a navegação ativa.

---

## 6. Problemas de carga cognitiva

- **Excesso de blocos concorrentes na dobra inicial**: tip banner + hero (até 2 botões simultâneos) + título de seção de agenda + itens de agenda, tudo antes mesmo de chegar ao toggle de stats — são 4 a 5 "unidades de atenção" diferentes antes de qualquer rolagem.
- **Excesso de badges por item de compromisso**: categoria + (opcional) conflito + (opcional) botão "Iniciar sessão" — até 3 elementos secundários por linha, competindo com o dado essencial (horário + título).
- **Não há excesso de métricas/gráficos** — aqui a página já acertou ao colapsar isso por padrão. Isso não deve ser revertido.
- **Não há excesso de filtros ou de botões globais** — o problema não é volume de funcionalidades, é a ausência de agrupamento visual entre elas.
- **Decisão implícita exigida do usuário**: quando aparecem simultaneamente Smart Card + Continue + Start, o usuário precisa decidir sozinho por onde começar a olhar — a tela deveria decidir isso por ele através de ordem e peso visual.

---

## 7. Problemas de hierarquia visual

- **Não existe um "bloco herói" real.** O botão de ação principal é visualmente do mesmo tamanho de contêiner que o resto da página (max-width comum), sem nenhum tratamento de destaque (cor de fundo, elevação, área dedicada).
- **O olho não é guiado deliberadamente.** Hoje, a leitura tende a ser: título → tip (se houver) → botão → lista → toggle → botão de fechar, em ordem de leitura padrão, não em ordem de prioridade desenhada.
- **A seção de compromissos e a seção de estatísticas têm o mesmo tratamento de `h2`**, sugerindo peso equivalente, quando estatísticas deveriam ser claramente secundárias/opcionais.
- **Nenhum destaque cromático diferencia "ação" de "informação"** — botão de estudo, badges de categoria e botão de fechar dia usam paletas que não formam uma linguagem clara de prioridade (ex.: azul usado tanto no CTA principal quanto em elementos de categoria).

---

## 8. Problemas de mobile

- **Empilhamento vertical rígido em 360–430px**: como tudo é uma coluna única (tip → hero → agenda → toggle → stats → close-day), telas pequenas com vários compromissos empurram o encerramento do dia e as estatísticas para bem abaixo da dobra.
- **Itens de agenda com até 3 elementos inline (badge categoria + badge conflito + botão iniciar sessão)** tendem a quebrar linha ou espremer o título do compromisso em telas de 360px, prejudicando a leitura rápida do essencial (hora + o quê).
- **Botão "Fechar o dia" centralizado e discreto pode ficar visualmente "perdido" em telas onde a lista de compromissos é longa**, exigindo rolagem para encontrá-lo mesmo quando o usuário já sabe que quer fechar o dia.
- **Nenhum uso aparente de espaço "fixo"/persistente** (ex. um resumo fixo no topo ou uma barra de progresso fixa) — tudo rola junto, típico de "página web longa" e não de "tela de app com foco".

---

## 9. Problemas de consistência

- **Tipografia**: serifada nos números de estatística vs. sans-serif no restante — única página com esse mix, sem justificativa de marca documentada.
- **Espaçamento**: mistura de tokens de espaçamento (`--space-*`) com valores arbitrários em rem só nesta seção da folha de estilos.
- **Botões**: dois `btn-primary` diferentes podem coexistir (Resume/Start) com um `btn-secondary` (Continue) — o sistema de botões da página não segue uma única escala de prioridade visual clara quando mais de um está visível.
- **Badges**: mesma forma visual (pill) usada para significados semanticamente diferentes (categoria informativa vs. alerta de conflito), diferenciando-se só pela cor — insuficiente para leitura rápida (incluindo acessibilidade para daltonismo).
- **Ícones**: uso de ícones no smart card e ausência de qualquer ícone equivalente no hero/CTA ou no "Fechar o dia", tornando o uso de iconografia inconsistente ao longo da própria tela.

---

## 10. Oportunidades de redesign (conceitual, sem código)

1. **Cabeçalho vivo**: fundir título + saudação + data em um único bloco de abertura emocional e informativo (“Boa tarde, Andressa — terça-feira, 30 de julho”), substituindo o `<h1>Hoje</h1>` solto.
2. **Bloco herói unificado**: envolver o CTA de estudo (Resume/Start/Continue) em um contêiner visualmente elevado (cor de fundo distinta, maior respiro), tornando-o inconfundivelmente a única ação "grande" da tela.
3. **Resumo de progresso sempre visível, sem números crus**: uma frase curta acima ou dentro do herói ("Você já estudou 45min hoje — sua meta é 2h") substituindo a necessidade de abrir o disclosure para saber o básico; o disclosure continua existindo para quem quer detalhe.
4. **Compromissos com hierarquia temporal**: destacar visualmente apenas o próximo compromisso (ou o atual, se em andamento) e esmaecer/agrupar os já concluídos, em vez de listar tudo com peso igual.
5. **Redução de badges por item**: mostrar categoria só por cor de borda/faixa lateral (sem pill de texto) e reservar o badge textual apenas para o alerta de conflito, que é raro e deve saltar aos olhos.
6. **Fusão dos 3 stat cards em um resumo compacto único** ("Meta · Tempo · Sessões" em uma única linha/mini-barra), preservando o link para detalhe completo na página de Progresso (evitando duplicar conteúdo entre "Hoje" e "Progresso").
7. **"Fechar o dia" com reforço emocional condicional**: quando o estudante já bateu ou superou a meta, o botão/área ganha um tom visual mais celebrativo (sem virar um card novo) — reaproveitando a paleta de sucesso já existente no design system.
8. **Prioridade unívoca entre Smart Card e CTA**: quando os dois coexistirem, unificar visualmente em uma leitura sequencial clara (alerta acima, ação abaixo, com uma seta/relação visual), nunca como dois blocos desconectados competindo por atenção.
9. **Eliminar affordance de clique falso nos stat cards** (retirar hover-lift/sombra de cards que são somente leitura), reservando esse tratamento para elementos realmente interativos.

---

## 11. Nova proposta de organização da página

Ordem ideal de blocos, do topo para baixo, com justificativa:

1. **Cabeçalho de abertura (saudação + data)** — substitui o `<h1>` genérico. Justificativa: primeira impressão emocional, contextualiza "quando" sem ocupar espaço extra (funde 2 informações redundantes/ausentes em 1 bloco).
2. **Alerta contextual (Smart Card), se houver** — mantido no topo, mas com leitura conectada ao bloco seguinte quando ambos existirem. Justificativa: o que precisa de atenção imediata (atraso, revisão) deve vir antes da ação de rotina.
3. **Bloco herói: ação de estudo + resumo de progresso em 1 frase** — a fusão do CTA com uma linha de progresso textual. Justificativa: resolve simultaneamente "o que faço agora" e "como estou indo", sem introduzir números/cards extras nessa altura da tela.
4. **Compromissos de hoje, com destaque para o próximo/atual** — mantém a lista, mas reordena a ênfase visual por tempo. Justificativa: depois de decidir "o que fazer agora" (estudar), o estudante quer saber "o que vem depois" — ordem natural de raciocínio.
5. **Estatísticas detalhadas (colapsado por padrão, como já é hoje)** — mantido oculto, mas o link/toggle deve deixar claro que é "ver detalhes", já que o resumo básico já apareceu no bloco herói. Justificativa: evita duplicar a pergunta "quanto estudei" já respondida de forma leve acima; preserva a filosofia "mede em silêncio, fala em frases".
6. **Fechar o dia** — mantido por último, como ritual de encerramute, com tom visual adaptado ao progresso do dia. Justificativa: é a conclusão natural da jornada da tela — começar → acompanhar → encerrar.

Essa ordem reduz a quantidade de "unidades de decisão" simultâneas na dobra inicial de 4–5 para efetivamente 2 (alerta, se houver + ação principal com progresso embutido), empurrando agenda detalhada, estatísticas e fechamento para leitura sequencial e opcional.

---

## 12. As 30 decisões de design que mais prejudicam a experiência da página Hoje

*(ordenadas por impacto, da mais para a menos prejudicial)*

1. Ausência de saudação/personalização na abertura da tela.
2. Progresso do dia totalmente invisível sem interação (nenhum resumo textual fora do disclosure).
3. Nenhuma hierarquia temporal nos compromissos (tudo com peso visual igual).
4. Bloco de ação principal (hero) sem destaque estrutural (mesmo container visual do resto da página).
5. Título `<h1>Hoje</h1>` redundante com a navegação, sem agregar contexto (data/dia).
6. Tipografia serifada nos números de estatística sem justificativa de marca clara.
7. Espaçamento não tokenizado na seção `.today-*` (mistura de rem soltos com tokens).
8. Três variações de botão (`Resume`/`Start`/`Continue`) sem sistema visual de prioridade único.
9. Badges de categoria e de conflito com a mesma forma visual (pill), diferenciados só por cor.
10. Estado vazio da agenda com tom neutro, sem reforço positivo.
11. "Fechar o dia" sem sinalização de progresso/conquista antes do clique.
12. Smart Card e CTA sem relação hierárquica clara quando ambos aparecem juntos.
13. Stat cards com hover-lift/sombra sugerindo interatividade que não existe.
14. Falta de indicação de tempo decorrido no botão "Continuar sessão em andamento".
15. Até 3 elementos secundários (badges + botão) por item de compromisso, sobrecarregando a linha.
16. "Fechar o dia" com peso visual quase idêntico a um link secundário comum.
17. Nenhum uso de espaço fixo/persistente — tudo rola em coluna única, sensação de "página", não de "app".
18. Toggle de estatísticas com rótulo genérico ("Ver números de hoje") sem prévia de conteúdo.
19. Texto do botão "Continuar: {título}" potencialmente longo, sem truncamento visual tratado com cuidado tipográfico.
20. Nenhuma diferenciação visual entre compromisso "agora" (em andamento) e "futuro" na lista.
21. Ícones usados no Smart Card mas ausentes no hero e no botão de fechar o dia — linguagem de iconografia inconsistente.
22. Fusão perdida entre "meta diária" e "tempo estudado" — dois cards falam da mesma coisa sob ângulos diferentes.
23. Nenhum sinal visual de que a agenda mostrada é "só de hoje" versus a agenda completa (contexto implícito, não reforçado).
24. Cor azul reaproveitada tanto no CTA principal quanto em badges de categoria, diluindo o significado de "ação" vs. "informação".
25. Nenhuma resposta visual imediata para "tenho algo atrasado?" fora do smart card (que é limitado a 1 e pode não cobrir todos os casos).
26. Falta de estado de transição/feedback visual ao iniciar uma sessão a partir de um item de compromisso (clique "Iniciar sessão").
27. Nenhuma pista visual de sequência/streak de dias na tela principal (só aparece dentro do modal de fechamento).
28. Botão "Fechar o dia" não muda de posição/proeminência mesmo em dias sem nenhum estudo registrado (deveria, potencialmente, se comportar diferente).
29. Falta de agrupamento visual entre a seção de compromissos e a de estatísticas — ambas usam `h2` do mesmo peso, parecendo blocos de igual importância.
30. Nenhum tratamento visual diferenciado para "dia sem nenhum compromisso e sem nenhum estudo ainda" — o estado mais comum de abertura matinal do app não tem uma composição pensada especificamente para ele.

---

## 13. As 30 melhorias com maior impacto visual

1. Criar um bloco de cabeçalho unificado (saudação + data) substituindo o `<h1>` solto.
2. Dar ao bloco herói um tratamento de superfície elevado (fundo distinto, respiro maior).
3. Unificar a linguagem visual dos 3 botões possíveis do hero em uma única lógica de prioridade.
4. Adicionar uma linha de progresso textual within o hero (sem números crus/cards).
5. Redesenhar os itens de compromisso com hierarquia temporal (próximo em destaque, passados esmaecidos).
6. Substituir badge de categoria (pill) por uma faixa/borda lateral colorida mais discreta.
7. Reservar o badge textual apenas para o alerta de conflito (torná-lo visualmente único/urgente).
8. Unificar a tipografia dos números de estatística com o restante da interface (remover serifada isolada) ou justificar/estender essa escolha para toda a tela como identidade visual.
9. Tokenizar todo o espaçamento da seção `.today-*` na escala `--space-*`.
10. Retirar hover-lift/sombra dos stat cards (somente leitura).
11. Fundir os 3 stat cards em um único bloco compacto de resumo.
12. Dar ao botão "Fechar o dia" uma presença visual condizente com um ritual de encerramento (não um link qualquer).
13. Criar variação visual de "Fechar o dia" quando a meta do dia foi atingida (tom de celebração sutil).
14. Adicionar ícone consistente ao hero e ao botão de fechar o dia, alinhado ao uso já existente no smart card.
15. Diferenciar visualmente compromissos de estudo (com atalho "Iniciar sessão") dos demais tipos de compromisso.
16. Redesenhar o estado vazio da agenda com uma ilustração/ícone leve e tom mais positivo.
17. Reduzir a largura de leitura dos itens de compromisso em mobile para evitar quebra de linha do título.
18. Diferenciar visualmente a seção de estatísticas (secundária) da seção de compromissos (primária) via peso tipográfico do `h2`.
19. Adicionar prévia de valor no toggle de estatísticas (ex.: mostrar 1 número-chave já fechado, com o resto expandindo).
20. Suavizar a transição de abrir/fechar o disclosure de estatísticas (hoje é abrupta).
21. Criar hierarquia cromática clara: uma cor para "ação", outra para "informação/categoria", sem sobreposição.
22. Dar destaque visual ao streak de dias já na tela principal, não apenas no modal de fechamento.
23. Ajustar o truncamento tipográfico do botão "Continuar: {título}" para textos longos.
24. Uniformizar o raio de borda (`radius`) entre hero, compromissos e stat cards, hoje com pequenas variações.
25. Reforçar visualmente o item "em andamento" da agenda (se um compromisso estiver ocorrendo agora).
26. Ajustar o contraste dos badges de categoria para acessibilidade consistente (`readableTextColor` já existe — validar uso consistente).
27. Dar tratamento visual mais leve ao container do smart card quando o tipo for "dica"/"sugestão" vs. mais forte para "atenção".
28. Melhorar o espaçamento vertical entre seções para criar respiros de leitura mais claros entre blocos de prioridades diferentes.
29. Ajustar o alinhamento entre ícone e texto no smart card para consistência com outros elementos de ícone+texto da tela.
30. Revisar a paleta usada no modal de "Fechar o dia" para dialogar visualmente melhor com o restante da tela (hoje é o único momento com estilo "escuro/full-bleed").

---

## 14. As 30 melhorias com maior impacto na experiência

1. Adicionar saudação personalizada e contextual à abertura da tela.
2. Exibir progresso do dia (tempo estudado / meta) em texto simples, sempre visível, sem exigir clique.
3. Ordenar/destacar compromissos por proximidade temporal (o que vem agora ou a seguir).
4. Tornar o bloco de ação de estudo inequivocamente o foco único da tela.
5. Adicionar indicação de tempo decorrido no botão de retomar sessão ativa.
6. Resolver a competição entre Smart Card e CTA de estudo com uma leitura sequencial guiada.
7. Reduzir o número de elementos secundários por item de compromisso (menos badges, mais clareza).
8. Melhorar o tom do estado vazio da agenda para reforçar a sensação de liberdade, não de ausência.
9. Sinalizar progresso/conquista do dia antes (ou durante) a decisão de fechar o dia.
10. Diferenciar visualmente compromissos passados de futuros, reduzindo esforço de leitura.
11. Garantir que o texto do botão "Continuar: {título}" nunca quebre a leiturabilidade em telas pequenas.
12. Reduzir a quantidade de decisões simultâneas exigidas do usuário na dobra inicial.
13. Confirmar visualmente quando uma sessão foi iniciada a partir de um compromisso (feedback imediato).
14. Trazer o streak de dias para a tela principal como reforço motivacional contínuo, não só no fechamento.
15. Ajustar copy do toggle de estatísticas para comunicar valor antes do clique ("Ver: 45min estudados hoje").
16. Garantir que o "Fechar o dia" continue de fácil acesso mesmo em dias com agenda longa (não exigir rolagem excessiva).
17. Diferenciar clara e imediatamente compromissos de estudo dos demais tipos, já na primeira leitura da lista.
18. Ajustar a prioridade visual entre "Resume", "Start" e "Continue" para eliminar qualquer ambiguidade de qual clicar.
19. Comunicar de forma mais explícita "isto é hoje" (ex. reforçar no cabeçalho, não deixar implícito).
20. Reduzir a sensação de "página web" ao aproximar o layout de um app nativo (menos scroll, blocos mais compactos).
21. Garantir que o alerta de conflito de horário seja impossível de ignorar, sem depender de leitura atenta da lista.
22. Tornar a transição entre "ver estatísticas" e "voltar à ação principal" mais fluida (sem perder contexto de rolagem).
23. Reduzir a redundância entre a métrica "Hoje em números" e a futura consulta na página de Progresso.
24. Garantir consistência de linguagem entre o resumo do dia e o recap do modal de fechamento (mesmos números, mesma nomenclatura).
25. Ajustar o texto do botão "Iniciar sessão" por compromisso para deixar claro que é um atalho, não uma ação isolada nova.
26. Criar uma transição emocional perceptível entre "dia em andamento" e "dia fechado" (ex. mudança sutil de tom da tela pós-fechamento).
27. Garantir que usuários com dias completamente livres ainda sintam a tela como "acolhedora", não vazia.
28. Diminuir a carga de leitura necessária para entender "quantos compromissos tenho hoje" sem contar itens manualmente.
29. Garantir que decisões de dias anteriores (ex. plano para amanhã, definido no fechamento) fiquem visíveis/reforçadas no dia seguinte.
30. Reduzir o tempo entre abrir o app e iniciar efetivamente uma sessão de estudo ao mínimo de cliques possível (hoje já é baixo — validar que nenhuma mudança futura aumente isso).

---

## 15. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR, e não introduz novas funcionalidades — apenas reorganiza, redesenha ou ajusta o que já existe.

### Etapa 1 — Cabeçalho vivo (saudação + data)
- **Objetivo**: substituir `<h1>Hoje</h1>` por um cabeçalho com saudação personalizada e data/dia da semana.
- **Justificativa**: resolve o problema #1 do diagnóstico (ausência de acolhimento) com o menor esforço técnico possível.
- **Arquivos envolvidos**: `index.html` (`#page-today` header), `todayView.js` (lógica de saudação por horário + nome do usuário), `style.css` (`.page-header` variante).
- **Impacto esperado**: alto impacto emocional/percepção de "app premium", baixo risco.
- **Complexidade**: baixa.
- **Riscos**: mínimo — depende de já existir o nome do usuário disponível na sessão.
- **Critérios de aceite**: cabeçalho exibe saudação contextual por horário (bom dia/boa tarde/boa noite) + nome do usuário + data por extenso; não quebra em 360px.

### Etapa 2 — Resumo de progresso em 1 linha, sempre visível
- **Objetivo**: adicionar uma frase de progresso (tempo estudado / meta) visível sem interação, acima ou dentro do bloco hero.
- **Justificativa**: resolve o problema #2 (progresso invisível) sem reintroduzir cards/números que a página já decidiu esconder.
- **Arquivos envolvidos**: `todayView.js` (`_refreshHero` — consumir dados já usados por `activityDashboardView.js`), `index.html` (`.today-hero`), `style.css`.
- **Impacto esperado**: alto — resolve uma das maiores lacunas de UX sem aumentar carga cognitiva.
- **Complexidade**: média (reuso de dados já calculados para os stat cards).
- **Riscos**: duplicar lógica de cálculo de progresso já existente em `activityDashboardView.js` — mitigar extraindo função compartilhada.
- **Critérios de aceite**: frase aparece sempre (mesmo com 0min estudado, com tom apropriado); não exige clique; dado bate com o que aparece no disclosure expandido.

### Etapa 3 — Elevação visual do bloco herói
- **Objetivo**: dar destaque estrutural (fundo, espaçamento, elevação) ao bloco de ação principal de estudo.
- **Justificativa**: resolve o problema #4 (ausência de hierarquia visual clara).
- **Arquivos envolvidos**: `style.css` (`.today-hero`), `index.html` (wrapper, se necessário).
- **Impacto esperado**: alto impacto visual, reforça foco imediato na ação certa.
- **Complexidade**: baixa.
- **Riscos**: mínimo — mudança puramente visual/CSS.
- **Critérios de aceite**: bloco herói é visualmente o elemento de maior destaque da tela em qualquer estado (resume/start/continue); passa em 360/390/430px sem quebra.

### Etapa 4 — Hierarquia temporal nos compromissos
- **Objetivo**: destacar o próximo/atual compromisso e reduzir destaque de compromissos já passados.
- **Justificativa**: resolve os problemas #3 e #20 do diagnóstico.
- **Arquivos envolvidos**: `todayView.js` (`_refreshAppointments`, `_buildApptItem`), `style.css` (`.today-appt-item` variantes de estado).
- **Impacto esperado**: alto — reduz esforço de leitura da agenda diária.
- **Complexidade**: média (precisa comparar horário atual com cada item, considerando fuso/hora local).
- **Riscos**: cuidado com performance em listas longas e com atualização em tempo real (o "agora" muda ao longo do dia — considerar se precisa de refresh periódico ou só no carregamento).
- **Critérios de aceite**: item mais próximo/futuro se destaca visualmente; itens já concluídos ficam com tratamento visualmente reduzido (sem sumir); conflito continua visível independentemente do estado temporal.

### Etapa 5 — Simplificação de badges nos itens de compromisso
- **Objetivo**: substituir o badge de categoria por uma indicação mais discreta (ex. borda/faixa lateral) e reservar badge textual só para conflito.
- **Justificativa**: resolve os problemas #9 e #15 (excesso de badges, forma visual repetida).
- **Arquivos envolvidos**: `todayView.js` (`_buildApptItem`), `style.css` (`.today-appt-category`, `.today-appt-conflict-badge`).
- **Impacto esperado**: médio-alto — melhora escaneabilidade da lista.
- **Complexidade**: baixa-média.
- **Riscos**: garantir que a cor de categoria continue identificável/acessível sem o texto do pill (checar contraste e daltonismo).
- **Critérios de aceite**: categoria comunicada visualmente sem pill de texto; conflito continua com badge textual destacado; nenhuma perda de informação para o usuário.

### Etapa 6 — Fusão dos stat cards em resumo compacto
- **Objetivo**: substituir os 3 cards (meta, tempo, sessões) por um único bloco compacto dentro do disclosure.
- **Justificativa**: resolve a fusão sugerida na Seção 10, reduz redundância com a página de Progresso.
- **Arquivos envolvidos**: `activityDashboardView.js` (`TODAY_CARD_DEFS` e renderização), `style.css` (`.stat-cards` variante compacta).
- **Impacto esperado**: médio — melhora consistência e reduz peso visual quando expandido.
- **Complexidade**: média (compartilhado com página de Progresso — validar que a mudança não afeta o outro contexto de uso).
- **Riscos**: `activityDashboardView.js` é reutilizado por outra página; garantir que a mudança seja escopada só ao contexto "today" (via prop/flag existente).
- **Critérios de aceite**: bloco expandido mostra as 3 métricas de forma compacta e legível; página de Progresso não é afetada.

### Etapa 7 — Remoção de affordance de clique falso nos stat cards
- **Objetivo**: remover hover-lift/sombra de cards que não são clicáveis.
- **Justificativa**: resolve o problema de UI #6.
- **Arquivos envolvidos**: `style.css` (`.stat-card:hover`).
- **Impacto esperado**: baixo-médio, mas correção rápida e de baixo risco.
- **Complexidade**: trivial.
- **Riscos**: nenhum.
- **Critérios de aceite**: stat cards não exibem mais tratamento visual de "clicável" quando não há ação associada.

### Etapa 8 — Tokenização de espaçamento da seção `.today-*`
- **Objetivo**: substituir valores de rem soltos por tokens `--space-*` existentes.
- **Justificativa**: resolve o problema de consistência #2.
- **Arquivos envolvidos**: `style.css` (todas as regras `.today-*`).
- **Impacto esperado**: baixo visualmente perceptível, alto em manutenibilidade e consistência de longo prazo.
- **Complexidade**: baixa.
- **Riscos**: pequenas variações de espaçamento podem exigir ajuste fino visual pós-mudança.
- **Critérios de aceite**: nenhum valor de espaçamento "mágico" restante na seção; ritmo vertical validado visualmente em 360/390/430px e desktop.

### Etapa 9 — Unificação da linguagem visual dos botões do hero
- **Objetivo**: garantir que Resume/Start/Continue sigam uma única lógica de prioridade visual (cor, peso, tamanho) coerente entre si.
- **Justificativa**: resolve o problema de UI #3 e o de UX #3.
- **Arquivos envolvidos**: `style.css` (`.today-cta`, `.btn-primary`, `.btn-secondary` no contexto do hero), `index.html`.
- **Impacto esperado**: médio — reduz ambiguidade quando mais de um botão está visível.
- **Complexidade**: baixa.
- **Riscos**: mínimo, mudança visual isolada ao hero.
- **Critérios de aceite**: em qualquer combinação de botões visíveis, fica visualmente óbvio qual é a ação recomendada primária.

### Etapa 10 — Reforço visual condicional do "Fechar o dia"
- **Objetivo**: dar ao botão/área de fechamento um tratamento visual mais presente, com variação sutil quando a meta do dia foi atingida.
- **Justificativa**: resolve os problemas #5, #11, #13 e #16 do diagnóstico.
- **Arquivos envolvidos**: `todayView.js` (lógica de estado de meta atingida), `style.css` (`.today-close-day` variantes), `index.html`.
- **Impacto esperado**: alto impacto emocional, reforça a filosofia de "recompensa visual" pedida no briefing.
- **Complexidade**: média (depende de reaproveitar dado de meta já calculado na Etapa 2).
- **Riscos**: cuidado para não tornar o botão "festivo demais" nos dias em que a meta não foi atingida — o tom deve ser neutro/incentivador, nunca punitivo.
- **Critérios de aceite**: botão mantém discrição em dias neutros; ganha reforço visual sutil (não intrusivo) quando meta é atingida; não introduz nova lógica de negócio, apenas reaproveita dado existente.

### Etapa 11 — Revisão de tom do estado vazio da agenda
- **Objetivo**: reescrever/reestilizar o estado "Seu dia está livre" para reforçar uma sensação positiva.
- **Justificativa**: resolve o problema de UX #4.
- **Arquivos envolvidos**: `index.html` (`#today-appointments-empty`), `style.css` (`.list-empty` no contexto today).
- **Impacto esperado**: baixo-médio, ganho de tom emocional pontual.
- **Complexidade**: trivial.
- **Riscos**: nenhum.
- **Critérios de aceite**: novo texto/estilo aprovado, sem alterar a lógica de exibição condicional existente.

---

*Fim da auditoria. Nenhuma alteração de código foi realizada — este documento é exclusivamente diagnóstico e propositivo.*
