import { signIn, signOut, getSession, onAuthStateChange } from "./auth.js";
import { createEvent, getEvents, updateEvent, deleteEvent } from "./eventService.js";
import { initCalendar, refreshCalendar } from "./calendar.js";

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
const eventForm   = document.getElementById("event-form");
const formTitle   = document.getElementById("form-title");
const formError   = document.getElementById("form-error");
const eventIdField = document.getElementById("event-id");
const saveBtn     = document.getElementById("btn-save");
const cancelBtn   = document.getElementById("btn-cancel");

const fTitle      = document.getElementById("f-title");
const fDate       = document.getElementById("f-date");
const fStart      = document.getElementById("f-start");
const fDuration   = document.getElementById("f-duration");
const fCategory   = document.getElementById("f-category");
const fColor      = document.getElementById("f-color");
const fLocation   = document.getElementById("f-location");
const fDesc       = document.getElementById("f-description");
const fReminder   = document.getElementById("f-reminder");
const fRecurrence = document.getElementById("f-recurrence");

// ── Lista ──────────────────────────────────────────────────────────────────
const eventList  = document.getElementById("event-list");
const listEmpty  = document.getElementById("list-empty");

// ── Estado ─────────────────────────────────────────────────────────────────
let editingId = null;

// ── Autenticação ───────────────────────────────────────────────────────────
function showLogin() {
  loginScreen.hidden = false;
  appScreen.hidden   = true;
}

async function showApp(session) {
  loginScreen.hidden = true;
  appScreen.hidden   = false;
  headerEmail.textContent = session.user.email;
  await Promise.all([
    initCalendar(document.getElementById("calendar-container")),
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

// ── Formulário ─────────────────────────────────────────────────────────────
function clearForm() {
  editingId = null;
  eventIdField.value = "";
  eventForm.reset();
  fColor.value = "#3b82f6";
  fRecurrence.value = "none";
  formTitle.textContent   = "Novo compromisso";
  saveBtn.textContent     = "Salvar compromisso";
  cancelBtn.hidden        = true;
  formError.textContent   = "";
}

function populateForm(ev) {
  editingId              = ev.id;
  eventIdField.value     = ev.id;
  fTitle.value           = ev.title           || "";
  fDate.value            = ev.event_date       || "";
  fStart.value           = ev.start_time       ? ev.start_time.slice(0, 5) : "";
  fDuration.value        = ev.duration_minutes || "";
  fCategory.value        = ev.category         || "";
  fColor.value           = ev.color            || "#3b82f6";
  fLocation.value        = ev.location         || "";
  fDesc.value            = ev.description      || "";
  fReminder.value        = ev.reminder_minutes || "";
  fRecurrence.value      = ev.recurrence_type  || "none";
  formTitle.textContent  = "Editar compromisso";
  saveBtn.textContent    = "Atualizar compromisso";
  cancelBtn.hidden       = false;
  formError.textContent  = "";
  fTitle.focus();
}

cancelBtn.addEventListener("click", clearForm);

eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  if (!fTitle.value.trim()) { formError.textContent = "Título é obrigatório."; return; }
  if (!fDate.value)         { formError.textContent = "Data é obrigatória."; return; }
  if (!fStart.value)        { formError.textContent = "Hora de início é obrigatória."; return; }

  const fields = {
    title:            fTitle.value.trim(),
    event_date:       fDate.value,
    start_time:       fStart.value || null,
    duration_minutes: fDuration.value  ? parseInt(fDuration.value)  : null,
    category:         fCategory.value  || null,
    color:            fColor.value     || null,
    location:         fLocation.value.trim()  || null,
    description:      fDesc.value.trim()      || null,
    reminder_minutes: fReminder.value  ? parseInt(fReminder.value)  : null,
    recurrence_type:  fRecurrence.value || "none",
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
    await Promise.all([loadEvents(), refreshCalendar()]);
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

const CATEGORY_LABEL = {
  aula: "Aula", plantao: "Plantão", ambulatorio: "Ambulatório",
  laboratorio: "Laboratório", estudo: "Estudo", prova: "Prova",
  congresso: "Congresso", pessoal: "Pessoal",
};

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
        ${ev.category ? `<span class="badge">${escapeHtml(CATEGORY_LABEL[ev.category] || ev.category)}</span>` : ""}
      </div>
    `;

    card.querySelector(".btn-edit").addEventListener("click", () => populateForm(ev));
    card.querySelector(".btn-delete").addEventListener("click", () => handleDelete(ev.id, card));

    eventList.appendChild(card);
  });
}

async function handleDelete(id, card) {
  if (!confirm("Excluir este compromisso?")) return;
  card.style.opacity = ".4";
  try {
    await deleteEvent(id);
    await Promise.all([loadEvents(), refreshCalendar()]);
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
