// Fase 7 — módulo único de gestos de toque, sem framework externo (nenhum
// já existia no projeto). Três primitivas independentes (swipe-to-dismiss,
// swipe-actions, pull-to-refresh, long-press), todas via Pointer Events
// (unifica mouse/touch/caneta, suportado por Safari iOS 13+ e Chrome
// Android). Nenhuma delas é a única forma de disparar a ação que controla —
// cada uma é reforço de um botão que já existe (ver acceptance criteria da
// Fase 7: todo gesto precisa de equivalente acessível por botão).
//
// Toda primitiva decide a intenção do gesto (horizontal vs. vertical) só
// depois de ~6-8px de deslocamento, e cede para o scroll nativo da lista
// assim que a intenção detectada é vertical — sem isso, qualquer swipe
// horizontal aqui colidiria com o scroll vertical da lista (risco citado
// na Fase 7).

const DECIDE_TOLERANCE = 8;

function isPrimaryPointer(e) {
  return e.pointerType !== 'mouse' || e.button === 0;
}

/** Swipe horizontal (qualquer direção) para dispensar um elemento (toast). */
export function attachSwipeToDismiss(el, { onDismiss, threshold = 80 } = {}) {
  let startX = 0, startY = 0, dx = 0, dragging = false, axis = null;

  function onDown(e) {
    if (!isPrimaryPointer(e)) return;
    dragging = true;
    axis = null;
    dx = 0;
    startX = e.clientX;
    startY = e.clientY;
    el.style.transition = 'none';
  }

  function onMove(e) {
    if (!dragging) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;
    if (axis === null) {
      if (Math.abs(curDx) < DECIDE_TOLERANCE && Math.abs(curDy) < DECIDE_TOLERANCE) return;
      axis = Math.abs(curDx) > Math.abs(curDy) ? 'x' : 'y';
    }
    if (axis !== 'x') return;
    e.preventDefault();
    dx = curDx;
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(Math.max(1 - Math.abs(dx) / 220, 0.15));
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    const dismissed = axis === 'x' && Math.abs(dx) > threshold;
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
    axis = null;
    if (dismissed) onDismiss();
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return function destroy() {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}

// Swipe-actions: revela botões atrás do item ao arrastar para a esquerda —
// mesmo padrão de "Mail" em iOS/Android. Os botões revelados são um atalho
// de gesto para uma ação que já existe em algum botão sempre visível
// (menu "⋯" no caso de event-card); por isso ficam fora da árvore de
// acessibilidade (aria-hidden + tabIndex -1): não é uma ação nova, só uma
// forma mais rápida de disparar a mesma.
export function attachSwipeActions(itemEl, { actions, threshold = 72, maxWidth } = {}) {
  if (itemEl.__swipeActionsAttached) return itemEl.__swipeActionsAttached;

  const surface = document.createElement('div');
  surface.className = 'swipe-surface';
  while (itemEl.firstChild) surface.appendChild(itemEl.firstChild);

  const reveal = document.createElement('div');
  reveal.className = 'swipe-reveal';
  reveal.setAttribute('aria-hidden', 'true');

  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `swipe-action-btn ${action.className || ''}`.trim();
    btn.textContent = action.label;
    btn.tabIndex = -1;
    btn.addEventListener('click', () => {
      close();
      action.onTrigger();
    });
    reveal.appendChild(btn);
  });

  itemEl.classList.add('swipe-item');
  itemEl.appendChild(reveal);
  itemEl.appendChild(surface);

  let startX = 0, startY = 0, dx = 0, dragging = false, axis = null, open = false;

  function revealWidth() {
    const cap = maxWidth || itemEl.clientWidth * 0.6;
    return Math.min(reveal.scrollWidth || cap, cap);
  }

  function setX(x, animate) {
    surface.style.transition = animate ? 'transform .18s ease' : 'none';
    surface.style.transform = `translateX(${x}px)`;
  }

  function close(animate = true) {
    setX(0, animate);
    open = false;
  }

  function openFully(animate = true) {
    setX(-revealWidth(), animate);
    open = true;
  }

  function onDown(e) {
    if (!isPrimaryPointer(e)) return;
    dragging = true;
    axis = null;
    dx = 0;
    startX = e.clientX;
    startY = e.clientY;
    surface.style.transition = 'none';
  }

  function onMove(e) {
    if (!dragging) return;
    const curDx = e.clientX - startX;
    const curDy = e.clientY - startY;
    if (axis === null) {
      if (Math.abs(curDx) < DECIDE_TOLERANCE && Math.abs(curDy) < DECIDE_TOLERANCE) return;
      axis = Math.abs(curDx) > Math.abs(curDy) ? 'x' : 'y';
    }
    if (axis !== 'x') return;
    e.preventDefault();
    dx = curDx;
    const base = open ? -revealWidth() : 0;
    const next = Math.min(0, Math.max(base + dx, -revealWidth()));
    setX(next, false);
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (axis !== 'x') {
      axis = null;
      return;
    }
    const base = open ? -revealWidth() : 0;
    const current = base + dx;
    if (current < -threshold) openFully(); else close();
    axis = null;
  }

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove, { passive: false });
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onUp);

  const api = {
    close,
    destroy() {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
    },
  };
  itemEl.__swipeActionsAttached = api;
  return api;
}

