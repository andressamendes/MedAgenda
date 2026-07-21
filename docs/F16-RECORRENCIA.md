# F16 — Recorrência de Compromissos e Eventos de Calendário Acadêmico

> Auditoria + arquitetura + implementação da recorrência compartilhada entre
> **Novo Compromisso** (Agenda) e **Novo Evento** (Calendários Acadêmicos).

---

## 1. Diagnóstico — como a Agenda funciona hoje

### 1.1 Antes desta mudança

O projeto **já tinha** um motor de recorrência funcionando, mas só para
Compromissos:

- `sql/01_events.sql` + `sql/03_recurrence.sql` — `events` já tinha
  `recurrence_type` (`none|daily|weekdays|weekly|biweekly|monthly|yearly|custom`),
  `recurrence_interval`, `recurrence_until`, `recurrence_days_of_week`.
- `supabase/functions/_shared/recurrence-core.js` — **fonte única** de
  expansão de recorrência, pura (sem I/O), reexportada por `recurrence.js`
  (frontend) e importada também pela Edge Function
  `send-push-notifications` (Deno) — front e back já usavam **o mesmo**
  código para decidir se um compromisso ocorre num dia.
- `eventService.getEventsByRange()` já resolvia o problema de "a linha-base
  está antes do range visível, mas a recorrência continua dentro dele" com
  duas queries em paralelo (uma pelo range direto, outra pelas bases
  recorrentes ainda não encerradas).
- `weekView.js` / `calendar.js` já chamavam `expandEvents(raw, start, end)`
  antes de renderizar — a agenda semanal, o calendário mensal e a lista já
  enxergavam **ocorrências**, nunca a linha crua do banco.
- `eventFormView.js` já tinha o bloco de UI (frequência, intervalo, dias da
  semana, "repetir até"), escondido atrás de um toggle "+ Repetir".
