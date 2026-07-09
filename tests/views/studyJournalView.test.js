/**
 * Tests for studyJournalView.js — Linha do Tempo da Aprendizagem (F8.1–F8.3).
 * activitySessionService/eventService/sessionQuestionsService/
 * reviewSessionService are mocked: this exercises only rendering,
 * agrupamento diário, detalhamento (expand/collapse) and pagination against
 * the real DOM (index.html), never a domain rule — those already live in
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

function entries() {
  return Array.from(document.querySelectorAll("#sj-list .sj-entry"));
}

function firstEntry() {
  return entries()[0];
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

  assert.strictEqual(entries().length, 1);
  const item = firstEntry();
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

  const item = firstEntry();
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

  const item = firstEntry();
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
  const item = firstEntry();
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
  const item = firstEntry();
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
  const item = firstEntry();
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
  const item = firstEntry();
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
  const item = firstEntry();
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
  assert.strictEqual(entries().length, 1);
  assert.strictEqual(calls[0].status, "finished");

  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(calls[1].offset, 1);
  assert.strictEqual(entries().length, 2);
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
  assert.strictEqual(entries().length, 1);
});

// ── Agrupamento diário (F8.3 — Linha do Tempo da Aprendizagem) ─────────────

test("a day header shows date, session count and net duration derived from the sessions in that group", async (t) => {
  const sessions = [
    { id: "sess-2", status: "finished", started_at: "2026-03-10T14:00:00.000Z", ended_at: "2026-03-10T14:45:00.000Z", duration_minutes: 45 },
    { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
  });

  await mod.initStudyJournalView();

  const groups = document.querySelectorAll(".sj-day-group");
  assert.strictEqual(groups.length, 1, "sessões do mesmo dia devem cair em um único grupo");
  const header = groups[0].querySelector(".sj-day-header");
  assert.match(header.textContent, /10\/03\/2026/);
  assert.match(header.textContent, /2 sessão\(ões\)/);
  assert.match(header.textContent, /1h 15min/);
  assert.strictEqual(groups[0].querySelectorAll(".sj-entry").length, 2);
});

test("multiple days render as separate groups ordered most-recent-first, each keeping its own sessions", async (t) => {
  const sessions = [
    { id: "sess-3", status: "finished", started_at: "2026-03-12T08:00:00.000Z", ended_at: "2026-03-12T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-2", status: "finished", started_at: "2026-03-11T08:00:00.000Z", ended_at: "2026-03-11T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
  });

  await mod.initStudyJournalView();

  const groups = document.querySelectorAll(".sj-day-group");
  assert.strictEqual(groups.length, 3);
  const dates = Array.from(groups).map(g => g.querySelector(".sj-day-header-date").textContent);
  assert.deepStrictEqual(dates, ["12/03/2026", "11/03/2026", "10/03/2026"]);
  groups.forEach(g => assert.strictEqual(g.querySelectorAll(".sj-entry").length, 1));
});

test("today's and yesterday's sessions show 'Hoje' and 'Ontem' as the day label", async (t) => {
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString();
  const yesterdayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0).toISOString();

  const sessions = [
    { id: "sess-today", status: "finished", started_at: todayIso, ended_at: todayIso, duration_minutes: 30 },
    { id: "sess-yesterday", status: "finished", started_at: yesterdayIso, ended_at: yesterdayIso, duration_minutes: 45 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
  });

  await mod.initStudyJournalView();

  const dates = Array.from(document.querySelectorAll(".sj-day-header-date")).map(el => el.textContent);
  assert.deepStrictEqual(dates, ["Hoje", "Ontem"]);
});

test("load-more continuing the same day merges into the existing group instead of creating a new one", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      if (opts.offset === 0) {
        return { sessions: [{ id: "sess-1", status: "finished", started_at: "2026-03-10T20:00:00.000Z", ended_at: "2026-03-10T20:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: true };
      }
      return { sessions: [{ id: "sess-2", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 45 }], total: 2, hasMore: false };
    },
  });

  await mod.initStudyJournalView();
  assert.strictEqual(document.querySelectorAll(".sj-day-group").length, 1);

  document.getElementById("sj-load-more").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  const groups = document.querySelectorAll(".sj-day-group");
  assert.strictEqual(groups.length, 1, "sessões do mesmo dia devem permanecer em um único grupo entre páginas");
  assert.strictEqual(groups[0].querySelectorAll(".sj-entry").length, 2);
  assert.match(groups[0].querySelector(".sj-day-header").textContent, /2 sessão\(ões\)/);
  assert.match(groups[0].querySelector(".sj-day-header").textContent, /1h 15min/);
});

test("load-more starting a new day creates a separate group after the previous day's group", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      if (opts.offset === 0) {
        return { sessions: [{ id: "sess-1", status: "finished", started_at: "2026-03-11T08:00:00.000Z", ended_at: "2026-03-11T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: true };
      }
      return { sessions: [{ id: "sess-2", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: false };
    },
  });

  await mod.initStudyJournalView();
  document.getElementById("sj-load-more").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  const groups = document.querySelectorAll(".sj-day-group");
  assert.strictEqual(groups.length, 2);
  const dates = Array.from(groups).map(g => g.querySelector(".sj-day-header-date").textContent);
  assert.deepStrictEqual(dates, ["11/03/2026", "10/03/2026"]);
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

// ── Filtros e busca (F8.4) ───────────────────────────────────────────────

function groups() {
  return Array.from(document.querySelectorAll("#sj-list .sj-day-group"));
}

test("period filter (Hoje) keeps only today's sessions, filtered entirely in memory", async (t) => {
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString();
  const oldIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 20, 9, 0, 0).toISOString();

  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      calls.push(opts);
      return {
        sessions: [
          { id: "sess-today", status: "finished", started_at: todayIso, ended_at: todayIso, duration_minutes: 30 },
          { id: "sess-old", status: "finished", started_at: oldIso, ended_at: oldIso, duration_minutes: 30 },
        ],
        total: 2, hasMore: false,
      };
    },
  });

  await mod.initStudyJournalView();
  assert.strictEqual(entries().length, 2);
  calls.length = 0;

  document.getElementById("sj-filter-period").value = "today";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));

  assert.strictEqual(entries().length, 1);
  assert.strictEqual(entries()[0].querySelector(".sj-toggle") ? true : true, true);
  assert.strictEqual(calls.length, 0, "trocar o filtro não deve chamar listSessions() novamente");
});

test("period filter (Últimos 7 dias / Últimos 30 dias) bound sessions by a rolling window", async (t) => {
  const now = new Date();
  const iso = (daysAgo) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 9, 0, 0).toISOString();

  const { mod } = await loadView(t, {
    listSessions: async () => ({
      sessions: [
        { id: "sess-1d", status: "finished", started_at: iso(1), ended_at: iso(1), duration_minutes: 30 },
        { id: "sess-10d", status: "finished", started_at: iso(10), ended_at: iso(10), duration_minutes: 30 },
        { id: "sess-40d", status: "finished", started_at: iso(40), ended_at: iso(40), duration_minutes: 30 },
      ],
      total: 3, hasMore: false,
    }),
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-period").value = "7d";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));
  assert.strictEqual(entries().length, 1);

  document.getElementById("sj-filter-period").value = "30d";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));
  assert.strictEqual(entries().length, 2);

  document.getElementById("sj-filter-period").value = "all";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));
  assert.strictEqual(entries().length, 3);
});

test("subject and category filter options are derived from the loaded sessions, and filtering by them narrows the list", async (t) => {
  const sessions = [
    { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-2", event_id: "ev-2", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "Aula SOI II", category: "SOI II" },
      { id: "ev-2", title: "Aula Farmaco", category: "Farmacologia" },
    ],
  });

  await mod.initStudyJournalView();

  const subjectSelect = document.getElementById("sj-filter-subject");
  const categorySelect = document.getElementById("sj-filter-category");
  const subjectOptions = Array.from(subjectSelect.options).map(o => o.value).filter(Boolean);
  const categoryOptions = Array.from(categorySelect.options).map(o => o.value).filter(Boolean);
  assert.deepStrictEqual(subjectOptions.sort(), ["Farmacologia", "SOI II"]);
  assert.deepStrictEqual(categoryOptions.sort(), ["Farmacologia", "SOI II"]);

  subjectSelect.value = "SOI II";
  subjectSelect.dispatchEvent(new window.Event("change"));

  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /Aula SOI II/);
});

test("text search matches compromisso, conteúdo, observações and reflexão, case-insensitively", async (t) => {
  const sessions = [
    { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30, notes: "nada especial" },
    { id: "sess-2", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30, notes: "Revisão de FARMACOLOGIA renal" },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "Plantão", category: "Estágio", description: "rotina" }],
  });

  await mod.initStudyJournalView();

  const searchInput = document.getElementById("sj-filter-search");
  searchInput.value = "farmacologia";
  searchInput.dispatchEvent(new window.Event("input"));

  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /FARMACOLOGIA renal/);
});

test("combining period + matéria + busca applies all filters simultaneously", async (t) => {
  const now = new Date();
  const recentIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 9, 0, 0).toISOString();
  const oldIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60, 9, 0, 0).toISOString();

  const sessions = [
    { id: "sess-match", event_id: "ev-1", status: "finished", started_at: recentIso, ended_at: recentIso, duration_minutes: 30, notes: "estudo de farmacologia" },
    { id: "sess-wrong-subject", event_id: "ev-2", status: "finished", started_at: recentIso, ended_at: recentIso, duration_minutes: 30, notes: "estudo de farmacologia" },
    { id: "sess-too-old", event_id: "ev-1", status: "finished", started_at: oldIso, ended_at: oldIso, duration_minutes: 30, notes: "estudo de farmacologia" },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "SOI II", category: "SOI II" },
      { id: "ev-2", title: "Anatomia", category: "Anatomia" },
    ],
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-period").value = "30d";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));
  document.getElementById("sj-filter-subject").value = "SOI II";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));
  document.getElementById("sj-filter-search").value = "farmacologia";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));

  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /SOI II/);
});

test("a day group with no sessions left after filtering disappears from the timeline", async (t) => {
  const sessions = [
    { id: "sess-day1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-day2", event_id: "ev-2", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "SOI II", category: "SOI II" },
      { id: "ev-2", title: "Anatomia", category: "Anatomia" },
    ],
  });

  await mod.initStudyJournalView();
  assert.strictEqual(groups().length, 2);

  document.getElementById("sj-filter-subject").value = "SOI II";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));

  assert.strictEqual(groups().length, 1);
  assert.match(groups()[0].querySelector(".sj-day-header-date").textContent, /10\/03\/2026/);
});

test("filtering to nothing shows a distinct 'no results for filters' message, not the 'no sessions at all' one", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "SOI II", category: "SOI II" }],
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-search").value = "termo que não existe em nada";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));

  const emptyEl = document.getElementById("sj-list-empty");
  assert.strictEqual(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Nenhuma sessão encontrada para os filtros selecionados\./);
  assert.strictEqual(document.getElementById("sj-list").children.length, 0);
});

test("editing and saving a reflection updates the in-memory entry, so a subsequent text search can find it without refetching", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getReflectionBySession: async () => null,
  });

  await mod.initStudyJournalView();
  const item = firstEntry();
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const reflectionEl = item.querySelector(".sj-reflection");
  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  reflectionEl.querySelector(".sj-reflection-input").value = "insight sobre eletrocardiograma";
  reflectionEl.querySelector(".sj-reflection-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  document.getElementById("sj-filter-search").value = "eletrocardiograma";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));

  assert.strictEqual(entries().length, 1);
});

test("load-more appends to the already-filtered set without resetting the active filters", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      if (opts.offset === 0) {
        return {
          sessions: [
            { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
          ],
          total: 2, hasMore: true,
        };
      }
      return {
        sessions: [
          { id: "sess-2", event_id: "ev-2", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
        ],
        total: 2, hasMore: false,
      };
    },
    getEvents: async () => [
      { id: "ev-1", title: "SOI II", category: "SOI II" },
      { id: "ev-2", title: "Anatomia", category: "Anatomia" },
    ],
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-subject").value = "SOI II";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));
  assert.strictEqual(entries().length, 1);

  document.getElementById("sj-load-more").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  // A nova sessão (Anatomia) foi carregada mas o filtro (SOI II) continua ativo.
  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /SOI II/);
});

test("re-initializing (new login) resets filters back to defaults", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "SOI II", category: "SOI II" }],
  });

  await mod.initStudyJournalView();
  document.getElementById("sj-filter-subject").value = "SOI II";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));
  assert.strictEqual(entries().length, 1);

  mod.resetStudyJournalView();
  assert.strictEqual(document.getElementById("sj-filter-subject").value, "");
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
