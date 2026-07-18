// ── icons.js — Ícones SVG inline (auditoria UX #33) ─────────────────────────
//
// Substitui os emoji usados como iconografia de produto (nav, estados de
// erro, marcos do Diário) por SVGs simples de traço único, no mesmo estilo
// já usado nos ícones do cabeçalho (index.html) — viewBox 24x24,
// stroke="currentColor", sem preenchimento fixo. Emoji renderiza de forma
// inconsistente entre sistemas operacionais e tinha glifos quase idênticos
// (📅/🗓) para conceitos diferentes (Semana × Mês); estes ícones são
// desenhados para ficar visualmente distintos entre si.
//
// Sem width/height fixos no <svg> — cada tela controla o tamanho via CSS
// (".nav-icon svg", ".state-block-icon svg", ".sj-milestone-icon svg" etc.).
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const iconCalendarWeek = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="17" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <rect x="6" y="13" width="12" height="4" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconCalendarMonth = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="17" rx="2"/>
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
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
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
    <rect x="5" y="11" width="14" height="10" rx="2"/>
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

export const iconInfo = `
  <svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="11" x2="12" y2="16.5"/>
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>
  </svg>`;

export const iconX = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
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
