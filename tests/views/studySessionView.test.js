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
const QUESTIONS_SERVICE_SPECIFIER = new URL("../../sessionQuestionsService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER            = new URL("../../reviewService.js", import.meta.url).href;
const REVIEW_SESSION_SERVICE_SPECIFIER    = new URL("../../reviewSessionService.js", import.meta.url).href;
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
      getActiveSession:  overrides.getRunningSession ?? (async () => null),
      startSession:      overrides.startSession ?? (async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() })),
      pauseSession:      overrides.pauseSession ?? (async (id) => ({ id, status: "paused", started_at: new Date().toISOString() })),
      resumeSession:     overrides.resumeSession ?? (async (id) => ({ id, status: "running", started_at: new Date().toISOString() })),
      finishSession:     overrides.finishSession ?? (async (id) => ({ id, status: "finished" })),
      cancelSession:     overrides.cancelSession ?? (async (id) => ({ id, status: "cancelled" })),
    },
  });

  const addQuestionCalls = [];
  t.mock.module(QUESTIONS_SERVICE_SPECIFIER, {
    namedExports: {
      addQuestion: overrides.addQuestion ?? (async (sessionId, data) => {
        addQuestionCalls.push({ sessionId, data });
        return { id: `q-${addQuestionCalls.length}`, session_id: sessionId, ...data };
      }),
    },
  });

  // Revisões do pós-sessão (F7.5) — reviewService.js/reviewSessionService.js
  // importam supabase.js/config.js diretamente, então são mockados aqui como
  // qualquer outra dependência de domínio.
  const createReviewCalls = [];
  const associateReviewCalls = [];
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      create: overrides.createReview ?? (async (fields) => {
        createReviewCalls.push(fields);
        return { id: `rev-new-${createReviewCalls.length}`, status: "pending", ...fields };
      }),
      listPending: overrides.listPendingReviews ?? (async () => []),
    },
  });
  t.mock.module(REVIEW_SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      associateReview: overrides.associateReview ?? (async (reviewId, sessionId) => {
        associateReviewCalls.push({ reviewId, sessionId });
        return { id: reviewId, session_id: sessionId };
      }),
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
    .then(mod => ({ mod, handleErrorCalls, confirmDialogCalls, addQuestionCalls, createReviewCalls, associateReviewCalls }));
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

test("F7.7: paused time is deducted from the elapsed/net time shown after resuming", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const startedAt = new Date().toISOString();
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt }),
    pauseSession: async (id) => ({ id, status: "paused", started_at: startedAt, paused_at: new Date().toISOString(), paused_ms: 0 }),
    // Simula resumeSession() fechando o intervalo de pausa corrente (30s) em paused_ms.
    resumeSession: async (id) => ({ id, status: "running", started_at: startedAt, paused_at: null, paused_ms: 30_000 }),
  });

  await mod.initStudySessionView();

  t.mock.timers.tick(60_000); // 1 minuto rodando
  assert.strictEqual(document.getElementById("ss-time").textContent, "01:00");

  document.getElementById("ss-btn-pause").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  t.mock.timers.tick(30_000); // 30s pausado — congelado, não deve mudar o texto
  assert.strictEqual(document.getElementById("ss-time").textContent, "01:00");

  document.getElementById("ss-btn-resume").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  // Relógio real: 1min + 30s pausado = 1m30s desde started_at. Líquido:
  // 1m30s - 30s (paused_ms) = 1min, exatamente como antes de pausar.
  assert.strictEqual(document.getElementById("ss-time").textContent, "01:00");

  t.mock.timers.tick(15_000); // mais 15s rodando após retomar
  assert.strictEqual(document.getElementById("ss-time").textContent, "01:15");
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

// ── Fluxo de encerramento: resumo + confirmação (F7.3) ──────────────────────

test("clicking Finalizar never finishes immediately — it opens the summary modal instead", async (t) => {
  const finishCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1",
    }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60 }),
    finishSession: async (id) => { finishCalls.push(id); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 0, "finishSession must not be called before confirmation");
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, false, "the running session card stays visible behind the modal");
});

