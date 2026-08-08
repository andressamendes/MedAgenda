# Auditoria do Lifecycle da Sessão de Estudo — MedAgenda (Anoti)

> **Status:** somente auditoria e plano. Nenhum código de produção foi alterado neste
> documento/branch além deste próprio arquivo.
>
> **Escopo:** `activitySessionService.js`, `studySessionView.js`,
> `activeSessionIndicatorView.js`, `abandonedSessionDialog.js`, `sessionEventBus.js`,
> `sessionQuestionsService.js`, `reviewSessionService.js`, `script.js` (bootstrap/logout),
> migrations `sql/11_activity_sessions.sql`, `sql/17_activity_sessions_paused_time.sql`,
> `sql/19_activity_sessions_running_unique.sql`, `sql/21_activity_sessions_standalone_fields.sql`,
> e os testes em `tests/services/activitySessionService*.test.js`,
> `tests/views/studySessionView.test.js`, `tests/views/activeSessionIndicatorView.test.js`.

---

## 1. Estado atual

### 1.1 Modelo de dados

`activity_sessions` (Supabase/Postgres) é a única fonte de verdade da sessão. Campos
relevantes ao lifecycle:

| Campo | Papel |
|---|---|
| `status` | `running` \| `paused` \| `finished` \| `cancelled` |
| `started_at` | timestamp de início, gravado pelo servidor no `startSession()` |
| `paused_at` | timestamp de início da pausa **corrente** (NULL quando não pausada) |
| `paused_ms` | soma de todas as pausas **já concluídas** |
| `ended_at`, `duration_minutes` | gravados só em `finishSession()` |

Um índice único parcial (`sql/19_activity_sessions_running_unique.sql`) garante **no
banco** que nunca existam duas linhas `status = 'running'` para o mesmo `user_id`. Não
há limite equivalente para `paused` (o produto já assume que só pode haver uma sessão
"ativa" — running OU paused — mas isso hoje é reforçado só na aplicação, ver 1.3).

### 1.2 Cálculo de tempo — já é "server-timestamp based", não um contador acumulado

Ponto importante para o desenho da solução: **o tempo estudado nunca é acumulado por
tick do cronômetro.** `duration_minutes` só é calculado uma vez, em `finishSession()`
(`activitySessionService.js:218-264`), como:

```
rawMs        = endedAt - started_at
totalPausedMs = paused_ms + (se ainda em paused: now - paused_at)
duration_minutes = round((rawMs - totalPausedMs) / 60000)
```

O `setInterval` de 1s em `studySessionView.js` (`_renderTime`, linha 418) e o de 60s em
`activeSessionIndicatorView.js` (`_minutesElapsed`, linha 45) só **re-renderizam** a UI a
partir de `started_at`/`paused_ms`/`paused_at` já persistidos — nenhum dos dois grava
nada no banco a cada tick. Isso significa que **não existe hoje o risco "o navegador
ficou aberto e inflou o tempo com um timer local desonesto"** — o problema real é outro:
**a linha fica com `status = 'running'` indefinidamente no banco** até que
`finishSession()`/`cancelSession()` seja chamado por *algum* cliente, e enquanto isso
ela:

- aparece como sessão ativa para qualquer tela que chame `getActiveSession()`
  (`activeSessionIndicatorView.js`, o próprio `studySessionView.js` na próxima
  abertura do app);
- **nunca é finalizada automaticamente** — se o usuário nunca mais abrir o app com
  aquela conta, a linha continua `running` para sempre;
- bloqueia o início de uma nova sessão: `startSession()` rejeita com
  `SESSION_ALREADY_RUNNING` (linha 189-209) enquanto existir uma `running`.

### 1.3 Ciclo de vida hoje — quem chama o quê

```
startSession(fields)                              activitySessionService.js:189
  → getRunningSession() [guarda em app]
  → INSERT status=running, started_at=now()  (índice único é a guarda no banco)
  → publish(SESSION_EVENTS.STARTED)

pauseSession(id)                                   activitySessionService.js:309
  → _transition(..., fromStatuses=["running"])  → status=paused, paused_at=now()
  → publish(SESSION_EVENTS.PAUSED)

resumeSession(id)                                  activitySessionService.js:330
  → getRunningSession() [guarda em app] + índice único [guarda no banco]
  → _transition(..., fromStatuses=["paused"]) → status=running, paused_ms+=Δ, paused_at=null
  → publish(SESSION_EVENTS.RESUMED)

finishSession(id, endedAt, notes)                  activitySessionService.js:218
  → _transition(..., fromStatuses=["running","paused"]) → status=finished, ended_at, duration_minutes
  → publish(SESSION_EVENTS.FINISHED)

cancelSession(id)                                  activitySessionService.js:281
  → _transition(..., fromStatuses=["running","paused"]) → status=cancelled
  → publish(SESSION_EVENTS.CANCELLED)
```

`_transition()` (linha 138) é a guarda de concorrência central: todo UPDATE de
transição é condicionado a `.in("status", fromStatuses)` no próprio banco — se 0 linhas
voltarem, vira `SESSION_STATE_CONFLICT` e nenhum evento é publicado. Isso já cobre
corretamente "duas abas tentando finalizar/cancelar/pausar/retomar a mesma sessão ao
mesmo tempo" (ver testes `activitySessionService.test.js:406-486`). **Este mecanismo é
reaproveitável e não precisa mudar.**

### 1.4 Onde o estado em memória vive

- `activitySessionService.js` não guarda nenhum estado em memória — cada função é uma
  chamada direta ao Supabase. A única "memória" é o `_listeners` do
  `sessionEventBus.js` (pub/sub, perdido a cada reload).
