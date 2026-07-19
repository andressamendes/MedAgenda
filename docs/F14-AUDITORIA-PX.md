# F14 — Auditoria de Product Experience (PX)
## Tornando o Anoti a ferramenta principal do estudante

**Produto:** Anoti
**Data:** 19/07/2026
**Solicitada como:** "F13 — Auditoria de Product Experience". Numerada **F14** neste repositório porque F13.1–F13.7 já designam o ciclo anterior (redução de carga cognitiva, design system, reorganização de telas), todo mergeado em `main`.
**Método:** leitura completa das telas (`index.html`, todas as views JS) e dos fluxos reais de interação — não do código como engenharia, mas do que o estudante vê, decide e digita a cada dia. Nenhum bug foi procurado; nenhuma arquitetura foi avaliada.
**Ponto de partida:** o produto está tecnicamente maduro e visualmente consistente (F12/F13 cumpridos). Esta auditoria responde outra pergunta: **por que o estudante abriria o Anoti todos os dias — e o que hoje o impede.**

---

## Sumário executivo

O Anoti venceu a batalha da consistência e perdeu, por enquanto, a batalha da identidade.

Três achados estruturam tudo o que segue:

1. **O app abre na tela errada.** O estudante chega para estudar e o Anoti o recebe com um calendário de compromissos (`navigationView.js:128` — a home é sempre a Agenda). Estudar — a única ação que justifica o produto — está a 4–6 interações de distância, atrás de uma navegação, um botão, um modal com duas abas e um campo de texto obrigatório.

2. **O produto virou aquilo que sua própria visão proíbe.** `docs/VISAO_DO_PRODUTO.md` declara fora do escopo: *"planner de produtividade, diário ou journal, sistema de gestão de estudos"*. O Anoti de hoje tem Dashboard, Progresso, Diário, streaks, conquistas, marcos da evolução, seis análises de IA, questões com quatro tipos e três dificuldades. Nada disso é ruim em si — mas o produto cresceu sem que a visão fosse reescrita, e o resultado é um híbrido: uma agenda que administra estudos, não um ambiente que produz estudo.

3. **O software registra o estudo; ainda não acompanha o estudante.** O dia de estudo real tem um arco — chegar, decidir o que estudar, estudar, registrar, refletir, encerrar. No Anoti esse arco está fatiado em cinco telas que não se encadeiam: a reflexão mora no Diário (dias depois, se o estudante lembrar), o plano mora atrás de um disclosure na Agenda, o encerramento não desagua em lugar nenhum. Cada etapa funciona; a jornada não flui.

A resposta ao critério final está no fim do documento. Adianto: **é "não" — ainda.** Mas a distância até o "sim" é curta, porque o problema não é excesso de software a construir; é excesso de software a esconder, e um punhado de costuras entre etapas que já existem.

---

## 1. Tempo entre abrir o Anoti e começar a estudar

**Fluxo atual, medido em interações** (usuário recorrente, sessão avulsa — o caso diário mais comum):

| # | Ação | Custo |
|---|---|---|
| 1 | App abre na **Agenda** (calendário da semana) | tela de administração, não de estudo |
| 2 | Clicar em **Sessão** na sidebar/bottom-nav | 1 clique |
| 3 | Clicar em **Iniciar sessão** | 1 clique |
| 4 | Modal: escolher aba (**Novo estudo** × **Compromisso da agenda**) | 1 decisão (às vezes 1 clique) |
| 5 | **Digitar o nome do estudo** (obrigatório, campo livre) | 5–15 s de digitação + decisão de nomenclatura |
| 6 | Clicar em **Iniciar sessão** | 1 clique |

Total: **4–5 cliques + 1 texto digitado + 2 decisões**, todos os dias, antes do primeiro segundo de cronômetro. Para comparação: no Things, "começar o dia" é abrir o app — a lista *Today* já está lá; no TickTick, o timer está a um toque dentro da própria tarefa.

**O que aumenta esse tempo, exatamente:**

