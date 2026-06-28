import {
  getCalendars, createCalendar, updateCalendar, deleteCalendar,
  getAcademicEvents, createAcademicEvent, updateAcademicEvent, deleteAcademicEvent,
  bulkInsertAcademicEvents, getAcademicEventsByRange, expandAcademicEvents,
} from "./academicCalendarService.js";
import { parseICS, deduplicateEvents } from "./icsImporter.js";
import { exportToICS, downloadICS } from "./icsExporter.js";
import { toast } from "./toastService.js";
import { escapeHtml } from "./utils.js";

// ── State ──────────────────────────────────────────────────────────────────

let _calendarsCache = [];
let _onChange       = null; // () => void  — called after any mutation

const FILTER_KEY_PERSONAL  = "medagenda_filter_personal";
const FILTER_KEY_ACADEMIC  = "medagenda_filter_academic";

const ACADEMIC_CATEGORIES = [
  "Aula", "Prova", "Seminário", "Internato", "Rodízio",
  "Congresso", "Férias", "Recesso", "Evento", "Outro",
];

// ── Filter state ───────────────────────────────────────────────────────────

export function isPersonalVisible() {
  try { const v = localStorage.getItem(FILTER_KEY_PERSONAL); return v === null || v === "1"; }
  catch { return true; }
}

function setPersonalVisible(val) {
  try { localStorage.setItem(FILTER_KEY_PERSONAL, val ? "1" : "0"); } catch {}
}

function getAcademicFilter() {
  try { const v = localStorage.getItem(FILTER_KEY_ACADEMIC); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}

function setAcademicFilter(obj) {
  try { localStorage.setItem(FILTER_KEY_ACADEMIC, JSON.stringify(obj)); } catch {}
}

export function isCalendarVisible(calendarId) {
  return getAcademicFilter()[calendarId] !== false;
}

function setCalendarVisible(calendarId, visible) {
  const f = getAcademicFilter();
  f[calendarId] = visible;
  setAcademicFilter(f);
}

// ── Public init & cache ────────────────────────────────────────────────────

export async function initAcademicCalendarView(onChangeCb) {
  _onChange = onChangeCb;
  _calendarsCache = await getCalendars();
  return _calendarsCache;
}

export function getCachedCalendars() { return _calendarsCache; }

export function getAcademicEventProvider() {
  return async (start, end) => {
    const visibleIds = _calendarsCache
      .filter(c => isCalendarVisible(c.id))
      .map(c => c.id);
    if (visibleIds.length === 0) return [];
    const raw = await getAcademicEventsByRange(visibleIds, start, end);
    return expandAcademicEvents(raw, start, end);
  };
}

// ── Filter bar ─────────────────────────────────────────────────────────────

export function renderFilterBar(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const html = `
    <span class="filter-label">Exibir:</span>
    <label class="filter-toggle">
      <input type="checkbox" id="chk-personal" ${isPersonalVisible() ? "checked" : ""}>
      <span>Compromissos pessoais</span>
    </label>
    ${_calendarsCache.map(c => `
      <label class="filter-toggle">
        <input type="checkbox" id="chk-cal-${c.id}"
          ${isCalendarVisible(c.id) ? "checked" : ""}
          data-calid="${escapeHtml(c.id)}">
        <span class="filter-cal-dot" style="background:${escapeHtml(c.color)}"></span>
        <span>${escapeHtml(c.name)}</span>
      </label>
    `).join("")}
  `;
  wrap.innerHTML = html;

  document.getElementById("chk-personal")?.addEventListener("change", e => {
    setPersonalVisible(e.target.checked);
    _onChange?.();
  });

  wrap.querySelectorAll("[data-calid]").forEach(chk => {
    chk.addEventListener("change", e => {
      setCalendarVisible(e.target.dataset.calid, e.target.checked);
      _onChange?.();
    });
  });
}

// ── Modal infrastructure ───────────────────────────────────────────────────

let _modalOverlay = null;
let _modalTitle   = null;
let _modalBody    = null;
let _activeCalendar = null; // calendar currently being browsed

export function initAcademicModal() {
  _modalOverlay = document.getElementById("academic-overlay");
  _modalTitle   = document.getElementById("academic-modal-title");
  _modalBody    = document.getElementById("academic-modal-body");

  document.getElementById("academic-close")?.addEventListener("click", closeModal);
  _modalOverlay?.addEventListener("click", e => { if (e.target === _modalOverlay) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _modalOverlay && !_modalOverlay.hidden) closeModal();
  });
}

