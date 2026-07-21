# 01 — Auditoria Final 360° do Anoti
## Product Readiness · Backend · Frontend · UX · Arquitetura

**Produto:** Anoti (`v1.0.0-rc1`)
**Data:** 21/07/2026
**Método:** leitura integral do código-fonte (bootstrap, todas as views, todos os services, 22 migrações SQL, 3 Edge Functions, Service Worker, workflows de CI/CD), execução da suíte de testes (1.294 testes, todos verdes após `npm ci`) e confronto com as auditorias anteriores (F9 técnica, F11 readiness, F12 UX/UI, F13.7 refinamento, F14 PX). Nenhuma linha de código foi modificada.
**Contexto:** todo o roadmap F14 (F14.1–F14.9) e as 7 etapas da auditoria UX do Diário estão implementados e mergeados em `main`. Esta é a auditoria de fechamento antes do lançamento.

---

# Resumo Executivo

O Anoti chega a esta auditoria em um estado que pouquíssimos produtos de um desenvolvedor solo alcançam: **arquitetura documentada e coerente, 1.294 testes automatizados verdes, um design system consistente e uma jornada diária de estudo que de fato existe** (Hoje → chip de sugestão → cronômetro → +1 questão → reflexão no encerramento → fechar o dia). As cinco quebras de jornada apontadas pela auditoria PX anterior foram, todas, costuradas.

Ainda assim, a resposta ao critério de lançamento é **"quase — não hoje"**. Três razões objetivas:

1. **Existe uma vulnerabilidade XSS armazenada real** — o nome da categoria dominante (texto livre do usuário, também plantável via importação de arquivo `.ics` de terceiros) é interpolado sem escape no `innerHTML` da narrativa do Progresso (`activityDashboardView.js:274`). É correção de minutos, mas é bloqueador absoluto de um produto comercial.
2. **A Edge Function de IA confia demais no cliente** — `model`, `temperature` e `maxTokens` chegam do navegador sem allowlist nem teto (`ai-chat/index.ts:237-239`), e não há rate limit por usuário. Um usuário autenticado pode gerar custo arbitrário na conta Gemini do produto.
3. **O produto é cego em produção** — a telemetria é um buffer em memória que nunca sai do navegador (`telemetryService.js`) e não há captura de erros de campo. Lançar sem isso significa descobrir bugs pelo churn, não pelos logs.

Além dos bloqueadores, a auditoria encontrou uma camada de atritos menores, porém reais, quase todos concentrados no mesmo tema: **o produto ainda paga consultas e decisões que já pagou antes** — `getEvents()` completo é rebuscado em 6+ pontos a cada abertura; `getCategories()` vai ao banco a cada resolução de nome; o chip "Amanhã: X" é consumido no clique (e perdido se o usuário desistir do modal); as sugestões de início ignoram compromissos recorrentes que acontecem hoje; e o "+ Novo compromisso" ainda abre o formulário completo, contrariando a meta declarada da própria auditoria PX.

Nada disso é estrutural. A lista priorizada abaixo cabe em ~17 PRs pequenas (ver `02_IMPLEMENTATION_ROADMAP.md`), das quais **as 3 primeiras são as únicas que separam o Anoti de um beta público honesto**.

---

# Nota Geral do Produto

| Área | Nota | Síntese |
|---|---:|---|
| **Arquitetura** | **9,0** | Cliente-BaaS com camadas disciplinadas (View → Service → SDK → RLS), Session Event Bus como canal único de propagação, projeções derivadas nunca persistidas, fonte única de recorrência compartilhada com o backend, gate de schema no boot. Decisões documentadas no próprio código com rastreabilidade de auditoria (AUD-xxx, BUG-xx, Fxx.x). Raro. |
| **Backend** | **7,0** | RLS em todas as tabelas, índice único parcial contra corrida de sessão dupla, migrações numeradas e justificadas. Mas: Edge Function de IA sem allowlist de modelo/teto de tokens/rate limit; `delete-account` com deletes manuais redundantes e erros não checados; três estilos de import Deno diferentes entre as três functions; CORS `*` em duas delas contra origem restrita na terceira. |
| **Frontend** | **8,0** | Vanilla JS coeso, simetria init/reset rigorosa (nenhum estado vaza entre logins), skeletons e estados de erro categorizados em toda tela. Mas: `studySessionView.js` com 1.580 linhas concentra 4 sub-UIs; 6+ cópias do mesmo formatador de duração; 1 sink de `innerHTML` sem escape (XSS). |
| **UX** | **8,5** | A jornada diária existe e flui: 1 clique para continuar o último estudo, 2 para um novo, reflexão no ponto certo, modo foco, fechamento do dia. Atritos restantes: "+ Novo compromisso" abre 10+ campos; sugestões cegas a recorrência; plano de amanhã evaporável; "Hoje em números" reintroduz grade de stats na tela de chegada. |
| **UI** | **8,5** | Design system real (tokens, disclosures, painéis laterais, um `.btn-primary` por tela, tema claro/escuro/auto, `prefers-reduced-motion` respeitado). Pequenas dívidas: padrão ARIA de abas incompleto (sem navegação por setas), hack de ordem de listeners de Escape no modo foco. |
| **Performance** | **7,0** | Volume por usuário é pequeno e paginação existe onde importa (sessões). Mas a abertura do app dispara um leque de consultas redundantes: `getEvents()` integral em ≥6 módulos, `getCategories()` sem cache por chamada, Decision Engine rodando 3 motores com I/O próprio na entrada da tela Hoje. Em 1 ano de uso (300+ sessões, centenas de eventos), o custo cresce linearmente e sem teto. |
| **Consistência** | **7,5** | O código é notavelmente consistente; a documentação, não: `CHANGELOG.md` para em F13.6 (nenhuma entrada F14.x), `ARCHITECTURE.md` descreve um painel de IA de 3 análises que hoje tem 2 ações, `VISAO_DO_PRODUTO.md` ainda declara "fora do escopo" exatamente o que o produto é hoje (diário, gestão de estudos), `package.json` mantém scripts de teste apontando para arquivos que não existem mais. |
| **Escalabilidade** | **7,5** | Para o alvo (uso individual, dados por usuário na casa dos milhares de linhas), o modelo "recalcular projeções a cada leitura" é correto e elimina classes inteiras de bugs. Os limites conhecidos: busca/filtro do Diário só sobre páginas carregadas, `getEvents()` sem recorte, ausência de fila offline para escrita. |
| **Product Experience** | **8,5** | Pós-F14, o app abre no estudo, fala uma frase em vez de doze números, cala os cards de culpa e fecha o dia. O que falta é polimento de arestas (lista abaixo), não identidade. |
| **NOTA GERAL** | **8,0** | Produto maduro, com dívidas pequenas, concentradas e endereçáveis. |

