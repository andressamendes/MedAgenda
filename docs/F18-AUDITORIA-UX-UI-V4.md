# F18 — Auditoria UX/UI V4: transformar o Anoti em um produto comercial

**Produto:** Anoti — ambiente diário de estudo para estudantes de Medicina
**Data:** 23/07/2026
**Método:** leitura completa de `index.html` (1627 linhas), `style.css` (4644 linhas) e de 30+ views/serviços JS relevantes (Hoje, Agenda, Sessão, Diário, Progresso, Configurações, Conta, Categorias, Calendário Acadêmico, Auth, Onboarding, IA, diálogos). Comparação linha a linha entre o comentário/intenção documentada no próprio código e o comportamento real. Nenhuma funcionalidade nova foi cogitada; o critério em toda a auditoria foi remover, unificar ou corrigir o que já existe.
**Ponto de partida:** as rodadas F10–F17 (documentadas em `docs/F14-AUDITORIA-PX.md` e no `CHANGELOG.md`) já resolveram um problema estrutural real — o app abria no calendário, exigia digitação para tudo, fatiava o ritual diário em telas desconectadas. Isso está corrigido: hoje o Anoti abre em "Hoje", sugere em vez de perguntar, tem modo foco e fecha o dia. Esta auditoria não repete nenhum achado do F14. Ela responde a uma pergunta diferente: **por que, mesmo com esse trabalho de produto feito, o app ainda "cheira a IA"** — e a resposta não está mais na arquitetura da jornada, está na execução visual e em costuras que ninguém revisitou depois de prontas.

---

## Nota geral do produto

### 6,2 / 10

A divergência entre as duas metades da nota explica o porquê:

- **Pensamento de produto: ~8,5/10.** O Decision Engine, o modo foco, a reflexão unificada no encerramento, o Progresso narrativo, os chips de sugestão — tudo isso é trabalho de produto sênior, bem documentado, com testes. Poucos apps desse porte têm esse nível de reflexão sobre carga cognitiva.
- **Execução visual e de sistema: ~4,5/10.** É exatamente aqui que mora o "aspecto amador" citado no briefing. Um produto comercial se declara profissional pela **coerência que sobrevive a mudanças** — e o Anoti tem hoje 21 tamanhos de fonte crus coexistindo com 5 tokens, 9 tamanhos de ícone, 4 componentes de "cartão" com raios e sombras diferentes, uma paleta inteira (IA) fora do design system, e pelo menos duas telas com bugs de navegação/vocabulário visíveis na primeira olhada (a página Progresso é inalcançável; "Todas" aparece duas vezes com dois significados na mesma tela do Diário).
- Cada rodada de auditoria anterior resolveu o problema que foi procurado e, ao fazer isso, **adicionou uma peça nova ao sistema sem reconciliá-la com as peças antigas** — o painel de IA trouxe uma paleta própria; o F17 trouxe um emoji como indicador de status num app que até então só usava SVG; o F14.5 removeu a única entrada de navegação para "Progresso" sem perceber. Isso é o padrão clássico de "várias mãos, nenhuma varredura final de coerência" — e é textualmente o que o briefing descreve como "aspecto de interface gerada por IA".

A boa notícia, coerente com as auditorias anteriores: nada do que segue exige inventar produto novo. É poda, fusão e correção de costura — o mesmo tipo de trabalho que já funcionou nas rodadas F13–F17, aplicado agora à camada visual em vez de à camada de fluxo.

---

## Principais problemas encontrados

Ordenados por impacto na sensação de "produto profissional" e no uso diário real.

1. **A página "Progresso" é inalcançável.** Nenhum item de navegação (sidebar, bottom-nav, atalho de teclado) leva a `#page-progress`. Todo o trabalho de F14.5 (Progresso narrativo) está morto para qualquer usuário real.
2. **"Todas" significa duas coisas diferentes na mesma tela do Diário** — aba de status (`Concluídas`/`Todas`) e chip de período (`Hoje`/`Semana`/`Todas`), empilhados a 37 linhas de distância um do outro.
3. **O painel "Analisar" do Diário mistura filtro com leitura.** Estatísticas + filtros de período/categoria/flags convivem com "Marcos da Evolução" e "Resumos Semanais" — dois blocos de prosa — sob um rótulo ("Analisar") que só descreve metade do conteúdo.
4. **O sistema de tipografia está de fato caótico**, não hierárquico: 21 valores de `font-size` diferentes no CSS, sete deles quase indistinguíveis entre 12–14,5px, coexistindo com apenas 5 tokens oficiais — dos quais só 37 das 158 declarações realmente usam.
5. **A paleta do Assistente de IA vive fora do design system**: cinco cores (índigo/violeta/ciano) nunca tokenizadas, um botão inteiro (`.btn-ai`) que não é usado em lugar nenhum, e um gradiente que não existe em nenhuma outra parte do produto — é a "ilha visual" mais visível do app, e é literalmente a feição mais nova (a mais recente a receber uma varredura de coerência).
6. **Quatro componentes de "cartão" competem pela mesma função** (`.card`, `.ss-card`, `.modal-card`, `.smart-card`) com três raios de borda e três sistemas de sombra diferentes — sem que nenhuma tela realmente precise dessa variação.
7. **O rótulo "Compromisso" nunca muda para sessão avulsa.** Uma sessão sem evento vinculado mostra "Compromisso: Revisão de Cardiologia" — o nome que o próprio estudante digitou, rotulado como se fosse um item da agenda.
8. **`eventFormView.js` reintroduz crítica passiva por fora do Decision Engine.** O modal de compromisso monta seus próprios "smart cards" sem passar por `filterSpontaneousDecisions()` — inclusive um card de tom "atenção" ("Última sessão desta categoria há N dias") que o resto do produto decidiu, deliberadamente, nunca mostrar sem ser pedido.
9. **Registro de questões pede quantidade/erros duas vezes.** O atalho rápido e o formulário "+ Adicionar com detalhes" são dois pares de campos independentes — abrir o detalhado descarta o que já foi digitado no rápido.
10. **Nove tamanhos de ícone** para o que deveria ser uma escala de 3–4 degraus; três ícones de "fechar" (modal, painel, toast) com tamanhos diferentes sem razão funcional.
11. **"Notificações locais" e "Notificações Push"** são duas seções técnicas paralelas no lugar de uma única decisão do usuário ("quero lembretes, sim ou não").
12. **O botão "Excluir" tem o mesmo peso visual de baixo contraste que um botão secundário** — a ação mais destrutiva do formulário de evento não parece destrutiva.