- `studySessionView.js` guarda `_session` (o objeto da sessão ativa) em uma variável de
  módulo, populada por `_applySession()` (linha 526) a partir do retorno de
  `getActiveSession()` no boot (`initStudySessionView()`, linha 1563) e atualizada
  depois via barramento (`_subscribeToEventBus`).
- `activeSessionIndicatorView.js` mantém sua **própria** cópia independente de
  `_session`, resolvida separadamente com o mesmo `getActiveSession()` — os dois módulos
  não compartilham estado entre si, só reagem ao mesmo barramento.
- Nenhum `localStorage`/`sessionStorage` é usado para o cronômetro ou o estado da
  sessão (confirmado por grep — zero ocorrências relacionadas a sessão em todo o
  projeto).

### 1.5 Restauração ao reabrir o app (F7.8) — é a "recuperação" atual

`initStudySessionView()` (linha 1563) roda a cada `_initApp()` (login, ou reabertura da
SPA após reload — não há diferença entre os dois hoje, ver 1.7):

1. `getActiveSession()` busca a sessão `running` OU `paused` mais recente do usuário.
2. `_applySession(restoredSession)` a aplica à tela **exatamente como uma sessão em
   andamento normal** — o cronômetro volta a rodar a partir de `started_at`, sem
   nenhuma pergunta ao usuário.
3. **Só se** `started_at` for anterior a `ABANDONED_SESSION_MS` (24h, linha 49), o
   diálogo `abandonedSessionDialog` (F7.9) é disparado *depois* da restauração —
   oferecendo "Continuar" / "Finalizar" / "Cancelar". Nenhuma das três opções é
   automática; é sempre o usuário quem decide. Uma sessão com 23h59 de idade é
   restaurada e continua contando tempo silenciosamente, sem diálogo nenhum.

Ou seja: **hoje, uma aba fechada com uma sessão `running` produz, no próximo login, uma
sessão que volta a "correr" normalmente** (a não ser que já tenha passado de 24h) — o
oposto da regra de produto pedida nesta auditoria.

### 1.6 Listeners de ciclo de vida do navegador — nenhum existe

Busca no projeto inteiro (`grep -r "beforeunload|pagehide|visibilitychange|unload"`)
não retornou **nenhuma ocorrência**. Não existe:

- `window.addEventListener("beforeunload", …)`
- `window.addEventListener("pagehide", …)`
- `document.addEventListener("visibilitychange", …)`
- qualquer heartbeat, watchdog, ou expiração server-side de sessão "esquecida".

A única forma de uma sessão `running`/`paused` deixar de existir é uma chamada
explícita e bem-sucedida a `finishSession()`/`cancelSession()` vinda de algum cliente
com a aba aberta.

### 1.7 Logout

`script.js:834-858` (`onBeforeSignOut`) chama `resetStudySessionView()` e
`resetActiveSessionIndicator()` — **mas essas duas funções só limpam estado de UI em
memória e assinaturas do barramento** (`studySessionView.js:1681`,
`activeSessionIndicatorView.js:210`). **Nenhuma delas chama `cancelSession()` nem
qualquer outra escrita no banco.** Resultado: fazer logout com uma sessão `running`
**deixa a linha `running` no banco**, exatamente como fechar a aba. No próximo login
(mesmo usuário ou não — mas a RLS do Supabase impede um usuário ver a sessão de outro),
`getActiveSession()` a encontra de novo e a restaura como se nada tivesse acontecido.

Isso é uma lacuna adicional em relação à regra pedida no item "4. Logout" do enunciado
— hoje o comportamento de logout é **igual** ao de "fechar a aba" (nenhum dos dois
encerra a sessão no servidor), quando deveria ser um cancelamento explícito.

### 1.8 Navegação interna da SPA

`showPage()` (`navigationView.js`) só alterna o atributo `hidden` entre `#page-*`; não
desmonta módulos, não publica evento de navegação, e — crucialmente — **não chama
nenhum reset de sessão**. `studySessionView.js` e `activeSessionIndicatorView.js`
continuam com `_tickId` rodando (o timer de `studySessionView.js` só para quando
`#page-study-session` fica oculta *e* a sessão deixa de ser `running`, mas isso é para
render, não para o estado da sessão em si — o mini-timer de
`activeSessionIndicatorView.js` assume visualmente quando o usuário sai da página de
Sessão). **Navegação interna já não cancela a sessão hoje** — está alinhado com a regra
pedida (item 3) sem qualquer mudança necessária.

### 1.9 Reload da página

Não há diferença arquitetural hoje entre "login" e "reload": os dois disparam o mesmo
`_initApp()` → `initStudySessionView()` → `getActiveSession()` → restauração
silenciosa (1.5). Um F5 no meio de uma sessão `running` é, hoje, **invisível** — a
sessão volta exatamente como estava, tempo incluso.

### 1.10 Perda de conexão / múltiplas abas

- **Múltiplas abas**: `startSession()`/`resumeSession()` já são protegidos por
  `getRunningSession()` (checagem em app) **e** pelo índice único parcial (checagem no
  banco, a prova de corrida — AUD-001). Duas abas tentando pausar/retomar/finalizar/
  cancelar a mesma sessão já são protegidas por `_transition()` (F15.8). **Este
  mecanismo de concorrência é sólido e não precisa ser tocado.**
- **Perda de conexão**: se a aba perde conexão mas continua aberta, nenhuma chamada de
  rede acontece — a sessão simplesmente não pode ser pausada/finalizada/cancelada até a
  conexão voltar (comportamento esperado, sem tratamento especial hoje). Se a aba é
  fechada **durante** a perda de conexão, cai no mesmo caso de "fechar a aba" (1.6): a
  sessão fica `running` órfã.

---

## 2. Arquivos envolvidos

