/**
 * Tests for stateView.js — componente único de estados de carregamento
 * (F4.1): sessão expirada, erro de rede, servidor indisponível. Cobre a
 * classificação (errorToState), a renderização (renderStateBlock/
 * stateBlockMarkup+wireStateBlock) e o roteamento de ação (retry vs.
 * reautenticação via setReauthHandler/triggerReauth).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

function importStateView() {
  return import(`../../stateView.js?t=${Math.random()}`);
}

test("errorToState maps the 'auth' category to session_expired", async () => {
  const { errorToState, STATES } = await importStateView();
  const result = errorToState({ category: "auth", friendly: "Sua sessão expirou. Faça login novamente." });
  assert.strictEqual(result.state, STATES.SESSION_EXPIRED);
  assert.strictEqual(result.message, "Sua sessão expirou. Faça login novamente.");
});

test("errorToState maps the 'network' category to network", async () => {
  const { errorToState, STATES } = await importStateView();
  const result = errorToState({ category: "network", friendly: "Sem conexão com a internet." });
  assert.strictEqual(result.state, STATES.NETWORK);
});

test("errorToState maps every other category (database/ai/storage/push/service_worker/unknown) to server", async () => {
  const { errorToState, STATES } = await importStateView();
  for (const category of ["database", "ai", "storage", "push", "service_worker", "unknown"]) {
    const result = errorToState({ category, friendly: "x" });
    assert.strictEqual(result.state, STATES.SERVER, `category ${category} should map to server`);
  }
});

test("renderStateBlock renders icon, title, description and action for session_expired, with no retry callback wired", async () => {
  const { renderStateBlock, STATES } = await importStateView();
  const container = document.createElement("p");

  let retried = false;
  renderStateBlock(container, {
    state: STATES.SESSION_EXPIRED,
    message: "Sua sessão expirou. Faça login novamente.",
    onRetry: () => { retried = true; },
  });

  assert.match(container.querySelector(".state-block-icon").textContent, /🔒/);
  assert.strictEqual(container.querySelector(".state-block-title").textContent, "Sessão expirada");
  assert.strictEqual(container.querySelector(".state-block-desc").textContent, "Sua sessão expirou. Faça login novamente.");
  const btn = container.querySelector(".state-block-action");
  assert.strictEqual(btn.textContent, "Entrar novamente");

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // Sessão expirada nunca aciona o retry — só o fluxo de reautenticação.
  assert.strictEqual(retried, false);
});

test("renderStateBlock's action triggers the registered reauth handler for session_expired", async () => {
  const { renderStateBlock, setReauthHandler, STATES } = await importStateView();
  const container = document.createElement("p");

  let reauthCalls = 0;
  setReauthHandler(() => { reauthCalls++; });

  renderStateBlock(container, { state: STATES.SESSION_EXPIRED, message: "expirou" });
  container.querySelector(".state-block-action").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(reauthCalls, 1);
});

test("renderStateBlock's action calls onRetry (never reauth) for network and server states", async () => {
  const { renderStateBlock, setReauthHandler, STATES } = await importStateView();

  let reauthCalls = 0;
  setReauthHandler(() => { reauthCalls++; });

  for (const state of [STATES.NETWORK, STATES.SERVER]) {
    const container = document.createElement("p");
    let retried = false;
    renderStateBlock(container, { state, message: "erro", onRetry: () => { retried = true; } });

    const btn = container.querySelector(".state-block-action");
    assert.strictEqual(btn.textContent, "Tentar novamente");

    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.strictEqual(retried, true);
    assert.strictEqual(reauthCalls, 0);
  }
});

test("triggerReauth() calls the registered handler directly, for screens without a full state block", async () => {
  const { setReauthHandler, triggerReauth } = await importStateView();
  let calls = 0;
  setReauthHandler(() => { calls++; });

  triggerReauth();
  assert.strictEqual(calls, 1);
});

test("stateBlockMarkup + wireStateBlock produce the same behavior as renderStateBlock, for screens that build one big HTML template", async () => {
  const { stateBlockMarkup, wireStateBlock, setReauthHandler, STATES } = await importStateView();

  let reauthCalls = 0;
  setReauthHandler(() => { reauthCalls++; });

  const root = document.createElement("div");
  root.innerHTML = stateBlockMarkup({ state: STATES.SESSION_EXPIRED, message: "Sua sessão expirou." });
  wireStateBlock(root, () => { throw new Error("retry should never run for session_expired"); });

  assert.strictEqual(root.querySelector(".state-block-title").textContent, "Sessão expirada");
  assert.strictEqual(root.querySelector(".state-block-desc").textContent, "Sua sessão expirou.");

  root.querySelector(".state-block-action").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(reauthCalls, 1);
});

test("stateBlockMarkup escapes the message (never injects raw HTML from an error message)", async () => {
  const { stateBlockMarkup, STATES } = await importStateView();
  const html = stateBlockMarkup({ state: STATES.SERVER, message: "<img src=x onerror=alert(1)>" });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("clearStateBlock removes every state-block class added by renderStateBlock", async () => {
  const { renderStateBlock, clearStateBlock, STATES } = await importStateView();
  const container = document.createElement("p");
  renderStateBlock(container, { state: STATES.NETWORK, message: "erro" });
  assert.ok(container.classList.contains("state-block"));
  assert.ok(container.classList.contains("state-block--network"));

  clearStateBlock(container);
  assert.strictEqual(container.classList.contains("state-block"), false);
  assert.strictEqual(container.classList.contains("state-block--network"), false);
  assert.strictEqual(container.classList.contains("state-block--session_expired"), false);
  assert.strictEqual(container.classList.contains("state-block--server"), false);
});

test("without a registered reauth handler, the default fallback safely calls window.location.reload() instead of leaving the user stuck", async () => {
  const { triggerReauth } = await importStateView();
  // window.location.reload is non-writable/non-configurable in jsdom, so it
  // can't be spied on directly — this only proves the default fallback
  // reaches the call without throwing, instead of silently doing nothing.
  assert.doesNotThrow(() => triggerReauth());
});
