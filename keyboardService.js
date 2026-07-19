// ── keyboardService.js — Atalhos de teclado essenciais (F11 E20) ────────────
//
// Auditoria #26: paridade mínima com benchmarks (Gmail, Linear, GitHub) —
// "N" para novo compromisso, "/" para focar a busca da tela atual, "G" + uma
// segunda tecla para navegar direto a uma página (mesmo padrão "go to" desses
// produtos). Nenhuma tecla capturada quando o foco está num campo de texto
// (input/textarea/select/contenteditable) — digitar "n" ou "/" num campo
// precisa continuar sendo só um caractere digitado, nunca um atalho.

import { openEventForm } from "./eventFormView.js";
import { showPage } from "./navigationView.js";

// Mesmas seis páginas de navigationView.js/APP_PAGES — "G" seguido da
// inicial de cada uma (h=Hoje, a=Agenda, c=Compromissos, s=Sessão,
// d=Dashboard, j=Diário). showPage() já cai em 'today' para qualquer nome
// inválido, então nenhuma validação extra é necessária aqui.
const GO_TO_PAGE = {
  h: "today",
  a: "agenda",
  c: "appointments",
  s: "study-session",
  d: "dashboard",
  j: "journal",
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

function _activeSearchInput() {
  const page = document.querySelector(".app-page:not([hidden])");
  return page?.querySelector('input[type="search"]') ?? null;
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
    openEventForm();
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
