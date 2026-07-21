# 02 — Roadmap de Implementação (pós-Auditoria Final 360°)

**Fonte:** [`01_FINAL_AUDIT_REPORT.md`](01_FINAL_AUDIT_REPORT.md) (M1–M20).
**Formato:** fases pequenas e independentes — **cada fase = 1 PR**, revisável isoladamente, sem misturar assuntos. Nenhuma fase cria funcionalidade nova além do que a auditoria justificou; a maioria rearranja, corrige ou endurece o que já existe.
**Convenção de numeração:** F15.x (o ciclo F14 está concluído e mergeado).

## Visão geral das ondas

| Onda | Tema | Fases | Gate |
|---|---|---|---|
| **1 — Confiança** | Segurança e observabilidade (bloqueadores de lançamento) | F15.1–F15.3 | **Sem a onda 1 completa, não lançar.** |
| **2 — Rotina real** | A promessa diária cumprida no caso recorrente | F15.4–F15.7 | Primeira semana pós-onda 1. |
| **3 — Robustez** | Concorrência, backend consistente, performance de boot | F15.8–F15.11 | Primeiro mês. |
| **4 — Coerência** | Identidade, higiene, acessibilidade, memória confiável | F15.12–F15.17 | Contínuo, ordem flexível. |

Dependências: praticamente todas as fases são independentes entre si; as poucas exceções estão marcadas no campo "Dependências".

---

## Onda 1 — Confiança (P0 · pré-lançamento)

### F15.1 — Escapar a narrativa do Progresso (correção de XSS)

- **Objetivo:** nenhum dado de usuário chega a `innerHTML` sem escape.
- **Problema resolvido:** XSS armazenado — `dominantCategory.name` (texto livre de `events.category`, plantável via importação `.ics` de terceiros) interpolado sem `escapeHtml()` na narrativa (M1).
- **Motivação:** bloqueador absoluto de lançamento comercial; vetor social plausível (calendários compartilhados entre estudantes).
- **Estratégia:** `escapeHtml(dominantCategory.name)` em `_narrativeSentences()`; varredura confirmatória dos demais templates com interpolação (a auditoria já mapeou os sinks — este é o único furo); teste de regressão com categoria contendo `<img onerror>`.
- **Arquivos:** `activityDashboardView.js` (linhas 256, 274), `tests/views/activityDashboardView.test.js`.
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** categoria com payload HTML renderiza como texto literal na narrativa; teste de regressão cobre o caso; nenhuma outra mudança visual.
- **Impacto estimado:** elimina a única vulnerabilidade de segurança conhecida do frontend.

### F15.2 — Endurecer a Edge Function `ai-chat`

- **Objetivo:** o servidor decide modelo, limites e frequência — nunca o cliente.
- **Problema resolvido:** `model`/`temperature`/`maxTokens` aceitos do navegador sem validação; ausência de rate limit por usuário (M2).
- **Motivação:** único vetor de abuso financeiro do produto; a chave Gemini é da desenvolvedora.
- **Estratégia:** allowlist de `model` (`["gemini-2.5-flash"]`, com rejeição 400 para outros valores); clamp de `temperature` a [0, 1] e `maxTokens` a [1, 2048]; rate limit consultando `ai_metrics` (ex.: máx. 20 chamadas/usuário/hora → 429 com mensagem amigável) antes de chamar o Gemini. Frontend intocado (`config/ai.js` já envia valores válidos).
- **Arquivos:** `supabase/functions/ai-chat/index.ts` (linhas 218-243).
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** payload com `model` fora da allowlist ou `maxTokens: 999999` recebe 400; 21ª chamada na mesma hora recebe 429; fluxo normal do painel de IA inalterado.
- **Impacto estimado:** teto de custo de IA por usuário passa de "ilimitado" para "conhecido".

### F15.3 — Observabilidade mínima de produção

