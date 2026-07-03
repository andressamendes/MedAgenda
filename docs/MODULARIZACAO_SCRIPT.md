# Plano de Modularização do `script.js`

> **Status:** concluído — todos os domínios isolados já foram extraídos
> (`diagnosticModal.js`, `settingsModal.js`, e os módulos listados no
> cabeçalho de `script.js`). O que resta em `script.js` (appInit, lista de
> compromissos, bootstrap) depende de estado compartilhado (`allEvents`) e
> não foi extraído para evitar acoplamento artificial — ver F2.7 (M8).

---

## Situação Atual

`script.js` tem **1 574 linhas** e centraliza 11 domínios distintos.  
A extração é incremental: cada fase extrai um único domínio, mantém os testes
verdes e não altera nenhum comportamento observável.  
Cada fase termina com um PR separado.

---

## Mapa de Domínios

| # | Identificador `[DOMAIN]` | Linhas (aprox.) | Arquivo destino planejado |
|---|--------------------------|-----------------|---------------------------|
| 1 | `observabilidade` | 68–86, 1080–1114 | `devmodeModule.js` (UI) + permanece bootstrap |
| 2 | `autenticação` | 240–431, 1115–1201, 1580–1606 | `authModule.js` |
| 3 | `appInit` | 96–149, 243–350 | permanece em `script.js` (bootstrap) |
| 4 | `formulário de evento` | 154–239, 732–852 | `eventFormModule.js` |
| 5 | `lista de compromissos` | 854–988 | `eventListModule.js` |
| 6 | `categorias` | 433–584 | `categoriesModal.js` |
| 7 | `configurações e notificações` | 586–730 | `settingsModal.js` |
| 8 | `diagnóstico` | 990–1078 | `diagnosticModal.js` |
| 9 | `assistente inteligente` | 1203–1383 | `assistantPanel.js` |
| 10 | `painel ia (gemini)` | 1385–1481 | `aiPanel.js` |
| 11 | `navegação e layout` | 1483–1578 | `navigationModule.js` |

---

## Estado Compartilhado

| Variável | Domínio produtor | Domínios consumidores | Estratégia de extração |
|----------|------------------|-----------------------|------------------------|
| `allEvents` | lista | assistente, painelIA | injetar via callback/parâmetro |
| `categoriesCache` | categorias | formulário, lista | exportar `getCategoriesCache()` e `categoryColor()` |
| `editingId` | formulário | (interno) | mover junto com o formulário |
| `assistantHidden` | assistente | (interno) | mover junto com o assistente |
| `_initializedUserId` | appInit | (interno) | permanece no bootstrap |

---

## Grafo de Dependências entre Domínios

```
autenticação ──────────────────────────────► appInit
                                                │
                          ┌─────────────────────┤
                          │                     │
                          ▼                     ▼
                      categorias          navegação
                          │
              ┌───────────┴──────────┐
              │                      │
              ▼                      ▼
         formulário               lista ──► assistente
              │                      │
              └──────────────────────┼──► painelIA
                                     │
                              configurações ──► notificationService
                                               pushService
diagnóstico (sem deps de estado compartilhado)
observabilidade (bootstrap-level, sem deps de outros domínios)
```

---

## Ordem de Extração

A ordem prioriza domínios com menos dependências de estado compartilhado,
reduzindo o risco de cada PR.

---

### Fase 2 — Diagnóstico

- **Arquivo:** `diagnosticModal.js`
- **Por quê primeiro:** zero dependências de estado compartilhado; completamente auto-contido.
- **O que extrair:**
  - Referências DOM: `diagnosticOverlay`, `diagnosticBody`, `diagnosticClose`, `btnDiagnostic`
  - Funções: `openDiagnostic`, `closeDiagnostic`, `renderDiagnosticHTML`
  - Todos os `addEventListener` do overlay
- **Interface pública:**
  ```js
  export function initDiagnosticModal() { /* registra listeners */ }
  ```
- **Import em `script.js`:**
  ```js
  import { initDiagnosticModal } from "./diagnosticModal.js";
  // na showApp():
  initDiagnosticModal();
  ```
- **Critério de sucesso:** `npm test` verde; overlay de diagnóstico funciona no browser.

