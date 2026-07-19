/**
 * script.js — Bootstrap e controlador principal da aplicação Anoti
 *
 * Este arquivo centraliza a inicialização da aplicação e os módulos de UI
 * que ainda não foram extraídos para módulos próprios. Ele é o único ponto
 * de entrada do bundle e deve permanecer o menor possível após a refatoração.
 *
 * Domínios mapeados (cada um será extraído em etapas futuras):
 *
 *   [1]  observabilidade  — Modo desenvolvedor, flags de debug
 *   [2]  autenticação     — Login, logout, cadastro, recuperação/redefinição de senha,
 *                           navegação entre views de auth → extraído para authView.js
 *   [3]  appInit          — Inicialização do app após login (showApp, refreshAll)
 *   [4]  formulário       — Criação e edição de compromissos → extraído para eventFormView.js
 *   [5]  lista            — Listagem, filtragem, ordenação e exclusão de compromissos
 *   [6]  categorias       — Modal de gerenciamento de categorias → extraído para categoryView.js
 *   [7]  configurações    — Modal de configurações (notificações locais e push) → extraído para settingsModal.js
 *   [8]  diagnóstico      — Overlay de diagnóstico de serviços → extraído para diagnosticModal.js
 *   [9]  painelIA         — Painel Gemini → extraído para aiPanelView.js
 *   [10] navegação        — Páginas, sidebar, user menu, bottom nav → extraído para navigationView.js
 *
 * Estado compartilhado entre domínios:
 *   - allEvents        → produzido por: lista; consumido internamente (filtro, categorias)
 *
 * Ver docs/MODULARIZACAO_SCRIPT.md para o plano de extração em etapas.
 */

import { getEvents, getEventById, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar, resetCalendar, setCalendarAcademicProvider, setCalendarPersonalVisibility } from "./calendar.js";
import { initWeekView, refreshWeekView, setWeekViewAcademicProvider, setWeekViewPersonalVisibility } from "./weekView.js";
import { openQuickAdd } from "./quickAdd.js";
import { initNotifications, scheduleReminders, resetNotifications } from "./notificationService.js";
import { initPushService, syncPushSubscription, resetPushService } from "./pushService.js";
import { VAPID_PUBLIC_KEY } from "./config.js";
import { escapeHtml, readableTextColor } from "./utils.js";
import { toast } from "./toastService.js";
import { initTelemetry, setTelemetryDevMode, track, EVENTS } from "./telemetryService.js";
import { initErrorService, setErrorDevMode, handleError } from "./errorService.js";
import { updateLastSync } from "./diagnosticService.js";
import { initAccountView, resetAccountView } from "./accountView.js";
import {
  initAcademicCalendarView, initAcademicModal,
  openAcademicCalendarModal, renderFilterBar,
  getAcademicEventProvider, isPersonalVisible,
  resetAcademicCalendarView,
} from "./academicCalendarView.js";
import { initAIPanel, resetAIPanel } from "./aiPanelView.js";
import { confirmDialog } from "./confirmDialog.js";
import { initNavigation, restoreLastPage, restoreSidebarState, showPage } from "./navigationView.js";
import { initCategoryView, initCategories, categoryColor, resetCategories } from "./categoryView.js";
import { initEventForm, openEventForm, openEventFormPrefilled, handleEventClick, resetEventForm } from "./eventFormView.js";
import { initAuthView, forceReauth } from "./authView.js";
import { setReauthHandler, errorToState, renderStateBlock, clearStateBlock, STATES } from "./stateView.js";
import { skeletonRowsMarkup } from "./skeletonView.js";
import { assertSchemaCompatible } from "./schemaService.js";
import { registerServiceWorker, initInstallButton, initOfflineDetection } from "./pwa.js";
import { initSettingsModal } from "./settingsModal.js";
import { initDiagnosticModal } from "./diagnosticModal.js";
import { initStudySessionView, resetStudySessionView, startSessionForEvent } from "./studySessionView.js";
import { initActiveSessionIndicator, resetActiveSessionIndicator } from "./activeSessionIndicatorView.js";
import { initKeyboardShortcuts, resetKeyboardShortcuts } from "./keyboardService.js";
import { initActivityHistoryView, resetActivityHistoryView } from "./activityHistoryView.js";
import { initStudyJournalView, resetStudyJournalView } from "./studyJournalView.js";
import { initActivityDashboardView, resetActivityDashboardView } from "./activityDashboardView.js";
import { initInsightsView, resetInsightsView } from "./insightsView.js";
import { initOnboardingTour, resetOnboardingTourView } from "./onboardingTourView.js";
import { resetAIContextService } from "./aiContextService.js";
import { iconMoreHorizontal } from "./icons.js";
import { initTheme } from "./themeService.js";