---

## Problemas críticos (P0)

Bloqueiam a sensação de produto profissional — porque são erros visíveis na primeira semana de uso, não detalhes de acabamento.

### P0.1 — Página Progresso sem porta de entrada
`navigationView.js` inclui `"progress"` em `APP_PAGES` e o próprio comentário do arquivo afirma que a página é "alcançável pelo botão 'Mais'" — isso não é verdade no HTML atual: a sidebar/drawer mobile só lista Hoje, Agenda, Sessão, Diário, Calendários Acadêmicos e Categorias. Não existe nenhum elemento com `data-page="progress"` em `index.html`, nem atalho de teclado. `showPage()` faz fallback silencioso para "Hoje" sempre que recebe um nome fora de `APP_PAGES` — então qualquer tentativa indireta de chegar lá (ex. um link antigo) simplesmente devolve o usuário para "Hoje" sem aviso. Resultado: todo o trabalho de "Progresso narrativo" (F14.5) — a peça que substituiu 12+ stat-cards por uma interpretação em frases — está morto em produção. Isso não é um problema de polimento: é uma feature inteira que não existe para o usuário.

### P0.2 — "Todas" com dois significados na mesma tela
No Diário, a aba de status (`data-status="all"`) e o chip de período (`data-period="all"`) mostram o mesmo texto "Todas" um logo abaixo do outro. Um mesmo produto usando a mesma palavra para "todos os status" e "todo o período de tempo" na mesma tela é o tipo de ambiguidade que um usuário nota mesmo sem conseguir nomear o motivo do desconforto — e é o oposto do "o usuário sabe imediatamente onde olhar" que a hierarquia deveria garantir. Piora com um terceiro rótulo para o mesmo período no `<select>` interno do painel ("Todo o período") — três textos para o mesmo estado.

### P0.3 — Painel "Analisar" mistura categorias de interação incompatíveis
Dentro de `#sj-panel` (título único: "Analisar"), na mesma rolagem: estatísticas agregadas → filtro de período → filtro de categoria → 5 controles "Somente"/duração → **Marcos da Evolução** (leitura) → **Resumos Semanais** (leitura). Os dois últimos blocos não são coisas que se "analisam" ajustando um controle — são textos gerados que o usuário lê. O próprio código admite (via comentário) que eles foram parar ali por falta de outro lugar, não por pertencerem semanticamente a um painel de filtros. Um painel cujo nome promete uma coisa e entrega outra é exatamente o tipo de decisão que faz um produto parecer montado por partes, não desenhado.

### P0.4 — Sistema tipográfico sem hierarquia real
Cento e cinquenta e oito declarações de `font-size` no CSS, das quais 121 são valores literais fora dos 5 tokens (`--font-size-xs/sm/md/lg/xl`). No cluster mais crítico (12–14,5px) coexistem sete valores praticamente indistinguíveis a olho nu (`.75rem`, `.78rem`, `.8rem`, `.82rem`, `.85rem`, `.88rem`, `.9rem`) sem nenhum padrão de quando usar qual. Títulos de subseção que deveriam parecer irmãos (`.ss-questions-title`, `.sj-week-summary-title`, `.sj-detail-title`, `.dash-tier-title`) têm quatro tratamentos visuais diferentes de peso/tamanho/cor para o mesmo papel hierárquico. Isso é, ponto a ponto, o "pouca hierarquia visual" e "muitas decisões visuais inconsistentes" citados no briefing — não é uma opinião de gosto, é uma medição direta do CSS.

### P0.5 — A paleta da IA está fora do design system
`.btn-ai`, `.ai-panel-title`, `.ai-panel-icon`, `.ai-action-btn:hover`, `.ai-result-title`, `.ai-loading-spinner` usam cinco hex codes (`#6366f1`, `#8b5cf6`, `#06b6d4` e variações) que não existem em nenhuma outra parte do produto e não têm custom property própria — nem se ajustam ao tema escuro pelo mesmo mecanismo que todo o resto do app usa. Isso cria uma "zona" do produto que visualmente pertence a outro aplicativo. É também o tipo de decisão típica de features de IA "coladas" por cima de um design system existente sem reconciliação — a marca registrada do "aspecto gerado por IA" que o briefing pede para caçar.

---

## Problemas importantes (P1)

