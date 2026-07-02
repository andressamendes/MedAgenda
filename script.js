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
 *   [6]  categorias       — Modal de gerenciamento de categorias
 *   [7]  configurações    — Modal de configurações (notificações locais e push)
 *   [8]  diagnóstico      — Overlay de diagnóstico de serviços
 *   [9]  assistente       — Assistente inteligente → extraído para assistantView.js
 *   [10] painelIA         — Painel Gemini → extraído para aiPanelView.js
 *   [11] navegação        — Páginas, sidebar, user menu, bottom nav → extraído para navigationView.js
 *
 * Estado compartilhado entre domínios:
 *   - allEvents        → produzido por: lista; consumido por: assistente (via renderAssistant())
 *
 * Ver docs/MODULARIZACAO_SCRIPT.md para o plano de extração em etapas.
 */

import { getEvents, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar, setCalendarAcademicProvider, setCalendarPersonalVisibility } from "./calendar.js";
import { initWeekView, refreshWeekView, setWeekViewAcademicProvider, setWeekViewPersonalVisibility, destroyWeekView } from "./weekView.js";
import { openQuickAdd } from "./quickAdd.js";
import {
  initNotifications, scheduleReminders,
  isSupported, isEnabled, setEnabled,
  permissionStatus, requestPermission,
} from "./notificationService.js";
import {
  initPushService, isPushSupported, isPushEnabled,
  subscribeToPush, unsubscribeFromPush, syncPushSubscription,
} from "./pushService.js";
import { VAPID_PUBLIC_KEY } from "./config.js";
import { escapeHtml } from "./utils.js";
import { toast } from "./toastService.js";
import { initTelemetry, setTelemetryDevMode, track, EVENTS } from "./telemetryService.js";
import { initErrorService, setErrorDevMode, handleError } from "./errorService.js";
import { runDiagnostics, APP_VERSION, updateLastSync } from "./diagnosticService.js";
import { initAccountView } from "./accountView.js";
import {
  initAcademicCalendarView, initAcademicModal,
  openAcademicCalendarModal, renderFilterBar,
  getAcademicEventProvider, isPersonalVisible,
} from "./academicCalendarView.js";
import { initAssistantView, renderAssistant, resetAssistant } from "./assistantView.js";
import { initAIPanel } from "./aiPanelView.js";
import { confirmDialog } from "./confirmDialog.js";
import { initNavigation, showPage, restoreLastPage, openSidebar, closeSidebar, restoreSidebarState } from "./navigationView.js";
import { initCategoryView, initCategories, categoryColor } from "./categoryView.js";
import { initEventForm, openEventForm, handleEventClick } from "./eventFormView.js";
import { initAuthView, showAuthView, showApp, showLogin } from "./authView.js";
import { initModal } from "./modalController.js";
import { registerServiceWorker, initInstallButton, initOfflineDetection } from "./pwa.js";

// ── [DOMAIN: observabilidade] ─────────────────────────────────────────────
// Inicializa serviços de observabilidade imediatamente
initErrorService(_isDevMode());
initTelemetry(_isDevMode());

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

// ── Estado compartilhado entre domínios ───────────────────────────────────
// allEvents precisará de uma estratégia de compartilhamento quando os domínios
// dependentes forem extraídos. editingId → interno ao: formulário (eventFormView.js)
let allEvents = [];    // compartilhado: lista → assistente, painelIA

async function refreshAll() {
  if (syncIndicator) syncIndicator.hidden = false;
  try {
    await Promise.all([loadEvents(), refreshWeekView(), refreshCalendar()]);
    updateLastSync();
  } finally {
    if (syncIndicator) syncIndicator.hidden = true;
  }
}

