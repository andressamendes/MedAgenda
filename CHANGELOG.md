# Changelog

---

## [Unreleased] — F5.3: Modernização do Layout, Navegação e Responsividade

Mudança puramente visual/estrutural sobre a casca compartilhada do app (header,
sidebar, bottom nav, container de página) — sem alterar regras de negócio,
services, banco, Edge Functions, IA ou fluxos existentes. Nenhuma rota, ID ou
comportamento de navegação foi alterado; `navigationView.js` permanece
intocado.

**Auditoria (Etapa 1):** o container de página (`.app-page`, `max-width: 960px`)
e o padrão de cabeçalho (`.page-header` + `.page-title`) já eram únicos e
reutilizados pelas 6 páginas do app (Agenda, Calendário, Compromissos,
Dashboard, Histórico, Insights) — nenhuma divergência de largura ou de
cabeçalho entre páginas foi encontrada. As lacunas reais estavam em três
pontos: (1) a escala de espaçamento e os tokens do design system (F5.1) nunca
tinham sido aplicados à própria casca — header, sidebar, conteúdo e página
usavam valores literais em vez de `var(--space-*)`; (2) não havia nenhum
tratamento de `env(safe-area-inset-*)`, nem `viewport-fit=cover`, então o
header, a bottom nav, o drawer da sidebar, o toast e o widget do assistente
inteligente ficam sob o notch/Dynamic Island/barra de gestos em iPhones e
Androids recentes; (3) os z-index da casca (header, overlay, sidebar,
bottom nav, menu do usuário, loading) eram números mágicos duplicados em
vários pontos do arquivo.

**Container principal e espaçamento (Etapas 2 e 5):** novo token
`--container-max-width: 960px` substitui o valor fixo em `.app-page`; `header`,
`sidebar`, `app-content`, `page-header` e `.card`/`.login-wrap` migrados para
`var(--space-*)` (com um novo degrau `--space-7: 2rem` para casar com o
padding do `.card`, já usado por login/semana/calendário/assistente/dashboard)
— zero mudança de valor visual, só substituição de literal por token.

**Safe areas (Etapa 8):** `viewport-fit=cover` adicionado ao `<meta
viewport>`; quatro novos tokens `--safe-top/right/bottom/left` (com fallback
`0px`) e dois tokens derivados, `--header-total-h` e `--bottom-nav-total-h`,
que somam a inset correspondente à altura fixa existente. Aplicados em
`.app-header` (altura + padding-top), `.bottom-nav` (altura + padding),
`.app-sidebar` (offset do drawer mobile e padding lateral/inferior),
`.app-layout` e `.app-content` (cálculos de altura/padding que dependiam de
`--header-h`/`--bottom-nav-h` passam a usar as versões "-total-h"),
`.toast-container` e `.as-widget` (que flutuam sobre a bottom nav). Testado
simulando insets de notch (47px topo / 34px rodapé) via override direto das
custom properties: header, bottom nav e drawer se ajustam corretamente, sem
sobreposição de conteúdo.

**Consistência de z-index (Etapa 10):** seis tokens (`--z-header`,
`--z-bottom-nav`, `--z-sidebar-overlay`, `--z-sidebar`, `--z-dropdown`,
`--z-loading`) substituem os números mágicos equivalentes já usados pela
casca — mesmos valores, mesmo empilhamento, agora nomeados. Os z-index de
componentes de página (modais, widgets, listas) não foram tocados, por estarem
fora do escopo desta etapa.

**Scroll e navegação (Etapas 3 e 7):** auditados e mantidos como estavam —
o app já usa o padrão de painéis com scroll independente (`.app-sidebar` e
`.app-content` cada um com seu próprio `overflow-y: auto`, `.app-layout` sem
scroll próprio), sem scrolls concorrentes; os estados de hover/focus-visible/
active de `.nav-item` e `.bottom-nav-item` (herdados do F5.2) já cobriam os
critérios pedidos. Nenhuma mudança de rota ou de estrutura de navegação foi
necessária.