Afetam bastante a experiência diária, mas não quebram a primeira impressão como os P0.

- **Rótulo "Compromisso" vazando para sessão avulsa** (`ss-event-title`) — ver achado #7 acima. Confunde a natureza da sessão (evento agendado vs. estudo livre) justamente na tela mais usada do produto.
- **`eventFormView.js` reintroduz crítica passiva por fora do Decision Engine** — quebra o princípio "silêncio como política" já adotado em `todayView.js`/`weekView.js`, e cria uma inconsistência visual: o mesmo dado ("categoria negligenciada") aparece como card calmo ("dica") quando passa pelo motor central e como card de alerta ("atenção") quando o formulário de evento o monta por conta própria.
- **Registro de questões duplicado** (atalho rápido × "+ Adicionar com detalhes") — quem resolve um bloco de 40 questões e quer registrar matéria/tópico precisa redigitar quantidade e erros que já tinha preenchido segundos antes. Ruim especificamente para o caso de uso mais repetitivo do produto.
- **Seletor manual "Compromisso da agenda" no início de sessão mostra data desatualizada** para compromissos recorrentes — usa `getEvents()` bruto (data-base da série) em vez do mesmo `expandEvents()` que já resolve corretamente a ocorrência de hoje no chip de sugestão ao lado. Dentro do mesmo modal, duas fontes de verdade diferentes para "quando é esse compromisso".
- **Quatro componentes de "cartão"** (`.card`/`.ss-card`/`.modal-card`/`.smart-card`) com três raios e três sistemas de sombra — nenhuma diferença funcional justifica a variação.
- **Nove tamanhos de ícone** sem escala — inclusive três "X" de fechar (modal/painel/toast) com tamanhos diferentes.
- **"Notificações locais" vs. "Notificações Push"** — distinção técnica exposta como se fosse uma decisão de produto; o rótulo não comunica a diferença real ("app aberto" vs. "app fechado"), só a descrição secundária faz isso, texto de erro duplicado literalmente entre as duas seções.
- **Exclusão de conta tem menos fricção que troca de senha.** Trocar senha exige reautenticação completa (senha atual); excluir a conta inteira (irreversível) passa só por um `confirmDialog` padrão — mesmo `danger: true` visual usado para "remover foto de perfil".
- **`.btn-danger` é um "soft button"** (fundo tinta clara, nunca preenchimento sólido) — o mesmo peso visual de qualquer botão secundário, para a ação mais irreversível da tela.
- **Duas gerações de texto narrativo formulaico** (Progresso narrativo e "Resumos Semanais" do Diário) respondendo à mesma pergunta ("como foi meu estudo") com templates rígidos de poucas variações — nenhuma delas de fato "interpreta", ambas são relatórios com conectivos.
- **Cinco superfícies diferentes** respondem "quanto estudei"/"como estou indo" (Progresso, stat-cards de Hoje, stats de questões do Diário, Marcos/Resumos do Diário, IA "Como estou indo") sem nenhuma referência cruzada entre elas — e com pelo menos duas definições diferentes de "semana" coexistindo (segunda-feira-a-hoje no Progresso vs. "últimos 7 dias corridos" no Diário) usando o mesmo rótulo "Semana".
- **Indicador de execução do compromisso só existe em tooltip na visão Mês**, mas é texto visível/tocável na visão Semana — mesma informação, dois níveis de acessibilidade dentro da mesma página "Agenda".
- **Emoji (🟢🟡🔴) como indicador de status de acerto** — único ponto do produto que abandona o sistema de ícones SVG centralizado (`icons.js`) em favor de emoji solto.

---

## Problemas de refinamento (P2)

Polimento — cada um pequeno isoladamente, mas a soma é o que trai um produto como "quase pronto" em vez de "pronto".

- Cor de perigo duplicada em duas variáveis (`--red` legado + `--color-danger*` semântico) coexistindo.
- `var(--yellow-light, #fef08a)` referencia uma variável que não existe — o fallback hardcoded é, na prática, sempre o valor usado, e não muda no tema escuro.
- `.toast-warning` com cor de texto hardcoded (`#b45309`) — único toast que não se adapta ao tema escuro.
- Cinco variações de `letter-spacing` (.01/.02/.04/.05/.06em) e cinco tamanhos de fonte para o mesmo padrão visual de "rótulo em caixa alta" (16 seletores).
- `border-radius: 999px` hardcoded em 5 lugares em vez de `var(--radius-full)`; `4px`/`3px` soltos abaixo do menor token oficial (`--radius-sm` = 6px).
- Seis durações de transição diferentes (.12/.15/.18/.2/.25/.3s) contra os três tokens oficiais.
- `@keyframes spin` e `@keyframes ai-spin` são byte-idênticos — duplicação só para dar nome diferente ao spinner da IA.
- `.btn-ai` é CSS morto — nunca aplicado a nenhum elemento real.
- Rótulos de status inconsistentes: "Executando" (badge ao vivo) vs. "Em andamento" (histórico do mesmo status); "Questão registrada" (atalho rápido) vs. "Questão adicionada"/"Questão atualizada" (formulário detalhado) — mesma ação, vocabulário diferente.
- `source: "quick"` com rótulo "Rápida" nunca produzido por nenhum caminho atual do app — vocabulário órfão de uma versão anterior, ainda exposto como rótulo possível no histórico.
- Onboarding tour aponta para uma página ("dashboard") que não existe mais desde o F14.5 — o passo cai silenciosamente em "Hoje" e ainda exibe o texto "Dashboard".
- `accountView.js`/`diagnosticModal.js`/`authView.js` reimplementam "carregando…"/erro com texto solto em vez do padrão central (`stateView.js`/`skeletonView.js`) usado no resto do produto.
- Seletor de cor nativo (seletor de cor do sistema operacional) em três telas diferentes (Categorias, Calendários Acadêmicos, Eventos Acadêmicos) em vez de uma paleta curada — mais decisão do que a tarefa exige, mais pesado em mobile.
- Ações de Revisão (associar/criar) não disparam toast de confirmação, enquanto as ações equivalentes de Questão, na mesma tela, têm toast dedicado.
- Atalho de teclado "N" (novo compromisso) funciona em qualquer página, não só na Agenda onde está anunciado — inofensivo, mas contraria a promessa visual do atalho.
- `.app-title` no header usa `1.05rem`, um valor que não corresponde a nenhum dos tokens de tamanho de fonte oficiais.

