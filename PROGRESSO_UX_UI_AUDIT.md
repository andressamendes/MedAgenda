# Auditoria UX/UI — Página "Progresso" (Anoti)

> Escopo: exclusivamente `#page-progress` (index.html) e os módulos que renderizam nela: `activityDashboardView.js`, `constancyHeatmapView.js`, `insightsView.js`, `achievementCelebrationView.js`, `disclosureToggle.js`, e os serviços de dado associados. Nenhum código foi alterado nesta auditoria.
>
> Nota de contexto: esta página já passou por rodadas anteriores de redesign (referenciadas no próprio código como F14.5, V5.17, V5.2, V5.3, F15.13 etc.), que a transformaram de um "dashboard" de 12+ cards soltos em uma composição narrativa (anel + heatmap + frases + disclosure). Esta auditoria parte desse estado atual — já bem mais maduro que um dashboard cru — e busca o próximo nível: fazer a tela parecer um produto premium de hábito diário, não uma versão editada de um relatório.

---

## 1. Objetivo da página

O propósito real da página Progresso não é "mostrar dados de estudo". É responder, em menos de 3 segundos de leitura e sem esforço de interpretação, a uma pergunta emocional central:

**"Eu estou no caminho certo?"**

Essa pergunta se decompõe em, na ordem de importância para um estudante que abre o app todos os dias por anos:

1. **Estou mantendo constância?** (a pergunta mais importante — hábito > desempenho pontual)
2. **Estou evoluindo ou estagnando?** (comparação com o próprio passado, nunca com terceiros)
3. **Estou cumprindo o que planejei para hoje/esta semana?**
4. **Onde estou ficando para trás?** (sinal de alerta, não julgamento)
5. **O que já conquistei até aqui?** (reforço positivo, prova de esforço acumulado)

Perguntas que a página **não** precisa responder (e que, se respondidas com destaque, competem pela atenção das cinco acima): "qual a duração média exata da minha sessão em minutos", "quantas sessões tive este mês em número absoluto", "qual foi minha maior sessão isolada". Essas são métricas de auditoria/BI — legítimas, mas pertencem a uma camada secundária, nunca à primeira dobra.

**Veredito**: a arquitetura atual (narrativa em frases + números atrás de disclosure) já reconhece essa hierarquia em princípio. O problema é de execução: a primeira dobra ainda mistura sinal emocional (anel, heatmap) com o início de uma lista de frases que gradualmente vira leitura densa, e a segunda camada (atrás do disclosure) continua organizada por *fonte de dado* ("Períodos", "Recordes", "Revisões", "Produtividade") em vez de por *pergunta do estudante*.

---

## 2. Diagnóstico geral

### Nota: **6,5 / 10**

Está muito acima da média de um dashboard educacional genérico — a decisão de esconder números atrás de uma narrativa é exatamente a escolha certa e já é rara no mercado. Mas a execução ainda entrega uma experiência de "relatório bem-comportado", não de "aplicativo premium que dá orgulho". Falta the último passo: fazer o topo da página *sentir-se conquistado*, não apenas *informar*.

### Principais problemas

1. A narrativa (`progress-narrative`) é uma pilha de até 5 parágrafos de texto corrido — sem hierarquia tipográfica entre eles — que se lê como um parágrafo de relatório, não como destaques.
2. O anel de meta diária é renderizado **duas vezes** na mesma tela (hero solto + card "Meta diária" atrás do disclosure), o que é uma inconsistência perceptível para quem expande "Ver detalhes" e vê o mesmo número de novo.
3. O streak (sequência de dias) aparece em 3 formas desconectadas na mesma tela — frase de texto, heatmap sem número, e nenhuma ponte visual entre elas — perdendo a chance de ser o elemento mais celebrado da página (é, em qualquer produto de hábito, o KPI emocional nº1).
4. A segunda camada é organizada por *taxonomia de dados internos* ("Períodos", "Recordes", "Conquistas", "Revisões", "Produtividade" — 5 seções, 12+ cards) em vez de por *necessidade do estudante* — carga cognitiva alta para quem só queria confirmar "estou cumprindo o planejado?".
5. Nenhum elemento da tela é clicável/acionável além do disclosure — a página é 100% consulta passiva, quando poderia (sem criar funcionalidade nova) reaproveitar navegação já existente, por exemplo o heatmap poderia ao menos visualmente ancorar-se ao streak.
6. Sem estado de "primeira visita"/dado zerado tratado com calor — a mensagem de fallback ("Não foi possível carregar...", "Não conseguimos carregar suas conquistas agora") é escrita como erro técnico, não como acolhimento a um estudante iniciante que ainda não tem histórico.