// F11 E4 — sinaliza para boot-watchdog.js (script clássico, carregado antes
// deste em index.html) que o grafo de módulos ES linkou com sucesso. Só
// chega a rodar se TODOS os imports acima já resolveram — se algum falhar
// (ex.: o import do SDK do Supabase via CDN, bloqueado por firewall/DNS),
// nenhuma linha deste arquivo executa, nem esta, e o watchdog assume que o
// boot travou. Precisa ser a primeiríssima instrução do corpo do módulo.
window.__anotiBooted = true;

// F10 #2.4: aplica o tema salvo (ou "auto") o quanto antes — primeira linha
// executada do bootstrap, antes de qualquer outra inicialização — para
// minimizar o flash de tema errado no primeiro paint (a CSP do app não
// permite script inline para fazer isto ainda mais cedo; ver themeService.js).
initTheme();

// ── [DOMAIN: observabilidade] ─────────────────────────────────────────────
// Inicializa serviços de observabilidade imediatamente
initErrorService(_isDevMode());
initTelemetry(_isDevMode());

// F4.1: único ponto de reautenticação — todo estado "sessão expirada" (ver
// stateView.js), em qualquer tela, executa o mesmo fluxo oficial de logout +
// tela de login já existente em authView.js.
setReauthHandler(forceReauth);

// ── Modo Desenvolvedor ─────────────────────────────────────────────────────
const DEV_MODE_KEY = 'medagenda_devmode';

function _isDevMode() {
  try { return localStorage.getItem(DEV_MODE_KEY) === '1'; } catch { return false; }
}

function _setDevMode(enabled) {
  try {
    if (enabled) localStorage.setItem(DEV_MODE_KEY, '1');
    else         localStorage.removeItem(DEV_MODE_KEY);
  } catch { /* storage unavailable */ }
  setErrorDevMode(enabled);
  setTelemetryDevMode(enabled);
}

// ── [DOMAIN: appInit] — DOM, estado e bootstrap ───────────────────────────
const headerEmail = document.getElementById("header-email");

// ── Lista ──────────────────────────────────────────────────────────────────
const eventList = document.getElementById("event-list");
const listEmpty = document.getElementById("list-empty");
const LIST_EMPTY_TEXT = listEmpty.textContent;

// ── Indicador de sincronização ─────────────────────────────────────────────
const syncIndicator = document.getElementById("sync-indicator");

// ── Toolbar da lista (busca/filtro/ordenação) ─────────────────────────────
const searchInput          = document.getElementById("search-appointments");
const filterCategorySelect = document.getElementById("filter-category-apt");
const sortSelect           = document.getElementById("sort-appointments");

// ── Estado compartilhado entre domínios ───────────────────────────────────
// allEvents precisará de uma estratégia de compartilhamento quando os domínios
// dependentes forem extraídos. editingId → interno ao: formulário (eventFormView.js)
let allEvents = [];    // compartilhado: lista → painelIA

// Chamado no logout (ver initAuthView() abaixo) — allEvents e a lista
// renderizada são estado compartilhado entre domínios (lista →
// painelIA); sem este reset, a lista do usuário anterior continuaria em
// memória e na tela (mesmo escondida) até o próximo loadEvents() da nova
// sessão, e um filtro/busca digitado pelo usuário anterior sobreviveria à
// troca de conta.
function _resetEventList() {
  allEvents = [];
  eventList.innerHTML = "";
  listEmpty.hidden = true;
  listEmpty.classList.remove("list-error");
  clearStateBlock(listEmpty);
  listEmpty.textContent = LIST_EMPTY_TEXT;
  if (searchInput) searchInput.value = "";
  if (filterCategorySelect) filterCategorySelect.innerHTML = '<option value="">Todas as categorias</option>';
  if (sortSelect) sortSelect.value = "date-asc";
}

