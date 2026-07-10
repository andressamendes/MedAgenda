/**
 * Tests for assistantView.js — Assistente Inteligente local (análise de
 * eventos). analyzeEvents/computeStats are exercised for real (pure
 * functions, already covered by tests/smartAssistant.test.js and
 * tests/analytics.test.js): these tests only check rendering and the
 * init/reset lifecycle against the real DOM (index.html).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

function loadView() {
  return import(`../../assistantView.js?t=${Math.random()}`);
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

const EVENTS = [
  { id: "e1", title: "Prova de Anatomia", category: "Anatomia", event_date: "2026-07-15", start_time: "10:00:00", color: "#3b82f6" },
];

test("renderAssistant shows cards built from the given events", async () => {
  const { initAssistantView, renderAssistant } = await loadView();
  initAssistantView();
  renderAssistant(EVENTS);

  assert.strictEqual(document.getElementById("assistant-section").hidden, false);
  assert.match(document.getElementById("assistant-body").textContent, /Prova de Anatomia/);
});

test("resetAssistant() clears the rendered cards, the cached event list and hides the section (no data survives logout)", async () => {
  const { initAssistantView, renderAssistant, resetAssistant } = await loadView();
  initAssistantView();
  renderAssistant(EVENTS);

  // Sanity: dados do usuário estão renderizados antes do logout.
  assert.match(document.getElementById("assistant-body").textContent, /Prova de Anatomia/);

  resetAssistant();

  // Simetria A1.3: nenhum dado do usuário anterior pode sobreviver no DOM
  // após o logout, e a lista de eventos em cache (_lastEvents) não pode
  // vazar para a próxima sessão via "Mostrar Assistente".
  assert.strictEqual(document.getElementById("assistant-body").innerHTML, "", "logout must leave no rendered data behind");
  assert.strictEqual(document.getElementById("assistant-section").hidden, true);
  assert.strictEqual(document.getElementById("btn-show-assistant").hidden, true);
});

test("resetAssistant() prevents btn-show-assistant from re-revealing the previous user's cards", async () => {
  const { initAssistantView, renderAssistant, resetAssistant } = await loadView();
  initAssistantView();
  renderAssistant(EVENTS);
  document.getElementById("assistant-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  resetAssistant();

  document.getElementById("btn-show-assistant").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  // Mesmo clicando em "Mostrar Assistente" logo após o reset (antes do
  // próximo login popular allEvents de novo), nenhum card do usuário
  // anterior pode reaparecer.
  assert.strictEqual(document.getElementById("assistant-body").textContent.includes("Prova de Anatomia"), false);
});