- **A home é a Agenda.** Para quem estuda todos os dias, o calendário é consulta ocasional; o estudo é a ação diária. A hierarquia está invertida.
- **O nome do estudo é obrigatório e sempre digitado do zero.** `studySessionView.js` não oferece nenhuma sugestão de estudos recentes (verificado: não há reuso de títulos anteriores no modal de início). O estudante que revisa Cardiologia cinco dias seguidos digita "Revisão de Cardiologia" cinco vezes — ou começa a digitar "asdf", corroendo o valor do próprio histórico.
- **Não existe "retomar".** O produto sabe qual foi o último estudo, qual compromisso de estudo existe hoje na agenda, qual revisão está agendada — e não usa nada disso para propor o próximo passo. O chip de sessão ativa no header (`activeSessionIndicatorView.js`) resolve o retorno *durante* uma sessão; nada resolve o retorno *entre* dias.

**Meta:** do estado "app aberto" ao cronômetro rodando em **1 clique** no caso comum (retomar/continuar o estudo previsto) e **2 cliques** no caso novo. Ver fases F14.1 e F14.2 do roadmap.

---

## 2. Decisões exigidas do usuário

Inventário das decisões por fluxo diário, com veredito:

**Iniciar sessão** — hoje: aba (2 opções) + nome (texto livre) + 4 campos opcionais atrás de "Mais opções". Veredito: o nome pode ser **sugerido** (últimos estudos, compromisso de hoje, revisão pendente — em chips de um toque); a aba dupla pode desaparecer quando houver compromisso de estudo hoje (pré-seleção automática). A decisão certa a exigir é *"o quê"* apontado, não *"o quê"* redigido.

**Registrar questão** — o caminho rápido ("Registrar questão respondida", 1 clique) existe e é excelente. Mas está **dentro de um painel lateral, atrás de um disclosure colapsado** (`#ss-panel` → "Questões Resolvidas" → "Mostrar" → botão). O estudante resolvendo um bloco de 40 questões precisa do painel aberto o tempo todo ou de 3 cliques por sessão só para chegar ao botão. O formulário detalhado (tipo/status/dificuldade/matéria/tópico = 5 decisões) está corretamente escondido — mas o caminho rápido merece estar na superfície da tela de sessão, não a dois níveis de profundidade.

**Encerrar sessão** — resumo + observações opcionais + confirmar. Adequado. O problema é o que **falta** aqui (ver §7): a reflexão, que foi parar em outra tela, em outro dia.

**Criar compromisso** — o QuickAdd (`quickAdd.js`: título + hora, Enter salva) é o melhor componente do produto sob o critério desta auditoria. Porém só é alcançável clicando na grade da semana; o botão "+ Novo compromisso" abre o formulário completo (10+ campos). A decisão padrão deveria ser sempre a leve.

**Refletir** — hoje exige: ir ao Diário → localizar a sessão → expandir → "Adicionar reflexão" → digitar → salvar. Cinco passos para um hábito que só sobrevive se custar um.

---

## 3. Tela por tela: ajuda a estudar ou a administrar?

| Tela | Veredito | Observação |
|---|---|---|
| **Agenda** (semana/mês) | Administrar | Necessária — mas é consulta, não home. Os smart cards no topo (`#wk-tip`) e o plano da semana são o software falando sem ser perguntado (ver §5) |
| **Compromissos** (lista) | Administrar | **Redundante como destino de navegação**: é o mesmo dado da Agenda em forma de lista, com busca/filtro/ordenação. Uso real: raro (achar um compromisso antigo). Não merece um dos 5 lugares da bottom-nav |
| **Sessão** | **Estudar** | A única tela de estudo do produto — e é a terceira na hierarquia da sidebar, atrás do grupo "Compromissos" |
| **Dashboard** | Administrar | Pós-F13.4 ficou mínimo (grade "Hoje" + link). Ainda assim: cards de números respondem "quanto", nunca "e daí?" |
| **Progresso** | Administrar | Grades de stat-cards (Períodos, Conquistas, Revisões, Produtividade) — a tela mais próxima de um painel de BI no produto (ver §10) |
| **Diário** | Meio a meio | Ler o próprio percurso é parte do estudar. Mas as abas Concluídas/**Canceladas**/Todas e o painel "Analisar" com ~10 filtros (categoria, tipo/status/dificuldade de questão, 5 flags "Somente", duração) transformam um diário em uma ferramenta de query |
| **Assistente IA** | Administrar | 6 análises sob demanda. Bem contido pós-F13.7; o excesso está na quantidade de opções, não na apresentação |

