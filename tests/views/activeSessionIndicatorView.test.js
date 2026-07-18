/**
 * Tests for activeSessionIndicatorView.js — chip de sessão ativa no header
 * (F11 E13, auditoria #10). activitySessionService.js and navigationView.js
 * are mocked; sessionEventBus.js is used for real (pure in-memory pub/sub,
 * no DOM/I/O) — same pattern as tests/views/studySessionView.test.js.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SERVICE_SPECIFIER    = new URL("../../activitySessionService.js", import.meta.url).href;
const NAVIGATION_SPECIFIER = new URL("../../navigationView.js", import.meta.url).href;
const ERROR_SPECIFIER      = new URL("../../errorService.js", import.meta.url).href;

let showPageCalls;

function loadView(t, { getActiveSession } = {}) {
  showPageCalls = [];
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: (err, context) => ({ category: "unknown", friendly: err.message, context }) },
  });
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: { getActiveSession: getActiveSession ?? (async () => null) },
  });
  t.mock.module(NAVIGATION_SPECIFIER, {
    namedExports: { showPage: (name) => { showPageCalls.push(name); } },
  });
  return import(`../../activeSessionIndicatorView.js?t=${Math.random()}`);
}

beforeEach(() => {
  installDom();
  clearEventBus();
});

afterEach(() => {
  uninstallDom();
  clearEventBus();
});

test("with no active session, the chip stays hidden", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t);
  await initActiveSessionIndicator();

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("a running session restored at boot (F7.8) shows the chip with elapsed time", async (t) => {
  const startedAt = new Date(Date.now() - 25 * 60000).toISOString(); // 25min atrás
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: startedAt, paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  const chip = document.getElementById("active-session-chip");
  assert.strictEqual(chip.hidden, false);
  assert.strictEqual(document.getElementById("active-session-chip-time").textContent, "25min");
});

test("a paused session shows the elapsed time frozen at the pause moment, with a ' · Pausada' suffix", async (t) => {
  const startedAt = new Date(Date.now() - 40 * 60000).toISOString();
  const pausedAt  = new Date(Date.now() - 10 * 60000).toISOString(); // pausou há 10min
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "paused", started_at: startedAt, paused_at: pausedAt, paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  // 40min decorridos - 10min já pausados (contados como pausa corrente) = 30min ativos.
  assert.strictEqual(document.getElementById("active-session-chip-time").textContent, "30min · Pausada");
});

test("clicking the chip navigates to the study session page", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  document.getElementById("active-session-chip").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(showPageCalls, ["study-session"]);
});

test("SessionStarted published elsewhere shows the chip without a page reload", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t);
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);

  publish(SESSION_EVENTS.STARTED, { id: "s2", status: "running", started_at: new Date().toISOString(), paused_ms: 0 });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);
});

test("SessionFinished hides the chip again", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);

  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("SessionCancelled hides the chip again", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  publish(SESSION_EVENTS.CANCELLED, { id: "s1", status: "cancelled" });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("a failure restoring the active session at boot degrades silently (no active session, no crash)", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => { throw new Error("network down"); },
  });

  await initActiveSessionIndicator();

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("resetActiveSessionIndicator() hides the chip and stops reacting to further bus events", async (t) => {
  const { initActiveSessionIndicator, resetActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);

  resetActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);

  // Um evento tardio de uma sessão do usuário anterior não pode reexibir o chip.
  publish(SESSION_EVENTS.STARTED, { id: "s-leftover", status: "running", started_at: new Date().toISOString(), paused_ms: 0 });
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("initActiveSessionIndicator() called twice never registers duplicate event-bus listeners", async (t) => {
  const { initActiveSessionIndicator, resetActiveSessionIndicator } = await loadView(t);
  await initActiveSessionIndicator();
  await initActiveSessionIndicator();

  // resetActiveSessionIndicator() só desfaz UMA assinatura por evento — se o
  // segundo initActiveSessionIndicator() tivesse registrado um segundo
  // listener por baixo do guard, ele sobreviveria a este reset e reexibiria
  // o chip no publish() abaixo.
  resetActiveSessionIndicator();
  publish(SESSION_EVENTS.STARTED, { id: "s3", status: "running", started_at: new Date().toISOString(), paused_ms: 0 });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});