async function refreshAll() {
  if (syncIndicator) syncIndicator.hidden = false;
  try {
    await Promise.all([loadEvents(), refreshWeekView(), refreshCalendar()]);
    updateLastSync();
  } finally {
    if (syncIndicator) syncIndicator.hidden = true;
  }
}

// Isola a falha de uma inicialização recuperável (ex.: IA, categorias,
// notificações, diagnóstico) para que ela nunca impeça as demais etapas de
// bootstrap — em especial a autenticação — de rodar. `fn` pode ser síncrona
// ou assíncrona; o erro é tratado com a mesma infraestrutura (handleError)
// já usada pelos demais try/catch de _initApp.
async function safeInit(label, fn) {
  try {
    return await fn();
  } catch (err) {
    handleError(err, { context: `initApp.${label}` });
  }
}

// AUD-005 — guarda o listener de "btn-academic-cals" contra re-registro.
// _initApp roda a cada login (após logout na mesma página, sem reload — ver
// authView.js/showApp, que reseta _initializedUserId no sign-out); sem esta
// guarda, cada login empilharia mais um listener de click no botão
// "Calendários", disparando openAcademicCalendarModal N vezes por clique após
// N logins. Deliberadamente nunca resetado no logout — mesmo padrão de
// _modalOverlay em academicCalendarView.js/initAcademicModal(): o listener
// deve existir uma única vez por carregamento de página, não por sessão.
let _academicCalsButtonBound = false;

// ── P0 — Proteção contra Divergência de Schema ────────────────────────────
// Primeiro passo de todo _initApp: confirma que o banco já recebeu as
// migrations que este build do frontend exige (ver schemaService.js) antes
// de inicializar qualquer subsistema — em especial Dashboard, Central de
// Insights, Histórico de Sessões e IA, os três que quebraram no incidente
// das migrations 11–13 por consultarem tabelas ainda inexistentes. Schema
// incompatível nunca chega a rodar nenhum safeInit() abaixo: a tela de app
// permanece oculta e schema-mismatch-screen assume o lugar dela.
async function _checkSchemaGate() {
  try {
    await assertSchemaCompatible();
    return true;
  } catch (err) {
    const { friendly } = handleError(err, { context: "initApp.schemaCheck", silent: true });
    document.getElementById("app-screen").hidden = true;
    const screen = document.getElementById("schema-mismatch-screen");
    screen.hidden = false;
    renderStateBlock(document.getElementById("schema-mismatch-block"), {
      state: STATES.SCHEMA_MISMATCH,
      message: friendly,
      onRetry: () => window.location.reload(),
    });
    return false;
  }
}

// Auditoria UX #31: o filtro "Exibir: Pessoais" só afeta Agenda (Semana/Mês)
// e Compromissos — cada página tem sua própria instância na toolbar (em vez
// de uma única barra fixa no topo da sidebar, visível mesmo nas páginas onde
// não faz nada). Semana e Mês agora dividem a mesma toolbar (F10 #4.1), então
// restam duas instâncias, que leem/escrevem o mesmo estado
// (academicCalendarFilter.js) e por isso são recriadas juntas a cada mudança
// para permanecerem sincronizadas.
function _renderAllFilterBars() {
  renderFilterBar("filter-bar-agenda");
  renderFilterBar("filter-bar-appointments");
}

// F10 #4.1 — Semana e Mês deixaram de ser páginas separadas: são abas dentro
// da mesma página "Agenda". Nenhuma lógica de calendar.js/weekView.js muda —
// os dois continuam inicializados normalmente (ver Promise.all em _initApp);
// isto só alterna qual seção fica visível, e lembra a última aba escolhida
// entre recarregamentos (mesmo padrão de medagenda_sidebar_collapsed).
const AGENDA_VIEW_KEY = "medagenda_agenda_view";
let _agendaViewBound = false;