| Arquivo | Responsabilidade atual |
|---|---|
| `activitySessionService.js` | Única camada que fala com `activity_sessions` no Supabase. CRUD + transições de domínio (`startSession`, `pauseSession`, `resumeSession`, `finishSession`, `cancelSession`), guardas de concorrência (`_transition`, índice único), publica no barramento. |
| `sessionEventBus.js` | Pub/sub em memória dos 6 eventos de domínio (`STARTED/PAUSED/RESUMED/FINISHED/CANCELLED/UPDATED`). Sem estado persistente. |
| `studySessionView.js` | Tela "Sessão de Estudo": cronômetro visual (`setInterval` 1s, só leitura), formulários de início/fim, restauração no boot (`initStudySessionView`), diálogo de sessão abandonada (F7.9), reset no logout (`resetStudySessionView`). |
| `activeSessionIndicatorView.js` | Mini-timer flutuante visível fora da página de Sessão. Estado independente de `studySessionView.js`, mesma fonte (`getActiveSession()` + barramento). Reset no logout. |
| `abandonedSessionDialog.js` | Modal de decisão (continuar/finalizar/cancelar) apresentado quando uma sessão restaurada tem mais de 24h — nunca decide sozinho, nunca fecha automaticamente. |
| `sessionQuestionsService.js`, `reviewSessionService.js` | CRUD de sub-recursos anexados a uma sessão (questões, vínculo com revisões). Não participam do lifecycle de status — apenas leem `session_id`. Fora do escopo desta mudança. |
| `script.js` | Bootstrap (`_initApp`) chama `initStudySessionView()`/`initActiveSessionIndicator()`; `onBeforeSignOut` chama os resets de UI (mas não cancela a sessão — ver 1.7). |
| `authView.js` / `auth.js` | Disparam `onBeforeSignOut` no logout manual e em `forceReauth()` (sessão expirada). Não conhecem `activity_sessions`. |
| `sql/11_activity_sessions.sql` | Schema base da tabela. |
| `sql/17_activity_sessions_paused_time.sql` | `paused_ms`/`paused_at` — tempo líquido. |
| `sql/19_activity_sessions_running_unique.sql` | Índice único parcial `activity_sessions_one_running_per_user` — guarda de concorrência no banco. |
| `sql/21_activity_sessions_standalone_fields.sql` | Campos de sessão avulsa (título/conteúdo/data/duração prevista sem `event_id`). |
| `tests/services/activitySessionService*.test.js` | Cobrem CRUD, transições, concorrência (`_transition`, índice único), resumo de execução. **Não cobrem unload/reload/logout** — isso vive só nos testes de view. |
| `tests/views/studySessionView.test.js` | Cobrem restauração (F7.8), diálogo de sessão abandonada (F7.9), reset no logout **da UI**. **Não cobrem `beforeunload`/`pagehide` — porque não existem hoje.** |
| `tests/views/activeSessionIndicatorView.test.js` | Cobrem o mini-timer, incluindo `resetActiveSessionIndicator()`. |

---

## 3. Causa dos possíveis problemas

1. **Nenhum listener de encerramento de página.** Fechar aba/janela/navegador não
   dispara nenhum código do Anoti — a linha `activity_sessions` fica `running`/`paused`
   até alguém (o mesmo usuário, em outra sessão de app) a encerre manualmente.
2. **Reload é tratado exatamente como "continuar de onde parou".** Não há distinção
   entre "o usuário nunca saiu" e "o usuário saiu e voltou" — `initStudySessionView()`
   sempre restaura silenciosamente uma sessão ativa recente.
3. **Logout não encerra a sessão no servidor**, só a esconde da UI local
   (`resetStudySessionView`/`resetActiveSessionIndicator` são resets de **apresentação**,
   não de domínio). Uma sessão `running` sobrevive ao logout.
4. **A única rede de segurança (F7.9, diálogo de 24h) é tardia e não-automática**: só
   age depois de 24h, e mesmo assim pergunta ao usuário em vez de encerrar — não
   resolve o requisito "sessão abandonada não deve continuar contabilizando tempo como
   se o estudante ainda estivesse estudando" para o caso comum (fechar a aba há poucos
   minutos/horas).
5. **Efeito em cascata**: enquanto a sessão órfã permanece `running`,
   `startSession()` recusa qualquer nova sessão (`SESSION_ALREADY_RUNNING`) até que o
   usuário volte, veja a sessão fantasma e a resolva manualmente — atrito direto de
   produto, não só um problema de dados.

O que **não** é causa de problema (e não deve ser "corrigido" por engano):
- O cálculo de `duration_minutes` já é *server-timestamp based* (1.2) — não existe
  inflação de tempo por client-side drift enquanto a aba está aberta.
- A concorrência entre abas/dispositivos já é coberta (índice único + `_transition`) —
  novas sessões `running` duplicadas não são o risco; sessões `running` **órfãs e
  únicas** são.

---

## 4. Nova regra de lifecycle

### 4.1 Estados formais

```
IDLE       — nenhuma sessão activity_sessions em running/paused para o usuário.
             (não é um valor de `status` no banco; é a ausência de linha ativa.)

RUNNING    — status = "running". Cronômetro contando. Persistida.

PAUSED     — status = "paused". Cronômetro parado; paused_at marca o início da
             pausa corrente.

COMPLETED  — status = "finished". Estado terminal. ended_at e duration_minutes
             preenchidos. Entra nas estatísticas.

CANCELLED  — status = "cancelled". Estado terminal. NÃO entra nas estatísticas
             de tempo estudado. Preservada só para auditoria/histórico.
```

### 4.2 Transições permitidas

```
IDLE      → RUNNING     : startSession()
RUNNING   → PAUSED       : pauseSession()
PAUSED    → RUNNING      : resumeSession()
RUNNING   → COMPLETED    : finishSession()
PAUSED    → COMPLETED    : finishSession()
RUNNING   → CANCELLED    : cancelSession()  (inclui: fechar aba/janela/navegador,
                                              reload, logout — ver 4.3)
PAUSED    → CANCELLED    : cancelSession()  (idem)
COMPLETED → *            : nenhuma (terminal)
CANCELLED → *            : nenhuma (terminal)
```

