import { createEvent } from "./eventService.js";
import { initModal } from "./modalController.js";
import { handleError } from "./errorService.js";
import { iconX } from "./icons.js";

const WEEKDAYS_LONG = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const MONTHS_LONG   = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

let overlay, titleInput, dateInput, timeInput, errorEl, saveBtn, moreOptionsBtn, modal;
let selectedDate, onSaveCallback, onMoreOptionsCallback;

function init() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden    = true;
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-labelledby", "qa-date-label");
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-title" id="qa-date-label"></h2>
        <button class="modal-close" id="qa-close" aria-label="Fechar">${iconX}</button>
      </div>
      <div class="modal-body">
        <input type="text"  id="qa-title" placeholder="Título do compromisso" autocomplete="off" aria-label="Título do compromisso" maxlength="120" />
        <input type="date"  id="qa-date" aria-label="Data do compromisso" hidden />
        <input type="time"  id="qa-time" aria-label="Hora do compromisso" />
        <p class="error" id="qa-error"></p>
        <button type="button" class="link-btn" id="qa-more-options">Mais opções</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost"   id="qa-cancel">Cancelar</button>
        <button class="btn btn-primary" id="qa-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  titleInput     = overlay.querySelector("#qa-title");
  dateInput      = overlay.querySelector("#qa-date");
  timeInput      = overlay.querySelector("#qa-time");
  errorEl        = overlay.querySelector("#qa-error");
  saveBtn        = overlay.querySelector("#qa-save");
  moreOptionsBtn = overlay.querySelector("#qa-more-options");

  overlay.querySelector("#qa-close").addEventListener("click", close);
  overlay.querySelector("#qa-cancel").addEventListener("click", close);
  saveBtn.addEventListener("click", handleSave);
  moreOptionsBtn.addEventListener("click", handleMoreOptions);

  // F15.6 — quando aberto sem slot (ex.: "+ Novo compromisso"), a data é
  // editável dentro do próprio QuickAdd; o cabeçalho acompanha a escolha.
  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    selectedDate = dateInput.value;
    overlay.querySelector("#qa-date-label").textContent = _dateLabel(selectedDate);
  });

  modal = initModal(overlay, close);

  // Enter-para-salvar é específico do QuickAdd — Escape e clique fora já são
  // tratados pelo modalController.
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
  });
}

function _dateLabel(date) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS_LONG[dow]}, ${d} de ${MONTHS_LONG[m - 1]}`;
}

export function openQuickAdd(date, onSave, time = "", onMoreOptions, { editableDate = false } = {}) {
  if (!overlay) init();

  selectedDate           = date;
  onSaveCallback         = onSave;
  onMoreOptionsCallback  = onMoreOptions;

  overlay.querySelector("#qa-date-label").textContent = _dateLabel(date);

  titleInput.value    = "";
  dateInput.value     = date;
  dateInput.hidden    = !editableDate;
  timeInput.value     = time;
  errorEl.textContent = "";
  saveBtn.disabled    = false;
  saveBtn.textContent = "Salvar";

  modal.open(titleInput);
}

function close() {
  modal?.close();
}

// F11 E16 (auditoria #20) — "expandir ao formulário completo sem perder o
// que foi digitado": o que já está nos campos do QuickAdd vira o prefill do
// formulário completo, nunca é descartado.
function handleMoreOptions() {
  const prefill = {
    title:      titleInput.value.trim(),
    event_date: selectedDate,
    start_time: timeInput.value,
  };
  close();
  onMoreOptionsCallback?.(prefill);
}

async function handleSave() {
  errorEl.textContent = "";
  const title = titleInput.value.trim();
  const time  = timeInput.value;

  if (!title) { errorEl.textContent = "Título é obrigatório."; titleInput.focus(); return; }
  if (!dateInput.hidden && !dateInput.value) { errorEl.textContent = "Data é obrigatória."; dateInput.focus(); return; }
  if (!time)  { errorEl.textContent = "Hora é obrigatória.";   timeInput.focus();  return; }

  saveBtn.disabled    = true;
  saveBtn.textContent = "Salvando…";

  try {
    await createEvent({ title, event_date: selectedDate, start_time: time, recurrence_type: "none" });
    close();
    if (onSaveCallback) await onSaveCallback();
  } catch (err) {
    const { friendly } = handleError(err, { context: 'quickAdd.createEvent', silent: true, fallbackMessage: "Erro ao salvar." });
    errorEl.textContent = friendly;
    saveBtn.disabled    = false;
    saveBtn.textContent = "Salvar";
  }
}
