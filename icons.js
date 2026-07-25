// ── icons.js — Ícones SVG inline (auditoria UX #33 · Fase 2: família autoral) ──
//
// Substitui os emoji usados como iconografia de produto (nav, estados de
// erro, marcos do Diário) por SVGs simples de traço único. Emoji renderiza
// de forma inconsistente entre sistemas operacionais e tinha glifos quase
// idênticos (📅/🗓) para conceitos diferentes (Semana × Mês); estes ícones
// são desenhados para ficar visualmente distintos entre si.
//
// Assinatura própria (Fase 2), para não ler como Feather/Lucide "de fábrica":
//   1. Traço 1.75 (não 2) — levemente mais fino que o padrão Feather.
//   2. Terminações quadradas (stroke-linecap="square") e junções em esquadro
//      (stroke-linejoin="miter") em vez de round/round — pontas e vértices
//      chanfrados, não arredondados.
//   3. Corte de canto: todo contêiner retangular (calendário, prancheta,
//      cadeado, envelope, cartão de agenda) tem o canto superior direito
//      cortado a 45° em vez de rx arredondado — silhueta reconhecível mesmo
//      isolada, sem depender de cor. Ao desenhar um ícone novo com contêiner
//      retangular, siga essa mesma convenção (chanfro ~15% do lado menor).
//
// Sem width/height fixos no <svg> — cada tela controla o tamanho via CSS
// (".nav-icon svg", ".state-block-icon svg", ".sj-milestone-icon svg" etc.).
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"';

export const iconCalendarWeek = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M3 4H18L21 7V21H3Z"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <rect x="6" y="13" width="12" height="4" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconCalendarMonth = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M3 4H18L21 7V21H3Z"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/>
    <circle cx="8" cy="18" r="1" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="18" r="1" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconClipboard = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
  </svg>`;

export const iconClock = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/>
    <polyline points="12 7 12 12 15.5 14"/>
  </svg>`;

export const iconSparkle = `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/>
  </svg>`;

export const iconBarChart = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <line x1="6" y1="20" x2="6" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="18" y1="20" x2="18" y2="14"/>
  </svg>`;

export const iconHistory = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M3 12a9 9 0 1 0 3-6.7"/>
    <polyline points="3 4 3 9 8 9"/>
  </svg>`;

export const iconBookOpen = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M2 4h7a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/>
    <path d="M22 4h-7a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h8z"/>
  </svg>`;

export const iconLayers = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>`;

export const iconTag = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconMoreHorizontal = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconLock = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M5 11H16L19 14V21H5Z"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </svg>`;

export const iconWifiOff = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <line x1="2" y1="2" x2="22" y2="22"/>
    <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
    <path d="M5 12.5a10 10 0 0 1 3-2.1"/>
    <path d="M19 12.5a10 10 0 0 0-2.7-2"/>
    <path d="M2 8.8a15 15 0 0 1 4.2-2.7"/>
    <path d="M22 8.8a15 15 0 0 0-8-3.6"/>
    <line x1="12" y1="20" x2="12.01" y2="20"/>
  </svg>`;

export const iconAlertTriangle = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`;

export const iconLightbulb = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>
  </svg>`;

export const iconPin = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M12 2a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6z"/>
    <circle cx="12" cy="8" r="2"/>
  </svg>`;

export const iconTarget = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="5"/>
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconRepeat = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M17 2.1 21 6l-4 3.9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <path d="M7 21.9 3 18l4-3.9"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`;

export const iconCheck = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <polyline points="4 12.5 9.5 18 20 6"/>
  </svg>`;

// V5.3 — usado nas conquistas de "Sessões concluídas" (achievementService.js
// icon: "check-circle"), distinto do iconCheck acima (sem o círculo).
export const iconCheckCircle = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/>
    <polyline points="8 12.5 11 15.5 16 9.5"/>
  </svg>`;

// V5.3 — usado na conquista de "Constância" (achievementService.js icon:
// "flame").
export const iconFlame = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M12 2c1 3-2 4.5-2 7.5a4 4 0 0 0 8 0c0-1-.3-2-1-3 1.5 1 3 3 3 6a6 6 0 0 1-12 0c0-4 2-5.5 4-10.5z"/>
  </svg>`;

export const iconInfo = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="11" x2="12" y2="16.5"/>
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconX = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">
    <line x1="6" y1="6" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="6" y2="18"/>
  </svg>`;

export const iconChevronDown = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;

export const iconDatabase = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>`;

// ── Ilustrações de linha — estados vazios (V5.19) ────────────────────────
//
// Mesmo traço único das demais (STROKE), viewBox maior (120x90) para
// comportar uma pequena composição própria em vez de um ícone genérico só
// ampliado — usadas nos três estados vazios de maior tráfego (Sessão,
// Diário, Agenda; ver emptyStateView.js). Sem width/height fixos, mesmo
// motivo dos ícones acima: o tamanho é decidido por CSS em cada tela.

export const illustrationEmptySession = `
  <svg viewBox="0 0 120 90" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="50" cy="45" r="27"/>
    <line x1="50" y1="45" x2="50" y2="28"/>
    <line x1="50" y1="45" x2="63" y2="52"/>
    <circle cx="50" cy="45" r="2" fill="currentColor" stroke="none"/>
    <circle cx="91" cy="66" r="13"/>
    <polygon points="87 60 87 72 97 66" fill="currentColor" stroke="none"/>
    <line x1="12" y1="80" x2="30" y2="80" stroke-dasharray="2 6"/>
  </svg>`;