function _setAgendaView(view) {
  const weekEl  = document.getElementById("week-container");
  const monthEl = document.getElementById("calendar-container");
  if (weekEl)  weekEl.hidden  = view !== "week";
  if (monthEl) monthEl.hidden = view !== "month";

  document.querySelectorAll("#agenda-view-tabs .tab").forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("tab--active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  try { localStorage.setItem(AGENDA_VIEW_KEY, view); } catch { /* storage unavailable */ }
}

function _initAgendaViewTabs() {
  if (_agendaViewBound) return;
  _agendaViewBound = true;
  document.querySelectorAll("#agenda-view-tabs .tab").forEach(btn => {
    btn.addEventListener("click", () => _setAgendaView(btn.dataset.view));
  });

  let saved;
  try { saved = localStorage.getItem(AGENDA_VIEW_KEY); } catch { /* storage unavailable */ }
  _setAgendaView(saved === "month" ? "month" : "week");
}

// ── [DOMAIN: autenticação] — extraído para authView.js ───────────────────
// Inicialização do app após autenticação bem-sucedida.
// Esta função é passada como callback onSignedIn ao initAuthView() e é chamada
// uma vez por sessão de usuário — a guarda contra dupla inicialização fica em
// authView.js (showApp).
async function _initApp(session) {
  try {
    if (!(await _checkSchemaGate())) return;

    restoreSidebarState();

    headerEmail.textContent = session.user.email;

    // Avatar initial from email
    const avatarCircle = document.getElementById("header-avatar-circle");
    if (avatarCircle) avatarCircle.textContent = (session.user.email || "?").charAt(0).toUpperCase();

    safeInit("conta", () => initAccountView(session.user.id));
    const hasActiveStudySession = await safeInit("sessão de estudo", () => initStudySessionView());
    safeInit("chip de sessão ativa", () => initActiveSessionIndicator());
    safeInit("atalhos de teclado", () => initKeyboardShortcuts());
    safeInit("notificações", () => {
      initNotifications(session.user.id);
      initPushService(session.user.id, VAPID_PUBLIC_KEY);
    });

    // Re-sync push subscription in case it changed since last login
    syncPushSubscription().catch(() => {});

    // Initialize academic calendar service & wiring
    safeInit("calendário acadêmico", () => initAcademicModal());
    try {
      await initAcademicCalendarView(() => {
        // Called whenever calendars change — refresh filters and views
        _renderAllFilterBars();
        refreshAll();
      });
    } catch (err) {
      // Calendário acadêmico é um recurso independente da agenda pessoal —
      // uma falha aqui (rede, Supabase) não pode impedir categorias, semana,
      // mês e lista de compromissos de carregarem normalmente.
      handleError(err, { context: "initApp.academicCalendar" });
    }
    _renderAllFilterBars();

    const academicProvider = getAcademicEventProvider();
    setCalendarAcademicProvider(academicProvider);
    setWeekViewAcademicProvider(academicProvider);
    setCalendarPersonalVisibility(isPersonalVisible);
    setWeekViewPersonalVisibility(isPersonalVisible);

    // Hook up "Calendários" button (AUD-005: uma única vez por carregamento
    // de página — ver guarda declarada em _academicCalsButtonBound)
    if (!_academicCalsButtonBound) {
      document.getElementById("btn-academic-cals")?.addEventListener("click", openAcademicCalendarModal);
      _academicCalsButtonBound = true;
    }

    // Categorias devem estar prontas antes do calendário e da lista
    try {
      await initCategories();
    } catch (err) {
      // Sem categorias carregadas o app continua utilizável (cor padrão nos
      // cards); não deve bloquear semana, mês e lista de compromissos.
      handleError(err, { context: "initApp.categories" });
    }

    // Semana, mês e lista são isolados entre si: uma falha em qualquer um não
    // pode impedir os outros dois de carregar, nem impedir restoreLastPage()
    // de rodar em seguida.
    await Promise.all([
      safeInit("semana", () => initWeekView(document.getElementById("week-container"), {
        onSlotClick: (date, time) =>
          openQuickAdd(date, refreshAll, time, openEventFormPrefilled),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      })),
      safeInit("calendário", () => initCalendar(document.getElementById("calendar-container"), {
        onDayClick: (date) =>
          openQuickAdd(date, refreshAll, "", openEventFormPrefilled),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      })),
      safeInit("agenda", loadEvents),
      safeInit("histórico de sessões", () => initActivityHistoryView()),
      safeInit("diário de estudos", () => initStudyJournalView()),
      safeInit("dashboard de execução", () => initActivityDashboardView()),
      safeInit("central de insights", () => initInsightsView()),
      safeInit("tour de boas-vindas", () => initOnboardingTour()),
    ]);

    // Restore the page the user was on before the last refresh/logout
    restoreLastPage();

    // F7.8 — Recuperação de sessão: existindo uma sessão "running" ou "paused"
    // do usuário (consultada exclusivamente via activitySessionService, dentro
    // de initStudySessionView() acima), a tela "Sessão de Estudo" sempre
    // prevalece sobre a última página salva — nunca inicia nem finaliza nada
    // automaticamente, só leva o usuário direto para onde pode decidir
    // continuar, cancelar ou finalizar.
    if (hasActiveStudySession) {
      showPage("study-session");
      toast.info("Você tem uma sessão de estudo em andamento.");
    }
  } catch (err) {
    // Última rede de segurança: qualquer falha não tratada nas etapas acima
    // não pode deixar o usuário numa tela parcialmente carregada sem aviso.
    handleError(err, { context: "initApp", silent: true });
    toast.error("Não foi possível carregar o aplicativo completamente. Recarregue a página para tentar novamente.");
  }
}

// ── SW → App message: open event from push notification click ──────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (event) => {
    if (event.data?.type !== "OPEN_EVENT" || !event.data.eventId) return;
    try {
      const target = await getEventById(event.data.eventId);
      if (target) openEventForm(target);
    } catch { /* ignore — session may not be ready */ }
  });
}

