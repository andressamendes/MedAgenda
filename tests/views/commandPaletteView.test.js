/**
 * Tests for commandPaletteView.js — Ctrl/Cmd+K command palette (V5.10).
 * Exercises the real markup (index.html) end to end: opening, fuzzy
 * filtering, keyboard navigation and each command's delegated action.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

let palette;

beforeEach(async () => {
  installDom();
  localStorage.clear();
  palette = await import(`../../commandPaletteView.js?t=${Math.random()}`);
});

afterEach(() => {
  uninstallDom();
});

function input() {
  return document.getElementById("cp-input");
}

function overlay() {
  return document.querySelector(".command-palette-overlay");
}

function items() {
  return Array.from(document.querySelectorAll("#cp-list .cp-item"));
}

test("openCommandPalette() builds the overlay lazily and shows it", () => {
  assert.strictEqual(overlay(), null);

  palette.openCommandPalette();

  assert.notStrictEqual(overlay(), null);
  assert.strictEqual(overlay().hidden, false);
});

test("openCommandPalette() focuses the search input and lists every command with an empty query", () => {
  palette.openCommandPalette();

  assert.strictEqual(document.activeElement, input());
  assert.strictEqual(input().value, "");
  // 5 páginas + 2 ações rápidas + 2 buscas = 9 comandos.
  assert.strictEqual(items().length, 9);
});

test("closeCommandPalette() hides the overlay and restores focus", () => {
  const trigger = document.getElementById("btn-new-event");
  trigger.focus();

  palette.openCommandPalette();
  palette.closeCommandPalette();

  assert.strictEqual(overlay().hidden, true);
  assert.strictEqual(document.activeElement, trigger);
});

test("Escape closes the palette (via modalController's shared Escape handling)", () => {
  palette.openCommandPalette();

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

  assert.strictEqual(overlay().hidden, true);
});

test("typing filters the list down to matching commands", () => {
  palette.openCommandPalette();

  input().value = "diario";
  input().dispatchEvent(new window.Event("input", { bubbles: true }));

  const labels = items().map(li => li.querySelector(".cp-item-label").textContent);
  assert.ok(labels.includes("Ir para Diário"));
  assert.ok(labels.includes("Buscar no Diário"));
  assert.strictEqual(labels.length, 2);
});

test("fuzzy match tolerates missing accents/typos via subsequence matching", () => {
  palette.openCommandPalette();

  input().value = "sso"; // subsequência de "compromisso"
  input().dispatchEvent(new window.Event("input", { bubbles: true }));

  const labels = items().map(li => li.querySelector(".cp-item-label").textContent);
  assert.ok(labels.includes("Novo compromisso"));
});

test("a query matching nothing shows the empty state", () => {
  palette.openCommandPalette();

  input().value = "zzzzzz";
  input().dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.strictEqual(items().length, 0);
  assert.strictEqual(document.getElementById("cp-empty").hidden, false);
});

test("ArrowDown/ArrowUp moves the active selection and wraps around", () => {
  palette.openCommandPalette();

  const activeLabel = () => document.querySelector(".cp-item--active .cp-item-label").textContent;
  assert.strictEqual(activeLabel(), "Ir para Hoje");

  input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.strictEqual(activeLabel(), "Ir para Agenda");

  input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
  input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
  assert.strictEqual(activeLabel(), "Buscar compromissos", "seta para cima na primeira posição deve dar a volta para o último item");
});

test("Enter runs the active command and closes the palette", () => {
  palette.openCommandPalette();

  document.getElementById("page-agenda").hidden = true; // garante que a navegação realmente muda algo
  input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })); // "Ir para Agenda"
  input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

  assert.strictEqual(overlay().hidden, true);
  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
});

test("clicking a command item runs its action and closes the palette", () => {
  palette.openCommandPalette();

  const journalItem = items().find(li => li.querySelector(".cp-item-label").textContent === "Ir para Diário");
  journalItem.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(overlay().hidden, true);
  assert.strictEqual(document.getElementById("page-journal").hidden, false);
});

test("'Novo compromisso' delegates to the same #btn-new-event click as the 'N' shortcut", () => {
  let clicks = 0;
  document.getElementById("btn-new-event").addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Novo compromisso");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(clicks, 1);
});

// studyJournalView.js/script.js (que de fato revelam #ss-start-modal,
// #sj-search-wrap e #appointments-list-container ao clicar) não são
// importados neste teste isolado — por isso cada caso abaixo verifica só o
// contrato do próprio commandPaletteView.js: que página ele mostra e em
// qual botão/campo já existente ele delega, sem assumir o comportamento
// interno de outro módulo.

test("'Iniciar sessão de estudo' navigates to Sessão and clicks the standalone-start button when no session is running", () => {
  let clicks = 0;
  document.getElementById("ss-btn-start-standalone").addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Iniciar sessão de estudo");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-study-session").hidden, false);
  assert.strictEqual(clicks, 1);
});

test("'Iniciar sessão de estudo' only navigates (no click) when a session is already running", () => {
  document.getElementById("ss-empty").hidden = true; // simula sessão ativa
  let clicks = 0;
  document.getElementById("ss-btn-start-standalone").addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Iniciar sessão de estudo");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-study-session").hidden, false);
  assert.strictEqual(clicks, 0);
});

test("'Buscar no Diário' navigates to Diário and clicks the search-reveal toggle when the search field is still collapsed", () => {
  let clicks = 0;
  document.getElementById("sj-search-toggle").addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Buscar no Diário");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-journal").hidden, false);
  assert.strictEqual(clicks, 1);
});

test("'Buscar no Diário' focuses the search field directly when it is already expanded", () => {
  document.getElementById("sj-search-wrap").hidden = false; // simula busca já revelada
  let clicks = 0;
  document.getElementById("sj-search-toggle").addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Buscar no Diário");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(clicks, 0, "não deve reclicar no toggle (fecharia a busca já aberta)");
  assert.strictEqual(document.activeElement, document.getElementById("sj-filter-search"));
});

test("'Buscar compromissos' navigates to Agenda, clicks the Lista tab and focuses the search field", () => {
  let clicks = 0;
  document.querySelector('#agenda-view-tabs .tab[data-view="list"]').addEventListener("click", () => { clicks++; });

  palette.openCommandPalette();
  const item = items().find(li => li.querySelector(".cp-item-label").textContent === "Buscar compromissos");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
  assert.strictEqual(clicks, 1);
  assert.strictEqual(document.activeElement, document.getElementById("search-appointments"));
});

test("Tab is trapped inside the palette (focus never escapes to the page behind it)", () => {
  palette.openCommandPalette();

  const focusables = document.querySelectorAll(
    '.command-palette-overlay a[href], .command-palette-overlay button:not([disabled]), ' +
    '.command-palette-overlay input:not([disabled]), .command-palette-overlay [tabindex]:not([tabindex="-1"])'
  );
  const last = focusables[focusables.length - 1];
  last.focus();

  last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

  assert.strictEqual(document.activeElement, input());
});