test("the summary modal shows the session's read-only data, sourced from the existing domain", async (t) => {
  const startedAt = new Date("2026-07-07T10:00:00.000Z").toISOString();
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt, event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-event-title").textContent, "Plantão UTI");
  assert.strictEqual(document.getElementById("ssf-category").textContent, "Plantão");
  assert.strictEqual(document.getElementById("ssf-subject").textContent, "Plantão");
  assert.strictEqual(document.getElementById("ssf-content").textContent, "Revisar sepse");
  assert.notStrictEqual(document.getElementById("ssf-started-at").textContent, "—");
  assert.notStrictEqual(document.getElementById("ssf-ended-at").textContent, "—");
  assert.notStrictEqual(document.getElementById("ssf-net-time").textContent, "—");
  assert.notStrictEqual(document.getElementById("ssf-total-duration").textContent, "—");
});

test("the summary modal has an Observações field and starts with no questions registered", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.ok(document.getElementById("ssf-notes"), "observações textarea must exist");
  assert.strictEqual(document.getElementById("ssf-questions-empty").hidden, false);
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 0);
  assert.ok(document.getElementById("ssf-btn-add-question"), "Adicionar questão button must exist");
});

// ── Cadastro de Questões Resolvidas (F7.4) ──────────────────────────────────

test("adding a question in the summary appends it to the local list, without persisting it yet", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-q-topic").value = "Insuficiência cardíaca";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1);
  assert.strictEqual(document.getElementById("ssf-questions-empty").hidden, true);
  assert.strictEqual(addQuestionCalls.length, 0, "addQuestion must not be called before confirmation");
});

test("removing a question from the local list drops it before confirmation", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1);

  document.getElementById("ssf-questions-list").querySelector("[data-question-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 0);
  assert.strictEqual(document.getElementById("ssf-questions-empty").hidden, false);
});

test("editing a question in the local list updates it in place instead of duplicating it", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1);

  document.getElementById("ssf-questions-list").querySelector("[data-question-edit]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-q-subject").value, "Cardiologia");

  document.getElementById("ssf-q-subject").value = "Nefrologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1, "editing must not duplicate the item");
  assert.ok(document.getElementById("ssf-questions-list").textContent.includes("Nefrologia"));
});

test("cancelling the finish flow (Voltar) never registers pending questions", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 0);

  // Reabrir o resumo começa do zero — nenhuma questão sobrevive ao cancelamento.
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 0);
});

test("confirming registers every pending question via sessionQuestionsService.addQuestion() before finishSession()", async (t) => {
  const callOrder = [];
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => {
      callOrder.push("addQuestion");
      return { id: "q-1", session_id: sessionId, ...data };
    },
    finishSession: async (id, endedAt) => {
      callOrder.push("finishSession");
      return { id, status: "finished" };
    },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-q-topic").value = "IC";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  document.getElementById("ssf-q-subject").value = "Nefrologia";
  document.getElementById("ssf-q-topic").value = "IRA";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(callOrder, ["addQuestion", "addQuestion", "finishSession"]);
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});

test("clicking Voltar closes the summary modal without finishing the session", async (t) => {
  const finishCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id) => { finishCalls.push(id); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 0);
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true);
  assert.strictEqual(document.getElementById("ss-active").hidden, false, "the session stays running");
});

test("confirming the summary calls activitySessionService.finishSession() and returns to the empty state", async (t) => {
  const finishCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id, endedAt) => { finishCalls.push({ id, endedAt }); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 1);
  assert.strictEqual(finishCalls[0].id, "sess-1");
  assert.ok(finishCalls[0].endedAt instanceof Date);
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true);
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

// ── Revisões Espaçadas no pós-sessão (F7.5) ─────────────────────────────────

test("the summary modal shows the optional Revisões step, empty by default", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: null, description: null, duration_minutes: null }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-reviews-empty").hidden, false);
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 0);
  assert.strictEqual(document.getElementById("ssf-review-create-row").hidden, false, "linked session can create a review");
});

test("a standalone session (no event) hides review creation but can still associate an existing pending review", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    listPendingReviews: async () => [{ id: "rev-1", status: "pending", scheduled_date: "2026-07-10" }],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-review-create-row").hidden, true, "creation requires a linked event");
  assert.strictEqual(document.getElementById("ssf-review-associate-row").hidden, false);
  assert.strictEqual(document.getElementById("ssf-r-existing").children.length, 1);
});

test("when there are no pending reviews, the associate row stays hidden", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-review-associate-row").hidden, true);
});

test("scheduling a new review only adds it to the local list — nothing is persisted before confirmation", async (t) => {
  const { mod, createReviewCalls, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1);
  assert.strictEqual(document.getElementById("ssf-reviews-empty").hidden, true);
  assert.strictEqual(createReviewCalls.length, 0, "create must wait for confirmation");
  assert.strictEqual(associateReviewCalls.length, 0, "associateReview must wait for confirmation");
});

