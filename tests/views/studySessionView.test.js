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
const ABANDONED_DIALOG_SPECIFIER = new URL("../../abandonedSessionDialog.js", import.meta.url).href;

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

  const abandonedDialogCalls = [];
  t.mock.module(ABANDONED_DIALOG_SPECIFIER, {
    namedExports: {
      abandonedSessionDialog: async (opts) => {
        abandonedDialogCalls.push(opts);
        return overrides.abandonedDialogResolvesTo ?? "continue";
      },
    },
  });

  return import(`../../studySessionView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, confirmDialogCalls, addQuestionCalls, createReviewCalls, associateReviewCalls, abandonedDialogCalls }));
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
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Sessão sem compromisso");
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

test("BUG 07: restoring a paused session (reload/navigation) freezes the chronometer at the time already elapsed before the pause, not inflated by how long it has stayed paused since", async (t) => {
  const now = Date.now();
  const { mod } = await loadStudySessionView(t, {
    // Sessão iniciada há 10min, pausada há 5min (pausa ainda aberta,
    // paused_ms ainda não contabiliza esse intervalo corrente) — o tempo
    // líquido correto até o instante da pausa é 5min, não 10min.
    getRunningSession: async () => ({
      id: "sess-1",
      status: "paused",
      started_at: new Date(now - 10 * 60 * 1000).toISOString(),
      paused_at: new Date(now - 5 * 60 * 1000).toISOString(),
      paused_ms: 0,
    }),
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-time").textContent, "05:00");
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
  // Auditoria UX #22: cancelar não deixava nenhum rastro além do sumiço da
  // tela — diferente de finalizar, que abre o resumo (F7.3).
  assert.match(document.querySelector("#toast-container .toast-message").textContent, /cancelada/i);
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
  assert.strictEqual(document.getElementById("ssf-subject"), null, "a linha 'Matéria' duplicava 'Categoria' e foi removida (auditoria UX #05)");
  assert.strictEqual(document.getElementById("ssf-content").textContent, "Revisar sepse");
  assert.notStrictEqual(document.getElementById("ssf-started-at").textContent, "—");
  assert.notStrictEqual(document.getElementById("ssf-ended-at").textContent, "—");
  assert.notStrictEqual(document.getElementById("ssf-net-time").textContent, "—");
  // A linha "Duração total" recebia o mesmo netMinutes de "Tempo líquido" e foi removida (auditoria UX #08).
  assert.strictEqual(document.getElementById("ssf-total-duration"), null);
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
  // Auditoria UX #22: antes, a lista crescendo era o único sinal — fácil de
  // não notar numa lista já longa.
  assert.match(document.querySelector("#toast-container .toast-message").textContent, /Questão adicionada/);
});

// ── Auditoria UX #25: cadastro de questões campo a campo — defaults
// inteligentes (repete matéria/tópico) e foco automático de volta ao
// primeiro campo, para permitir cadência rápida ao lançar várias questões.

test("UX #25 — adding a question repeats the subject/topic in the form for the next one", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-q-topic").value = "Insuficiência cardíaca";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-q-subject").value, "Cardiologia", "matéria não deve ser limpa após adicionar");
  assert.strictEqual(document.getElementById("ssf-q-topic").value, "Insuficiência cardíaca");

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 2, "a segunda questão herda matéria/tópico sem redigitar");
});

test("UX #25 — after adding a question, focus returns to the first field (Tipo) for rapid keyboard entry", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.activeElement, document.getElementById("ssf-q-type"));
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
  // Auditoria UX #22: editar tem seu próprio microfeedback, distinto de adicionar.
  const toasts = document.querySelectorAll("#toast-container .toast-message");
  assert.match(toasts[toasts.length - 1].textContent, /Questão atualizada/);
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

// ── BUG 08/09: robustez do encerramento (falha na persistência, clique duplo) ──

test("BUG 08: a failure while persisting a Questão keeps the summary modal open with the pending data intact", async (t) => {
  const finishCalls = [];
  const { mod, handleErrorCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async () => { throw new Error("Falha ao salvar questão"); },
    finishSession: async (id) => { finishCalls.push(id); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1, "the failure must be reported");
  assert.strictEqual(finishCalls.length, 0, "finishSession must never run after a failed step");
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, false, "the summary must stay open — never close silently on failure");
  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true, "the final summary must not open when nothing was actually finished");
  assert.strictEqual(document.getElementById("ss-active").hidden, false, "the session is still active, not left in limbo");
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1, "the pending question must survive the failed attempt so the user can retry");
});

test("BUG 08: a failure in finishSession() itself keeps the summary modal open instead of discarding it", async (t) => {
  const { mod, handleErrorCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async () => { throw new Error("Falha ao encerrar sessão"); },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1);
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, false);
  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true);
});

test("BUG 09: Confirmar encerramento and Voltar are disabled while a confirmation is in flight, and re-enabled after", async (t) => {
  let resolveFinish;
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id) => new Promise(resolve => { resolveFinish = () => resolve({ id, status: "finished" }); }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const btnConfirm = document.getElementById("ssf-btn-confirm");
  const btnBack = document.getElementById("ssf-btn-back");
  assert.strictEqual(btnConfirm.disabled, false, "the button must be reachable/enabled before confirming");

  btnConfirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(btnConfirm.disabled, true, "disabled while finishSession() is in flight — prevents a double click");
  assert.strictEqual(btnBack.disabled, true);

  resolveFinish();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true);
});

test("prevention of double click: clicking Confirmar encerramento twice in a row only finishes the session once", async (t) => {
  const finishCalls = [];
  const addQuestionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => { addQuestionCalls.push({ sessionId, data }); return { id: "q-1", session_id: sessionId, ...data }; },
    finishSession: async (id) => { finishCalls.push(id); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const btnConfirm = document.getElementById("ssf-btn-confirm");
  btnConfirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnConfirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); // clique duplo, mesmo tick
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 1, "finishSession() must run exactly once");
  assert.strictEqual(addQuestionCalls.length, 1, "questions must not be persisted twice");
});

// ── Resumo Final da Sessão concluída (F7.10) ────────────────────────────────

test("confirming the summary opens the final session summary with the counts and notes just persisted", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: "2026-07-09T13:00:00.000Z", event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Cardiologia — aula 3", category: "Cardiologia", description: "IC", duration_minutes: 60 }),
    finishSession: async (id, endedAt) => ({
      id, status: "finished", started_at: "2026-07-09T13:00:00.000Z",
      ended_at: endedAt.toISOString(), duration_minutes: 90,
    }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-notes").value = "Revisar arritmias amanhã.";

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true, "the finish confirmation modal closes first");
  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, false, "the final summary opens right after");
  assert.strictEqual(document.getElementById("sss-event-title").textContent, "Cardiologia — aula 3");
  assert.strictEqual(document.getElementById("sss-card-questions").textContent, "1");
  assert.strictEqual(document.getElementById("sss-card-reviews").textContent, "0");
  assert.strictEqual(document.getElementById("sss-card-net-time").textContent, "1h 30min");
  assert.strictEqual(document.getElementById("sss-card-status").textContent, "Concluída");
  assert.strictEqual(document.getElementById("sss-notes").textContent, "Revisar arritmias amanhã.");
});

test("clicking Voltar (cancelling the finish flow) never opens the final summary", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true);
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

// BUG 17: reviewService.listPending() nunca filtra por session_id — uma
// revisão continua "pending" mesmo já associada a outra Sessão. Oferecê-la
// de novo no dropdown levaria a uma confirmação que falha (associateReview()
// agora rejeita) ou, antes da correção, a roubar o vínculo em silêncio.
test("BUG 17: a pending review already linked to another session is excluded from the associate dropdown", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [
      { id: "rev-free", status: "pending", scheduled_date: "2026-07-10", session_id: null },
      { id: "rev-linked", status: "pending", scheduled_date: "2026-07-11", session_id: "sess-other" },
    ],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const options = [...document.getElementById("ssf-r-existing").options].map(o => o.value);
  assert.deepStrictEqual(options, ["rev-free"], "only the unlinked pending review should be offered");
  assert.strictEqual(document.getElementById("ssf-review-associate-row").hidden, false);
});

test("BUG 17: if every pending review is already linked elsewhere, the associate row stays hidden", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [
      { id: "rev-linked", status: "pending", scheduled_date: "2026-07-11", session_id: "sess-other" },
    ],
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

// BUG 15: clicar "Criar revisão" duas vezes com a mesma data enfileirava duas
// entradas idênticas, e a confirmação virava dois INSERTs separados —
// revisão duplicada. Mesma proteção que já existia para revisões existentes
// (_addPendingReviewAssociation) precisa existir para revisões novas.
test("BUG 15: adding an identical new-review entry twice (same date) does not queue a duplicate", async (t) => {
  const { mod, createReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1, "the second identical entry must not be queued");

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 1, "only one review should be persisted");
});

// A different date is a legitimate, distinct review — the dedup guard must
// not be so broad that it blocks two different "create" entries.
test("BUG 15 (regression guard): two new-review entries with different dates both queue and persist", async (t) => {
  const { mod, createReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-r-date").value = "2026-07-21";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 2);

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 2);
});

// BUG 16: se associateReview() falha no meio do loop de confirmação, o
// resumo permanece aberto com _pendingReviews intactos para o usuário
// corrigir e confirmar de novo (BUG 08). Reprocessar do zero recriava
// reviewService.create() para uma revisão já persistida com sucesso na
// tentativa anterior — revisão duplicada no retry.
test("BUG 16: retrying confirmation after a partial failure does not recreate a review already persisted", async (t) => {
  const associateAttempts = [];
  const { mod, createReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    associateReview: async (reviewId, sessionId) => {
      associateAttempts.push({ reviewId, sessionId });
      if (associateAttempts.length === 1) throw Object.assign(new Error("network blip"), { code: "NETWORK_ERROR" });
      return { id: reviewId, session_id: sessionId };
    },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-r-date").value = "2026-07-14";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  // First attempt: createReview() succeeds, associateReview() throws — the
  // modal stays open (BUG 08) with the same pending review still queued.
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(createReviewCalls.length, 1, "first attempt creates exactly one review");
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1, "the pending review survives the failed attempt");

  // Retry: same review must be re-associated, never recreated.
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 1, "retry must not create a duplicate review");
  assert.strictEqual(associateAttempts.length, 2, "associateReview() is retried for the same review");
  assert.strictEqual(associateAttempts[1].reviewId, associateAttempts[0].reviewId, "both attempts target the same, already-created review");
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
  assert.strictEqual(document.getElementById("ss-subject"), null, "a linha 'Matéria' duplicava 'Categoria' e foi removida (auditoria UX #05)");
  assert.strictEqual(document.getElementById("ss-objective"), null, "a linha 'Objetivo' sempre exibia '—' (sem campo no domínio) e foi removida (auditoria UX #06)");
  assert.strictEqual(document.getElementById("ss-content").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("ss-date").textContent, "Sem compromisso vinculado");
});

test("a linked event still shows a plain dash for its own empty fields, not the standalone label", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: null, description: null, duration_minutes: null, event_date: null }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-category").textContent, "—");
  assert.strictEqual(document.getElementById("ss-date").textContent, "—");
});

test("the context panel shows the event date, and the session status lives only in the badge", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60, event_date: "2026-07-09" }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-date").textContent, "09/07/2026");
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Pausada");
  // A linha "Status" do contexto duplicava o badge (auditoria UX #07).
  assert.strictEqual(document.getElementById("ss-status-text"), null);
});

test("UX #07 — the quick-indicators block no longer exists: timer, badge and context panel are the single sources", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Revisar sepse", duration_minutes: 60, event_date: "2026-07-09" }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.querySelector(".ss-indicators"), null);
  for (const id of ["ss-ind-started", "ss-ind-net", "ss-ind-status", "ss-ind-event"]) {
    assert.strictEqual(document.getElementById(id), null, `${id} duplicava timer/badge/painel de contexto`);
  }
  // Os dados continuam disponíveis uma única vez cada.
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Plantão UTI");
  assert.notStrictEqual(document.getElementById("ss-started-at").textContent, "—");
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

test("resetStudySessionView() clears the previous user's event title/category text — not just hides the section (no data survives logout)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({
      id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1",
    }),
    getEventById: async (id) => (id === "evt-1" ? { id, title: "Prova de Anatomia", category: "Anatomia", description: null, duration_minutes: null } : null),
  });

  await mod.initStudySessionView();
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Prova de Anatomia");

  mod.resetStudySessionView();

  // Simetria A1.3: mesmo com a seção ativa oculta (activeEl.hidden = true),
  // o texto do usuário anterior não pode continuar presente no DOM.
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "");
  assert.strictEqual(document.getElementById("ss-category").textContent, "");
  assert.strictEqual(document.getElementById("ss-started-at").textContent, "");
});

// ── F7.9 — Tratamento de Sessões abandonadas ────────────────────────────────
// A restauração automática (F7.8) continua intocada para sessões recentes;
// só uma sessão "running"/"paused" com started_at anterior a 24h aciona o
// diálogo de decisão — que nunca decide sozinho: "continuar" não chama nada,
// "finalizar"/"cancelar" chamam exatamente finishSession()/cancelSession().
const OLD_STARTED_AT = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h atrás

test("a recent session is restored automatically without prompting the abandoned-session dialog", async (t) => {
  const { mod, abandonedDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  const restored = await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(restored, true);
  assert.strictEqual(abandonedDialogCalls.length, 0);
  assert.strictEqual(document.getElementById("ss-active").hidden, false);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
});

test("a session older than 24h is restored to the screen and also prompts the abandoned-session dialog", async (t) => {
  const { mod, abandonedDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: OLD_STARTED_AT }),
  });

  const restored = await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(restored, true, "the session is still restored — no automatic decision is made");
  assert.strictEqual(document.getElementById("ss-active").hidden, false);
  assert.strictEqual(abandonedDialogCalls.length, 1);
  assert.strictEqual(abandonedDialogCalls[0].startedAt, OLD_STARTED_AT);
});

test("choosing 'continue' in the abandoned-session dialog leaves the session exactly as restored", async (t) => {
  const { mod, abandonedDialogCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: OLD_STARTED_AT }),
    abandonedDialogResolvesTo: "continue",
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(abandonedDialogCalls.length, 1);
  assert.strictEqual(document.getElementById("ss-active").hidden, false);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Pausada");
});

test("choosing 'finish' in the abandoned-session dialog calls exactly activitySessionService.finishSession()", async (t) => {
  const finishCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: OLD_STARTED_AT }),
    abandonedDialogResolvesTo: "finish",
    finishSession: async (id) => {
      finishCalls.push(id);
      return { id, status: "finished" };
    },
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(finishCalls, ["sess-1"]);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);
});

test("choosing 'cancel' in the abandoned-session dialog calls exactly activitySessionService.cancelSession()", async (t) => {
  const cancelCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: OLD_STARTED_AT }),
    abandonedDialogResolvesTo: "cancel",
    cancelSession: async (id) => {
      cancelCalls.push(id);
      return { id, status: "cancelled" };
    },
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(cancelCalls, ["sess-1"]);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-active").hidden, true);
});

// ── Seções colapsáveis do resumo de encerramento (auditoria UX #04) ────────
// Questões e Revisões são etapas opcionais: nascem fechadas a cada abertura
// do resumo (o essencial — resumo + Confirmar — fica visível sem rolagem) e
// o contador no título reflete o que foi adicionado sem precisar expandir.

test("UX #04 — Questões e Revisões abrem colapsadas, com aria-expanded=false, a cada abertura do resumo", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-questions-body").hidden, true);
  assert.strictEqual(document.getElementById("ssf-reviews-body").hidden, true);
  assert.strictEqual(document.getElementById("ssf-questions-toggle").getAttribute("aria-expanded"), "false");
  assert.strictEqual(document.getElementById("ssf-reviews-toggle").getAttribute("aria-expanded"), "false");

  // Expande, fecha o resumo e reabre — a seção volta fechada (nunca herda o
  // estado da abertura anterior).
  document.getElementById("ssf-questions-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-body").hidden, false);
  assert.strictEqual(document.getElementById("ssf-questions-toggle").getAttribute("aria-expanded"), "true");
  assert.strictEqual(document.getElementById("ssf-questions-toggle").textContent, "Ocultar");

  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-questions-body").hidden, true);
  assert.strictEqual(document.getElementById("ssf-questions-toggle").textContent, "Mostrar");
});

test("UX #04 — o contador do título reflete questões/revisões adicionadas sem expandir a seção", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-questions-count").textContent, "");

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-count").textContent, " (1)");

  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-count").textContent, " (2)");

  document.getElementById("ssf-questions-list").querySelector("[data-question-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-count").textContent, " (1)");

  document.getElementById("ssf-r-date").value = "2099-01-10";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-reviews-count").textContent, " (1)");
});

// ── Formulário inline de questão/revisão atrás de "+ Adicionar..." (F10 #3.3) ──
// Antes, o formulário completo (tipo/status/dificuldade/matéria/tópico ou
// associar/criar revisão) ficava sempre visível abaixo da lista, mesmo sem
// nenhuma questão/revisão sendo adicionada naquele momento. Agora ele nasce
// oculto atrás de um botão "+ Adicionar...", só a lista compacta some por
// padrão dentro da seção já expandida.

test("F10 #3.3 — o formulário de questão nasce oculto atrás de '+ Adicionar questão', e reabrir o resumo o mantém oculto", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-question-form").hidden, true);
  assert.strictEqual(document.getElementById("ssf-btn-toggle-question-form").hidden, false);

  document.getElementById("ssf-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-question-form").hidden, false);
  assert.strictEqual(document.getElementById("ssf-btn-toggle-question-form").hidden, true);
  assert.strictEqual(document.activeElement, document.getElementById("ssf-q-type"));

  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-question-form").hidden, true, "reabrir o resumo não deve herdar o formulário aberto na sessão anterior");
  assert.strictEqual(document.getElementById("ssf-btn-toggle-question-form").hidden, false);
});

test("F10 #3.3 — 'Cancelar' no formulário de questão fecha o formulário e descarta a edição em andamento, sem afetar a lista já adicionada", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1, "a questão adicionada antes do cancelamento continua na lista");

  document.getElementById("ssf-btn-cancel-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-question-form").hidden, true);
  assert.strictEqual(document.getElementById("ssf-btn-toggle-question-form").hidden, false);
  assert.strictEqual(document.getElementById("ssf-questions-list").children.length, 1, "cancelar não remove nenhuma questão já adicionada");
});

test("F10 #3.3 — clicar 'Editar' num item da lista reabre o formulário de questão automaticamente", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-q-subject").value = "Cardiologia";
  document.getElementById("ssf-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-btn-cancel-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-question-form").hidden, true);

  document.getElementById("ssf-questions-list").querySelector("[data-question-edit]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-question-form").hidden, false, "editar deve reabrir o formulário mesmo se estivesse fechado");
  assert.strictEqual(document.getElementById("ssf-q-subject").value, "Cardiologia");
});

test("F10 #3.3 — o formulário de revisão nasce oculto atrás de '+ Adicionar revisão'", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-review-form").hidden, true);
  assert.strictEqual(document.getElementById("ssf-btn-toggle-review-form").hidden, false);

  document.getElementById("ssf-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-review-form").hidden, false);
  assert.strictEqual(document.getElementById("ssf-btn-toggle-review-form").hidden, true);

  document.getElementById("ssf-r-date").value = "2099-01-10";
  document.getElementById("ssf-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1, "criar revisão continua funcionando com o formulário revelado");

  document.getElementById("ssf-btn-cancel-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ssf-review-form").hidden, true);
  assert.strictEqual(document.getElementById("ssf-reviews-list").children.length, 1, "cancelar não remove a revisão já adicionada");
});
