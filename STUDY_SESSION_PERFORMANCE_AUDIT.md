# Auditoria — Sessão de Estudo como Centro de Desempenho (Anoti)

> **Status: somente auditoria.** Nenhum código de produção, migration, UI ou serviço foi
> alterado por este documento. Escopo: entender o que existe hoje, o que falta, e propor
> um plano de etapas — a decisão sobre quais etapas implementar fica para depois.
>
> **Fontes:** `activitySessionService.js`, `studySessionView.js`, `questionService.js`,
> `sessionQuestionsService.js`, `studyStatisticsService.js`, `reviewService.js`,
> `reviewSessionService.js`, `subjectProgressService.js`, `activityDashboardService.js`,
> `studyJournalView.js`, `docs/ARCHITECTURE.md`, `sql/11`, `13`, `15`, `16`, `17`, `18`,
> `21`, `25`, e as auditorias já existentes `SESSAO_UX_UI_AUDIT.md` e
> `STUDY_SESSION_LIFECYCLE_AUDIT.md` (reaproveitadas, não repetidas).

---

## 1. Diagnóstico atual

O Anoti já fez, sem anunciar, boa parte do caminho que este pedido descreve. A cadeia de
domínio **Compromisso → Sessão → Questões → Revisões → Reflexão → Projeções** existe desde
a F6–F8 (`docs/ARCHITECTURE.md`, "Modelo de Domínio") e já trata "tempo" como um fato entre
outros, não como o único registro. O problema não é ausência de dados — é que **os dados de
desempenho existem, mas moram na Sessão como um apêndice do cronômetro**, e só ganham
tratamento de "desempenho de verdade" (percentual de acerto, indicador colorido, resumo por
matéria) em telas que o estudante visita *depois*, principalmente o **Diário**
(`studyJournalView.js`). Durante a própria Sessão, questões são só uma lista de lançamentos
que cresce — sem taxa de acerto visível, sem indicador de desempenho, sem qualquer leitura
agregada até o estudante sair da tela.

Em uma frase: **o motor de desempenho já existe (`studyStatisticsService.js`,
`subjectProgressService.js`), mas está desligado da experiência ao vivo da Sessão** — ele só
liga no Diário, retrospectivamente.