- **Objetivo:** erros de campo chegam à desenvolvedora sem depender de relato de usuário.
- **Problema resolvido:** telemetria em buffer de memória descartado; `errorService` só loga no console (M3).
- **Motivação:** lançar cego significa descobrir bugs pelo churn; o padrão de coleta sem PII já existe no repo (`ai_metrics`).
- **Estratégia:** migração `sql/23_client_errors.sql` (insert-only, RLS: usuário insere as próprias linhas, ninguém lê via anon); `errorService.handleError()` passa a enviar (fire-and-forget, com rate limit local de N envios/minuto e deduplicação por assinatura do erro) categoria, contexto, mensagem truncada e user agent — nunca payloads de dados; documentar consulta de leitura no `OPERATIONS.md`.
- **Arquivos:** `sql/23_client_errors.sql`, `errorService.js`, `schemaService.js` (bump `EXPECTED_SCHEMA_VERSION`), `docs/OPERATIONS.md`, `docs/DATABASE.md`.
- **Dependências:** nenhuma (mas exige rodar a migração antes do deploy — fluxo já protegido pelo gate de schema).
- **Complexidade:** média.
- **Critério de aceite:** erro forçado em produção local aparece na tabela com contexto e sem PII; rate limit impede tempestade de inserts; app funciona normalmente se o insert falhar.
- **Impacto estimado:** tempo de detecção de bug de produção: de "indefinido" para horas.

---

## Onda 2 — Rotina real (P1 · primeira semana)

### F15.4 — Plano de amanhã consumido no início real da sessão

- **Objetivo:** a intenção registrada no "Fechar o dia" só é descartada quando cumprida.
- **Problema resolvido:** chip "Amanhã: X" chama `clearNextStudyPlan()` no clique; desistir do modal perde o plano para sempre (M4).
- **Motivação:** o gancho fechamento→abertura é a tese do F14.8; um buraco de perda de dados nele corrói o hábito que o produto quer criar.
- **Estratégia:** o clique no chip apenas marca `consumesPlan` no estado do modal; `clearNextStudyPlan()` roda após `startSession()` bem-sucedido (em `_confirmStartModal`/`_startManualSession`), nunca antes; fechar o modal limpa a marca.
- **Arquivos:** `studySessionView.js` (linhas 699-726, 772-813).
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** tocar o chip, fechar o modal e reabrir → o chip continua lá; iniciar a sessão pelo chip → o chip não reaparece na próxima.
- **Impacto estimado:** zero perdas silenciosas no ritual diário.

### F15.5 — Sugestões de início enxergam recorrência

- **Objetivo:** o chip "Hoje: {compromisso}" funciona para a rotina fixa semanal — o caso dominante da persona.
- **Problema resolvido:** `_loadStartSuggestions()` compara `event_date` cru com hoje; compromissos recorrentes nunca são sugeridos (M5).
- **Motivação:** a promessa central do F14.2 ("zero digitação no caso comum") falha exatamente no caso mais comum.
- **Estratégia:** substituir a busca em `_startEventsCache` por `expandEvents(await getEventsByRange(hoje, hoje), hoje, hoje)` — mesmo caminho já usado por `todayView._refreshAppointments()`; aplicar a mesma expansão à resolução do chip "Revisar:". Priorizar compromissos de categoria "Estudo" quando houver mais de um no dia.
- **Arquivos:** `studySessionView.js` (linhas 641-697).
- **Dependências:** nenhuma (F15.10 depois reduz o custo da consulta extra).
- **Complexidade:** baixa–média.
- **Critério de aceite:** com uma aula recorrente semanal caindo hoje, abrir o modal de início mostra o chip "Hoje: {aula}"; sessão iniciada pelo chip fica vinculada ao evento; caso sem compromisso hoje permanece idêntico.
- **Impacto estimado:** o fluxo de 2 cliques sem digitação passa a cobrir a rotina recorrente — a maior parte dos dias reais.

### F15.6 — QuickAdd como caminho padrão do "+ Novo compromisso"

