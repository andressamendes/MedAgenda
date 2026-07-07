/**
 * script.js — Bootstrap e controlador principal da aplicação MedAgenda
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
 *   [9]  assistente       — Assistente inteligente → extraído para assistantView.js
 *   [10] painelIA         — Painel Gemini → extraído para aiPanelView.js
 *   [11] navegação        — Páginas, sidebar, user menu, bottom nav → extraído para navigationView.js
 *
 * Estado compartilhado entre domínios:
 *   - allEvents        → produzido por: lista; consumido por: assistente (via renderAssistant())
 *
 * Ver docs/MODULARIZACAO_SCRIPT.md para o plano de extração em etapas.
 */

import { getEvents, getEventById, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar, setCalendarAcademicProvider, setCalendarPersonalVisibility } from "./calendar.js";
import { initWeekView, refreshWeekView, setWeekViewAcademicProvider, setWeekViewPersonalVisibility } from "./weekView.js";
import { openQuickAdd } from "./quickAdd.js";
import { initNotifications, scheduleReminders, resetNotifications } from "./notificationService.js";
import { initPushService, syncPushSubscription, resetPushService } from "./pushService.js";
import { VAPID_PUBLIC_KEY } from "./config.js";
import { escapeHtml } from "./utils.js";
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
import { initAssistantView, renderAssistant, resetAssistant } from "./assistantView.js";
import { initAIPanel, resetAIPanel } from "./aiPanelView.js";
import { confirmDialog } from "./confirmDialog.js";
import { initNavigation, restoreLastPage, restoreSidebarState } from "./navigationView.js";
import { initCategoryView, initCategories, categoryColor, resetCategories } from "./categoryView.js";
import { initEventForm, openEventForm, handleEventClick } from "./eventFormView.js";
import { initAuthView, forceReauth } from "./authView.js";
import { setReauthHandler, errorToState, renderStateBlock, clearStateBlock, STATES } from "./stateView.js";
import { assertSchemaCompatible } from "./schemaService.js";
import { registerServiceWorker, initInstallButton, initOfflineDetection } from "./pwa.js";
import { initSettingsModal } from "./settingsModal.js";
import { initDiagnosticModal } from "./diagnosticModal.js";
import { initStudySessionView, resetStudySessionView } from "./studySessionView.js";
import { initActivityHistoryView, resetActivityHistoryView } from "./activityHistoryView.js";
import { initActivityDashboardView, resetActivityDashboardView } from "./activityDashboardView.js";
import { initInsightsView, resetInsightsView } from "./insightsView.js";
import { resetAIContextService } from "./aiContextService.js";

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
let allEvents = [];    // compartilhado: lista → assistente, painelIA

// Chamado no logout (ver initAuthView() abaixo) — allEvents e a lista
// renderizada são estado compartilhado entre domínios (lista → assistente,
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
    await fn();
  } catch (err) {
    handleError(err, { context: `initApp.${label}` });
  }
}

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
    safeInit("sessão de estudo", () => initStudySessionView());
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
        renderFilterBar("filter-bar");
        refreshAll();
      });
    } catch (err) {
      // Calendário acadêmico é um recurso independente da agenda pessoal —
      // uma falha aqui (rede, Supabase) não pode impedir categorias, semana,
      // mês e lista de compromissos de carregarem normalmente.
      handleError(err, { context: "initApp.academicCalendar" });
    }
    renderFilterBar("filter-bar");

    const academicProvider = getAcademicEventProvider();
    setCalendarAcademicProvider(academicProvider);
    setWeekViewAcademicProvider(academicProvider);
    setCalendarPersonalVisibility(isPersonalVisible);
    setWeekViewPersonalVisibility(isPersonalVisible);

    // Hook up "Calendários" button
    document.getElementById("btn-academic-cals")?.addEventListener("click", openAcademicCalendarModal);

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
          openQuickAdd(date, refreshAll, time),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      })),
      safeInit("calendário", () => initCalendar(document.getElementById("calendar-container"), {
        onDayClick: (date) =>
          openQuickAdd(date, refreshAll),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      })),
      safeInit("agenda", loadEvents),
      safeInit("histórico de sessões", () => initActivityHistoryView()),
      safeInit("dashboard de execução", () => initActivityDashboardView()),
      safeInit("central de insights", () => initInsightsView()),
    ]);

    // Restore the page the user was on before the last refresh/logout
    restoreLastPage();
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
  try {
    const events = isPersonalVisible() ? await getEvents() : [];
    allEvents = events;
    renderFilteredList();
    scheduleReminders(events);
    renderAssistant(events);
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
          <button class="btn btn-sm btn-ghost btn-edit">Editar</button>
          <button class="btn btn-sm btn-danger btn-delete">Excluir</button>
        </div>
      </div>
      <div class="event-card-meta">
        <span>${escapeHtml(meta)}</span>
        ${ev.category
          ? `<span class="badge" style="background:${escapeHtml(catColor)};color:#fff">${escapeHtml(ev.category)}</span>`
          : ""}
        ${isRecurring ? `<span class="badge badge-recur">↻ Recorrente</span>` : ""}
      </div>
    `;

    card.querySelector(".btn-edit").addEventListener("click", () => handleEventClick(ev));
    card.querySelector(".btn-delete").addEventListener("click", () => handleDelete(ev.id, card));
    eventList.appendChild(card);
  });
}

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

async function handleDelete(id, card) {
  const ok = await confirmDialog({
    title:   'Excluir compromisso',
    message: 'Tem certeza que deseja excluir este compromisso?',
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
    handleError(err, { context: 'script.handleDelete', silent: true });
    card.style.opacity = "1";
    toast.error(err.message || "Não foi possível excluir. Tente novamente.");
  }
}

// ── [DOMAIN: navegação e layout] — extraído para navigationView.js ──────────
safeInit("navegação", initNavigation);

// ── [DOMAIN: categorias] — extraído para categoryView.js ─────────────────
safeInit("categorias (modal)", initCategoryView);

// ── [DOMAIN: configurações e notificações] — extraído para settingsModal.js ──
safeInit("configurações", () => initSettingsModal({ isDevMode: _isDevMode, setDevMode: _setDevMode }));

// ── [DOMAIN: diagnóstico] — extraído para diagnosticModal.js ─────────────
safeInit("diagnóstico", initDiagnosticModal);

// ── [DOMAIN: formulário de evento] — extraído para eventFormView.js ────────
safeInit("formulário de compromisso", () => initEventForm(refreshAll));

// ── [DOMAIN: assistente inteligente] — extraído para assistantView.js ────────
safeInit("assistente", initAssistantView);

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
    resetAssistant();
    resetNotifications();
    resetStudySessionView();
    resetActivityHistoryView();
    resetActivityDashboardView();
    resetInsightsView();
    resetAccountView();
    resetAcademicCalendarView();
    resetCategories();
    resetPushService();
    resetAIPanel();
    resetAIContextService();
    _resetEventList();
  },
});

// ── [DOMAIN: pwa] — registro do Service Worker e prompts de instalação ───────
safeInit("service worker", registerServiceWorker);
safeInit("botão de instalação", initInstallButton);
safeInit("detecção offline", initOfflineDetection);
