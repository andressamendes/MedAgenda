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

const SERVICE_SPECIFIER         = new URL("../../activitySessionService.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER   = new URL("../../errorService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER   = new URL("../../eventService.js", import.meta.url).href;
const CATEGORY_SERVICE_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;
const CONFIRM_DIALOG_SPECIFIER  = new URL("../../confirmDialog.js", import.meta.url).href;

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

  // Só usados quando a sessão está vinculada a um evento (F1.4) — nenhum
  // teste sem event_id os exercita, mas precisam existir para o import não
  // cair no supabase.js real (que exige config.js).
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

  return import(`../../activitySessionView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, confirmDialogCalls }));
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

// ── F1.4: sessões vinculadas a um compromisso ───────────────────────────────

test("startSessionForEvent() starts a session linked to the event and shows its title + category", async (t) => {
  const event = { id: "evt-1", title: "Plantão UTI", category: "Plantão" };
  const { mod } = await loadActivitySessionView(t, {
    getCategories: async () => [{ id: "cat-1", name: "Plantão" }],
    startSession: async (fields) => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(),
      event_id: fields.event_id, category_id: fields.category_id,
    }),
  });
  await mod.initActivitySessionView();

  const started = await mod.startSessionForEvent(event);

  assert.strictEqual(started, true);
  assert.strictEqual(document.getElementById("as-event").hidden, false);
  assert.strictEqual(document.getElementById("as-event").textContent, "Plantão UTI · Plantão");
});

test("startSessionForEvent() works for an event without a category", async (t) => {
  const event = { id: "evt-1", title: "Estudo livre", category: null };
  const { mod } = await loadActivitySessionView(t, {
    startSession: async (fields) => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(),
      event_id: fields.event_id, category_id: fields.category_id,
    }),
  });
  await mod.initActivitySessionView();

  await mod.startSessionForEvent(event);

  assert.strictEqual(document.getElementById("as-event").textContent, "Estudo livre");
});

test("reload restores the linked event's title and category from event_id", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1",
    }),
    getEventById: async (id) => (id === "evt-1" ? { id, title: "Ambulatório", category: "Ambulatório" } : null),
  });

  await mod.initActivitySessionView();

  assert.strictEqual(document.getElementById("as-event").hidden, false);
  assert.strictEqual(document.getElementById("as-event").textContent, "Ambulatório · Ambulatório");
});

test("if the linked event was deleted, the widget still restores the session with a generic label", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-deleted",
    }),
    getEventById: async () => null,
  });

  await mod.initActivitySessionView();

  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");
  assert.strictEqual(document.getElementById("as-event").textContent, "Compromisso removido");
});

test("starting a session for an event while another is already running never switches silently", async (t) => {
  const conflictError = Object.assign(new Error("Já existe uma sessão de atividade em andamento."), {
    code: "SESSION_ALREADY_RUNNING",
  });
  const event = { id: "evt-2", title: "Aula de Cardio", category: null };
  const { mod, confirmDialogCalls } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-running", status: "running", started_at: new Date().toISOString() }),
    startSession: async () => { throw conflictError; },
    confirmDialogResolvesTo: false, // usuário cancela — não finaliza, não troca
  });
  await mod.initActivitySessionView();

  const started = await mod.startSessionForEvent(event);

  assert.strictEqual(started, false);
  assert.strictEqual(confirmDialogCalls.length, 1);
  // A sessão anterior continua rodando — nada foi trocado silenciosamente.
  assert.strictEqual(document.getElementById("as-status").textContent, "Em andamento");
});

test("confirming the conflict finishes the current session but still requires a second click to start the new one", async (t) => {
  const conflictError = Object.assign(new Error("Já existe uma sessão de atividade em andamento."), {
    code: "SESSION_ALREADY_RUNNING",
  });
  const event = { id: "evt-2", title: "Aula de Cardio", category: null };
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({ id: "sess-running", status: "running", started_at: new Date().toISOString() }),
    startSession: async () => { throw conflictError; },
    finishSession: async (id) => ({ id, status: "finished" }),
    confirmDialogResolvesTo: true,
  });
  await mod.initActivitySessionView();

  const started = await mod.startSessionForEvent(event);

  assert.strictEqual(started, false);
  // A sessão antiga foi finalizada, mas a nova NÃO foi iniciada automaticamente.
  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
  assert.strictEqual(document.getElementById("as-btn-start").hidden, false);
});

test("finishing an event-linked session clears its title/category from the widget", async (t) => {
  const { mod } = await loadActivitySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1",
    }),
    getEventById: async () => ({ id: "evt-1", title: "Prova de Farmaco", category: "Prova" }),
  });
  await mod.initActivitySessionView();
  assert.strictEqual(document.getElementById("as-event").hidden, false);

  document.getElementById("as-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("as-event").hidden, true);
  assert.strictEqual(document.getElementById("as-status").textContent, "Nenhuma sessão em andamento");
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