### Pronto para lançamento?

**Não hoje — sim em ~2 semanas de PRs pequenas.** Justificativa:

- **Bloqueadores (P0):** XSS armazenado na narrativa do Progresso; hardening da Edge Function `ai-chat`; ausência total de observabilidade de produção. Um produto comercial não lança com um sink de XSS conhecido nem com uma API de IA que aceita `maxTokens` ilimitado do cliente.
- **Não bloqueadores, mas de primeira semana (P1):** perda silenciosa do "plano de amanhã", sugestões cegas a recorrência, corrida finalizar×cancelar entre abas sem guarda de estado.
- **Tudo o mais** é refinamento que pode (e deve) acontecer com o produto no ar.

---

# Pontos Fortes

1. **Arquitetura de projeções derivadas.** Nenhum indicador (streak, conquistas, marcos, resumos) é persistido — tudo é recalculado dos fatos brutos. Mudar uma regra de cálculo corrige retroativamente todo o histórico. É a decisão arquitetural mais valiosa do produto (`ARCHITECTURE.md`, seções "Modelo de Domínio" e "Princípios").
2. **Session Event Bus.** `activitySessionService.js` é o único publicador; 6 views/services reagem sem acoplamento direto. Duas abas abertas permanecem sincronizadas sem polling.
3. **Defesa em profundidade na regra "uma sessão running por usuário".** Checagem no service + índice único parcial no banco (`sql/19`) + reconhecimento do erro 23505 pelo nome do índice (`activitySessionService.js:111-114`). Concorrência tratada como problema de banco, não de UI.
4. **Simetria init/reset.** Cada subsistema inicializado em `_initApp` tem exatamente um reset no logout (`script.js:634-657`), incluindo limpeza de texto em DOM oculto (`studySessionView.js:1540-1579`). Troca de conta sem reload não vaza nada.
5. **1.294 testes verdes** cobrindo services, views (jsdom) e fluxos de integração (auth, sessão expirada, RLS, schema mismatch, fluxo completo de estudo) — sem test runner externo, só Node nativo.
6. **Gate de schema no boot** (`schemaService.js` + `scripts/check-schema.js` no deploy): o incidente das migrations 11–13 virou proteção permanente, em runtime e em CI.
7. **Jornada diária costurada (F14).** Continuar em 1 clique, começar em 2, zero digitação no caso recorrente, reflexão com a memória quente, +1 questão na superfície, modo foco, fechamento com ponte para amanhã. As cinco quebras da auditoria PX foram todas resolvidas.
8. **Silêncio como política.** `filterSpontaneousDecisions()` (`decisionEngine.js:311-316`) limita cards espontâneos a 2 tipos acionáveis; crítica passiva ("baixa execução") só aparece sob demanda. Máximo 1 card na chegada.
9. **Segurança de base correta:** RLS em todas as tabelas, chaves de IA/VAPID só em Edge Functions, CSP sem script inline, `escapeHtml()` usado com disciplina em ~99% dos sinks, privacidade de IA minimizada (só título/data/hora/categoria).
10. **Guard rails de CI:** App Shell do Service Worker gerado do grafo real de imports e verificado em CI; testes bloqueiam deploy; validação de schema antes de publicar.

---

# Pontos Fracos

## Segurança e confiabilidade