- **Objetivo:** criar um compromisso típico custa título + hora + Enter, de qualquer entrada.
- **Problema resolvido:** o botão mais visível de criação abre o formulário completo de 10+ campos (M7); pendência explícita da auditoria PX (§11).
- **Motivação:** a primeira semana de adoção é dominada por criação de compromissos; o custo dessa ação define a primeira impressão de velocidade.
- **Estratégia:** `btn-new-event` chama `openQuickAdd(hoje, refreshAll, "", openEventFormPrefilled)` (o QuickAdd já tem "Mais opções" que leva ao formulário completo pré-preenchido); permitir edição da data dentro do QuickAdd quando aberto sem slot (um `input[type=date]` iniciado em hoje); formulário completo permanece intacto para edição e "Mais opções".
- **Arquivos:** `eventFormView.js` (linha 167), `quickAdd.js`, `index.html` (se necessário), `style.css`, testes de `quickAdd`/`eventFormView`.
- **Dependências:** nenhuma.
- **Complexidade:** média.
- **Critério de aceite:** "+ Novo compromisso" abre o QuickAdd com data de hoje; título+hora+Enter salva; "Mais opções" abre o formulário completo com título/data/hora preservados; clique na grade da semana continua funcionando como sempre.
- **Impacto estimado:** criação típica: de ~8 interações para 3.

### F15.7 — "Continuar" preserva vínculo e ignora canceladas

- **Objetivo:** o 1-clique de retomada mantém toda a semântica da sessão original.
- **Problema resolvido:** continuação de sessão de compromisso vira sessão avulsa (perde progresso temporal, categoria herdada e revisões por evento); sessões canceladas podem virar sugestão de título (M9).
- **Motivação:** coerência do modelo Planejamento×Execução no fluxo mais usado do produto.
- **Estratégia:** em `_loadContinueSuggestion`, guardar também `event_id`; em `_handleContinue`, se o evento ainda existe, usar `startSessionForEvent(event)`; senão, manter o caminho manual atual. Em `_loadStartSuggestions`, trocar `status: "all"` por `status: "finished"`.
- **Arquivos:** `todayView.js` (linhas 126-161), `studySessionView.js` (linha 666), testes correspondentes.
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** último estudo vinculado a compromisso → "Continuar" cria sessão com `event_id` e exibe a barra de progresso; título de sessão cancelada nunca aparece como chip.
- **Impacto estimado:** retomada sem perda de contexto; sugestões sem lixo histórico.

---

## Onda 3 — Robustez (P1/P2 · primeiro mês)

### F15.8 — Guarda de estado nas transições de sessão

- **Objetivo:** a máquina de estados da sessão é íntegra também sob concorrência de abas/dispositivos.
- **Problema resolvido:** UPDATE incondicional permite finalizar×cancelar em corrida, com sobrescrita silenciosa (M6).
- **Motivação:** o início de sessão já tem defesa de banco (índice parcial, AUD-001); o encerramento merece o mesmo rigor.
- **Estratégia:** novo helper interno `_transition(id, fields, fromStatuses)` que faz `.update(fields).eq("id", id).eq("user_id", uid).in("status", fromStatuses).select()`; 0 linhas retornadas → erro de domínio `SESSION_STATE_CONFLICT` com mensagem amigável ("Esta sessão já foi encerrada em outra aba."); `finishSession`/`cancelSession`/`pauseSession`/`resumeSession` passam a usá-lo. `SessionUpdated` continua publicado só em caso de sucesso.
- **Arquivos:** `activitySessionService.js` (linhas 64-76, 185-312), `tests/services/activitySessionService.test.js`, `tests/mocks/supabaseMock.js` (suporte a `.in()` no update, se faltar).
- **Dependências:** nenhuma.
- **Complexidade:** média.
- **Critério de aceite:** simulação de corrida nos testes (status muda entre leitura e escrita) resulta em erro de domínio, nunca em segunda escrita; fluxos normais inalterados; suíte verde.
- **Impacto estimado:** elimina a última janela de inconsistência de dados do domínio principal.

### F15.9 — `delete-account` mínimo e consistente