### Principais pontos positivos

1. Já elimina a doença mais comum de telas de progresso: BI cru na cara do usuário. Números completos existem, mas por padrão ficam escondidos — é a decisão certa e deve ser preservada.
2. Design system consistente: `.stat-card` é um único componente reaproveitado em toda a página (e no resto do app), sem fragmentação de estilos concorrentes.
3. Paleta e tipografia próprias do produto (não herdadas de framework genérico), com tokens semânticos (success/warning/danger/info) usados de forma coerente nos badges de conquista.
4. Tratamento de erro granular por bloco (Revisões e Produtividade falham/avisam independentemente, com retry), evitando que uma falha parcial derrube a tela inteira.
5. Acessibilidade cuidada: `aria-live`, `role="progressbar"`, `aria-valuenow`, `escapeHtml` em texto livre do usuário — sinal de maturidade técnica que facilita qualquer redesign futuro.

---

## 3. Inventário de componentes

| Componente | Finalidade | Utilidade | Manter | Simplificar | Remover | Redesenhar |
|---|---|---|---|---|---|---|
| **Anel de meta diária (hero)** `progress-goal-ring` | Mostrar % da meta diária cumprida hoje | Alta — é o indicador mais imediato de "hoje" | ✔ | — | — | Sim: dar peso visual de "conquista do dia", não de gauge técnico |
| **Heatmap de constância** `constancy-heatmap` | Mostrar padrão de estudo nas últimas 12 semanas | Alta — é o único elemento "GitHub contributions"-like da tela | ✔ | — | — | Sim: aproximar visualmente do streak numérico |
| **Narrativa em frases** `progress-narrative` (até 5 `<p>`) | Traduzir números em linguagem humana | Alta em conceito, média em execução atual | ✔ | Sim — reduzir a 2-3 frases priorizadas, resto move para camada 2 | — | Sim: variar peso tipográfico por frase (não todas iguais) |
| **Toggle "Ver detalhes"** `progress-numbers-toggle` | Abrir camada de números completos | Alta — é o mecanismo central de baixa carga cognitiva | ✔ | — | — | Renomear para refletir conteúdo real ("Ver todos os números") |
| **Cards "Meta semanal" / "Meta mensal"** (barra linear) | Progresso de metas de médio prazo | Alta | ✔ | Sim — unificar num único bloco "Metas" com 3 barras (dia/semana/mês) em vez de espalhado entre hero e disclosure | — | Sim |
| **Card "Tempo estudado esta semana" + sparkline** | Volume da semana + tendência diária | Média-alta | ✔ | — | — | — |
| **Card "Tempo estudado este mês"** | Volume do mês | Média | ✔ | Sim — fundir com o card semanal num único componente com toggle período | — | — |
| **Card "Sessões na semana"** | Contagem bruta de sessões | Baixa isolada | — | Sim | Considerar remover como card próprio; virar detalhe secundário dentro do card de tempo | — |
| **Card "Sessões no mês"** | Contagem bruta de sessões | Baixa isolada | — | Sim | Idem acima | — |
| **Card "Tempo médio por sessão"** | Métrica de qualidade de sessão | Baixa para a maioria dos estudantes | — | — | Candidato a remoção da visão padrão (métrica de "profissional de produtividade", não de estudante disciplinado) | — |
| **Card "Maior sessão" (Recordes)** | Recorde pessoal | Média — apela ao gamified/orgulho | ✔ | — | — | Redesenhar como "conquista"/badge, não como stat-card neutro |
| **Lista de Conquistas** (5 itens, ícone+estado+barra) | Gamificação / reforço positivo | Alta — é o componente com maior potencial emocional da página | ✔ | — | — | Sim: dar mais destaque visual (hoje tem peso igual a "Sessões no mês") |
| **Bloco "Revisões" (2 cards)** | Pendências de revisão espaçada | Alta — responde "onde focar hoje" | ✔ | Sim — poderia virar 1 frase + 1 link de ação em vez de 2 cards | — | — |
| **Bloco "Produtividade" (2 cards)** | Compromissos executados vs. não | Média | ✔ | Sim — mesma observação acima | — | — |
| **Celebração de conquista** (modal overlay) | Recompensa imediata ao desbloquear conquista | Alta — mecanismo de dopamina já existe, só não é referenciado no fluxo estático da página | ✔ | — | — | — |
| **Estados de erro/vazio** (`list-empty`, `list-error`) | Comunicar falha de carregamento | Necessário, execução fria | ✔ | — | — | Sim: linguagem mais acolhedora, especialmente para "sem histórico ainda" vs. "erro real" |
| **Título de tier** (`Períodos`, `Recordes`, `Conquistas`) | Rotular seções da camada 2 | Baixa — nomenclatura interna, não fala a língua do estudante | — | Sim | — | Sim: renomear por intenção ("Sua semana", "Seus recordes", "Suas conquistas") |