// ── [DOMAIN: formulário de evento — continuação] — extraído para eventFormView.js ──

// ── [DOMAIN: lista de compromissos] ───────────────────────────────────────
// ── Lista ──────────────────────────────────────────────────────────────────
async function loadEvents() {
  // Auditoria UX #20 — sem isto, a lista ficava em branco durante a
  // carga (rede lenta), diferente do Calendário (calendar.js/showLoading()),
  // que já mostra "Carregando…" antes de cada busca.
  eventList.innerHTML = "";
  listEmpty.hidden = false;
  listEmpty.classList.remove("list-error");
  clearStateBlock(listEmpty);
  listEmpty.innerHTML = skeletonRowsMarkup(4);
  try {
    const events = isPersonalVisible() ? await getEvents() : [];
    allEvents = events;
    renderFilteredList();
    scheduleReminders(events);
  } catch (err) {
    // Um erro (rede, banco, sessão expirada, etc.) nunca pode parecer uma
    // agenda vazia — a mensagem exibida é a mesma categorizada pelo
    // errorService, para que o usuário distinga os casos (ex.: "Sua sessão
    // expirou" vs. "Sem conexão com a internet").
    renderListError(errorToState(handleError(err, { context: "loadEvents", silent: true })));
  }
}

function getFilteredEvents() {
  const search    = (searchInput?.value || "").toLowerCase();
  const catFilter = filterCategorySelect?.value || "";
  const sort      = sortSelect?.value || "date-asc";

  let filtered = [...allEvents];

  if (search) {
    filtered = filtered.filter(ev =>
      (ev.title || "").toLowerCase().includes(search) ||
      (ev.description || "").toLowerCase().includes(search) ||
      (ev.location || "").toLowerCase().includes(search) ||
      (ev.category || "").toLowerCase().includes(search)
    );
  }

  if (catFilter) {
    filtered = filtered.filter(ev => ev.category === catFilter);
  }

  filtered.sort((a, b) => {
    if (sort === "date-asc") return a.event_date <= b.event_date ? -1 : 1;
    if (sort === "date-desc") return a.event_date >= b.event_date ? -1 : 1;
    return (a.title || "").localeCompare(b.title || "");
  });

  return filtered;
}

function renderFilteredList() {
  renderList(getFilteredEvents());
  _syncCategoryFilter();
}

function _syncCategoryFilter() {
  if (!filterCategorySelect) return;
  const current = filterCategorySelect.value;
  const cats = [...new Set(allEvents.map(e => e.category).filter(Boolean))].sort();
  filterCategorySelect.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    filterCategorySelect.appendChild(o);
  });
  filterCategorySelect.value = current;
}

