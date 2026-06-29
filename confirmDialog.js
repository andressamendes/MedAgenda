let overlay, titleEl, messageEl, confirmBtn, cancelBtn;
let _resolve       = null;
let _previousFocus = null;

function init() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden    = true;
  overlay.setAttribute('role',            'dialog');
  overlay.setAttribute('aria-modal',      'true');
  overlay.setAttribute('aria-labelledby', 'cd-title');
  overlay.setAttribute('aria-describedby','cd-message');
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-date" id="cd-title"></span>
      </div>
      <div class="modal-body">
        <p id="cd-message" style="margin:0;color:var(--gray-700);font-size:.9rem;line-height:1.5;white-space:pre-wrap"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost"   id="cd-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cd-confirm">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  titleEl    = overlay.querySelector('#cd-title');
  messageEl  = overlay.querySelector('#cd-message');
  confirmBtn = overlay.querySelector('#cd-confirm');
  cancelBtn  = overlay.querySelector('#cd-cancel');

  cancelBtn.addEventListener('click',  () => _settle(false));
  confirmBtn.addEventListener('click', () => _settle(true));
  overlay.addEventListener('click', e => { if (e.target === overlay) _settle(false); });

  document.addEventListener('keydown', e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); _settle(false); }
  });
}

function _settle(value) {
  if (!_resolve) return;
  overlay.hidden = true;
  const cb = _resolve;
  _resolve = null;
  if (_previousFocus) { _previousFocus.focus(); _previousFocus = null; }
  cb(value);
}

/**
 * @param {{ title: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = '', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  if (!overlay) init();

  titleEl.textContent    = title;
  messageEl.textContent  = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent  = cancelText;
  confirmBtn.className   = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

  _previousFocus  = document.activeElement;
  overlay.hidden  = false;
  cancelBtn.focus();

  return new Promise(res => { _resolve = res; });
}