// ── [DOMAIN: autenticação] — extraído para authView.js ───────────────────
// Inicialização do app após autenticação bem-sucedida.
// Esta função é passada como callback onSignedIn ao initAuthView() e é chamada
// uma vez por sessão de usuário — a guarda contra dupla inicialização fica em
// authView.js (showApp).
async function _initApp(session) {
  try {
    restoreSidebarState();

    headerEmail.textContent = session.user.email;

    // Avatar initial from email
    const avatarCircle = document.getElementById("header-avatar-circle");
    if (avatarCircle) avatarCircle.textContent = (session.user.email || "?").charAt(0).toUpperCase();

    initAccountView(session.user.id);
    initNotifications(session.user.id);
    initPushService(session.user.id, VAPID_PUBLIC_KEY);

    // Re-sync push subscription in case it changed since last login
    syncPushSubscription().catch(() => {});

    // Initialize academic calendar service & wiring
    initAcademicModal();
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

    await Promise.all([
      initWeekView(document.getElementById("week-container"), {
        onSlotClick: (date, time) =>
          openQuickAdd(date, refreshAll, time),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      }),
      initCalendar(document.getElementById("calendar-container"), {
        onDayClick: (date) =>
          openQuickAdd(date, refreshAll),
        onEventClick: handleEventClick,
        onAcademicEventClick: openAcademicCalendarModal,
      }),
      loadEvents(),
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
      const events = await getEvents();
      const target = events.find((e) => e.id === event.data.eventId);
      if (target) openEventForm(target);
    } catch { /* ignore — session may not be ready */ }
  });
}

// ── [DOMAIN: configurações e notificações] ────────────────────────────────
// ── Configurações — modal ──────────────────────────────────────────────────
const settingsOverlay  = document.getElementById("settings-overlay");
const notifStatusText  = document.getElementById("notif-status-text");
const btnNotifToggle   = document.getElementById("btn-notif-toggle");
const notifPermHint    = document.getElementById("notif-perm-hint");
const pushStatusText   = document.getElementById("push-status-text");
const btnPushToggle    = document.getElementById("btn-push-toggle");
const pushErrorHint    = document.getElementById("push-error-hint");

const settingsModal = initModal(settingsOverlay, closeSettings);

document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("settings-close").addEventListener("click", closeSettings);

function openSettings() {
  renderSettingsState();
  renderPushState();
  renderDevmodeState();
  settingsModal.open();
}

function closeSettings() {
  settingsModal.close();
}

function renderSettingsState() {
  if (!isSupported()) {
    notifStatusText.textContent = "Seu navegador não suporta notificações.";
    btnNotifToggle.hidden       = true;
    notifPermHint.hidden        = true;
    return;
  }

  const perm    = permissionStatus();
  const enabled = isEnabled() && perm === "granted";

  if (perm === "denied") {
    notifStatusText.textContent = "Permissão de notificação negada pelo navegador.";
    btnNotifToggle.hidden       = true;
    notifPermHint.hidden        = false;
    notifPermHint.textContent   = "Para reativar, clique no ícone de cadeado na barra de endereços e permita notificações para este site.";
    return;
  }

  notifPermHint.hidden  = true;
  btnNotifToggle.hidden = false;

  if (enabled) {
    notifStatusText.textContent = "Ativadas — lembretes exibidos enquanto o app está aberto.";
    btnNotifToggle.textContent  = "Desativar";
    btnNotifToggle.className    = "btn btn-sm btn-ghost";
  } else {
    notifStatusText.textContent = perm === "default"
      ? "Desativadas — clique em Ativar para autorizar o navegador."
      : "Desativadas.";
    btnNotifToggle.textContent  = "Ativar";
    btnNotifToggle.className    = "btn btn-sm btn-primary";
  }
}

btnNotifToggle.addEventListener("click", async () => {
  const perm    = permissionStatus();
  const enabled = isEnabled() && perm === "granted";

  if (enabled) {
    setEnabled(false);
    scheduleReminders([]); // cancela todos os timeouts
  } else {
    const result = await requestPermission();
    if (result === "granted") {
      setEnabled(true);
      try {
        const events = await getEvents();
        scheduleReminders(events);
      } catch { /* ignore */ }
    }
  }

  renderSettingsState();
});

// ── Push Notifications — configurações ────────────────────────────────────