// Long-press: dispara `onLongPress` após `delay`ms parado — cancela se o
// ponteiro se mover além de `moveTolerance` (evita disparo acidental durante
// um scroll/swipe) ou se soltar antes do tempo. Usado como atalho de toque
// para uma ação que também é alcançável por botão (ex.: abrir o mesmo menu
// "⋯" que o botão de reticências já abre).
export function attachLongPress(el, { onLongPress, delay = 500, moveTolerance = 10 } = {}) {
  let timer = null, startX = 0, startY = 0, firedContextMenu = false;

  function start(e) {
    if (!isPrimaryPointer(e)) return;
    startX = e.clientX;
    startY = e.clientY;
    firedContextMenu = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      firedContextMenu = true;
      onLongPress(e);
    }, delay);
  }

  function move(e) {
    if (timer === null) return;
    if (Math.abs(e.clientX - startX) > moveTolerance || Math.abs(e.clientY - startY) > moveTolerance) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function end() {
    clearTimeout(timer);
    timer = null;
  }

  function onContextMenu(e) {
    if (firedContextMenu) e.preventDefault();
  }

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('contextmenu', onContextMenu);

  return function destroy() {
    end();
    el.removeEventListener('pointerdown', start);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.removeEventListener('pointerleave', end);
    el.removeEventListener('contextmenu', onContextMenu);
  };
}

// Pull-to-refresh: só reage a um arrasto para baixo que começa com o
// container já no topo (scrollTop === 0) — do contrário é scroll normal.
// `isActive` deixa vários containers compartilharem o mesmo elemento de
// scroll (ex.: `.app-content` é único, reaproveitado por todas as páginas)
// sem que o pull de uma página dispare o refresh de outra.
export function attachPullToRefresh(scrollContainer, { onRefresh, isActive = () => true, threshold = 64 } = {}) {
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.textContent = 'Puxe para atualizar';
  scrollContainer.insertBefore(indicator, scrollContainer.firstChild);

  let startY = 0, dragging = false, pulling = 0, refreshing = false;

  function reset(animate) {
    indicator.style.transition = animate ? 'transform .2s ease, opacity .2s ease' : 'none';
    indicator.style.transform = 'translateY(0)';
    indicator.style.opacity = '0';
    pulling = 0;
  }

  function onDown(e) {
    if (!isActive() || refreshing || !isPrimaryPointer(e)) return;
    if (scrollContainer.scrollTop > 0) return;
    dragging = true;
    startY = e.clientY;
  }

  function onMove(e) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (dy <= 0 || scrollContainer.scrollTop > 0) {
      dragging = false;
      reset(true);
      return;
    }
    e.preventDefault();
    pulling = Math.min(dy * 0.5, threshold * 1.5);
    indicator.style.transition = 'none';
    indicator.style.opacity = String(Math.min(pulling / threshold, 1));
    indicator.style.transform = `translateY(${pulling}px)`;
    indicator.textContent = pulling >= threshold ? 'Solte para atualizar' : 'Puxe para atualizar';
  }

  async function onUp() {
    if (!dragging) return;
    dragging = false;
    if (pulling >= threshold && !refreshing) {
      refreshing = true;
      indicator.textContent = 'Atualizando…';
      indicator.style.transition = 'transform .15s ease';
      indicator.style.transform = `translateY(${threshold}px)`;
      try {
        await onRefresh();
      } finally {
        refreshing = false;
        reset(true);
      }
    } else {
      reset(true);
    }
  }

  scrollContainer.addEventListener('pointerdown', onDown);
  scrollContainer.addEventListener('pointermove', onMove, { passive: false });
  scrollContainer.addEventListener('pointerup', onUp);
  scrollContainer.addEventListener('pointercancel', onUp);

  return function destroy() {
    scrollContainer.removeEventListener('pointerdown', onDown);
    scrollContainer.removeEventListener('pointermove', onMove);
    scrollContainer.removeEventListener('pointerup', onUp);
    scrollContainer.removeEventListener('pointercancel', onUp);
    indicator.remove();
  };
}