Conclusão: **1 tela de estudo, 5 de administração.** A proporção correta para a persona seria a inversa — e ela se conquista não criando telas novas, mas rebaixando as administrativas a "ferramentas" acessadas sob demanda.

---

## 4. Excesso de funcionalidades — o que quase nunca é usado diariamente

Já corretamente escondidos (nenhuma ação): Calendários Acadêmicos, Categorias, importação/exportação ICS, Diagnóstico, Modo Desenvolvedor, configurações de push.

Ainda expostos demais:

- **Aba "Canceladas" do Diário** — sessões canceladas são ruído histórico; ninguém as folheia diariamente. Deveriam ser um filtro dentro de "Todas", não uma das três abas permanentes.
- **Filtros do painel "Analisar"** — filtrar o diário por *status de questão* ou *dificuldade* é caso de uso de pesquisador, não de estudante. Busca + período cobrem 95% do uso real.
- **6 ações de IA** — "Resumir minha semana", "Analisar conflitos", "Recomendações", "Minha Evolução" se sobrepõem entre si e com o Progresso. Duas ações fortes (Planejar minha semana; Como estou indo) entregariam mais do que seis médias.
- **Ordenação de Compromissos** ("Título A–Z") — administração pura.
- **Formulário detalhado de questão** (4 tipos × 3 status × 3 dificuldades + matéria + tópico) — corretamente escondido, mas seu simples volume sugere que o modelo de dados dirigiu a UI. O uso diário é o contador de um toque.

---

## 5. Distrações — tudo que interrompe o foco

- **Smart cards na Agenda** (`weekView.js` → `getDecisions()` → `#wk-tip`): a cada carga da home, o Decision Engine pode exibir cards "Atenção/Dica/Meta/Revisão" — inclusive de teor negativo ("baixa execução recente", "muito tempo sem sessões"). É a primeira coisa que o estudante lê no dia. **Um card acionável vale ouro; uma fileira de avisos é um feed.** E abrir o dia com uma crítica automatizada é design comportamental invertido: pune quem voltou.
- **Badges e contadores**: `ss-panel-badge`, contador de filtros ativos, contagens nos títulos das seções — individualmente inofensivos, somados criam um rodapé de "coisas pendentes" permanente.
- **Toasts** de confirmação em ações triviais.
- **A própria navegação durante a sessão ativa**: com o cronômetro rodando, sidebar, header, IA e bottom-nav continuam inteiramente disponíveis e visíveis. A tela de sessão é limpa (F13 fez bem esse trabalho), mas está emoldurada por um app inteiro convidando à dispersão. Nenhum modo foco existe.

---

## 6. Carga cognitiva

Decisões que o estudante ainda precisa tomar e que o software poderia tomar por ele:

1. **"Como chamo este estudo?"** — todos os dias, campo livre obrigatório (§1).
2. **"Sessão avulsa ou de compromisso?"** — a aba dupla do modal de início pergunta uma coisa que a agenda do dia já responde.
3. **"Onde vejo como estou indo?"** — três respostas concorrentes: Dashboard, Progresso, Diário→Analisar (+ IA "Minha Evolução"). Quatro superfícies para uma pergunta.
4. **"Onde registro o que aprendi?"** — Observações (no encerramento) × Reflexão (no Diário) é uma distinção de modelo de dados exposta ao usuário. Para o estudante, é tudo "o que ficou desta sessão".
5. **"Qual das 6 análises de IA eu quero?"** — menu de escolha onde caberia uma resposta.

---

## 7. O fluxo diário ideal — e onde ele quebra

```
Chegar → Planejar → Estudar → Registrar → Refletir → Encerrar
```

