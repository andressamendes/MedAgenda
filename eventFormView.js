// ── eventFormView.js — Modal de criação e edição de compromissos ─────────────

import { createEvent, updateEvent } from "./eventService.js";
import { confirmDialog } from "./confirmDialog.js";
import { track, EVENTS } from "./telemetryService.js";
import { toast } from "./toastService.js";

const REMINDER_PRESETS = new Set(["0", "10", "30", "60", "120", "1440"]);

let editingId = null;
let _onSave   = null;

let eventModal         = null;
let eventForm          = null;
let formTitle          = null;
let formError          = null;
let eventIdField       = null;
let saveBtn            = null;
let cancelBtn          = null;
let fTitle             = null;
let fDate              = null;
let fStart             = null;
let fDuration          = null;
let fCategory          = null;
let fColor             = null;
let fLocation          = null;
let fDesc              = null;
let fReminder          = null;
let fReminderCustom    = null;
let reminderCustomWrap = null;
let fRecurrence        = null;
let fRecurrenceUntil   = null;
let fRecurrenceInterval = null;
let recurrenceExtra    = null;
let recurrenceCustom   = null;

export function initEventForm(onSave) {
  _onSave = onSave;

  eventModal          = document.getElementById("event-modal");
  eventForm           = document.getElementById("event-form");
  formTitle           = document.getElementById("form-title");
  formError           = document.getElementById("form-error");
  eventIdField        = document.getElementById("event-id");
  saveBtn             = document.getElementById("btn-save");
  cancelBtn           = document.getElementById("btn-cancel");
  fTitle              = document.getElementById("f-title");
  fDate               = document.getElementById("f-date");
  fStart              = document.getElementById("f-start");
  fDuration           = document.getElementById("f-duration");
  fCategory           = document.getElementById("f-category");
  fColor              = document.getElementById("f-color");
  fLocation           = document.getElementById("f-location");
  fDesc               = document.getElementById("f-description");
  fReminder           = document.getElementById("f-reminder");
  fReminderCustom     = document.getElementById("f-reminder-custom");
  reminderCustomWrap  = document.getElementById("reminder-custom-wrap");
  fRecurrence         = document.getElementById("f-recurrence");
  fRecurrenceUntil    = document.getElementById("f-recurrence-until");
  fRecurrenceInterval = document.getElementById("f-recurrence-interval");
  recurrenceExtra     = document.getElementById("recurrence-extra");
  recurrenceCustom    = document.getElementById("recurrence-custom");

  document.getElementById("event-modal-close")?.addEventListener("click", () => {
    _closeEventModal();
    _clearForm();
  });

  eventModal?.addEventListener("click", (e) => {
    if (e.target === eventModal) { _closeEventModal(); _clearForm(); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && eventModal && !eventModal.hidden) { _closeEventModal(); _clearForm(); }
  });

  ["btn-new-event", "btn-new-event-cal", "btn-new-event-apt"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => openEventForm());
  });

  fReminder?.addEventListener("change", () => {
    reminderCustomWrap.hidden = fReminder.value !== "custom";
  });

  fRecurrence?.addEventListener("change", () => {
    const v = fRecurrence.value;
    recurrenceExtra.hidden  = v === "none";
    recurrenceCustom.hidden = v !== "custom";
  });

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("day-btn-active"));
  });

  cancelBtn?.addEventListener("click", () => { _clearForm(); _closeEventModal(); });

  eventForm?.addEventListener("submit", async (e) => {
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
      recurrence_days_of_week: recType === "custom" ? (_getSelectedDays() || null)                : null,
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
      _clearForm();
      _closeEventModal();
      if (_onSave) await _onSave();
    } catch (err) {
      formError.textContent = err.message || "Não foi possível salvar. Tente novamente.";
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = editingId ? "Atualizar compromisso" : "Salvar compromisso";
    }
  });
}

export async function handleEventClick(ev) {
  const isRecurring = ev.recurrence_type && ev.recurrence_type !== "none";

  if (isRecurring) {
    const ok = await confirmDialog({
      title:       `"${ev.title}" é um evento recorrente.`,
      message:     'Isso editará toda a série. Deseja continuar?',
      confirmText: 'Continuar',
    });
    if (!ok) return;
  }

  const formEv = ev._isOccurrence
    ? { ...ev, id: ev._baseEventId, event_date: ev._baseEventDate }
    : ev;

  openEventForm(formEv);
}

export function openEventForm(ev) {
  if (ev) {
    _populateForm(ev);
  } else {
    _clearForm();
  }
  if (eventModal) {
    eventModal.hidden = false;
    fTitle?.focus();
  }
}

function _closeEventModal() {
  if (eventModal) eventModal.hidden = true;
}

function _clearForm() {
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
  _setSelectedDays("");
  formTitle.textContent = "Novo compromisso";
  saveBtn.textContent   = "Salvar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

function _populateForm(ev) {
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
  _setSelectedDays(ev.recurrence_days_of_week || "");
  fRecurrence.dispatchEvent(new Event("change"));
  formTitle.textContent = "Editar compromisso";
  saveBtn.textContent   = "Atualizar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

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

function _getSelectedDays() {
  return Array.from(document.querySelectorAll(".day-btn.day-btn-active"))
    .map(b => b.dataset.day)
    .join(",");
}

function _setSelectedDays(str) {
  const days = str ? str.split(",") : [];
  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.classList.toggle("day-btn-active", days.includes(btn.dataset.day));
  });
}