**Validação:** `npm test` — 645/645 passam (nenhum teste depende de valor de
CSS). `npm run check:app-shell` — lista de módulos do service worker
inalterada. Verificação visual com Playwright/Chromium em três larguras
(390px mobile, 820px tablet, 1440px desktop) e com insets de notch simulados,
cobrindo header, sidebar (rail, colapsada e drawer), bottom nav e container de
página — sem overflow, sem scroll horizontal, sem elementos cortados.

### Arquivos alterados
- `style.css` — tokens novos (`--container-max-width`, `--space-7`, `--z-*`,
  `--safe-*`, `--header-total-h`, `--bottom-nav-total-h`) e migração da casca
  compartilhada (header, sidebar, bottom nav, app-content, app-page,
  page-header, login/card, toast, widget do assistente) para os tokens do
  design system.
- `index.html` — `viewport-fit=cover` no `<meta name="viewport">`.

---

## [Unreleased] — F3.3: Planejamento Assistido (Planning Engine)

Nova ação no Painel IA, "Gerar Plano da Semana": `planningService.js` interpreta
o Context Engine já existente (`aiContextService.js`, F3.1/F3.2) e produz uma
lista estruturada de sugestões (tipo, prioridade, categoria, tempo sugerido,
data sugerida, motivo e confiança), sem chamar o Gemini, sem consultar o
Supabase diretamente e sem recalcular nenhum indicador — tudo já vem pronto de
`eventService`, `activityDashboardService`, `reviewService` e
`activitySessionService`/`activitySessionStats`, do mesmo jeito que
`recommendationEngine.js` (F3.2) já faz para as Recomendações.

Nenhuma ação do plano cria evento, grava dado no banco ou dispara notificação —
o usuário decide tudo. Nenhuma alteração no Context Engine, no Recommendation
Engine, nas Edge Functions ou nos prompts já existentes. 21 novos testes em
`tests/planningService.test.js` (usuário novo, agenda vazia/cheia, metas
atingidas/atrasadas, muitas revisões/sessões, categorias negligenciadas,
contexto parcial, sanitização e estabilidade do planejamento) + 3 novos em
`tests/views/aiPanelView.test.js` para o painel.

---

## [Unreleased] — F2.7: UX, Responsividade e Manutenibilidade (A5 + M7 + M8 + M9 + B1–B9)

### Validado em 2026-07-03

| Item | Descrição                                                                 | Status    |
|------|----------------------------------------------------------------------------|-----------|
| A5   | Agenda semanal força scroll horizontal em telas pequenas                  | Corrigido |
| M7   | Contraste insuficiente (`--gray-400`, 2.54:1) em textos/ícones secundários | Corrigido |
| M8   | Domínios "configurações" e "diagnóstico" ainda em `script.js`             | Corrigido |
| M9   | Lembretes locais não reagendavam com o app aberto por vários dias         | Corrigido |
| B1–B9 | CSS duplicado, comentários mortos, `aria-hidden`, código morto, DOM cache, `escapeHtml`, campo `theme` | Corrigido |

**A5 — Detalhes:** `.wk-head-row`, `.wk-allday-row` e `.wk-body` fixavam `min-width: 480px`
dentro de `.wk-scroll { overflow-x: auto }`, forçando scroll horizontal em qualquer viewport
abaixo de ~504px (a maioria dos celulares). Adicionado um bloco `@media (max-width: 767px)`
(o mesmo breakpoint "mobile" já usado pelo resto do app) que troca para
`grid-template-columns: 34px repeat(7, minmax(0, 1fr))` e remove o `min-width` fixo — as
colunas agora encolhem para caber na tela, com fonte e gutter reduzidos para manter a
legibilidade. Nenhuma mudança na estrutura de 7 colunas ou no comportamento em desktop/tablet.

**M7 — Detalhes:** `--gray-400` (`#9ca3af`) rende 2.54:1 de contraste sobre fundo branco —
abaixo do mínimo WCAG AA (4.5:1 para texto normal, 3:1 para ícones de UI). Usado como `color`
em 24 seletores (textos secundários, estados vazios, badges, botões de fechar, itens de
navegação). Todos migrados para `--gray-500` (`#6b7280`, 4.83:1 — passa AA), variável já
existente no design system. As 2 ocorrências de `border-color`/`border-left-color` (decorativas,
não textuais) foram mantidas.

