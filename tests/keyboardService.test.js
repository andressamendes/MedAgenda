/**
 * Tests for keyboardService.js — atalhos de teclado essenciais (F11 E20,
 * auditoria #26). navigationView.js is mocked; the shortcut logic itself
 * (typing-target guard, chord timing, active-page search lookup) is
 * exercised through the real DOM (index.html). F15.6 — "N" passou a
 * delegar ao clique de #btn-new-event (que abre o QuickAdd), então os
 * testes espionam esse clique em vez de mockar eventFormView.js.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";

const NAVIGATION_SPECIFIER  = new URL("../navigationView.js", import.meta.url).href;

let newEventClicks;
let showPageCalls;

function loadService(t) {
  newEventClicks = [];
  showPageCalls = [];
  document.getElementById("btn-new-event").addEventListener("click", () => { newEventClicks.push(true); });
  t.mock.module(NAVIGATION_SPECIFIER, {
    namedExports: { showPage: (name) => { showPageCalls.push(name); } },
  });
  return import(`../keyboardService.js?t=${Math.random()}`);
}

function press(key, opts = {}) {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

// F14.1 — "Hoje" é a página visível por padrão na fixture agora (todas as
// outras nascem com `hidden`) — simula estar na Agenda, aba "Lista" (que tem
// busca; antes a página própria "Compromissos", ver F14.7), só quando o
// teste precisa disso.
function switchToPageWithSearch() {
  document.getElementById("page-today").hidden = true;
  document.getElementById("page-agenda").hidden = false;
  document.getElementById("appointments-list-container").hidden = false;
}

beforeEach(() => installDom());
afterEach(() => uninstallDom());

test("'N' clicks '+ Novo compromisso' (the button it is advertised on) from any page", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("n");

  assert.strictEqual(newEventClicks.length, 1);
});

test("uppercase 'N' (Shift+N) also triggers '+ Novo compromisso'", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("N");

  assert.strictEqual(newEventClicks.length, 1);
});

test("'/' focuses the search input when the current page has one", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  switchToPageWithSearch();

  press("/");

  assert.strictEqual(document.activeElement, document.getElementById("search-appointments"));
});

test("'/' does nothing when the current page has no search input", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  // Página padrão da fixture (Hoje, F14.1) não tem busca.

  assert.doesNotThrow(() => press("/"));
});

test("'G' then 'a' navigates to Agenda", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g");
  press("a");

  assert.deepStrictEqual(showPageCalls, ["agenda"]);
});

test("'G' then 's'/'j' navigates to the matching page", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g"); press("s");
  press("g"); press("j");

  assert.deepStrictEqual(showPageCalls, ["study-session", "journal"]);
});

// F18.1 — "Progresso" tinha página pronta mas nenhum destino de navegação,
// nem atalho, apontando pra ela.
test("'G' then 'p' navigates to Progresso", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g"); press("p");

  assert.deepStrictEqual(showPageCalls, ["progress"]);
});

// F14.7 — "c" (Compromissos) foi removido: a página virou a aba "Lista"
// dentro de "Agenda" (já alcançável por "g a"), não é mais um destino
// próprio de navegação.
test("'G' then 'c' navigates nowhere: 'Compromissos' is no longer its own destination", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g"); press("c");

  assert.deepStrictEqual(showPageCalls, []);
});

// F14.1 — "Hoje" é a nova porta de entrada; ganha o mesmo atalho "go to" das
// demais páginas.
test("'G' then 'h' navigates to Hoje", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g"); press("h");

  assert.deepStrictEqual(showPageCalls, ["today"]);
});

test("'G' followed by an unmapped key navigates nowhere", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g");
  press("z");

  assert.deepStrictEqual(showPageCalls, []);
});

test("'G' alone (no second key) never triggers 'N' or '/' as a leftover chord", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g");
  // A própria tecla "g" não deve, sozinha, acionar "+ Novo" nem focar busca.
  assert.strictEqual(newEventClicks.length, 0);
  assert.deepStrictEqual(showPageCalls, []);
});

test("no shortcut fires while typing in a text input", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  const input = document.getElementById("f-title");
  input.focus();
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true }));
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));

  assert.strictEqual(newEventClicks.length, 0);
});

test("no shortcut fires while typing in a search input itself", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  switchToPageWithSearch();

  const search = document.getElementById("search-appointments");
  search.focus();
  search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true }));

  assert.strictEqual(newEventClicks.length, 0);
});

test("Ctrl/Cmd/Alt+key combinations are never intercepted (browser shortcuts stay untouched)", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("n", { ctrlKey: true });
  press("n", { metaKey: true });
  press("n", { altKey: true });

  assert.strictEqual(newEventClicks.length, 0);
});

test("resetKeyboardShortcuts() stops all shortcuts from firing", async (t) => {
  const { initKeyboardShortcuts, resetKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  resetKeyboardShortcuts();

  press("n");

  assert.strictEqual(newEventClicks.length, 0);
});

test("calling initKeyboardShortcuts() twice never registers a duplicate listener", async (t) => {
  const { initKeyboardShortcuts, resetKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  initKeyboardShortcuts();

  // resetKeyboardShortcuts() só desfaz UM listener — se a segunda chamada
  // tivesse registrado um segundo, ele sobreviveria a este reset.
  resetKeyboardShortcuts();
  press("n");

  assert.strictEqual(newEventClicks.length, 0);
});
