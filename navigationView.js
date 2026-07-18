// ── navigationView.js — Navegação entre páginas, sidebar e bottom nav ────────
import { revealWithAnimation, revealPageWithAnimation } from "./transitionUtils.js";

// F10 #4.2 — 'history' removido: a página própria (#page-history) foi
// absorvida como abas dentro de 'journal' (ver studyJournalView.js/
// activityHistoryView.js). showPage('history') agora cai no fallback
// 'agenda' (ver abaixo), já que "history" deixou de ser um destino válido.
// F10 #4.1 — 'calendar' removido pelo mesmo motivo: a página própria
// (#page-calendar, "Mês") foi absorvida como aba dentro de 'agenda' (ver
// #agenda-view-tabs em script.js/_setAgendaView). showPage('calendar') cai
// no mesmo fallback 'agenda'.
const APP_PAGES = ['agenda', 'appointments', 'study-session', 'journal', 'dashboard'];
const LAST_PAGE_KEY     = 'medagenda_last_page';
const SIDEBAR_STATE_KEY = 'medagenda_sidebar_collapsed';

// F11 E8 — document.title fixo em "Anoti" tornava histórico/abas/alt-tab
// inúteis para uma SPA com várias páginas (auditoria #15). Rótulos abaixo
// espelham os mesmos nomes canônicos usados na sidebar/bottom nav.
const PAGE_TITLES = {
  agenda:          'Agenda',
  appointments:    'Compromissos',
  'study-session': 'Sessão',
  journal:         'Diário',
  dashboard:       'Dashboard',
};

let appSidebar     = null;
let sidebarOverlay = null;

export function initNavigation() {
  appSidebar     = document.getElementById('app-sidebar');
  sidebarOverlay = document.getElementById('sidebar-overlay');

  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
    if (window.innerWidth < 768) {
      const isOpen = appSidebar?.classList.contains('sidebar-open');
      if (isOpen) closeSidebar(); else openSidebar();
    } else {
      appSidebar?.classList.toggle('sidebar-collapsed');
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, appSidebar?.classList.contains('sidebar-collapsed') ? '1' : '0');
      } catch { /* storage unavailable */ }
    }
  });

  sidebarOverlay?.addEventListener('click', closeSidebar);

  const userMenuBtn      = document.getElementById('btn-user-menu');
  const userMenuDropdown = document.getElementById('user-menu-dropdown');

  userMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !userMenuDropdown.hidden;
    userMenuDropdown.hidden = open;
    userMenuBtn.setAttribute('aria-expanded', String(!open));
    if (!open) revealWithAnimation(userMenuDropdown);
  });

  document.addEventListener('click', () => {
    if (userMenuDropdown && !userMenuDropdown.hidden) {
      userMenuDropdown.hidden = true;
      userMenuBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('bottom-nav-more')?.addEventListener('click', () => {
    openSidebar();
  });
}

export function restoreSidebarState() {
  if (window.innerWidth >= 768) {
    try {
      const collapsed = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (collapsed === '1') appSidebar?.classList.add('sidebar-collapsed');
      else if (collapsed === '0') appSidebar?.classList.remove('sidebar-collapsed');
    } catch { /* storage unavailable */ }
  }
}

export function showPage(name) {
  if (!APP_PAGES.includes(name)) name = 'agenda';

  APP_PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (!el) return;
    const isTarget = p === name;
    // F11 E9 — só anima quando a página realmente estava escondida e passa a
    // aparecer: showPage(name) chamado de novo para a mesma página ativa
    // (ex.: re-render) não deve reiniciar o fade.
    const wasHidden = el.hidden;
    el.hidden = !isTarget;
    if (isTarget && wasHidden) revealPageWithAnimation(el);
  });
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('nav-item--active', btn.dataset.page === name);
    btn.dataset.page === name
      ? btn.setAttribute('aria-current', 'page')
      : btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('bottom-nav-item--active', btn.dataset.page === name);
    btn.dataset.page === name
      ? btn.setAttribute('aria-current', 'page')
      : btn.removeAttribute('aria-current');
  });
  closeSidebar();

  document.title = `${PAGE_TITLES[name] || PAGE_TITLES.agenda} · Anoti`;

  try { localStorage.setItem(LAST_PAGE_KEY, name); } catch { /* storage unavailable */ }
}

export function restoreLastPage() {
  try {
    const saved = localStorage.getItem(LAST_PAGE_KEY);
    showPage(saved || 'agenda');
  } catch {
    showPage('agenda');
  }
}

export function openSidebar() {
  appSidebar?.classList.add('sidebar-open');
  if (sidebarOverlay) sidebarOverlay.hidden = false;
}

export function closeSidebar() {
  appSidebar?.classList.remove('sidebar-open');
  if (sidebarOverlay) sidebarOverlay.hidden = true;
}
