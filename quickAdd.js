import { createEvent } from "./eventService.js";

const WEEKDAYS_LONG = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const MONTHS_LONG   = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

let overlay, titleInput, timeInput, errorEl, saveBtn;
let selectedDate, onSaveCallback;

function init() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden    = true;
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("role", "dialog");
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-date" id="qa-date-label"></span>
        <button class="modal-close" id="qa-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">
        <input type="text"  id="qa-title" placeholder="Título do compromisso" autocomplete="off" />
        <input type="time"  id="qa-time" />
        <p class="error" id="qa-error"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost"   id="qa-cancel">Cancelar</button>
        <button class="btn btn-primary" id="qa-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  titleInput = overlay.querySelector("#qa-title");
  timeInput  = overlay.querySelector("#qa-time");
  errorEl    = overlay.querySelector("#qa-error");
  saveBtn    = overlay.querySelector("#qa-save");

  overlay.querySelector("#qa-close").addEventListener("click", close);
  overlay.querySelector("#qa-cancel").addEventListener("click", close);
  saveBtn.addEventListener("click", handleSave);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape")  { close(); }
    if (e.key === "Enter")   { e.preventDefault(); handleSave(); }
  });
}

export function openQuickAdd(date, onSave) {
  if (!overlay) init();

  selectedDate   = date;
  onSaveCallback = onSave;

  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  overlay.querySelector("#qa-date-label").textContent =
    `${WEEKDAYS_LONG[dow]}, ${d} de ${MONTHS_LONG[m - 1]}`;

  titleInput.value    = "";
  timeInput.value     = "";
  errorEl.textContent = "";
  saveBtn.disabled    = false;
  saveBtn.textContent = "Salvar";

  overlay.hidden = false;
  titleInput.focus();
}

function close() {
  if (overlay) overlay.hidden = true;
}

async function handleSave() {
  errorEl.textContent = "";
  const title = titleInput.value.trim();
  const time  = timeInput.value;

  if (!title) { errorEl.textContent = "Título é obrigatório."; titleInput.focus(); return; }
  if (!time)  { errorEl.textContent = "Hora é obrigatória.";   timeInput.focus();  return; }

  saveBtn.disabled    = true;
  saveBtn.textContent = "Salvando…";

  try {
    await createEvent({ title, event_date: selectedDate, start_time: time, recurrence_type: "none" });
    close();
    if (onSaveCallback) await onSaveCallback();
  } catch (err) {
    errorEl.textContent = err.message || "Erro ao salvar.";
    saveBtn.disabled    = false;
    saveBtn.textContent = "Salvar";
  }
}
