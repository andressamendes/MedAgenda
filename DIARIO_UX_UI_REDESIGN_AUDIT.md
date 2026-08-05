# Auditoria UX/UI V3 — Redesign Completo do Diário (Anoti)

> Escopo: `#page-journal` e os módulos que a renderizam — `studyJournalView.js`, `activityHistoryView.js` (aba "Histórico"), e os serviços puros `studyTimelineService.js`, `studyMilestoneService.js`, `studySearchService.js`, `studyStatisticsService.js`, `studyReflectionService.js`.
>
> Esta é a **terceira rodada** de auditoria da página. As duas anteriores já removeram o pior da densidade bruta (formulário permanente, resumo duplicado) e já corrigiram alguns pontos pontuais (Marcos saíram do `<details>`, Reflexão ganhou classe própria e passou a vir primeiro no detalhe, comparação diária ganhou frase humanizada). Esta auditoria **não assume nenhuma dessas decisões como definitiva**. Ela parte de zero, olhando só para os dados disponíveis, e pergunta: dado tudo o que existe hoje, qual é a melhor experiência possível — sem adicionar nada, e sem medo de remover, esconder ou fundir o que já foi construído, inclusive o que foi corrigido nas rodadas anteriores.
>
> Nenhuma funcionalidade nova é proposta. Nenhum código foi alterado nesta auditoria — apenas este documento foi criado.

---

# 1. Diagnóstico Geral

### Nota: **6,5 / 10**

O Diário funciona. Todos os dados existem, todos os cálculos são reais, e as duas rodadas anteriores já eliminaram os erros mais grosseiros (filtros sempre visíveis, resumo redundante, Marcos escondidos atrás de um `<details>` nativo). O que resta não é um problema de funcionalidade — é um problema de **quantidade de decisão**. A tela pergunta demais ao estudante antes de deixá-lo simplesmente ler o que fez. Ela foi construída como um sistema de arquivamento bem organizado (abas, painel de filtros, painel de estatísticas, disclosure por card, período completo + chips) quando deveria se comportar como uma página de um diário: algo que se abre, se lê, e se fecha em poucos segundos, com o detalhe reservado para quem realmente quer investigar.

O maior sintoma: a página tem hoje **7 mecanismos de controle de visibilidade** operando ao mesmo tempo (abas, chips de período, toggle de busca, botão "Analisar" com painel modal, contador de filtros avançados, seleção de período completo redundante com os chips, e o disclosure individual de cada card). Nenhum deles isoladamente é errado. Juntos, formam uma tela onde o estudante tem que decidir "onde eu clico para ver o que eu quero" antes de conseguir ler qualquer coisa.

---

# 2. O verdadeiro objetivo do Diário

**O Diário existe para** dar ao estudante, num único olhar, a sensação tranquila e honesta de "isto é o que eu fiz — e isto é o que isso significa para o meu progresso", sem exigir esforço de leitura, decodificação ou navegação. Ele não existe para arquivar dados com precisão de planilha; existe para sustentar o hábito de estudar, dia após dia, dando a esse hábito uma forma legível e, quando possível, motivadora.

### Perguntas que ele deve responder em menos de 5 segundos

1. ✔ **O que estudei hoje / recentemente?**
2. ✔ **Quanto estudei?** (tempo total, sem precisar somar)
3. ✔ **Estou evoluindo, ou esse período foi mais fraco?**
4. ✔ **Existe algo pendente que eu deveria revisar?**
5. ✔ **Como foi esse estudo para mim — o que aprendi, o que senti?**

Tudo o que não ajuda a responder essas cinco perguntas na primeira leitura — filtros avançados, estatísticas em número absoluto, a aba "Histórico" completa, o painel de análise — **deve ser questionado, não eliminado**: continua existindo, mas nunca compete pelo primeiro olhar.

---

# 3. O que faz o Diário parecer confuso

Não é falta de organização — é excesso de organização **visível ao mesmo tempo**:

- **Muitos níveis de disclosure simultâneos.** Abas → toolbar → painel modal → card fechado → detalhe expandido. Cada nível é justificável isoladamente; empilhados, formam uma arquitetura de informação mais profunda do que qualquer app de diário de referência (Day One, Apple Journal) usa.
- **Controles redundantes competindo pelo mesmo espaço.** Os chips "Hoje/Semana/Todas" e o `<select>` de período completo resolvem o mesmo problema com dois desenhos diferentes, visíveis ao mesmo tempo.
- **Dados de consulta ocasional com o mesmo peso de acesso que dados de uso diário.** As 4 estatísticas de questões e os 5 filtros avançados vivem atrás do mesmo botão único ("Analisar") que qualquer estudante — engajado ou não — vê todo santo dia na toolbar.
- **Duas linguagens visuais para o mesmo conceito.** Cartão (`.sj-entry`) e linha do tempo (`.ah-timeline`) representam a mesma ideia — "um evento datado" — de formas diferentes dentro da mesma tela (Marcos usa timeline, lista principal usa cartão, aba Histórico usa timeline).
- **Hierarquia tipográfica achatada.** Título do card, horário, duração, contagem de questões, cabeçalho "Hoje" vs. "12/03" — quase tudo tem o mesmo peso visual. Sem hierarquia, tudo parece igualmente importante, o que na prática significa que nada parece importante.