| Etapa | Onde vive hoje | Quebra |
|---|---|---|
| Chegar | Agenda (calendário) | Recebe com administração; nenhum "seu dia" |
| Planejar | Plano da semana atrás de disclosure na Agenda; IA no header | Escondido; não conectado ao ato de começar |
| Estudar | Sessão | OK em si — mas a 4+ interações da chegada |
| Registrar | Painel lateral, seções colapsadas | Caminho rápido enterrado (§2) |
| Refletir | **Outra tela, outro dia** (Diário → sessão → expandir → adicionar) | A quebra mais grave: o momento natural da reflexão é o encerramento, com a memória quente. O produto pede que ela aconteça depois, por iniciativa própria — ou seja, não acontece |
| Encerrar | Modal de resumo → volta ao estado vazio da Sessão | O dia não fecha: nenhum desfecho, nenhum "até amanhã", nenhuma ponte para o dia seguinte |

O arco existe em pedaços; falta a costura. As fases F14.1 (chegada), F14.3 (reflexão no encerramento) e F14.8 (fechamento do dia) tratam exatamente das três quebras.

---

## 8. Minimalismo — onde estão os ~30% desnecessários

Hipótese confirmada. Inventário do que pode sumir ou recuar sem perda de valor diário:

| Item | Ação proposta |
|---|---|
| Página Compromissos como destino de 1º nível | Virar visão "Lista" dentro da Agenda (aba, como Semana/Mês) |
| Aba "Canceladas" do Diário | Filtro dentro de "Todas" |
| Filtros de questão no Diário (tipo/status/dificuldade) | Remover; manter busca + período + "com reflexão" |
| 4 das 6 ações de IA | Consolidar em 2 |
| Grades de stat-cards do Progresso (~12 cards) | 1 narrativa semanal + cards atrás de "ver números" |
| Ordenação A–Z de compromissos | Remover |
| Selector de status/tipo no formulário rápido de questão | Já escondido — manter |
| Smart cards múltiplos na Agenda | Máximo 1, apenas se acionável hoje |
| Aba dupla do modal de início de sessão | Auto-resolver pela agenda do dia |

---

## 9. Progressive disclosure

O padrão já é bem aplicado *dentro* das telas (disclosures de F13 por toda parte). O que falta é progressive disclosure **do produto inteiro**:

- Usuário na 1ª semana deveria ver: Hoje, Sessão, Diário. Dashboard/Progresso só fazem sentido com ≥1 semana de dados — poderiam nascer ocultos e "desbloquear" (como o Apple Health só mostra tendências após dias de uso).
- O painel de questões abre com **as duas seções colapsadas** — dentro de um painel que o usuário acabou de pedir para abrir. Disclosure dentro de disclosure é o padrão certo aplicado uma vez demais (o próprio F10 PR11 já havia identificado esse anti-padrão nos filtros do Diário).

---

## 10. Foco — existe tela que parece dashboard de BI?

**Sim: Progresso.** Quatro blocos de grades de cartões numéricos (Períodos, Progresso e Conquistas, Revisões, Produtividade — ~12 stat-cards). É informação real, mas no formato errado: números soltos delegam ao estudante a tarefa de interpretá-los.

O modelo certo é o Apple Health/Fitness: **uma frase que interpreta, não uma grade que reporta.** "Você estudou 11h esta semana — 2h a mais que a anterior. Cardiologia concentrou metade do tempo." Três frases assim substituem as quatro grades para 95% das consultas; os números continuam existindo atrás de um "ver detalhes".

---

## 11. Velocidade — passos por ação essencial

| Ação | Hoje | Meta |
|---|---|---|
| Criar compromisso (QuickAdd via grade) | 2 campos + Enter ✅ | manter; estender ao botão "+ Novo" |
| Criar compromisso (botão "+ Novo") | formulário completo (10+ campos visíveis) | abrir o QuickAdd, "Mais opções" expande |
| Iniciar sessão | 4–5 cliques + digitação | 1–2 cliques, zero digitação no caso comum |
| Registrar questão respondida | 3 cliques (painel → mostrar → botão) na 1ª vez | 1 clique, botão na tela de sessão |
| Registrar reflexão | 5 passos, em outra tela, outro momento | 0 passos extras: campo no encerramento |
| Consultar diário | 1 clique ✅ | manter |
| Retomar estudo (sessão ativa) | 1 clique via chip ✅ | manter |
| Retomar estudo (novo dia) | inexistente — recomeça do zero | 1 clique ("Continuar Cardiologia") |