1. **[P0] XSS armazenado na narrativa do Progresso.** `_narrativeSentences()` interpola `dominantCategory.name` sem escape e o resultado entra em `narrativeEl.innerHTML` (`activityDashboardView.js:256,274`). A origem do valor é `events.category` — texto livre do usuário e, pior, **gravável por um `.ics` importado de terceiros** (`icsImporter.js:91`). Um "calendário da turma" malicioso compartilhado entre estudantes executa script na conta de quem importar. Todos os demais sinks auditados usam `escapeHtml()`/`highlightMatches()` corretamente; este é o único furo encontrado — mas basta um.
2. **[P0] `ai-chat` aceita `model`, `temperature` e `maxTokens` do cliente sem validação** (`supabase/functions/ai-chat/index.ts:237-239`). O `model` é interpolado direto na URL da API Gemini; `maxTokens` não tem teto; não existe rate limit por usuário (só o 429 do próprio Gemini é repassado). Usuário autenticado hostil = fatura de IA arbitrária.
3. **[P0] Cegueira operacional.** `telemetryService.js` guarda 200 eventos em memória e os descarta ("Future: forward to analytics provider"). `errorService` loga no console. Não há nenhum canal pelo qual um erro de produção chegue à desenvolvedora. `ai_metrics` prova que o padrão (insert via service role, sem PII) já existe e funciona — só nunca foi estendido a erros de frontend.
4. **[P1] Corrida finalizar×cancelar sem guarda no banco.** As transições leem o status e depois fazem `UPDATE` sem condição de estado (`activitySessionService.js:64-76`): duas abas podem, na janela entre leitura e escrita, finalizar E cancelar a mesma sessão — a última escrita vence silenciosamente e pode sobrescrever `ended_at`/`duration_minutes` já calculados. O produto já resolveu o problema análogo do start com índice parcial; falta o equivalente (UPDATE condicional `.in("status", ["running","paused"])`) nas transições de encerramento.
5. **[P1] Perda silenciosa do "plano de amanhã".** O chip "Amanhã: X" chama `clearNextStudyPlan()` no **clique** (`studySessionView.js:718-722`), não no início efetivo da sessão. Usuário toca o chip, fecha o modal sem iniciar → a intenção registrada no ritual de fechamento de ontem evaporou sem deixar rastro. É exatamente o dado emocional que o F14.8 existe para proteger.
6. **[P2] `delete-account` é código de outra era.** Deleta manualmente 4 tabelas cujas FKs já têm `ON DELETE CASCADE` (todas — verificado em `sql/01,02,04,05,07,08,11,13,15,18`), ignora os erros desses deletes, usa `serve()` do std 0.177 enquanto as outras functions usam `Deno.serve`, importa supabase-js de `esm.sh` enquanto `ai-chat` usa `npm:`, e responde CORS `*` enquanto `ai-chat` restringe origem. Funciona, mas é o módulo com maior distância do padrão do resto do backend.

## Performance e eficiência

7. **[P1] O app rebusca o que já tem.** `getEvents()` (tabela inteira, `select *`) é chamado independentemente por: lista de compromissos, modal de início de sessão, Diário (lookup de metadados por página), narrativa do Progresso, `insightsService`, `reflectionService` e `activityHistoryView` (`grep getEvents()` — 6+ call sites). `getCategories()` idem, inclusive a cada `_resolveEventMeta()` de sessão avulsa. Abrir o app numa manhã típica dispara a mesma consulta de eventos 3–4 vezes em sequência. Não há nenhuma camada de memoização por carregamento.
8. **[P2] Tela Hoje aciona os 3 motores do Decision Engine** (`getDecisions()` roda Recommendation + Planning + Reflection, cada um com seu próprio I/O) a cada visita, para exibir no máximo 1 card de 2 tipos possíveis. O filtro é aplicado **depois** do custo, não antes.
9. **[P2] `generateForEvent()` cria 3 revisões em 3 INSERTs sequenciais**, cada um revalidando o evento com um SELECT extra (`reviewService.js:207-226`) — 6 round-trips para uma ação de 1 clique.

## UX e produto

10. **[P1] Sugestões de início são cegas a recorrência.** `_loadStartSuggestions()` procura o compromisso de hoje com `ev.event_date === todayISO` sobre eventos **crus** (`studySessionView.js:678`) — a aula de terça-feira que se repete semanalmente nunca é sugerida, porque seu `event_date` base é o de semanas atrás. A tela Hoje faz o certo (`expandEvents`, `todayView.js:171`); o modal de início, não. O chip "Revisar:" sofre do mesmo mal. Resultado: a promessa central do F14.2 ("zero digitação no caso comum") falha justamente no caso mais comum de estudante de medicina — a rotina fixa semanal.
11. **[P1] "+ Novo compromisso" ainda abre o formulário completo** (`eventFormView.js:167` → `openEventForm()`), com 10+ campos. A meta declarada da auditoria PX (§11: "abrir o QuickAdd, 'Mais opções' expande") ficou de fora das 9 fases implementadas. O QuickAdd — "o melhor componente do produto" — segue alcançável apenas clicando na grade da semana.
12. **[P2] "Continuar: X" degrada sessões de compromisso a avulsas.** `_handleContinue()` inicia sempre `source: "manual"` com o título resolvido (`todayView.js:146-161`) — se o último estudo foi uma sessão vinculada a compromisso, a continuação perde o vínculo (e com ele a barra de progresso temporal, a categoria herdada e a associação de revisões por evento). Além disso, `_loadStartSuggestions()` colhe títulos com `status: "all"` (`studySessionView.js:666`), permitindo que uma sessão **cancelada** vire sugestão.
13. **[P2] "Hoje em números" reintroduz a grade de stats na tela de chegada** (`index.html:355-359`). O F14.5 tirou os números da frente do Progresso e os pôs atrás de "Ver números"; a absorção do antigo Dashboard pela tela Hoje trouxe de volta uma fileira de stat-cards para o primeiro olhar do dia — em tensão direta com o princípio "mede em silêncio" da auditoria PX.
14. **[P2] Busca e filtros do Diário operam só sobre as páginas carregadas** (nota de rodapé admite: `#sj-filter-partial-notice`). Para o usuário de 1 ano, buscar "Cardiologia" retorna resultados parciais até que ele clique "Carregar mais" repetidamente. A limitação é honesta, mas a solução real (busca no servidor via `ilike`, ou carregar tudo ao ativar filtro) nunca chegou.
15. **[P3] Sete controles no painel "Analisar"** (período, categoria, 3 flags "Somente", questões 3-estados, duração 3-estados). Já houve poda real (filtros de tipo/status/dificuldade de questão removidos no F14.7), mas "Com observações" e "Duração: qualquer" seguem sendo filtros de pesquisador, não de estudante.

