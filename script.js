import { signIn, signUp, signOut, getSession, onAuthStateChange, sendPasswordReset, updatePassword } from "./auth.js";
import { createEvent, getEvents, updateEvent, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar } from "./calendar.js";
import { initWeekView, refreshWeekView } from "./weekView.js";
import { openQuickAdd } from "./quickAdd.js";
import {
  getCategories, createCategory, updateCategory,
  deleteCategory, ensureDefaultCategories,
} from "./categoryService.js";
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

// ── Telas ──────────────────────────────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const appScreen   = document.getElementById("app-screen");

// ── Indicador de sincronização ─────────────────────────────────────────────
const syncIndicator = document.getElementById("sync-indicator");

// ── Login ──────────────────────────────────────────────────────────────────
const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn      = document.getElementById("btn-login");
const logoutBtn     = document.getElementById("btn-logout");
const errorMsg      = document.getElementById("error-msg");
const headerEmail   = document.getElementById("header-email");

// ── Formulário ─────────────────────────────────────────────────────────────
const eventForm    = document.getElementById("event-form");
const formTitle    = document.getElementById("form-title");
const formError    = document.getElementById("form-error");
const eventIdField = document.getElementById("event-id");
const saveBtn      = document.getElementById("btn-save");
const cancelBtn    = document.getElementById("btn-cancel");

const fTitle             = document.getElementById("f-title");
const fDate              = document.getElementById("f-date");
const fStart             = document.getElementById("f-start");
const fDuration          = document.getElementById("f-duration");
const fCategory          = document.getElementById("f-category");
const fColor             = document.getElementById("f-color");
const fLocation          = document.getElementById("f-location");
const fDesc              = document.getElementById("f-description");
const fReminder          = document.getElementById("f-reminder");
const fReminderCustom    = document.getElementById("f-reminder-custom");
const reminderCustomWrap = document.getElementById("reminder-custom-wrap");
const fRecurrence        = document.getElementById("f-recurrence");
const fRecurrenceUntil   = document.getElementById("f-recurrence-until");
const fRecurrenceInterval = document.getElementById("f-recurrence-interval");
const recurrenceExtra    = document.getElementById("recurrence-extra");
const recurrenceCustom   = document.getElementById("recurrence-custom");

// ── Lista ──────────────────────────────────────────────────────────────────
const eventList = document.getElementById("event-list");
const listEmpty = document.getElementById("list-empty");

// ── Estado ─────────────────────────────────────────────────────────────────
let editingId       = null;
let categoriesCache = [];

async function refreshAll() {
  if (syncIndicator) syncIndicator.hidden = false;
  try {
    await Promise.all([loadEvents(), refreshWeekView(), refreshCalendar()]);
    updateLastSync();
  } finally {
    if (syncIndicator) syncIndicator.hidden = true;
  }
}

// ── Clique em evento (mensal e semanal) ────────────────────────────────────
function handleEventClick(ev) {
  const isRecurring = ev.recurrence_type && ev.recurrence_type !== "none";

  if (isRecurring) {
    if (!confirm(`"${ev.title}" é um evento recorrente.\n\nIsso editará toda a série. Deseja continuar?`)) return;
  }

  // Virtual occurrences carry _baseEventId and _baseEventDate; restore them
  // so the form edits the base record, not the ephemeral occurrence object.
  const formEv = ev._isOccurrence
    ? { ...ev, id: ev._baseEventId, event_date: ev._baseEventDate }
    : ev;

  populateForm(formEv);
  document.querySelector(".form-section").scrollIntoView({ behavior: "smooth" });
}

// ── Lembrete — mostrar/esconder campo personalizado ───────────────────────
fReminder.addEventListener("change", () => {
  reminderCustomWrap.hidden = fReminder.value !== "custom";
});

// ── Recorrência — visibilidade dos campos extras ───────────────────────────
fRecurrence.addEventListener("change", () => {
  const v = fRecurrence.value;
  recurrenceExtra.hidden  = v === "none";
  recurrenceCustom.hidden = v !== "custom";
});

