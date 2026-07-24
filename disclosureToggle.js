// ── disclosureToggle.js — markup compartilhado de botões "Mostrar/Ocultar" ──
//
// Todo botão `.disclosure-toggle` (Ver números de hoje, Filtros avançados,
// histórico do compromisso, plano da semana etc.) é o mesmo par
// rótulo+chevron rotativo; antes cada tela desenhava o próprio par (7
// lugares — 6 estáticos em index.html, 1 gerado em weekView.js — mais uma
// variante só-chevron em studyJournalView.js). Esta função é o único lugar
// que monta esse markup; cada tela só passa o rótulo.
import { iconChevronDown } from "./icons.js";

export function disclosureToggleContent(label) {
  const chevron = `<span class="disclosure-chevron" aria-hidden="true">${iconChevronDown}</span>`;
  return label ? `<span class="disclosure-label">${label}</span>${chevron}` : chevron;
}

// Preenche os botões estáticos de index.html (que só trazem
// data-disclosure-label, sem conteúdo) — chamado uma vez no boot, junto de
// injectStaticIcons().
export function initStaticDisclosureToggles(root = document) {
  root.querySelectorAll("[data-disclosure-label]").forEach((btn) => {
    btn.innerHTML = disclosureToggleContent(btn.getAttribute("data-disclosure-label"));
  });
}