---

## 4. Problemas de UX (por impacto)

1. **A narrativa cresce sem limite e sem hierarquia.** Até 5 frases de peso visual idêntico (mesma fonte, mesmo tamanho) tratam "quanto você estudou" e "revisões pendentes" como igualmente importantes — o usuário tem que ler tudo para saber o que importa. Isso é literalmente o oposto de "informação em poucos segundos".
2. **Nenhuma ligação entre o heatmap e a frase de streak.** São a mesma informação (constância) em dois formatos lado a lado, mas sem nenhum elemento visual (cor, número em destaque, seta) que os conecte — o cérebro precisa fazer a ponte sozinho.
3. **Duplicação real de tela: o anel de meta diária aparece 2x** quando o disclosure é aberto (hero + card "Meta diária"). Para o usuário isso não parece "reforço de acessibilidade" (que é a intenção documentada) — parece que a página não sabe que já mostrou aquilo.
4. **A segunda camada mistura granularidades muito diferentes** (recorde histórico de "maior sessão" ao lado de "sessões no mês", ao lado de conquistas gamificadas, ao lado de revisões pendentes) sob o único gesto "Ver detalhes" — o usuário não sabe o que vai encontrar antes de clicar, e ao clicar recebe tudo de uma vez.
5. **Estados vazios/erro usam tom de sistema, não de produto.** "Não conseguimos carregar suas conquistas agora" e "Não foi possível carregar o resumo desta semana" soam a falha técnica mesmo quando a causa real é "você ainda não tem histórico" (aluno novo) — perde a chance de acolher em vez de alarmar.
6. **Nenhum caminho de ação a partir da tela.** "Revisões pendentes: 3" não linka para a lista de revisões; "matéria X ficando para trás" não linka para o planejamento daquela matéria. A tela informa mas não convida a agir — reduz a motivação de "abrir o app amanhã para resolver isso".

---

## 5. Problemas de UI (por impacto)

1. **Ausência de hierarquia tipográfica na narrativa** — todas as frases usam o mesmo `<p>` e tamanho, competindo por atenção igual.
2. **O anel de meta e o heatmap são visualmente desiguais em "peso"** (SVG pequeno de 64×64 vs. grade de 84 células) sem uma proporção pensada para equilibrar a leitura da dupla no hero.
3. **Achievements usam o mesmo padrão visual (`.stat-card`-like list item) que métricas neutras** — uma conquista desbloqueada deveria ter tratamento visual distinto (cor, destaque, talvez selo) de um card de "tempo médio por sessão"; hoje tudo tem o mesmo peso de cartão cinza.
4. **Barra linear de progresso (metas semanal/mensal) e anel circular (meta diária) coexistem como duas linguagens visuais diferentes** para o mesmo conceito ("% de meta cumprida") sem uma razão perceptível para o usuário — por que dia é círculo e semana é barra?
5. **Sparkline sem qualquer rótulo numérico visível** (só `aria-label` para leitor de tela) — usuário vidente vê barrinhas sem saber a escala, reduzindo a utilidade do gráfico a decoração.
6. **Títulos de seção (`Períodos`, `Recordes`, `Conquistas`, `Revisões`, `Produtividade`) usam vocabulário de banco de dados**, não de produto voltado a estudante — "Recordes" ao lado de "Períodos" soa a nomenclatura de relatório de RH.

---

## 6. Problemas de carga cognitiva

