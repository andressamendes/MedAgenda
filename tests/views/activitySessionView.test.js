/**
 * Golden path: Cronômetro global de Sessão de Atividade — activitySessionView.js
 * wired to a mocked activitySessionService.js, exercised through the real DOM.
 * All domain rules (single running session, duration calc, valid status
 * transitions) live in activitySessionService.js and are tested there; here
 * we only verify the widget renders/reacts correctly to what the service
 * returns or throws.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER = new URL("../../errorService.js", import.meta.url).href;

function loadActivitySessionView(t, overrides = {}) {
  const handleErrorCalls = [];
  t.mock.module(ERROR_SERVICE_SPECIFIER, {
    namedExports: {
      handleError: (err, context) => {
        handleErrorCalls.push({ err, context });
        return { category: "unknown", friendly: err.message };
      },
    },
  });

  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      getRunningSession: overrides.getRunningSession ?? (async () => null),
      startSession:      overrides.startSession ?? (async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() })),
      pauseSession:      overrides.pauseSession ?? (async (id) => ({ id, status: "paused", started_at: new Date().toISOString() })),
      resumeSession:     overrides.resumeSession ?? (async (id) => ({ id, status: "running", started_at: new Date().toISOString() })),
      finishSession:     overrides.finishSession ?? (async (id) => ({ id, status: "finished" })),
    },
  });

  return import(`../../activitySessionView.js?t=${Math.random()}`).then(mod => ({ mod, handleErrorCalls }));
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("with no running session, the widget starts idle showing only the Iniciar button", async (t) => {
  const { mod } = await loadActivitySessionView(t);
  await mod.initActivitySessionView();

  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, false);
  assert.strictEqual(document.getElementById("as-btn-pause").hidden, true);
  assert.strictEqual(document.getElementById("as-btn-resume").hidden, true);
  assert.strictEqual(document.getElementById("as-btn-finish").hidden, true);
});

test("reload restores an already-running session instead of losing it", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initActivitySessionView();

  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, true);
  assert.strictEqual(document.getElementById("as-btn-pause").hidden, false);
  assert.strictEqual(document.getElementById("as-btn-finish").hidden, false);
});

test("clicking Iniciar starts a session and switches the widget to running", async (t) => {
  const { mod } = await loadActivitySessionView(t);
  await mod.initActivitySessionView();

  document.getElementById("as-btn-start").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");
  assert.strictEqual(document.getElementById("as-btn-pause").hidden, false);
});

test("the elapsed time ticks from started_at without the timer being the source of truth", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const startedAt = new Date().toISOString();
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt }),
  });

  await mod.initActivitySessionView();
  assert.strictEqual(document.getElementById("as-time").textContent, "00:00");

  t.mock.timers.tick(65_000);
  assert.strictEqual(document.getElementById("as-time").textContent, "01:05");
});

test("a domain error (e.g. session already running) is reported via errorService and leaves the widget idle", async (t) => {
  const domainError = Object.assign(new Error("Já existe uma sessão de atividade em andamento."), {
    code: "SESSION_ALREADY_RUNNING",
  });
  const { mod, handleErrorCalls } = await loadActivitySessionView(t, {
    startSession: async () => { throw domainError; },
  });

  await mod.initActivitySessionView();
  document.getElementById("as-btn-start").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1);
  assert.strictEqual(handleErrorCalls[0].err, domainError);
  // Widget stays idle — never gets stuck showing a session that doesn't exist.
  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, false);
});

test("pausing a running session shows the Continuar button and the paused-time note", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initActivitySessionView();

  document.getElementById("as-btn-pause").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("as-status").textContent, "Pausada");
  assert.strictEqual(document.getElementById("as-btn-resume").hidden, false);
  assert.strictEqual(document.getElementById("as-btn-pause").hidden, true);
  assert.strictEqual(document.getElementById("as-note").hidden, false);
});

test("resuming a paused session switches the widget back to running", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
  });
  await mod.initActivitySessionView();

  document.getElementById("as-btn-resume").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");
  assert.strictEqual(document.getElementById("as-btn-pause").hidden, false);
});

test("finishing a session returns the widget to idle", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initActivitySessionView();

  document.getElementById("as-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, false);
  assert.strictEqual(document.getElementById("as-btn-finish").hidden, true);
});

test("resetActivitySessionView() clears the widget back to idle (used on sign-out)", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initActivitySessionView();
  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");

  mod.resetActivitySessionView();

  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, false);
});