**M8 — Detalhes:** Extraídos `diagnosticModal.js` (zero estado compartilhado) e
`settingsModal.js` (modo desenvolvedor injetado via callback, seguindo o plano documentado em
`docs/MODULARIZACAO_SCRIPT.md`). `script.js` caiu de 649 para ~390 linhas. Nenhum comportamento
alterado — testado com uma nova suíte (`tests/views/settingsModal.test.js`, 6 casos) cobrindo
abrir/fechar, toggle de notificações, transição configurações → diagnóstico, escaping do
diagnóstico e o modo desenvolvedor.

**M9 — Detalhes:** `scheduleReminders()` recalculava a janela de 7 dias apenas quando chamada
(login, CRUD, toggle de configurações) — com o app aberto por vários dias sem recarregar, eventos
que "entravam" na janela nunca eram agendados. Adicionado um `setInterval` (6h) guardado contra
duplicação que reexecuta `scheduleReminders()` com a última lista de eventos conhecida,
deslizando a janela adiante automaticamente.

**B1–B9 — Detalhes:** regra `#event-list` duplicada e `.app-sidebar` dividida em dois blocos
(mesclados); 2 comentários de CSS morto removidos; `aria-hidden="true"` adicionado a ~15
ícones decorativos (nav, bottom-nav, painel IA, ícones de sucesso, SVGs); removidas 4 funções
mortas sem nenhum call site (`getErrorLog`, `getEventLog`, `getCachedCalendars`, `truncate` —
esta última também removida de `tests/utils.test.js`); referências DOM de busca/filtro/ordenação
da lista de compromissos cacheadas em `script.js`; `escapeHtml()` aplicado aos 3 campos de status
do diagnóstico que ainda iam direto para `innerHTML`; campo `profiles.theme` documentado em
`profileService.js` (aceito no allowlist para não quebrar upserts futuros, mas sem seletor de
tema na UI ainda).

### Arquivos modificados
- `style.css` — A5 (mobile), M7 (contraste), B1 (CSS duplicado)
- `script.js` — M8 (extração), B6 (cache DOM)
- `settingsModal.js`, `diagnosticModal.js` — M8 (novos módulos)
- `notificationService.js` — M9 (reagendamento periódico)
- `index.html` — B3 (`aria-hidden`)
- `academicCalendarView.js`, `errorService.js`, `telemetryService.js`, `utils.js` — B4 (código morto)
- `profileService.js` — B8 (campo `theme` documentado)
- `service-worker.js` — lista `APP_SHELL` regenerada (`npm run build:app-shell`) para incluir os 2 módulos novos
- `tests/utils.test.js` — remove os testes de `truncate()`
- `tests/views/settingsModal.test.js` — nova suíte para M8
- `docs/MODULARIZACAO_SCRIPT.md` — status atualizado

### Impacto
Nenhuma regra de negócio, endpoint, tabela ou Edge Function foi alterada. Todas as mudanças são
de CSS, organização de módulos front-end e um `setInterval` client-side — comportamento
observável preservado (106/106 testes automatizados verdes, incluindo 6 novos casos).

---

## [Unreleased] — Auditoria Backend P1.3: Integridade de notification_logs

### Validado em 2026-07-02

| Item | Descrição                                                        | Status      |
|------|-------------------------------------------------------------------|-------------|
| P1.3 | `notification_logs.event_id` sem FK para `events.id` permitia logs órfãos ao excluir um evento | Corrigido |

**P1.3 — Detalhes:** `notification_logs.event_id` não tinha chave estrangeira para `events.id`.
Como usuários não têm política de `DELETE` sobre `notification_logs` (só `SELECT`) e o Edge Function
`send-push-notifications` nunca revisita eventos já excluídos, as linhas de log de um evento apagado
via `eventService.deleteEvent` ficavam órfãs indefinidamente. Corrigido pela migration
`sql/09_notification_logs_integrity.sql`, que remove logs órfãos pré-existentes e adiciona
`FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE` — o mesmo padrão já usado nas
demais FKs do projeto. Eventos recorrentes continuam funcionando normalmente: cada ocorrência
permanece uma linha própria em `notification_logs` (chave `user_id + event_id + event_date`),
todas apontando para o mesmo `event_id` da linha-base em `events`. Validado localmente em Postgres:
limpeza de log órfão pré-existente, rejeição de novo `event_id` inexistente, e cascade-delete de
múltiplos logs de ocorrências ao excluir o evento-base.