- **Informação demais na segunda camada**: 5 seções, 12+ cards individuais atrás de um único clique — o usuário que só queria "confirmar que está indo bem" recebe uma parede de números ao abrir "Ver detalhes".
- **Métricas que não ajudam decisão alguma**: "Sessões na semana" e "Sessões no mês" como contagens brutas não informam se o estudante está indo bem ou mal (3 sessões podem ser ótimas ou péssimas dependendo da duração/matéria) — são números que exigem contexto extra para significar algo.
- **Métricas que poderiam ser unificadas**: tempo semanal e tempo mensal são a mesma pergunta ("quanto estudei?") em duas janelas de tempo — merecem 1 componente com seletor de período, não 2 cards permanentes lado a lado. O mesmo vale para sessões na semana/mês.
- **Indicador redundante**: "Maior sessão" isolado como único item da seção "Recordes" não justifica uma seção própria — é um dado de recorde que caberia dentro do card de tempo semanal como nota secundária, ou junto das conquistas.
- **Competição por atenção**: no estado expandido, o anel repetido, os 7 cards de "Períodos", 1 card de "Recordes", 5 itens de conquista e 4 cards de insights disputam atenção com peso visual quase igual — nada grita "isto é o mais importante".

---

## 7. Problemas de hierarquia visual

- **Ao abrir a página, os olhos vão primeiro para o par anel+heatmap** (posição correta — é o hero) — isso funciona.
- Mas logo em seguida a narrativa entra como um bloco de texto compacto sem variação de peso, e o olho não sabe se deve continuar lendo ou já parar ali — não há um "ponto de descanso" visual entre o hero (visual, rápido) e a narrativa (textual, mais lenta).
- Dentro da camada expandida, **tudo tem hierarquia igual**: os 5 `<h2>` de tier (`Períodos`, `Recordes`, `Conquistas`, `Revisões`, `Produtividade`) têm o mesmo estilo, criando uma lista plana de seções igualmente "gritantes" — nenhuma delas se destaca como mais importante (quando, pela pergunta do estudante, Conquistas e Revisões deveriam pesar mais que Recordes).
- **Conquistas — o componente com maior potencial de orgulho/motivação da tela — está posicionado no meio da lista de tiers**, sem destaque, disputando espaço com "Recordes" (1 card sem graça).

---

## 8. Problemas de mobile

- A página tem **apenas 1 breakpoint dedicado (480px)**, que só afeta o par anel+heatmap (empilha de `row` para `column`). Todo o resto (narrativa, stat-cards, achievement items, insights) depende inteiramente de CSS Grid `auto-fit`/flexbox naturais, sem ajuste fino de espaçamento/tipografia para telas de 360-390px.
- **Sem breakpoint de tablet** dentro do escopo da página — determina que entre 480px e 767px a tela se comporta de forma não testada explicitamente (herda só o comportamento natural do grid).
- O **heatmap de 12 semanas × 7 dias** não tem nenhuma redução de densidade em mobile — em 360px a grade de 84 células fica com células muito pequenas (`min-width: 8px`), o que compromete tanto legibilidade quanto a área de toque do tooltip nativo.
- Em telas estreitas, a camada expandida ("Ver detalhes") gera **rolagem longa** — 5 seções empilhadas verticalmente sem nenhum agrupamento em abas/carrossel, tornando a experiência mais próxima de "scroll infinito de relatório" do que de app.
- Não há indicação de **quanto conteúdo existe abaixo da dobra** antes de expandir — em mobile, ao clicar "Ver detalhes", o usuário não tem noção de que está prestes a rolar por 5 seções inteiras.

---

## 9. Problemas de consistência

- A página segue bem o design system do restante do produto (mesmo `.stat-card`, mesma paleta, mesmo padrão de disclosure usado também na página "Hoje") — isso é um ponto forte, não um problema.
- **Inconsistência pontual real**: o mesmo dado de meta diária tem 2 representações visuais diferentes na mesma tela (anel solto no hero + o mesmo anel dentro do card "Meta diária" ao expandir) — isso quebra a expectativa de "ao expandir, vejo coisas novas".
- **Nomenclatura de seção inconsistente com o tom do resto do produto**: enquanto a narrativa fala a língua do estudante ("Você estudou 6h30 esta semana"), os títulos de tier falam a língua de um schema de banco ("Períodos", "Recordes") — um desalinhamento de voz dentro da mesma tela.
- O padrão de toggle "Ver detalhes"/"Ver números de hoje" está duplicado quase 1:1 no código entre página Progresso e página Hoje (mesma lógica, funções gêmeas) — não é um problema visível ao usuário, mas indica que a experiência de "expandir números" poderia (e deveria) ser um único padrão de componente reaproveitado, reforçando a consistência a longo prazo.