- Edição e exclusão, porém, **só existiam em um único modo**: clicar numa
  ocorrência recorrente perguntava um confirm genérico ("isso vai
  editar/excluir toda a série, continuar?") e sempre operava na linha-base
  inteira. Não havia "apenas esta" nem "esta e as próximas".
- **Eventos de Calendário Acadêmico** (`academic_events`) não tinham
  nenhuma coluna de recorrência — eram sempre ocorrências únicas
  (`start_date`/`end_date`, span de dias). O formulário
  (`academicCalendarEventsView.js`) é montado via template string dentro de
  um modal genérico (`academicCalendarView.js`), sem o bloco de recorrência
  do formulário de Compromissos.
- Renderização: `weekView.js`/`calendar.js` recebem eventos pessoais
  (expandidos) e acadêmicos (`expandAcademicEvents`, que só espalhava um
  evento multi-dia em um chip por dia — nunca recorrência) por dois
  provedores paralelos e mesclam na mesma grade.
- Filtros (`academicCalendarFilter.js`) já eram por calendário/compromissos
  pessoais, aplicados **antes** da consulta (`getAcademicEventProvider`
  filtra por `isCalendarVisible`).

### 1.2 Onde a lacuna estava

| Recurso pedido no F16                                   | Compromissos (antes) | Eventos Acadêmicos (antes) |
|-----------------------------------------------------------|:---:|:---:|
| Criar com recorrência (FREQ/INTERVAL/BYDAY/UNTIL)          | ✅ | ❌ |
| Fim por "após N ocorrências" (COUNT)                       | ❌ | ❌ |
| Editar "apenas esta ocorrência"                             | ❌ | ❌ |
| Editar "esta e as próximas"                                 | ❌ | ❌ |
| Editar "toda a série"                                       | ✅ (único modo) | ❌ |
| Excluir com os mesmos 3 escopos                             | ❌ (só série) | ❌ |
| Recorrência compartilhada entre os dois domínios            | — (só existia em 1) | — |

---

## 2. Estratégia escolhida

### Opção A — Gerar ocorrências dinamicamente (RRULE, sem materializar)

**Vantagens**: nenhuma explosão de linhas (uma série "todo dia útil, sem
fim" não gera milhões de registros); editar a regra da série é uma
`UPDATE` de uma linha; sem job de manutenção/backfill; já era o modelo em
produção para Compromissos, testado e em uso.
**Desvantagens**: "editar apenas esta ocorrência" não tem, por si só, onde
gravar a exceção — precisa de um mecanismo à parte.
**Performance**: O(ocorrências dentro do range visível), nunca O(total da
série) — a expansão já recebe `rangeStart/rangeEnd` e corta cedo.
**Complexidade**: baixa — a lógica inteira mora em um módulo puro
(`recurrence-core.js`), sem estado, fácil de testar unitariamente (o que já
existia: `tests/recurrence.test.js`).

### Opção B — Materializar ocorrências no banco (uma linha por data)

**Vantagens**: cada ocorrência é uma linha "normal", editável/deletável com
UPDATE/DELETE simples, sem lógica de expansão no cliente.
**Desvantagens**: recorrências sem fim (`recurrence_until = null`, o padrão
hoje) não podem ser materializadas até o infinito — exige uma janela
deslizante (job periódico gerando mais linhas conforme o tempo passa) ou um
teto arbitrário; editar a REGRA da série (ex.: trocar de semanal para
diário) vira um UPDATE em massa de N linhas, com risco de
condição de corrida entre o job de geração e a edição do usuário; a tabela
`events`/`academic_events` cresce proporcionalmente ao número de
ocorrências, não ao número de séries — impacto direto em toda consulta
que hoje faz `SELECT * FROM events WHERE user_id = ...` (usada por 6+
módulos, com cache em `eventService.js`).
**Performance**: leitura mais simples (sem expansão), mas o INSERT em lote
inicial e a manutenção da janela deslizante são custos recorrentes; índices
crescem, e o filtro "toda a série" (para editar a regra) precisa de uma
coluna de agrupamento de qualquer forma (o mesmo `recurrence_parent_id`
que a Opção A usa só para a divisão "esta e as próximas").
**Complexidade**: alta — precisa de um job/trigger de geração incremental,
tratamento de duplicidade, e um caminho de migração para todo o código que
hoje assume "uma linha = um evento, com ou sem regra de recorrência".

### Decisão: **Opção A, estendida com um mecanismo de exceções pontuais**

A Opção A já era a arquitetura em produção do domínio de Agenda — trocar de
estratégia agora obrigaria reescrever `eventService.getEventsByRange()`,
`weekView.js`, `calendar.js`, `planListView.js`, os filtros e o exportador
ICS, todos hoje escritos em cima de "a linha do banco é a série, a
expansão acontece na leitura". Isso violaria diretamente a diretriz do F16
("não reescrever código existente", "a solução deve se adaptar ao
projeto").

O único requisito que a Opção A pura não cobria era "apenas esta
ocorrência". A solução (mesmo padrão do iCalendar: `EXDATE` +
`RECURRENCE-ID`, usado por Google Calendar/Outlook/Apple Calendar por
baixo dos panos) é uma tabela pequena de **exceções pontuais**:

```
recurrence_exceptions (source_table, base_event_id, occurrence_date, is_cancelled, override jsonb)
```

- **"Apenas esta" (excluir)** → grava `is_cancelled = true` para
  `(base_event_id, occurrence_date)`. A expansão (`recurrence-core.js`)
  filtra essa data fora, para sempre, sem tocar na linha-base.
- **"Apenas esta" (editar)** → grava `override` com só os campos mudados
  (nunca a regra de recorrência — uma ocorrência isolada não tem regra
  própria). A expansão faz um merge raso por cima da ocorrência gerada.
- **"Esta e as próximas"** → divide a série em duas linhas-base: a
  original é truncada (`recurrence_until` = véspera da ocorrência
  escolhida) e uma nova linha nasce a partir dali, com os campos e a regra
  editados, ligada à original por `recurrence_parent_id` (rastreabilidade,
  sem uso funcional na expansão). **Não** usa `recurrence_exceptions` — é
  puramente Opção A (duas séries dinâmicas).
- **"Toda a série"** → UPDATE/DELETE direto na linha-base (mesmo caminho
  que já existia).

Recorrências infinitas (`recurrence_until = null`) nunca são geradas além
do range pedido pela tela (semana/mês) — não há "job de geração", porque
não há nada para gerar adiantado: a expansão acontece sob demanda, a cada
consulta, e é O(ocorrências no range), nunca O(total). Isso responde
diretamente à exigência do F16 de nunca materializar recorrência
infinita: aqui ela literalmente nunca é materializada, ponto.

---

## 3. Impacto

### Tabelas / Migrations

- `sql/24_recurrence_shared.sql` (nova, aditiva, sem `DROP`/`ALTER ... TYPE`):
  - `events`: `+ recurrence_count`, `+ recurrence_parent_id`.
  - `academic_events`: `+ recurrence_type/interval/until/count/days_of_week/parent_id`
    (mesmo vocabulário de `events`, mesmo `CHECK`).
  - `recurrence_exceptions` (nova tabela, RLS por `user_id`).
  - Bump de `schema_version` para 24 (`schemaService.EXPECTED_SCHEMA_VERSION`,
    `scripts/check-schema.js`).

### Módulos novos (domínio de recorrência, reutilizado pelos dois formulários)

- `recurrenceExceptionsService.js` — repositório de `recurrence_exceptions`.
- `recurrenceService.js` — `applyEditScope()`/`applyDeleteScope()`: única
  lógica que decide o que "apenas esta/esta e as próximas/toda a série"
  significam, para `events` e `academic_events` via um adaptador
  (`ADAPTERS`).
- `recurrenceFieldView.js` — bloco de formulário (frequência, intervalo,
  dias da semana, fim: nunca/data/N ocorrências), com `bind/read/populate/
  reset` parametrizados por prefixo de id — usado por
  `eventFormView.js` (ids estáticos já existentes em `index.html`) e por
  `academicCalendarEventsView.js` (HTML gerado por
  `renderRecurrenceFieldsHTML("acev")`).
- `recurrenceScopeDialog.js` — modal de 3 opções (mesmo padrão de
  `confirmDialog.js`).

### Módulos alterados

- `supabase/functions/_shared/recurrence-core.js` — generalizado com
  `dateField` (permite `academic_events.start_date`), `recurrence_count`
  (fim por contagem) e aplicação de `recurrence_exceptions` — 100%
  retrocompatível (parâmetros novos são opcionais, comportamento antigo
  preservado byte a byte para quem não os usa).
- `academicCalendarService.js` — `getAcademicEventsByRange()` ganha a
  mesma consulta dupla de `eventService.getEventsByRange()` (bases
  recorrentes antes do range); `expandAcademicEvents()` passa a expandir
  recorrência (reaproveitando `recurrence.js`) antes de espalhar o span
  multi-dia; `getAcademicEventById()` novo (usado por `recurrenceService`).
- `eventFormView.js` — bloco de recorrência e escopo de edição/exclusão
  passam a vir de `recurrenceFieldView.js`/`recurrenceService.js`/
  `recurrenceScopeDialog.js` em vez de lógica local.
- `academicCalendarEventsView.js` — formulário de evento ganha o mesmo
  bloco de recorrência; criar/editar/excluir passam por
  `recurrenceService.js`.
- `index.html` — bloco de recorrência do formulário de Compromissos ganha
  o seletor "Fim da recorrência" (Nunca/Em uma data/Após N ocorrências).
- `style.css` — classes (`.recurrence-extra-block` etc.) generalizadas de
  seletor por id para seletor por classe, para servir os dois formulários;
  novo bloco de estilo do diálogo de escopo.
- `schemaService.js`, `scripts/check-schema.js` — nova versão de schema e
  novas colunas/tabela obrigatórias.

### Testes

- `tests/recurrence.test.js` — 8 novos casos: `recurrence_count` (diário,
  semanal com range mais estreito que a série, e `custom`/BYDAY),
  `dateField` customizado, exceções (cancelamento, sobrescrita, exceção na
  própria data-base).
- `tests/services/recurrenceService.test.js` (novo) — os 3 escopos ×
  editar/excluir, para `events` e `academic_events`, incluindo os casos de
  borda ("esta e as próximas" na primeira ocorrência da série).
- `tests/services/recurrenceExceptionsService.test.js` (novo).
- `tests/services/academicCalendarService.test.js` — 3 novos casos
  (recorrência semanal, span multi-dia recorrente, exceção aplicada).
- `tests/services/schemaService.test.js` — versão esperada atualizada.
- `tests/views/eventFormView.test.js`, `tests/views/academicCalendarView.test.js`
  — mocks atualizados para os novos módulos importados transitivamente.

---

## 4. Fluxo de criação

1. Usuário marca "+ Repetir" (mesmo toggle de sempre) em qualquer um dos
   dois formulários.
2. Escolhe frequência (Diário/Dias úteis/Semanal/Quinzenal/Mensal/Anual/
   Personalizada), intervalo, dias da semana (quando "Personalizada"), e o
   fim (Nunca / Em uma data / Após N ocorrências).
3. `readRecurrenceFields(prefix)` traduz isso para
   `recurrence_type/interval/until/count/days_of_week`.
4. `createEvent`/`createAcademicEvent` grava a linha-base normalmente — a
   série nunca é expandida no momento da criação.

## 5. Fluxo de edição

1. Semana/Mês clicam numa **ocorrência expandida** (`_isOccurrence: true`).
2. Se a série é recorrente, `recurrenceScopeDialog` pergunta o escopo.
3. `openEventForm` popula o formulário com a data da ocorrência (escopos
   "apenas esta"/"esta e as próximas") ou da linha-base (escopo "toda a
   série" — igual ao comportamento anterior a esta mudança).
4. Ao salvar, `recurrenceService.applyEditScope()` decide entre `UPDATE`
   direto, gravar um `override` em `recurrence_exceptions`, ou dividir a
   série (truncar + criar uma nova linha-base).
5. Eventos de Calendário Acadêmico: hoje só editáveis pela lista "Eventos"
   do calendário (linhas-base, não ocorrências) — sempre "toda a série"
   (ver Limitações).

## 6. Fluxo de exclusão

Mesma árvore de decisão de `applyEditScope()`, em `applyDeleteScope()`:
"apenas esta" cancela a data; "esta e as próximas" trunca
`recurrence_until`; "toda a série" apaga a linha-base e suas exceções.

---

## 7. Limitações conhecidas

- **Eventos Acadêmicos só oferecem "toda a série" a partir da lista
  "Eventos"** (não são clicáveis como ocorrência individual no
  calendário/semana — esse clique hoje só abre o modal de Calendários
  Acadêmicos, comportamento anterior a este trabalho, preservado). O motor
  compartilhado (`recurrenceService.js`) já suporta os 3 escopos para
  `academic_events`; falta só o fio de clique-na-ocorrência → formulário,
  quando esse fluxo for priorizado.
- **"Apenas esta ocorrência" não permite mover a ocorrência para outra
  data** — a data gerada pela série sempre vence sobre um `event_date`
  diferente dentro do `override` (mesma trava de segurança que impede uma
  exceção de "vazar" para uma chave de data errada). Mover uma ocorrência
  individual (drag-and-drop de uma série, como no Google Calendar) fica
  fora do escopo desta entrega.
- **Eventos acadêmicos recorrentes multi-dia**: o deslocamento de
  `end_date` por ocorrência assume que a duração (dias) é pequena frente
  ao intervalo de recorrência; um evento de 10 dias recorrendo
  semanalmente teria ocorrências sobrepostas — cenário não coberto
  (acadêmico tende a ser pontual: aula, prova, rodízio curto).
- Nenhuma migração é destrutiva; compromissos e eventos acadêmicos antigos
  (sem nenhuma coluna de recorrência nova) continuam funcionando
  identicamente (`recurrence_type` nasce `'none'`).

---

## 8. Resultado dos testes

```
node --experimental-vm-modules --experimental-test-module-mocks --test
# tests 1362
# pass 1362
# fail 0
```

Suíte completa (unit + services + views + integration + sql), incluindo os
novos arquivos deste trabalho, sem nenhuma regressão nos 1344 testes
pré-existentes.
