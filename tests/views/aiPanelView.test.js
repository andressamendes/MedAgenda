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

test("running the plan action renders the structured plan, not plain text, and creates no events", async (t) => {
  const plan = [
    { tipo: "overdue", prioridade: "alta", categoria: "Farmacologia", tempoSugerido: "40 minutos", dataSugerida: "2026-07-06", motivo: "Você tem 2 compromissos atrasados sem execução registrada.", confianca: "alta" },
    { tipo: "study", prioridade: "baixa", categoria: null, tempoSugerido: "60 minutos", dataSugerida: "2026-07-07", motivo: "Sua semana está vazia: nenhum compromisso agendado.", confianca: "média" },
  ];
  const { initAIPanel } = await loadAiPanel(t, { weeklyPlan: plan });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-plan").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-panel-result").hidden, false);
  assert.strictEqual(document.getElementById("ai-result-title").textContent, "Plano da Semana");
  const items = document.querySelectorAll("#ai-result-body .ai-plan-item");
  assert.strictEqual(items.length, 2);
  assert.match(items[0].textContent, /Farmacologia/);
  assert.match(items[0].textContent, /40 minutos/);
  assert.match(items[0].textContent, /compromissos atrasados/);
  // Nenhum botão de ação (criar evento/gravar) dentro do plano — só leitura.
  assert.strictEqual(document.querySelectorAll("#ai-result-body button").length, 0);
});

test("the plan action shows an empty-state message when there is nothing to suggest", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { weeklyPlan: [] });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-plan").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.match(document.getElementById("ai-result-body").textContent, /Nenhuma sugestão/);
});

test("a failing plan action shows a friendly error and a working retry button", async (t) => {
  const { initAIPanel } = await loadAiPanel(t, { fail: true, failMessage: "Falha ao gerar o plano." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-plan").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ai-result-body").textContent, "Falha ao gerar o plano.");
  const retryBtn = document.getElementById("btn-ai-retry");
  assert.strictEqual(retryBtn.hidden, false);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ai-result-body").textContent, "Falha ao gerar o plano.");
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

test("resetAIPanel() (logout, A1.3) aborts an in-flight AI call and hides the panel", async (t) => {
  const aiMock = createAiServiceMock({ hang: true });
  t.mock.module(AI_SERVICE_SPECIFIER, { namedExports: aiMock });
  const { initAIPanel, resetAIPanel } = await import(`../../aiPanelView.js?t=${Math.random()}`);
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();

  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flushMicrotasks();
  assert.strictEqual(document.getElementById("ai-panel-loading").hidden, false);

  resetAIPanel();

  // The AbortController handed to the in-flight call was aborted — the
  // response, if it ever arrives, will be treated as cancelled instead of
  // rendering into the (now hidden) panel for the next user.
  assert.strictEqual(aiMock._calls[0].controller.signal.aborted, true);
  assert.strictEqual(document.getElementById("ai-panel").hidden, true);
});

test("resetAIPanel() clears the previous result, so the next login never sees the last user's AI answer", async (t) => {
  const { initAIPanel, resetAIPanel } = await loadAiPanel(t, { weeklySummary: "Dados do usuário anterior." });
  initAIPanel();
  document.getElementById("nav-ai-assistant").click();
  document.getElementById("btn-ai-weekly").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ai-panel-result").hidden, false);

  resetAIPanel();

  assert.strictEqual(document.getElementById("ai-panel").hidden, true);

  // Next login reopens the panel — it must show the actions view, not the
  // previous user's cached result.
  document.getElementById("nav-ai-assistant").click();
  assert.strictEqual(document.querySelector(".ai-panel-actions").hidden, false);
  assert.strictEqual(document.getElementById("ai-panel-result").hidden, true);
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