---

### Fase 3 — Navegação e Layout

- **Arquivo:** `navigationModule.js`
- **Por quê:** depende apenas de DOM; nenhum estado compartilhado externo.
- **O que extrair:**
  - Constantes: `APP_PAGES`, `LAST_PAGE_KEY`, `SIDEBAR_STATE_KEY`
  - Referências DOM: `appSidebar`, `sidebarOverlay`, `userMenuBtn`, `userMenuDropdown`
  - Funções: `showPage`, `restoreLastPage`, `openSidebar`, `closeSidebar`
  - Listeners: `[data-page]`, sidebar toggle, overlay, user menu, bottom nav extras
- **Interface pública:**
  ```js
  export function initNavigation() { /* registra listeners */ }
  export function showPage(name) { /* ... */ }
  export function restoreLastPage() { /* ... */ }
  ```
- **Critério de sucesso:** navegação entre páginas e sidebar funcionam corretamente.

---

### Fase 4 — Configurações e Notificações

- **Arquivo:** `settingsModal.js`
- **Por quê:** depende apenas de `notificationService` e `pushService` (já extraídos).
- **O que extrair:**
  - Referências DOM: `settingsOverlay`, `notifStatusText`, `btnNotifToggle`, `notifPermHint`, `pushStatusText`, `btnPushToggle`, `pushErrorHint`
  - Funções: `openSettings`, `closeSettings`, `renderSettingsState`, `renderPushState`, `renderDevmodeState`
  - Listeners: `btn-settings`, `settings-close`, `btnNotifToggle`, `btnPushToggle`, `btnDevmodeToggle`
- **Dependência a resolver:** `renderDevmodeState` usa `_isDevMode` e `_setDevMode`.  
  Resolver passando funções como parâmetro ou importando de um `devmodeModule.js`.
- **Interface pública:**
  ```js
  export function initSettingsModal({ isDevMode, setDevMode }) { /* ... */ }
  export function openSettings() { /* ... */ }
  ```

---

### Fase 5 — Categorias

- **Arquivo:** `categoriesModal.js`
- **Por quê:** depende de `categoryService` (já extraído); `categoriesCache` pode ser encapsulado.
- **O que extrair:**
  - Estado: `categoriesCache`
  - Referências DOM: `catOverlay`, `catList`, `catNewColor`, `catNewName`, `catAddBtn`, `catError`
  - Funções: `initCategories`, `reloadCategories`, `populateCategorySelect`, `categoryColor`, `openCatModal`, `closeCatModal`, `renderCatList`, `enterEditMode`, `handleCatDelete`
  - Listener: `fCategory` change (auto-fill de cor) — mover junto ou passar callback
- **Interface pública:**
  ```js
  export function initCategoriesModal() { /* registra listeners, inicializa cache */ }
  export async function initCategories() { /* ... */ }
  export function getCategoriesCache() { return categoriesCache; }
  export function categoryColor(name) { /* ... */ }
  ```
- **Atenção:** `fCategory.addEventListener("change")` acessa `fColor` (DOM do formulário).  
  Solução: manter o listener no `eventFormModule.js` ou aceitar o acoplamento.

---

### Fase 6 — Assistente Inteligente

- **Arquivo:** `assistantPanel.js`
- **Por quê:** lê `allEvents` (injetado); não escreve estado externo.
- **O que extrair:**
  - Estado: `assistantHidden`
  - Referências DOM: `assistantSection`, `assistantBody`, `assistantClose`, `btnShowAssistant`
  - Funções: `renderAssistant`, `buildCard`, `buildStatsCard`, `buildUpcomingCard`
  - Listeners: `assistantClose`, `btnShowAssistant`
- **Interface pública:**
  ```js
  export function initAssistantPanel() { /* registra listeners */ }
  export function renderAssistant(events) { /* ... */ }
  ```
- **Em `loadEvents` (lista):** substituir `renderAssistant(events)` por import do módulo.

---

### Fase 7 — Painel IA (Gemini)

