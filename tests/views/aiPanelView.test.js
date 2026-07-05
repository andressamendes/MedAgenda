/**
 * Golden path: Assistente IA — aiPanelView.js wired to a mocked aiService.js
 * (no real Gemini/Edge Function call), exercised through the real DOM.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { createAiServiceMock } from "../mocks/aiMock.js";

const AI_SERVICE_SPECIFIER = new URL("../../services/ai/aiService.js", import.meta.url).href;

// aiPanelView.js (F3.2) no longer fetches or shapes context on its own — it
// only calls the AI gateway (services/ai/aiService.js), which internally
// consults aiContextService.getAIContext(). Mocking the gateway is enough;
// there's no event-service or academic-view context left in the view to mock.
function loadAiPanel(t, aiOptions) {
  t.mock.module(AI_SERVICE_SPECIFIER, { namedExports: createAiServiceMock(aiOptions) });
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

test("running the recommendations action shows the mocked result, without calling Gemini", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { recommendations: "• Você tem 2 revisões pendentes." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-recommendations").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-panel-result").hidden, false);
  assert.strictEqual(document.getElementById("ai-result-body").textContent, "• Você tem 2 revisões pendentes.");
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

async function flushMicrotasks(times = 15) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

test("the loading message progresses through stages while the AI call is in flight", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { initAIPanel } = await loadAiPanel(t, { hang: true });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();

  const loadingText = document.getElementById("ai-loading-text");
  assert.strictEqual(loadingText.textContent, "Preparando análise…");

  t.mock.timers.tick(2000);
  assert.strictEqual(loadingText.textContent, "Consultando o assistente…");

  t.mock.timers.tick(4000);
  assert.strictEqual(loadingText.textContent, "Processando sua solicitação…");

  t.mock.timers.tick(6000);
  assert.strictEqual(loadingText.textContent, "Esta resposta está demorando mais que o normal…");

  assert.strictEqual(document.getElementById("ai-panel-loading").hidden, false);
});

test("a failing AI call shows a retry button that re-runs the same action", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { fail: true, failMessage: "Falha simulada." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const retryBtn = document.getElementById("btn-ai-retry");
  assert.strictEqual(retryBtn.hidden, false);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-result-body").textContent, "Falha simulada.");
  assert.strictEqual(retryBtn.hidden, false);
});

test("a successful AI call keeps the retry button hidden", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { weeklySummary: "Tudo certo." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("btn-ai-retry").hidden, true);
});

test("clicking cancel while an AI call is in flight returns to the actions view", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { hang: true });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();
  assert.strictEqual(document.getElementById("ai-panel-loading").hidden, false);

  document.getElementById("btn-ai-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();

  assert.strictEqual(document.querySelector(".ai-panel-actions").hidden, false);
  assert.strictEqual(document.getElementById("ai-panel-loading").hidden, true);
  document.querySelectorAll('.ai-action-btn').forEach(b => assert.strictEqual(b.disabled, false));
});