---

## 12. Consistência

Pós-F13, a consistência visual é real: um sistema de abas, um padrão de disclosure, um painel lateral reutilizado (IA/Questões/Analisar/Histórico), um `.btn-primary` por tela. Este ponto está resolvido e deve ser protegido.

Restam inconsistências **de linguagem**, não de componente:

- A sessão avulsa exibe seu nome sob o rótulo **"Compromisso"** (`#ss-event-title`) — mesmo quando não há compromisso nenhum. O vocabulário da agenda vazou para o domínio do estudo.
- "Observações" × "Reflexão" (§6): dois nomes para o registro pós-estudo, distinguidos por tabela de origem, não por necessidade do usuário.
- O Diário alterna entre duas visões com densidades diferentes (rica para concluídas, compacta reaproveitada do histórico para canceladas) — coerente por dentro, mas perceptível como "dois módulos" na mesma página.

---

## 13. Experiência emocional

**O que gera leveza hoje:** estados vazios didáticos e gentis; chip de sessão ativa (segurança de "não perdi nada"); QuickAdd; a tela de sessão ativa limpa com o cronômetro como protagonista; confirmação de encerramento com resumo digno.

**O que gera peso:** chegada administrativa (calendário + avisos antes de qualquer convite ao estudo); cards de "Atenção" automáticos sobre baixa execução — culpa computada, servida na home; a sensação de *prestar contas* ao registrar (formulários, painéis, filtros) em vez de *deixar rastro*; ausência de qualquer desfecho — o app nunca diz "pronto, seu dia está encerrado", então nunca há a recompensa do fechamento (o *shutdown ritual* que Sunsama transformou em produto).

Em uso prolongado, o saldo atual tende a **neutro-administrativo**: o Anoti não cansa, mas também não puxa. Ferramentas diárias sobrevivem por hábito emocional — o fechamento do dia e a continuidade ("continuar de onde parei") são os dois ganchos ausentes.

---

## Auditoria filosófica

**O Anoti hoje é um software de produtividade, não um ambiente de estudo.** Pelos seguintes sinais objetivos:

1. A home é um calendário (gestão de tempo), não o estudo de hoje.
2. A hierarquia de navegação lista "Compromissos" antes de "Sessão".
3. Mede-se e exibe-se muito (12+ stat-cards, conquistas, marcos, streaks, 6 análises) e interpreta-se pouco.
4. O vocabulário dominante é de gestão: compromisso, categoria, filtro, status, período, dashboard.
5. O ciclo emocional do dia (começar → terminar) não existe; existe o ciclo do dado (criar → consultar).

Um ambiente de estudo inverte cada sinal: abre no estudo, mede em silêncio, fala em frases, e fecha o dia. Nenhuma dessas inversões exige funcionalidade nova — exigem rearranjo do que já existe.

---

## Benchmark conceitual

- **Things** — a lição do *Today*: uma lista única e finita define o dia; todo o resto do app é bastidor. O Anoti não tem um "hoje" — tem uma semana.
- **Sunsama** — a lição do **ritual**: planejar de manhã e encerrar à noite são cerimônias de 60 segundos com começo, meio e fim. É o modelo exato para as quebras dos §7.
- **Motion** — a lição da decisão automática: o sistema decide *quando*, o usuário decide *se*. O Anoti tem os motores (planningService, decisionEngine) mas os usa para comentar, não para decidir.
- **TickTick** — a lição do timer embutido: cronômetro a um toque de distância do item, não em outra página.
- **Apple Health** — a lição da narrativa sobre a grade: anéis e frases ("você costuma fechar seus anéis às terças"), nunca tabelas cruas na superfície.
- **Linear** — a lição da velocidade como estética: a ferramenta parece rápida porque cada ação frequente tem custo mínimo. O QuickAdd é o único componente do Anoti nesse padrão.
- **Craft / Arc / Apple Calendar** — a lição do silêncio: o software só fala quando perguntado. Os smart cards da home violam isso diariamente.
- **Todoist / Google Calendar** — a lição do custo de entrada: linguagem natural e defaults fortes; nunca um formulário completo como primeiro contato.