searchInput?.addEventListener("input", renderFilteredList);
filterCategorySelect?.addEventListener("change", renderFilteredList);
sortSelect?.addEventListener("change", renderFilteredList);

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(timeStr) {
  return timeStr ? timeStr.slice(0, 5) : "";
}

function renderList(events) {
  eventList.innerHTML = "";
  listEmpty.hidden    = events.length > 0;
  listEmpty.classList.remove("list-error");
  clearStateBlock(listEmpty);
  listEmpty.textContent = LIST_EMPTY_TEXT;

  events.forEach((ev) => {
    const card = document.createElement("div");
    card.className = "event-card";
    card.style.borderLeftColor = ev.color || "#3b82f6";

    const meta = [
      formatDate(ev.event_date),
      formatTime(ev.start_time),
      ev.duration_minutes ? `${ev.duration_minutes} min` : "",
      ev.location || "",
    ].filter(Boolean).join(" · ");

    const catColor    = categoryColor(ev.category);
    const isRecurring = ev.recurrence_type && ev.recurrence_type !== "none";

    card.innerHTML = `
      <div class="event-card-header">
        <span class="event-card-title">${escapeHtml(ev.title)}</span>
        <div class="event-card-actions">
          <button class="btn btn-sm btn-primary btn-start-session">Iniciar sessão</button>
          <div class="user-menu-wrap event-card-menu-wrap">
            <button type="button" class="btn-icon btn-icon-sm event-card-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Mais ações para ${escapeHtml(ev.title)}">${iconMoreHorizontal}</button>
            <div class="user-menu-dropdown event-card-menu-dropdown" hidden role="menu">
              <button type="button" class="user-menu-item btn-edit" role="menuitem">Editar</button>
              <button type="button" class="user-menu-item user-menu-item--danger btn-delete" role="menuitem">Excluir</button>
            </div>
          </div>
        </div>
      </div>
      <div class="event-card-meta">
        <span>${escapeHtml(meta)}</span>
        ${ev.category
          ? `<span class="badge" style="background:${escapeHtml(catColor)};color:${readableTextColor(catColor)}">${escapeHtml(ev.category)}</span>`
          : ""}
        ${isRecurring ? `<span class="badge badge-recur">↻ Recorrente</span>` : ""}
      </div>
    `;

    card.querySelector(".btn-edit").addEventListener("click", () => { _closeAllCardMenus(); handleEventClick(ev); });
    card.querySelector(".btn-delete").addEventListener("click", () => { _closeAllCardMenus(); handleDelete(ev.id, card, isRecurring); });
    card.querySelector(".btn-start-session").addEventListener("click", (e) => handleStartSession(ev, e.currentTarget));
    eventList.appendChild(card);
  });
}