---

## 10. Oportunidades de redesign (conceitual, sem código)

1. **Elevar o streak a protagonista visual.** Hoje ele é uma frase entre outras cinco. Ele deveria ser o segundo elemento mais visível da tela (depois do anel de hoje), com o heatmap funcionando como "prova visual" da mesma métrica — os dois juntos, com o número do streak sobreposto/adjacente ao heatmap, não como itens paralelos desconectados.
2. **Substituir a "parede de frases" por 1-2 frases de destaque + o resto reclassificado como "detalhe".** Apenas a frase mais relevante da semana (a que muda — "1h a mais que a semana passada" ou "matéria X ficando para trás") deveria ter destaque tipográfico; o resto migra para dentro da camada expandida como texto de apoio dos cards correspondentes.
3. **Unificar a linguagem visual de "% de meta cumprida".** Escolher uma única metáfora (anel OU barra) para dia/semana/mês, variando apenas escala, não o tipo de gráfico — reduz carga de decodificação.
4. **Reorganizar a camada expandida por pergunta do estudante, não por fonte de dado.** Em vez de "Períodos / Recordes / Conquistas / Revisões / Produtividade", agrupar em algo como "Sua semana" (tempo + metas), "Seu foco" (revisões pendentes + matérias atrasadas), "Suas conquistas" (recordes + achievements juntos, é a mesma emoção). Isso reduz de 5 para 3 blocos mentais.
5. **Remover ou rebaixar contagens brutas sem contexto** ("Sessões na semana", "Sessões no mês", "Tempo médio por sessão") da visão principal — viram texto secundário dentro do card de tempo, não cards próprios.
6. **Dar às Conquistas destaque de "vitrine"**, não de lista utilitária — é o componente com maior potencial de orgulho e deveria visualmente parecer uma prateleira de troféus, não uma lista de tarefas.
7. **Tratar estados vazios/erro com tom humano e diferenciado por causa.** "Você ainda não tem histórico — comece uma sessão hoje" (aluno novo, tom de convite) é uma mensagem completamente diferente de "Não foi possível carregar — tentar novamente" (falha técnica real).
8. **Tornar pelo menos os sinais de alerta acionáveis.** Se a narrativa diz "revisões pendentes", isso deveria ser navegável para a lista real (reaproveitando navegação já existente no app, sem nova funcionalidade) — transforma leitura passiva em direção clara do que fazer hoje.

---

## 11. Nova proposta de organização da página

Ordem ideal dos blocos, do topo para baixo:

**1. Hero de constância e meta do dia** (mantém anel + heatmap, mas redesenhado para que o streak numérico apareça sobreposto/adjacente ao heatmap, não apenas na narrativa abaixo).
*Justificativa*: é a resposta mais rápida às perguntas "estou mantendo constância?" e "cumpri hoje?" — deve ocupar a primeira dobra sozinho, sem texto concorrente.

**2. Uma única frase de destaque** (a mais relevante da semana — tendência ou alerta, nunca as duas).
*Justificativa*: preserva a força da narrativa sem transformá-la em parágrafo de leitura obrigatória; o resto das frases atuais (matéria dominante, revisões, produtividade) passam a viver dentro dos blocos correspondentes na camada expandida, como legenda, não como texto solto competindo pela atenção.

**3. Vitrine de conquistas** (movida para logo abaixo da frase de destaque, antes de qualquer número frio).
*Justificativa*: é o elemento de maior carga emocional positiva da página — colocá-lo cedo reforça "orgulho" antes de qualquer análise fria de números, e dá ao estudante um motivo imediato para sorrir ao abrir a tela.

**4. Disclosure único "Ver todos os números"**, contendo 3 blocos (não 5):
   - **"Sua semana"**: tempo semanal/mensal com metas (barra ou anel único, escolha 1 linguagem), sessões e tempo médio como texto secundário dentro do mesmo card.
   - **"Seu foco"**: revisões pendentes + produtividade de compromissos, cada item já acionável (link para a lista real).
   - **"Seus recordes"**: maior sessão e qualquer outro recorde histórico, com tom de celebração (visualmente próximo das conquistas, não de stat-card neutro).