---

# Roadmap F14 — a jornada diária como eixo

Fases pequenas, independentes, uma PR cada, ordenadas por impacto na jornada. Nenhuma remove dados ou lógica de domínio; todas rearranjam superfície.

---

### F14.1 — Tela "Hoje" como porta de entrada

- **Objetivo:** o app abre no dia do estudante, não no calendário.
- **Problema resolvido:** chegada administrativa; distância entre abrir e estudar (§1, §7-Chegar).
- **Justificativa centrada no usuário:** quem estuda todos os dias precisa de uma resposta imediata a "o que eu faço agora?" — não de uma grade semanal para interpretar.
- **Estratégia:** nova página leve "Hoje": compromissos de hoje (dados já disponíveis em `eventService.getEventsByRange`), botão primário único **"Começar a estudar"**, e — quando existir — "Continuar: {último estudo}". Vira o destino inicial em `navigationView.js` e o primeiro item da navegação. Agenda permanece intocada como segunda tela. No máximo **um** smart card, somente se acionável hoje (a fila do decisionEngine já é ordenada).
- **Arquivos:** `index.html`, `navigationView.js`, nova `todayView.js`, `style.css`, `script.js`.
- **Impacto esperado:** tempo abrir→estudar cai de 4–6 interações para 1–2; a identidade do produto muda na primeira impressão diária.
- **Complexidade:** média.
- **Critério de aceite:** login abre em "Hoje"; iniciar estudo a partir dela em ≤2 cliques; zero regressão na Agenda; máximo 1 card informativo visível.

### F14.2 — Início de sessão sem digitação

- **Objetivo:** eliminar o nome digitado e a escolha de aba do caso comum.
- **Problema resolvido:** decisão de nomenclatura diária + aba dupla (§1, §2, §6).
- **Justificativa:** o produto já sabe o que o estudante provavelmente vai estudar (últimos títulos de sessão, compromisso de estudo de hoje, revisão agendada); exigir redação é transferir ao usuário um custo que o dado já pagou.
- **Estratégia:** no modal de início, acima do campo de texto, chips de um toque: últimos 3 estudos distintos (consulta às sessões recentes já carregáveis por `activitySessionService`) + compromisso de hoje + revisão pendente. Tocar um chip preenche e habilita iniciar imediatamente; o campo livre permanece para casos novos. A aba "Compromisso da agenda" só aparece se houver compromisso elegível.
- **Arquivos:** `studySessionView.js`, `index.html`, `style.css`, `activitySessionService.js` (leitura).
- **Impacto:** início em 2 cliques, zero digitação no caso recorrente; títulos ficam consistentes (melhora todo o resto: diário, estatísticas, busca).
- **Complexidade:** média.
- **Critério de aceite:** com histórico existente, iniciar sessão sem tocar o teclado; sem histórico, fluxo atual intacto.

### F14.3 — Reflexão no encerramento

- **Objetivo:** costurar Registrar→Refletir→Encerrar num único momento.
- **Problema resolvido:** a quebra mais grave do fluxo diário (§7): reflexão em outra tela, outro dia.
- **Justificativa:** reflexão só vira hábito se acontecer com a memória quente e custo zero de navegação; no Diário ela depende de iniciativa espontânea.
- **Estratégia:** no modal de resumo (`#ss-finish-modal`), um único campo de texto com rótulo unificado ("O que ficou desta sessão?"), opcional, gravando em `studyReflectionService` (a distinção Observações×Reflexão deixa de ser exposta; observações continuam suportadas na leitura do Diário). O Diário passa a ser leitura + edição eventual.
- **Arquivos:** `studySessionView.js`, `index.html`, `studyReflectionService.js` (chamada existente), `studyJournalView.js` (rótulos).
- **Impacto:** taxa de sessões com reflexão sobe de "quase nenhuma" para "a maioria"; o Diário ganha conteúdo sem pedir nada.
- **Complexidade:** baixa.
- **Critério de aceite:** encerrar sessão com reflexão em um único fluxo, sem visitar o Diário; reflexão aparece normalmente no Diário.

