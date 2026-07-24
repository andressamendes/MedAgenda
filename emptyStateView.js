// ── emptyStateView.js — bloco de estado vazio ilustrado (V5.19) ────────────
//
// Não é stateView.js: aquele módulo é exclusivo de erro (cor fixa em
// --color-danger, ação de retry/reautenticação). Este é para "não há nada
// aqui ainda" — Sessão sem sessão ativa, Diário sem sessões, Agenda sem
// compromissos — os três estados vazios de maior tráfego, cada um com sua
// própria ilustração de linha (icons.js) em vez do ícone genérico de
// 24-40px reaproveitado em .state-block.
export function emptyIllustrationMarkup({ illustration, title, desc }) {
  return `
    <span class="empty-illustration-icon" aria-hidden="true">${illustration}</span>
    <strong class="empty-illustration-title">${title}</strong>
    <span class="empty-illustration-desc">${desc}</span>
  `;
}