---

# 4. Inventário completo

| Componente | Classificação | Justificativa |
|---|---|---|
| **Lista de dias + cabeçalho de dia** (`.sj-day-header`) | **Essencial** | É a espinha dorsal da tela — resposta direta a "o que fiz e quando". |
| **Card de sessão fechado** (`.sj-entry`) | **Essencial** | Átomo da tela; já segue a regra dos 3 segundos (título/horário/duração/questões). |
| **Comparação com o dia anterior** | **Essencial** | Responde diretamente "estou evoluindo?" — mas hoje some silenciosamente sob filtro e ainda soa a badge, não a frase de diário. |
| **Reflexão** (dentro do detalhe) | **Essencial** | Única escrita pessoal da tela — é o próprio "diário". |
| **Marcos da Evolução** | **Importante** | Potencial emocional alto, mas consumido raramente (após os primeiros dias de novidade, vira "mais uma seção" se não for muito bem dosado). |
| **Busca textual** | **Importante** | Usada sob demanda — não a cada visita, mas essencial quando é usada. Merece ficar de fácil acesso, não escondida. |
| **Chips de período rápido** | **Importante** | Filtro mais usado no dia a dia; mas duplicado pelo select completo. |
| **Seção "Questões" (detalhe)** | **Importante quando existe** | Resumo de acerto é útil, mas é a 4ª pergunta na lista de prioridades — não deveria competir com o card fechado. |
| **Seção "Revisões" (detalhe)** | **Importante quando existe** | É acionável em potencial (pendência), mas hoje é só leitura. |
| **Aba "Histórico"** | **Secundário** | Ferramenta de auditoria ocasional (conferir uma sessão cancelada) — não é consulta diária. |
| **Seção "Observações" (detalhe)** | **Secundário** | Frequentemente redundante com o conteúdo já mostrado no card fechado. |
| **Botão "Analisar" / Painel lateral** | **Secundário como acesso, importante como conteúdo** | O painel em si guarda dado real (estatísticas), mas o *botão sempre visível* consome espaço de toolbar todo santo dia para um uso ocasional. |
| **Stat cards de questões (4x)** | **Secundário** | É a 4ª/5ª pergunta do estudante, não a 1ª — hoje tem o mesmo nível de acesso da busca. |
| **Select de período completo** | **Descartável** | 100% redundante com os chips para os 3 casos mais comuns; os 2 casos extras (7d/30d) não justificam manter dois controles visíveis para a mesma decisão. |
| **5 filtros avançados** (reflexão/observações/revisões/questões/duração) | **Descartável na forma atual** | Uso raríssimo; ocupam o mesmo painel e o mesmo nível de prioridade que dados de consulta muito mais frequentes. Não devem desaparecer da capacidade do produto, mas não merecem mais existir como 5 controles visíveis lado a lado — cabem dentro da busca avançada ou de um "mais filtros" de segundo nível. |
| **Contador de filtros avançados ativo** | **Descartável** | Só existe porque os 5 filtros existem como controles visíveis; se eles forem recolhidos a um segundo nível, o contador perde a razão de ser separada. |
| **Linha "N sessão(ões) encontradas · Xh estudadas"** | **Descartável isolada** | Repete informação que já está implícita na lista filtrada; deveria fundir-se ao cabeçalho da lista, não viver como linha solta. |
| **Ícones de Marcos reaproveitados sem relação semântica** | **Descartável na forma atual** | Ruído visual — comunica errado, é pior que não comunicar. |
| **Duas linguagens visuais de timeline** (`.sj-entry` vs. `.ah-timeline`) | **Descartável a duplicidade** | Uma das duas deve deixar de existir como sistema visual separado. |

---

# 5. Os 20 maiores problemas de UX (por impacto)