- **Objetivo:** a function mais sensível (LGPD) é também a mais simples.
- **Problema resolvido:** deletes manuais redundantes com erros ignorados, imports e CORS divergentes do padrão das outras functions (M10).
- **Motivação:** todas as FKs de dados de usuário já são `ON DELETE CASCADE` (verificado em `sql/01–18`); os deletes manuais são legado pré-F6 que só adiciona modos de falha.
- **Estratégia:** manter apenas: autenticação → limpeza do bucket `avatars/{userId}` (com erro checado) → `admin.auth.admin.deleteUser()`. Migrar para `Deno.serve` + import `npm:@supabase/supabase-js@2.110.0`; usar a mesma allowlist de CORS do `ai-chat`.
- **Arquivos:** `supabase/functions/delete-account/index.ts`, `docs/SECURITY.md` (nota sobre cascade como mecanismo oficial).
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** conta de teste excluída não deixa nenhuma linha em nenhuma tabela nem arquivos no Storage; erros de Storage retornam 500 explícito; as 3 functions compartilham o mesmo estilo de import e CORS.
- **Impacto estimado:** menos superfície de falha num fluxo juridicamente sensível.

### F15.10 — Cache de leitura por carregamento (events/categories)

- **Objetivo:** a mesma pergunta ao banco não é feita duas vezes na mesma sessão de uso.
- **Problema resolvido:** `getEvents()` integral disparado por 6+ módulos a cada abertura; `getCategories()` sem cache a cada resolução de nome (M8).
- **Motivação:** maior ganho de performance disponível pelo menor risco — nenhuma view muda de contrato.
- **Estratégia:** memoização interna nos dois services (promessa cacheada + invalidação em toda escrita do próprio service e no logout via reset já existente). Sem TTL: a invalidação por escrita cobre o app (todas as escritas passam pelos services); eventos externos (outra aba) já são tratados pelos fluxos de refresh existentes.
- **Arquivos:** `eventService.js`, `categoryService.js`, `script.js`/`authView.js` (chamada de reset no logout), testes de services.
- **Dependências:** nenhuma; beneficia F15.5.
- **Complexidade:** média.
- **Critério de aceite:** abertura do app dispara no máximo 1 consulta a `events` e 1 a `categories` (verificável no mock); criar/editar/excluir evento invalida e a UI reflete; logout limpa o cache; suíte verde.
- **Impacto estimado:** −60–70% das consultas de boot; abertura perceptivelmente mais rápida em rede móvel.

### F15.11 — Batch insert em `generateForEvent`

- **Objetivo:** gerar as revisões padrão de um compromisso custa 1 validação + 1 INSERT.
- **Problema resolvido:** 3 INSERTs sequenciais, cada um revalidando o evento — 6 round-trips (M19).
- **Motivação:** N+1 pontual identificado; ação de 1 clique deve ter latência de 1 chamada.
- **Estratégia:** validar o evento uma vez, montar as 3 linhas e usar `insert([...]).select()`; contrato de retorno (array de revisões criadas) preservado.
- **Arquivos:** `reviewService.js` (linhas 207-226), `tests/services/reviewService.test.js`.
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** mock registra exatamente 1 SELECT + 1 INSERT; retorno idêntico ao atual; suíte verde.
- **Impacto estimado:** latência da ação ~3× menor.

---

## Onda 4 — Coerência (P2/P3 · contínuo)

### F15.12 — Documentação sincronizada com o produto