---

## [Unreleased] — Etapa 4.1: Correções de Segurança e Robustez

### Validado em 2026-06-29

| Bug     | Descrição                                               | Status      |
|---------|---------------------------------------------------------|-------------|
| BUG-011 | `console.log` em `auth.js` expõe e-mail do usuário     | Corrigido   |
| BUG-014 | Toast injeta mensagem via `innerHTML` (XSS potencial)  | Corrigido   |
| BUG-015 | Botão "Salvar" de categoria sem disabled durante async  | Corrigido   |

**BUG-011 — Detalhes:** Três chamadas de `console.log`/`console.error` dentro de `signUp()` em `auth.js`
logavam o e-mail do usuário, o objeto de erro da API e dados internos da resposta (user_id, session,
identities) no console do navegador em produção. Removidas as três linhas; a função agora é idêntica
a `signIn()` em termos de logging (nenhum).

**BUG-014 — Detalhes:** `showToast()` em `toastService.js` montava o HTML do toast com `innerHTML`,
interpolando `${message}` diretamente. Qualquer mensagem contendo HTML (ex: vindo de uma API externa)
seria renderizada como markup. Corrigido: o template agora cria `<span class="toast-message"></span>`
vazio via `innerHTML` (apenas conteúdo estático/confiável), e a mensagem é atribuída separadamente via
`el.querySelector('.toast-message').textContent = message` — `textContent` trata qualquer string como
texto puro, nunca como HTML.

**BUG-015 — Detalhes:** O botão "Salvar" na edição inline de categoria em `script.js` não era
desabilitado durante a operação assíncrona `updateCategory()`. Um duplo clique disparava duas chamadas
simultâneas ao Supabase para o mesmo registro. Corrigido com o padrão já usado nos demais formulários
da aplicação: `catSaveBtn.disabled = true` antes do `await`, restaurado para `false` no `catch`.
No fluxo de sucesso, o botão é destruído junto com a linha de edição pelo `renderCatList()`.

### Arquivos modificados
- `auth.js` — removidos 3 `console.log`/`console.error` de debug em `signUp()`
- `toastService.js` — mensagem do toast movida de `innerHTML` para `textContent`
- `script.js` — `catSaveBtn.disabled = true/false` adicionado em `enterEditMode()`

---

## [Unreleased] — Etapa 3: Correção dos Bugs de Alta Severidade

### Validado em 2026-06-29

| Bug    | Descrição                                       | Status                               |
|--------|-------------------------------------------------|--------------------------------------|
| BUG-007 | Spinner "Consultando o Gemini" infinito após erro | Corrigido por dependência (BUG-002) |
| BUG-008 | Modal de Categorias com overflow horizontal     | Corrigido                            |
| BUG-009 | Menu do usuário inacessível                     | Corrigido por dependência (BUG-001)  |
| BUG-010 | Botão "Atualizar agora" sem feedback            | Corrigido                            |

**BUG-007 — Detalhes:** O spinner é encerrado em todos os caminhos de erro por meio do
`showResult()` chamado nos blocos `catch` de `runAIAction()`. O `finally` garante que os botões
sejam reativados. A correção de BUG-002 (Etapa 1) já cobria este caso: ambos os bugs envolvem
o mesmo fluxo assíncrono da IA.

**BUG-008 — Detalhes:** Dois problemas distintos. (1) A sobreposição do painel IA foi eliminada
pela correção de BUG-001 (`.ai-panel[hidden]{display:none}`), pois o painel (`z-index:201`)
sobrepunha o modal (`z-index:100`) mesmo quando deveria estar oculto. (2) O overflow horizontal
no seletor de cores era causado por `flex:1` sem `min-width:0` nos inputs dentro de `.cat-form-row`
e `.cat-edit-name` — o navegador não os deixava encolher abaixo da largura intrínseca.
Correção: `min-width:0` adicionado a ambos e `overflow:hidden` adicionado a `.modal-card`.