---

## Componentes candidatos à remoção

- **"Resumos Semanais" do Diário** — segunda geração de texto narrativo formulaico sobre a mesma pergunta que o Progresso já responde; template rígido, baixo valor incremental sobre olhar os números direto.
- **`.btn-ai` (CSS)** — nunca usado, remover ou aplicar de fato.
- **Distinção de rótulo "Notificações locais" vs. "Notificações Push"** como duas seções — vira uma decisão só (ver Fluxos).
- **`source: "quick"` / rótulo "Rápida"** em `SESSION_SOURCE_LABELS` — vocabulário morto, sem nenhum caminho do produto que o produza hoje.
- **A segunda ocorrência textual de "Ver números"** só se persistir a redundância entre Progresso e "Hoje em números" depois que Progresso for reconectado à navegação (P0.1) — reavaliar se as duas grades continuam necessárias ou se uma pode remeter à outra.

## Componentes candidatos à unificação

- **`.card` / `.ss-card` / `.modal-card` / `.smart-card`** → uma base de "superfície elevada" compartilhando radius/sombra, com modificadores só para as diferenças reais de cor de fundo/borda.
- **Sistema de ícones** → reduzir os 9 tamanhos crus para 3–4 tokens (ex.: `--icon-sm` 16px, `--icon-md` 18–20px, `--icon-lg` 24px); os três ícones de "fechar" (modal/painel/toast) passam a usar o mesmo tamanho.
- **Badges/contadores** (`.sj-toolbar-badge`, `.ss-status-badge`, `.session-history-status`, `.review-status`) → uma única API visual (padding fluido + `var(--radius-full)`); hoje só `.sj-toolbar-badge` diverge com tamanho fixo em px.
- **Rótulos "eyebrow" em caixa alta** (16 seletores, 5 tamanhos, 5 letter-spacings) → uma classe utilitária única.
- **Notificações locais + Push** → um único toggle de "Lembretes"; o app decide o mecanismo (local vs. push) por trás.
- **Formulário rápido e formulário detalhado de questões** → um único fluxo progressivo: os campos de quantidade/erros já preenchidos no atalho rápido são herdados quando "+ Adicionar com detalhes" é aberto, em vez de reiniciar.
- **Três mecanismos de disclosure diferentes fazendo o mesmo trabalho** — o padrão `aria-expanded` + chevron "Mostrar/Ocultar" (majoritário), o botão de texto simples "+ Repetir" (recorrência do formulário de evento) e o `<details>/<summary>` nativo (Marcos da Evolução, Resumos Semanais) deveriam convergir para um único padrão visual — o chevron já estabelecido em todo o resto do app.
- **Anéis de foco** (`--focus-ring` padrão vs. anéis próprios de `.input-error`/`.input-success` vs. ausência total em `.cat-edit-name`) → uma linguagem de foco única, com validação comunicada por cor de borda/ícone, não por um segundo sistema de anel.
- **Variáveis de cor de perigo** (`--red` legado + `--color-danger*`) → migrar todos os usos de `--red` para o sistema semântico.

---

## Fluxos que podem ser simplificados

- **Iniciar sessão vinculada a um compromisso de hoje** tem hoje três custos de clique diferentes para o mesmo resultado: 1 clique (lista em "Hoje"), 2 cliques (chip "Hoje: X" no modal), 3+ cliques (aba manual "Compromisso da agenda", que além de mais lenta mostra data desatualizada para recorrências). Proposta: corrigir a aba manual para usar a mesma expansão de recorrência do chip (elimina a inconsistência) e considerar se a aba manual ainda precisa existir como opção de primeira classe, já que o chip cobre o caso comum.
- **Registrar questões em um bloco grande** — unificar rápido/detalhado para que abrir "mais detalhes" continue de onde o atalho rápido parou, não reinicie.
- **Painel "Analisar" do Diário** — separar filtro de leitura: o painel mantém só estatísticas + filtros; Marcos da Evolução e Resumos Semanais (se este último sobreviver à remoção proposta) voltam a viver perto da própria timeline, onde fazem sentido como conteúdo e não como "resultado de um filtro".
- **Notificações (Configurações)** — de duas perguntas técnicas para uma pergunta de produto: "Quero lembretes" sim/não; o sistema escolhe o mecanismo.
- **Exclusão de conta** — aumentar a fricção para pelo menos o mesmo nível de "Alterar Senha" (reautenticação), já que hoje é a ação com menor barreira relativa ao seu próprio risco.
- **Cor de categoria/calendário acadêmico/evento acadêmico** — trocar o seletor de cor nativo (pesado em mobile, decisão de matiz/saturação livre) por uma paleta curada de 8–10 cores em swatch, suficiente para diferenciar categorias visualmente.
- **Corrigir a navegação para "Progresso"** antes de qualquer outra mudança nessa página — sem isso, qualquer trabalho de polimento em Progresso não chega a ninguém.

