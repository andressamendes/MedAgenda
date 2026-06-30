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
 *                           navegação entre views de auth
 *   [3]  appInit          — Inicialização do app após login (showApp, refreshAll)
 *   [4]  formulário       — Criação e edição de compromissos → extraído para eventFormView.js
 *   [5]  lista            — Listagem, filtragem, ordenação e exclusão de compromissos
 *   [6]  categorias       — Modal de gerenciamento de categorias
 *   [7]  configurações    — Modal de configurações (notificações locais e push)
 *   [8]  diagnóstico      — Overlay de diagnóstico de serviços
 *   [9]  assistente       — Assistente inteligente (análise local de eventos)
 *   [10] painelIA         — Painel Gemini (resumo, sugestão e análise via API)
 *   [11] navegação        — Páginas, sidebar, user menu, bottom nav
 *
 * Estado compartilhado entre domínios (precisa ser resolvido na extração):
 *   - allEvents        → produzido por: lista; consumido por: assistente, painelIA
 *   - categoriesCache  → interno ao: categorias (extraído para categoryView.js)
 *   - editingId        → interno ao: formulário (extraído para eventFormView.js)
 *   - assistantHidden  → interno ao: assistente
 *
 * Ver docs/MODULARIZACAO_SCRIPT.md para o plano de extração em etapas.
 */

import { signIn, signUp, signOut, getSession, onAuthStateChange, sendPasswordReset, updatePassword } from "./auth.js";
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
import { initErrorService, setErrorDevMode } from "./errorService.js";
import { runDiagnostics, APP_VERSION, updateLastSync } from "./diagnosticService.js";
import { initAccountView } from "./accountView.js";
import {
  initAcademicCalendarView, initAcademicModal,
  openAcademicCalendarModal, renderFilterBar,
  getAcademicEventProvider, isPersonalVisible,
} from "./academicCalendarView.js";
import { analyzeEvents } from "./smartAssistant.js";
import { computeStats } from "./analytics.js";
import { getWeeklySummary, getStudySuggestion, getScheduleAnalysis } from "./services/ai/aiService.js";
import { confirmDialog } from "./confirmDialog.js";
import { initNavigation, showPage, restoreLastPage, openSidebar, closeSidebar, restoreSidebarState } from "./navigationView.js";
import { initCategoryView, initCategories, categoryColor } from "./categoryView.js";
import { initEventForm, openEventForm, handleEventClick } from "./eventFormView.js";

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
// ── Telas ──────────────────────────────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const appScreen   = document.getElementById("app-screen");
const appLoading  = document.getElementById("app-loading");

// Tracks the user ID of the currently initialized session to prevent
// double-initialization when onAuthStateChange and getSession() both fire.
let _initializedUserId = null;

// ── Indicador de sincronização ─────────────────────────────────────────────
const syncIndicator = document.getElementById("sync-indicator");

// ── Login ──────────────────────────────────────────────────────────────────
const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn      = document.getElementById("btn-login");
const logoutBtn     = document.getElementById("btn-logout");
const errorMsg      = document.getElementById("error-msg");
const headerEmail   = document.getElementById("header-email");


// ── Lista ──────────────────────────────────────────────────────────────────
const eventList = document.getElementById("event-list");
const listEmpty = document.getElementById("list-empty");

// ── Estado compartilhado entre domínios ───────────────────────────────────
// allEvents precisará de uma estratégia de compartilhamento quando os domínios
// dependentes forem extraídos. editingId → interno ao: formulário (eventFormView.js)
let allEvents        = [];    // compartilhado: lista → assistente, painelIA
let assistantHidden  = false; // interno: assistente

async function refreshAll() {
  if (syncIndicator) syncIndicator.hidden = false;
  try {
    await Promise.all([loadEvents(), refreshWeekView(), refreshCalendar()]);
    updateLastSync();
  } finally {
    if (syncIndicator) syncIndicator.hidden = true;
  }
}

// ── [DOMAIN: formulário de evento] — extraído para eventFormView.js ────────