Nenhuma transição nova é introduzida no domínio (`activitySessionService.js` já
implementa exatamente este grafo). A mudança de produto é **sobre quais eventos do
mundo real disparam `cancelSession()`**, não sobre o grafo de estados em si.

### 4.3 Gatilhos de CANCELLED (novo)

| Evento real | Resultado |
|---|---|
| Fechar aba | RUNNING/PAUSED → CANCELLED |
| Fechar janela | RUNNING/PAUSED → CANCELLED |
| Fechar o navegador | RUNNING/PAUSED → CANCELLED |
| Reload (F5) | RUNNING/PAUSED → CANCELLED *(decisão de produto: tratar como abandono, não como continuidade — ver 5.4)* |
| Logout | RUNNING/PAUSED → CANCELLED, imediatamente, na própria aba que fez logout |
| Navegação interna da SPA | **sem efeito** — sessão continua |
| Troca de aba (visibilitychange) | **sem efeito** — sessão continua |
| Perda de conexão momentânea | **sem efeito enquanto a aba segue aberta**; some dela sozinha quando a conexão volta (nenhuma ação nova necessária) |
| Fechamento abrupto sem rede disponível (aba fechada offline) | Não há como notificar o servidor no momento do fechamento — tratado pelo mecanismo de detecção no próximo boot (5.2), não por um evento de unload que dependeria de rede |

---

## 5. Estratégia recomendada

### 5.1 Princípio — não confiar em unload como gatilho único, mas usá-lo como sinal de melhor esforço

`beforeunload`/`unload` são pouco confiáveis (o enunciado já aponta isso corretamente):
não disparam de forma consistente em todos os navegadores/OS, uma chamada assíncrona a
Supabase iniciada ali pode nunca completar antes da página descarregar, e não cobrem
"processo do navegador morto" (crash, kill -9, bateria acabando). **A solução não pode
depender só disso.**

A estratégia de duas camadas abaixo é a mínima que garante a regra de produto de forma
determinística, reaproveitando 100% da infraestrutura de concorrência já existente
(índice único + `_transition`) e sem exigir heartbeat contínuo nem RPC nova:

**Camada A — melhor esforço, imediato (cobre o caminho feliz: >95% dos fechamentos
normais de aba/janela/navegador em navegadores modernos).**