1. Sete mecanismos de disclosure/controle ativos simultaneamente na mesma tela — o estudante decide antes de ler.
2. O select de período completo e os chips rápidos resolvem o mesmo problema, visíveis ao mesmo tempo, sem hierarquia entre eles.
3. Os 5 filtros avançados têm o mesmo nível de acesso (1 clique) que a busca textual, de uso muito mais frequente.
4. A comparação com o dia anterior desaparece silenciosamente sob qualquer filtro que quebre a sequência de dias — sem explicação.
5. Nenhum elemento do detalhe do card, exceto a Reflexão, é acionável — "Revisões" pendentes não levam a lugar nenhum.
6. A aba "Histórico" responde à mesma pergunta de fundo que "Concluídas" ("o que aconteceu"), forçando o estudante a entender a diferença entre as duas antes de saber onde procurar algo.
7. O painel "Analisar" mistura duas intenções (consultar números / mudar filtros) atrás de um único botão e rótulo genérico.
8. O botão "Analisar" está sempre visível na toolbar mesmo sendo usado ocasionalmente — mesmo nível de acesso que a busca, de uso muito mais comum.
9. Card expandido pode ter de 1 a 4 seções empilhadas sem nenhuma previsibilidade de altura — a experiência de abrir um card é imprevisível.
10. A busca fica escondida atrás de um ícone mesmo sendo, junto ao período, um dos controles mais usados no dia a dia.
11. Não existe nenhuma ação primária clara na tela — tudo é leitura ou filtro, nada convida a continuar o estudo.
12. O botão "Carregar mais" interrompe abruptamente o fluxo de leitura vertical.
13. O estudante não sabe, ao abrir "Analisar" em mobile, se vai encontrar números ou filtros — a ambiguidade custa um clique extra de exploração.
14. A aba "Histórico" e a "Concluídas" usam estruturas de dados e visuais diferentes para o mesmo tipo de conteúdo, forçando reaprendizado a cada troca.
15. Nenhuma diferenciação de urgência/relevância entre "sessão de hoje" e "sessão de uma semana atrás" dentro do próprio card, fora do cabeçalho de dia.
16. Marcos, mesmo já fora do `<details>`, ainda competem por espaço no topo da tela com a toolbar completa — não há garantia de que sejam a primeira coisa lida.
17. A linha de estatística de busca ("N sessão(ões) encontradas") aparece solta, sem vínculo visual claro com a lista que descreve.
18. Cinco controles de filtro avançado forçam decisão sobre casos de uso extremamente raros antes mesmo de o estudante entender o que o painel oferece.
19. O aviso de carregamento parcial usa tom de alerta genérico, criando ansiedade desnecessária num contexto de baixo risco.
20. Não existe indicação de "quanto falta rolar" em mobile antes de abrir Marcos ou o painel — a rolagem é uma incógnita.

---

# 6. Os 20 maiores problemas de UI (por impacto)

1. Título do card, horário, duração e contagem de questões têm peso tipográfico quase idêntico — nada se destaca como "isto é o mais importante".
2. "Hoje" no cabeçalho de dia ainda compete visualmente com datas antigas em alguns estados de leitura rápida.
3. Duas linguagens visuais coexistem para "lista de eventos datados": cartão (`.sj-entry`) e linha+ponto (`.ah-timeline`).
4. Quatro convenções visuais de "status" diferentes convivem na tela (cor de badge, cor de ponto de marco, emoji+%, texto plano) sem sistema único.
5. Ícones de Marcos reaproveitados de contextos de navegação sem relação semântica com o tipo de marco (ex.: ícone de IA usado para "constância/sequência").
6. O ícone do botão "Analisar" comunica "ajustes", não "estatísticas" — esconde metade do conteúdo real atrás de uma metáfora errada.
7. Os 4 stat cards de questões, lado a lado num painel estreito, formam um bloco denso e apertado.
8. Espaçamento inconsistente entre tokens do design system e valores soltos dentro do CSS específico da página.
9. Nenhuma regra `@media` dedicada às classes da página — comportamento em telas pequenas depende inteiramente de wrap automático.
10. A badge "Encontrado em: X" usa estilo de alerta neutro que não se conecta ao highlight já aplicado no texto.
11. O botão "Analisar" não muda de estado visual quando o painel está aberto — falta feedback persistente.
12. Chip de período ativo não tem contraste suficientemente forte em relação aos inativos.
13. Skeleton de carregamento genérico (linhas simples) não reflete a forma real dos cards, criando salto de layout ao carregar.
14. Raio de borda e sombra entre `.sj-entry` e `.stat-card--sm` ligeiramente diferentes apesar de conviverem na mesma tela.
15. Alinhamento vertical entre chips de período e botões de ícone da toolbar potencialmente distinto, por serem tipos de elemento diferentes.
16. Nenhum destaque visual (cor de fundo sutil) para o grupo do dia atual como um todo — só o rótulo "Hoje" se distingue, não o bloco inteiro.
17. Botão "Carregar mais" tem peso visual de fim abrupto, não de convite a continuar.
18. Proporção/tamanho de ícones reaproveitados de navegação inconsistente quando usados fora de contexto (Marcos).
19. Espaçamento entre o fim da lista de um dia e o início do cabeçalho do próximo dia potencialmente igual ao espaçamento interno entre cards do mesmo dia — perde-se o agrupamento visual por dia.
20. Texto do aviso de carregamento parcial usa mesmo tom visual (cor, borda) de mensagens de erro reais.