// ── [DOMAIN: autenticação — fluxo principal] ──────────────────────────────
// Nota: este domínio está espalhado em quatro regiões do arquivo:
//   (a) aqui: showAuthView, showApp, listeners de onAuthStateChange/getSession
//   (b) l.1115+: navegação entre views de auth (btn-to-register, etc.)
//   (c) l.1124+: cadastro (btn-register)
//   (d) l.1178+: recuperação de senha (btn-send-reset)
//   (e) l.1580+: redefinição de nova senha (btn-set-password)
// ── Auth views ─────────────────────────────────────────────────────────────
const AUTH_VIEWS = ['login','register','email-sent','forgot','reset-sent','new-password'];

function showAuthView(name) {
  if (appLoading) appLoading.hidden = true;
  _closeAllModals();
  destroyWeekView();
  _initializedUserId = null;
  assistantHidden    = false;
  loginScreen.hidden = false;
  appScreen.hidden   = true;
  AUTH_VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = (v !== name);
  });
}

function showLogin() {
  showAuthView('login');
}

function _closeAllModals() {
  const ids = [
    'event-modal', 'cat-overlay', 'settings-overlay',
    'account-overlay', 'diagnostic-overlay', 'academic-overlay',
    'ai-panel', 'ai-panel-overlay',
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

async function showApp(session) {
  if (appLoading) appLoading.hidden = true;

  // Both onAuthStateChange (INITIAL_SESSION) and the getSession() IIFE fire on
  // load for the same session. Skip re-initialization for the same user so we
  // don't double-register event listeners or double-fetch data.
  if (_initializedUserId === session.user.id) {
    loginScreen.hidden = true;
    appScreen.hidden   = false;
    return;
  }
  _initializedUserId = session.user.id;

  loginScreen.hidden = true;
  appScreen.hidden   = false;

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
  await initAcademicCalendarView(() => {
    // Called whenever calendars change — refresh filters and views
    renderFilterBar("filter-bar");
    refreshAll();
  });
  renderFilterBar("filter-bar");

  const academicProvider = getAcademicEventProvider();
  setCalendarAcademicProvider(academicProvider);
  setWeekViewAcademicProvider(academicProvider);
  setCalendarPersonalVisibility(isPersonalVisible);
  setWeekViewPersonalVisibility(isPersonalVisible);

  // Hook up "Calendários" button
  document.getElementById("btn-academic-cals")?.addEventListener("click", openAcademicCalendarModal);

  // Categorias devem estar prontas antes do calendário e da lista
  await initCategories();
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

loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { errorMsg.textContent = "Preencha e-mail e senha."; return; }

  loginBtn.disabled    = true;
  loginBtn.textContent = "Entrando…";
  try {
    await signIn(email, password);
    passwordInput.value = "";
    track(EVENTS.LOGIN, { email });
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("Invalid login") || msg.includes("invalid_credentials")) {
      errorMsg.textContent = "E-mail ou senha incorretos. Verifique suas credenciais.";
    } else if (msg.includes("Email not confirmed")) {
      errorMsg.textContent = "Confirme seu e-mail antes de fazer login.";
    } else {
      errorMsg.textContent = "Não foi possível fazer login. Tente novamente.";
    }
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = "Entrar";
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try {
    await signOut();
    track(EVENTS.LOGOUT);
  } finally {
    logoutBtn.disabled = false;
  }
});

// If neither onAuthStateChange nor getSession() resolves within 10s (e.g.
// Supabase unreachable, token refresh hanging), force the login screen so the
// user is never stuck on the splash forever.
const _authSafetyTimer = setTimeout(() => {
  if (appLoading && !appLoading.hidden) showLogin();
}, 10000);

onAuthStateChange((session, event) => {
  clearTimeout(_authSafetyTimer);
  if (event === 'PASSWORD_RECOVERY') {
    showAuthView('new-password');
    return;
  }
  if (session) showApp(session);
  else showLogin();
});

(async () => {
  const session = await getSession();
  if (session) showApp(session);
  else showLogin();
})().catch(() => {
  // getSession() threw (network error, Supabase error, etc.).
  // onAuthStateChange should handle this too, but fall back to login
  // in case it also hangs or never fires.
  clearTimeout(_authSafetyTimer);
  showLogin();
});

// ── [DOMAIN: categorias] — extraído para categoryView.js ─────────────────

// ── [DOMAIN: configurações e notificações] ────────────────────────────────
// ── Configurações — modal ──────────────────────────────────────────────────
const settingsOverlay  = document.getElementById("settings-overlay");
const notifStatusText  = document.getElementById("notif-status-text");
const btnNotifToggle   = document.getElementById("btn-notif-toggle");
const notifPermHint    = document.getElementById("notif-perm-hint");
const pushStatusText   = document.getElementById("push-status-text");
const btnPushToggle    = document.getElementById("btn-push-toggle");
const pushErrorHint    = document.getElementById("push-error-hint");

document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("settings-close").addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsOverlay.hidden) closeSettings();
});

