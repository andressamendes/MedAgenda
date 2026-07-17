// ── themeService.js — Tema claro/escuro (F10 #2.4) ──────────────────────────
// Única fonte de verdade do tema ativo. "Sistema" (padrão) segue
// prefers-color-scheme e acompanha mudanças em tempo real (sem precisar
// recarregar a página); "Claro"/"Escuro" são escolhas explícitas do usuário,
// persistidas em localStorage, que passam a ignorar o sistema até serem
// trocadas de novo. O tema resolvido (sempre "light" ou "dark", nunca "auto")
// é aplicado como atributo `data-theme` em <html> — todo o CSS de tema mora
// em style.css sob `:root[data-theme="dark"]`, nunca aqui.
//
// initTheme() precisa rodar o quanto antes no bootstrap (ver script.js) para
// minimizar o flash de tema errado no primeiro paint — a CSP do app não
// permite <script> inline (script-src sem 'unsafe-inline'), então não há como
// aplicar o tema antes do primeiro parse do HTML como um script inline faria;
// um module script (sempre deferred) é o mais cedo possível aqui.

const THEME_KEY = "medagenda_theme";
const VALID = new Set(["light", "dark", "auto"]);

let _mediaQuery = null;
let _listeners = [];

function _getStored() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return VALID.has(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function _systemPrefersDark() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function _resolve(theme) {
  return theme === "auto" ? (_systemPrefersDark() ? "dark" : "light") : theme;
}

function _apply(theme) {
  document.documentElement.setAttribute("data-theme", _resolve(theme));
}

/** Tema escolhido pelo usuário — "light" | "dark" | "auto" (nunca lido de outro lugar). */
export function getTheme() {
  return _getStored();
}

/** Troca o tema, persiste a escolha e aplica imediatamente. */
export function setTheme(theme) {
  if (!VALID.has(theme)) return;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage indisponível */ }
  _apply(theme);
  _listeners.forEach(fn => fn(theme));
}

/** Notificado a cada setTheme() bem-sucedido — usado pela UI de configurações. */
export function onThemeChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

/**
 * Aplica o tema salvo (ou "auto" por padrão) assim que o módulo carrega, e
 * passa a acompanhar mudanças do SO em tempo real enquanto a escolha for
 * "auto" — sem isso, alternar o tema do sistema com o app já aberto exigiria
 * recarregar a página para refletir.
 */
export function initTheme() {
  _apply(_getStored());
  if (typeof window.matchMedia === "function") {
    _mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    _mediaQuery.addEventListener("change", () => {
      if (_getStored() === "auto") _apply("auto");
    });
  }
}