export const illustrationEmptyJournal = `
  <svg viewBox="0 0 120 90" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M12 22h34a8 8 0 0 1 8 8v38a6 6 0 0 0-6-6H12z"/>
    <path d="M108 22H74a8 8 0 0 0-8 8v38a6 6 0 0 1 6-6h36z"/>
    <line x1="20" y1="36" x2="42" y2="36" stroke-dasharray="2 5"/>
    <line x1="20" y1="46" x2="42" y2="46" stroke-dasharray="2 5"/>
    <line x1="20" y1="56" x2="38" y2="56" stroke-dasharray="2 5"/>
    <line x1="78" y1="36" x2="100" y2="36" stroke-dasharray="2 5"/>
    <line x1="78" y1="46" x2="100" y2="46" stroke-dasharray="2 5"/>
    <line x1="78" y1="56" x2="96" y2="56" stroke-dasharray="2 5"/>
    <path d="M95 12l6 6-16 16-7 1 1-7z"/>
  </svg>`;

export const illustrationEmptyAgenda = `
  <svg viewBox="0 0 120 90" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M18 18H88L102 32V78H18Z"/>
    <line x1="18" y1="36" x2="102" y2="36"/>
    <line x1="40" y1="10" x2="40" y2="24"/>
    <line x1="80" y1="10" x2="80" y2="24"/>
    <line x1="46" y1="56" x2="74" y2="56" stroke-dasharray="2 6"/>
    <circle cx="60" cy="56" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`;

// ── Ícones estáticos do markup de index.html (Fase I1) ───────────────────
//
// Catálogo estendido para cobrir os ícones que viviam como <svg> inline
// no HTML (header, navegação, modais, painel de IA etc.) — ver
// injectStaticIcons() abaixo, chamado uma vez no boot (script.js) para
// preencher os placeholders `[data-icon]` deixados no lugar deles.

export const iconMenu = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true" focusable="false">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>`;

export const iconBrandMark = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">
    <path d="M4.5 19 12 4.5 19.5 19"/>
    <path d="M7.7 14h8.6"/>
  </svg>`;

export const iconMail = `
  <svg viewBox="0 0 24 24" ${STROKE} focusable="false">
    <path d="M3 5H18L21 8V19H3Z"/>
    <path d="m3 7 9 6 9-6"/>
  </svg>`;

export const iconSun = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4.5"/>
    <line x1="12" y1="2.5" x2="12" y2="4.5"/>
    <line x1="12" y1="19.5" x2="12" y2="21.5"/>
    <line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/>
    <line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/>
    <line x1="2.5" y1="12" x2="4.5" y2="12"/>
    <line x1="19.5" y1="12" x2="21.5" y2="12"/>
    <line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/>
    <line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>
  </svg>`;

export const iconTrendingUp = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <polyline points="3 17 9 11 13 15 21 6"/>
    <polyline points="15 6 21 6 21 12"/>
  </svg>`;

export const iconMaximize = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
    <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
    <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
  </svg>`;

export const iconSearch = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7"/>
    <line x1="21" y1="21" x2="16.2" y2="16.2"/>
  </svg>`;

export const iconSlidersHorizontal = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
    <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/>
    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconArrowLeft = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>`;

// Nome (kebab-case, usado em data-icon="...") → markup. Cobre só os ícones
// referenciados por placeholders estáticos em index.html (ver
// injectStaticIcons); ícones usados exclusivamente via import direto nos
// módulos de view (a maioria) não precisam de entrada aqui.
const STATIC_ICON_REGISTRY = {
  "menu": iconMenu,
  "brand-mark": iconBrandMark,
  "mail": iconMail,
  "sun": iconSun,
  "calendar-week": iconCalendarWeek,
  "clock": iconClock,
  "sparkle": iconSparkle,
  "book-open": iconBookOpen,
  "trending-up": iconTrendingUp,
  "layers": iconLayers,
  "tag": iconTag,
  "chevron-down": iconChevronDown,
  "x": iconX,
  "maximize": iconMaximize,
  "check": iconCheck,
  "repeat": iconRepeat,
  "check-circle": iconCheckCircle,
  "alert-triangle": iconAlertTriangle,
  "search": iconSearch,
  "sliders-horizontal": iconSlidersHorizontal,
  "more-horizontal": iconMoreHorizontal,
  "clipboard": iconClipboard,
  "history": iconHistory,
  "arrow-left": iconArrowLeft,
  "illustration-empty-session": illustrationEmptySession,
};

// Preenche todo elemento `[data-icon]` sob `root` com o SVG correspondente
// do catálogo acima — chamado uma vez no boot (script.js), antes de
// qualquer outra inicialização que leia esses elementos.
export function injectStaticIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const markup = STATIC_ICON_REGISTRY[el.getAttribute("data-icon")];
    // insertAdjacentHTML (não innerHTML) preserva filhos que já existam no
    // elemento — ex.: o badge de contagem dentro de #sj-btn-open-panel.
    if (markup) el.insertAdjacentHTML("afterbegin", markup);
  });
}
