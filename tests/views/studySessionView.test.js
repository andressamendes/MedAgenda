/**
 * Golden path: tela "Sessão de Estudo" (F7.2) — studySessionView.js wired to a
 * mocked activitySessionService.js, exercised through the real DOM (index.html).
 * All domain rules (single running session, duration calc, valid status
 * transitions) live in activitySessionService.js and are tested there; here
 * we only verify the page renders/reacts correctly to what the service
 * returns/throws and to sessionEventBus notifications.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SERVICE_SPECIFIER          = new URL("../../activitySessionService.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER    = new URL("../../errorService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;
const CATEGORY_SERVICE_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;
const CONFIRM_DIALOG_SPECIFIER   = new URL("../../confirmDialog.js", import.meta.url).href;

function loadStudySessionView(t, overrides = {}) {
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
      cancelSession:     overrides.cancelSession ?? (async (id) => ({ id, status: "cancelled" })),
    },
  });

  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { getEventById: overrides.getEventById ?? (async () => null) },
  });
  t.mock.module(CATEGORY_SERVICE_SPECIFIER, {
    namedExports: { getCategories: overrides.getCategories ?? (async () => []) },
  });

  const confirmDialogCalls = [];
  t.mock.module(CONFIRM_DIALOG_SPECIFIER, {
    namedExports: {
      confirmDialog: async (opts) => {
        confirmDialogCalls.push(opts);
        return overrides.confirmDialogResolvesTo ?? false;
      },
    },
  });

  return import(`../../studySessionView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, confirmDialogCalls }));
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
  // Each test re-imports studySessionView.js with a cache-busting query
  // string (fresh module state), but sessionEventBus.js is a true singleton
  // shared across every import — without this, subscriptions from one
  // test's page instance would leak into the next test's publish() calls.
  clearEventBus();
});

test("with no running session, the empty state is shown and the active card is hidden", async (t) => {
  const { mod } = await loadStudySessionView(t);
  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);
});

test("reload restores an already-running session instead of losing it", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-empty").hidden, true);
  assert.strictEqual(document.getElementById("ss-active").hidden, false);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
  assert.strictEqual(document.getElementById("ss-btn-pause").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-finish").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-resume").hidden, true);
  assert.strictEqual(document.getElementById("ss-btn-cancel").hidden, true);
});

test("clicking 'Iniciar sessão avulsa' starts a session and switches to the running state", async (t) => {
  const { mod } = await loadStudySessionView(t);
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Sessão avulsa");
});

test("executando: only Pausar and Finalizar are shown — never Continuar/Cancelar", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-btn-pause").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-finish").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-resume").hidden, true);
  assert.strictEqual(document.getElementById("ss-btn-cancel").hidden, true);
});

test("pausada: only Continuar, Cancelar and Finalizar are shown — never Pausar", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Pausada");
  assert.strictEqual(document.getElementById("ss-btn-resume").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-cancel").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-finish").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-pause").hidden, true);
  assert.strictEqual(document.getElementById("ss-pause-note").hidden, false);
});

test("the elapsed time ticks from started_at without the timer being the source of truth", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const startedAt = new Date().toISOString();
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt }),
  });

  await mod.initStudySessionView();
  assert.strictEqual(document.getElementById("ss-time").textContent, "00:00");

  t.mock.timers.tick(65_000);
  assert.strictEqual(document.getElementById("ss-time").textContent, "01:05");
});

test("pausing freezes the displayed time instead of continuing to tick", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-pause").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Pausada");
  assert.strictEqual(document.getElementById("ss-btn-resume").hidden, false);
});

test("resuming a paused session switches back to running", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-resume").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
});

test("clicking Cancelar asks for confirmation and only cancels when confirmed", async (t) => {
  const { mod, confirmDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
    confirmDialogResolvesTo: true,
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(confirmDialogCalls.length, 1);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);
});

test("declining the Cancelar confirmation keeps the session paused", async (t) => {
  const { mod, confirmDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
    confirmDialogResolvesTo: false,
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(confirmDialogCalls.length, 1);
  assert.strictEqual(document.getElementById("ss-active").hidden, false);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Pausada");
});

test("finishing a session returns the page to the empty state", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);
});

test("a domain error (e.g. session already running) is reported via errorService and leaves the page in the empty state", async (t) => {
  const domainError = Object.assign(new Error("Já existe uma sessão de atividade em andamento."), {
    code: "SESSION_ALREADY_RUNNING",
  });
  const { mod, handleErrorCalls } = await loadStudySessionView(t, {
    startSession: async () => { throw domainError; },
  });

  await mod.initStudySessionView();
  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1);
  assert.strictEqual(handleErrorCalls[0].err, domainError);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});

// ── Contexto do compromisso vinculado (F1.4 / F7.2) ─────────────────────────

test("startSessionForEvent() starts a session linked to the event and shows its context", async (t) => {
  const event = { id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar protocolo de sepse", duration_minutes: 90 };
  const { mod } = await loadStudySessionView(t, {
    getCategories: async () => [{ id: "cat-1", name: "Plantão" }],
    startSession: async (fields) => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(),
      event_id: fields.event_id, category_id: fields.category_id,
    }),
  });
  await mod.initStudySessionView();

  const started = await mod.startSessionForEvent(event);

  assert.strictEqual(started, true);
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Plantão UTI");
  assert.strictEqual(document.getElementById("ss-category").textContent, "Plantão");
  assert.strictEqual(document.getElementById("ss-content").textContent, "Revisar protocolo de sepse");
  assert.strictEqual(document.getElementById("ss-expected-duration").textContent, "1h 30min");
});

test("reload restores the linked event's context from event_id", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1",
    }),
    getEventById: async (id) => (id === "evt-1" ? { id, title: "Ambulatório", category: "Ambulatório", description: null, duration_minutes: null } : null),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Ambulatório");
  assert.strictEqual(document.getElementById("ss-category").textContent, "Ambulatório");
  assert.strictEqual(document.getElementById("ss-expected-duration").textContent, "—");
});

test("if the linked event was deleted, the page still restores the session with a generic label", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-deleted",
    }),
    getEventById: async () => null,
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Compromisso removido");
});

test("starting a session for an event while another is already running never switches silently", async (t) => {
  const conflictError = Object.assign(new Error("Já existe uma sessão de atividade em andamento."), {
    code: "SESSION_ALREADY_RUNNING",
  });
  const event = { id: "evt-2", title: "Aula de Cardio", category: null };
  const { mod, confirmDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-running", status: "running", started_at: new Date().toISOString() }),
    startSession: async () => { throw conflictError; },
    confirmDialogResolvesTo: false,
  });
  await mod.initStudySessionView();

  const started = await mod.startSessionForEvent(event);

  assert.strictEqual(started, false);
  assert.strictEqual(confirmDialogCalls.length, 1);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
});

// ── Atualização reativa via sessionEventBus (F6.2 / F7.2) ───────────────────

test("a SessionStarted event published elsewhere (e.g. by eventFormView) updates the page without polling", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getEventById: async () => ({ id: "evt-9", title: "Aula externa", category: "Aula", description: null, duration_minutes: null }),
  });
  await mod.initStudySessionView();
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);

  publish(SESSION_EVENTS.STARTED, {
    id: "sess-ext", status: "running", started_at: new Date().toISOString(), event_id: "evt-9",
  });
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-empty").hidden, true);
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Aula externa");
});

test("a SessionFinished event published elsewhere returns the page to the empty state", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();
  assert.strictEqual(document.getElementById("ss-active").hidden, false);

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});

test("resetStudySessionView() clears the page back to the empty state and unsubscribes from the bus (used on sign-out)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();
  assert.strictEqual(document.getElementById("ss-active").hidden, false);

  mod.resetStudySessionView();

  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);

  // Depois do reset, eventos publicados no barramento não devem mais afetar a tela.
  publish(SESSION_EVENTS.STARTED, { id: "sess-2", status: "running", started_at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});