---

# 7. Os 20 componentes que mais aumentam a carga cognitiva

1. Select de período completo (duplica os chips).
2. Os 5 filtros avançados como controles visíveis simultâneos.
3. Contador de filtros avançados (só existe por causa do item acima).
4. Botão "Analisar" com rótulo genérico que não anuncia o que há dentro.
5. Painel "Analisar" misturando estatísticas + filtros sem separação clara de intenção.
6. Quatro seções condicionais no detalhe do card (Questões/Revisões/Observações/Reflexão), cada uma com seu próprio título e resumo.
7. Aba "Histórico" como segunda estrutura para essencialmente a mesma pergunta de fundo da aba "Concluídas".
8. Toggle de busca escondido atrás de ícone (obriga descoberta antes de uso).
9. Quatro convenções visuais de status diferentes na mesma tela (badge/ponto/emoji/texto).
10. Duas linguagens visuais de "linha do tempo" (cartão vs. timeline).
11. Linha de estatística de busca solta, sem vínculo visual com o que descreve.
12. Comparação diária que desaparece sem explicação sob certos filtros.
13. Ícones de Marcos com semântica incorreta (forçam reinterpretação).
14. Botão "Carregar mais" sem indicação de quanto conteúdo resta.
15. Checkbox "somente canceladas" na aba Histórico — controle de uso raríssimo sempre visível.
16. Stat cards de questões em grade apertada — 4 números para processar de uma vez quando só 1 (índice de acerto) responde à pergunta mais comum.
17. `<h3>` idênticos entre Questões/Revisões/Observações/Reflexão — nenhuma pista de "isto é técnico" vs. "isto é pessoal".
18. Skeleton genérico que não antecipa a forma real do conteúdo (gera reprocessamento visual ao carregar).
19. Aviso de carregamento parcial com tom de alerta — obriga avaliar se é um problema real.
20. Abas "Concluídas"/"Histórico" no topo da tela antes de qualquer conteúdo — decisão de navegação exigida antes da leitura.

---

# 8. Os 20 componentes que mais desperdiçam espaço

1. Select de período completo (ocupa uma linha inteira de UI para replicar 3 chips).
2. Os 5 filtros avançados como controles individuais lado a lado.
3. 4 stat cards de questões em grade — poderiam ser 1 número em destaque + texto de apoio.
4. Painel "Analisar" inteiro em mobile — concentra praticamente todos os controles secundários da página numa única rolagem.
5. Linha de estatística de busca solta, ocupando uma linha própria por informação que cabia no cabeçalho da lista.
6. Contador de filtros avançados como badge separado do botão que ele modifica.
7. Cabeçalho `<h1>Diário</h1>` sem nenhum conteúdo funcional além do rótulo.
8. Checkbox "somente canceladas" ocupando uma linha própria na aba Histórico.
9. Toolbar com 3 affordances (chips/busca/painel) numa única linha sem agrupamento visual — obriga wrap descontrolado em mobile.
10. Cada seção do detalhe (Questões/Revisões/Observações) com título `<h3>` + resumo + lista — verboso para conteúdo pequeno (ex.: 1 questão).
11. Badge "Encontrado em: X" como bloco à parte, quando poderia ser uma anotação inline discreta.
12. Aviso de carregamento parcial como bloco de rodapé sempre reservando espaço quando presente.
13. Botão "Carregar mais" como elemento de largura total, mesmo em listas curtas.
14. Marcos: cada item usa cabeçalho + descrição completa mesmo quando o título já é autoexplicativo.
15. Duplicação estrutural entre `.ah-timeline` (Histórico/Marcos) e `.sj-entry` (lista principal) — dois sistemas de CSS para o mesmo tipo de conteúdo.
16. Aba "Histórico" como aba inteira, quando poderia ser um filtro de status dentro da mesma lista.
17. Espaço reservado para a comparação diária mesmo em dias sem dia anterior no conjunto filtrado (elemento oculto, mas presente na árvore).
18. Ícones de Marcos em tamanho fixo que nem sempre corresponde à densidade real do texto ao lado.
19. Skeleton de 4 linhas genéricas ocupando altura que não corresponde à altura real dos primeiros cards.
20. Grade de stat cards com múltiplos níveis de padding/borda por card, quando o conteúdo é só um número + rótulo.

---

# 9. Os 20 componentes que deveriam ser simplificados ou fundidos