*Justificativa*: reduz de 5 blocos mentais para 3, cada um respondendo a uma pergunta específica do estudante ("como fui essa semana", "o que preciso resolver", "do que me orgulho historicamente") em vez de refletir a arquitetura interna de serviços.

**5. Estado vazio/erro tratado por contexto**, sempre no lugar do bloco que falhou, nunca como bloqueio da página inteira (padrão já existente e correto — manter).

### Redução de informação visível inicialmente

Hoje, a primeira dobra sem clique mostra: anel + heatmap + até 5 frases de narrativa (aprox. 5 blocos de conteúdo). Com a proposta acima, a primeira dobra mostra: anel+heatmap+streak integrado + 1 frase + vitrine de conquistas (aprox. 3 blocos de conteúdo, mais compactos), uma redução de aproximadamente 40% na quantidade de elementos de leitura obrigatória, sem remover nenhum dado — tudo migra para a camada expandida, reorganizada de 5 para 3 seções (redução adicional de 40% na segmentação da camada secundária).

---

## 12. Roadmap de implementação

Cada etapa é independente, cabe em uma única PR, e não introduz funcionalidade nova — apenas reorganiza, simplifica ou redesenha o que já existe.

### Etapa 1 — Unificar a linguagem visual de "% de meta cumprida"
- **Objetivo**: usar uma única metáfora visual (anel ou barra) para meta diária/semanal/mensal, eliminando a duplicação de exibição do anel de meta diária (hero + card).
- **Justificativa**: elimina a inconsistência de UI mais visível da tela (mesmo dado, duas formas diferentes, uma delas repetida).
- **Arquivos envolvidos**: `activityDashboardView.js` (`_progressRingMarkup`, `_progressBarMarkup`, `_goalRingHeroMarkup`, `GOAL_CARD_DEFS`), `style.css` (`.progress-goal-ring*`, `.stat-card-bar*`).
- **Impacto esperado**: reduz confusão visual, sem alterar nenhum dado ou cálculo.
- **Complexidade**: baixa.
- **Riscos**: quebrar o card "Meta diária" atrás do disclosure se ele depender do markup do anel; validar se remover a duplicata não deixa a seção "Metas" vazia visualmente.
- **Critérios de aceite**: meta diária aparece uma única vez na tela (no hero); metas semanal/mensal e diária usam a mesma metáfora visual; nenhum dado ou cálculo foi alterado.

### Etapa 2 — Integrar streak numérico ao heatmap
- **Objetivo**: exibir o número do streak atual diretamente junto/sobre o heatmap de constância, em vez de apenas como frase separada na narrativa.
- **Justificativa**: conecta visualmente as duas representações da mesma métrica (constância), tornando o streak o elemento de maior destaque emocional do hero.
- **Arquivos envolvidos**: `constancyHeatmapView.js`, `progressNarrativeService.js` (fonte do `currentStreak`), `style.css` (`.constancy-heatmap*`).
- **Impacto esperado**: aumenta a percepção imediata de constância/disciplina, sem novo cálculo (reaproveita `getStreakSummary()`/`getStudyCalendar()` já existentes).
- **Complexidade**: baixa-média.
- **Riscos**: nenhum funcional; atenção a acessibilidade (o número deve ser lido corretamente por leitor de tela, hoje já existe `aria-label` no heatmap).
- **Critérios de aceite**: número de dias do streak visível ao lado/sobre o heatmap; frase de streak na narrativa pode ser removida sem perda de informação (já está representada visualmente).

### Etapa 3 — Reduzir a narrativa a 1 frase de destaque
- **Objetivo**: mostrar apenas a frase mais relevante da semana no topo (fora do disclosure); mover as demais frases (matéria dominante, revisões, produtividade) para dentro dos blocos correspondentes na camada expandida.
- **Justificativa**: elimina a "parede de texto" da narrativa e reforça hierarquia visual — 1 frase de destaque com peso tipográfico maior é mais legível que 5 frases iguais.
- **Arquivos envolvidos**: `activityDashboardView.js` (`_narrativeSentences`, `_renderNarrative`), `insightsView.js` (para receber as frases movidas como legenda dos cards de Revisões/Produtividade), `progressNarrativeService.js`.
- **Impacto esperado**: reduz tempo de leitura da primeira dobra, aumenta clareza do que mudou.
- **Complexidade**: média (requer decidir critério de "qual frase é a mais relevante" — pode ser regra simples: alerta > tendência > neutro).
- **Riscos**: perda de contexto se a lógica de priorização escolher mal a frase; validar com casos reais (semana sem dados, semana recorde, etc.).
- **Critérios de aceite**: apenas 1 `<p>` de destaque visível fora do disclosure; as demais informações continuam acessíveis dentro da camada expandida, sem perda de dado.