Isso confirma e refina o que a `SESSAO_UX_UI_AUDIT.md` já apontou de fora (nota 7/10, "a
tela sabe o que esconder, mas ainda não sabe fazer o que mostra parecer inevitável"): visto
de dentro dos dados, a Sessão hoje comunica "estou rodando um cronômetro, com um apêndice de
questões" — não "estou resolvendo questões e medindo meu desempenho", porque a *camada de
apresentação* nunca lê o resultado agregado do que ela mesma está gravando.

---

## 2. Modelo de dados existente

```
activity_sessions  (sql/11, 17, 21) — 1 sessão de estudo
  ├─ status: running | paused | finished | cancelled
  ├─ started_at, ended_at, duration_minutes   ─ tempo bruto
  ├─ paused_ms, paused_at                      ─ tempo líquido (pausas descontadas)
  ├─ event_id → events (opcional, ON DELETE SET NULL)
  ├─ category_id → categories (opcional, ON DELETE SET NULL)
  └─ title, content, session_date, planned_duration_minutes  (sessão avulsa, sem event_id)

questions  (sql/15, 25) — 1:N com activity_sessions, ON DELETE CASCADE
  ├─ session_id (NOT NULL)
  ├─ question_type: multiple_choice | true_false | open | flashcard
  ├─ status: pending | answered | skipped        ← ANDAMENTO, nunca resultado
  ├─ difficulty: easy | medium | hard
  ├─ subject, topic (texto livre)
  └─ correct_count, incorrect_count (F17)         ← RESULTADO — contadores, não booleano

reviews  (sql/13, 16) — N:1 com events (NOT NULL), 0..1 com activity_sessions (nullable)
  ├─ event_id (NOT NULL, ON DELETE CASCADE)
  ├─ session_id (nullable, ON DELETE SET NULL)     ← "quem executou a revisão"
  ├─ status: pending | completed | skipped
  ├─ scheduled_date, completed_at
  └─ review_type: manual | automatic · origin: event | ai | user

reflections  (sql/18) — 1:1 com activity_sessions, ON DELETE CASCADE
  └─ content (texto livre — "o que aprendi", distinto de activity_sessions.notes)
```

**Pontos estruturais já corretos, que a auditoria confirma e recomenda preservar:**

- `questions.session_id` é **obrigatório** — não existe "questão órfã"; toda questão nasce
  de uma sessão (`sql/15_questions.sql`, comentário explícito: "o mesmo desenho já usado em
  reviews.event_id").
- `questions.status` (andamento) e `correct_count`/`incorrect_count` (resultado) já são
  campos **separados** — o schema já reconhece a distinção pedida no enunciado ("status
  aqui é o andamento... nunca correto/incorreto... desempenho é um consumidor futuro
  derivado, não um campo bruto"). Isso é exatamente o princípio "questão = fato, desempenho
  = projeção" que o pedido está pedindo para toda a Sessão.
- Cada linha de `questions` representa um **lançamento** (1 ou várias questões da mesma
  matéria/tópico/tipo, ex.: "resolvi 8 de Cardiologia, errei 2"), não uma questão individual
  com gabarito — desenho deliberado da F17 para evitar N inserts por bloco resolvido.
- `duration_minutes` já é calculado uma única vez, no servidor, a partir de timestamps
  (`started_at`/`paused_ms`/`paused_at`) — nunca por acumulação de tick de cronômetro
  (`STUDY_SESSION_LIFECYCLE_AUDIT.md`, seção 1.2). Não há inflação de tempo por client-side
  drift.
- `reviews.session_id` já modela exatamente a relação "Sessão → Revisões → Questões →
  Desempenho" pedida no Fluxo C, embora incompleta (ver Seção 9).

---

## 3. Fluxo atual de questões

**Onde:** `studySessionView.js` (UI) → `sessionQuestionsService.js` (orquestração) →
`questionService.js` (CRUD puro) → `questions` (Supabase).

**Registro rápido** (`#ss-q-quick-total` / `#ss-q-quick-errors`, 2 campos): grava um
lançamento com `question_type: "multiple_choice"`, `status: "answered"`,
`difficulty: "medium"`, `subject: null`, `topic: null` fixos, e apenas quantidade/erros
informados pelo usuário. Cobre "resolvi N questões, errei M" em dois campos e um clique.

**Registro detalhado** ("+ Adicionar com detalhes"): os mesmos campos, mas com tipo,
status (`pending`/`answered`/`skipped`), dificuldade, matéria e tópico editáveis
individualmente, além de quantidade/erros.

**O que já é possível registrar hoje**, mapeado 1:1 contra a pergunta do enunciado:

| Campo pedido | Existe? | Onde |
|---|---|---|
| correta/incorreta | ✅ | `correct_count`/`incorrect_count` (contador, não boolean por questão) |
| matéria | ✅ | `questions.subject` (texto livre) |
| assunto | ⚠️ parcial | `questions.topic` — um único campo, sem distinguir "assunto" de "subtópico"; ver Seção 10 |
| tópico | ✅ | `questions.topic` (mesmo campo que "assunto" acima — são o mesmo campo hoje) |
| dificuldade | ✅ | `questions.difficulty` (easy/medium/hard) |
| tempo | ❌ | não existe `time_spent`/`seconds_per_question` nem no schema nem na UI |
| origem | ⚠️ parcial | `question_type` existe, mas não há "de onde veio" (livro, banco de questões, plataforma X) |
| questão de prova/simulado | ❌ | não existe conceito de simulado/prova (ver Fluxo B) |
| revisão | ✅ indireto | uma questão pertence a uma **Sessão**, e uma Sessão pode estar vinculada a uma Revisão (`reviews.session_id`) — mas a questão em si não sabe se foi respondida "durante uma revisão" vs. "durante um estudo novo" (ver Seção 10) |

`questionService.js` já expõe `listBySessions(sessionIds)` (consulta em lote, evita N+1) —
usado por `studyJournalView.js`, não por `studySessionView.js` (a Sessão só olha para as
próprias questões, nunca para o histórico agregado).

**Menor modelo necessário para análises futuras** (o que já existe cobre a maior parte —
ver lacunas específicas na Seção 9):
`session_id, subject, topic, difficulty, correct_count, incorrect_count, question_type,
created_at` — todos já presentes. Faltam apenas `time_spent` (opcional) e um vínculo formal
com Revisão/Simulado quando esses conceitos existirem.

---

## 4. Fluxo atual de simulados

**Não existe.** Confirmado por busca no projeto inteiro: não há tabela, service, ou
conceito de "simulado", "prova", "lista de questões" ou "banco de questões" em nenhuma
camada (schema, services, views). O único resultado positivo de uma busca ampla por
"exam"/"prova" no código são falsos positivos (`auth.js` "prova de identidade" em texto de
erro, `recommendationEngine.js`/testes usando a palavra em outro sentido).

O que existe e **poderia** ancorar um Simulado no futuro, sem redesenhar nada:

- `questions` já é "um lançamento de N questões da mesma matéria/tópico" — um simulado
  poderia ser modelado como uma "sessão com múltiplos lançamentos de questões", sem
  mudança estrutural, **ou** como uma entidade nova que agrupa lançamentos.
- `activity_sessions.source` já é um enum (`quick | event | manual`) — adicionar `"mock_exam"`
  seria a menor mudança possível para distinguir "esta sessão foi um simulado", mas isso
  **não substitui** ter um conceito de Simulado/Prova como entidade própria (nome da prova,
  banca, ano, nota de corte, etc.) — só marca a sessão.

**Conforme instrução do enunciado, esta lacuna não é implementada aqui — apenas
documentada.** A cadeia pedida no Fluxo B (`SIMULADO → QUESTÕES → SESSÃO → DESEMPENHO`) não
tem hoje nenhum nó "SIMULADO"; o que existe é só `SESSÃO → QUESTÕES → DESEMPENHO`.

---

## 5. Fluxo atual de revisões

**Onde:** `reviewService.js` (CRUD + geração manual de datas +1/+7/+30) +
`reviewSessionService.js` (vínculo opcional Revisão↔Sessão).

Uma Revisão (`reviews`) pertence a um **Compromisso** (`event_id` obrigatório), tem uma
data prevista (`scheduled_date`) e um status de andamento (`pending`/`completed`/`skipped`).
Ela **pode** ser vinculada à Sessão que a executou (`reviews.session_id`, nullable,
`ON DELETE SET NULL`) via `associateReview()`/`unlinkReview()` — mas essa é a única
conexão. Uma revisão marcada `completed` não sabe:

- quantas questões foram resolvidas durante ela (a Sessão vinculada tem `questions`, mas
  nenhuma consulta hoje filtra "questões desta sessão que também é uma revisão");
- qual foi o desempenho nessas questões;
- se a revisão em si "foi bem" ou "vai precisar de outra revisão em breve".

`reviewService.complete(id)` só grava `status: "completed"` + `completed_at` — nenhum dado
de desempenho é pedido ou gravado no momento da conclusão.

**Respostas hoje às perguntas do Fluxo C:**

| Pergunta | Responde hoje? |
|---|---|
| Quantas questões foram revisadas? | ❌ — nenhuma consulta soma questões de sessões vinculadas a revisões |
| Qual foi o desempenho? | ❌ — mesma lacuna |
| Quais assuntos estão sendo revisados? | ❌ — `reviews` não tem `subject`/`topic`; herdaria de `events.category` (texto livre) na melhor das hipóteses |
| Quais assuntos continuam com dificuldade? | ❌ — nenhum histórico de desempenho por assunto ao longo do tempo, só o snapshot atual (`subjectProgressService`, ver Seção 6) |
| Quais assuntos apresentam domínio? | ❌ — mesma lacuna, e ver Fluxo D sobre por que "estudado" ≠ "dominado" |

**O que já existe e é reaproveitável:** o vínculo `reviews.session_id` é exatamente o fio
que falta puxar — como a Sessão já carrega `questions`, basta que um consumidor futuro
faça `reviews → session_id → questions → correct_count/incorrect_count` para responder as
duas primeiras perguntas sem nenhuma mudança de schema. As duas últimas (assuntos com
dificuldade/domínio) dependem do Fluxo D, que tem uma lacuna mais profunda.

---

## 6. Fluxo atual de matérias/assuntos

**Onde:** `subjectProgressService.js` — projeção pura (nunca persiste, recalcula a cada
chamada), consolidando Sessões + Questões por matéria.

**De onde vem "matéria" hoje** — duas fontes diferentes, nunca uma terceira:

1. Questão → `questions.subject` (campo próprio, texto livre).
2. Sessão → **não tem campo de matéria próprio.** Se a sessão tem `event_id`, a matéria é
   emprestada de `events.category` (texto livre do compromisso). Sessões avulsas
   (`source: "quick"`/sem `event_id`) caem no grupo "sem matéria".

Isso significa que **uma sessão iniciada a partir de um compromisso "herda" a matéria do
compromisso**, mesmo que as questões respondidas nela sejam de um assunto diferente — não
há reconciliação entre `events.category` e `questions.subject` quando divergem; são
tratados como dois agrupamentos paralelos por `subjectProgressService`, nunca fundidos por
questão individual.

**O que `getSubjectProgress()`/`listSubjectsProgress()` calculam hoje** (por matéria):
`sessionsCount`, `finishedSessionsCount`, `cancelledSessionsCount`, `questionsCount`,
`totalMinutes`, `lastActivityAt`, e um `status` de 3 valores:
`sem_atividade | com_atividade | em_andamento`.

**O que isso NÃO calcula — e é a lacuna central do Fluxo D:**

- Nenhuma taxa de acerto por matéria (`correct_count`/`incorrect_count` de `questions`
  nunca são somados aqui — `subjectProgressService.js` só conta `questionsCount`, não
  resultado).
- Nenhuma noção de "domínio" — `status` responde só "existe atividade recente?", não
  "o estudante está indo bem nessa matéria?". Uma matéria com 50 questões e 20% de acerto
  teria o mesmo `status: "com_atividade"` que uma com 50 questões e 95% de acerto.
- Nenhuma granularidade abaixo de matéria — `questions.topic` existe no schema mas
  **não é agregado** por `subjectProgressService.js` (só `subject` é agrupado); "domínio
  por tópico/assunto específico" não é calculável hoje sem nova agregação.

**Confirmação explícita do enunciado — "estudado" ≠ "dominado":** o próprio comentário do
serviço já reconhece isso ("O que NÃO é calculado aqui... percentual de acerto, desempenho,
ranking... etapas futuras terão serviços próprios"). Hoje, tudo que o Anoti sabe dizer é
"você teve atividade nesta matéria" — nunca "você está bem ou mal nesta matéria". Os dados
brutos para calcular domínio de forma confiável (accuracy por assunto ao longo de várias
sessões, com peso maior para questões recentes) **já existem** (`correct_count`,
`incorrect_count`, `subject`, `topic`, `created_at`) — só não são agregados dessa forma em
lugar nenhum do código hoje.

---

## 7. Fluxo atual de tempo

Coberto em profundidade por `STUDY_SESSION_LIFECYCLE_AUDIT.md` (não repetido aqui). Resumo
relevante a esta auditoria:

- O tempo já é a métrica **mais madura tecnicamente** do domínio (server-timestamp based,
  pausas descontadas corretamente, sem drift de cliente).
- Mas é a **única** métrica com tratamento visual de destaque na Sessão hoje
  (`--font-size-4xl`, posição central) — nenhuma métrica de desempenho (questões, acerto)
  recebe tratamento equivalente, mesmo com o produto pretendendo que questões sejam o modo
  de estudo predominante.
- Não há hoje nenhum risco de "tempo tratado incorretamente" no sentido técnico — o risco
  é de **hierarquia de produto**: o tempo domina visualmente uma tela cujo conteúdo mais
  relevante (segundo este pedido) deveria ser desempenho.

---

## 8. Dados já disponíveis

Já persistidos e prontos para consumo, sem qualquer migration:

- **Tempo:** `started_at`, `ended_at`, `duration_minutes`, `paused_ms`, `paused_at`,
  `planned_duration_minutes` (quando aplicável).
- **Questões:** `correct_count`, `incorrect_count` por lançamento; `subject`, `topic`,
  `difficulty`, `question_type`, `status` (andamento), `created_at`.
- **Sessão:** `status` (running/paused/finished/cancelled), `category_id`, `event_id`,
  `title`/`content`/`session_date` (sessões avulsas), `source`.
- **Revisão:** `status`, `scheduled_date`, `completed_at`, `review_type`, `origin`,
  `session_id` (vínculo opcional com a sessão que a executou).
- **Reflexão:** `content` (1:1 com a sessão) — texto livre de aprendizado, distinto de
  `notes`.
- **RPC já pronta:** `get_question_statistics(start, end, category_id, subject)` —
  agregação server-side de total/acertos/erros, com filtro por período/categoria/matéria,
  já usada por `studyStatisticsService.getUserQuestionStatistics()`.
- **Funções puras já prontas, só não conectadas à Sessão ao vivo:**
  `summarizeSessionQuestions(questions)` (soma acertos/erros/total/% de uma lista já
  carregada — usada hoje só pelo Diário) e `accuracyIndicator(percent)` (🟢/🟡/🔴).

---

## 9. Dados ausentes

Confirmado por ausência no schema e em todos os services lidos:

| Dado | Pertenceria a | Observação |
|---|---|---|
| Tempo por questão/lançamento | `questions` | nenhum campo `time_spent`/`seconds`; hoje só existe tempo agregado da sessão inteira |
| Conceito de Simulado/Prova | novo domínio | ver Fluxo B — lacuna documentada, não implementada |
| Vínculo formal "esta questão foi respondida numa revisão" | `questions` ou relação | hoje só a **Sessão** sabe se está vinculada a uma Revisão (`reviews.session_id`); uma Questão dentro dessa sessão não carrega esse contexto por si só — se uma sessão mistura estudo novo + revisão (hoje possível, nada impede), não dá para separar quais lançamentos foram "revisão" |
| Distinção assunto vs. tópico (hierarquia) | `questions` | `topic` é um único campo texto livre; matéria→assunto→tópico (3 níveis, pedido no enunciado) hoje só existe como 2 níveis (`subject`, `topic`), sem uma hierarquia formal nem taxonomia controlada (é texto livre, sujeito a variação de digitação: "Cardiologia" vs "cardiologia" vs "Cardio") |
| Métrica de "domínio" por assunto | projeção (não persistida) | dados brutos existem (Seção 6); o cálculo em si não existe em nenhum service |
| Origem da questão (livro/banco/plataforma) | `questions` | `question_type` descreve o formato (múltipla escolha etc.), não a fonte |
| Consistência/frequência de estudo dedicada a desempenho | projeção | `studyStreakService.js` já existe mas mede só dias com sessão `finished` — não cruza com "dias em que o estudante praticou questões" |

---

## 10. Dados duplicados ou desnecessários

- **`subject`/`topic` como texto livre duplicado entre `questions` e `events.category`:**
  não é duplicação de schema (são colunas diferentes, em tabelas diferentes, com
  propósitos diferentes — categoria do compromisso vs. matéria da questão), mas é uma
  **duplicação conceitual de fato**: hoje existem dois "nomes de matéria" no sistema que
  nunca são reconciliados (`subjectProgressService.js` trata como agrupamentos paralelos,
  nunca fundidos). Isso não é urgente de corrigir, mas é a raiz de qualquer futura
  inconsistência entre "progresso por matéria" (que mistura as duas fontes) e "estatística
  de questões" (que só olha `questions.subject`).
- **`activity_sessions.notes` vs. `reflections.content`:** já documentado como
  intencionalmente distinto no schema (`sql/18_reflections.sql`: "Observações representam
  o estudo em si... Reflexão representa a aprendizagem") — **não é duplicação**, é uma
  separação correta que vale preservar e não confundir na UI.
- **Nenhum campo do schema atual é órfão/não utilizado** — toda coluna lida nesta auditoria
  tem pelo menos um consumidor real (`questions.status`, embora pouco lido pela UI de
  estatísticas hoje, é usado no formulário detalhado e na listagem da Sessão).
- **Nenhum dado "calculável mas persistido por engano" foi encontrado** — o time de
  domínio já segue rigorosamente o princípio "fato vs. projeção" (comentários dos próprios
  services/migrations reforçam isso repetidamente: "nunca persistido", "recalculado a cada
  chamada"). Este é um ponto forte da arquitetura atual que deve ser mantido em qualquer
  nova métrica.

---

## 11. Problemas de UX da Sessão (sob a ótica de desempenho)

Complementar à `SESSAO_UX_UI_AUDIT.md` (que já cobre hierarquia visual geral); aqui,
especificamente sobre a pergunta "o estudante entende que está medindo desempenho?":

1. **A lista de questões da sessão nunca mostra taxa de acerto** — `_renderQuestionsList()`
   em `studySessionView.js` mostra tipo, status, dificuldade e matéria/tópico por item, mas
   nunca um agregado (X acertos, Y erros, Z% de acerto) da sessão em andamento. O estudante
   vê a lista crescer, mas nunca vê "como estou indo até agora" — mesmo os dados
   (`correct_count`/`incorrect_count` por lançamento) já estarem carregados em memória
   (`_sessionQuestions`) e a função pura para somá-los já existir
   (`summarizeSessionQuestions`) e ser usada em outra tela.
2. **O modal de encerramento (`#ss-finish-modal`) não mostra nenhum dado de desempenho** —
   confirmado lendo os campos do modal: título do compromisso, categoria, conteúdo,
   horário de início/fim, tempo líquido, campo de reflexão. Nenhum resumo de questões
   respondidas/acertos/% de acerto aparece no momento de fechar a sessão, mesmo quando a
   sessão teve questões registradas — o encerramento é 100% sobre tempo e contexto, 0%
   sobre desempenho.
3. **O painel de detalhes trata Questões como "mais um formulário de registro"**, não como
   "meu desempenho até agora" — reforça a leitura de "estou preenchendo um sistema", indo
   na direção oposta do princípio pedido no enunciado.
4. **Revisões, dentro da Sessão, são só um formulário de associar/criar** — nenhum
   indicador (mesmo que textual: "3 revisões vinculadas") aparece fora do painel; o
   cronômetro nunca comunica "você também está revisando", só "você está estudando".

---

## 12. Problemas de arquitetura

1. **Desempenho é uma função pura já pronta, mas só é chamada por uma tela (Diário)** —
   não é um problema de dado ausente, é um problema de **fiação**: `studyStatisticsService`
   existe exatamente para este propósito, e sua reutilização na Sessão ao vivo é uma
   mudança de "chamar a função em mais um lugar", não de criar nada novo.
2. **`subjectProgressService.js` mistura duas fontes de matéria sem reconciliação** (Seção
   10) — arquiteturalmente correto por ora (nenhuma perda de dado), mas é uma dívida que
   cresce a cada nova métrica que dependa de "matéria" como chave de agrupamento (ex.: uma
   futura "taxa de acerto por matéria" herdaria a mesma ambiguidade).
3. **Revisão não enxerga Questões através da Sessão** — o vínculo (`reviews.session_id`)
   existe, mas nenhum service hoje faz o `JOIN` conceitual "questões desta sessão que é uma
   revisão" — é uma lacuna de agregação, não de schema.
4. **Não há hierarquia formal matéria → assunto → tópico** — hoje é achatado em 2 campos de
   texto livre (`subject`, `topic`); qualquer relatório futuro por "assunto" herda a
   fragilidade de texto livre (variação de grafia, sem autocomplete/normalização).
5. **O princípio "fato vs. projeção" (dado bruto persistido, métrica sempre derivada em
   memória) já está bem estabelecido e deve ser o guia de qualquer nova métrica** — este é
   o maior ativo arquitetural encontrado nesta auditoria, e o risco real de qualquer
   implementação futura é quebrá-lo (ex.: persistir "taxa de acerto" como coluna, em vez de
   sempre recalculá-la).

---

## 13. Modelo conceitual recomendado

Sem alterar schema nesta etapa — apenas reorganizando a leitura do que já existe:

```
Sessão (fato: tempo)
  │
  ├─→ Questões (fato: lançamentos com resultado)
  │     └─→ Desempenho (projeção: acerto %, por matéria/tópico/dificuldade)
  │
  ├─→ Revisões vinculadas (fato: session_id em reviews)
  │     └─→ Questões da(s) sessão(ões) de revisão (projeção: desempenho em revisão)
  │
  └─→ Conteúdo (fato: category_id/event_id → matéria; questions.subject/topic → assunto)
        └─→ Domínio por assunto (projeção NOVA, ainda não calculada em nenhum lugar)

Simulado (LACUNA — não existe hoje; documentado, não implementado)
  └─→ Questões → Sessão → Desempenho (mesma cadeia acima, se/quando implementado)
```

**Hierarquia de métricas proposta** (adotando a do enunciado, validada contra os dados
reais encontrados):

- **Nível 1 — Desempenho** (dado já parcialmente disponível: questões/acertos/% via
  `studyStatisticsService`; simulados ausentes — Fluxo B).
- **Nível 2 — Conteúdo** (dado parcialmente disponível: matérias/assuntos via
  `subjectProgressService`; domínio/dificuldade ausentes — precisam de nova agregação
  sobre dados já existentes, não de nova coluna).
- **Nível 3 — Esforço** (dado já maduro: tempo/sessões via `activitySessionService`/
  `activityDashboardService`/`studyStreakService`).

Essa hierarquia já é **compatível** com a arquitetura atual sem mudança de schema — o
trabalho real é de agregação (Nível 2) e de fiação da UI ao vivo (Nível 1 dentro da
Sessão), não de captura de dado novo, com exceção de Simulados (schema novo, fora de
escopo aqui) e tempo por questão (schema novo, menor).

---

## 14. Métricas que o Anoti deverá conseguir calcular

Contra os dados já existentes hoje (sem nenhuma migration), o Anoti já pode calcular:

| Métrica | Calculável hoje? | Fonte |
|---|---|---|
| Questões/dia, questões/semana | ✅ | `questions.created_at` agregado por dia/semana (sem service dedicado ainda, mas dado presente) |
| Taxa de acerto (global) | ✅ | `get_question_statistics` RPC / `studyStatisticsService` |
| Taxa de acerto por matéria | ⚠️ parcial | `questions.subject` existe; falta agregação de `correct_count`/`incorrect_count` por `subject` (hoje `subjectProgressService` só conta `questionsCount`, não resultado) |
| Taxa de acerto por assunto/tópico | ⚠️ parcial | mesma lacuna, no nível de `questions.topic` |
| Taxa de acerto por dificuldade | ⚠️ parcial | `questions.difficulty` existe; nenhuma agregação por dificuldade em nenhum service hoje |
| Desempenho por simulado/prova | ❌ | depende do Fluxo B (não existe) |
| Questões revisadas | ⚠️ parcial | calculável via `reviews.session_id → questions`, mas nenhum service faz esse `JOIN` hoje |
| Evolução do desempenho (série temporal) | ⚠️ parcial | `questions.created_at` permite série temporal; nenhuma agregação temporal de acerto existe hoje (só filtro today/week/month/custom no RPC, sem "evolução ao longo de N semanas") |
| Tempo por questão | ❌ | dado ausente (Seção 9) |
| Tempo por simulado | ❌ | depende do Fluxo B |
| Consistência de estudo | ✅ (parcial ao desempenho) | `studyStreakService.js` já mede dias consecutivos com sessão `finished` — mede esforço, não consistência de prática de questões especificamente |
| Assuntos dominados vs. com dificuldade | ❌ | dados brutos existem; cálculo de "domínio" não existe em nenhum service (Seção 6) |

---

## 15. O que NÃO devemos medir

Para não repetir o erro descrito no enunciado (transformar a Sessão num painel
administrativo com "dezenas de métricas"), esta auditoria recomenda explicitamente **não**
introduzir, nem nesta nem em etapas futuras próximas, salvo pedido explícito:

- **Rankings ou comparação entre usuários** — o domínio inteiro do Anoti é individual
  (RLS por `user_id` em todas as tabelas); nada na arquitetura sugere ou prepara
  comparação social, e isso mudaria a natureza do produto.
- **Métricas de vaidade sem ação associada** (ex.: "total de cliques", "tempo na tela") —
  o princípio do produto é "o que eu pratiquei, como me saí", não engajamento com o app em
  si.
- **Gráficos/dashboards dentro da própria tela de Sessão** — já é uma decisão de produto
  explícita no enunciado ("A Sessão deve ser operacional"); qualquer métrica agregada
  visível ao vivo deve ser 1 número (ex.: "7/10 · 70%"), nunca um gráfico.
- **"Tempo por questão" como métrica de pressão/velocidade** — se implementado no futuro
  (Seção 9), deve ser informativo ("você levou em média X min por questão"), nunca
  apresentado como meta/cronômetro de corrida — o enunciado já é explícito sobre não
  transformar tempo na métrica dominante.
- **Domínio calculado a partir de poucas questões** — uma "taxa de acerto" de 2 questões
  (100% ou 0%) não deveria ser rotulada como "domínio"/"dificuldade" sem um piso mínimo de
  amostra; qualquer cálculo futuro de domínio precisa definir esse piso explicitamente
  (não decidido nesta auditoria — sinalizado como decisão de produto pendente).
- **Persistir qualquer uma dessas métricas como coluna nova** — seguindo o princípio já
  estabelecido no código (Seção 12, item 5), todas continuam sendo projeções calculadas em
  memória a partir de `questions`/`activity_sessions`/`reviews`, nunca gravadas.

---

## 16. Plano de implementação (proposto — aguardando decisão do desenvolvedor)

Cada etapa é independente, cabe em uma PR, e nenhuma delas introduz gráficos, dashboards ou
dezenas de métricas na Sessão — o objetivo é sempre "1 número a mais no lugar certo".

### Etapa 1 — Mostrar desempenho ao vivo na lista de questões da Sessão
- **Objetivo:** exibir um resumo compacto (ex.: "6 questões · 5 acertos · 83%") acima da
  lista de questões já existente no painel de detalhes, reaproveitando
  `summarizeSessionQuestions()` e `accuracyIndicator()` (já existem, já testados, já usados
  pelo Diário).
- **Arquivos:** `studySessionView.js` (`_renderQuestionsList` ou uma nova
  `_renderQuestionsSummary`), `index.html` (`.ss-questions-block`), `style.css` (elemento
  de texto simples, sem gráfico).
- **Banco/schema:** nenhuma alteração.
- **Impacto:** alto para a percepção de "estou medindo desempenho", baixo esforço (reusa
  função pura já testada).
- **Risco:** baixo — puramente aditivo, nenhum dado novo, nenhuma migration.
- **Testes:** `tests/views/studySessionView.test.js` — resumo aparece/atualiza a cada
  questão adicionada/editada/removida; resumo correto com lançamentos de F17 (com
  contadores) e anteriores (0/0, se existirem).
- **Critérios de aceite:** ao registrar uma questão, o resumo (total/acertos/%) atualiza
  sem reload; nenhum gráfico ou card extra é introduzido.

### Etapa 2 — Resumo de desempenho no modal de encerramento
- **Objetivo:** quando a sessão teve questões registradas, mostrar o mesmo resumo
  (total/acertos/%) no `#ss-finish-modal`, junto (não substituindo) ao tempo total já
  exibido — sem novo I/O, os dados já estão em `_sessionQuestions` em memória no momento
  do encerramento.
- **Arquivos:** `studySessionView.js` (`_openFinishModal`), `index.html`
  (`#ss-finish-modal`), `style.css`.
- **Banco/schema:** nenhuma alteração.
- **Impacto:** alto — é o momento de maior potencial de reforço (a `SESSAO_UX_UI_AUDIT.md`
  já pede reforço emocional no encerramento; aqui o reforço é dado real de desempenho, não
  só celebração vazia).
- **Risco:** baixo — condicional (só aparece se houver questões), não quebra sessões sem
  questões registradas.
- **Testes:** modal com sessão sem questões → nenhum bloco de desempenho aparece (hoje);
  modal com questões registradas → resumo correto exibido.
- **Critérios de aceite:** nenhum dado de tempo existente é removido; resumo de desempenho
  só aparece quando há questões; nenhuma chamada de rede nova é feita.

### Etapa 3 — Taxa de acerto por matéria em `subjectProgressService.js`
- **Objetivo:** estender a agregação existente (`_aggregate`) para somar
  `correct_count`/`incorrect_count` por matéria, expondo `accuracyPercent` em cada entrada
  retornada por `listSubjectsProgress()`/`getSubjectProgress()` — sem tocar em nenhum
  consumidor existente (campos novos são aditivos ao objeto já retornado).
- **Arquivos:** `subjectProgressService.js`, `tests/services/subjectProgressService.test.js`.
- **Banco/schema:** nenhuma alteração (os dados já estão em `questions`).
- **Impacto:** médio-alto — desbloqueia "desempenho por matéria" (Seção 14) sem qualquer
  migration, e é pré-requisito de qualquer tela futura de Progresso/Dashboard que queira
  mostrar isso.
- **Risco:** baixo — função pura, testável isoladamente; risco de regressão só se algum
  consumidor existente depender do shape exato do objeto retornado (mitigar: campos
  aditivos, nunca renomear/remover existentes).
- **Testes:** matéria com questões mistas (acertos e erros) → `accuracyPercent` correto;
  matéria sem questões → `accuracyPercent` ausente/0 sem erro; consumidores existentes
  (se houver) continuam passando sem alteração.
- **Critérios de aceite:** `listSubjectsProgress()` retorna `accuracyPercent` por matéria;
  nenhum consumidor existente quebra.

### Etapa 4 — Ligar Revisões a Questões via Sessão (`reviewSessionService`)
- **Objetivo:** nova função `getReviewQuestionsSummary(reviewId)` (ou equivalente) que,
  dado um `review_id`, resolve `review.session_id → questions dessa sessão →
  summarizeSessionQuestions()` — respondendo "quantas questões foram revisadas e qual foi o
  desempenho" (Fluxo C) sem nenhuma migration, só compondo funções já existentes
  (`getReviewSession`, `listBySession` de `questionService`, `summarizeSessionQuestions`).
- **Arquivos:** `reviewSessionService.js`, `tests/services/reviewSessionService.test.js`.
- **Banco/schema:** nenhuma alteração.
- **Impacto:** médio — desbloqueia a primeira metade do Fluxo C; a segunda metade
  ("assuntos com dificuldade/domínio ao longo do tempo") depende da Etapa 5.
- **Risco:** baixo — função nova, aditiva, sem tocar CRUD existente.
- **Testes:** revisão sem sessão vinculada → resumo vazio/zero, sem erro; revisão com
  sessão vinculada e questões → resumo correto.
- **Critérios de aceite:** dado um `review_id` com sessão e questões vinculadas, a função
  retorna total/acertos/% corretos.

### Etapa 5 — Agregação de "domínio por assunto" (decisão de produto necessária antes)
- **Objetivo:** um novo service (ou extensão de `subjectProgressService`) que calcule, por
  `topic` (não só `subject`), a taxa de acerto ao longo de uma janela de tempo/amostra
  mínima, classificando em algo como `dominado | em_progresso | com_dificuldade` — critério
  exato (piso de amostra, período de referência, pesos) **não decidido nesta auditoria**
  (ver Seção 15, último item) — precisa de validação de produto antes de codar.
- **Arquivos:** novo service ou extensão de `subjectProgressService.js`; testes associados.
- **Banco/schema:** nenhuma alteração (dados já existem em `questions`).
- **Impacto:** alto conceitualmente (resolve o Fluxo D por completo), mas é a etapa de
  maior ambiguidade de critério — deveria ser a última a ser implementada, depois de
  validar as Etapas 1–4 com uso real.
- **Risco:** médio — risco não é técnico, é de produto (um critério de "domínio" mal
  calibrado pode desmotivar o estudante ou soar arbitrário); recomenda-se prototipar o
  critério com dados reais antes de expor na UI.
- **Testes:** casos de borda de amostra pequena (não deve rotular "dominado"/"com
  dificuldade" com 1–2 questões — ver piso mínimo, Seção 15); casos de assunto com
  tendência de melhora/piora ao longo do tempo.
- **Critérios de aceite:** critério de domínio documentado e aprovado antes do merge;
  amostra mínima explícita e testada.

### Etapa 6 — Contador de tempo por questão (opcional, schema novo mínimo)
- **Objetivo:** somente se validado como necessário após as Etapas 1–5, adicionar um campo
  opcional `time_spent_seconds` (nullable) a `questions`, preenchido só quando o estudante
  opta por informar (não obrigatório — mantém o registro rápido em 2 campos).
- **Arquivos:** nova migration `sql/26_...sql`, `questionService.js`,
  `sessionQuestionsService.js`, `studySessionView.js` (campo opcional no formulário
  detalhado, nunca no registro rápido).
- **Banco/schema:** migration nova (única desta etapa que altera schema).
- **Impacto:** baixo-médio — nicho (nem todo estudante quer cronometrar por questão);
  avaliar demanda real antes de implementar.
- **Risco:** baixo tecnicamente; risco de produto é adicionar fricção ao registro rápido
  se mal posicionado na UI — deve ficar estritamente no formulário detalhado.
- **Testes:** schema (`tests/sql/`), CRUD, agregação (tempo médio por questão).
- **Critérios de aceite:** campo nullable, sem impacto em lançamentos existentes (NULL);
  registro rápido continua com exatamente 2 campos obrigatórios.

### Etapa 7 — Documentar formalmente a lacuna de Simulados (sem implementar)
- **Objetivo:** um documento de design curto (`SIMULADOS_DESIGN_PROPOSAL.md` ou seção
  dedicada em `docs/ROADMAP.md`) descrevendo a cadeia `Simulado → Questões → Sessão →
  Desempenho`, opções de modelagem (sessão marcada com `source: "mock_exam"` vs. entidade
  nova), e critérios de aceite — **sem código**, para quando o desenvolvedor decidir
  priorizar o Fluxo B.
- **Arquivos:** novo documento apenas.
- **Banco/schema:** nenhuma alteração.
- **Impacto:** nenhum funcional — só reduz o custo de decisão quando a etapa for
  priorizada.
- **Risco:** nenhum.
- **Testes:** não aplicável.
- **Critérios de aceite:** documento revisado e aprovado pelo desenvolvedor antes de
  qualquer implementação futura do Fluxo B.

---

## Fechamento

O achado central desta auditoria é que **o Anoti não precisa inventar um sistema novo de
desempenho** — ele já tem um, correto e bem desenhado (`questions.correct_count`/
`incorrect_count`, `studyStatisticsService`, `subjectProgressService`), só que ele vive
isolado da experiência ao vivo da Sessão e para de existir assim que a matéria/assunto
precisa virar "domínio" de verdade. As primeiras quatro etapas do plano (Seção 16) não
tocam banco, não adicionam campos, e resolvem a maior parte do que o enunciado pede: elas
apenas **ligam fiação que já existe** — mostrar, durante e ao final da sessão, o resultado
das mesmas contas que o Diário já faz depois. As etapas que exigem schema novo (Simulados,
tempo por questão, domínio calibrado) são deliberadamente deixadas para o fim, como
decisões de produto explícitas, não como consequência automática desta auditoria.