1. **Chips de período + select de período completo** → fundir num único controle (chips cobrem 90% dos casos; os 2 casos extras viram opções dentro de um menu "mais" discreto).
2. **5 filtros avançados** → fundir na busca textual avançada já existente, ou recolher a um único "mais filtros" de segundo nível, fora da linha de toolbar.
3. **Contador de filtros avançados** → some junto com a fusão do item 2; se sobreviver, vive dentro do próprio ponto de entrada dos filtros, não como badge separado.
4. **4 stat cards de questões** → fundir num só destaque (índice de acerto) + uma linha de texto secundário com total/acertos/erros.
5. **Linha de estatística de busca** → fundir ao cabeçalho da própria lista filtrada, não como linha independente.
6. **Aba "Histórico"** → fundir na aba "Concluídas" como um filtro de status ("Todas / Concluídas / Canceladas"), eliminando a segunda estrutura de dados/visual.
7. **`.ah-timeline` e `.sj-entry`** → fundir num único sistema visual de "evento datado", variando densidade por contexto, não a metáfora inteira.
8. **Painel "Analisar"** → dividir claramente em duas sub-seções visuais ("Seus números" / "Filtrar"), mesmo compartilhando o mesmo painel físico.
9. **`<h3>` de Questões/Revisões/Observações** → fundir num tratamento tipográfico único de "seção técnica", visualmente distinto da Reflexão.
10. **Botão "Analisar" + seu ícone** → simplificar para refletir o conteúdo dominante real (estatísticas), não um ícone de "ajustes".
11. **Badge "Encontrado em: X"** → fundir com o highlight já existente no texto — uma anotação inline, não um bloco separado.
12. **Checkbox "somente canceladas"** → fundir com a fusão da aba Histórico (item 6) — vira apenas mais uma opção do filtro de status.
13. **Marcos** → simplificar cada item para 1 linha quando o título já é autoexplicativo, reservando a descrição completa só para severidades altas.
14. **Aviso de carregamento parcial** → simplificar o tom visual para neutro/informativo, não de alerta.
15. **Skeleton de carregamento** → simplificar/redesenhar para espelhar a forma real (cabeçalho de dia + card), evitando salto de layout.
16. **Botão "Carregar mais"** → simplificar visualmente para "convite a continuar" (ex. texto + seta), não uma barra de largura total isolada.
17. **Comparação diária** → simplificar para sempre existir como frase, com um estado de fallback explícito ("sem dia anterior para comparar") em vez de sumir silenciosamente.
18. **Ícones de Marcos** → simplificar reaproveitando o acervo de ícones já existente com relação semântica direta, sem introduzir ícones novos.
19. **Toolbar** → simplificar agrupando visualmente busca+período de um lado (uso diário) e "mais filtros"/estatísticas do outro (uso ocasional), em vez de uma linha só.
20. **`<h1>Diário</h1>` solto** → fundir com uma frase de contexto (streak/constância), formando um cabeçalho único de abertura, não um título vazio seguido de controles.

---

# 10. Nova arquitetura da página

Ordem dos blocos, do topo para baixo, com justificativa de cada decisão.

**1. Cabeçalho de abertura (título + frase de contexto).**
`Diário` + uma frase curta reaproveitando dado já calculado (ex. streak de constância do serviço existente). Substitui o `<h1>` solto.
*Por quê*: um diário se abre com algo humano, não com um título de sistema seguido direto de controles técnicos.

**2. Faixa de Marcos/conquistas, só quando houver conteúdo novo.**
Sempre visível (sem disclosure) quando existir ao menos 1 marco recente; **completamente ausente da árvore** quando não houver nenhum — não apenas oculta, para não reservar espaço.
*Por quê*: é o único elemento com potencial de "orgulho instantâneo" da tela — não pode competir por atenção com filtros.

**3. Barra de contexto e busca — 1 linha, 2 affordances no máximo.**
Chips de período (Hoje/Semana/Todas, cobrindo os casos reais) + busca sempre visível como campo com placeholder (não ícone que expande). O acesso a filtros avançados e estatísticas some da linha principal e vira um link textual discreto ("Ver estatísticas e mais filtros"), não um botão com o mesmo peso de busca/período.
*Por quê*: separa uso diário (período, busca) de uso ocasional (estatísticas, filtros avançados) por peso visual, não só por estar "atrás de um clique" — ambos hoje estão a um clique, mas com o mesmo peso.

**4. Lista de dias — o corpo real da tela.**
- Cabeçalho de dia com "Hoje"/"Ontem" com peso tipográfico e cor claramente distintos de datas antigas; grupo do dia atual com leve destaque de fundo.
- Comparação com o dia anterior como frase única, sempre presente quando aplicável, com fallback textual explícito quando não há dia anterior no conjunto filtrado (nunca some em silêncio).
- Cards de sessão no padrão atual de 3 segundos (título > horário/duração > contagem de questões) — mantido, é o que já funciona bem.
- Detalhe expandido com **Reflexão sempre em primeiro lugar**, com tratamento tipográfico distinto (diferenciado das seções técnicas); Questões/Revisões/Observações agrupadas visualmente como um bloco técnico único, com "Revisões" pendentes acionáveis (link para a revisão real).