## Consistência e higiene

16. **[P1] Documentação mente.** `VISAO_DO_PRODUTO.md` declara fora de escopo "diário ou journal, sistema de gestão de estudos, planner de produtividade" — a descrição exata do produto atual. A auditoria PX apontou isso como achado nº 2 ("o produto virou aquilo que sua própria visão proíbe") e recomendou reescrever a visão; nove fases depois, o arquivo está intocado. `ARCHITECTURE.md` descreve o painel de IA antigo (3 análises; hoje são 2 ações), não menciona `todayView`/`closeDayService`/`progressNarrativeService`, e lista schema na versão 20 (o banco está na 22). `CHANGELOG.md` termina em F13.6 — as 9 fases F14 e as 7 etapas do Diário não existem nele.
17. **[P2] `package.json` com scripts mortos:** `test:unit` referencia `tests/smartAssistant.test.js` e `tests/analytics.test.js`, que não existem — o script falha se invocado.
18. **[P2] Padrão ARIA de abas incompleto:** `role="tablist"/"tab"` sem `aria-controls`, sem `tabindex` roving e sem navegação por setas (agenda, diário, modal de início, tema). Leitores de tela anunciam abas que não se comportam como abas.
19. **[P3] Duplicação de formatadores:** `_formatMinutes`/`_formatDuration`/`_formatExpectedDuration` reimplementados em ≥6 arquivos (`todayView.js:239`, `studySessionView.js:392`, `activityHistoryView.js:158`, `studyJournalView.js:278`, `activityDashboardView.js`, `insightsView.js`) — mesma lógica, nomes diferentes, nenhum em `utils.js`.
20. **[P3] Marca residual:** repositório `MedAgenda`, chaves de storage `medagenda_*`, cache do SW `medagenda-shell-*` — o produto chama-se Anoti. Cosmético, mas cada chave nova perpetua o legado.
21. **[P3] `studySessionView.js` (1.580 linhas) é 4 módulos num arquivo:** tela ativa + modal de início + painel Questões/Revisões + modal de encerramento. O comentário em `_queryElements()` sobre a ordem de registro de listeners de Escape (`studySessionView.js:191-205`) é o sintoma: acoplamento por ordem de execução documentado em vez de eliminado.

---

# Auditoria Funcional — módulo a módulo

| Módulo | Ajuda o estudante? | Excesso/Atrito encontrado |
|---|---|---|
| **Login/Cadastro** | Sim — fluxo completo (confirmação, recuperação, redefinição), erros categorizados, watchdog de boot. | Sem OAuth (fricção de adoção conhecida e documentada). Nada a cortar. |
| **Hoje** | Sim — é a resposta certa a "o que eu faço agora". | "Hoje em números" compete com o CTA (item 13). Dica contextual custa 3 motores (item 8). |
| **Agenda (Semana/Mês/Lista)** | Sim — consulta, como deve ser. | "+ Novo" abre formulário completo (item 11). Ordenação "Título A–Z" da Lista segue sem caso de uso real. |
| **Sessão** | Sim — o coração do produto, e está sólido: restauração, abandono, pausa líquida, foco. | Sugestões cegas a recorrência (item 10); chip de amanhã evaporável (item 5). |
| **Questões** | Sim — o "+1" na superfície foi a correção certa. | Formulário detalhado (tipo/status/dificuldade/matéria/tópico) permanece corretamente escondido; manter. |
| **Revisões** | Parcialmente — criar/associar durante a sessão funciona, mas revisões **pendentes não têm tela própria**: vivem como chip eventual e card de decisão. O estudante não tem onde ver "o que devo revisar esta semana". | A pergunta "quando reviso?" é respondida por 3 superfícies indiretas (chip, smart card, Insights) e por nenhuma direta. |
| **Reflexões** | Sim — no encerramento, custo zero, editável no Diário. | Resolvido pelo F14.3; rótulo unificado corretamente. |
| **Diário** | Sim — leitura do percurso com densidade certa pós-poda. | Busca parcial (item 14); 7 filtros no Analisar (item 15). |
| **Histórico (Todas/Canceladas)** | Marginal — auditoria pessoal, uso raro. | Corretamente rebaixado a aba + filtro. Manter como está. |
| **Progresso** | Sim — narrativa primeiro, números atrás de disclosure. Modelo correto. | Conquistas/marcos seguem como listas estáticas; valor real só aparecerá com tempo de uso. |
| **Insights** | Parcialmente — blocos Revisões/Produtividade são grades de números dentro do disclosure. | Aceitável; candidato a absorção futura pela narrativa. |
| **Planejamento** | Parcialmente — o plano da semana existe atrás de um disclosure na Agenda e como ação de IA; nunca se conecta ao ato de começar a estudar. | O motor decide, mas não propõe no lugar onde a decisão acontece (modal de início). |
| **Configurações** | Sim — tema, notificações locais/push, diagnóstico. | Nada a cortar. |
| **IA** | Sim — 2 ações (Planejar/Como estou indo), painel contido, timeout comunicado. | Docs desatualizados (item 16). Resposta é texto corrido não persistido — aceitável. |
| **Perfil/Metas** | Sim — metas com limites validados, foco direto na seção via link do card. | Nada a cortar. |
| **Filtros/Busca** | Agenda-Lista: ok. Diário: itens 14–15. | — |
| **Calendário Acadêmico/ICS** | Sim para o nicho (grade institucional). | Vetor do XSS via importação (item 1) — sanitizar na entrada além de escapar na saída. |

### Auditoria da Experiência — estudar ou administrar?