- **Arquivo:** `aiPanel.js`
- **Por quê:** auto-contido; usa apenas `aiService` e `isPersonalVisible`.
- **O que extrair:** a IIFE `initAIPanel` convertida em função exportada com seus listeners.
- **Interface pública:**
  ```js
  export function initAIPanel() { /* ... */ }
  ```

---

### Fase 8 — Lista de Compromissos

- **Arquivo:** `eventListModule.js`
- **Por quê:** após extrair categorias e assistente, as dependências externas são injetáveis.
- **O que extrair:**
  - Estado: `allEvents`
  - Funções: `loadEvents`, `getFilteredEvents`, `renderFilteredList`, `_syncCategoryFilter`, `renderList`, `handleDelete`, `formatDate`, `formatTime`
  - Listeners: search, filter, sort
- **Interface pública:**
  ```js
  export function initEventList({ getCategoryColor, onRenderAssistant }) { /* registra listeners */ }
  export async function loadEvents() { /* ... */ }
  export function getAllEvents() { return allEvents; }
  ```
- **Dependências a resolver:** `categoryColor` vem de `categoriesModal`; `renderAssistant` vem de `assistantPanel`.

---

### Fase 9 — Formulário de Evento

- **Arquivo:** `eventFormModule.js`
- **Por quê:** após extrair categorias e lista, as dependências são resolvíveis.
- **O que extrair:**
  - Estado: `editingId`
  - Referências DOM: todo o bloco de campos do formulário
  - Funções: `handleEventClick`, `openEventModal`, `closeEventModal`, `clearForm`, `populateForm`, `_populateReminder`, `_reminderMinutes`, `getSelectedDays`, `setSelectedDays`
  - Listeners: modal close, Escape, botões "Novo compromisso", reminder change, recurrence change, day buttons, cancelBtn, eventForm submit
- **Interface pública:**
  ```js
  export function initEventForm({ onSave, getCategoriesCache, categoryColor }) { /* ... */ }
  export function openEventModal() { /* ... */ }
  export function handleEventClick(ev) { /* ... */ }
  ```

---

### Fase 10 — Autenticação

- **Arquivo:** `authModule.js`
- **Por quê:** os handlers de auth não dependem do estado de outros domínios.
- **O que extrair:**
  - Funções: `showAuthView`, `showLogin`, `_closeAllModals`
  - Handlers: `loginBtn`, `logoutBtn`, `registerBtn`, `sendResetBtn`, `setPasswordBtn`
  - Listeners: navegação entre views (`btn-to-register`, `btn-to-forgot`, etc.)
  - Auth listeners: `onAuthStateChange`, IIFE `getSession`
- **Dependência a resolver:** `showApp` permanece no bootstrap; passar como callback `onLogin`.
- **Interface pública:**
  ```js
  export function initAuth({ onLogin, onLogout }) { /* registra onAuthStateChange, getSession */ }
  export function showLogin() { /* ... */ }
  export function showAuthView(name) { /* ... */ }
  ```

---

### Resultado Final

Após todas as fases, `script.js` se torna um arquivo de bootstrap ≤ 100 linhas:

```js
// script.js (bootstrap only)
import { initAuth, showLogin }        from "./authModule.js";
import { initNavigation, restoreLastPage } from "./navigationModule.js";
import { initCategoriesModal, initCategories } from "./categoriesModal.js";
import { initEventForm }              from "./eventFormModule.js";
import { initEventList, loadEvents }  from "./eventListModule.js";
import { initAssistantPanel }         from "./assistantPanel.js";
import { initAIPanel }                from "./aiPanel.js";
import { initSettingsModal }          from "./settingsModal.js";
import { initDiagnosticModal }        from "./diagnosticModal.js";
// ... demais imports de serviços

async function showApp(session) { /* inicializa todos os módulos */ }
async function refreshAll()     { /* sincroniza views */ }

initAuth({ onLogin: showApp, onLogout: showLogin });
```

---

## Checklist para Cada Fase

- [ ] Criar o arquivo do módulo com a interface definida acima
- [ ] Importar o módulo no `script.js`
- [ ] Remover o código extraído do `script.js`
- [ ] Verificar que `npm test` continua com zero falhas
- [ ] Testar manualmente no browser (golden path + edge cases do domínio)
- [ ] Abrir PR separado descrevendo o domínio extraído
