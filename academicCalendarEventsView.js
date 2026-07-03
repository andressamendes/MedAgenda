import {
  getAcademicEvents, createAcademicEvent, updateAcademicEvent, deleteAcademicEvent,
} from "./academicCalendarService.js";
import { toast } from "./toastService.js";
import { escapeHtml } from "./utils.js";
import { confirmDialog } from "./confirmDialog.js";
import { handleError } from "./errorService.js";

// ── Constants ──────────────────────────────────────────────────────────────

export const ACADEMIC_CATEGORIES = [
  "Aula", "Prova", "Seminário", "Internato", "Rodízio",
  "Congresso", "Férias", "Recesso", "Evento", "Outro",
];

// ── Module deps — set via initEventsView ───────────────────────────────────

let _getCalendarsCache;
let _getActiveCalendar;
let _setActiveCalendar;
let _getOnChange;
let _openModal;
let _getModalBody;
let _onBack; // () => void — navigate back to calendar list

export function initEventsView({
  getCalendarsCache, getActiveCalendar, setActiveCalendar,
  getOnChange, openModal, getModalBody, onBack,
}) {
  _getCalendarsCache = getCalendarsCache;
  _getActiveCalendar = getActiveCalendar;
  _setActiveCalendar = setActiveCalendar;
  _getOnChange       = getOnChange;
  _openModal         = openModal;
  _getModalBody      = getModalBody;
  _onBack            = onBack;
}

// ── View: Event list ───────────────────────────────────────────────────────

export async function showEventList(calId) {
  const calendarsCache = _getCalendarsCache();
  const activeCalendar = calendarsCache.find(c => c.id === calId) || null;
  _setActiveCalendar(activeCalendar);
  if (!activeCalendar) return;

  let events = [];
  try {
    events = await getAcademicEvents(calId);
  } catch (err) {
    handleError(err, { context: 'academicCalendarEventsView.load', silent: true });
    toast.error("Erro ao carregar eventos.");
  }

  const listHTML = events.length === 0
    ? `<p class="acal-empty">Nenhum evento neste calendário.</p>`
    : events.map(ev => `
        <div class="acal-ev-row">
          <div class="acal-ev-dot"
            style="background:${escapeHtml(ev.color || activeCalendar.color)}"></div>
          <div class="acal-ev-info">
            <span class="acal-ev-title">${escapeHtml(ev.title)}</span>
            <span class="acal-ev-dates">${formatEventDates(ev)}</span>
            ${ev.category ? `<span class="badge">${escapeHtml(ev.category)}</span>` : ""}
            ${ev.location ? `<span class="acal-ev-loc">${escapeHtml(ev.location)}</span>` : ""}
          </div>
          <div class="acal-ev-actions">
            <button class="btn btn-sm btn-ghost btn-ev-edit"    data-id="${escapeHtml(ev.id)}">Editar</button>
            <button class="btn btn-sm btn-danger btn-ev-delete" data-id="${escapeHtml(ev.id)}">Excluir</button>
          </div>
        </div>
      `).join("");

  _openModal(`Eventos: ${escapeHtml(activeCalendar.name)}`, `
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

  const modalBody = _getModalBody();

  modalBody.querySelectorAll(".btn-ev-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (ev) showEventEditForm(ev);
    });
  });

  modalBody.querySelectorAll(".btn-ev-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (!ev) return;
      const ok = await confirmDialog({
        title:   'Excluir evento',
        message: `Excluir "${ev.title}"?`,
        danger:  true,
      });
      if (!ok) return;
      try {
        await deleteAcademicEvent(ev.id);
        toast.success("Evento excluído.");
        _getOnChange()?.();
        await showEventList(calId);
      } catch (err) {
        handleError(err, { context: 'academicCalendarEventsView.delete', silent: true });
        toast.error(err.message || "Erro ao excluir evento.");
      }
    });
  });

  document.getElementById("acev-add")?.addEventListener("click", () => handleEventCreate(calId));
  document.getElementById("acev-back")?.addEventListener("click", _onBack);
}

// ── Event form helpers ─────────────────────────────────────────────────────

function renderEventFormHTML(ev = null) {
  const catOpts = ACADEMIC_CATEGORIES.map(c =>
    `<option value="${c}" ${ev?.category === c ? "selected" : ""}>${c}</option>`
  ).join("");

  return `
    <div class="acal-form-grid">
      <div class="field" style="grid-column:1/-1">
        <label>Título <span class="required">*</span></label>
        <input type="text" id="acev-title" value="${escapeHtml(ev?.title || "")}" placeholder="Ex: Prova de Anatomia" maxlength="120" />
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
        <input type="text" id="acev-location" value="${escapeHtml(ev?.location || "")}" placeholder="Ex: Bloco C, Sala 201" maxlength="120" />
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>Descrição</label>
        <textarea id="acev-description" rows="2" maxlength="1000">${escapeHtml(ev?.description || "")}</textarea>
      </div>
    </div>
  `;
}

function readEventForm() {
  const errEl = document.getElementById("acev-error");
  const title = document.getElementById("acev-title")?.value.trim();
  const start = document.getElementById("acev-start")?.value;
  if (!title) { if (errEl) errEl.textContent = "Título é obrigatório."; return null; }
  if (!start) { if (errEl) errEl.textContent = "Data inicial é obrigatória."; return null; }
  const end = document.getElementById("acev-end")?.value || null;
  if (end && end < start) { if (errEl) errEl.textContent = "Data final deve ser após a inicial."; return null; }
  return {
    title,
    start_date:  start,
    end_date:    end || null,
    all_day:     true,
    category:    document.getElementById("acev-category")?.value    || null,
    color:       document.getElementById("acev-color")?.value       || null,
    location:    document.getElementById("acev-location")?.value.trim()    || null,
    description: document.getElementById("acev-description")?.value.trim() || null,
  };
}

// ── Event CRUD ─────────────────────────────────────────────────────────────

async function handleEventCreate(calId) {
  const errEl = document.getElementById("acev-error");
  errEl.textContent = "";
  const fields = readEventForm();
  if (!fields) return;
  try {
    await createAcademicEvent({ ...fields, calendar_id: calId });
    toast.success("Evento adicionado.");
    _getOnChange()?.();
    await showEventList(calId);
  } catch (err) {
    handleError(err, { context: 'academicCalendarEventsView.create', silent: true });
    errEl.textContent = err.message || "Erro ao criar evento.";
  }
}

function showEventEditForm(ev) {
  const calId = ev.calendar_id;
  _openModal(`Editar evento`, `
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
      _getOnChange()?.();
      await showEventList(calId);
    } catch (err) {
      handleError(err, { context: 'academicCalendarEventsView.update', silent: true });
      errEl.textContent = err.message || "Erro ao atualizar.";
    }
  });
  document.getElementById("acev-cancel").addEventListener("click", () => showEventList(calId));
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
