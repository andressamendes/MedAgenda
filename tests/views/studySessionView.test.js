/**
 * Golden path: tela "Sessão de Estudo" (F7.2) — studySessionView.js wired to a
 * mocked activitySessionService.js, exercised through the real DOM (index.html).
 * All domain rules (single running session, duration calc, valid status
 * transitions) live in activitySessionService.js and are tested there; here
 * we only verify the page renders/reacts correctly to what the service
 * returns/throws and to sessionEventBus notifications.
 *
 * F10 #4.3: Questões/Revisões moved from the finish-confirmation modal to the
 * active/paused session card (#ss-active) and are persisted immediately via
 * sessionQuestionsService.js/reviewService.js/reviewSessionService.js —
 * nothing is "pending" anymore. The finish modal (#ss-finish-modal) now only
 * shows a read-only recap plus a single reflection field.
 *
 * F14.3: that field ("O que ficou desta sessão?") no longer writes to
 * activity_sessions.notes — it saves via studyReflectionService.saveReflection(),
 * the same domain the Diário de Estudos already reads/writes.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SERVICE_SPECIFIER          = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTIONS_SERVICE_SPECIFIER = new URL("../../sessionQuestionsService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER            = new URL("../../reviewService.js", import.meta.url).href;
const REVIEW_SESSION_SERVICE_SPECIFIER    = new URL("../../reviewSessionService.js", import.meta.url).href;
const REFLECTION_SERVICE_SPECIFIER        = new URL("../../studyReflectionService.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER    = new URL("../../errorService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;
const CATEGORY_SERVICE_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;
const CONFIRM_DIALOG_SPECIFIER   = new URL("../../confirmDialog.js", import.meta.url).href;
const ABANDONED_DIALOG_SPECIFIER = new URL("../../abandonedSessionDialog.js", import.meta.url).href;
const CLOSE_DAY_SPECIFIER        = new URL("../../closeDayService.js", import.meta.url).href;

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
      listSessions:      overrides.listSessions ?? (async () => ({ sessions: [], total: 0, hasMore: false })),
    },
  });

  const addQuestionCalls = [];
  const updateQuestionCalls = [];
  const removeQuestionCalls = [];
  const listQuestionsCalls = [];
  t.mock.module(QUESTIONS_SERVICE_SPECIFIER, {
    namedExports: {
      addQuestion: overrides.addQuestion ?? (async (sessionId, data) => {
        addQuestionCalls.push({ sessionId, data });
        return { id: `q-${addQuestionCalls.length}`, session_id: sessionId, ...data };
      }),
      listQuestions: overrides.listQuestions ?? (async (sessionId) => {
        listQuestionsCalls.push(sessionId);
        return [];
      }),
      updateQuestion: overrides.updateQuestion ?? (async (questionId, data) => {
        updateQuestionCalls.push({ questionId, data });
        return { id: questionId, ...data };
      }),
      removeQuestion: overrides.removeQuestion ?? (async (questionId) => {
        removeQuestionCalls.push(questionId);
        return true;
      }),
    },
  });

  // Revisões (F7.5) — reviewService.js/reviewSessionService.js importam
  // supabase.js/config.js diretamente, então são mockados aqui como qualquer
  // outra dependência de domínio.
  const createReviewCalls = [];
  const associateReviewCalls = [];
  const unlinkReviewCalls = [];
  const listSessionReviewsCalls = [];
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
      // scheduled_date é sempre preenchido em produção (é a linha completa
      // devolvida pelo UPDATE...SELECT do Supabase) — o mock precisa refletir
      // isso, já que studySessionView._reviewLabel() depende do campo.
      associateReview: overrides.associateReview ?? (async (reviewId, sessionId) => {
        associateReviewCalls.push({ reviewId, sessionId });
        return { id: reviewId, session_id: sessionId, scheduled_date: "2026-07-10" };
      }),
      unlinkReview: overrides.unlinkReview ?? (async (reviewId) => {
        unlinkReviewCalls.push(reviewId);
        return true;
      }),
      listBySession: overrides.listSessionReviews ?? (async (sessionId) => {
        listSessionReviewsCalls.push(sessionId);
        return [];
      }),
    },
  });

  const saveReflectionCalls = [];
  t.mock.module(REFLECTION_SERVICE_SPECIFIER, {
    namedExports: {
      saveReflection: overrides.saveReflection ?? (async (sessionId, content) => {
        saveReflectionCalls.push({ sessionId, content });
        return { session_id: sessionId, content };
      }),
    },
  });

  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      getEventById: overrides.getEventById ?? (async () => null),
      getEvents:    overrides.getEvents ?? (async () => []),
    },
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

  // F14.8 — o chip "Amanhã: {título}" (_loadStartSuggestions) lê/consome o
  // plano gravado por "Fechar o dia"; sem histórico nenhum por padrão, o
  // mesmo padrão vazio de todo o resto deste mock.
  const clearNextStudyPlanCalls = [];
  t.mock.module(CLOSE_DAY_SPECIFIER, {
    namedExports: {
      getNextStudyPlan: overrides.getNextStudyPlan ?? (async () => null),
      clearNextStudyPlan: overrides.clearNextStudyPlan ?? (async () => {
        clearNextStudyPlanCalls.push(true);
      }),
    },
  });

  return import(`../../studySessionView.js?t=${Math.random()}`)
    .then(mod => ({
      mod, handleErrorCalls, confirmDialogCalls, abandonedDialogCalls,
      addQuestionCalls, updateQuestionCalls, removeQuestionCalls, listQuestionsCalls,
      createReviewCalls, associateReviewCalls, unlinkReviewCalls, listSessionReviewsCalls,
      saveReflectionCalls, clearNextStudyPlanCalls,
    }));
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

// F11 E19 (auditoria #22) — o estado vazio segue o padrão composto
// (ícone + título + descrição + CTA) em vez de um parágrafo solto.
test("F11 E19 — the empty state is a composed state-block with icon, title, description and CTA", async (t) => {
  const { mod } = await loadStudySessionView(t);
  await mod.initStudySessionView();

  const empty = document.getElementById("ss-empty");
  assert.ok(empty.classList.contains("state-block"));
  assert.ok(empty.querySelector(".state-block-icon"));
  assert.ok(empty.querySelector(".state-block-title").textContent.length > 0);
  assert.ok(empty.querySelector(".state-block-desc").textContent.length > 0);
  const cta = document.getElementById("ss-btn-start-standalone");
  assert.ok(cta.classList.contains("btn-primary"));
  assert.strictEqual(empty.contains(cta), true);
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

test("clicking 'Iniciar sessão' opens the pre-start modal instead of starting immediately", async (t) => {
  const startSessionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    startSession: async (fields) => { startSessionCalls.push(fields); return { id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-modal").hidden, false);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false, "the session must not start just from opening the modal");
  assert.strictEqual(startSessionCalls.length, 0);
});

test("the 'Novo estudo' path requires a name and never starts a session with blank fields", async (t) => {
  const startSessionCalls = [];
  const { mod, handleErrorCalls } = await loadStudySessionView(t, {
    startSession: async (fields) => { startSessionCalls.push(fields); return { id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionCalls.length, 0, "a blank name must never reach the domain layer");
  assert.strictEqual(handleErrorCalls.length, 0);
  assert.strictEqual(document.getElementById("ss-start-manual-error").hidden, false);
  assert.strictEqual(document.getElementById("ss-start-modal").hidden, false, "the modal stays open so the user can fix the name");
});

test("filling the 'Novo estudo' name and confirming starts a session with Compromisso/Categoria/Conteúdo/Data/Tempo previsto filled in, not blank", async (t) => {
  const startSessionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    startSession: async (fields) => {
      startSessionCalls.push(fields);
      return { id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields };
    },
    getCategories: async () => [{ id: "cat-1", name: "Cardiologia" }],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-start-title-input").value = "Revisão de arritmias";
  document.getElementById("ss-start-category").value = "cat-1";
  document.getElementById("ss-start-content").value = "Fibrilação atrial";
  document.getElementById("ss-start-date").value = "2026-07-18";
  document.getElementById("ss-start-duration").value = "90";
  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionCalls.length, 1);
  assert.deepStrictEqual(startSessionCalls[0], {
    source: "manual",
    title: "Revisão de arritmias",
    category_id: "cat-1",
    content: "Fibrilação atrial",
    session_date: "2026-07-18",
    planned_duration_minutes: 90,
  });

  assert.strictEqual(document.getElementById("ss-start-modal").hidden, true);
  assert.strictEqual(document.getElementById("ss-status-badge").textContent, "Executando");
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Revisão de arritmias");
  assert.strictEqual(document.getElementById("ss-category").textContent, "Cardiologia");
  assert.strictEqual(document.getElementById("ss-content").textContent, "Fibrilação atrial");
  assert.strictEqual(document.getElementById("ss-date").textContent, "18/07/2026");
  assert.strictEqual(document.getElementById("ss-expected-duration").textContent, "1h 30min");
});

test("the 'Compromisso da agenda' path requires selecting an event and starts the linked session on confirm", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getEvents: async () => [{ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60, event_date: "2026-07-20" }],
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60, event_date: "2026-07-20" }),
    startSession: async (fields) => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-start-tab-event").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-event-error").hidden, false, "no event selected yet");
  assert.strictEqual(document.getElementById("ss-start-modal").hidden, false);

  document.getElementById("ss-start-event").value = "evt-1";
  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-modal").hidden, true);
  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Plantão UTI");
});

// F14.2 — início de sessão sem digitação: chips de um toque em cima do modal
// de pré-início, preenchendo o caminho manual ou selecionando um compromisso/
// revisão elegível, sem nunca iniciar a sessão sozinhos.
test("F14.2 — chips show up to 3 distinct recent standalone titles and clicking one fills name+category without starting", async (t) => {
  const startSessionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    listSessions: async () => ({
      sessions: [
        { id: "s5", title: "Revisão de Cardiologia", category_id: "cat-1", event_id: null },
        { id: "s4", title: "Revisão de Cardiologia", category_id: "cat-1", event_id: null }, // duplicate title, must not repeat the chip
        { id: "s3", event_id: "evt-9" }, // event-linked session (no standalone title), must be skipped
        { id: "s2", title: "Farmaco: antibióticos", category_id: null, event_id: null },
        { id: "s1", title: "Anatomia do coração", category_id: null, event_id: null },
        { id: "s0", title: "Estudo antigo demais", category_id: null, event_id: null }, // beyond the 3-chip cap
      ],
    }),
    getCategories: async () => [{ id: "cat-1", name: "Cardiologia" }],
    startSession: async (fields) => { startSessionCalls.push(fields); return { id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const chips = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")];
  assert.strictEqual(document.getElementById("ss-start-suggestions").hidden, false);
  assert.deepStrictEqual(chips.map(c => c.textContent), [
    "Revisão de Cardiologia",
    "Farmaco: antibióticos",
    "Anatomia do coração",
  ]);

  chips[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-start-title-input").value, "Revisão de Cardiologia");
  assert.strictEqual(document.getElementById("ss-start-category").value, "cat-1");
  assert.strictEqual(startSessionCalls.length, 0, "a chip only fills the form — the user still confirms with 'Iniciar sessão'");

  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionCalls.length, 1);
  assert.strictEqual(startSessionCalls[0].title, "Revisão de Cardiologia");
});

test("F14.2 — a chip for today's appointment switches to the event tab and preselects it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  t.mock.timers.setTime(new Date("2026-07-19T12:00:00Z").getTime());

  const { mod } = await loadStudySessionView(t, {
    getEvents: async () => [
      { id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60, event_date: "2026-07-19" },
      { id: "evt-2", title: "Aula de amanhã", category: null, description: null, duration_minutes: null, event_date: "2026-07-20" },
    ],
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60, event_date: "2026-07-19" }),
    startSession: async (fields) => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), ...fields }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const chip = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")]
    .find(c => c.textContent === "Hoje: Plantão UTI");
  assert.ok(chip, "the chip for today's event must be rendered");

  chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-start-tab-event").classList.contains("tab--active"), true);
  assert.strictEqual(document.getElementById("ss-start-event").value, "evt-1");

  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-event-title").textContent, "Plantão UTI");
});

test("F14.2 — a chip for the nearest due review preselects its linked event, skipping today's own appointment", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  t.mock.timers.setTime(new Date("2026-07-19T12:00:00Z").getTime());

  const { mod } = await loadStudySessionView(t, {
    getEvents: async () => [
      { id: "evt-1", title: "Plantão UTI", category: "Plantão", event_date: "2026-07-19" },
      { id: "evt-2", title: "Farmacologia: antiarrítmicos", category: null, event_date: "2026-07-10" },
    ],
    listPendingReviews: async () => [
      { id: "rev-2", event_id: "evt-2", scheduled_date: "2026-07-15" }, // due, oldest
      { id: "rev-3", event_id: "evt-2", scheduled_date: "2026-07-25" }, // not due yet
    ],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const labels = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")].map(c => c.textContent);
  assert.ok(labels.includes("Revisar: Farmacologia: antiarrítmicos"));

  const chip = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")]
    .find(c => c.textContent === "Revisar: Farmacologia: antiarrítmicos");
  chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-start-event").value, "evt-2");
});

test("F14.2 — no chips at all when there is no history, no appointment today and no pending review", async (t) => {
  const { mod } = await loadStudySessionView(t, {});
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-suggestions").hidden, true);
  assert.strictEqual(document.getElementById("ss-start-suggestions").children.length, 0);
});

test("F14.2 — the 'Compromisso da agenda' tab is hidden entirely when there is no appointment to pick from", async (t) => {
  const { mod } = await loadStudySessionView(t, { getEvents: async () => [] });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-tab-event").hidden, true);
});

test("F14.2 — the 'Compromisso da agenda' tab stays visible when at least one appointment exists", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getEvents: async () => [{ id: "evt-1", title: "Plantão UTI", category: null, event_date: "2026-07-30" }],
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-start-tab-event").hidden, false);
});

// F14.8 — o plano de "amanhã" gravado por "Fechar o dia" (todayView.js)
// reaparece aqui como o primeiro chip, à frente dos títulos recentes, e é
// consumido (clearNextStudyPlan()) assim que usado.
test("F14.8 — a saved 'tomorrow' plan shows as the first chip and clicking it fills the form and clears the plan", async (t) => {
  const { mod, clearNextStudyPlanCalls } = await loadStudySessionView(t, {
    getNextStudyPlan: async () => ({ title: "Cardiologia", category_id: "cat-1" }),
    getCategories: async () => [{ id: "cat-1", name: "Cardiologia" }],
    listSessions: async () => ({
      sessions: [{ id: "s1", title: "Anatomia do coração", category_id: null, event_id: null }],
    }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const chips = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")];
  assert.deepStrictEqual(chips.map(c => c.textContent), ["Amanhã: Cardiologia", "Anatomia do coração"]);

  chips[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-start-title-input").value, "Cardiologia");
  assert.strictEqual(document.getElementById("ss-start-category").value, "cat-1");
  assert.strictEqual(clearNextStudyPlanCalls.length, 1);
});

test("F14.8 — with no plan saved, no 'Amanhã' chip is rendered and the plan is never cleared", async (t) => {
  const { mod, clearNextStudyPlanCalls } = await loadStudySessionView(t, {
    listSessions: async () => ({
      sessions: [{ id: "s1", title: "Anatomia do coração", category_id: null, event_id: null }],
    }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const labels = [...document.querySelectorAll("#ss-start-suggestions .ss-suggestion-chip")].map(c => c.textContent);
  assert.ok(!labels.some(l => l.startsWith("Amanhã:")));
  assert.strictEqual(clearNextStudyPlanCalls.length, 0);
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

test("the summary modal has a reflection field and no add-question form (nor the removed read-only recap)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.ok(document.getElementById("ssf-reflection"), "reflection textarea must exist");
  // F10 PR9 — o recap textual ssf-recap-questions/ssf-recap-reviews foi
  // removido: repetia, em prosa, a mesma contagem já visível no título das
  // seções de Questões/Revisões na tela ativa.
  assert.strictEqual(document.getElementById("ssf-recap-questions"), null);
  assert.strictEqual(document.getElementById("ssf-recap-reviews"), null);
  // F10 #4.3 — as ids ssf-questions-list/ssf-btn-add-question etc. deixaram de
  // existir: o cadastro agora vive só em #ss-active, fora do modal.
  assert.strictEqual(document.getElementById("ssf-questions-list"), null);
  assert.strictEqual(document.getElementById("ssf-btn-add-question"), null);
});

// ── Cadastro de Questões Resolvidas (F7.4) — F10 #4.3: persistidas
// imediatamente na tela ativa, não mais "pendentes" no modal de encerramento.

test("adding a question on the active screen persists it immediately via addQuestion() — no need to open Finalizar", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-q-topic").value = "Insuficiência cardíaca";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 1, "addQuestion must be called immediately, independent of the finish modal");
  assert.strictEqual(addQuestionCalls[0].sessionId, "sess-1");
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);
  assert.strictEqual(document.getElementById("ss-questions-empty").hidden, true);
  // Auditoria UX #22: antes, a lista crescendo era o único sinal — fácil de
  // não notar numa lista já longa.
  assert.match(document.querySelector("#toast-container .toast-message").textContent, /Questão adicionada/);
});

// ── F11 E15 (auditoria UX #09) — registro rápido de 1 clique, sem abrir o
// formulário completo.

test("F11 E15 — the quick-add button registers an answered question in a single click, with no form", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-question-form").hidden, true, "the detailed form must stay closed");
  document.getElementById("ss-btn-quick-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 1);
  assert.strictEqual(addQuestionCalls[0].sessionId, "sess-1");
  assert.deepStrictEqual(addQuestionCalls[0].data, {
    question_type: "multiple_choice",
    status:        "answered",
    difficulty:    "medium",
    subject:       null,
    topic:         null,
  });
  assert.strictEqual(document.getElementById("ss-question-form").hidden, true, "the quick path never opens the detailed form");
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);
  assert.strictEqual(document.getElementById("ss-questions-empty").hidden, true);
  assert.match(document.querySelector("#toast-container .toast-message").textContent, /Questão registrada/);
});

test("F11 E15 — the quick-add button does nothing without an active session", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => null,
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-quick-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 0);
});

test("F11 E15 — a double click on the quick-add button never persists the question twice", async (t) => {
  let resolveFirst;
  const localAddQuestionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => new Promise(resolve => {
      resolveFirst = () => { localAddQuestionCalls.push({ sessionId, data }); resolve({ id: "q-1", session_id: sessionId, ...data }); };
    }),
  });
  await mod.initStudySessionView();

  const btnQuick = document.getElementById("ss-btn-quick-question");
  btnQuick.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnQuick.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  resolveFirst();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(localAddQuestionCalls.length, 1, "a double click must not persist the same question twice");
});

test("F11 E15 — a failed quick-add degrades without rendering a not-really-persisted item", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async () => { throw new Error("Falha ao salvar questão"); },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-quick-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 0);
  assert.strictEqual(document.getElementById("ss-btn-quick-question").disabled, false, "the button must re-enable after a failure");
});

// ── Auditoria UX #25: cadastro de questões campo a campo — defaults
// inteligentes (repete matéria/tópico) e foco automático de volta ao
// primeiro campo, para permitir cadência rápida ao lançar várias questões.

test("UX #25 — adding a question repeats the subject/topic in the form for the next one", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-q-topic").value = "Insuficiência cardíaca";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-q-subject").value, "Cardiologia", "matéria não deve ser limpa após adicionar");
  assert.strictEqual(document.getElementById("ss-q-topic").value, "Insuficiência cardíaca");

  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 2, "a segunda questão herda matéria/tópico sem redigitar");
});

test("UX #25 — after adding a question, focus returns to the first field (Tipo) for rapid keyboard entry", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.activeElement, document.getElementById("ss-q-type"));
});

test("removing a question calls removeQuestion() immediately and drops it from the list", async (t) => {
  const { mod, removeQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);

  const questionId = document.getElementById("ss-questions-list").querySelector("[data-question-remove]").getAttribute("data-question-remove");

  document.getElementById("ss-questions-list").querySelector("[data-question-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(removeQuestionCalls, [questionId]);
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 0);
  assert.strictEqual(document.getElementById("ss-questions-empty").hidden, false);
});

test("editing a question calls updateQuestion() with the right id instead of duplicating it locally", async (t) => {
  const { mod, addQuestionCalls, updateQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);
  const addedId = addQuestionCalls[0] && `q-1`;

  document.getElementById("ss-questions-list").querySelector("[data-question-edit]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-q-subject").value, "Cardiologia");
  assert.strictEqual(document.getElementById("ss-btn-add-question").textContent, "Salvar alteração");

  document.getElementById("ss-q-subject").value = "Nefrologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(updateQuestionCalls.length, 1);
  assert.strictEqual(updateQuestionCalls[0].questionId, "q-1");
  assert.strictEqual(updateQuestionCalls[0].data.subject, "Nefrologia");
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1, "editing must not duplicate the item");
  assert.ok(document.getElementById("ss-questions-list").textContent.includes("Nefrologia"));
  // Auditoria UX #22: editar tem seu próprio microfeedback, distinto de adicionar.
  const toasts = document.querySelectorAll("#toast-container .toast-message");
  assert.match(toasts[toasts.length - 1].textContent, /Questão atualizada/);
});

test("adding a question is independent of ever opening the finish modal, and confirming finish does not call addQuestion again", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(addQuestionCalls.length, 1);

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 1, "confirming finish must not call addQuestion again — it was already persisted");
});

test("clicking Voltar just closes the finish modal — there is nothing pending left to discard", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ssf-btn-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 1, "the already-persisted question is untouched by Voltar");
  // Reabrir o resumo mostra o mesmo estado — nada foi perdido nem duplicado.
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1, "still on the active screen too");
});

test("confirming finish only calls finishSession() — it no longer loops over questions/reviews", async (t) => {
  const callOrder = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => {
      callOrder.push("addQuestion");
      return { id: "q-1", session_id: sessionId, ...data };
    },
    finishSession: async (id) => {
      callOrder.push("finishSession");
      return { id, status: "finished" };
    },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-q-subject").value = "Nefrologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
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

// ── BUG 08/09: robustez do encerramento/registro (falha na persistência, clique duplo) ──

test("BUG 08: a failure while persisting a Questão on the active screen keeps the data intact for a retry", async (t) => {
  const { mod, handleErrorCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async () => { throw new Error("Falha ao salvar questão"); },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1, "the failure must be reported");
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 0, "a failed addQuestion never renders a not-really-persisted item");
  assert.strictEqual(document.getElementById("ss-q-subject").value, "Cardiologia", "the typed data survives so the user can retry");
  assert.strictEqual(document.getElementById("ss-active").hidden, false, "the session is still active, not left in limbo");
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
  assert.strictEqual(document.querySelectorAll("#toast-container .toast-success").length, 0);
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
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id) => { finishCalls.push(id); return { id, status: "finished" }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const btnConfirm = document.getElementById("ssf-btn-confirm");
  btnConfirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnConfirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); // clique duplo, mesmo tick
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 1, "finishSession() must run exactly once");
  assert.strictEqual(addQuestionCalls.length, 1, "questions were already persisted on the active screen, never twice");
});

test("prevention of double click: clicking 'Adicionar questão' twice in a row only persists it once", async (t) => {
  const localAddQuestionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => new Promise(resolve => {
      localAddQuestionCalls.push({ sessionId, data });
      setTimeout(() => resolve({ id: "q-1", session_id: sessionId, ...data }), 0);
    }),
  });
  const addQuestionCalls = localAddQuestionCalls;
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const btnAdd = document.getElementById("ss-btn-add-question");
  btnAdd.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnAdd.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(addQuestionCalls.length, 1, "a double click must not persist the same question twice");
});

// ── Confirmação de encerramento sem tela intermediária (F10 #3.4) ──────────
// A tela somente-leitura "Sessão concluída" (F7.10) foi removida: confirmar
// agora fecha o modal de encerramento, mostra um toast de sucesso e navega
// direto para o Diário de Estudos — onde a sessão finalizada (com Questões,
// Revisões e Observações já persistidas) aparece normalmente, sem repetir
// nada numa tela própria.

test("confirming the finish modal closes it, shows a success toast, and navigates straight to the Diário — no intermediate summary screen", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: "2026-07-09T13:00:00.000Z", event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Cardiologia — aula 3", category: "Cardiologia", description: "IC", duration_minutes: 60 }),
    finishSession: async (id, endedAt) => ({
      id, status: "finished", started_at: "2026-07-09T13:00:00.000Z",
      ended_at: endedAt.toISOString(), duration_minutes: 90,
    }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-reflection").value = "Revisar arritmias amanhã.";

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true, "the finish confirmation modal closes");
  assert.strictEqual(document.getElementById("ss-summary-modal"), null, "the read-only summary screen no longer exists in the DOM");

  const successToast = document.querySelector("#toast-container .toast-success");
  assert.ok(successToast, "a success toast confirms the session was recorded");
  assert.match(successToast.textContent, /Diário/);

  assert.strictEqual(document.getElementById("page-journal").hidden, false, "navigates straight to the Diário");
});

// F14.3 — a reflexão digitada no encerramento grava direto em
// studyReflectionService (o mesmo domínio lido/escrito pelo Diário de
// Estudos), não mais em activity_sessions.notes: a distinção
// Observações×Reflexão deixa de ser exposta neste modal.
test("finishSession() no longer receives notes; the typed text is saved via studyReflectionService.saveReflection() instead", async (t) => {
  const finishCalls = [];
  const saveReflectionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id, endedAt) => { finishCalls.push({ id, endedAt }); return { id, status: "finished" }; },
    saveReflection: async (sessionId, content) => { saveReflectionCalls.push({ sessionId, content }); return { session_id: sessionId, content }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-reflection").value = "Revisar arritmias amanhã.";
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(finishCalls.length, 1);
  assert.strictEqual(finishCalls[0].id, "sess-1");
  assert.strictEqual(saveReflectionCalls.length, 1);
  assert.strictEqual(saveReflectionCalls[0].sessionId, "sess-1");
  assert.strictEqual(saveReflectionCalls[0].content, "Revisar arritmias amanhã.");
});

test("leaving the reflection field blank never calls studyReflectionService.saveReflection()", async (t) => {
  const saveReflectionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id) => ({ id, status: "finished" }),
    saveReflection: async (sessionId, content) => { saveReflectionCalls.push({ sessionId, content }); return { session_id: sessionId, content }; },
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(saveReflectionCalls.length, 0);
});

test("clicking Voltar (cancelling the finish flow) never finishes the session or navigates away", async (t) => {
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
  assert.strictEqual(document.querySelectorAll("#toast-container .toast-success").length, 0);
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
  document.getElementById("ss-start-title-input").value = "Revisão de arritmias";
  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(handleErrorCalls.length, 1);
  assert.strictEqual(handleErrorCalls[0].err, domainError);
  assert.strictEqual(document.getElementById("ss-empty").hidden, false);
});

// ── Restauração de Questões/Revisões já persistidas (F10 #4.3) ─────────────
// Ao iniciar/restaurar uma sessão, a tela busca o que já está no banco via
// sessionQuestionsService.listQuestions()/reviewSessionService.listBySession()
// — nada é reconstruído a partir de um estado local perdido no reload.

test("F10 #4.3: restoring a session loads its already-persisted questions and reviews and renders them on the active screen", async (t) => {
  const localListQuestionsCalls = [];
  const localListSessionReviewsCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
    listQuestions: async (sessionId) => {
      localListQuestionsCalls.push(sessionId);
      return [{ id: "q-1", session_id: sessionId, question_type: "multiple_choice", status: "answered", difficulty: "medium", subject: "Cardiologia", topic: "IC" }];
    },
    listSessionReviews: async (sessionId) => {
      localListSessionReviewsCalls.push(sessionId);
      return [{ id: "rev-1", session_id: sessionId, scheduled_date: "2026-07-20" }];
    },
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(localListQuestionsCalls, ["sess-1"]);
  assert.deepStrictEqual(localListSessionReviewsCalls, ["sess-1"]);
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);
  assert.ok(document.getElementById("ss-questions-list").textContent.includes("Cardiologia"));
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1);
});

test("F10 #4.3: pausing and resuming the SAME session does not re-fetch its questions/reviews a second time", async (t) => {
  const { mod, listQuestionsCalls, listSessionReviewsCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(listQuestionsCalls.length, 1);
  assert.strictEqual(listSessionReviewsCalls.length, 1);

  document.getElementById("ss-btn-pause").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ss-btn-resume").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(listQuestionsCalls.length, 1, "pausing/resuming the same session id must not re-fetch");
  assert.strictEqual(listSessionReviewsCalls.length, 1);
});

test("F10 #4.3: starting a brand-new session (different id) does fetch its own questions/reviews", async (t) => {
  const { mod, listQuestionsCalls, listSessionReviewsCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    finishSession: async (id) => ({ id, status: "finished" }),
    startSession: async () => ({ id: "sess-2", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(listQuestionsCalls.length, 1);

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-start-standalone").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ss-start-title-input").value = "Novo estudo";
  document.getElementById("ss-start-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(listQuestionsCalls, ["sess-1", "sess-2"]);
  assert.deepStrictEqual(listSessionReviewsCalls, ["sess-1", "sess-2"]);
});

// ── Revisões Espaçadas durante a sessão ativa (F7.5) — F10 #4.3 ────────────

test("the Revisões section starts empty and shows the create row when a session is linked to an event", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: null, description: null, duration_minutes: null }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-reviews-empty").hidden, false);
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 0);
  assert.strictEqual(document.getElementById("ss-review-create-row").hidden, false, "linked session can create a review");
});

test("a standalone session (no event) hides review creation but can still associate an existing pending review", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    listPendingReviews: async () => [{ id: "rev-1", status: "pending", scheduled_date: "2026-07-10" }],
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-review-create-row").hidden, true, "creation requires a linked event");
  assert.strictEqual(document.getElementById("ss-review-associate-row").hidden, false);
  assert.strictEqual(document.getElementById("ss-r-existing").children.length, 1);
});

test("when there are no pending reviews, the associate row stays hidden", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [],
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-review-associate-row").hidden, true);
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
  await new Promise(r => setTimeout(r, 0));

  const options = [...document.getElementById("ss-r-existing").options].map(o => o.value);
  assert.deepStrictEqual(options, ["rev-free"], "only the unlinked pending review should be offered");
  assert.strictEqual(document.getElementById("ss-review-associate-row").hidden, false);
});

test("BUG 17: if every pending review is already linked elsewhere, the associate row stays hidden", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [
      { id: "rev-linked", status: "pending", scheduled_date: "2026-07-11", session_id: "sess-other" },
    ],
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-review-associate-row").hidden, true);
});

test("creating a new review calls createReview() then associateReview() immediately, in that order", async (t) => {
  const callOrder = [];
  const localCreateReviewCalls = [];
  const localAssociateReviewCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    createReview: async (fields) => {
      callOrder.push("createReview");
      localCreateReviewCalls.push(fields);
      return { id: "rev-new", status: "pending", ...fields };
    },
    associateReview: async (reviewId, sessionId) => {
      callOrder.push("associateReview");
      localAssociateReviewCalls.push({ reviewId, sessionId });
      return { id: reviewId, session_id: sessionId, scheduled_date: "2026-07-14" };
    },
  });
  const createReviewCalls = localCreateReviewCalls;
  const associateReviewCalls = localAssociateReviewCalls;
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-date").value = "2026-07-14";
  document.getElementById("ss-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(callOrder, ["createReview", "associateReview"]);
  assert.strictEqual(createReviewCalls.length, 1);
  assert.strictEqual(createReviewCalls[0].event_id, "evt-1");
  assert.strictEqual(createReviewCalls[0].scheduled_date, "2026-07-14");
  assert.deepStrictEqual(associateReviewCalls, [{ reviewId: "rev-new", sessionId: "sess-1" }]);
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1);
  assert.strictEqual(document.getElementById("ss-reviews-empty").hidden, true);
});

test("associating an existing pending review calls associateReview() immediately, without ever calling createReview()", async (t) => {
  const { mod, createReviewCalls, associateReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    listPendingReviews: async () => [{ id: "rev-7", status: "pending", scheduled_date: "2026-07-10" }],
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-existing").value = "rev-7";
  document.getElementById("ss-btn-associate-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 0, "associating an existing review never creates a new one");
  assert.deepStrictEqual(associateReviewCalls, [{ reviewId: "rev-7", sessionId: "sess-1" }]);
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1);
});

test("removing a review calls unlinkReview() immediately, drops it from the list, and refreshes the associate dropdown", async (t) => {
  let pendingCallCount = 0;
  const { mod, unlinkReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    createReview: async (fields) => ({ id: "rev-new", status: "pending", ...fields }),
    associateReview: async (reviewId, sessionId) => ({ id: reviewId, session_id: sessionId, scheduled_date: "2026-07-14" }),
    listPendingReviews: async () => { pendingCallCount++; return []; },
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));
  const callsAfterInit = pendingCallCount;

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-date").value = "2026-07-14";
  document.getElementById("ss-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1);

  document.getElementById("ss-reviews-list").querySelector("[data-review-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(unlinkReviewCalls, ["rev-new"]);
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 0);
  assert.strictEqual(document.getElementById("ss-reviews-empty").hidden, false);
  // listPendingReviews() is called again after removal so the unlinked review
  // can be offered for re-association.
  assert.ok(pendingCallCount > callsAfterInit, "listPendingReviews must be refreshed after removing a review");
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

// BUG 15 (herdado do fluxo antigo, agora contra duplo clique real em vez de
// duplicata numa lista pendente): _qrBusy evita criar duas revisões
// idênticas se o clique disparar de novo antes do primeiro terminar.
test("BUG 15: clicking Criar revisão twice in a row (double click) only persists one review", async (t) => {
  const localCreateReviewCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    createReview: async (fields) => new Promise(resolve => {
      localCreateReviewCalls.push(fields);
      setTimeout(() => resolve({ id: "rev-new", status: "pending", ...fields }), 0);
    }),
  });
  const createReviewCalls = localCreateReviewCalls;
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-date").value = "2026-07-14";
  const btnCreate = document.getElementById("ss-btn-create-review");
  btnCreate.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnCreate.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 10));

  assert.strictEqual(createReviewCalls.length, 1, "a double click must not persist the same review twice");
});

// BUG 16 (herdado do fluxo antigo): se createReview() teve sucesso mas o
// associateReview() seguinte falha, a revisão já existe no banco sem
// vínculo — retry precisa reaproveitá-la via "Revisão existente" em vez de
// criar uma segunda revisão duplicada para a mesma data.
test("BUG 16: if associateReview() fails right after createReview() succeeds, the orphaned review is offered again instead of silently lost", async (t) => {
  let associateAttempts = 0;
  let pendingCallCount = 0;
  const { mod, createReviewCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    associateReview: async (reviewId, sessionId) => {
      associateAttempts++;
      if (associateAttempts === 1) throw new Error("network drop");
      return { id: reviewId, session_id: sessionId, scheduled_date: "2026-07-14" };
    },
    listPendingReviews: async () => {
      pendingCallCount++;
      // Simula o banco: a revisão órfã criada na 1ª tentativa já existe e
      // está livre para ser oferecida de volta assim que a lista recarrega.
      return associateAttempts >= 1 ? [{ id: "rev-new", status: "pending", scheduled_date: "2026-07-14" }] : [];
    },
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-date").value = "2026-07-14";
  document.getElementById("ss-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 1, "createReview() ran once, before the failure");
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 0, "nothing was linked yet");
  const options = [...document.getElementById("ss-r-existing").options].map(o => o.value);
  assert.deepStrictEqual(options, ["rev-new"], "the orphaned review is offered back for manual association");

  // Reaproveita a revisão órfã em vez de criar outra para a mesma data.
  document.getElementById("ss-r-existing").value = "rev-new";
  document.getElementById("ss-btn-associate-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createReviewCalls.length, 1, "no duplicate review was ever created");
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1);
});

// ── Recap textual removido do modal de encerramento (F10 PR9) ──────────────
// O recap ("N questão(ões) registrada(s)...") repetia, em prosa, a mesma
// contagem já visível no título das seções de Questões/Revisões na tela
// ativa (ex.: "Questões Resolvidas (2)") — zero informação nova.

test("the finish modal no longer has a textual recap of questions/reviews — the count already lives in the active screen's section titles", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-questions-count").textContent, " (1)", "count already visible on the active screen");

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ssf-recap-questions"), null);
  assert.strictEqual(document.getElementById("ssf-recap-reviews"), null);
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
  assert.strictEqual(document.getElementById("ss-expected-duration-row").hidden, true);
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

test("F13.1 — a standalone session hides context rows it has no value for, instead of showing a label or a dash", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-category-row").hidden, true);
  assert.strictEqual(document.getElementById("ss-content-row").hidden, true);
  assert.strictEqual(document.getElementById("ss-date-row").hidden, true);
  assert.strictEqual(document.getElementById("ss-subject"), null, "a linha 'Matéria' duplicava 'Categoria' e foi removida (auditoria UX #05)");
  assert.strictEqual(document.getElementById("ss-objective"), null, "a linha 'Objetivo' sempre exibia '—' (sem campo no domínio) e foi removida (auditoria UX #06)");
});

test("F13.1 — a linked event also hides its own empty fields' rows", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Aula", category: null, description: null, duration_minutes: null, event_date: null }),
  });

  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-category-row").hidden, true);
  assert.strictEqual(document.getElementById("ss-date-row").hidden, true);
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

test("resetStudySessionView() clears the previous user's Questões/Revisões from the DOM too", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    listQuestions: async () => [{ id: "q-1", question_type: "multiple_choice", status: "pending", difficulty: "medium", subject: "Cardiologia", topic: null }],
  });

  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);

  mod.resetStudySessionView();

  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 0);
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

// ── F14.4 — Questões/Revisões nascem sempre expandidas dentro do painel ──
// O painel inteiro já é um nível de disclosure (aberto sob demanda por
// #ss-btn-open-panel); as seções por dentro não têm mais um segundo nível.

test("F14.4 — Questões e Revisões aparecem sempre expandidas dentro do painel, numa sessão nova", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-questions-body").hidden, false);
  assert.strictEqual(document.getElementById("ss-reviews-body").hidden, false);
  assert.strictEqual(document.getElementById("ss-questions-toggle"), null, "the internal disclosure toggle must be gone");
  assert.strictEqual(document.getElementById("ss-reviews-toggle"), null, "the internal disclosure toggle must be gone");
});

// ── F14.4 — "+1 questão" na superfície principal do card ss-active, ao lado
// do gatilho do painel: mesmo caminho de escrita do botão rápido de dentro
// do painel (sqBtnQuick/_quickAddQuestion), sem exigir abrir nada.

test("F14.4 — the '+1 questão' button on the main card registers an answered question in a single click", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-quick-question-main").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 1);
  assert.strictEqual(addQuestionCalls[0].sessionId, "sess-1");
  assert.deepStrictEqual(addQuestionCalls[0].data, {
    question_type: "multiple_choice",
    status:        "answered",
    difficulty:    "medium",
    subject:       null,
    topic:         null,
  });
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1);
  assert.match(document.getElementById("ss-quick-question-main-count").textContent, /1/);
});

test("F14.4 — the '+1 questão' button does nothing without an active session", async (t) => {
  const { mod, addQuestionCalls } = await loadStudySessionView(t, {
    getRunningSession: async () => null,
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-quick-question-main").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(addQuestionCalls.length, 0);
});

test("F14.4 — a double click on the '+1 questão' button never persists the question twice", async (t) => {
  let resolveFirst;
  const localAddQuestionCalls = [];
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
    addQuestion: async (sessionId, data) => new Promise(resolve => {
      resolveFirst = () => { localAddQuestionCalls.push({ sessionId, data }); resolve({ id: "q-1", session_id: sessionId, ...data }); };
    }),
  });
  await mod.initStudySessionView();

  const btnQuickMain = document.getElementById("ss-btn-quick-question-main");
  btnQuickMain.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  btnQuickMain.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  resolveFirst();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(localAddQuestionCalls.length, 1, "a double click must not persist the same question twice");
});

test("F13.1 — 'Mais detalhes' nasce colapsado e revela Conteúdo/Data/Horário/Tempo previsto ao expandir", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: "Sepse", duration_minutes: 60, event_date: "2026-07-19" }),
  });
  await mod.initStudySessionView();

  assert.strictEqual(document.getElementById("ss-context-more").hidden, true);
  assert.strictEqual(document.getElementById("ss-context-more-toggle").getAttribute("aria-expanded"), "false");
  // Compromisso e Categoria continuam sempre visíveis, fora do disclosure.
  assert.strictEqual(document.getElementById("ss-category-row").hidden, false);

  document.getElementById("ss-context-more-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-context-more").hidden, false);
  assert.strictEqual(document.getElementById("ss-context-more-toggle").getAttribute("aria-expanded"), "true");
  assert.strictEqual(document.getElementById("ss-content").textContent, "Sepse");
  assert.strictEqual(document.getElementById("ss-expected-duration").textContent, "1h 0min");
});

test("UX #04 — o contador no título reflete questões/revisões adicionadas sem expandir a seção", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-questions-count").textContent, "");

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-count").textContent, " (1)");

  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-count").textContent, " (2)");

  document.getElementById("ss-questions-list").querySelector("[data-question-remove]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-count").textContent, " (1)");

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-r-date").value = "2099-01-10";
  document.getElementById("ss-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-reviews-count").textContent, " (1)");
});

// ── Formulário inline de questão/revisão atrás de "+ Adicionar..." (F10 #3.3) ──
// O formulário completo (tipo/status/dificuldade/matéria/tópico ou
// associar/criar revisão) fica oculto atrás de um botão "+ Adicionar...", só
// a lista compacta aparece por padrão dentro de cada seção já expandida.

test("F10 #3.3 — o formulário de questão nasce oculto atrás de '+ Adicionar questão'", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-question-form").hidden, true);
  assert.strictEqual(document.getElementById("ss-btn-toggle-question-form").hidden, false);

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-question-form").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-toggle-question-form").hidden, true);
  assert.strictEqual(document.activeElement, document.getElementById("ss-q-type"));
});

test("F10 #3.3 — 'Cancelar' no formulário de questão fecha o formulário e descarta a edição em andamento, sem afetar a lista já adicionada", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1, "a questão adicionada antes do cancelamento continua na lista");

  document.getElementById("ss-btn-cancel-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-question-form").hidden, true);
  assert.strictEqual(document.getElementById("ss-btn-toggle-question-form").hidden, false);
  assert.strictEqual(document.getElementById("ss-questions-list").children.length, 1, "cancelar não remove nenhuma questão já adicionada");
});

test("F10 #3.3 — clicar 'Editar' num item da lista reabre o formulário de questão automaticamente", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  document.getElementById("ss-btn-toggle-question-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-q-subject").value = "Cardiologia";
  document.getElementById("ss-btn-add-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  document.getElementById("ss-btn-cancel-question").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-question-form").hidden, true);

  document.getElementById("ss-questions-list").querySelector("[data-question-edit]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-question-form").hidden, false, "editar deve reabrir o formulário mesmo se estivesse fechado");
  assert.strictEqual(document.getElementById("ss-q-subject").value, "Cardiologia");
});

test("F10 #3.3 — o formulário de revisão nasce oculto atrás de '+ Adicionar revisão'", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString(), event_id: "evt-1" }),
    getEventById: async () => ({ id: "evt-1", title: "Plantão UTI", category: "Plantão", description: null, duration_minutes: 60 }),
  });
  await mod.initStudySessionView();
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-review-form").hidden, true);
  assert.strictEqual(document.getElementById("ss-btn-toggle-review-form").hidden, false);

  document.getElementById("ss-btn-toggle-review-form").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-review-form").hidden, false);
  assert.strictEqual(document.getElementById("ss-btn-toggle-review-form").hidden, true);

  document.getElementById("ss-r-date").value = "2099-01-10";
  document.getElementById("ss-btn-create-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1, "criar revisão continua funcionando com o formulário revelado");

  document.getElementById("ss-btn-cancel-review").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-review-form").hidden, true);
  assert.strictEqual(document.getElementById("ss-reviews-list").children.length, 1, "cancelar não remove a revisão já adicionada");
});

// ── F14.9 — Modo foco ────────────────────────────────────────────────────
// Durante a sessão ativa, oculta header/sidebar/bottom-nav via a classe
// "focus-mode" em #app-screen; o botão "Foco" (dentro do próprio card, que
// nunca é ocultado) liga/desliga o mesmo estado que Esc desfaz.

test("F14.9 — clicking 'Foco' toggles the focus-mode class and the button label/aria-pressed", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  const appScreen = document.getElementById("app-screen");
  const toggle = document.getElementById("ss-btn-focus-toggle");
  const label  = document.getElementById("ss-focus-toggle-label");

  assert.strictEqual(appScreen.classList.contains("focus-mode"), false);
  assert.strictEqual(toggle.getAttribute("aria-pressed"), "false");
  assert.strictEqual(label.textContent, "Foco");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(appScreen.classList.contains("focus-mode"), true);
  assert.strictEqual(toggle.getAttribute("aria-pressed"), "true");
  assert.strictEqual(label.textContent, "Sair do foco");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(appScreen.classList.contains("focus-mode"), false);
  assert.strictEqual(toggle.getAttribute("aria-pressed"), "false");
  assert.strictEqual(label.textContent, "Foco");
});

test("F14.9 — Escape exits focus mode when no modal/panel is open", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-focus-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), true);

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), false);
});

test("F14.9 — Escape does not exit focus mode while the finish modal is open (the modal's own Escape handler takes it)", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-focus-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, false);

  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  // The finish modal's own listener closes the modal; focus mode is
  // untouched by this same Escape press.
  assert.strictEqual(document.getElementById("ss-finish-modal").hidden, true);
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), true);
});

test("F14.9 — finishing the session automatically turns focus mode off", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "running", started_at: new Date().toISOString() }),
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-focus-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), true);

  document.getElementById("ss-btn-finish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.getElementById("ssf-btn-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-active").hidden, true);
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), false);
  assert.strictEqual(document.getElementById("ss-btn-focus-toggle").getAttribute("aria-pressed"), "false");
});

test("F14.9 — cancelling the session automatically turns focus mode off", async (t) => {
  const { mod } = await loadStudySessionView(t, {
    getRunningSession: async () => ({ id: "sess-1", status: "paused", started_at: new Date().toISOString() }),
    confirmDialogResolvesTo: true,
  });
  await mod.initStudySessionView();

  document.getElementById("ss-btn-focus-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), true);

  document.getElementById("ss-btn-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("ss-active").hidden, true);
  assert.strictEqual(document.getElementById("app-screen").classList.contains("focus-mode"), false);
});
