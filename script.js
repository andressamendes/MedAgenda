import { signIn, signOut, getSession, onAuthStateChange } from "./auth.js";
import { createEvent, getEvents, updateEvent, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar } from "./calendar.js";
import { initWeekView, refreshWeekView } from "./weekView.js";
import { openQuickAdd } from "./quickAdd.js";
import {
  getCategories, createCategory, updateCategory,
  deleteCategory, ensureDefaultCategories,
} from "./categoryService.js";

// ── Telas ──────────────────────────────────────────────────────────────────
const loginScreen = document.getElementById("login-screen");
const appScreen   = document.getElementById("app-screen");

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

function refreshAll() {
  return Promise.all([loadEvents(), refreshWeekView(), refreshCalendar()]);
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

// ── Autenticação ───────────────────────────────────────────────────────────
function showLogin() {
  loginScreen.hidden = false;
  appScreen.hidden   = true;
}

async function showApp(session) {
  loginScreen.hidden = true;
  appScreen.hidden   = false;
  headerEmail.textContent = session.user.email;

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
  } catch (err) {
    errorMsg.textContent = err.message || "Erro ao fazer login.";
  } finally {
    loginBtn.disabled    = false;
    loginBtn.textContent = "Entrar";
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  try { await signOut(); } finally { logoutBtn.disabled = false; }
});

onAuthStateChange((session) => {
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

// ── Formulário ─────────────────────────────────────────────────────────────
function clearForm() {
  editingId = null;
  eventIdField.value = "";
  eventForm.reset();
  fColor.value              = "#3b82f6";
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
  fReminder.value           = ev.reminder_minutes          || "";
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
    reminder_minutes:        fReminder.value  ? parseInt(fReminder.value)  : null,
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
    } else {
      await createEvent(fields);
    }
    clearForm();
    await refreshAll();
  } catch (err) {
    formError.textContent = err.message || "Erro ao salvar.";
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
  if (!confirm("Excluir este compromisso?")) return;
  card.style.opacity = ".4";
  try {
    await deleteEvent(id);
    await refreshAll();
  } catch (err) {
    card.style.opacity = "1";
    alert(err.message || "Erro ao excluir.");
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