---

## Melhorias Mobile

- **Header sem regra de encolhimento em telas ≤375px.** Quando há sessão de estudo ativa, `.header-right` acumula chip de sessão (sem qualquer regra de ocultação/abreviação em nenhum breakpoint) + botão de IA + avatar/nome/chevron — nenhum desses elementos tem `text-overflow`/ocultação condicional; risco real de estouro horizontal exatamente no cenário mais comum do produto (estudando no celular).
- **Faixa 481–767px é "mobile de navegação, desktop de respiro"**: a sidebar já virou drawer e o bottom-nav já apareceu (abaixo de 767px), mas o padding do conteúdo só é reduzido abaixo de 480px — uma faixa de ~280px de largura com navegação mobile e espaçamento ainda pensado para telas maiores.
- **Rótulo do bottom-nav no menor tamanho de fonte do app** (~10px) com cor "muted" — é a navegação primária do modo mobile, deveria ter pelo menos o mesmo peso que qualquer outro texto funcional, não o mais leve de todos.
- **Indicador de execução do compromisso só em tooltip na visão Mês** — inacessível por toque; a visão Semana da mesma página já resolve isso mostrando o texto inline.
- **Seletor de cor nativo do sistema operacional** para categorias — abre uma UI pesada do SO para uma escolha simples; pior em mobile que em desktop.
- **`<select>` "Compromisso" sem filtro de data/ordenação** no modal de início de sessão — lista crescente e sem tratamento de recorrência é particularmente ruim como `<select>` nativo longo em touch.
- **Grade semanal com `min-width: 480px`** força scroll horizontal em qualquer viewport menor — decisão documentada e consciente no CSS, mas vale reavaliar se a persona (majoritariamente mobile) não seria mais bem servida por uma visão de lista/dia como padrão em telas estreitas, com "Semana" como opção secundária.

---

## Melhorias de acessibilidade

- **`.cat-edit-name` (renomear categoria) não tem nenhum anel de foco visível** — sobrescreve silenciosamente a regra genérica `input:focus` que todo o resto do app usa.
- **Anéis de foco de validação (`.input-error`/`.input-success`) usam cor/opacidade próprias**, diferentes do `--focus-ring` padrão — padronizar a "linguagem de foco" em todo estado de campo.
- **Contraste de texto secundário em tamanhos pequenos**: `--color-text-subtle` (`#6b7280`) usado em `.78rem` e principalmente `10px` (rótulo do bottom-nav) fica no limite/abaixo do recomendado para texto tão pequeno — considerar escurecer o tom ou aumentar o tamanho nesses casos específicos.
- **`.toast-warning` não se adapta ao tema escuro** (cor de texto hardcoded) — único toast nessa condição; risco de contraste baixo especificamente no modo escuro.
- **Indicador de execução só em `title` (tooltip) na visão Mês** — inacessível a leitores de tela sem foco no elemento e a qualquer interação por toque; expor como texto/aria-label visível, como já ocorre na Semana.
- **Emoji como único portador de significado de status** (🟢🟡🔴) — hoje acompanhado do valor percentual em texto, o que mitiga o problema, mas vale considerar substituição por ícone SVG do próprio sistema de ícones, coerente com o resto do produto e com significado que não depende de reconhecer a cor do emoji.

---

## Melhorias de consistência visual

- Consolidar os 21 valores crus de `font-size` para os 5 tokens (mais no máximo 1–2 adicionais, se justificado), começando pelo cluster 12–14,5px, que hoje tem sete valores praticamente idênticos.
- Reduzir os 9 tamanhos de ícone para uma escala de 3–4 tokens.
- Unificar os 4 componentes de "cartão elevado" numa base compartilhada de radius/sombra.
- Tokenizar a paleta do Assistente de IA (`--color-ai-*`) e garantir que ela responda ao tema escuro pelo mesmo mecanismo do resto do app.
- Eliminar `border-radius: 999px` hardcoded (usar `var(--radius-full)`) e revisar os valores `4px`/`3px` fora da escala oficial.
- Consolidar as 6 durações de transição observadas nos 3 tokens já definidos (`--transition-fast/base/slow`).
- Remover a duplicação exata entre `@keyframes spin` e `@keyframes ai-spin`.
- Migrar todos os usos de `--red` (legado) para o sistema semântico `--color-danger*`.
- Corrigir a referência a `--yellow-light` (variável inexistente, hoje mascarada por um fallback hardcoded).
- Dar ao `.btn-danger` um tratamento visual de fato mais enfático (preenchimento sólido ou peso equivalente) para ações irreversíveis.
- Padronizar os quatro tratamentos hoje distintos de "título de subseção" (`.dash-tier-title`/`.today-section-title`/`.insights-block-title` já são idênticos entre si — usar esse trio como referência única e alinhar `.ss-questions-title`, `.sj-week-summary-title` e `.sj-detail-title` a ele).
- Padronizar rótulos de status ("Executando"/"Em andamento") e verbos de confirmação ("registrada"/"adicionada"/"atualizada") para o mesmo conceito em telas diferentes.