function renderPushState() {
  pushErrorHint.hidden = true;

  if (!isPushSupported()) {
    pushStatusText.textContent = "Push não é suportado neste navegador.";
    btnPushToggle.hidden       = true;
    return;
  }

  if (!VAPID_PUBLIC_KEY) {
    pushStatusText.textContent = "VAPID_PUBLIC_KEY não configurada — consulte a documentação.";
    btnPushToggle.hidden       = true;
    return;
  }

  const perm    = Notification.permission;
  const enabled = isPushEnabled() && perm === "granted";

  btnPushToggle.hidden = false;

  if (perm === "denied") {
    pushStatusText.textContent = "Permissão de notificação negada pelo navegador.";
    btnPushToggle.hidden       = true;
    pushErrorHint.hidden       = false;
    pushErrorHint.textContent  = "Para reativar, clique no ícone de cadeado na barra de endereços e permita notificações para este site.";
    return;
  }

  if (enabled) {
    pushStatusText.textContent = "Ativadas — você receberá lembretes mesmo com o app fechado.";
    btnPushToggle.textContent  = "Desativar Push";
    btnPushToggle.className    = "btn btn-sm btn-ghost";
  } else {
    pushStatusText.textContent = "Desativadas — ative para receber lembretes com o app fechado.";
    btnPushToggle.textContent  = "Ativar Push";
    btnPushToggle.className    = "btn btn-sm btn-primary";
  }
}

btnPushToggle.addEventListener("click", async () => {
  btnPushToggle.disabled = true;
  pushErrorHint.hidden   = true;

  try {
    if (isPushEnabled() && Notification.permission === "granted") {
      await unsubscribeFromPush();
    } else {
      await subscribeToPush();
    }
  } catch (err) {
    pushErrorHint.hidden      = false;
    pushErrorHint.textContent = err.message || "Erro ao configurar notificações push.";
  } finally {
    btnPushToggle.disabled = false;
  }

  renderPushState();
});

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
    // Sessão expirada é tratada silenciosamente (onAuthStateChange cuida do
    // redirecionamento); demais erros (rede, banco, inesperado) precisam ficar
    // visíveis para o usuário em vez de parecer uma agenda vazia.
    handleError(err, { context: "loadEvents" });
    renderListError();
  }
}

