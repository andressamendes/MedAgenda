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

// ── Bottom sheet mobile (Fase 8) ────────────────────────────────────────
const MOBILE_QUERY = '(max-width: 767px)';
const DRAG_HANDLE_ZONE_PX = 44; // faixa a partir do topo do card que inicia o arraste
const CLOSE_DISTANCE_RATIO = 0.3; // fração da altura do card
const CLOSE_VELOCITY_PX_MS = 0.5;

function matchesMedia(query) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Verdadeiro só quando o app roda instalado (PWA standalone/iOS "adicionar à
 * tela de início") — é o único contexto em que uma vibração física se
 * parece com um app nativo em vez de soar fora de lugar numa aba comum. */
function isStandalonePwa() {
  return matchesMedia('(display-mode: standalone)') || window.navigator?.standalone === true;
}

/** Feedback tátil curto (Vibration API) para confirmações — sem efeito fora
 * da PWA instalada ou em dispositivos sem suporte. */
export function hapticConfirm() {
  if (!isStandalonePwa()) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15);
}

/**
 * Arraste-para-fechar do bottom sheet: só ativa abaixo de 767px (checado a
 * cada pointerdown, não uma vez só, para sobreviver a um resize/mudança de
 * orientação com o modal já aberto) e só quando o toque começa na faixa
 * superior do card (a "alça" pintada via `.modal-card::before` em
 * style.css) — do contrário um arraste dentro do corpo do modal (ex.:
 * arrastar um slider, selecionar texto) fecharia o modal sem querer. Mesmo
 * padrão de Pointer Events de gestureUtils.js (attachSwipeToDismiss).
 */
function attachSheetDrag(card, onClose) {
  let dragging = false, startY = 0, dy = 0, startTime = 0;

  function onDown(e) {
    if (!matchesMedia(MOBILE_QUERY)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.clientY - card.getBoundingClientRect().top >= DRAG_HANDLE_ZONE_PX) return;
    dragging = true;
    dy = 0;
    startY = e.clientY;
    startTime = Date.now();
    card.classList.add('modal-dragging');
  }

  function onMove(e) {
    if (!dragging) return;
    const curDy = e.clientY - startY;
    if (curDy <= 0) {
      dy = 0;
      card.style.transform = '';
      return;
    }
    e.preventDefault();
    dy = curDy;
    card.style.transform = `translateY(${dy}px)`;
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('modal-dragging');
    const velocity = dy / Math.max(Date.now() - startTime, 1);
    const shouldClose = dy > card.offsetHeight * CLOSE_DISTANCE_RATIO || velocity > CLOSE_VELOCITY_PX_MS;
    card.style.transform = '';
    if (shouldClose) onClose();
  }

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove, { passive: false });
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}

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

  // A paleta de comando (V5.10) reaproveita `.modal-card` de propósito
  // (mesma moldura visual), mas segue o padrão Spotlight/Raycast — não vira
  // bottom sheet nem ganha arraste-para-fechar (ver style.css, Fase 8).
  const card = overlay.querySelector('.modal-card');
  if (card && !overlay.classList.contains('command-palette-overlay')) {
    attachSheetDrag(card, onClose);
  }

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