// Day-of-week toggle buttons
document.querySelectorAll(".day-btn").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("day-btn-active"));
});

function getSelectedDays() {
  return Array.from(document.querySelectorAll(".day-btn.day-btn-active"))
    .map(b => b.dataset.day)
    .join(",");
}

function setSelectedDays(str) {
  const days = str ? str.split(",") : [];
  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.classList.toggle("day-btn-active", days.includes(btn.dataset.day));
  });
}

// ── Auth views ─────────────────────────────────────────────────────────────
const AUTH_VIEWS = ['login','register','email-sent','forgot','reset-sent','new-password'];

function showAuthView(name) {
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

async function showApp(session) {
  loginScreen.hidden = true;
  appScreen.hidden   = false;
  headerEmail.textContent = session.user.email;

  initAccountView(session.user.id);
  initNotifications(session.user.id);
  initPushService(session.user.id, VAPID_PUBLIC_KEY);

  // Re-sync push subscription in case it changed since last login
  syncPushSubscription().catch(() => {});

  // Categorias devem estar prontas antes do calendário e da lista
  await initCategories();
  await Promise.all([
    initWeekView(document.getElementById("week-container"), {
      onSlotClick: (date, time) =>
        openQuickAdd(date, refreshAll, time),
      onEventClick: handleEventClick,
    }),
    initCalendar(document.getElementById("calendar-container"), {
      onDayClick: (date) =>
        openQuickAdd(date, refreshAll),
      onEventClick: handleEventClick,
    }),
    loadEvents(),
  ]);
}

// ── SW → App message: open event from push notification click ──────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (event) => {
    if (event.data?.type !== "OPEN_EVENT" || !event.data.eventId) return;
    try {
      const events = await getEvents();
      const target = events.find((e) => e.id === event.data.eventId);
      if (target) {
        populateForm(target);
        document.querySelector(".form-section").scrollIntoView({ behavior: "smooth" });
      }
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

onAuthStateChange((session, event) => {
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
})();

// ── Categorias — dados ─────────────────────────────────────────────────────
async function initCategories() {
  categoriesCache = await ensureDefaultCategories();
  populateCategorySelect();
}

async function reloadCategories() {
  categoriesCache = await getCategories();
  populateCategorySelect();
}

function populateCategorySelect() {
  const current = fCategory.value;
  fCategory.innerHTML = '<option value="">— Selecione —</option>';
  categoriesCache.forEach(cat => {
    const opt = document.createElement("option");
    opt.value       = cat.name;
    opt.textContent = cat.name;
    fCategory.appendChild(opt);
  });
  fCategory.value = current; // preserva seleção atual (modo edição)
}

function categoryColor(name) {
  const cat = categoriesCache.find(c => c.name === name);
  return cat?.color || "#6b7280";
}

// Auto-preenche a cor ao selecionar uma categoria
fCategory.addEventListener("change", () => {
  const cat = categoriesCache.find(c => c.name === fCategory.value);
  if (cat) fColor.value = cat.color;
});

// ── Categorias — modal ─────────────────────────────────────────────────────
const catOverlay  = document.getElementById("cat-overlay");
const catList     = document.getElementById("cat-list");
const catNewColor = document.getElementById("cat-new-color");
const catNewName  = document.getElementById("cat-new-name");
const catAddBtn   = document.getElementById("cat-add");
const catError    = document.getElementById("cat-error");

document.getElementById("btn-categories").addEventListener("click", openCatModal);
document.getElementById("cat-close").addEventListener("click", closeCatModal);
catOverlay.addEventListener("click", (e) => { if (e.target === catOverlay) closeCatModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !catOverlay.hidden) closeCatModal();
});

async function openCatModal() {
  catError.textContent = "";
  catNewName.value  = "";
  catNewColor.value = "#3b82f6";
  await renderCatList();
  catOverlay.hidden = false;
  catNewName.focus();
}

function closeCatModal() {
  catOverlay.hidden = true;
}

async function renderCatList() {
  catList.innerHTML = "";
  const cats = await getCategories();

  if (cats.length === 0) {
    catList.innerHTML = `<p class="cat-empty">Nenhuma categoria cadastrada.</p>`;
    return;
  }

  cats.forEach(cat => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <span class="cat-swatch" style="background:${escapeHtml(cat.color)}"></span>
      <span class="cat-name-display">${escapeHtml(cat.name)}</span>
      <div class="cat-row-actions">
        <button class="btn btn-sm btn-ghost">Editar</button>
        <button class="btn btn-sm btn-danger">Excluir</button>
      </div>
    `;

    row.querySelector(".btn-ghost").addEventListener("click",  () => enterEditMode(row, cat));
    row.querySelector(".btn-danger").addEventListener("click", () => handleCatDelete(cat, row));
    catList.appendChild(row);
  });
}

function enterEditMode(row, cat) {
  row.innerHTML = `
    <input type="color" class="cat-edit-color" value="${escapeHtml(cat.color)}" title="Cor" />
    <input type="text"  class="cat-edit-name"  value="${escapeHtml(cat.name)}" />
    <div class="cat-row-actions">
      <button class="btn btn-sm btn-primary">Salvar</button>
      <button class="btn btn-sm btn-ghost">Cancelar</button>
    </div>
  `;
  row.querySelector(".cat-edit-name").focus();

  row.querySelector(".btn-primary").addEventListener("click", async () => {
    const newName  = row.querySelector(".cat-edit-name").value.trim();
    const newColor = row.querySelector(".cat-edit-color").value;
    if (!newName) return;
    try {
      await updateCategory(cat.id, newName, newColor);
      await reloadCategories();
      await renderCatList();
    } catch (err) {
      catError.textContent = err.message;
    }
  });

  row.querySelector(".btn-ghost").addEventListener("click", renderCatList);
}

async function handleCatDelete(cat, row) {
  if (!confirm(`Excluir a categoria "${cat.name}"?`)) return;
  row.style.opacity = ".4";
  try {
    await deleteCategory(cat.id);
    await reloadCategories();
    await renderCatList();
  } catch (err) {
    row.style.opacity = "1";
    catError.textContent = err.message;
  }
}

catAddBtn.addEventListener("click", async () => {
  catError.textContent = "";
  const name  = catNewName.value.trim();
  const color = catNewColor.value;
  if (!name) { catError.textContent = "Nome é obrigatório."; catNewName.focus(); return; }
  try {
    await createCategory(name, color);
    catNewName.value  = "";
    catNewColor.value = "#3b82f6";
    await reloadCategories();
    await renderCatList();
  } catch (err) {
    catError.textContent = err.message;
  }
});

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

// ── Formulário ─────────────────────────────────────────────────────────────
function clearForm() {
  editingId = null;
  eventIdField.value = "";
  eventForm.reset();
  fColor.value              = "#3b82f6";
  fReminder.value           = "";
  reminderCustomWrap.hidden = true;
  fReminderCustom.value     = "";
  fRecurrence.value         = "none";
  fRecurrenceInterval.value = 1;
  fRecurrenceUntil.value    = "";
  recurrenceExtra.hidden    = true;
  recurrenceCustom.hidden   = true;
  setSelectedDays("");
  formTitle.textContent = "Novo compromisso";
  saveBtn.textContent   = "Salvar compromisso";
  cancelBtn.hidden      = true;
  formError.textContent = "";
}

function populateForm(ev) {
  editingId             = ev.id;
  eventIdField.value    = ev.id;
  fTitle.value          = ev.title           || "";
  fDate.value           = ev.event_date       || "";
  fStart.value          = ev.start_time       ? ev.start_time.slice(0, 5) : "";
  fDuration.value       = ev.duration_minutes || "";
  fCategory.value       = ev.category         || "";
  fColor.value          = ev.color            || "#3b82f6";
  fLocation.value       = ev.location         || "";
  fDesc.value           = ev.description      || "";
  _populateReminder(ev.reminder_minutes);
  fRecurrence.value         = ev.recurrence_type           || "none";
  fRecurrenceInterval.value = ev.recurrence_interval       || 1;
  fRecurrenceUntil.value    = ev.recurrence_until          || "";
  setSelectedDays(ev.recurrence_days_of_week || "");
  fRecurrence.dispatchEvent(new Event("change")); // show/hide extra fields
  formTitle.textContent = "Editar compromisso";
  saveBtn.textContent   = "Atualizar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
  fTitle.focus();
}

// ── Helpers de lembrete ────────────────────────────────────────────────────
const REMINDER_PRESETS = new Set(["0", "10", "30", "60", "120", "1440"]);

function _populateReminder(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") {
    fReminder.value           = "";
    reminderCustomWrap.hidden = true;
    fReminderCustom.value     = "";
  } else if (REMINDER_PRESETS.has(String(minutes))) {
    fReminder.value           = String(minutes);
    reminderCustomWrap.hidden = true;
    fReminderCustom.value     = "";
  } else {
    fReminder.value           = "custom";
    fReminderCustom.value     = String(minutes);
    reminderCustomWrap.hidden = false;
  }
}

function _reminderMinutes() {
  const v = fReminder.value;
  if (v === "")       return null;
  if (v === "custom") return parseInt(fReminderCustom.value) || null;
  return parseInt(v);
}

cancelBtn.addEventListener("click", clearForm);

eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  if (!fTitle.value.trim()) { formError.textContent = "Título é obrigatório."; return; }
  if (!fDate.value)         { formError.textContent = "Data é obrigatória."; return; }
  if (!fStart.value)        { formError.textContent = "Hora de início é obrigatória."; return; }

  const recType = fRecurrence.value || "none";
  const fields = {
    title:                   fTitle.value.trim(),
    event_date:              fDate.value,
    start_time:              fStart.value || null,
    duration_minutes:        fDuration.value  ? parseInt(fDuration.value)  : null,
    category:                fCategory.value  || null,
    color:                   fColor.value     || null,
    location:                fLocation.value.trim()  || null,
    description:             fDesc.value.trim()      || null,
    reminder_minutes:        _reminderMinutes(),
    recurrence_type:         recType,
    recurrence_interval:     recType === "custom" ? (parseInt(fRecurrenceInterval.value) || 1) : null,
    recurrence_until:        recType !== "none"   ? (fRecurrenceUntil.value || null)            : null,
    recurrence_days_of_week: recType === "custom" ? (getSelectedDays() || null)                 : null,
  };

  saveBtn.disabled    = true;
  saveBtn.textContent = editingId ? "Atualizando…" : "Salvando…";

  try {
    if (editingId) {
      await updateEvent(editingId, fields);
      track(EVENTS.APPOINTMENT_EDITED, { title: fields.title });
      toast.success("Compromisso atualizado com sucesso.");
    } else {
      await createEvent(fields);
      track(EVENTS.APPOINTMENT_CREATED, { title: fields.title });
      toast.success("Compromisso salvo com sucesso.");
    }
    clearForm();
    await refreshAll();
  } catch (err) {
    formError.textContent = err.message || "Não foi possível salvar. Tente novamente.";
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = editingId ? "Atualizar compromisso" : "Salvar compromisso";
  }
});

// ── Lista ──────────────────────────────────────────────────────────────────
async function loadEvents() {
  try {
    const events = await getEvents();
    renderList(events);
    scheduleReminders(events);
  } catch {
    // sessão pode ter expirado; onAuthStateChange cuida do redirecionamento
  }
}

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
  if (!confirm("Tem certeza que deseja excluir este compromisso?")) return;
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
    // If identities is empty the email is already confirmed (e-mail auth disabled)
    if (!user?.identities?.length) {
      registerError.textContent = 'Este e-mail já está cadastrado. Faça login.';
      return;
    }
    document.getElementById('email-sent-addr').textContent = email;
    showAuthView('email-sent');
  } catch (err) {
    const msg = err.message || '';
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


