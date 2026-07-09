/**
 * Tests for studyJournalView.js — Diário de Estudos (F8.1).
 * activitySessionService/eventService/sessionQuestionsService/
 * reviewSessionService are mocked: this exercises only rendering,
 * detalhamento (expand/collapse) and pagination against the real DOM
 * (index.html), never a domain rule — those already live in
 * activitySessionService.test.js, sessionQuestionsService.test.js and
 * reviewSessionService.test.js.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SESSION_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const EVENT_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;
const QUESTIONS_SPECIFIER = new URL("../../sessionQuestionsService.js", import.meta.url).href;
const REVIEWS_SPECIFIER  = new URL("../../reviewSessionService.js", import.meta.url).href;
const REFLECTION_SPECIFIER = new URL("../../studyReflectionService.js", import.meta.url).href;
const ERROR_SPECIFIER    = new URL("../../errorService.js", import.meta.url).href;

function loadView(t, overrides = {}) {
  const handleErrorCalls = [];
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: {
      handleError: (err, context) => {
        handleErrorCalls.push({ err, context });
        return { category: "unknown", friendly: overrides.friendlyMessage ?? err.message };
      },
    },
  });

  t.mock.module(SESSION_SPECIFIER, {
    namedExports: {
      listSessions: overrides.listSessions ?? (async () => ({ sessions: [], total: 0, hasMore: false })),
    },
  });

  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEvents: overrides.getEvents ?? (async () => []) },
  });

  t.mock.module(QUESTIONS_SPECIFIER, {
    namedExports: { listQuestions: overrides.listQuestions ?? (async () => []) },
  });

  t.mock.module(REVIEWS_SPECIFIER, {
    namedExports: { listBySession: overrides.listReviewsBySession ?? (async () => []) },
  });

  const saveReflectionCalls = [];
  t.mock.module(REFLECTION_SPECIFIER, {
    namedExports: {
      getBySession: overrides.getReflectionBySession ?? (async () => null),
      saveReflection: overrides.saveReflection ?? (async (sessionId, content) => {
        saveReflectionCalls.push({ sessionId, content });
        return { id: "refl-1", session_id: sessionId, content };
      }),
    },
  });

  return import(`../../studyJournalView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, saveReflectionCalls }));
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
  clearEventBus();
});

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test("empty journal shows the empty-state message and no entries", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [], total: 0, hasMore: false }),
  });

  await mod.initStudyJournalView();

  assert.strictEqual(document.getElementById("sj-list-empty").hidden, false);
  assert.strictEqual(document.getElementById("sj-list").children.length, 0);
  assert.strictEqual(document.getElementById("sj-load-more").hidden, true);
});

test("a single session renders compromisso, categoria, matéria, conteúdo, data, horário, tempo líquido e contagens", async (t) => {
  const session = {
    id: "sess-1", event_id: "event-1", status: "finished",
    started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T09:30:00.000Z",
    duration_minutes: 90, notes: "Revisão de cardiologia",
  };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "event-1", title: "Plantão UPA", category: "Estágio", description: "Rotina de emergência" }],
    listQuestions: async () => [{ id: "q1", question_type: "multiple_choice", status: "answered", subject: "Cardio" }],
    listReviewsBySession: async () => [{ id: "r1", scheduled_date: "2026-03-17", status: "pending" }],
  });

  await mod.initStudyJournalView();

  const list = document.getElementById("sj-list");
  assert.strictEqual(list.children.length, 1);
  const item = list.children[0];
  assert.match(item.textContent, /Plantão UPA/);
  assert.match(item.textContent, /Estágio/);
  assert.match(item.textContent, /Rotina de emergência/);
  assert.match(item.textContent, /1h 30min/);
  assert.match(item.textContent, /1 questão\(ões\)/);
  assert.match(item.textContent, /1 revisão\(ões\)/);
  assert.strictEqual(document.getElementById("sj-list-empty").hidden, true);
});

test("a manual session with no linked event shows a generic label", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  assert.match(document.getElementById("sj-list").textContent, /Sessão avulsa/);
});

test("detail region starts hidden and toggling reveals Questões, Revisões e Observações", async (t) => {
  const session = {
    id: "sess-1", event_id: "event-1", status: "finished",
    started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T09:00:00.000Z",
    duration_minutes: 60, notes: "Foco em ECG",
  };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "event-1", title: "Estudo dirigido", category: "Cardiologia" }],
    listQuestions: async () => [{ id: "q1", question_type: "flashcard", status: "pending", subject: "ECG", topic: "Arritmias" }],
    listReviewsBySession: async () => [{ id: "r1", scheduled_date: "2026-03-17", status: "completed" }],
  });

  await mod.initStudyJournalView();

  const item = document.getElementById("sj-list").children[0];
  const toggleBtn = item.querySelector(".sj-toggle");
  const detailEl = item.querySelector(".sj-entry-detail");

  assert.strictEqual(detailEl.hidden, true);
  assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");

  toggleBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(detailEl.hidden, false);
  assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "true");
  assert.match(detailEl.textContent, /Questões/);
  assert.match(detailEl.textContent, /Flashcard/);
  assert.match(detailEl.textContent, /ECG.*Arritmias|ECG — Arritmias/);
  assert.match(detailEl.textContent, /Revisões/);
  assert.match(detailEl.textContent, /Concluída/);
  assert.match(detailEl.textContent, /Observações/);
  assert.match(detailEl.textContent, /Foco em ECG/);

  toggleBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(detailEl.hidden, true);
  assert.strictEqual(toggleBtn.getAttribute("aria-expanded"), "false");
});

test("a session with no questions/reviews/notes shows the empty placeholders in the detail", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const detailEl = item.querySelector(".sj-entry-detail");
  assert.match(detailEl.textContent, /Nenhuma questão registrada\./);
  assert.match(detailEl.textContent, /Nenhuma revisão vinculada\./);
  assert.match(detailEl.textContent, /Nenhuma observação registrada\./);
  assert.match(detailEl.textContent, /Sem reflexão\./);
  assert.match(detailEl.textContent, /Adicionar reflexão/);
});

// ── Reflexão da Sessão (F8.2) ────────────────────────────────────────────

test("session without a reflection shows 'Sem reflexão' and an 'Adicionar reflexão' button", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => null,
  });

  await mod.initStudyJournalView();
  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  assert.match(reflectionEl.textContent, /Sem reflexão\./);
  assert.ok(reflectionEl.querySelector(".sj-reflection-toggle").textContent.includes("Adicionar reflexão"));
});

test("session with an existing reflection shows its text and an 'Editar reflexão' button", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => ({ id: "refl-1", session_id: "sess-1", content: "Aprendi arritmias." }),
  });

  await mod.initStudyJournalView();
  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  assert.match(reflectionEl.textContent, /Aprendi arritmias\./);
  assert.ok(reflectionEl.querySelector(".sj-reflection-toggle").textContent.includes("Editar reflexão"));
});

test("adding a reflection: filling the textarea and saving calls saveReflection() and shows the saved text", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod, saveReflectionCalls } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => null,
  });

  await mod.initStudyJournalView();
  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const textarea = reflectionEl.querySelector(".sj-reflection-input");
  assert.ok(textarea, "deve mostrar um textarea para editar a reflexão");
  textarea.value = "O que aprendi hoje.";

  reflectionEl.querySelector(".sj-reflection-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(saveReflectionCalls.length, 1);
  assert.deepStrictEqual(saveReflectionCalls[0], { sessionId: "sess-1", content: "O que aprendi hoje." });
  assert.match(reflectionEl.textContent, /O que aprendi hoje\./);
  assert.ok(reflectionEl.querySelector(".sj-reflection-toggle").textContent.includes("Editar reflexão"));
});

test("cancelling the reflection form discards edits and keeps the previous state", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => ({ id: "refl-1", session_id: "sess-1", content: "Texto original." }),
  });

  await mod.initStudyJournalView();
  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  reflectionEl.querySelector(".sj-reflection-input").value = "Texto descartado.";
  reflectionEl.querySelector(".sj-reflection-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.match(reflectionEl.textContent, /Texto original\./);
  assert.strictEqual(reflectionEl.querySelector(".sj-reflection-input"), null);
});

test("a failed save shows a friendly error and keeps the form open", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => null,
    saveReflection: async () => { throw new Error("network down"); },
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initStudyJournalView();
  const item = document.getElementById("sj-list").children[0];
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  reflectionEl.querySelector(".sj-reflection-input").value = "Tentativa.";
  reflectionEl.querySelector(".sj-reflection-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.ok(reflectionEl.querySelector(".sj-reflection-input"), "o formulário deve continuar aberto após falha");
  const errorEl = reflectionEl.querySelector(".sj-reflection-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sem conexão com a internet\./);
});

test("load-more button appears when there are more pages and fetches the next offset", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      calls.push(opts);
      if (opts.offset === 0) {
        return { sessions: [{ id: "sess-1", status: "finished", started_at: "2026-01-01T08:00:00.000Z", ended_at: "2026-01-01T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: true };
      }
      return { sessions: [{ id: "sess-2", status: "finished", started_at: "2026-01-02T08:00:00.000Z", ended_at: "2026-01-02T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: false };
    },
  });

  await mod.initStudyJournalView();

  const loadMoreBtn = document.getElementById("sj-load-more");
  assert.strictEqual(loadMoreBtn.hidden, false);
  assert.strictEqual(document.getElementById("sj-list").children.length, 1);
  assert.strictEqual(calls[0].status, "finished");

  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(calls[1].offset, 1);
  assert.strictEqual(document.getElementById("sj-list").children.length, 2);
  assert.strictEqual(loadMoreBtn.hidden, true);
});

test("a load error shows the friendly message with a retry button", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    listSessions: async () => { throw new Error("network down"); },
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initStudyJournalView();

  const emptyEl = document.getElementById("sj-list-empty");
  assert.strictEqual(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Sem conexão com a internet\./);
  assert.ok(emptyEl.querySelector(".list-error-retry"));
  assert.strictEqual(handleErrorCalls[0].context.context, "studyJournalView.load");
});

test("retrying after a load error clears the error state on success", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    listSessions: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { sessions: [{ id: "sess-1", status: "finished", started_at: "2026-01-01T08:00:00.000Z", ended_at: "2026-01-01T08:30:00.000Z", duration_minutes: 30 }], total: 1, hasMore: false };
    },
  });

  await mod.initStudyJournalView();
  const retryBtn = document.querySelector(".list-error-retry");
  assert.ok(retryBtn);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(document.getElementById("sj-list-empty").hidden, true);
  assert.strictEqual(document.getElementById("sj-list").children.length, 1);
});

// ── Sincronização com o barramento de eventos ───────────────────────────────

test("publishing SessionFinished triggers a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initStudyJournalView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1);
});

test("publishing SessionCancelled and SessionUpdated also trigger a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initStudyJournalView();
  calls.length = 0;

  publish(SESSION_EVENTS.CANCELLED, { id: "sess-1", status: "cancelled" });
  publish(SESSION_EVENTS.UPDATED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1, "eventos na mesma tick devem coalescer em uma única recarga");
});

test("SessionStarted, SessionPaused and SessionResumed do not trigger a reload (diário só mostra sessões concluídas)", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initStudyJournalView();
  calls.length = 0;

  publish(SESSION_EVENTS.STARTED, { id: "sess-1", status: "running" });
  publish(SESSION_EVENTS.PAUSED, { id: "sess-1", status: "paused" });
  publish(SESSION_EVENTS.RESUMED, { id: "sess-1", status: "running" });
  await tick();

  assert.strictEqual(calls.length, 0);
});

test("resetStudyJournalView() unsubscribes from the event bus: further events do not reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initStudyJournalView();
  mod.resetStudyJournalView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  publish(SESSION_EVENTS.CANCELLED, { id: "sess-1", status: "cancelled" });
  publish(SESSION_EVENTS.UPDATED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 0);
});

test("re-initializing does not register duplicate listeners", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initStudyJournalView();
  await mod.initStudyJournalView();
  await mod.initStudyJournalView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1, "um único evento deve disparar exatamente uma recarga, independente de quantas vezes init rodou");
});