### Etapa 4 — Mover "Conquistas" para logo após a frase de destaque
- **Objetivo**: reposicionar a lista de conquistas para a primeira dobra (ou logo no topo do disclosure, a mais próxima possível do topo), antes dos blocos de números frios.
- **Justificativa**: prioriza o elemento de maior carga emocional positiva da tela, alinhado ao objetivo de "orgulho e motivação" antes de qualquer análise numérica.
- **Arquivos envolvidos**: `index.html` (ordem dos blocos dentro de `#page-progress`), `activityDashboardView.js` (ordem de renderização, se houver dependência de posição).
- **Impacto esperado**: aumenta sensação de conquista/motivação logo na abertura da tela.
- **Complexidade**: baixa (reordenação de blocos, sem lógica nova).
- **Riscos**: mínimo; validar apenas se a reordenação não quebra `aria-live`/foco de acessibilidade.
- **Critérios de aceite**: lista de conquistas aparece antes dos blocos "Períodos"/"Recordes" na leitura vertical da página.

### Etapa 5 — Redesenhar visualmente as Conquistas como "vitrine"
- **Objetivo**: dar tratamento visual distinto (destaque, cor, talvez layout tipo grade/prateleira) às conquistas, diferenciando-as dos stat-cards neutros.
- **Justificativa**: reforça design emocional — uma conquista desbloqueada deve parecer um troféu, não uma linha de lista igual às demais.
- **Arquivos envolvidos**: `activityDashboardView.js` (`_achievementItemMarkup`, `_achievementsMarkup`), `style.css` (`.achievement-*`).
- **Impacto esperado**: maior percepção de "produto premium" e reforço positivo.
- **Complexidade**: média (é a etapa com mais trabalho visual/CSS).
- **Riscos**: garantir que o novo layout continue acessível (roles, contraste) e responsivo em mobile.
- **Critérios de aceite**: conquistas visualmente distintas dos demais cards da página; estados bloqueada/em progresso/concluída continuam claros; funciona em 360-430px sem quebra de layout.

### Etapa 6 — Reagrupar a camada expandida em 3 blocos por pergunta do estudante
- **Objetivo**: substituir a estrutura atual "Períodos / Recordes / Conquistas / Revisões / Produtividade" por "Sua semana / Seu foco / Seus recordes" (conquistas já movidas na etapa 4).
- **Justificativa**: reduz carga cognitiva reorganizando por intenção do usuário, não por origem técnica do dado.
- **Arquivos envolvidos**: `index.html` (estrutura de `#progress-numbers-body`), `activityDashboardView.js` (`WEEK_MONTH_CARD_DEFS`, `RECORDS_CARD_DEFS`, título de tiers), `insightsView.js` (posicionamento dos blocos de Revisões/Produtividade dentro do novo agrupamento).
- **Impacto esperado**: reduz de 5 para 3 seções mentais, mantendo 100% do dado.
- **Complexidade**: média-alta (reorganização estrutural, embora sem novo cálculo).
- **Riscos**: maior risco de regressão visual por ser a mudança estrutural mais ampla; testar cuidadosamente todos os estados (loading, erro, vazio) de cada bloco após reagrupamento.
- **Critérios de aceite**: 3 seções nomeadas por intenção do estudante; todos os dados anteriores continuam presentes e acessíveis; nenhum cálculo ou serviço foi alterado.

### Etapa 7 — Rebaixar/fundir métricas de contagem bruta sem contexto
- **Objetivo**: remover "Sessões na semana" e "Sessões no mês" como cards próprios; movê-los como texto secundário dentro do card de tempo correspondente. Avaliar remoção de "Tempo médio por sessão" da visão padrão.
- **Justificativa**: elimina métricas que, isoladas, não ajudam o estudante a decidir nada — reduz densidade de cards sem perder o dado (que pode virar detalhe/tooltip).
- **Arquivos envolvidos**: `activityDashboardView.js` (`WEEK_MONTH_CARD_DEFS`, `_cardsMarkup`).
- **Impacto esperado**: menos cards na camada expandida, foco maior nos indicadores que geram decisão.
- **Complexidade**: baixa.
- **Riscos**: algum usuário avançado pode sentir falta da contagem exata; considerar manter acessível via tooltip/detalhe expansível dentro do card de tempo, não removida de vez.
- **Critérios de aceite**: nenhum card isolado de contagem bruta sem contexto; dado continua disponível como texto secundário.