---

## Roadmap de implementação

Fases pequenas, independentes, uma PR cada — seguindo a mesma convenção das ondas F14/F15 já usadas neste repositório. Nenhuma remove dado ou lógica de domínio; a maioria é CSS/rótulo/roteamento de baixo risco.

### Onda 1 — Correções críticas de navegação e vocabulário (P0, baixo risco, altíssimo impacto)

**F18.1 — Restaurar acesso à página Progresso**
- **Objetivo:** dar à página `#page-progress` um destino real de navegação (sidebar e/ou "Mais", bottom-nav se fizer sentido).
- **Arquivos:** `index.html`, `navigationView.js`, `keyboardService.js` (atalho `g p`, opcional).
- **Impacto:** altíssimo — recupera uma feature inteira (Progresso narrativo, F14.5) hoje morta em produção.
- **Complexidade:** baixa.
- **Riscos:** nenhum — a página já existe e funciona, só falta a porta de entrada.
- **Critérios de aceite:** é possível chegar a "Progresso" clicando em algum item visível da navegação, sem depender de chamar `showPage("progress")` manualmente; teste de navegação cobre o caminho.

**F18.2 — Resolver a colisão de "Todas" no Diário**
- **Objetivo:** eliminar a ambiguidade entre a aba de status e o chip de período.
- **Arquivos:** `index.html` (`#sj-status-tabs`, `.sj-quick-filters`), `studyJournalView.js`.
- **Impacto:** alto — resolve confusão de leitura na tela mais visitada depois de Sessão.
- **Complexidade:** baixa (mudança de rótulo/copy, sem lógica nova).
- **Riscos:** nenhum.
- **Critérios de aceite:** nenhuma tela do Diário mostra a palavra "Todas" duas vezes sem um qualificador imediato que distinga status de período.

**F18.3 — Corrigir o rótulo "Compromisso" em sessão avulsa**
- **Objetivo:** o `<dt>` do contexto da sessão ativa/resumo não deve dizer "Compromisso" quando não há evento vinculado.
- **Arquivos:** `studySessionView.js`, `index.html` (`.ss-context`).
- **Impacto:** médio-alto — remove um vazamento de vocabulário na tela mais usada do produto.
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** sessão avulsa mostra um rótulo condizente com "estudo livre"; sessão vinculada a um compromisso mantém "Compromisso" normalmente.

**F18.4 — Corrigir a referência morta no tour de boas-vindas**
- **Objetivo:** trocar `page: "dashboard"` por `page: "progress"` (e o rótulo correspondente) no passo do tour.
- **Arquivos:** `onboardingTourView.js`.
- **Impacto:** baixo-médio, mas é um bug facilmente reproduzível por qualquer novo usuário.
- **Complexidade:** trivial.
- **Riscos:** nenhum.
- **Critérios de aceite:** clicar nesse passo do tour leva de fato à página Progresso (depende de F18.1 estar concluído).

**F18.5 — Remover o bypass do Decision Engine em `eventFormView.js`**
- **Objetivo:** o modal de compromisso deixa de montar seus próprios smart cards por fora do motor central; passa a usar `filterSpontaneousDecisions()` ou a não exibir nada espontâneo.
- **Arquivos:** `eventFormView.js` (`_loadInsights`/`_buildEventInsightCards`), `decisionEngine.js` (se precisar expor algo).
- **Impacto:** médio-alto — realinha o comportamento com "silêncio como política" já adotado no resto do produto; elimina uma duplicidade arquitetural real.
- **Complexidade:** média.
- **Riscos:** algum insight útil pode deixar de aparecer espontaneamente — mitigar mantendo-o acessível via "Ver histórico e estatísticas" (já existe), só não mais exibido sem pedido.
- **Critérios de aceite:** nenhum card de tom "atenção" aparece no modal de evento sem ação do usuário; suíte de testes cobre o caso.

### Onda 2 — Consolidação do design system (tokens, tipografia, ícones, cartões)

**F18.6 — Tokenizar a paleta do Assistente de IA**
- **Objetivo:** criar `--color-ai-*` (claro/escuro) e migrar `.btn-ai`, `.ai-panel-title`, `.ai-panel-icon`, `.ai-action-btn:hover`, `.ai-result-title`, `.ai-loading-spinner` para usá-las; remover `.btn-ai` se continuar sem uso real.
- **Arquivos:** `style.css`.
- **Impacto:** alto na coerência visual — é a "ilha" mais visível do produto.
- **Complexidade:** baixa-média.
- **Riscos:** baixo; revisar o painel de IA em ambos os temas após a mudança.
- **Critérios de aceite:** nenhuma cor da IA é hex cru fora de `:root`; painel de IA responde ao tema escuro como o resto do app.

**F18.7 — Consolidar o sistema de ícones em 3–4 tamanhos**
- **Objetivo:** substituir os 9 tamanhos de ícone distintos por tokens (`--icon-sm/md/lg`).
- **Arquivos:** `style.css`, `index.html` (remover `width`/`height` inline onde uma classe já cobre o tamanho).
- **Impacto:** médio no uso diário, alto na percepção de acabamento.
- **Complexidade:** média (mecânico, toca muitos seletores, baixo risco individual).
- **Riscos:** baixo; checklist visual das telas principais após a mudança.
- **Critérios de aceite:** nenhum ícone usa tamanho fora dos tokens definidos; os três ícones de "fechar" (modal/painel/toast) passam a ter o mesmo tamanho.