### F14.4 — Registrar questão em um toque na tela de sessão

- **Objetivo:** o contador rápido de questões na superfície da sessão ativa.
- **Problema resolvido:** caminho rápido enterrado em painel + disclosure (§2, §9).
- **Estratégia:** botão "+1 questão" (com contador visível) diretamente no card `#ss-active`, ao lado do gatilho do painel; o painel e o formulário detalhado permanecem como estão para quem quer granularidade. Seções do painel abrem expandidas (remover o disclosure interno — um nível de porta já foi atravessado).
- **Arquivos:** `studySessionView.js`, `index.html`, `style.css`.
- **Impacto:** registrar 40 questões deixa de exigir painel aberto/3 cliques iniciais; o dado de questões (que alimenta Progresso e Diário) passa a ser alimentado de fato.
- **Complexidade:** baixa.
- **Critério de aceite:** questão registrada com 1 clique a partir da sessão ativa; painel abre com seções expandidas.

### F14.5 — Progresso narrativo

- **Objetivo:** substituir a superfície de BI por interpretação.
- **Problema resolvido:** §10 — grades de números que delegam a análise ao usuário; três superfícies concorrentes de "como estou indo" (§6).
- **Estratégia:** o topo de Progresso vira um resumo narrativo de 2–3 frases (tempo da semana × semana anterior, categoria dominante, sequência) — os cálculos já existem em `activityDashboardService`/`insightsService`/`studyStreakService`; falta só a redação por template. As grades atuais recuam para um disclosure "Ver números". Dashboard "Hoje" é absorvido pela tela Hoje (F14.1) e a entrada "Dashboard" sai da navegação.
- **Arquivos:** `index.html`, `activityDashboardView.js`, `insightsView.js`, `navigationView.js`, `style.css`.
- **Impacto:** uma única resposta, em linguagem humana, para "como estou indo"; −1 destino de navegação.
- **Complexidade:** média.
- **Critério de aceite:** Progresso abre com narrativa sem nenhuma grade visível; números completos a 1 clique; navegação sem "Dashboard".

### F14.6 — Silenciar o software

- **Objetivo:** o Anoti só fala quando perguntado, ou quando há uma ação para hoje.
- **Problema resolvido:** §5 — feed de avisos na home, cards de culpa automática.
- **Estratégia:** teto de 1 smart card por dia, apenas tipos acionáveis (revisão pendente, compromisso atrasado); suprimir cards de teor crítico-passivo ("baixa execução", "muito tempo sem sessões") da exibição espontânea — continuam disponíveis dentro da análise de IA sob demanda. Consolidar as 6 ações de IA em 2 ("Planejar minha semana", "Como estou indo") mantendo os motores internos.
- **Arquivos:** `weekView.js`/`todayView.js`, `smartCardView.js`, `aiPanelView.js`, `index.html`.
- **Impacto:** a chegada diária deixa de abrir com crítica; a IA vira resposta, não menu.
- **Complexidade:** baixa–média.
- **Critério de aceite:** nunca mais de 1 card espontâneo; nenhum card negativo espontâneo; painel IA com 2 ações.

### F14.7 — Menos superfícies: Lista na Agenda, Diário com 2 abas

- **Objetivo:** remover destinos duplicados (§3, §8).
- **Estratégia:** "Compromissos" vira aba "Lista" dentro da Agenda (Semana/Mês/Lista), liberando um lugar na bottom-nav (que passa a: Hoje, Agenda, Sessão, Diário, Mais); aba "Canceladas" do Diário vira filtro dentro de "Todas"; filtros de questão (tipo/status/dificuldade) removidos do painel Analisar.
- **Arquivos:** `index.html`, `navigationView.js`, `studyJournalView.js`, `style.css`.
- **Impacto:** −1 página, −1 aba, −3 filtros; navegação espelha a jornada (Hoje→Agenda→Sessão→Diário).
- **Complexidade:** média.
- **Critério de aceite:** todo dado de Compromissos acessível pela aba Lista; sessões canceladas acessíveis via filtro; suíte de testes verde.

### F14.8 — Fechar o dia