**5. Painel "Ver estatísticas e mais filtros" — sob demanda, dividido em 2 zonas.**
"Seus números" (1 destaque — índice de acerto — + total/acertos/erros em texto de apoio) separado visualmente de "Filtrar" (categoria + os filtros avançados reduzidos ao mínimo necessário, com o que sobrar acessível via busca textual).
*Por quê*: o mesmo painel pode continuar existindo fisicamente, mas nunca mais ambíguo sobre o que contém.

**6. Fim da aba "Histórico" como estrutura separada.**
Vira um filtro de status dentro da mesma lista principal ("Todas / Concluídas / Canceladas"), usando o mesmo cartão (`.sj-entry`), apenas com menos campos exibidos para status não concluídos.
*Por quê*: elimina a segunda estrutura de dados/visual para a mesma pergunta de fundo — reduz a curva de reaprendizado a zero.

### Redução da informação inicialmente visível

**Hoje**, sem nenhum clique: abas + toolbar completa (chips + busca + botão Analisar com badge) + linha de estatística de busca condicional + faixa de Marcos + skeleton/lista. Isso é, em ordem de leitura forçada, 5 blocos de controle antes do primeiro card real.

**Proposto**: frase de abertura + faixa de Marcos (só quando há conteúdo) + 1 linha de contexto (chips + busca) + lista. 2 blocos de controle antes do primeiro card real — uma redução de aproximadamente **55-60%** na quantidade de elementos de decisão visíveis antes do conteúdo, sem remover nenhuma capacidade: tudo que sumiu da primeira dobra continua acessível a um clique a mais, nunca a dois.

---

# 11. As regras definitivas do Diário

Princípios a respeitar em qualquer evolução futura da página — não implementação, princípios.

- **O estudante nunca deve ler para descobrir se está evoluindo.** A resposta a "estou progredindo?" (Marcos, comparação diária) é sempre visível, nunca escondida atrás de disclosure algum.
- **Cada sessão ocupa o mínimo de espaço necessário para ser reconhecida — não para ser compreendida por completo.** Compreensão completa é uma ação deliberada (abrir o card); reconhecimento é passivo (rolar a lista).
- **Questões, Revisões e Observações são dados técnicos — vivem juntos, com o mesmo tratamento visual entre si, sempre depois da Reflexão.**
- **Reflexão é sempre o elemento mais convidativo da tela.** Nunca compete em peso visual com dado técnico algum.
- **Indicadores numéricos (estatísticas de questões) respondem a uma pergunta que o estudante faz raramente — nunca ocupam o mesmo nível de acesso que busca ou período.**
- **Resumos e comparações são sempre frases em linguagem humana — nunca símbolos, siglas ou setas que exigem decodificação.**
- **Nenhum conceito visual (linha do tempo, status, ícone) tem mais de uma representação diferente na mesma tela.**
- **Filtros e estatísticas são coisas diferentes** (ação vs. consulta) e, mesmo compartilhando espaço físico, são sempre visualmente separados.
- **Todo sinal de pendência é, sempre que possível, clicável** — leva à ação real, não apenas relata o fato.
- **Nada aparece vazio.** Uma seção sem conteúdo não existe na árvore — não aparece com "nenhum item encontrado".
- **Controles de uso diário (busca, período) ficam a 1 clique. Controles de uso ocasional (filtros avançados, estatísticas) podem ficar a 2, nunca ao mesmo nível de acesso dos primeiros.**
- **Duas abas nunca devem existir para responder à mesma pergunta de fundo.** Se duas visões mostram essencialmente "o que aconteceu", são a mesma lista com um filtro, não duas estruturas.
- **A tela inteira deve ser compreendida — o que foi feito, quanto, e se representa evolução — em até 5 segundos, sem nenhum clique.**

---

# 12. Roadmap de implementação

Cada etapa é independente, não introduz nenhuma funcionalidade nova, e cabe em uma única PR.

### Etapa 1 — Fundir o select de período completo aos chips rápidos
- **Objetivo**: eliminar o `<select>` de período como controle sempre visível; manter os 3 chips como único controle de período de primeiro nível, movendo as opções extras (7d/30d) para dentro do painel de filtros avançados.
- **Justificativa**: dois controles visíveis para a mesma decisão é redundância pura — o select nunca deveria competir por espaço com os chips.
- **Arquivos envolvidos**: `index.html` (`#sj-filter-period`, `.sj-quick-filters`), `studyJournalView.js` (handlers de período), `style.css` (`.sj-toolbar`, `.sj-quick-filters`).
- **Impacto esperado**: toolbar principal mais enxuta, sem perda de capacidade (7d/30d continuam disponíveis, só mudam de nível de acesso).
- **Complexidade**: baixa.
- **Riscos**: garantir que o estado ativo (ex. "30 dias" selecionado) continue visível de alguma forma mesmo sem o select na toolbar.
- **Critérios de aceite**: toolbar mostra só os 3 chips; 7d/30d continuam acessíveis via painel; nenhum filtro perde capacidade.