**F18.8 — Unificar os 4 componentes de "cartão elevado"**
- **Objetivo:** `.card`/`.ss-card`/`.modal-card`/`.smart-card` herdam radius/sombra de uma base compartilhada, com modificadores só para diferenças reais (fundo do smart-card, borda do ss-card).
- **Arquivos:** `style.css`.
- **Impacto:** médio-alto na coerência visual percebida.
- **Complexidade:** média-alta — requer revisão visual cuidadosa de todas as telas que usam esses componentes.
- **Riscos:** regressão visual sutil — mitigar com checklist tela a tela (Hoje, Agenda, Sessão, Diário, Progresso, modais).
- **Critérios de aceite:** radius e sombra dos 4 componentes vêm de tokens compartilhados; nenhuma tela muda de layout, só de acabamento de borda/sombra.

**F18.9 — Consolidar o cluster de `font-size` 12–14,5px**
- **Objetivo:** colapsar os sete valores quase idênticos (`.75rem`…`.9rem`) nos tokens `--font-size-xs`/`--font-size-sm` (ajustando a escala se necessário).
- **Arquivos:** `style.css`.
- **Impacto:** alto — é o achado mais sistêmico da auditoria.
- **Complexidade:** alta (dezenas de seletores) — recomenda-se dividir por área (Sessão, Diário, Configurações, Conta) em sub-PRs se o diff ficar grande demais para revisão segura.
- **Riscos:** médio — precisa de revisão visual tela a tela para não quebrar alinhamentos que hoje dependem do valor exato.
- **Critérios de aceite:** contagem de declarações literais de `font-size` no cluster cai para próximo de zero; nenhuma regressão visual perceptível nas telas revisadas.

**F18.10 — Padronizar rótulos "eyebrow" (uppercase + letter-spacing)**
- **Objetivo:** uma única classe utilitária para os 16 seletores que hoje têm 5 tamanhos e 5 letter-spacings diferentes para o mesmo padrão visual.
- **Arquivos:** `style.css`.
- **Impacto:** baixo-médio no uso diário, alto em consistência tipográfica — item citado explicitamente no briefing original.
- **Complexidade:** média.
- **Riscos:** baixo.
- **Critérios de aceite:** os 16 seletores usam a mesma variável/classe de tamanho e espaçamento de letra.

**F18.11 — Unificar badges/contadores**
- **Objetivo:** `.sj-toolbar-badge` passa a usar `var(--radius-full)` e o mesmo padding fluido de `.ss-status-badge`/`.session-history-status`/`.review-status`.
- **Arquivos:** `style.css`.
- **Impacto:** baixo-médio.
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** nenhum badge usa `999px` hardcoded; os 4 badges compartilham a mesma API visual.

**F18.12 — Limpar tokens de cor mortos/duplicados**
- **Objetivo:** migrar `--red` (legado) para `--color-danger*`; corrigir a referência a `--yellow-light`; remover a duplicação `@keyframes spin`/`@keyframes ai-spin`.
- **Arquivos:** `style.css`.
- **Impacto:** baixo no uso diário, alto em manutenibilidade e coerência de tema escuro.
- **Complexidade:** baixa.
- **Riscos:** baixo.
- **Critérios de aceite:** grep por `--red`/`--yellow-light` sem resultado fora do `:root`; um único `@keyframes` de rotação no arquivo.

### Onda 3 — Simplificação de formulários e painéis

**F18.13 — Unificar registro rápido e detalhado de questões**
- **Objetivo:** abrir "+ Adicionar com detalhes" herda os valores de quantidade/erros já digitados no atalho rápido, em vez de reiniciar.
- **Arquivos:** `studySessionView.js`.
- **Impacto:** alto para quem resolve blocos grandes de questões — o caso de uso mais repetitivo do produto.
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** abrir "mais detalhes" preserva os valores já digitados nos campos rápidos; teste cobre o caminho.

**F18.14 — Corrigir data desatualizada no seletor manual "Compromisso da agenda"**
- **Objetivo:** a lista manual de compromissos no modal de início de sessão passa a usar `getEventsByRange` + `expandEvents` (mesma fonte já usada pelo chip "Hoje: X"), não a data-base bruta da série recorrente.
- **Arquivos:** `studySessionView.js` (`_populateStartEventOptions`).
- **Impacto:** médio — evita confusão no caso mais comum (aulas fixas, plantões recorrentes).
- **Complexidade:** média (reaproveita lógica já existente, baixo risco).
- **Riscos:** baixo.
- **Critérios de aceite:** selecionar um compromisso recorrente na aba manual mostra a próxima ocorrência real, coerente com o chip de sugestão do mesmo modal.

**F18.15 — Separar "ler" de "filtrar" no painel Analisar do Diário**
- **Objetivo:** Marcos da Evolução e Resumos Semanais saem do painel "Analisar"; o painel passa a conter só estatísticas + controles de filtro.
- **Arquivos:** `index.html` (`#sj-panel`), `studyJournalView.js`.
- **Impacto:** alto — resolve a maior inconsistência de arquitetura de informação encontrada nesta auditoria.
- **Complexidade:** média.
- **Riscos:** requer decidir o novo lugar dos dois blocos (proposta: de volta perto da timeline, como conteúdo, não como resultado de filtro).
- **Critérios de aceite:** o painel "Analisar" só contém estatísticas e controles de filtro; os blocos de leitura vivem em um lugar nomeado corretamente.