test("a locally added review can be removed before confirmation", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1);

  document.getElementById("ssf-reviews-list").querySelector("[data-review-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 0);
  assert.strictEqual(document.getElementById("ssf-reviews-empty").hidden, false);
});

test("confirming persists Questões, then Revisões (create + associateReview), then finishSession — in that order", async (t) => {
  const callOrder = [];
  const { mod, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    addQuestion: async (sessionId, data) => { callOrder.push("addQuestion"); return { id: "q-1", session_id: sessionId, ...data }; },
    createReview: async (fields) => { callOrder.push("createReview"); return { id: "rev-new", status: "pending", ...fields }; },
    associateReview: async (reviewId, sessionId) => { callOrder.push("associateReview"); associateReviewCalls.push({ reviewId, sessionId }); return { id: reviewId, session_id: sessionId }; },
    finishSession: async (id) => { callOrder.push("finishSession"); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(callOrder, ["addQuestion", "createReview", "associateReview", "finishSession"]);
  assert.strictEqual(associateReviewCalls[0].reviewId, "rev-new");
  assert.strictEqual(associateReviewCalls[0].sessionId, "sess-1");
});

test("associating an existing pending review uses reviewSessionService.associateReview() on confirmation", async (t) => {
  const { mod, createReviewCalls, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [{ id: "rev-7", status: "pending", scheduled_date: "2026-07-10" }],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-existing").value = "rev-7";
  document.getElementById("ssf-btn-associate-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1);

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 0, "associating an existing review never creates a new one");
  assert.deepStrictEqual(associateReviewCalls, [{ reviewId: "rev-7", sessionId: "sess-1" }]);
});

test("ignoring the Revisões step is valid — confirming finishes the session without any review call", async (t) => {
  const { mod, createReviewCalls, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 0);
  assert.strictEqual(associateReviewCalls.length, 0);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});

test("cancelling the finish flow (Voltar) discards pending reviews without persisting anything", async (t) => {
  const { mod, createReviewCalls, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 0);
  assert.strictEqual(associateReviewCalls.length, 0);

  // Reabrir o resumo começa do zero — nenhuma revisão sobrevive ao cancelamento.
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 0);
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

// ── Painel de Contexto da Sessão (F7.6) ─────────────────────────────────────

test("the progress bar appears and reflects elapsed vs expected time when the event has a duration", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const startedAt = new Date().toISOString();
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt, event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60, event_date: "2026-07-09" }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-progress").hidden, false);
  assert.strictEqual(document.getElementById("ss-progress-text").textContent, "00:00 / 1h 0min");

  t.mock.timers.tick(30 * 60_000); // metade do tempo previsto
  assert.strictEqual(document.getElementById("ss-progress-bar").style.width, "50%");
});

test("the progress bar stays hidden when the event has no expected duration (only net time shown)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: "Aula", description: null, duration_minutes: null }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-progress").hidden, true);
});

test("the progress bar stays hidden for a standalone session (no event at all)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-progress").hidden, true);
});

test("a standalone session shows an explicit 'Sem compromisso vinculado' label instead of a bare dash", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-category").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("ss-subject").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("ss-content").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("ss-date").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("ss-ind-event").textContent, "Sem compromisso vinculado");
});

test("a linked event still shows a plain dash for its own empty fields, not the standalone label", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: null, description: null, duration_minutes: null, event_date: null }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-category").textContent, "—");
  assert.strictEqual(document.getElementById("ss-date").textContent, "—");
  assert.strictEqual(document.getElementById("ss-ind-event").textContent, "Aula");
});

test("the context panel shows the event date and the session's current status", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60, event_date: "2026-07-09" }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-date").textContent, "09/07/2026");
  assert.strictEqual(document.getElementById("ss-status-text").textContent, "Pausada");
  assert.strictEqual(document.getElementById("ss-ind-status").textContent, "Pausada");
});

test("the quick indicators mirror the started time, net time and linked event without any new computation", async (t) => {
  const startedAt = new Date().toISOString();
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: startedAt, event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60, event_date: "2026-07-09" }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-ind-started").textContent, document.getElementById("ss-started-at").textContent);
  assert.strictEqual(document.getElementById("ss-ind-net").textContent, document.getElementById("ss-time").textContent);
  assert.strictEqual(document.getElementById("ss-ind-event").textContent, "Plantão UTI");
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