function openSettings() {
  renderSettingsState();
  renderPushState();
  renderDevmodeState();
  settingsOverlay.hidden = false;
}

function closeSettings() {
  settingsOverlay.hidden = true;
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
  } catch {
    // sessão pode ter expirado; onAuthStateChange cuida do redirecionamento
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

if (btnDiagnostic) {
  btnDiagnostic.addEventListener("click", openDiagnostic);
}
if (diagnosticClose) {
  diagnosticClose.addEventListener("click", closeDiagnostic);
}
if (diagnosticOverlay) {
  diagnosticOverlay.addEventListener("click", (e) => {
    if (e.target === diagnosticOverlay) closeDiagnostic();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && diagnosticOverlay && !diagnosticOverlay.hidden) closeDiagnostic();
});

async function openDiagnostic() {
  closeSettings();
  diagnosticBody.innerHTML = '<p class="diag-loading">Verificando serviços…</p>';
  diagnosticOverlay.hidden = false;

  try {
    const r = await runDiagnostics();
    diagnosticBody.innerHTML = renderDiagnosticHTML(r);
  } catch {
    diagnosticBody.innerHTML = '<p class="diag-loading">Erro ao obter diagnóstico.</p>';
  }
}

function closeDiagnostic() {
  diagnosticOverlay.hidden = true;
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

// ── [DOMAIN: autenticação — navegação, cadastro e recuperação] ────────────
// ── Auth: navegação entre views ─────────────────────────────────────────────
document.getElementById('btn-to-register')?.addEventListener('click', () => showAuthView('register'));
document.getElementById('btn-to-login-from-register')?.addEventListener('click', showLogin);
document.getElementById('btn-to-forgot')?.addEventListener('click', () => showAuthView('forgot'));
document.getElementById('btn-to-login-from-forgot')?.addEventListener('click', showLogin);
document.getElementById('btn-back-to-login-from-sent')?.addEventListener('click', showLogin);
document.getElementById('btn-back-to-login-from-reset')?.addEventListener('click', showLogin);

// ── Auth: cadastro ──────────────────────────────────────────────────────────
const registerBtn   = document.getElementById('btn-register');
const registerError = document.getElementById('register-error');

registerBtn?.addEventListener('click', async () => {
  if (!registerError) return;
  registerError.textContent = '';

  const fullName = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const pwd      = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const terms    = document.getElementById('reg-terms').checked;

  if (!fullName)            { registerError.textContent = 'Nome é obrigatório.'; return; }
  if (!email)               { registerError.textContent = 'E-mail é obrigatório.'; return; }
  if (pwd.length < 8)       { registerError.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  if (pwd !== confirm)      { registerError.textContent = 'As senhas não coincidem.'; return; }
  if (!terms)               { registerError.textContent = 'Aceite os Termos de Uso para continuar.'; return; }

  registerBtn.disabled    = true;
  registerBtn.textContent = 'Criando conta…';
  try {
    const { user } = await signUp(email, pwd, fullName);

    // user === null  → Supabase email-enumeration protection: e-mail já existe
    // identities: [] → Supabase comportamento antigo: e-mail já existe
    // Não tratar identities === undefined como "já cadastrado": o campo é opcional
    //   no tipo UserIdentity do SDK e sua ausência não indica duplicidade.
    const alreadyExists =
      user === null ||
      (Array.isArray(user.identities) && user.identities.length === 0);

    if (alreadyExists) {
      registerError.textContent = 'Este e-mail já está cadastrado. Faça login.';
      return;
    }

    track(EVENTS.SIGNUP, { email });
    document.getElementById('email-sent-addr').textContent = email;
    showAuthView('email-sent');
  } catch (err) {
    const msg = err.message || '';
    console.error('[cadastro] exceção capturada:', err);
    if (msg.includes('already registered') || msg.includes('already exists')) {
      registerError.textContent = 'Este e-mail já está cadastrado. Faça login.';
    } else {
      registerError.textContent = msg || 'Não foi possível criar a conta. Tente novamente.';
    }
  } finally {
    registerBtn.disabled    = false;
    registerBtn.textContent = 'Criar Conta';
  }
});

// ── Auth: recuperação de senha ──────────────────────────────────────────────
const sendResetBtn  = document.getElementById('btn-send-reset');
const forgotError   = document.getElementById('forgot-error');

sendResetBtn?.addEventListener('click', async () => {
  if (!forgotError) return;
  forgotError.textContent = '';

  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { forgotError.textContent = 'Informe seu e-mail.'; return; }

  sendResetBtn.disabled    = true;
  sendResetBtn.textContent = 'Enviando…';
  try {
    await sendPasswordReset(email);
    showAuthView('reset-sent');
  } catch (err) {
    forgotError.textContent = err.message || 'Não foi possível enviar o link. Tente novamente.';
  } finally {
    sendResetBtn.disabled    = false;
    sendResetBtn.textContent = 'Enviar link';
  }
});

// ── [DOMAIN: assistente inteligente] ──────────────────────────────────────
// ── Assistente Inteligente ──────────────────────────────────────────────────
const assistantSection   = document.getElementById('assistant-section');
const assistantBody      = document.getElementById('assistant-body');
const assistantClose     = document.getElementById('assistant-close');
const btnShowAssistant   = document.getElementById('btn-show-assistant');

assistantClose?.addEventListener('click', () => {
  if (assistantSection) {
    assistantSection.hidden = true;
    assistantHidden = true;
    if (btnShowAssistant) btnShowAssistant.hidden = false;
  }
});

btnShowAssistant?.addEventListener('click', () => {
  assistantHidden = false;
  btnShowAssistant.hidden = true;
  renderAssistant(allEvents);
});

function renderAssistant(events) {
  if (!assistantSection || !assistantBody) return;
  if (assistantHidden) return;
  assistantSection.hidden = false;
  if (btnShowAssistant) btnShowAssistant.hidden = true;

  const { alerts, suggestions } = analyzeEvents(events);
  const stats = computeStats(events);

  assistantBody.innerHTML = '';

  if (!events.length) {
    assistantBody.innerHTML = `<p class="assistant-empty-state">Nenhum compromisso encontrado. Adicione eventos para receber análises personalizadas.</p>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'assistant-grid';

  // ── Card: Alertas (conflitos) ──
  const errorAlerts    = alerts.filter(a => a.severity === 'error');
  const warningAlerts  = alerts.filter(a => a.severity === 'warning');
  const allAlerts      = [...errorAlerts, ...warningAlerts];

  const cardAlerts = buildCard(
    allAlerts.length > 0 ? 'error' : 'success',
    '⚠ Conflitos e Alertas',
    allAlerts.length > 0 ? allAlerts : null,
    allAlerts.length === 0 ? 'Nenhum conflito ou alerta detectado.' : null
  );
  grid.appendChild(cardAlerts);

  // ── Card: Sugestões ──
  const cardSuggestions = buildCard(
    suggestions.length > 0 ? 'info' : 'success',
    '💡 Sugestões',
    suggestions.length > 0 ? suggestions : null,
    suggestions.length === 0 ? 'Agenda equilibrada. Continue assim!' : null
  );
  grid.appendChild(cardSuggestions);

  // ── Card: Estatísticas do mês ──
  const cardStats = buildStatsCard(stats);
  grid.appendChild(cardStats);

  // ── Card: Próximos eventos ──
  const cardUpcoming = buildUpcomingCard(stats.upcoming);
  grid.appendChild(cardUpcoming);

  assistantBody.appendChild(grid);
}

function buildCard(severity, title, items, emptyMsg) {
  const card = document.createElement('div');
  card.className = `assistant-card assistant-card--${severity}`;

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = title;
  card.appendChild(h);

  if (items && items.length > 0) {
    const list = document.createElement('div');
    list.className = 'assistant-card-items';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'assistant-card-item';
      row.textContent = item.message;
      list.appendChild(row);
    });
    card.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = emptyMsg || '';
    card.appendChild(empty);
  }

  return card;
}

function buildStatsCard(stats) {
  const card = document.createElement('div');
  card.className = 'assistant-card assistant-card--neutral';

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = '📈 Este mês';
  card.appendChild(h);

  const summary = document.createElement('div');
  summary.className = 'assistant-summary';
  summary.innerHTML = `
    <span class="assistant-stat-pill"><strong>${stats.totalThisMonth}</strong> eventos</span>
    <span class="assistant-stat-pill"><strong>${stats.totalHours}h</strong> de atividades</span>
  `;
  card.appendChild(summary);

  if (stats.topCategories.length > 0) {
    const maxHours = stats.topCategories[0].hours || 1;
    stats.topCategories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'stat-bar-row';
      const pct = Math.round((cat.hours / maxHours) * 100);
      row.innerHTML = `
        <span class="stat-bar-label">${escapeHtml(cat.name)}</span>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="stat-bar-value">${cat.hours}h</span>
      `;
      card.appendChild(row);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = 'Sem dados de horas neste mês.';
    card.appendChild(empty);
  }

  return card;
}

function buildUpcomingCard(upcoming) {
  const card = document.createElement('div');
  card.className = 'assistant-card assistant-card--neutral';

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = '📅 Próximos 7 dias';
  card.appendChild(h);

  if (!upcoming.length) {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = 'Nenhum evento nos próximos 7 dias.';
    card.appendChild(empty);
    return card;
  }

  upcoming.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'upcoming-event-row';

    const [, m, d] = ev.event_date.split('-');
    const dateLabel = `${d}/${m}`;
    const timeLabel = ev.start_time ? ev.start_time.slice(0, 5) : '';
    const meta = [dateLabel, timeLabel, ev.category].filter(Boolean).join(' · ');

    row.innerHTML = `
      <div class="upcoming-event-dot" style="background:${escapeHtml(ev.color || '#6b7280')}"></div>
      <div class="upcoming-event-info">
        <div class="upcoming-event-title">${escapeHtml(ev.title)}</div>
        <div class="upcoming-event-meta">${escapeHtml(meta)}</div>
      </div>
    `;
    card.appendChild(row);
  });

  return card;
}

// ── [DOMAIN: painel ia (gemini)] ──────────────────────────────────────────
// ── Assistente IA (Gemini) ──────────────────────────────────────────────────
(function initAIPanel() {
  const overlay    = document.getElementById('ai-panel-overlay');
  const panel      = document.getElementById('ai-panel');
  const closeBtn   = document.getElementById('ai-panel-close');
  const openBtn    = document.getElementById('nav-ai-assistant');
  const actionsDiv = document.querySelector('.ai-panel-actions');
  const resultDiv  = document.getElementById('ai-panel-result');
  const loadingDiv = document.getElementById('ai-panel-loading');
  const resultBody = document.getElementById('ai-result-body');
  const resultTitle= document.getElementById('ai-result-title');
  const backBtn    = document.getElementById('btn-ai-back');

  if (!panel || !openBtn) return;

  function openPanel() {
    panel.hidden   = false;
    overlay.hidden = false;
    panel.removeAttribute('aria-hidden');
    overlay.removeAttribute('aria-hidden');
    showActions();
    closeBtn.focus();
  }

  function closePanel() {
    panel.hidden   = true;
    overlay.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    openBtn.focus();
  }

  function showActions() {
    actionsDiv.hidden = false;
    resultDiv.hidden  = true;
    loadingDiv.hidden = true;
  }

  function showLoading() {
    actionsDiv.hidden = true;
    resultDiv.hidden  = true;
    loadingDiv.hidden = false;
  }

  function showResult(title, text) {
    resultTitle.textContent = title;
    resultBody.textContent  = text;
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
  }

  function setActionBtnsDisabled(disabled) {
    document.querySelectorAll('.ai-action-btn').forEach(b => { b.disabled = disabled; });
  }

  async function runAIAction(label, fn) {
    showLoading();
    setActionBtnsDisabled(true);
    try {
      let events;
      try {
        events = isPersonalVisible() ? await getEvents() : [];
      } catch (dbErr) {
        console.error('[AI] Erro ao carregar eventos do banco de dados:', dbErr);
        showResult(label, 'Não foi possível carregar seus compromissos. Verifique sua conexão e tente novamente.');
        return;
      }
      const result = await fn(events);
      showResult(label, result || 'O assistente não retornou resposta. Tente novamente.');
    } catch (err) {
      console.error('[AI] Erro no assistente de IA:', err);
      showResult(label, err.message || 'Ocorreu um erro ao contatar o assistente de IA. Verifique sua conexão e tente novamente.');
    } finally {
      setActionBtnsDisabled(false);
    }
  }

  openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  backBtn?.addEventListener('click', showActions);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  document.getElementById('btn-ai-weekly')?.addEventListener('click', () =>
    runAIAction('Resumo da semana', getWeeklySummary)
  );
  document.getElementById('btn-ai-study')?.addEventListener('click', () =>
    runAIAction('Horários para estudo', getStudySuggestion)
  );
  document.getElementById('btn-ai-analysis')?.addEventListener('click', () =>
    runAIAction('Análise da agenda', getScheduleAnalysis)
  );
})();

// ── [DOMAIN: navegação e layout] — extraído para navigationView.js ──────────
initNavigation();

// ── [DOMAIN: categorias] — extraído para categoryView.js ─────────────────
initCategoryView();

// ── [DOMAIN: formulário de evento] — extraído para eventFormView.js ────────
initEventForm(refreshAll);

// ── [DOMAIN: autenticação — nova senha] ───────────────────────────────────
// ── Auth: definir nova senha (após clicar no link de reset) ─────────────────
const setPasswordBtn = document.getElementById('btn-set-password');
const newPwdError    = document.getElementById('new-pwd-error');

setPasswordBtn?.addEventListener('click', async () => {
  if (!newPwdError) return;
  newPwdError.textContent = '';

  const pwd     = document.getElementById('new-password').value;
  const confirm = document.getElementById('new-password-confirm').value;

  if (pwd.length < 8)    { newPwdError.textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  if (pwd !== confirm)   { newPwdError.textContent = 'As senhas não coincidem.'; return; }

  setPasswordBtn.disabled    = true;
  setPasswordBtn.textContent = 'Salvando…';
  try {
    await updatePassword(pwd);
    toast.success('Senha definida com sucesso. Você já pode fazer login.');
    showLogin();
  } catch (err) {
    newPwdError.textContent = err.message || 'Não foi possível definir a senha.';
  } finally {
    setPasswordBtn.disabled    = false;
    setPasswordBtn.textContent = 'Definir senha';
  }
});


