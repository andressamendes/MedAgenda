// ── keyboardService.js — Atalhos de teclado essenciais (F11 E20) ────────────
//
// Auditoria #26: paridade mínima com benchmarks (Gmail, Linear, GitHub) —
// "N" para novo compromisso, "/" para focar a busca da tela atual, "G" + uma
// segunda tecla para navegar direto a uma página (mesmo padrão "go to" desses
// produtos). Nenhuma tecla capturada quando o foco está num campo de texto
// (input/textarea/select/contenteditable) — digitar "n" ou "/" num campo
// precisa continuar sendo só um caractere digitado, nunca um atalho.

import { showPage } from "./navigationView.js";

// Mesmas páginas de navigationView.js/APP_PAGES — "G" seguido da inicial de
// cada uma (h=Hoje, a=Agenda, s=Sessão, j=Diário, p=Progresso). showPage() já
// cai em 'today' para qualquer nome inválido, então nenhuma validação extra é
// necessária aqui. F14.5 removeu "d" (Dashboard): a página deixou de existir,
// sua seção foi absorvida por "Hoje". F14.7 removeu "c" (Compromissos): a
// página virou a aba "Lista" dentro de "Agenda" (já alcançável por "g a"),
// não um destino próprio. F18.1 adicionou "p" (Progresso): a página já
// existia mas nenhum atalho apontava pra ela.
const GO_TO_PAGE = {
  h: "today",
  a: "agenda",
  s: "study-session",
  j: "journal",
  p: "progress",
};

// Prazo para completar o chord "G" + tecla — depois disso, "G" sozinho não
// significa mais nada (evita que um "g" digitado bem antes de outra tecla,
// sem relação, dispare uma navegação inesperada).
const CHORD_TIMEOUT_MS = 1200;

let _bound = false;
let _pendingGo = false;
let _chordTimer = null;

function _isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

// F14.7 — a Agenda passou a ter uma busca própria (aba "Lista", antes a
// página própria "Compromissos"), que convive escondida no DOM quando
// Semana/Mês está ativa (só o contêiner da aba tem `hidden`, não a página
// inteira) — por isso não basta achar o primeiro input[type="search"] da
// página visível, é preciso pular qualquer um cujo ancestral (até a própria
// página, exclusive) esteja marcado `hidden`.
function _activeSearchInput() {
  const page = document.querySelector(".app-page:not([hidden])");
  if (!page) return null;
  for (const input of page.querySelectorAll('input[type="search"]')) {
    let node = input;
    let hiddenWithinPage = false;
    while (node && node !== page) {
      if (node.hidden) { hiddenWithinPage = true; break; }
      node = node.parentElement;
    }
    if (!hiddenWithinPage) return input;
  }
  return null;
}

function _clearPendingGo() {
  _pendingGo = false;
  if (_chordTimer) {
    clearTimeout(_chordTimer);
    _chordTimer = null;
  }
}

function _handleKeydown(e) {
  // Nunca intercepta atalhos do navegador/SO (Ctrl/Cmd/Alt+tecla).
  if (e.ctrlKey || e.metaKey || e.altKey) { _clearPendingGo(); return; }
  if (_isTypingTarget(e.target)) { _clearPendingGo(); return; }

  if (_pendingGo) {
    const dest = GO_TO_PAGE[e.key.toLowerCase()];
    _clearPendingGo();
    if (dest) {
      e.preventDefault();
      showPage(dest);
    }
    return;
  }

  if (e.key === "g" || e.key === "G") {
    _pendingGo = true;
    _chordTimer = setTimeout(_clearPendingGo, CHORD_TIMEOUT_MS);
    _chordTimer.unref?.();
    return;
  }

  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    // F15.6 — "N" é o atalho anunciado no próprio "+ Novo compromisso"
    // (title="Atalho: N"); delegar ao clique garante que teclado e botão
    // abram sempre a mesma coisa (hoje, o QuickAdd).
    document.getElementById("btn-new-event")?.click();
    return;
  }

  if (e.key === "/") {
    const input = _activeSearchInput();
    if (input) {
      e.preventDefault();
      input.focus();
    }
  }
}

export function initKeyboardShortcuts() {
  if (_bound) return;
  _bound = true;
  document.addEventListener("keydown", _handleKeydown);
}

/** Chamado no logout (ver script.js) — evita listener duplicado num relogin. */
export function resetKeyboardShortcuts() {
  document.removeEventListener("keydown", _handleKeydown);
  _bound = false;
  _clearPendingGo();
}