// F10 #1.5 — "Iniciar sessão" (ação mais comum, ver Auditoria UX #13) é a
// única ação sempre visível no card; Editar/Excluir tinham o mesmo peso
// visual dela (3 botões coloridos lado a lado) e competiam pela atenção sem
// motivo — nenhuma das duas é usada com a mesma frequência. Ambas passam a
// viver atrás de um menu "⋯" (btn-icon + user-menu-dropdown, mesmo padrão já
// usado por academicCalendarView.js/#36), com "Excluir" marcada como
// .user-menu-item--danger só dentro do menu aberto — não mais um botão
// vermelho sempre visível na lista.
function _closeAllCardMenus() {
  eventList.querySelectorAll(".event-card-menu-dropdown:not([hidden])").forEach(dropdown => {
    dropdown.hidden = true;
    dropdown.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

eventList.addEventListener("click", (e) => {
  const btn = e.target.closest(".event-card-menu-btn");
  if (!btn) return;
  e.stopPropagation();
  const dropdown = btn.nextElementSibling;
  const wasHidden = dropdown?.hidden;
  _closeAllCardMenus();
  if (dropdown && wasHidden) {
    dropdown.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }
});
document.addEventListener("click", _closeAllCardMenus);

// Estado de erro da lista — distinto de "sem compromissos" para que uma
// falha ao carregar (rede, banco, sessão, etc.) nunca seja confundida com
// uma agenda genuinamente vazia. Usa o componente único de estados (F4.1):
// sessão expirada leva à reautenticação, os demais casos oferecem "Tentar
// novamente".
function renderListError({ state, message }) {
  eventList.innerHTML = "";
  listEmpty.hidden     = false;
  listEmpty.classList.add("list-error");
  renderStateBlock(listEmpty, { state, message, onRetry: loadEvents });
}

// Auditoria UX #13: "Iniciar Sessão" só existia dentro do modal de edição —
// um contexto de escrita — para a ação mais valiosa do produto. Reaproveita
// startSessionForEvent() (mesma função que eventFormView.js já usa), que
// cuida sozinha do caso de já haver outra sessão em andamento.
async function handleStartSession(ev, btn) {
  btn.disabled = true;
  try {
    const started = await startSessionForEvent(ev);
    if (started) showPage("study-session");
  } finally {
    btn.disabled = false;
  }
}

async function handleDelete(id, card, isRecurring) {
  const ok = await confirmDialog({
    title:   'Excluir compromisso',
    message: isRecurring
      ? 'Este é um evento recorrente. Isso excluirá toda a série. Deseja continuar?'
      : 'Tem certeza que deseja excluir este compromisso?',
    danger:  true,
  });
  if (!ok) return;
  card.style.opacity = ".4";
  try {
    await deleteEvent(id);
    track(EVENTS.APPOINTMENT_DELETED);
    toast.success("Compromisso excluído.");
    await refreshAll();
  } catch (err) {
    const { friendly } = handleError(err, { context: 'script.handleDelete', silent: true, fallbackMessage: "Não foi possível excluir. Tente novamente." });
    card.style.opacity = "1";
    toast.error(friendly);
  }
}

// ── [DOMAIN: navegação e layout] — extraído para navigationView.js ──────────
safeInit("navegação", initNavigation);
safeInit("abas da agenda (Semana/Mês)", _initAgendaViewTabs);

// ── [DOMAIN: categorias] — extraído para categoryView.js ─────────────────
safeInit("categorias (modal)", () => initCategoryView(refreshAll));

// ── [DOMAIN: configurações e notificações] — extraído para settingsModal.js ──
safeInit("configurações", initSettingsModal);

// ── [DOMAIN: diagnóstico] — extraído para diagnosticModal.js ─────────────
safeInit("diagnóstico", () => initDiagnosticModal({ isDevMode: _isDevMode, setDevMode: _setDevMode }));

// ── [DOMAIN: formulário de evento] — extraído para eventFormView.js ────────
safeInit("formulário de compromisso", () => initEventForm(refreshAll));

// ── [DOMAIN: painel ia (gemini)] — extraído para aiPanelView.js ──────────────
safeInit("painel de IA", initAIPanel);

// ── [DOMAIN: autenticação] — extraído para authView.js ───────────────────
// Única etapa crítica do bootstrap (ver auditoria A2.3): sem ela nenhuma outra
// parte da aplicação pode funcionar, então — ao contrário das demais — uma
// falha aqui não é isolada por safeInit().
// Simetria com _initApp (ver auditoria A1.3): cada subsistema inicializado
// ali possui exatamente um reset aqui, chamado sempre que o usuário sai
// (logout manual, sessão expirada/forceReauth, ou troca de usuário) — nenhum
// estado, listener, timer, subscription ou cache pode sobreviver à troca de
// sessão nesta SPA (sem reload de página).
initAuthView({
  onSignedIn:      _initApp,
  onBeforeSignOut: () => {
    resetNotifications();
    resetStudySessionView();
    resetActiveSessionIndicator();
    resetKeyboardShortcuts();
    resetActivityHistoryView();
    resetStudyJournalView();
    resetActivityDashboardView();
    resetInsightsView();
    resetOnboardingTourView();
    resetAccountView();
    resetAcademicCalendarView();
    resetCategories();
    resetPushService();
    resetAIPanel();
    resetAIContextService();
    resetEventForm();
    resetCalendar();
    _resetEventList();
  },
});

// ── [DOMAIN: pwa] — registro do Service Worker e prompts de instalação ───────
safeInit("service worker", registerServiceWorker);
safeInit("botão de instalação", initInstallButton);
safeInit("detecção offline", initOfflineDetection);
