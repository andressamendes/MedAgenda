/**
 * Tests for keyboardService.js — atalhos de teclado essenciais (F11 E20,
 * auditoria #26). eventFormView.js and navigationView.js are mocked; the
 * shortcut logic itself (typing-target guard, chord timing, active-page
 * search lookup) is exercised through the real DOM (index.html).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";

const EVENT_FORM_SPECIFIER  = new URL("../eventFormView.js", import.meta.url).href;
const NAVIGATION_SPECIFIER  = new URL("../navigationView.js", import.meta.url).href;

let openEventFormCalls;
let showPageCalls;

function loadService(t) {
  openEventFormCalls = [];
  showPageCalls = [];
  t.mock.module(EVENT_FORM_SPECIFIER, {
    namedExports: { openEventForm: () => { openEventFormCalls.push(true); } },
  });
  t.mock.module(NAVIGATION_SPECIFIER, {
    namedExports: { showPage: (name) => { showPageCalls.push(name); } },
  });
  return import(`../keyboardService.js?t=${Math.random()}`);
}

function press(key, opts = {}) {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

// F14.1 — "Hoje" é a página visível por padrão na fixture agora (todas as
// outras nascem com `hidden`) — simula estar em "Compromissos" (que tem
// busca) só quando o teste precisa disso.
function switchToPageWithSearch() {
  document.getElementById("page-today").hidden = true;
  document.getElementById("page-appointments").hidden = false;
}

beforeEach(() => installDom());
afterEach(() => uninstallDom());

test("'N' opens the new-event form from any page", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("n");

  assert.strictEqual(openEventFormCalls.length, 1);
});

test("uppercase 'N' (Shift+N) also opens the new-event form", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("N");

  assert.strictEqual(openEventFormCalls.length, 1);
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

test("'G' then 'c'/'s'/'d'/'j' navigates to the matching page", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("g"); press("c");
  press("g"); press("s");
  press("g"); press("d");
  press("g"); press("j");

  assert.deepStrictEqual(showPageCalls, ["appointments", "study-session", "dashboard", "journal"]);
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
  // A própria tecla "g" não deve, sozinha, abrir o formulário nem focar busca.
  assert.strictEqual(openEventFormCalls.length, 0);
  assert.deepStrictEqual(showPageCalls, []);
});

test("no shortcut fires while typing in a text input", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  const input = document.getElementById("f-title");
  input.focus();
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true }));
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));

  assert.strictEqual(openEventFormCalls.length, 0);
});

test("no shortcut fires while typing in a search input itself", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  switchToPageWithSearch();

  const search = document.getElementById("search-appointments");
  search.focus();
  search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true }));

  assert.strictEqual(openEventFormCalls.length, 0);
});

test("Ctrl/Cmd/Alt+key combinations are never intercepted (browser shortcuts stay untouched)", async (t) => {
  const { initKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();

  press("n", { ctrlKey: true });
  press("n", { metaKey: true });
  press("n", { altKey: true });

  assert.strictEqual(openEventFormCalls.length, 0);
});

test("resetKeyboardShortcuts() stops all shortcuts from firing", async (t) => {
  const { initKeyboardShortcuts, resetKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  resetKeyboardShortcuts();

  press("n");

  assert.strictEqual(openEventFormCalls.length, 0);
});

test("calling initKeyboardShortcuts() twice never registers a duplicate listener", async (t) => {
  const { initKeyboardShortcuts, resetKeyboardShortcuts } = await loadService(t);
  initKeyboardShortcuts();
  initKeyboardShortcuts();

  // resetKeyboardShortcuts() só desfaz UM listener — se a segunda chamada
  // tivesse registrado um segundo, ele sobreviveria a este reset.
  resetKeyboardShortcuts();
  press("n");

  assert.strictEqual(openEventFormCalls.length, 0);
});
