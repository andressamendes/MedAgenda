/**
 * modalController.js — Ciclo de vida compartilhado de modais e diálogos.
 *
 * Cobre apenas: abrir/fechar (toggle de `hidden`), Focus Trap (Tab/Shift+Tab),
 * Escape, clique fora e restauração do foco anterior. Renderização e regra de
 * negócio de cada modal continuam em suas respectivas views — este módulo não
 * sabe o que existe dentro do modal, apenas gerencia seu ciclo de vida.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null);
}

function trapTab(e, trapRoot) {
  if (e.key !== 'Tab') return;
  const focusables = focusableElements(trapRoot);
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last  = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Captura o elemento com foco atual — chame antes de abrir o modal. */
export function captureFocus() {
  return document.activeElement;
}

/** Restaura o foco a um elemento previamente capturado — chame ao fechar. */
export function restoreFocus(previousFocus) {
  if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
}

/**
 * Liga Escape, clique-fora e Focus Trap a um modal já existente, sem assumir
 * como sua visibilidade é controlada. Útil para estruturas fora do padrão de
 * um único elemento overlay (ex.: painel lateral com elementos separados).
 *
 * @param {HTMLElement}   clickTarget - elemento que recebe o listener de clique-fora
 * @param {() => boolean} isOpen      - retorna se o modal está aberto no momento
 * @param {() => void}    onClose     - função de fechamento já existente da view
 * @param {HTMLElement}   [trapRoot]  - raiz do focus trap (padrão: clickTarget)
 */
export function bindModalBehavior(clickTarget, isOpen, onClose, trapRoot = clickTarget) {
  clickTarget.addEventListener('click', (e) => {
    if (e.target === clickTarget && isOpen()) onClose();
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    trapTab(e, trapRoot);
  });
}

/**
 * Conveniência para o caso comum: um único elemento overlay cuja visibilidade
 * é controlada pelo atributo `hidden`. Cobre abrir/fechar, Escape, clique
 * fora, Focus Trap e restauração de foco.
 *
 * @param {HTMLElement} overlay    - elemento com `hidden` controlando a visibilidade
 * @param {() => void}  onClose    - função de fechamento já existente da view
 * @param {HTMLElement} [trapRoot] - raiz do focus trap (padrão: o próprio overlay)
 * @returns {{ open(initialFocusEl?: HTMLElement): void, close(): void }}
 */
export function initModal(overlay, onClose, trapRoot = overlay) {
  bindModalBehavior(overlay, () => !overlay.hidden, onClose, trapRoot);

  return {
    open(initialFocusEl) {
      overlay._modalPrevFocus = captureFocus();
      overlay.hidden = false;
      (initialFocusEl || trapRoot || overlay).focus?.();
    },
    close() {
      overlay.hidden = true;
      restoreFocus(overlay._modalPrevFocus);
      overlay._modalPrevFocus = null;
    },
  };
}