### Etapa 2 — Recolher os 5 filtros avançados para um segundo nível dentro do painel
- **Objetivo**: mover os 5 filtros avançados (reflexão/observações/revisões/questões/duração) para um bloco visualmente separado e discreto dentro do painel "Analisar", fora da linha de toolbar principal.
- **Justificativa**: são controles de uso raro que hoje ocupam o mesmo nível de prioridade de acesso que dados de consulta muito mais frequentes.
- **Arquivos envolvidos**: `index.html` (`#sj-advanced-filters`), `studyJournalView.js` (`_onFilterChange`), `style.css`.
- **Impacto esperado**: painel mais legível, sem remover nenhuma capacidade de filtro.
- **Complexidade**: baixa-média.
- **Riscos**: mínimo — reorganização visual dentro de um painel já existente.
- **Critérios de aceite**: os 5 filtros continuam funcionais; ficam claramente separados (visual e hierarquicamente) das estatísticas de questões dentro do mesmo painel.

### Etapa 3 — Separar "Seus números" de "Filtrar" dentro do painel "Analisar"
- **Objetivo**: introduzir divisão visual clara (título de subseção) entre estatísticas de questões e controles de filtro.
- **Justificativa**: hoje o painel mistura consulta e ação sob um rótulo só, confundindo a intenção de quem abre.
- **Arquivos envolvidos**: `index.html` (`#sj-panel`, `#sj-stats`, `#sj-advanced-filters`), `style.css`.
- **Impacto esperado**: reduz ambiguidade sobre o conteúdo do painel antes mesmo de abri-lo.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional.
- **Critérios de aceite**: painel exibe duas seções nitidamente distintas; nenhum dado ou filtro muda de comportamento.

### Etapa 4 — Reduzir os 4 stat cards de questões a 1 destaque + texto de apoio
- **Objetivo**: substituir a grade de 4 stat cards por um único número em destaque (índice de acerto) com total/acertos/erros como texto secundário.
- **Justificativa**: 4 números simultâneos exigem mais leitura do que a pergunta real ("estou acertando bem?") demanda.
- **Arquivos envolvidos**: `studyJournalView.js` (render de `#sj-stats-*`), `style.css` (`.stat-cards.sj-stats`).
- **Impacto esperado**: leitura mais rápida das estatísticas de questões, sem perda de nenhum número (todos continuam presentes, só reorganizados).
- **Complexidade**: baixa-média.
- **Riscos**: garantir que os números secundários continuem legíveis, não se tornem rodapé ilegível.
- **Critérios de aceite**: os 4 valores continuam visíveis; um deles (índice de acerto) tem destaque claro sobre os demais.

### Etapa 5 — Unificar a linguagem visual de "linha do tempo"
- **Objetivo**: escolher um único padrão visual (cartão) para Marcos, lista principal e aba Histórico, hoje divididos entre `.sj-entry` e `.ah-timeline`.
- **Justificativa**: elimina a inconsistência visual mais perceptível da página para o mesmo tipo de conteúdo.
- **Arquivos envolvidos**: `studyJournalView.js` (markup de Marcos), `activityHistoryView.js` (markup dos itens), `style.css` (`.ah-timeline*`, `.sj-entry*`).
- **Impacto esperado**: maior coerência visual, sem alterar dado algum.
- **Complexidade**: média-alta — toca 2 módulos e precisa validar todos os estados (vazio, poucos, muitos itens).
- **Riscos**: maior risco de regressão visual entre os 3 contextos.
- **Critérios de aceite**: os 3 contextos usam a mesma linguagem visual; nenhum comportamento de expansão ou dado é alterado.

### Etapa 6 — Fundir a aba "Histórico" como filtro de status dentro de "Concluídas"
- **Objetivo**: eliminar a aba "Histórico" como estrutura separada; adicionar um filtro de status ("Todas/Concluídas/Canceladas") à lista principal.
- **Justificativa**: as duas abas respondem à mesma pergunta de fundo com estruturas diferentes — forçam reaprendizado ao trocar.
- **Arquivos envolvidos**: `index.html` (`#sj-status-tabs`), `studyJournalView.js`, `activityHistoryView.js` (a lógica migra ou é descontinuada em favor do filtro unificado).
- **Impacto esperado**: uma única forma de consultar sessões, com todos os status cobertos; reduz a superfície de manutenção também.
- **Complexidade**: alta — depende da Etapa 5 já ter unificado o padrão visual.
- **Riscos**: validar que todos os status (concluída/cancelada/em andamento) continuam claramente identificáveis no cartão unificado; checar impacto em paginação/performance da lista combinada.
- **Critérios de aceite**: existe um único ponto de consulta de sessões com filtro de status; nenhuma sessão ou dado deixa de estar acessível.