**BUG-009 — Detalhes:** O dropdown do usuário (`z-index:200`) era bloqueado pelo `.ai-panel`
(`position:fixed; z-index:201; display:flex`) que permanecia visível mesmo com o atributo
`[hidden]`. A correção de BUG-001 (Etapa 1) eliminou o bloqueio por completo.

**BUG-010 — Detalhes:** O botão "Atualizar agora" executava `window.location.reload()` imediatamente
após `postMessage({type:'SKIP_WAITING'})`, sem qualquer indicação visual de que algo estava
acontecendo. Corrigido: ao clicar, o botão exibe "Atualizando…" e é desabilitado; o reload
é disparado pelo evento `controllerchange` do Service Worker (padrão recomendado), garantindo
que o reload ocorra apenas após o novo SW tomar o controle.

### Arquivos modificados
- `style.css` — `overflow:hidden` em `.modal-card`; `min-width:0` em `.cat-edit-name` e `.cat-form-row input[type="text"]`
- `pwa.js` — feedback visual no botão "Atualizar agora"; reload via `controllerchange`

---

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased] — Etapa 2: Validação dos bugs críticos remanescentes

### Validado em 2026-06-29

Revalidação de todos os bugs críticos após as correções da Etapa 1.
Nenhuma regressão detectada. Nenhum bug adicional encontrado.

| Bug    | Descrição                                  | Status                          |
|--------|--------------------------------------------|---------------------------------|
| BUG-001 | Painel IA não fecha (X, ESC, overlay)     | Corrigido (Etapa 1)             |
| BUG-002 | Erro PostgREST trava painel IA            | Corrigido (Etapa 1)             |
| BUG-003 | Tela de login coexiste com app autenticado | Corrigido (Etapa 1)            |
| BUG-004 | Credenciais hardcoded em setup-push.sh    | Corrigido (Etapa 1)             |
| BUG-005 | Botão "+ Novo compromisso" inacessível    | Corrigido por dependência (BUG-001) |
| BUG-006 | Menu "Calendários" não exibe conteúdo     | Não reproduzido                 |

**BUG-005 — Detalhes:** O bloqueio do botão era causado pelo `.ai-panel`
permanecer visível (`display:flex`) mesmo com o atributo `[hidden]` presente,
pois a regra CSS sobrescrevia o comportamento padrão do HTML. A correção de
BUG-001 (`.ai-panel[hidden] { display: none }`) resolveu o problema: o painel
IA não bloqueia mais interações quando fechado.

**BUG-006 — Detalhes:** O botão "Calendários" (`#btn-academic-cals`) abre
corretamente o modal `#academic-overlay` via `openAcademicCalendarModal()`.
A estrutura do modal está completa, o conteúdo é renderizado e o roteamento
usa modal (não `data-page`). Nenhuma regressão ou bug identificado.

---

## [1.0.0-rc1] — 2026-06-28

### Release Candidate — Consolidação de Arquitetura e Qualidade

Esta versão consolida todas as funcionalidades implementadas nas etapas anteriores
e prepara a MedAgenda para uso em produção com foco em qualidade, performance e manutenibilidade.

### Adicionado
- **`utils.js`** — módulo de utilitários compartilhados (`pad`, `isoDate`, `isoToday`, `localDate`, `escapeHtml`, `mondayOf`, `truncate`)
- **`tests/utils.test.js`** — 30 testes unitários para utilitários (100% cobertura)
- **`tests/recurrence.test.js`** — 16 testes unitários para lógica de recorrência (todos os tipos cobertos)
- **`package.json`** — scripts de teste via `npm test`
- **ARIA `role="alert"` e `aria-live`** em todas as mensagens de erro da interface
- **`role="dialog"` e `aria-modal="true"`** nos modais de Categorias e Configurações
- **`aria-labelledby`** nos modais para associar títulos

### Corrigido
- **Service Worker** — registro alterado de caminho absoluto (`/service-worker.js`) para relativo (`./service-worker.js`), corrigindo compatibilidade com GitHub Pages em subdiretórios
- **App Shell do Service Worker** — caminhos dos assets migrados para URLs absolutas calculadas a partir da localização do SW (compatível com qualquer base URL)
- **Ícones de notificação Push** — URLs dos ícones no Service Worker agora usam caminho absoluto correto para qualquer deploy
- Consulta redundante em `eventService.getEventsByRange` — cláusula `.lte("event_date", end)` desnecessária removida da query de eventos recorrentes