### Etapa 8 — Humanizar estados vazios/erro
- **Objetivo**: diferenciar mensagens de "sem histórico ainda" (aluno novo, tom de convite) de mensagens de "falha real de carregamento" (tom neutro + ação de retry), em vez do texto genérico atual.
- **Justificativa**: melhora design emocional na primeira experiência do estudante e evita alarme falso.
- **Arquivos envolvidos**: `activityDashboardView.js` (`_achievementsMarkup`, `_renderNarrative` fallback), `insightsView.js` (mensagens de erro/notice), possivelmente `stateView.js`.
- **Impacto esperado**: melhora acolhimento de novos usuários e reduz percepção de "app quebrado" em telas vazias legítimas.
- **Complexidade**: baixa (é majoritariamente cópia/texto e uma condicional a mais para diferenciar "vazio por falta de dado" de "vazio por erro").
- **Riscos**: mínimo; cuidado para não confundir os dois casos (checar se já existe distinção no dado retornado pelo serviço, senão precisa expor essa distinção).
- **Critérios de aceite**: mensagens de estado vazio (sem histórico) e de erro real (falha de rede) são visualmente e textualmente diferentes; retry continua funcionando nos casos de erro real.

### Etapa 9 — Tornar sinais de alerta acionáveis (linkar para telas existentes)
- **Objetivo**: transformar menções a "revisões pendentes" e "matéria ficando para trás" em links/atalhos para as telas/listas reais já existentes no app (sem criar nenhuma tela nova).
- **Justificativa**: converte leitura passiva em direção de ação, aumentando a chance do estudante voltar amanhã para resolver o que foi sinalizado.
- **Arquivos envolvidos**: `insightsView.js`, `activityDashboardView.js` (frases/cards de Revisões e Produtividade), navegação existente (`showPage`/rotas já implementadas para revisões/compromissos).
- **Impacto esperado**: aumento de engajamento/retorno diário via ação direta a partir da tela de Progresso.
- **Complexidade**: média (depende de mapear corretamente a navegação já existente para o contexto certo, ex.: filtro por matéria).
- **Riscos**: garantir que o link leve exatamente ao contexto certo (ex.: revisões pendentes daquela matéria, não uma lista genérica) para não frustrar a expectativa criada pelo texto.
- **Critérios de aceite**: pelo menos os itens "revisões pendentes" e "compromissos sem sessão" são clicáveis e levam à tela/lista correta já existente no app.

---

## Princípios para a página Progresso

- O estudante nunca deve precisar ler mais que 1 frase de destaque antes de saber se está indo bem ou precisa agir.
- O indicador de constância (streak) é sempre o elemento mais celebrado da tela — nunca compete em peso visual com contagens neutras.
- Números completos sempre existem, mas nunca aparecem por padrão: ficam a 1 clique de distância, nunca a zero.
- Nenhum dado aparece em mais de uma forma visual na mesma tela sem uma razão perceptível pelo usuário — se duplicar, que seja intencional e visualmente justificado, não incidental.
- Gráficos (anel, heatmap, sparkline) substituem números crus sempre que a forma visual comunicar tendência mais rápido que o texto — nunca decoram sem informar.
- Comparações são sempre com o próprio passado do estudante (semana anterior, recorde pessoal), nunca com outros usuários ou médias externas.
- A camada expandida é organizada por pergunta do estudante ("como fui", "onde focar", "do que me orgulho"), nunca por origem técnica do dado.
- Todo sinal de alerta ou pendência exibido é, sempre que possível, uma porta de entrada clicável para resolvê-lo — não apenas uma constatação.
- Conquistas e recordes têm sempre tratamento visual de celebração, distinto de métricas neutras de auditoria.
- Estados vazios de estudante novo nunca soam como erro — soam como convite.
- A tela deve caber, em sua primeira dobra, inteiramente em uma viewport de 390px sem rolagem — tudo além disso pertence à camada expandida.
