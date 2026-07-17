// ── skeletonView.js — Skeleton de carregamento unificado (F10 #1.2) ────────
//
// `.skeleton`/`.skeleton-text` já existiam em style.css como fundação para
// substituir o texto solto "Carregando…" por um placeholder visual, mas
// nenhuma tela chegava a usá-los — cada lista/grid só trocava o conteúdo por
// um parágrafo de texto. Este módulo é o único ponto que monta esse
// placeholder, para que toda tela de listagem/grid use exatamente a mesma
// forma (nunca uma variação própria).
//
// O texto "Carregando…" continua presente (via .sr-only) para quem usa
// leitor de tela — a mudança é só visual, nunca de conteúdo semântico.

const LOADING_TEXT = "Carregando…";

/**
 * Placeholder para grids de cards de estatística (Dashboard, Insights) —
 * mesma grade (`.dashboard-cards`), cada item um bloco cinza do tamanho de
 * um `.dashboard-card` real.
 */
export function skeletonCardsMarkup(count = 4) {
  const cards = Array
    .from({ length: count }, () => '<div class="skeleton skeleton-card" aria-hidden="true"></div>')
    .join("");
  return `${cards}<span class="sr-only">${LOADING_TEXT}</span>`;
}

/**
 * Placeholder para listas de itens (Compromissos, Histórico, Diário) — uma
 * linha cinza por item esperado, dentro do mesmo container `<p>`/`<div>` que
 * já exibia o texto de carregamento.
 */
export function skeletonRowsMarkup(count = 3) {
  const rows = Array
    .from({ length: count }, () => '<span class="skeleton skeleton-row" aria-hidden="true"></span>')
    .join("");
  return `${rows}<span class="sr-only">${LOADING_TEXT}</span>`;
}