- **Objetivo:** dar desfecho ao arco diário (§7-Encerrar, §13).
- **Problema resolvido:** o dia nunca termina; falta a recompensa do fechamento e a ponte para amanhã.
- **Estratégia:** após confirmar o encerramento da última sessão do dia (ou via ação na tela Hoje), um recap de 15 segundos: tempo total de hoje, questões, sequência — e um campo opcional "primeiro estudo de amanhã" (que alimenta o "Continuar" da F14.2). Uma tela simples, não um relatório.
- **Arquivos:** `todayView.js`, `studySessionView.js`, `studyStreakService.js` (leitura), `index.html`, `style.css`.
- **Impacto:** cria o gancho de hábito (fechamento hoje → abertura pronta amanhã) que nenhuma estatística substitui.
- **Complexidade:** média.
- **Critério de aceite:** encerrar o dia em ≤2 cliques; a escolha de amanhã aparece como chip no início da próxima sessão.

### F14.9 — Modo foco

- **Objetivo:** durante a sessão, o app desaparece.
- **Problema resolvido:** §5 — sessão ativa emoldurada pelo app inteiro.
- **Estratégia:** na sessão ativa, opção "Foco" que oculta sidebar/header/bottom-nav, deixando cronômetro + "+1 questão" + Pausar/Finalizar; Esc restaura. Só CSS + um toggle de classe.
- **Arquivos:** `studySessionView.js`, `style.css`, `index.html`.
- **Impacto:** o produto literalmente sai da frente do estudo — a materialização do princípio máximo desta auditoria.
- **Complexidade:** baixa.
- **Critério de aceite:** modo foco alternável; sessão segue funcional (pausa, questões, finalizar); estado não persiste de forma a prender o usuário.

**Ordem sugerida:** F14.3 e F14.4 (baixa complexidade, alto impacto, zero risco estrutural) → F14.1 → F14.2 → F14.6 → F14.5 → F14.7 → F14.8 → F14.9.

---

# Critério final

**"Se um estudante altamente disciplinado utilizasse o Anoti todos os dias durante um ano, o software desapareceria e deixaria apenas o estudo em evidência?"**

**Não — ainda não.** E os motivos, em ordem de peso:

1. **O software se apresenta antes do estudo, todos os dias.** A home é um calendário com avisos; o estudo está a 4–6 interações. Um software que desaparece começa pelo estudo e guarda a administração para quando for pedida.
2. **O software cobra redação diária.** Nomear cada sessão do zero é um imposto de digitação que, ao longo de um ano, é pago ~300 vezes — ou sonegado, corrompendo o próprio histórico que o resto do produto exibe.
3. **O software fatia o ritual.** Refletir mora longe de encerrar; planejar mora atrás de um disclosure; o dia nunca fecha. Sem arco, o uso diário é uma série de visitas a telas, não um hábito com começo e fim — e hábitos sem fechamento não geram vontade de voltar.
4. **O software fala demais e interpreta de menos.** Cards espontâneos (inclusive críticos), 12+ stat-cards, 6 análises, badges: muito output, pouca resposta. O estudante disciplinado de um ano teria aprendido a ignorar tudo isso — e ignorar partes do produto é o primeiro estágio do abandono.
5. **O software ainda usa a língua da gestão.** "Compromisso", "status", "filtro avançado", "dashboard" — depois de um ano, o usuário se sentiria um bom *operador do Anoti*, não necessariamente um estudante mais focado.

A boa notícia é estrutural: **nenhum desses cinco motivos exige construir algo grande.** Os dados, os motores e o design system já existem e estão maduros (F12/F13 fizeram esse trabalho). O que falta é curadoria e costura — abrir no lugar certo, sugerir em vez de perguntar, juntar reflexão a encerramento, falar uma frase em vez de doze números, e calar o resto. É exatamente isso que o roadmap F14 acima faz, em nove PRs pequenas.

Cumprido o F14, a resposta honesta à pergunta muda para: *o estudante abriria o Anoti, tocaria em "Continuar Cardiologia", estudaria, tocaria "+1" quarenta vezes, escreveria uma frase ao encerrar e fecharia o dia — sem em nenhum momento pensar no software.* Isso é desaparecer.