function openModal(title, bodyHTML) {
  if (!_modalOverlay) return;
  _modalTitle.textContent = title;
  _modalBody.innerHTML    = bodyHTML;
  _modalOverlay.hidden    = false;
}

function closeModal() {
  if (_modalOverlay) _modalOverlay.hidden = true;
  _activeCalendar = null;
}

// ── View: Calendar list ────────────────────────────────────────────────────

export async function openAcademicCalendarModal() {
  _activeCalendar = null;
  await showCalendarList();
}

async function showCalendarList() {
  try {
    _calendarsCache = await getCalendars();
  } catch {
    toast.error("Erro ao carregar calendários.");
  }

  const listHTML = _calendarsCache.length === 0
    ? `<p class="acal-empty">Nenhum calendário acadêmico cadastrado.</p>`
    : _calendarsCache.map(c => `
        <div class="acal-row" data-id="${escapeHtml(c.id)}">
          <span class="acal-swatch" style="background:${escapeHtml(c.color)}"></span>
          <div class="acal-row-info">
            <span class="acal-row-name">${escapeHtml(c.name)}</span>
            ${c.university    ? `<span class="acal-row-sub">${escapeHtml(c.university)}</span>` : ""}
            ${c.academic_year ? `<span class="acal-row-sub">${escapeHtml(c.academic_year)}</span>` : ""}
          </div>
          <div class="acal-row-actions">
            <button class="btn btn-sm btn-ghost btn-acal-events"  data-id="${escapeHtml(c.id)}">Eventos</button>
            <button class="btn btn-sm btn-ghost btn-acal-import"  data-id="${escapeHtml(c.id)}">Importar ICS</button>
            <button class="btn btn-sm btn-ghost btn-acal-export"  data-id="${escapeHtml(c.id)}">Exportar ICS</button>
            <button class="btn btn-sm btn-ghost btn-acal-edit"    data-id="${escapeHtml(c.id)}">Editar</button>
            <button class="btn btn-sm btn-danger btn-acal-delete" data-id="${escapeHtml(c.id)}">Excluir</button>
          </div>
        </div>
      `).join("");

  openModal("Calendários Acadêmicos", `
    <div class="acal-list-wrap">
      <div class="acal-list" id="acal-list">${listHTML}</div>
      <div class="acal-add-section">
        <h4 class="acal-add-title">Novo calendário</h4>
        <div class="acal-form-grid">
          <div class="field">
            <label>Nome <span class="required">*</span></label>
            <input type="text" id="acal-new-name" placeholder="Ex: Medicina 2026" />
          </div>
          <div class="field">
            <label>Cor</label>
            <input type="color" id="acal-new-color" value="#7c3aed" />
          </div>
          <div class="field">
            <label>Universidade</label>
            <input type="text" id="acal-new-univ" placeholder="Ex: USP" />
          </div>
          <div class="field">
            <label>Ano letivo</label>
            <input type="text" id="acal-new-year" placeholder="Ex: 2026" />
          </div>
        </div>
        <p class="error" id="acal-error" role="alert"></p>
        <button class="btn btn-primary btn-sm" id="acal-add">Criar calendário</button>
      </div>
    </div>
  `);

  // Wire up list actions
  _modalBody.querySelectorAll(".btn-acal-events").forEach(btn => {
    btn.addEventListener("click", () => showEventList(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-import").forEach(btn => {
    btn.addEventListener("click", () => triggerICSImport(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-export").forEach(btn => {
    btn.addEventListener("click", () => handleICSExport(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-edit").forEach(btn => {
    btn.addEventListener("click", () => showCalendarEditForm(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-delete").forEach(btn => {
    btn.addEventListener("click", () => handleCalendarDelete(btn.dataset.id));
  });

  document.getElementById("acal-add")?.addEventListener("click", handleCalendarCreate);
}

async function handleCalendarCreate() {
  const errEl = document.getElementById("acal-error");
  errEl.textContent = "";
  const name  = document.getElementById("acal-new-name").value.trim();
  const color = document.getElementById("acal-new-color").value;
  const univ  = document.getElementById("acal-new-univ").value.trim() || null;
  const year  = document.getElementById("acal-new-year").value.trim() || null;
  if (!name) { errEl.textContent = "Nome é obrigatório."; return; }
  try {
    await createCalendar({ name, color, university: univ, academic_year: year });
    toast.success("Calendário criado.");
    _onChange?.();
    await showCalendarList();
  } catch (err) {
    errEl.textContent = err.message || "Erro ao criar calendário.";
  }
}

async function showCalendarEditForm(calId) {
  const cal = _calendarsCache.find(c => c.id === calId);
  if (!cal) return;

  openModal(`Editar: ${escapeHtml(cal.name)}`, `
    <div class="acal-form-full">
      <div class="acal-form-grid">
        <div class="field">
          <label>Nome <span class="required">*</span></label>
          <input type="text" id="acal-edit-name"  value="${escapeHtml(cal.name)}" />
        </div>
        <div class="field">
          <label>Cor</label>
          <input type="color" id="acal-edit-color" value="${escapeHtml(cal.color)}" />
        </div>
        <div class="field">
          <label>Universidade</label>
          <input type="text" id="acal-edit-univ" value="${escapeHtml(cal.university || "")}" />
        </div>
        <div class="field">
          <label>Ano letivo</label>
          <input type="text" id="acal-edit-year" value="${escapeHtml(cal.academic_year || "")}" />
        </div>
      </div>
      <p class="error" id="acal-edit-error" role="alert"></p>
      <div class="acal-form-actions">
        <button class="btn btn-primary" id="acal-save-edit">Salvar</button>
        <button class="btn btn-ghost"   id="acal-cancel-edit">Cancelar</button>
      </div>
    </div>
  `);

  document.getElementById("acal-save-edit").addEventListener("click", async () => {
    const errEl = document.getElementById("acal-edit-error");
    errEl.textContent = "";
    const name  = document.getElementById("acal-edit-name").value.trim();
    const color = document.getElementById("acal-edit-color").value;
    const univ  = document.getElementById("acal-edit-univ").value.trim() || null;
    const year  = document.getElementById("acal-edit-year").value.trim() || null;
    if (!name) { errEl.textContent = "Nome é obrigatório."; return; }
    try {
      await updateCalendar(calId, { name, color, university: univ, academic_year: year });
      toast.success("Calendário atualizado.");
      _onChange?.();
      await showCalendarList();
    } catch (err) {
      errEl.textContent = err.message || "Erro ao atualizar.";
    }
  });
  document.getElementById("acal-cancel-edit").addEventListener("click", showCalendarList);
}

async function handleCalendarDelete(calId) {
  const cal = _calendarsCache.find(c => c.id === calId);
  if (!cal) return;
  if (!confirm(`Excluir o calendário "${cal.name}" e todos os seus eventos?`)) return;
  try {
    await deleteCalendar(calId);
    toast.success("Calendário excluído.");
    _onChange?.();
    await showCalendarList();
  } catch (err) {
    toast.error(err.message || "Erro ao excluir.");
  }
}

// ── View: Event list ───────────────────────────────────────────────────────

async function showEventList(calId) {
  _activeCalendar = _calendarsCache.find(c => c.id === calId) || null;
  if (!_activeCalendar) return;

  let events = [];
  try { events = await getAcademicEvents(calId); } catch { toast.error("Erro ao carregar eventos."); }

  const listHTML = events.length === 0
    ? `<p class="acal-empty">Nenhum evento neste calendário.</p>`
    : events.map(ev => `
        <div class="acal-ev-row">
          <div class="acal-ev-dot"
            style="background:${escapeHtml(ev.color || _activeCalendar.color)}"></div>
          <div class="acal-ev-info">
            <span class="acal-ev-title">${escapeHtml(ev.title)}</span>
            <span class="acal-ev-dates">${formatEventDates(ev)}</span>
            ${ev.category ? `<span class="badge">${escapeHtml(ev.category)}</span>` : ""}
            ${ev.location ? `<span class="acal-ev-loc">${escapeHtml(ev.location)}</span>` : ""}
          </div>
          <div class="acal-ev-actions">
            <button class="btn btn-sm btn-ghost btn-ev-edit"   data-id="${escapeHtml(ev.id)}">Editar</button>
            <button class="btn btn-sm btn-danger btn-ev-delete" data-id="${escapeHtml(ev.id)}">Excluir</button>
          </div>
        </div>
      `).join("");

  openModal(`Eventos: ${escapeHtml(_activeCalendar.name)}`, `
    <div class="acal-ev-wrap">
      <div class="acal-ev-list">${listHTML}</div>
      <div class="acal-add-section">
        <h4 class="acal-add-title">Novo evento</h4>
        ${renderEventFormHTML()}
        <p class="error" id="acev-error" role="alert"></p>
        <div class="acal-form-actions">
          <button class="btn btn-primary btn-sm" id="acev-add">Adicionar evento</button>
          <button class="btn btn-ghost   btn-sm" id="acev-back">‹ Voltar</button>
        </div>
      </div>
    </div>
  `);

  _modalBody.querySelectorAll(".btn-ev-edit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (ev) showEventEditForm(ev);
    });
  });
  _modalBody.querySelectorAll(".btn-ev-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (!ev || !confirm(`Excluir "${ev.title}"?`)) return;
      try {
        await deleteAcademicEvent(ev.id);
        toast.success("Evento excluído.");
        _onChange?.();
        await showEventList(calId);
      } catch (err) { toast.error(err.message || "Erro ao excluir evento."); }
    });
  });

  document.getElementById("acev-add")?.addEventListener("click", () => handleEventCreate(calId));
  document.getElementById("acev-back")?.addEventListener("click", showCalendarList);
}

function renderEventFormHTML(ev = null) {
  const catOpts = ACADEMIC_CATEGORIES.map(c =>
    `<option value="${c}" ${ev?.category === c ? "selected" : ""}>${c}</option>`
  ).join("");

  return `
    <div class="acal-form-grid">
      <div class="field" style="grid-column:1/-1">
        <label>Título <span class="required">*</span></label>
        <input type="text" id="acev-title" value="${escapeHtml(ev?.title || "")}" placeholder="Ex: Prova de Anatomia" />
      </div>
      <div class="field">
        <label>Data inicial <span class="required">*</span></label>
        <input type="date" id="acev-start" value="${escapeHtml(ev?.start_date || "")}" />
      </div>
      <div class="field">
        <label>Data final</label>
        <input type="date" id="acev-end" value="${escapeHtml(ev?.end_date || "")}" />
      </div>
      <div class="field">
        <label>Categoria</label>
        <select id="acev-category">
          <option value="">— Selecione —</option>
          ${catOpts}
        </select>
      </div>
      <div class="field">
        <label>Cor</label>
        <input type="color" id="acev-color" value="${escapeHtml(ev?.color || "#7c3aed")}" />
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>Local</label>
        <input type="text" id="acev-location" value="${escapeHtml(ev?.location || "")}" placeholder="Ex: Bloco C, Sala 201" />
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>Descrição</label>
        <textarea id="acev-description" rows="2">${escapeHtml(ev?.description || "")}</textarea>
      </div>
    </div>
  `;
}

async function handleEventCreate(calId) {
  const errEl = document.getElementById("acev-error");
  errEl.textContent = "";
  const fields = readEventForm();
  if (!fields) return;
  try {
    await createAcademicEvent({ ...fields, calendar_id: calId });
    toast.success("Evento adicionado.");
    _onChange?.();
    await showEventList(calId);
  } catch (err) {
    errEl.textContent = err.message || "Erro ao criar evento.";
  }
}

function showEventEditForm(ev) {
  const calId = ev.calendar_id;
  openModal(`Editar evento`, `
    <div class="acal-form-full">
      ${renderEventFormHTML(ev)}
      <p class="error" id="acev-error" role="alert"></p>
      <div class="acal-form-actions">
        <button class="btn btn-primary" id="acev-save">Salvar</button>
        <button class="btn btn-ghost"   id="acev-cancel">Cancelar</button>
      </div>
    </div>
  `);

  document.getElementById("acev-save").addEventListener("click", async () => {
    const errEl = document.getElementById("acev-error");
    errEl.textContent = "";
    const fields = readEventForm();
    if (!fields) return;
    try {
      await updateAcademicEvent(ev.id, fields);
      toast.success("Evento atualizado.");
      _onChange?.();
      await showEventList(calId);
    } catch (err) {
      errEl.textContent = err.message || "Erro ao atualizar.";
    }
  });
  document.getElementById("acev-cancel").addEventListener("click", () => showEventList(calId));
}

function readEventForm() {
  const errEl = document.getElementById("acev-error");
  const title = document.getElementById("acev-title")?.value.trim();
  const start = document.getElementById("acev-start")?.value;
  if (!title) { if (errEl) errEl.textContent = "Título é obrigatório."; return null; }
  if (!start) { if (errEl) errEl.textContent = "Data inicial é obrigatória."; return null; }
  const end  = document.getElementById("acev-end")?.value      || null;
  if (end && end < start) { if (errEl) errEl.textContent = "Data final deve ser após a inicial."; return null; }
  return {
    title,
    start_date:  start,
    end_date:    end || null,
    all_day:     true,
    category:    document.getElementById("acev-category")?.value  || null,
    color:       document.getElementById("acev-color")?.value     || null,
    location:    document.getElementById("acev-location")?.value.trim()  || null,
    description: document.getElementById("acev-description")?.value.trim() || null,
  };
}

// ── ICS Import ─────────────────────────────────────────────────────────────

function triggerICSImport(calId) {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = ".ics,text/calendar";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    await handleICSImport(calId, file);
  });
  input.click();
}