### Etapa 7 — Tornar "Revisões" pendentes acionáveis
- **Objetivo**: transformar cada item de revisão pendente listado no detalhe do card num link real para a tela de revisão correspondente.
- **Justificativa**: hoje é só leitura passiva — perde a chance de transformar o Diário em ponto de partida de ação.
- **Arquivos envolvidos**: `studyJournalView.js` (`_renderDetail`, seção Revisões), navegação já existente para a tela de revisões.
- **Impacto esperado**: converte um dado informativo em ação direta, sem criar telas novas.
- **Complexidade**: baixa-média — depende de já existir uma rota/estado para abrir a revisão específica.
- **Riscos**: garantir que o link não quebre o estado de expansão do card ao navegar.
- **Critérios de aceite**: clicar numa revisão pendente leva à revisão correspondente; revisões concluídas continuam como registro não clicável.

### Etapa 8 — Adicionar frase de abertura contextual e substituir o `<h1>` solto
- **Objetivo**: acrescentar ao cabeçalho da página uma frase curta de contexto (streak/constância), reaproveitando serviço já existente.
- **Justificativa**: dá à tela uma abertura mais humana, alinhada ao propósito de diário.
- **Arquivos envolvidos**: `index.html` (`#page-journal`), `studyJournalView.js`, `style.css`.
- **Impacto esperado**: primeira impressão mais pessoal.
- **Complexidade**: média — decidir qual dado reaproveitar sem duplicar cálculo já existente (evitar redundância com o Progresso).
- **Riscos**: garantir fallback para estudante novo (sem streak ainda).
- **Critérios de aceite**: cabeçalho inclui frase de contexto; nenhum cálculo novo criado; nunca aparece vazio.

### Etapa 9 — Garantir fallback explícito quando a comparação diária não existe
- **Objetivo**: em vez de a comparação simplesmente sumir quando não há dia anterior no conjunto filtrado, exibir uma frase neutra explicando por quê.
- **Justificativa**: elimina a inconsistência percebida de "ontem tinha comparação, hoje com filtro não tem".
- **Arquivos envolvidos**: `studyJournalView.js` (`_renderDayComparison`), `style.css`.
- **Impacto esperado**: comportamento mais previsível e menos "quebrado" aos olhos do estudante.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional.
- **Critérios de aceite**: a linha de comparação sempre existe visualmente (com frase real ou fallback), nunca desaparece sem explicação.

### Etapa 10 — Corrigir a semântica dos ícones de Marcos
- **Objetivo**: substituir os ícones reaproveitados sem relação semântica por ícones já existentes no acervo (`icons.js`) que reflitam melhor cada tipo de marco.
- **Justificativa**: elimina associação visual incorreta, sem custo de novo design.
- **Arquivos envolvidos**: `studyJournalView.js` (`MILESTONE_ICON_GLYPHS`), `icons.js` (consulta apenas).
- **Impacto esperado**: maior coerência simbólica.
- **Complexidade**: baixa.
- **Riscos**: mínimo.
- **Critérios de aceite**: cada tipo de marco usa ícone semanticamente correspondente; nenhum SVG novo criado.

### Etapa 11 — Unificar o esqueleto de carregamento à forma real dos cards
- **Objetivo**: substituir o skeleton genérico por um que reflita cabeçalho de dia + card, evitando salto de layout.
- **Justificativa**: reduz a sensação de "recarregar" a tela visualmente ao terminar de carregar.
- **Arquivos envolvidos**: `studyJournalView.js` (`skeletonRowsMarkup`), `style.css`.
- **Impacto esperado**: transição de carregamento mais suave.
- **Complexidade**: baixa.
- **Riscos**: nenhum funcional.
- **Critérios de aceite**: skeleton tem altura e forma próximas do conteúdo real; nenhum salto perceptível de layout.

### Etapa 12 — Padronizar espaçamento das regras `.sj-*` aos tokens do design system
- **Objetivo**: substituir valores rem soltos por tokens de espaçamento (`var(--space-*)`) já usados no restante do produto.
- **Justificativa**: consistência de ritmo vertical com o resto do app — invisível como "bug" isolado, mas perceptível como qualidade geral.
- **Arquivos envolvidos**: `style.css` (todas as regras `.sj-*`).
- **Impacto esperado**: maior coerência visual sistêmica, zero mudança de comportamento.
- **Complexidade**: baixa — trabalho mecânico de substituição, com checagem visual.
- **Riscos**: mínimo — validar que nenhum valor visualmente decisivo (ex. espaçamento fino calibrado) seja alterado sem intenção.
- **Critérios de aceite**: `.sj-*` usa exclusivamente tokens de espaçamento do design system; nenhuma mudança perceptível de layout fora do esperado.

---

*Nenhuma melhoria foi implementada nesta rodada — este documento é exclusivamente auditoria e plano.*
