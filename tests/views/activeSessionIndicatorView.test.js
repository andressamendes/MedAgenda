/**
 * Tests for activeSessionIndicatorView.js — mini-timer flutuante da sessão
 * ativa (V5.11, evolução do antigo chip de header, F11 E13). activitySessionService.js,
 * sessionQuestionsService.js, studySessionView.js and navigationView.js are
 * mocked; sessionEventBus.js is used for real (pure in-memory pub/sub, no
 * DOM/I/O) — same pattern as tests/views/studySessionView.test.js.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SERVICE_SPECIFIER            = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTIONS_SERVICE_SPECIFIER  = new URL("../../sessionQuestionsService.js", import.meta.url).href;
const STUDY_SESSION_VIEW_SPECIFIER = new URL("../../studySessionView.js", import.meta.url).href;
const NAVIGATION_SPECIFIER         = new URL("../../navigationView.js", import.meta.url).href;
const ERROR_SPECIFIER              = new URL("../../errorService.js", import.meta.url).href;

let showPageCalls;
let addQuestionCalls;
let refreshSessionQuestionsCalls;

function loadView(t, { getActiveSession, addQuestion } = {}) {
  showPageCalls = [];
  addQuestionCalls = [];
  refreshSessionQuestionsCalls = 0;
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: (err, context) => ({ category: "unknown", friendly: err.message, context }) },
  });
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: { getActiveSession: getActiveSession ?? (async () => null) },
  });
  t.mock.module(QUESTIONS_SERVICE_SPECIFIER, {
    namedExports: {
      addQuestion: addQuestion ?? (async (sessionId, data) => {
        addQuestionCalls.push({ sessionId, data });
        return { id: `q-${addQuestionCalls.length}`, session_id: sessionId, ...data };
      }),
    },
  });
  t.mock.module(STUDY_SESSION_VIEW_SPECIFIER, {
    namedExports: { refreshSessionQuestions: () => { refreshSessionQuestionsCalls += 1; } },
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

test("with no active session, the widget stays hidden", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t);
  await initActiveSessionIndicator();

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("a running session restored at boot (F7.8) shows the widget with elapsed time", async (t) => {
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

test("tapping the toggle expands the panel, without navigating away", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  const toggle = document.getElementById("active-session-chip-toggle");
  const panel  = document.getElementById("active-session-chip-panel");
  assert.strictEqual(panel.hidden, true);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(panel.hidden, false);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
  assert.deepStrictEqual(showPageCalls, []);

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(panel.hidden, true);
});

test("'Abrir sessão' inside the expanded panel navigates to the study session page and collapses", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  document.getElementById("active-session-chip-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("active-session-chip-open").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(showPageCalls, ["study-session"]);
  assert.strictEqual(document.getElementById("active-session-chip-panel").hidden, true);
});

test("'+1 questão' registers a question via sessionQuestionsService and refreshes studySessionView's list", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();

  document.getElementById("active-session-chip-quick").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(addQuestionCalls.length, 1);
  assert.strictEqual(addQuestionCalls[0].sessionId, "s1");
  assert.deepStrictEqual(addQuestionCalls[0].data, {
    question_type: "multiple_choice",
    status: "answered",
    difficulty: "medium",
    subject: null,
    topic: null,
    correct_count: 1,
    incorrect_count: 0,
  });
  // O import dinâmico de studySessionView.js resolve depois de mais alguns
  // ticks além do clique — folga extra garante que refreshSessionQuestions()
  // já rodou antes da asserção.
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual(refreshSessionQuestionsCalls, 1);
});

test("a failure registering '+1 questão' does not crash and can be retried", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
    addQuestion: async () => { throw new Error("network down"); },
  });
  await initActiveSessionIndicator();

  const quickBtn = document.getElementById("active-session-chip-quick");
  quickBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(quickBtn.disabled, false);
});

test("the widget hides itself while #page-study-session is the active page (its full controls already exist there)", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  document.getElementById("page-study-session").hidden = false;

  await initActiveSessionIndicator();

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("navigating away from #page-study-session while the session is still active reveals the widget again", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  const studyPage = document.getElementById("page-study-session");
  studyPage.hidden = false;
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);

  studyPage.hidden = true;
  await new Promise(resolve => setTimeout(resolve, 0)); // MutationObserver reage assincronamente

  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);
});

test("SessionStarted published elsewhere shows the widget without a page reload", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t);
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);

  publish(SESSION_EVENTS.STARTED, { id: "s2", status: "running", started_at: new Date().toISOString(), paused_ms: 0 });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);
});

test("SessionFinished hides the widget again", async (t) => {
  const { initActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);

  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});

test("SessionCancelled hides the widget again", async (t) => {
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

test("resetActiveSessionIndicator() hides the widget, collapses the panel, and stops reacting to further bus events", async (t) => {
  const { initActiveSessionIndicator, resetActiveSessionIndicator } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running", started_at: new Date().toISOString(), paused_ms: 0 }),
  });
  await initActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, false);
  document.getElementById("active-session-chip-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("active-session-chip-panel").hidden, false);

  resetActiveSessionIndicator();
  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
  assert.strictEqual(document.getElementById("active-session-chip-panel").hidden, true);

  // Um evento tardio de uma sessão do usuário anterior não pode reexibir o widget.
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
  // o widget no publish() abaixo.
  resetActiveSessionIndicator();
  publish(SESSION_EVENTS.STARTED, { id: "s3", status: "running", started_at: new Date().toISOString(), paused_ms: 0 });

  assert.strictEqual(document.getElementById("active-session-chip").hidden, true);
});