**F18.16 — Remover "Resumos Semanais"**
- **Objetivo:** eliminar a segunda geração de texto narrativo formulaico, redundante com o Progresso narrativo.
- **Arquivos:** `studyJournalView.js`, `studySummaryService.js` (remover o consumo na view).
- **Impacto:** médio — reduz de 5 para 4 as superfícies concorrentes de "como foi meu estudo".
- **Complexidade:** baixa-média.
- **Riscos:** perda de conteúdo que algum usuário possa valorizar — se houver telemetria de abertura do disclosure, checar antes de remover.
- **Critérios de aceite:** "Resumos Semanais" não aparece mais na UI; nenhuma regressão nos demais blocos do painel.

**F18.17 — Unificar Notificações locais e Push**
- **Objetivo:** um único toggle "Lembretes" no lugar de duas seções técnicas; o app decide o mecanismo por trás.
- **Arquivos:** `index.html` (`#settings-overlay`), `settingsModal.js`.
- **Impacto:** médio — remove uma decisão técnica desnecessária de Configurações.
- **Complexidade:** média (definir estratégia de fallback local↔push por trás de 1 controle, migrar estado de usuários com combinações hoje divergentes).
- **Riscos:** médio — cuidado com a migração de preferências já salvas.
- **Critérios de aceite:** um único controle visível; nenhuma perda de capacidade de lembrete para quem já tinha push ativado.

**F18.18 — Aumentar a fricção de exclusão de conta**
- **Objetivo:** exigir pelo menos o mesmo nível de confirmação de identidade que "Alterar Senha" (reautenticação) antes de excluir a conta.
- **Arquivos:** `accountView.js`.
- **Impacto:** médio — segurança percebida e prevenção de erro do usuário na ação mais irreversível do produto.
- **Complexidade:** média.
- **Riscos:** baixo.
- **Critérios de aceite:** excluir a conta exige confirmação de identidade equivalente ou maior que trocar a senha.

### Onda 4 — Mobile e acessibilidade

**F18.19 — Header sem overflow em telas ≤375px com sessão ativa**
- **Objetivo:** adicionar regra de encolhimento/ocultação para o chip de sessão ativa e/ou nome do usuário quando o header ficar apertado.
- **Arquivos:** `style.css` (breakpoints 480px/375px).
- **Impacto:** médio — cenário central do produto (estudando no celular com sessão ativa).
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** testado em 360×640/375×667 com sessão ativa e nome de usuário longo, sem overflow horizontal.

**F18.20 — Indicador de execução visível por toque na visão Mês**
- **Objetivo:** `calendar.js` passa a expor o texto do indicador (não só via `title`), como a visão Semana já faz.
- **Arquivos:** `calendar.js`, `style.css` (se precisar de ajuste de layout do chip).
- **Impacto:** médio para uso mobile — a persona é majoritariamente mobile.
- **Complexidade:** baixa-média.
- **Riscos:** pode exigir ajuste de espaço no chip do mês em telas pequenas — testar.
- **Critérios de aceite:** a informação de execução do compromisso é acessível sem hover/tooltip na visão Mês.

**F18.21 — Corrigir foco/acessibilidade pontuais**
- **Objetivo:** `.cat-edit-name` recupera o anel de foco padrão; anéis de validação (erro/sucesso) revisados para não divergir tanto do `--focus-ring`; `.toast-warning` passa a usar o token de cor (correção automática no tema escuro).
- **Arquivos:** `style.css`.
- **Impacto:** baixo-médio no dia a dia, alto para navegação por teclado/baixa visão.
- **Complexidade:** baixa.
- **Riscos:** nenhum.
- **Critérios de aceite:** todo input/select/textarea do app mostra indicação de foco consistente ao navegar por teclado (teste manual de tab-through nas telas principais).

**F18.22 — Dar peso visual real a `.btn-danger`**
- **Objetivo:** ações destrutivas (excluir compromisso/categoria/conta) deixam de ter o mesmo peso visual de um botão secundário.
- **Arquivos:** `style.css`.
- **Impacto:** médio — clareza sobre a irreversibilidade da ação.
- **Complexidade:** baixa.
- **Riscos:** baixo.
- **Critérios de aceite:** `.btn-danger` é visualmente distinguível de `.btn-secondary`/`.btn-ghost` à primeira vista, em todas as telas onde aparece.

---

**Ordem sugerida:** Onda 1 completa primeiro (P0, baixo risco, restaura features perdidas e corrige vocabulário confuso) → Onda 2 (consolidação de design system, o trabalho que mais muda a "sensação" de produto comercial) → Onda 3 (simplificação de formulários/painéis) → Onda 4 (mobile/acessibilidade, fecha o ciclo).

Assim como nas rodadas F14–F17, nenhuma dessas 22 fases exige inventar produto novo. O Anoti já decidiu, corretamente, o que quer ser — um ambiente de estudo, não um painel administrativo. O que falta agora é a mesma disciplina de curadoria aplicada uma camada abaixo: não mais "que tela mostrar", mas "que token, que componente, que rótulo usar" — para que cada peça nova que o produto ganhar pareça ter sido desenhada pela mesma pessoa que desenhou a anterior.