### Refatorado
- **Eliminação de código duplicado**:
  - `pad()` — existia em `weekView.js`, `notificationService.js`, `calendar.js` → movido para `utils.js`
  - `isoDate()` — existia em `weekView.js`, `notificationService.js` → movido para `utils.js`
  - `isoToday()` — existia em `calendar.js`, `weekView.js` → movido para `utils.js`
  - `mondayOf()` — existia em `weekView.js` e `recurrence.js` → movido para `utils.js`
  - `escapeHtml()` / `esc()` — existia em `script.js` e `weekView.js` → movido para `utils.js`
  - `localDate()` — existia em `recurrence.js` → movido para `utils.js`
  - `currentUserId()` — existia em `eventService.js` e `categoryService.js` → movido para `supabase.js`
- Todos os módulos JS atualizados para importar utilitários de `utils.js`
- `supabase.js` agora exporta `currentUserId()` centralizado

---

## [0.12.0] — Push Notifications

### Adicionado
- Web Push API com VAPID
- Supabase Edge Function para envio de notificações
- Tabela `push_subscriptions` e `notification_logs`
- Deduplicação de notificações via banco de dados

---

## [0.11.0] — PWA

### Adicionado
- Service Worker com cache offline (Cache-first para assets, network-first para API)
- Manifesto PWA (`manifest.webmanifest`) com ícones para todos os tamanhos
- Banner de atualização ao detectar novo Service Worker
- Barra de modo offline
- Botão de instalação (Add to Home Screen)

---

## [0.10.0] — Recorrência

### Adicionado
- Tipos de recorrência: diária, semanal, quinzenal, mensal, anual, dias úteis, personalizada
- Expansão de ocorrências virtuais por intervalo de datas
- Campo `recurrence_until` para limite de recorrência
- Recorrência personalizada com seleção de dias da semana e intervalo em semanas

---

## [0.9.0] — Categorias

### Adicionado
- CRUD completo de categorias personalizadas
- 8 categorias padrão pré-criadas para estudantes de Medicina
- Seleção de cor por categoria
- Preenchimento automático de cor ao selecionar categoria no formulário

---

## [0.8.0] — Quick Add

### Adicionado
- Modal de criação rápida de compromisso (título + hora)
- Disparo ao clicar em dia no calendário mensal ou slot na agenda semanal

---

## [0.7.0] — Agenda Semanal

### Adicionado
- Vista de agenda semanal com grade de horários
- Linha "agora" atualizada a cada minuto
- Scroll automático para o horário atual
- Navegação entre semanas
- Criação de evento ao clicar em slot vazio

---

## [0.6.0] — Calendário Mensal

### Adicionado
- Vista de calendário mensal com chips de eventos
- Navegação entre meses
- Botão "Hoje"
- Clique em dia → Quick Add; clique em evento → edição

---

## [0.5.0] — CRUD de Eventos

### Adicionado
- Formulário completo de criação e edição de compromissos
- Campos: título, data, hora, duração, categoria, cor, local, descrição, lembrete
- Lista de compromissos com paginação visual
- Exclusão com confirmação

---

## [0.4.0] — Supabase e Banco de Dados

### Adicionado
- Integração com Supabase (PostgreSQL + Auth)
- Tabela `events` com índices e trigger de `updated_at`
- Row-Level Security (RLS) para isolamento de dados entre usuários
- Migrations SQL versionadas em `sql/`

---

## [0.3.0] — Notificações Locais

### Adicionado
- Notificações do navegador (Notification API)
- Agendamento de lembretes via `setTimeout` dentro da janela de 7 dias
- Persistência de preferência de notificação no localStorage

---

## [0.2.0] — Autenticação

### Adicionado
- Login e logout com email/senha via Supabase Auth
- Persistência de sessão entre recargas
- Proteção de rotas (tela de login vs. app)

---

## [0.1.0] — Versão Inicial

### Adicionado
- Estrutura do projeto (HTML, CSS, JS vanilla, sem framework)
- Configuração de deploy via GitHub Pages
- Documentação inicial (README, VISAO_DO_PRODUTO, ARQUITETURA, BANCO_DE_DADOS)
