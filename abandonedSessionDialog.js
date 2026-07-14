// ── abandonedSessionDialog.js — Decisão sobre Sessão abandonada (F7.9) ──────
// Uma Sessão "running"/"paused" muito antiga (ver ABANDONED_SESSION_MS em
// studySessionView.js) nunca é continuada, finalizada ou cancelada
// automaticamente — este diálogo só apresenta as três opções e devolve a
// escolha do usuário; quem executa a ação (finishSession()/cancelSession(),
// ou nada, se "continuar") é studySessionView.js, exatamente como qualquer
// outro clique nos botões já existentes da tela. Segue o mesmo padrão de
// construção/ciclo de vida de confirmDialog.js, só com três desfechos em vez
// de dois — por isso não reaproveita confirmDialog() (que é estritamente
// confirmar/cancelar).
import { initModal } from "./modalController.js";
import { pad } from "./utils.js";

let overlay, messageEl, continueBtn, finishBtn, cancelBtn, modal;
let _resolve = null;

function _formatDateTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function init() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "asd-title");
  overlay.setAttribute("aria-describedby", "asd-message");
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 class="modal-title" id="asd-title">Sessão interrompida</h2>
      </div>
      <div class="modal-body">
        <p id="asd-message" style="margin:0;color:var(--gray-700);font-size:.9rem;line-height:1.5;white-space:pre-wrap"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="asd-cancel">Cancelar sessão</button>
        <button class="btn btn-secondary" id="asd-finish">Finalizar sessão</button>
        <button class="btn btn-primary" id="asd-continue">Continuar sessão</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  messageEl   = overlay.querySelector("#asd-message");
  continueBtn = overlay.querySelector("#asd-continue");
  finishBtn   = overlay.querySelector("#asd-finish");
  cancelBtn   = overlay.querySelector("#asd-cancel");

  continueBtn.addEventListener("click", () => _settle("continue"));
  finishBtn.addEventListener("click",   () => _settle("finish"));
  cancelBtn.addEventListener("click",   () => _settle("cancel"));

  // Nenhuma opção pode ser assumida por padrão (escopo do F7.9) — Esc/clique
  // fora, ao contrário de confirmDialog.js, não fecham o diálogo sem que o
  // usuário escolha explicitamente um dos três botões.
  modal = initModal(overlay, () => {});
}

function _settle(choice) {
  if (!_resolve) return;
  modal.close();
  const cb = _resolve;
  _resolve = null;
  cb(choice);
}

/**
 * @param {{ startedAt: string }} opts
 * @returns {Promise<"continue"|"finish"|"cancel">}
 */
export function abandonedSessionDialog({ startedAt } = {}) {
  if (!overlay) init();

  messageEl.textContent =
    `Existe uma sessão iniciada em ${_formatDateTime(startedAt)} que ficou interrompida. O que você deseja fazer?`;

  modal.open(continueBtn);

  return new Promise(res => { _resolve = res; });
}
