/**
 * Golden path: Assistente IA — aiPanelView.js wired to a mocked aiService.js
 * (no real Gemini/Edge Function call), exercised through the real DOM.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { createAiServiceMock } from "../mocks/aiMock.js";

const AI_SERVICE_SPECIFIER      = new URL("../../services/ai/aiService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER   = new URL("../../eventService.js", import.meta.url).href;
const ACADEMIC_VIEW_SPECIFIER   = new URL("../../academicCalendarView.js", import.meta.url).href;

function loadAiPanel(t, aiOptions) {
  t.mock.module(AI_SERVICE_SPECIFIER, { namedExports: createAiServiceMock(aiOptions) });
  t.mock.module(EVENT_SERVICE_SPECIFIER, { namedExports: { getEvents: async () => [] } });
  // aiPanelView.js only needs isPersonalVisible() from academicCalendarView.js;
  // that module itself pulls in Supabase transitively, which isn't relevant here.
  t.mock.module(ACADEMIC_VIEW_SPECIFIER, { namedExports: { isPersonalVisible: () => true } });
  return import(`../../aiPanelView.js?t=${Math.random()}`);
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("opening the panel shows the actions view and focuses the close button", async (t) => {
  const { initAIPanel } = await loadAiPanel(t);
  initAIPanel();

  document.getElementById("nav-ai-assistant").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ai-panel").hidden, false);
  assert.strictEqual(document.querySelector(".ai-panel-actions").hidden, false);
  assert.strictEqual(document.activeElement, document.getElementById("ai-panel-close"));
});

test("closing the panel hides it and restores focus to the trigger", async (t) => {
  const { initAIPanel } = await loadAiPanel(t);
  initAIPanel();

  const trigger = document.getElementById("nav-ai-assistant");
  trigger.focus();
  trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ai-panel-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ai-panel").hidden, true);
  assert.strictEqual(document.activeElement, trigger);
});

test("running the weekly-summary action shows the mocked AI result", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { weeklySummary: "Você tem 3 provas esta semana." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-panel-result").hidden, false);
  assert.strictEqual(document.getElementById("ai-result-body").textContent, "Você tem 3 provas esta semana.");
});

test("a failing AI call shows a friendly error instead of throwing", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { fail: true, failMessage: "Serviço de IA indisponível." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-study").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-panel-result").hidden, false);
  assert.strictEqual(document.getElementById("ai-result-body").textContent, "Serviço de IA indisponível.");
});

test("the back button returns from the result view to the actions view", async (t) => {
  const { initAIPanel } = await loadAiPanel(t);
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();
  document.getElementById("btn-ai-analysis").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("btn-ai-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.querySelector(".ai-panel-actions").hidden, false);
  assert.strictEqual(document.getElementById("ai-panel-result").hidden, true);
});
