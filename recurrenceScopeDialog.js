// ── recurrenceScopeDialog.js — escolha "apenas esta / esta e as próximas /
// toda a série" ──────────────────────────────────────────────────────────
//
// Mesmo padrão de confirmDialog.js (modal singleton criado sob demanda,
// initModal cuida de Escape/clique-fora/Focus Trap), mas com 3 opções em vez
// de confirmar/cancelar — reaproveitado por eventFormView.js e
// academicCalendarEventsView.js sempre que uma edição/exclusão parte de uma
// ocorrência expandida de uma série (ev._isOccurrence — ver recurrenceService.js).

import { initModal } from "./modalController.js";
import { SCOPE } from "./recurrenceService.js";

let overlay, titleEl, messageEl, optionsEl, cancelBtn, modal;
let _resolve = null;

const OPTIONS = [
  { scope: SCOPE.THIS,   label: "Apenas esta ocorrência" },
  { scope: SCOPE.FUTURE, label: "Esta e as próximas" },
  { scope: SCOPE.SERIES, label: "Toda a série" },
];

function init() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "rsd-title");
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-title" id="rsd-title"></h2>
      </div>
      <div class="modal-body">
        <p id="rsd-message" style="margin:0 0 .75rem;color:var(--gray-700);font-size:.9rem;line-height:1.5"></p>
        <div class="recurrence-scope-options" id="rsd-options"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="rsd-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  titleEl   = overlay.querySelector("#rsd-title");
  messageEl = overlay.querySelector("#rsd-message");
  optionsEl = overlay.querySelector("#rsd-options");
  cancelBtn = overlay.querySelector("#rsd-cancel");

  optionsEl.innerHTML = OPTIONS.map(({ scope, label }) =>
    `<button type="button" class="btn btn-secondary recurrence-scope-btn" data-scope="${scope}">${label}</button>`
  ).join("");

  optionsEl.querySelectorAll(".recurrence-scope-btn").forEach(btn => {
    btn.addEventListener("click", () => _settle(btn.dataset.scope));
  });
  cancelBtn.addEventListener("click", () => _settle(null));

  modal = initModal(overlay, () => _settle(null));
}

function _settle(value) {
  if (!_resolve) return;
  modal.close();
  const cb = _resolve;
  _resolve = null;
  cb(value);
}

/**
 * @param {{ title?: string, message?: string }} [opts]
 * @returns {Promise<"this"|"future"|"series"|null>} null = cancelado
 */
export function recurrenceScopeDialog({
  title = "Este é um evento recorrente.",
  message = "O que você deseja alterar?",
} = {}) {
  if (!overlay) init();

  titleEl.textContent = title;
  messageEl.textContent = message;

  modal.open(optionsEl.querySelector(".recurrence-scope-btn"));

  return new Promise(res => { _resolve = res; });
}