Pós-F14, o balanço virou: a tela de chegada é de estudo, o caminho comum tem 1–2 cliques, o software cala a crítica espontânea. O que resta de "administrar" é opcional e está atrás de portas. As exceções que ainda roubam segundos diários: a grade "Hoje em números" na chegada, o formulário completo no "+ Novo", e a redigitação causada pela cegueira a recorrência nas sugestões.

### Auditoria de Produto — e depois de um ano?

- **Continuará simples?** Sim — a navegação tem 5 destinos e o modelo mental (Hoje/Agenda/Sessão/Diário/Progresso) é estável.
- **O que cansará?** A busca parcial do Diário (item 14) é o primeiro atrito que só aparece com volume; o segundo é o custo crescente de `getEvents()` sem recorte (item 7).
- **O que nunca será usado?** Filtros "Com observações"/"Duração" do Analisar; ordenação A–Z; edição detalhada de questão (tipo/dificuldade) por quem usa o +1; exportação ICS para a maioria.
- **O que deveria aparecer só quando necessário?** Conquistas e Marcos (hoje sempre presentes nas suas superfícies, mesmo zerados nos primeiros dias); o bloco de Revisões do Insights (vazio para quem não usa revisões).

---

# Benchmark conceitual

- **Things (clareza):** o Anoti agora tem seu *Today* — paridade conceitual alcançada. O que falta é a finitude: Things mostra uma lista que termina; a tela Hoje mistura CTA, compromissos e stats sem um "isso é tudo por hoje".
- **Sunsama (ritual):** "Fechar o dia" é exatamente a lição aplicada — com a ressalva de que a intenção de amanhã pode evaporar (item 5), e Sunsama jamais perde o que o usuário planejou no ritual.
- **Motion (decisão automática):** o Anoti decide o *conteúdo* sugerido, mas ainda não o *quando*; o plano semanal segue como comentário, não como proposta acionável no modal de início.
- **TickTick (timer a um toque):** paridade no caso "continuar" (1 clique). No caso "compromisso recorrente de hoje", TickTick venceria — é o item 10.
- **Todoist/Google Calendar (custo de entrada):** o QuickAdd é comparável; escondê-lo atrás do clique na grade (item 11) é a diferença que resta.
- **Linear (velocidade como estética):** os atalhos (N, /, G+tecla) e o cache-first do App Shell apontam na direção certa; as consultas redundantes de abertura (item 7) apontam na contrária.
- **Apple Health (narrativa sobre grade):** o Progresso narrativo é a lição aplicada com fidelidade — a melhor tela nova do produto.
- **Arc/Apple Calendar (silêncio):** política de 1 card acionável implementada e testada. Paridade.
- **Notion (flexibilidade):** anti-modelo correto — o Anoti acertou em NÃO ser configurável.

---

# Oportunidades de melhoria

Além das correções da lista priorizada:

1. **Uma tela (ou seção) de revisões pendentes** — a única pergunta de estudo que o produto sabe responder e não responde em lugar nenhum diretamente ("o que devo revisar?"). Poderia ser uma seção na tela Hoje, alimentada por `listPending()` que já existe.
2. **Camada de leitura com memoização por carregamento** — um `dataLayer` fino (TTL de segundos ou invalidação por evento de escrita) na frente de `getEvents()`/`getCategories()` eliminaria 60–70% das consultas de abertura sem tocar em nenhuma view.
3. **Narrativa como padrão de toda superfície analítica** — Insights (Revisões/Produtividade) pode seguir o mesmo caminho do Progresso: uma frase, números atrás.
4. **Smoke E2E real** — 1.294 testes jsdom não abrem um navegador; um único fluxo Playwright (login → iniciar → +1 questão → finalizar com reflexão → ver no Diário) protegeria o caminho crítico contra regressões que jsdom não vê (CSS, focus real, service worker).
5. **Fila offline mínima para escritas leves** (reflexão, questão +1) — o SDK não oferece, mas um retry de fila em `localStorage` para esses dois casos cobriria o cenário "estudando sem sinal" sem reestruturar o produto.

---

# Lista priorizada de melhorias

> Prioridade: P0 = bloqueia lançamento · P1 = primeira semana · P2 = primeiro mês · P3 = oportunista.
> Complexidade: B = baixa (horas) · M = média (1–2 dias) · A = alta (3+ dias).

---

**M1 — Escapar a narrativa do Progresso (XSS armazenado)** · **P0 · B**
- **Descrição:** aplicar `escapeHtml()` a `dominantCategory.name` em `_narrativeSentences()` e varrer os demais templates de `innerHTML` que interpolam dados (auditoria encontrou este único furo, mas a varredura deve virar teste).
- **Problema:** categoria é texto livre do usuário e importável via `.ics` de terceiros; hoje executa como HTML na página Progresso.
- **Impacto:** elimina vulnerabilidade de XSS armazenado com vetor social real (compartilhamento de calendários entre estudantes).
- **Arquivos:** `activityDashboardView.js` (linhas 256, 274), teste novo em `tests/views/activityDashboardView.test.js`.
- **Justificativa:** bloqueador absoluto; correção de minutos.

**M2 — Endurecer a Edge Function `ai-chat`** · **P0 · B**
- **Descrição:** allowlist de `model` (só `gemini-2.5-flash`), clamp de `temperature` (0–1) e `maxTokens` (teto 2048), e rate limit simples por usuário (contagem em `ai_metrics` na última hora antes de chamar o Gemini).
- **Problema:** cliente controla modelo (interpolado na URL da API), tokens sem teto e frequência sem limite — custo arbitrário na conta Gemini.
- **Impacto:** fecha o único vetor de abuso financeiro do produto.
- **Arquivos:** `supabase/functions/ai-chat/index.ts` (linhas 237-239, 242).
- **Justificativa:** superfície pública autenticada com custo variável não pode confiar no cliente.