async function handleICSImport(calId, file) {
  const cal = _calendarsCache.find(c => c.id === calId);
  const content = await file.text();
  const parsed  = parseICS(content);

  if (parsed.length === 0) {
    toast.warning("Nenhum evento encontrado no arquivo ICS.");
    return;
  }

  let existing = [];
  try { existing = await getAcademicEvents(calId); } catch {}

  const { unique, duplicates } = deduplicateEvents(parsed, existing);

  if (unique.length === 0) {
    toast.info(`Todos os ${duplicates} eventos já existem no calendário.`);
    return;
  }

  const confirmed = confirm(
    `Importar ${unique.length} evento(s) para "${cal?.name}"?` +
    (duplicates > 0 ? `\n(${duplicates} duplicados serão ignorados)` : "")
  );
  if (!confirmed) return;

  try {
    const records = unique.map(ev => ({ ...ev, calendar_id: calId }));
    await bulkInsertAcademicEvents(records);
    toast.success(`${unique.length} evento(s) importado(s) com sucesso.`);
    _onChange?.();
    if (_activeCalendar?.id === calId) {
      await showEventList(calId);
    } else {
      await showCalendarList();
    }
  } catch (err) {
    toast.error(err.message || "Erro ao importar eventos.");
  }
}

// ── ICS Export ─────────────────────────────────────────────────────────────

async function handleICSExport(calId) {
  const cal = _calendarsCache.find(c => c.id === calId);
  if (!cal) return;
  try {
    const events  = await getAcademicEvents(calId);
    const content = exportToICS(cal, events);
    downloadICS(content, cal.name);
    toast.success(`Calendário "${cal.name}" exportado.`);
  } catch (err) {
    toast.error(err.message || "Erro ao exportar calendário.");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatEventDates(ev) {
  const fmt = d => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  return ev.end_date && ev.end_date !== ev.start_date
    ? `${fmt(ev.start_date)} – ${fmt(ev.end_date)}`
    : fmt(ev.start_date);
}