function getFilteredEvents() {
  const search   = (document.getElementById("search-appointments")?.value || "").toLowerCase();
  const catFilter = document.getElementById("filter-category-apt")?.value || "";
  const sort     = document.getElementById("sort-appointments")?.value || "date-asc";

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
  const sel = document.getElementById("filter-category-apt");
  if (!sel) return;
  const current = sel.value;
  const cats = [...new Set(allEvents.map(e => e.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todas as categorias</option>';
  cats.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  sel.value = current;
}

document.getElementById("search-appointments")?.addEventListener("input", renderFilteredList);
document.getElementById("filter-category-apt")?.addEventListener("change", renderFilteredList);
document.getElementById("sort-appointments")?.addEventListener("change", renderFilteredList);

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
  listEmpty.textContent = LIST_EMPTY_TEXT;
  listEmpty.classList.remove("list-error");

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
// falha ao carregar (rede, banco, etc.) nunca seja confundida com uma
// agenda genuinamente vazia.
function renderListError() {
  eventList.innerHTML   = "";
  listEmpty.hidden      = false;
  listEmpty.textContent = "Não foi possível carregar seus compromissos. Verifique sua conexão e tente novamente.";
  listEmpty.classList.add("list-error");
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
    card.style.opacity = "1";
    toast.error(err.message || "Não foi possível excluir. Tente novamente.");
  }
}

// ── [DOMAIN: diagnóstico] ─────────────────────────────────────────────────
// ── Diagnóstico ────────────────────────────────────────────────────────────
const diagnosticOverlay = document.getElementById("diagnostic-overlay");
const diagnosticBody    = document.getElementById("diagnostic-body");
const diagnosticClose   = document.getElementById("diagnostic-close");
const btnDiagnostic     = document.getElementById("btn-diagnostic");

const diagnosticModal = diagnosticOverlay ? initModal(diagnosticOverlay, closeDiagnostic) : null;

if (btnDiagnostic) {
  btnDiagnostic.addEventListener("click", openDiagnostic);
}
if (diagnosticClose) {
  diagnosticClose.addEventListener("click", closeDiagnostic);
}

async function openDiagnostic() {
  closeSettings();
  diagnosticBody.innerHTML = '<p class="diag-loading">Verificando serviços…</p>';
  diagnosticModal?.open();

  try {
    const r = await runDiagnostics();
    diagnosticBody.innerHTML = renderDiagnosticHTML(r);
  } catch {
    diagnosticBody.innerHTML = '<p class="diag-loading">Erro ao obter diagnóstico.</p>';
  }
}

function closeDiagnostic() {
  diagnosticModal?.close();
}

function renderDiagnosticHTML(r) {
  const items = [
    {
      ok:     r.supabase.ok,
      label:  'Banco de Dados',
      detail: r.supabase.ok
        ? 'Conectado e respondendo'
        : (r.supabase.error || 'Falha na conexão'),
      extra:  r.supabase.latency !== undefined ? `${r.supabase.latency} ms` : '',
    },
    {
      ok:     r.auth.ok,
      label:  'Autenticação',
      detail: r.auth.ok
        ? `${escapeHtml(r.auth.email || '')} — expira ${r.auth.expiresAt}`
        : r.auth.status,
    },
    {
      ok:     r.serviceWorker.ok,
      label:  'Service Worker',
      detail: r.serviceWorker.status,
    },
    {
      ok:     r.push.ok,
      label:  'Notificações Push',
      detail: r.push.status,
    },
    {
      ok:     true,
      label:  'Última sincronização',
      detail: escapeHtml(r.lastSync),
      neutral: true,
    },
  ];

  const rows = items.map(item => `
    <div class="diag-item">
      <span class="diag-dot ${item.neutral ? 'diag-neutral' : item.ok ? 'diag-ok' : 'diag-error'}"></span>
      <div class="diag-info">
        <div class="diag-label">${item.label}</div>
        <div class="diag-detail">${item.detail}</div>
      </div>
      ${item.extra ? `<span class="diag-latency">${item.extra}</span>` : ''}
    </div>
  `).join('');

  const ts = new Date(r.timestamp).toLocaleString('pt-BR');

  return `${rows}
    <p class="diag-footer">Versão ${escapeHtml(r.version)} · ${escapeHtml(r.environment)} · ${ts}</p>`;
}

// ── [DOMAIN: observabilidade — UI do modo desenvolvedor] ──────────────────
// ── Modo Desenvolvedor ─────────────────────────────────────────────────────
const btnDevmodeToggle = document.getElementById("btn-devmode-toggle");
const devmodePanel     = document.getElementById("devmode-panel");
const devVersion       = document.getElementById("dev-version");
const devEnv           = document.getElementById("dev-env");

if (btnDevmodeToggle) {
  btnDevmodeToggle.addEventListener("click", () => {
    const current = _isDevMode();
    _setDevMode(!current);
    renderDevmodeState();
    toast.info(!current ? "Modo desenvolvedor ativado." : "Modo desenvolvedor desativado.");
  });
}

function renderDevmodeState() {
  const enabled = _isDevMode();
  if (!btnDevmodeToggle) return;

  btnDevmodeToggle.textContent = enabled ? "Desativar" : "Ativar";
  btnDevmodeToggle.className   = `btn btn-sm ${enabled ? 'btn-ghost' : 'btn-ghost'}`;

  if (devmodePanel) {
    devmodePanel.hidden = !enabled;
    if (enabled) {
      if (devVersion) devVersion.textContent = APP_VERSION;
      if (devEnv) {
        const h = window.location.hostname;
        devEnv.textContent = h === 'localhost' || h === '127.0.0.1'
          ? 'Desenvolvimento (local)'
          : h.endsWith('github.io') ? 'Produção (GitHub Pages)' : h;
      }
    }
  }
}

// ── [DOMAIN: navegação e layout] — extraído para navigationView.js ──────────
initNavigation();

// ── [DOMAIN: categorias] — extraído para categoryView.js ─────────────────
initCategoryView();

// ── [DOMAIN: formulário de evento] — extraído para eventFormView.js ────────
initEventForm(refreshAll);

// ── [DOMAIN: assistente inteligente] — extraído para assistantView.js ────────
initAssistantView();

// ── [DOMAIN: painel ia (gemini)] — extraído para aiPanelView.js ──────────────
initAIPanel();

// ── [DOMAIN: autenticação] — extraído para authView.js ───────────────────
initAuthView({
  onSignedIn:      _initApp,
  onBeforeSignOut: resetAssistant,
});

// ── [DOMAIN: pwa] — registro do Service Worker e prompts de instalação ───────
registerServiceWorker();
initInstallButton();
initOfflineDetection();