- **Objetivo:** visão, arquitetura e changelog descrevem o produto que existe.
- **Problema resolvido:** `VISAO_DO_PRODUTO.md` proíbe o que o produto é; `ARCHITECTURE.md` descreve IA/telas antigas e schema 20 (real: 22); `CHANGELOG.md` para em F13.6; `package.json` tem scripts de teste mortos (M11 + achado nº 2 do PX, ainda aberto).
- **Motivação:** identidade declarada ≠ identidade real é dívida de produto — é a visão que disciplina o escopo futuro.
- **Estratégia:** reescrever a visão em torno da tese real ("ambiente diário de estudo: agenda enxuta + execução cronometrada + reflexão + revisão espaçada; fora de escopo: BI pessoal, gamificação, colaboração"); atualizar `ARCHITECTURE.md` (tela Hoje, closeDayService, progressNarrativeService, IA com 2 ações, schema 22); adicionar entradas F14.1–F14.9 + etapas do Diário ao `CHANGELOG.md`; remover/corrigir `test:unit` no `package.json`.
- **Arquivos:** `docs/VISAO_DO_PRODUTO.md`, `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `package.json`.
- **Dependências:** nenhuma (docs-only).
- **Complexidade:** baixa.
- **Critério de aceite:** nenhuma afirmação dos 4 arquivos contradiz o código; `npm run test:unit` funciona ou deixa de existir.
- **Impacto estimado:** decisões futuras de escopo passam a ter um norte escrito verdadeiro.

### F15.13 — "Hoje em números" atrás de disclosure

- **Objetivo:** a tela de chegada contém um convite, não um relatório.
- **Problema resolvido:** grade de stat-cards visível no primeiro olhar do dia, em tensão com o princípio do F14.5 (M13).
- **Motivação:** "mede em silêncio, fala em frases" — os números continuam a 1 clique, nunca na frente do CTA.
- **Estratégia:** mesmo padrão `disclosure-toggle` do Progresso ("Ver números de hoje"), nascendo colapsado; nenhum cálculo ou id muda (`dash-cards-today` intacto).
- **Arquivos:** `index.html` (linhas 355-359), `style.css`, `todayView.js` ou `activityDashboardView.js` (bind do toggle), teste de view.
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** Hoje abre sem nenhuma grade visível; 1 clique revela os mesmos cards de sempre; estado não persiste (nasce fechado a cada visita).
- **Impacto estimado:** chegada 100% focada em começar/continuar.

### F15.14 — Revisões pendentes na tela Hoje

- **Objetivo:** o diferencial pedagógico do produto (revisão espaçada) ganha uma superfície direta.
- **Problema resolvido:** nenhuma tela responde "o que devo revisar hoje?" — o sistema grava e agenda, mas nunca apresenta a fila (M15).
- **Motivação:** funcionalidade já paga (banco, service, vínculos) sem retorno por falta de exposição; é o que separa o Anoti de "calendário + cronômetro".
- **Estratégia:** seção "Para revisar" na tela Hoje (entre o hero e os compromissos), listando até 3 revisões de `listPending()` com `scheduled_date <= hoje`, cada linha com o título do compromisso e um botão "Revisar agora" → `startSessionForEvent()`; some quando vazia; nenhum motor novo.
- **Arquivos:** `todayView.js`, `index.html`, `style.css` (dados: `reviewService.listPending` + `eventService`, ambos existentes), `tests/views/todayView.test.js`.
- **Dependências:** F15.10 recomendada antes (evita mais um `getEvents()` cru).
- **Complexidade:** média.
- **Critério de aceite:** revisão vencida aparece na Hoje com 1 clique até o cronômetro vinculado ao compromisso; concluída/pulada, sai da lista; sem revisões, a seção não existe no DOM.
- **Impacto estimado:** a repetição espaçada passa de recurso latente a hábito visível — o maior salto de valor pedagógico disponível por PR.

### F15.15 — Busca do Diário sobre o histórico completo

- **Objetivo:** buscar no Diário nunca retorna resultado parcial.
- **Problema resolvido:** busca/filtros operam só sobre as páginas carregadas, com nota de rodapé admitindo parcialidade (M16).
- **Motivação:** o Diário é a memória de longo prazo do estudante; memória que responde pela metade quebra a confiança no produto inteiro.
- **Estratégia:** ao ativar busca ou filtro com `hasMore`, carregar as páginas restantes em lotes de 50 (mesma `listSessions`, com indicador de progresso) antes de filtrar em memória — mantém toda a lógica client-side de `studySearchService` intacta; remover `#sj-filter-partial-notice` quando o histórico completo estiver em memória. (Alternativa server-side via `ilike` fica documentada como evolução, não neste PR.)
- **Arquivos:** `studyJournalView.js` (linhas 967-1032, 847-870), `tests/views/studyJournalView.test.js`.
- **Dependências:** nenhuma.
- **Complexidade:** média.
- **Critério de aceite:** com 30+ sessões (3+ páginas), buscar um termo presente só na sessão mais antiga o encontra; contagens de resultados são totais; aviso de parcialidade nunca aparece com busca ativa.
- **Impacto estimado:** o Diário torna-se confiável como memória — seu propósito declarado.