**M3 — Observabilidade mínima de produção** · **P0 · M**
- **Descrição:** tabela `client_errors` (mesmo padrão de `ai_metrics`: insert-only, sem PII, RLS) alimentada por `errorService` (erros categorizados como bug, com contexto e user agent, rate-limited no cliente).
- **Problema:** nenhum erro de produção chega à desenvolvedora; o produto lançaria cego.
- **Impacto:** bugs de campo detectáveis em horas em vez de via churn.
- **Arquivos:** `sql/23_client_errors.sql`, `errorService.js`, `telemetryService.js`, `docs/OPERATIONS.md`.
- **Justificativa:** pré-requisito de operação comercial; o padrão já existe no próprio repo.

**M4 — Consumir o plano de amanhã no início real da sessão** · **P1 · B**
- **Descrição:** mover `clearNextStudyPlan()` do clique do chip para o sucesso de `startSession()` (flag no estado do modal).
- **Problema:** tocar o chip e desistir do modal apaga a intenção registrada no fechamento de ontem.
- **Impacto:** o ritual F14.8→F14.2 deixa de ter um buraco de perda de dados.
- **Arquivos:** `studySessionView.js` (linhas 707-724, 772-809).
- **Justificativa:** protege o gancho de hábito que é a tese central do F14.

**M5 — Sugestões de início com recorrência expandida** · **P1 · B/M**
- **Descrição:** em `_loadStartSuggestions()`, usar `expandEvents(getEventsByRange(hoje, hoje))` (mesmo caminho de `todayView.js`) para os chips "Hoje:" e "Revisar:", em vez de comparar `event_date` cru.
- **Problema:** compromissos recorrentes (o caso dominante da persona: aulas fixas, plantões semanais) nunca são sugeridos.
- **Impacto:** a promessa "zero digitação no caso comum" passa a valer para o caso mais comum.
- **Arquivos:** `studySessionView.js` (linhas 641-697).
- **Justificativa:** é a diferença entre o F14.2 funcionar no demo e funcionar na rotina real.

**M6 — Guarda de estado nas transições de encerramento** · **P1 · M**
- **Descrição:** `finishSession`/`cancelSession`/`pauseSession`/`resumeSession` passam a usar UPDATE condicional (`.in("status", [estados válidos])`) e tratam "0 linhas afetadas" como conflito de concorrência com mensagem própria.
- **Problema:** duas abas podem finalizar e cancelar a mesma sessão; a última escrita vence silenciosamente.
- **Impacto:** máquina de estados íntegra também sob concorrência, fechando o gap que o start já não tem.
- **Arquivos:** `activitySessionService.js` (64-76, 185-312), testes em `tests/services/activitySessionService.test.js`.
- **Justificativa:** consistência com o rigor já aplicado ao início de sessão (AUD-001).

**M7 — QuickAdd como caminho padrão do "+ Novo compromisso"** · **P1 · M**
- **Descrição:** `btn-new-event` abre o QuickAdd (título+hora+Enter); "Mais opções" (já existente no QuickAdd) leva ao formulário completo pré-preenchido.
- **Problema:** a ação de criação mais visível do produto abre 10+ campos; a meta declarada do PX (§11) ficou sem fase.
- **Impacto:** criação típica cai de ~8 interações para 3.
- **Arquivos:** `eventFormView.js:167`, `quickAdd.js` (aceitar abertura sem data pré-selecionada), `script.js`.
- **Justificativa:** completa a última pendência explícita da auditoria PX.

**M8 — Cache de leitura por carregamento (events/categories)** · **P1 · M**
- **Descrição:** memoização com invalidação por escrita (create/update/delete de evento/categoria) e por logout, dentro dos próprios services — assinatura pública intocada.
- **Problema:** `getEvents()` integral é disparado por 6+ módulos a cada abertura; `getCategories()` a cada resolução de nome.
- **Impacto:** −60–70% das consultas de boot; abertura perceptivelmente mais rápida em rede móvel; custo Supabase menor.
- **Arquivos:** `eventService.js`, `categoryService.js`, `script.js` (reset no logout).
- **Justificativa:** maior ganho de performance disponível por menor risco — nenhuma view muda.

**M9 — "Continuar" preserva o vínculo e ignora canceladas** · **P2 · B**
- **Descrição:** em `_loadContinueSuggestion`/`_handleContinue`, se a última sessão finalizada tem `event_id` vivo, continuar via `startSessionForEvent(event)`; colher títulos recentes só de `status: "finished"`.
- **Problema:** continuação degrada sessão de compromisso a avulsa (perde progresso temporal/categoria); título de sessão cancelada pode virar sugestão.
- **Impacto:** o 1-clique de retomada mantém toda a semântica do dado.
- **Arquivos:** `todayView.js` (126-161), `studySessionView.js:666`.
- **Justificativa:** coerência do modelo Planejamento×Execução no fluxo mais usado.

**M10 — `delete-account` moderno e mínimo** · **P2 · B**
- **Descrição:** remover os 4 deletes manuais redundantes (CASCADE cobre tudo), manter só a limpeza de Storage + `deleteUser`, migrar para `Deno.serve` e import `npm:`, restringir CORS à mesma allowlist do `ai-chat`.
- **Problema:** código legado divergente do padrão, com erros não checados.
- **Impacto:** menos superfície, consistência entre as 3 functions.
- **Arquivos:** `supabase/functions/delete-account/index.ts`.
- **Justificativa:** exclusão de conta é fluxo LGPD-sensível; deve ser o mais simples possível.