- Ouvir `pagehide` (preferível a `beforeunload`: dispara de forma mais confiável em
  mobile/Safari, não bloqueia bfcache do mesmo jeito, e cobre o mesmo conjunto de casos
  para este uso) e, dentro dele, disparar `cancelSession(id)` via
  `navigator.sendBeacon` (não uma chamada `fetch`/Supabase-JS normal — essas podem ser
  canceladas pelo navegador no meio do descarregamento da página; `sendBeacon` é
  desenhado exatamente para "enviar e não esperar resposta, garantido pelo browser
  mesmo durante unload").
  - Isso exige um **endpoint mínimo** (Supabase Edge Function, ou RPC via
    `fetch(..., keepalive: true)` como alternativa a `sendBeacon` caso o payload
    precise de header de auth que `sendBeacon` não suporta bem) — avaliado em detalhe
    na Etapa 2 do plano (Seção 7).
  - **Também** ouvir `visibilitychange` → `document.visibilityState === "hidden"` como
    reforço (dispara antes de `pagehide` em muitos casos e cobre troca de app em
    mobile) **sem cancelar nada nesse evento** — ele só serve, combinado com a Camada
    B, para não ser o único sinal (troca de aba temporária não pode cancelar, ver 4.3).
- Logout: chamar `cancelSession()` **de forma síncrona/aguardada** dentro de
  `onBeforeSignOut`, **antes** de `resetStudySessionView()`/
  `resetActiveSessionIndicator()` — aqui não há problema de unload, é uma ação de
  produto normal com tempo de sobra para uma chamada `await` comum.
- Reload: do ponto de vista do navegador, um F5 **é** um unload (dispara
  `pagehide`/`beforeunload` normalmente) — a Camada A já cobre reload automaticamente,
  sem código extra. Isso resolve a preferência de produto do enunciado ("reload =
  sessão perdida/cancelada") como consequência direta da Camada A, não como um caso
  especial.

**Camada B — garantia determinística, no próximo boot (cobre os ~5% que a Camada A
perde: crash do navegador, processo morto, bateria, perda de conexão exatamente no
momento do fechamento, SO forçando encerramento).**

- No boot (`initStudySessionView()` → `getActiveSession()`), **qualquer** sessão
  `running`/`paused` restaurada é tratada como potencialmente órfã por padrão — não
  mais restaurada "ao vivo" sem checagem. Critério objetivo, sem heartbeat novo:
  usar o mesmo timestamp que já existe (`started_at`/`paused_at`) e um limiar curto
  (proposto: alguns minutos, não 24h — ver 6) para decidir automaticamente:
  - Se a Camada A já rodou com sucesso na aba anterior, a sessão já estará
    `cancelled` no banco quando o boot ler `getActiveSession()` — **não aparece mais
    como ativa**, nenhuma pergunta necessária. Este é o caminho feliz esperado.
  - Se a sessão ainda aparece `running`/`paused` no boot (Camada A não rodou — crash,
    etc.), ela é automaticamente cancelada nesse momento (sem depender de resposta do
    usuário) **em vez de** restaurada normalmente. Isso substitui o comportamento
    atual de "restaurar sempre, perguntar só depois de 24h" pelo comportamento pedido:
    "uma sessão abandonada nunca volta a contar tempo como se o estudante ainda
    estivesse lá".
  - Este passo por si só, mesmo sem a Camada A, já garante a regra de produto
    (determinístico, sem depender de nenhum evento de browser) — a Camada A existe
    apenas para dar ao usuário feedback correto **imediatamente**, sem esperar o
    próximo login para a sessão sumir da tela de outra aba/dispositivo.

**Por que não heartbeat contínuo:** um heartbeat (gravar `last_active_at` a cada N
segundos) resolveria o mesmo problema, mas adiciona escrita periódica no banco, mais um
`setInterval` de rede, e mais um campo de schema — para um ganho que a Camada B já
entrega de forma mais simples (o boot já é o único lugar que precisa decidir "esta
sessão restaurada é legítima?", e um limiar curto sobre `started_at`/`paused_at`
resolve isso sem estado adicional). Heartbeat só se justificaria se precisássemos
detectar abandono **enquanto outras abas/telas ainda podem estar olhando para a
sessão em tempo real** (ex.: um painel de professor observando alunos ao vivo) — não é
o caso do Anoti.

**Por que não RPC transacional nova:** `cancelSession()` já é atômico e seguro sob
concorrência via `_transition()` (guarda `.in("status", fromStatuses)` no próprio
UPDATE) — não há necessidade de uma function/RPC Postgres nova; o endpoint da Camada A
só precisa **chamar o mesmo caminho de domínio já existente** (ou o UPDATE equivalente,
se `sendBeacon` não puder invocar JS do app diretamente — ver Etapa 2).

### 5.2 Resumo da regra final

> **A garantia real vem da Camada B (determinística, sempre roda no boot).**
> **A Camada A é uma otimização de UX (resposta imediata) sobre essa garantia**, não a
> garantia em si — alinhado com o pedido explícito do enunciado de não confiar
> exclusivamente em `beforeunload`/`unload`.

---

## 6. Casos de borda

| Caso | Comportamento definido |
|---|---|
| Reload rápido (F5) com sessão `running` | `pagehide` dispara `cancelSession()` (Camada A) antes do reload recarregar a página; se a rede for rápida o suficiente, no boot seguinte a sessão já aparece `cancelled` → tela vazia, IDLE. Se a rede não for rápida o suficiente, a Camada B a cancela no boot mesmo assim (dentro do limiar curto). |
| Fechar aba com sessão `paused` | Mesmo tratamento que `running` — `paused` também é um estado ativo cancelável (já suportado por `cancelSession()` hoje, `fromStatuses: ["running","paused"]`). |
| Duas abas, a mesma conta, uma `running` | `startSession()` na segunda aba já é bloqueado hoje (índice único + guarda em app) — **sem mudança**. Fechar a aba que tem a sessão `running` cancela; a outra aba (sem sessão local) não é afetada, só passa a poder iniciar uma nova. |
| Fechar uma aba que **não** é a dona da sessão ativa (ex.: só o mini-timer visível, sessão iniciada em outro dispositivo) | Não deve cancelar — o listener de unload só age se a aba tinha uma sessão carregada localmente que ela mesma está exibindo como ativa; nunca cancela "a sessão que existe no servidor" às cegas, sempre a partir do `_session.id` já em memória naquela aba. Evita que fechar um dispositivo sem intenção de estudo (ex.: só verificando o mini-timer) cancele uma sessão que está sendo estudada ativamente em outro dispositivo — ver "múltiplos dispositivos" abaixo. |
| Múltiplos dispositivos (não só abas) com a mesma sessão restaurada | Mesmo argumento acima: o gatilho de cancelamento é sempre "esta aba/dispositivo específico está encerrando **e ele acredita ser dono da sessão ativa**". Se o usuário fechar o notebook mas continuar estudando pelo celular (app aberto, sessão restaurada lá), o notebook fechando não deveria cancelar a sessão que o celular está ativamente usando. **Ver Etapa 6 do plano (Seção 7) para a mitigação:** o limiar curto da Camada B precisa ser maior que "tempo plausível de troca de dispositivo", e o cancelamento da Camada A idealmente é condicionado a "esta aba não está mais visível/focada há um tempo mínimo" — detalhado no plano, não decidido nesta seção para não misturar auditoria com implementação. |
| Perda de conexão sem fechar a aba | Sem efeito — nenhum cancelamento; quando a rede volta, a aba segue com a sessão intacta. |
| Perda de conexão **e** fechamento simultâneos | `sendBeacon`/`fetch keepalive` falha silenciosamente (sem rede) → Camada A não completa → Camada B resolve no próximo boot (de qualquer dispositivo com rede). |
| Sessão abandonada há dias, usuário nunca mais abre o app | Fica `running` até o próximo boot daquele usuário — não há nenhum mecanismo server-side (cron/edge function agendada) para expirá-la sem uma sessão de app ser aberta. **Fora do escopo desta correção** salvo decisão explícita de adicionar um job agendado (não pedido no enunciado; mencionar como possível trabalho futuro, não implementar). |
| Troca de aba temporária (usuário abre outra aba do navegador, sem fechar a do Anoti) | `visibilitychange` → `hidden` dispara, mas **não** cancela (Camada A só cancela em `pagehide`, nunca em `visibilitychange` isolado) — sessão continua normalmente, cronômetro nunca pausa sozinho. |
| Navegação interna (Hoje → Diário → Agenda) | `showPage()` não desmonta módulos nem dispara unload — sessão intocada, como já é hoje. |
| Logout em outra aba (mesmo navegador, duas abas logadas) | Supabase propaga o evento de auth (`onAuthStateChange`) para todas as abas da mesma origem; cada aba já roda seu próprio `onBeforeSignOut`. A aba que efetivamente fez logout cancela a sessão (5.1); a(s) outra(s) aba(s), ao receber o evento de auth change e rodar seu próprio reset de UI, não precisam cancelar de novo — a sessão já estará `cancelled` no banco, e `_transition()` torna uma segunda tentativa de cancelamento um no-op seguro (`SESSION_STATE_CONFLICT`, silenciosamente ignorável nesse fluxo específico). |
| `finishSession()` e o listener de unload disputando a mesma sessão (usuário clica "Finalizar" e fecha a aba no mesmo instante) | `_transition()` já resolve isso: quem chegar primeiro no banco vence (`fromStatuses` guarda a corrida); o outro recebe `SESSION_STATE_CONFLICT` e não sobrescreve. O listener de unload deve tratar esse erro como esperado/silencioso (a sessão já foi legitimamente finalizada, não é um bug). |

---

## 7. Plano de implementação (para execução futura — não aplicado nesta auditoria)

Cada etapa é independente e revertível isoladamente.

### Etapa 1 — Reduzir o limiar de "sessão abandonada" e torná-lo automático no boot (Camada B)
- **Objetivo:** garantir a regra de produto de forma determinística, sem depender de
  nenhum evento de browser.
- **Arquivos:** `studySessionView.js` (`initStudySessionView`, `ABANDONED_SESSION_MS`),
  `abandonedSessionDialog.js` (provavelmente removido/substituído — decisão de produto:
  perguntar ou cancelar direto; ver nota abaixo).
- **Alteração:** ao restaurar uma sessão `running`/`paused` no boot cujo
  `started_at`/`paused_at` já ultrapassou um limiar curto (proposto: 15–30 min, a
  validar com produto — muito menor que as 24h atuais), chamar `cancelSession()`
  automaticamente **antes** de aplicar a sessão à tela, em vez de restaurá-la e só
  perguntar depois. Dentro do limiar, mantém a restauração silenciosa atual (é o caso
  "usuário só recarregou rápido" coberto também pela Camada A).
  - Nota de produto: isso torna `abandonedSessionDialog.js` (F7.9) redundante para o
    caso "sessão velha" — decidir se ele é removido (a decisão passa a ser automática,
    sem perguntar) ou mantido para uma faixa intermediária (ex.: sessões pausadas
    manualmente há muito tempo, que o usuário pode querer retomar de propósito). Esta
    decisão de produto não foi tomada nesta auditoria — deixada explícita para
    validação antes da implementação.
- **Risco:** baixo — reusa `cancelSession()` já testado; risco principal é escolher um
  limiar curto demais e cancelar sessões legítimas de estudo longo com uma pausa
  prolongada intencional (ex.: pausou, foi almoçar, retomaria em 1h). Mitigado por só
  aplicar o cancelamento automático a sessões **paused** há muito tempo com cautela
  extra (ver Etapa 6) — sessões `running` há muito tempo sem nenhum heartbeat são o
  caso mais claro de abandono.
- **Testes:** boot com sessão `running`/`paused` recente → restaura normalmente (já
  existe); boot com sessão além do limiar → cancelada automaticamente, tela mostra
  IDLE, nenhum diálogo pendente; verificação de que nenhuma stats/streak é gerada por
  uma sessão cancelada dessa forma (já garantido por `listSessions()` nunca incluir
  `cancelled`/`running`/`paused`, mas adicionar teste explícito de regressão).
- **Critério de aceite:** reabrir o app após um "crash simulado" (sessão `running`
  antiga no fixture de teste, sem nenhum evento de unload disparado) nunca mostra uma
  sessão em andamento — a tela abre em IDLE.

### Etapa 2 — Escolher e implementar o transporte da Camada A (unload confiável)
- **Objetivo:** cancelamento de melhor esforço no fechamento real da aba/janela.
- **Arquivos novos/alterados:** um módulo pequeno novo (ex.: `sessionUnloadGuard.js`),
  importado por `studySessionView.js` (só quando há `_session` local ativo);
  possivelmente uma Supabase Edge Function nova **ou** reaproveitamento do endpoint
  REST do Supabase via `fetch(..., keepalive: true)` chamando o mesmo UPDATE que
  `cancelSession()` faz (guardado pelo mesmo `.in("status", [...])` — client-side já
  tem `user_id`/`session.id`/token de auth acessíveis).
- **Alteração:** registrar `pagehide` (e, como reforço best-effort,
  `visibilitychange` → hidden **não cancela**, só arma um marcador de "ficou oculta às
  HH:MM" usado pela Etapa 6) enquanto `_session` (running/paused) existir; no
  `pagehide`, disparar o cancelamento via `sendBeacon`/`fetch keepalive`. Desregistrar o
  listener quando a sessão é finalizada/cancelada normalmente (evitar cancelar de novo
  uma sessão já terminada) e no reset de logout.
- **Risco:** médio — `sendBeacon` tem limitações de payload/headers para autenticação
  Supabase (JWT em header `Authorization`, não em body); validar se
  `fetch(..., keepalive:true, headers:{Authorization}})` é suficientemente confiável
  nos navegadores-alvo do Anoti, ou se é necessário um endpoint dedicado que aceite o
  token por outro canal. Esta investigação técnica é o primeiro passo da etapa, antes
  de escrever código.
- **Testes:** simular `pagehide` com sessão ativa em teste de DOM
  (`domFixture.js` já existente) → verificar que a chamada de cancelamento foi
  disparada com o `id` correto; verificar que **não** dispara em
  `visibilitychange` isolado; verificar que não dispara quando não há `_session`.
- **Critério de aceite:** fechar a aba com uma sessão `running` aberta, em um teste
  de integração com um mock de `sendBeacon`/`fetch`, resulta em exatamente uma chamada
  de cancelamento para o `id` da sessão ativa daquela aba.

### Etapa 3 — Logout cancela a sessão ativa de verdade
- **Objetivo:** fechar a lacuna descrita em 1.7/3 — logout hoje só limpa UI, não o
  banco.
- **Arquivos:** `script.js` (`onBeforeSignOut`), `studySessionView.js` (expor a sessão
  ativa atual ou uma função `cancelActiveSessionOnSignOut()` dedicada, para não
  acoplar `script.js` diretamente a `activitySessionService.js` fora do padrão já
  usado pelos outros domínios).
- **Alteração:** antes de `resetStudySessionView()`, se houver `_session` ativa
  (`running`/`paused`), `await cancelSession(_session.id)` (tratando
  `SESSION_STATE_CONFLICT`/`SESSION_ALREADY_ENDED` como no-op silencioso — a sessão já
  pode ter sido encerrada por outra aba). `onBeforeSignOut` hoje não é `async`
  aguardado por quem o chama (`authView.js`) — validar se o fluxo de logout pode
  aguardar essa chamada sem travar a UI perceptivelmente (uma chamada Supabase única,
  rápida) ou se deve ser "dispare e não espere" com tratamento de erro
  best-effort.
- **Risco:** baixo — reusa `cancelSession()` testado; risco é só de UX (logout
  perceptível mais lento) se implementado como `await` bloqueante.
- **Testes:** logout com sessão `running` ativa → `cancelSession()` chamado com o id
  certo antes do reset de UI; logout sem sessão ativa → nenhuma chamada extra (no-op);
  logout enquanto outra aba já cancelou a mesma sessão → erro tratado
  silenciosamente, logout completa normalmente.
- **Critério de aceite:** logar em uma conta com sessão `running`, fazer logout, logar
  de novo → tela abre em IDLE, sem sessão restaurada, sem diálogo de abandono.

### Etapa 4 — Blindar contra sessão "running" órfã contaminando o próximo login (reforço da Etapa 1)
- **Objetivo:** confirmar de ponta a ponta, com teste de integração, que nenhuma
  combinação de Etapas 1–3 deixa uma sessão órfã sobreviver a um novo boot.
- **Arquivos:** novo teste de integração
  (`tests/integration/studySessionLifecycleAudit.test.js` ou similar), sem alteração
  de produção adicional.
- **Alteração:** só testes (matriz completa — Seção 8).
- **Risco:** nenhum (só testes).
- **Critério de aceite:** matriz da Seção 8 passando integralmente.

### Etapa 5 — Ajustar/remover `abandonedSessionDialog.js` (F7.9) conforme decisão de produto da Etapa 1
- **Objetivo:** eliminar a sobreposição entre o diálogo manual antigo (24h) e o
  cancelamento automático novo (limiar curto).
- **Arquivos:** `abandonedSessionDialog.js`, `studySessionView.js`, testes associados.
- **Alteração:** depende da decisão de produto pendente na Etapa 1 — remover o
  diálogo (cancelamento sempre automático e silencioso) ou mantê-lo só para uma faixa
  específica não coberta pela Etapa 1 (ex.: pausa intencional longa).
- **Risco:** médio se removido sem validar com produto — é uma mudança de UX visível
  (o usuário deixa de poder "recuperar" uma sessão antiga manualmente).
- **Testes:** atualizar `tests/views/studySessionView.test.js:2281-2360` conforme a
  decisão.
- **Critério de aceite:** nenhum teste órfão referenciando um fluxo removido; UX final
  documentada e validada com produto antes do merge.

### Etapa 6 — Mitigar falso positivo de múltiplos dispositivos
- **Objetivo:** evitar que fechar um dispositivo cancele uma sessão que outro
  dispositivo está usando ativamente no momento (caso de borda da Seção 6).
- **Arquivos:** `sessionUnloadGuard.js` (Etapa 2).
- **Alteração:** investigar se vale a pena condicionar o `pagehide` da Camada A a "esta
  aba está com a sessão em foco/visível há mais que alguns segundos antes do
  fechamento" (heurística simples) para reduzir o caso extremo de "abri o app em outro
  dispositivo, ele restaurou a sessão em segundo plano, e fechar o dispositivo antigo
  cancela por engano" — ou aceitar o risco (raro) em favor da simplicidade, já que a
  Camada B usa um limiar curto o bastante para não ser o problema principal.
- **Risco:** baixo — é um refinamento, não bloqueia as etapas anteriores.
- **Testes:** cenário de dois dispositivos em sequência rápida.
- **Critério de aceite:** decisão registrada (implementar heurística OU aceitar o
  risco documentado) — não é obrigatório resolver 100%, apenas não ignorar.

---

## 8. Matriz de testes

| # | Cenário | Resultado esperado | Camada responsável |
|---|---|---|---|
| 1 | Iniciar sessão | `RUNNING`, cronômetro correto, evento `STARTED` publicado | Já coberto hoje |
| 2 | Iniciar → pausar | `PAUSED`, `paused_at` gravado, evento `PAUSED` | Já coberto hoje |
| 3 | Iniciar → finalizar | `COMPLETED`, `duration_minutes` correto, evento `FINISHED` | Já coberto hoje |
| 4 | Iniciar → navegar internamente (Hoje/Diário/Agenda) → sessão continua | Sessão permanece `RUNNING`, cronômetro não reinicia | Já coberto hoje (sem regressão) |
| 5 | Iniciar → fechar aba → sessão cancelada | `CANCELLED` no banco; próximo boot mostra IDLE | Camada A (imediato) + Camada B (garantia) |
| 6 | Iniciar → fechar janela → sessão cancelada | Igual ao #5 | Camada A + B |
| 7 | Iniciar → reload → sessão cancelada | Igual ao #5 (F5 dispara `pagehide` normalmente) | Camada A + B |
| 8 | Iniciar → logout → sessão cancelada | `CANCELLED` antes do reset de UI completar; próximo login mostra IDLE | Etapa 3 |
| 9 | Trocar temporariamente de aba (`visibilitychange` → hidden, sem `pagehide`) → sessão continua | `RUNNING` intacto, nenhuma chamada de cancelamento disparada | Camada A (guard explícito) |
| 10 | Reabrir aplicação após "crash" simulado (sessão `running` no fixture, nenhum evento de unload disparado) → nenhuma sessão aparece como running | Boot cancela automaticamente sessões além do limiar curto; tela abre IDLE | Camada B |
| 11 | Duas abas tentando iniciar sessão simultaneamente | Só uma vence (`SESSION_ALREADY_RUNNING` na perdedora); nenhuma duplicata `running` no banco | Já coberto hoje (índice único + guarda em app) |
| 12 | Fechamento durante perda de conexão (sem rede no momento do `pagehide`) | Camada A falha silenciosamente; Camada B cancela no próximo boot de qualquer dispositivo | Camada B |
| 13 | Sessão antiga abandonada não contamina nova sessão | Após cancelamento (automático ou manual), `startSession()` cria uma sessão nova limpa, sem herdar `paused_ms`/notas/questões da anterior | Já coberto hoje (`createActivitySession` sempre insere linha nova) + reforçado pela Etapa 4 |
| 14 *(adicional)* | Sessão `PAUSED` há muito tempo, fechamento de aba | Tratada igual a `RUNNING` — `CANCELLED` | Camada A + B |
| 15 *(adicional)* | `finishSession()` e fechamento de aba disputando a mesma sessão | Quem chegar primeiro no banco vence (`_transition`); o outro recebe conflito tratado como no-op, sem sobrescrever um `finished` legítimo com `cancelled` | Já coberto hoje (`_transition`) — validar no novo listener |
| 16 *(adicional)* | Logout em outra aba (mesma conta, duas abas abertas) | Ambas as abas acabam com a sessão `cancelled`; segunda tentativa de cancelamento é no-op silencioso | Etapa 3 + `_transition` |
| 17 *(adicional)* | Sessão restaurada dentro do limiar curto (ex.: reload muito rápido antes da Camada A completar, mas dentro da janela da Camada B) | Restaurada normalmente, sem cancelamento — evita falso positivo em reload legítimo/rápido | Camada B (limiar) |

---

## 9. Impacto — domínios que NÃO precisam ser alterados

Confirmado por leitura direta do código consumidor de `activity_sessions`/eventos de
sessão:

- **Diário** (`studyJournalView.js`) — lê só `listSessions()` (`finished`/`cancelled`),
  nunca `running`/`paused`; nenhuma sessão cancelada por esta mudança aparece diferente
  de uma cancelada manualmente hoje.
- **Agenda** (`eventFormView.js`, resumo de execução via
  `getEventExecutionSummary(ies)`) — já ignora `running`/`paused` para
  fins de estatística consolidada; só mostra "em andamento" enquanto a sessão existe
  como tal, o que passa a durar menos tempo (comportamento correto), não muda a
  interface de consumo.
- **Hoje** (`todayView.js`) — inicia sessões via `startSessionForEvent` (já existente);
  não lê estado interno do lifecycle além de "existe sessão ativa ou não", que
  continua funcionando pelo mesmo `getActiveSession()`.
- **Dashboard** (`activityDashboardView.js`/`activityDashboardService.js`) — agrega só
  minutos de sessões `finished` (via `duration_minutes`); sessões canceladas mais cedo
  (por unload/logout) nunca entravam nessa soma mesmo antes desta mudança.
- **Questões** (`sessionQuestionsService.js`) — CRUD por `session_id`, sem regra de
  status; questões de uma sessão cancelada continuam existindo no banco (já é o
  comportamento hoje — `cancelSession()` nunca deleta nada), sem alteração de
  contrato.
- **Revisões** (`reviewService.js`, `reviewSessionService.js`) — vínculo por
  `session_id`, mesma lógica, sem alteração de contrato.
- **Estatísticas / Streak / Achievements** (`insightsView.js`,
  `constancyHeatmapView.js`, achievement tracking) — todas já derivam de sessões
  `finished` (direta ou indiretamente via Dashboard); nenhuma delas nunca contou
  `running`/`paused`/`cancelled` como estudo válido, então esta mudança **remove uma
  fonte de erro** (sessões órfãs que ficavam `running` indefinidamente e podiam
  confundir telas que checam "há sessão ativa?"), sem exigir nenhuma alteração de
  código nesses módulos.
- **Histórico** (`listSessions()`) — mesmo argumento do Diário.
- **Autenticação** (`auth.js`, `authView.js`) — o fluxo de login/logout em si não
  muda; só um novo passo é inserido em `onBeforeSignOut` (Etapa 3), sem alterar
  `signIn`/`signUp`/`signOut`/`getSession`/`onAuthStateChange`.
- **Concorrência entre abas/dispositivos** (índice único parcial, `_transition`) — já
  correta hoje, reaproveitada sem modificação por toda a solução proposta.

---

## Resumo executivo

O gap real não é "o cronômetro mente enquanto a aba está aberta" (o cálculo de tempo já
é 100% server-timestamp based) — é **"nada no Anoti hoje marca uma sessão como
encerrada quando o usuário some sem clicar em Finalizar/Cancelar"**. A correção
proposta é deliberadamente pequena: reaproveitar `cancelSession()` e suas guardas de
concorrência já testadas, adicionar um gatilho de melhor esforço no fechamento real da
aba (`pagehide` + `sendBeacon`/`fetch keepalive`), fechar a lacuna do logout (que hoje
só limpa UI), e substituir a restauração silenciosa no boot por uma decisão automática
baseada em um limiar curto — a única peça que sozinha já garante a regra de produto de
forma determinística, independente de qualquer evento de browser funcionar ou não.