### F15.16 — Formatadores de duração/hora unificados

- **Objetivo:** um único jeito de escrever "1h 20min" e "14:05" em todo o produto.
- **Problema resolvido:** ≥6 reimplementações do mesmo formatador com variações potenciais (M12).
- **Motivação:** consistência por construção; menos 80 linhas duplicadas.
- **Estratégia:** `formatDuration(minutes)` e `formatClockTime(iso)` em `utils.js` (semântica do formato mais usado: `"2h 05min"` → decidir e padronizar zero à esquerda); substituir as cópias em 6 arquivos; testes de unidade em `tests/utils.test.js`.
- **Arquivos:** `utils.js`, `todayView.js`, `studySessionView.js`, `activityHistoryView.js`, `studyJournalView.js`, `activityDashboardView.js`, `insightsView.js`, `tests/utils.test.js`.
- **Dependências:** nenhuma.
- **Complexidade:** baixa.
- **Critério de aceite:** `grep` não encontra nenhuma definição local de formatador de duração; exibição idêntica (ou unificada deliberadamente, documentada no PR); suíte verde.
- **Impacto estimado:** higiene com efeito direto na consistência percebida.

### F15.17 — Acessibilidade real das abas

- **Objetivo:** toda superfície anunciada como `tablist` se comporta como uma.
- **Problema resolvido:** abas sem `aria-controls`, sem tabindex roving e sem navegação por setas em 4 superfícies (M14).
- **Motivação:** semântica anunciada e não cumprida é pior, para leitores de tela, do que semântica ausente.
- **Estratégia:** helper único `initTabs(tablistEl, onChange)` implementando o padrão WAI-ARIA Tabs (setas ←/→, Home/End, roving tabindex, `aria-controls`/`aria-selected`); adotar em `#agenda-view-tabs`, `#sj-status-tabs`, abas do modal de início e `#theme-tabs`, substituindo os binds manuais.
- **Arquivos:** novo `tabsController.js`, `script.js`, `studyJournalView.js`, `studySessionView.js`, `settingsModal.js`, `index.html`, testes de views.
- **Dependências:** nenhuma.
- **Complexidade:** média.
- **Critério de aceite:** navegação completa por teclado nas 4 superfícies (setas trocam aba, Tab sai do grupo); atributos ARIA corretos verificados em teste; zero regressão visual.
- **Impacto estimado:** acessibilidade honesta + navegação por teclado mais rápida para todos.

---

## Backlog consciente (sem fase — decidir depois do lançamento)

Registrado para não se perder, deliberadamente fora do escopo das ondas:

- **Modularizar `studySessionView.js`** (M17): extrair modal de início, painel Questões/Revisões e modal de encerramento; substituir o acoplamento por ordem de listeners de Escape por uma pilha única de "fecháveis". Alta complexidade, zero mudança visível — fazer quando a próxima feature tocar o arquivo.
- **Smoke E2E Playwright no CI** (M18): 1 fluxo crítico contra Supabase local.
- **Poda final do painel Analisar** (M20): remover "Com observações" e o filtro de duração.
- **Fila offline mínima** para `+1 questão` e reflexão (retry via localStorage).
- **OAuth (Google)** — maior redutor de fricção de cadastro conhecido; depende de configuração Supabase, não de código complexo.
- **Migração de marca nos identificadores** (`medagenda_*` → `anoti_*`, com migração de chaves de storage) — só com um motivo forte; renomear sem migrar quebra preferências salvas.

---

## Ordem de execução recomendada

```
F15.1 → F15.2 → F15.3          (gate de lançamento)
     ↓
F15.4 → F15.5 → F15.6 → F15.7  (a semana da rotina real)
     ↓
F15.8 → F15.10 → F15.9 → F15.11
     ↓
F15.12 → F15.13 → F15.14 → F15.15 → F15.16 → F15.17
```

Cada PR: pequena, um assunto, com critério de aceite verificável e suíte de testes verde (`npm ci && npm test`) antes do merge — o mesmo padrão que trouxe o produto até aqui.