**M11 — Documentação sincronizada com o produto** · **P1 · B**
- **Descrição:** reescrever `VISAO_DO_PRODUTO.md` (a visão real: ambiente diário de estudo com agenda, execução e reflexão), atualizar `ARCHITECTURE.md` (tela Hoje, closeDay, narrativa, IA com 2 ações, schema 22), completar `CHANGELOG.md` (F14.1–F14.9 + 7 etapas do Diário), corrigir scripts mortos do `package.json`.
- **Problema:** os 4 documentos centrais contradizem o produto; a visão proíbe o que o produto é.
- **Impacto:** onboarding de qualquer colaborador (ou auditoria futura) deixa de partir de premissas falsas.
- **Arquivos:** `docs/VISAO_DO_PRODUTO.md`, `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `package.json`.
- **Justificativa:** identidade declarada ≠ identidade real é dívida de produto, não só de docs (achado nº 2 do PX, ainda aberto).

**M12 — Formatadores de duração/data unificados** · **P2 · B**
- **Descrição:** `formatDuration(minutes)` e `formatClockTime(iso)` em `utils.js`; substituir as 6+ cópias.
- **Problema:** mesma lógica reimplementada com variações sutis ("1h 5min" vs "1h 05min" em potencial).
- **Impacto:** consistência de exibição garantida por construção; -~80 linhas.
- **Arquivos:** `utils.js`, `todayView.js`, `studySessionView.js`, `activityHistoryView.js`, `studyJournalView.js`, `activityDashboardView.js`, `insightsView.js`.
- **Justificativa:** higiene barata com efeito visível na consistência.

**M13 — "Hoje em números" atrás de disclosure** · **P2 · B**
- **Descrição:** a grade de stats da tela Hoje nasce colapsada ("Ver números de hoje"), mesmo padrão do Progresso.
- **Problema:** a tela de chegada volta a reportar em grade — contra o princípio que o próprio F14.5 estabeleceu.
- **Impacto:** chegada 100% focada em começar/continuar; números a 1 clique.
- **Arquivos:** `index.html` (355-359), `style.css`, `activityDashboardView.js` (nenhum cálculo muda).
- **Justificativa:** coerência com "mede em silêncio, fala em frases".

**M14 — Acessibilidade real das abas** · **P2 · M**
- **Descrição:** completar o padrão WAI-ARIA Tabs (aria-controls, tabindex roving, setas ←/→, Home/End) num helper único usado por agenda, diário, modal de início e tema.
- **Problema:** abas anunciadas como tabs não navegam como tabs; teclado exige Tab por cada botão.
- **Impacto:** acessibilidade honesta e navegação por teclado mais rápida para todos.
- **Arquivos:** novo `tabsController.js`, `index.html`, views das 4 superfícies com abas.
- **Justificativa:** o produto anuncia semântica que não cumpre — pior que não anunciar.

**M15 — Revisões pendentes visíveis na tela Hoje** · **P2 · M**
- **Descrição:** seção "Para revisar" na tela Hoje listando `listPending()` vencidas/de hoje (máx. 3), cada uma iniciando sessão do compromisso em 1 clique.
- **Problema:** o sistema de revisões grava e agenda, mas nunca apresenta a fila ao estudante em nenhuma superfície direta.
- **Impacto:** a repetição espaçada — maior diferencial pedagógico do domínio — passa a acontecer de fato.
- **Arquivos:** `todayView.js`, `index.html`, `style.css` (dados: `reviewService.listPending`, já existente).
- **Justificativa:** funcionalidade já paga (banco, service, vínculo) sem retorno por falta de exposição.

**M16 — Busca do Diário sobre o histórico completo** · **P2 · M**
- **Descrição:** ao ativar busca/filtro, carregar as páginas restantes em lote (ou consulta `ilike` no servidor para o campo de busca), removendo o aviso de parcialidade.
- **Problema:** resultados parciais silenciosamente errados para quem tem mais de 10 sessões (a nota de rodapé mitiga, não resolve).
- **Impacto:** o Diário torna-se confiável como memória de longo prazo — seu propósito.
- **Arquivos:** `studyJournalView.js` (978-1032), possivelmente `activitySessionService.listSessions`.
- **Justificativa:** primeiro atrito que o usuário de 1 ano encontra.

**M17 — Modularizar `studySessionView.js`** · **P3 · A**
- **Descrição:** extrair `sessionStartModal.js`, `sessionQRPanel.js` e `sessionFinishModal.js`; eliminar o acoplamento por ordem de listeners de Escape com um coordenador único de camadas (stack de fecháveis).
- **Problema:** 1.580 linhas, 4 responsabilidades, hack de ordem documentado.
- **Impacto:** manutenção do coração do produto sem medo; Escape determinístico.
- **Arquivos:** `studySessionView.js`, novos módulos, `tests/views/studySessionView.test.js`.
- **Justificativa:** dívida contida hoje, cara amanhã — fazer antes que cresça.

**M18 — Smoke E2E no CI** · **P3 · M**
- **Descrição:** 1 teste Playwright (login → iniciar sessão manual → +1 questão → finalizar com reflexão → conferir no Diário) contra Supabase local ou mock.
- **Problema:** zero cobertura de navegador real; regressões de CSS/foco/SW invisíveis à suíte jsdom.
- **Impacto:** caminho crítico protegido de ponta a ponta.
- **Arquivos:** `tests/e2e/`, `.github/workflows/ci.yml`.
- **Justificativa:** complemento, não substituto, da excelente suíte atual.

**M19 — Batch insert em `generateForEvent`** · **P3 · B**
- **Descrição:** validar o evento uma vez e inserir as 3 revisões num único `insert([...])`.
- **Problema:** 6 round-trips para uma ação de 1 clique.
- **Impacto:** latência da ação cai ~3×; sem mudança de contrato.
- **Arquivos:** `reviewService.js` (207-226).
- **Justificativa:** correção pontual de N+1 identificada.

**M20 — Poda final do painel Analisar** · **P3 · B**
- **Descrição:** remover "Com observações" e o filtro de duração; manter período, categoria, reflexão, revisões e questões.
- **Problema:** filtros de pesquisador remanescentes num diário de estudante.
- **Impacto:** -2 controles; painel coerente com o uso real.
- **Arquivos:** `index.html`, `studyJournalView.js`, `studySearchService.js`.
- **Justificativa:** continuação natural da poda F14.7, com os mesmos critérios.

---

# Conclusão

## "O que ainda impede o Anoti de ser uma referência em organização e disciplina para estudantes?"

Quatro coisas — e nenhuma delas é falta de funcionalidade:

1. **Confiança de nível comercial.** Uma referência não pode ter um XSS armazenado conhecido, uma API de IA que aceita custo ilimitado do cliente, nem operar cega a erros de produção. São as três correções P0 — pequenas, mas inegociáveis. Referência é, antes de tudo, um produto em que se confia.

2. **A última milha da promessa "zero digitação".** O produto promete começar a estudar sem teclado e cumpre — exceto para quem tem rotina recorrente, que é precisamente a persona (aulas fixas, plantões semanais). Enquanto o chip "Hoje:" não enxergar recorrência (M5), e enquanto o plano de amanhã puder evaporar num clique (M4), a mecânica de hábito que diferencia o Anoti funciona no caso demo e falha no caso real.

3. **Revisão espaçada como cidadã de primeira classe.** O Anoti já tem o que nenhum concorrente generalista (Things, TickTick, Todoist) tem: revisões vinculadas a compromissos e a sessões, com datas geradas. Mas esse diferencial está invisível — não existe uma superfície que responda "o que devo revisar hoje?". Expor a fila de revisões na tela Hoje (M15) é o menor investimento com maior potencial de tornar o produto *pedagogicamente* referência, não só organizacionalmente.

4. **Identidade declarada.** A visão escrita do produto ainda proíbe o que o produto é. Referências têm tese clara — "ambiente diário de estudo: planeje pouco, estude muito, feche o dia" — e essa tese precisa estar no papel (M11), porque é ela que disciplina cada próxima decisão de escopo contra a recaída em "mais um painel, mais um filtro".

## Critério final

> **"Se este produto fosse lançado comercialmente hoje, o que ainda impediria um estudante de adotá-lo como sua principal ferramenta diária de planejamento, organização, foco e disciplina?"**

Resposta honesta, em ordem decrescente de peso:

1. **Risco e opacidade operacional (impede o lançamento, não a adoção).** XSS armazenado com vetor de compartilhamento social (M1), API de IA financeiramente abusável (M2) e zero visibilidade de erros em campo (M3). O estudante não veria nada disso no primeiro dia — e é exatamente por isso que impede: os problemas apareceriam na terceira semana, na pior forma possível.

2. **A rotina recorrente — o dia a dia real da persona — ainda exige digitação.** O estudante de medicina tem a semana mais repetitiva de todas as personas de produtividade: mesma aula às terças, mesmo plantão às sextas. Hoje, nenhum desses compromissos vira chip de sugestão no início de sessão (M5), e o "+ Novo compromisso" — a ação que ele executa dezenas de vezes na primeira semana de adoção — abre um formulário de 10+ campos (M7). A primeira semana decide a adoção; esses dois atritos moram nela.

3. **A memória de longo prazo tem juros.** O Diário — o motivo de registrar tudo — busca apenas sobre as páginas carregadas (M16). No mês 3, quando o estudante quiser reencontrar "aquela reflexão sobre arritmias", o produto lhe devolverá um resultado parcial com uma nota de rodapé. Ferramenta principal é aquela em que se confia para *lembrar*; a confiança quebra na primeira busca incompleta.

4. **O diferencial pedagógico está enterrado.** Sem uma resposta direta a "o que revisar hoje?" (M15), o Anoti compete com Google Calendar + cronômetro do celular — e nessa comparação, a inércia vence. Com a fila de revisões na tela Hoje, ele compete numa categoria em que está sozinho: a agenda que sabe o que você precisa rever e quando.

5. **Fricções de primeira impressão, honestas mas presentes:** sem OAuth (criar conta com e-mail/senha + confirmação é o primeiro atrito de todos), sem fila offline para escrita (estudar no metrô e perder o "+1 questão"), e a grade de números na tela de chegada diluindo o convite único que a tela Hoje deveria ser (M13).

**Em síntese:** o Anoti de hoje já é o produto que a auditoria PX imaginou — abre no estudo, sugere em vez de perguntar, reflete no momento certo, fecha o dia e cala o resto. O que o separa de ser a ferramenta principal de um estudante exigente não é visão nem arquitetura: são ~2 semanas de correções de confiança (P0), duas costuras de rotina recorrente (M5, M7), uma busca que não minta (M16) e um diferencial que saia do banco de dados e apareça na tela (M15). Feito isso, a resposta ao critério final vira "nada o impediria — e algumas coisas o prenderiam".

---

*Relatório produzido pela Auditoria Final 360° (F14-final). Plano de execução correspondente em [`02_IMPLEMENTATION_ROADMAP.md`](02_IMPLEMENTATION_ROADMAP.md).*
