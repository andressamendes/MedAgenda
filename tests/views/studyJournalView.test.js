/**
 * Tests for studyJournalView.js — Linha do Tempo da Aprendizagem (F8.1–F8.3),
 * incluindo a correção de performance do AUD-002 (carregamento em lote de
 * questões/revisões/reflexões, eliminando o N+1 por sessão).
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

// Constrói uma versão em lote { [sessionId]: value } a partir de uma função
// por sessão (o estilo antigo, ainda usado pela maioria dos testes abaixo) —
// só uma conveniência de teste; a view real nunca chama nada "por sessão".
function _batchFromPerSession(perSessionFn, emptyValue) {
  return async (sessionIds) => {
    const entries = await Promise.all(
      sessionIds.map(async id => [id, await perSessionFn(id)])
    );
    return Object.fromEntries(entries.map(([id, value]) => [id, value ?? emptyValue]));
  };
}

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

  const questionsCalls = [];
  t.mock.module(QUESTIONS_SPECIFIER, {
    namedExports: {
      listQuestionsBySessions: overrides.listQuestionsBySessions ?? (async (sessionIds) => {
        questionsCalls.push(sessionIds);
        const perSession = overrides.listQuestions ?? (async () => []);
        return _batchFromPerSession(perSession, [])(sessionIds);
      }),
    },
  });

  const reviewsCalls = [];
  t.mock.module(REVIEWS_SPECIFIER, {
    namedExports: {
      listBySessions: overrides.listReviewsBySessions ?? (async (sessionIds) => {
        reviewsCalls.push(sessionIds);
        const perSession = overrides.listReviewsBySession ?? (async () => []);
        return _batchFromPerSession(perSession, [])(sessionIds);
      }),
    },
  });

  const saveReflectionCalls = [];
  const reflectionsCalls = [];
  t.mock.module(REFLECTION_SPECIFIER, {
    namedExports: {
      listBySessions: overrides.listReflectionsBySessions ?? (async (sessionIds) => {
        reflectionsCalls.push(sessionIds);
        const perSession = overrides.getReflectionBySession ?? (async () => null);
        return _batchFromPerSession(perSession, null)(sessionIds);
      }),
      saveReflection: overrides.saveReflection ?? (async (sessionId, content) => {
        saveReflectionCalls.push({ sessionId, content });
        return { id: "refl-1", session_id: sessionId, content };
      }),
    },
  });

  return import(`../../studyJournalView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, saveReflectionCalls, questionsCalls, reviewsCalls, reflectionsCalls }));
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
  assert.match(emptyEl.textContent, /Nenhuma sessão encontrada para esta pesquisa\./);
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

// ── Linha do Tempo da Evolução (F8.5) ───────────────────────────────────

function dailySummaries() {
  return Array.from(document.querySelectorAll("#sj-list .sj-daily-summary"));
}

function weekSummaries() {
  return Array.from(document.querySelectorAll("#sj-list .sj-week-summary"));
}

test("a day group ends with an automatic daily summary: tempo líquido, sessões, questões, revisões e matérias", async (t) => {
  const sessions = [
    { id: "sess-2", event_id: "ev-1", status: "finished", started_at: "2026-03-10T14:00:00.000Z", ended_at: "2026-03-10T14:45:00.000Z", duration_minutes: 45 },
    { id: "sess-1", event_id: "ev-2", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "Aula Cardio", category: "Cardiologia" },
      { id: "ev-2", title: "Aula Farmaco", category: "Farmacologia" },
    ],
    listQuestions: async (sessionId) => sessionId === "sess-2" ? [{ id: "q1" }, { id: "q2" }] : [{ id: "q3" }],
    listReviewsBySession: async (sessionId) => sessionId === "sess-2" ? [{ id: "r1" }] : [],
  });

  await mod.initStudyJournalView();

  const summaries = dailySummaries();
  assert.strictEqual(summaries.length, 1, "um único grupo de dia deve gerar um único resumo diário");
  const text = summaries[0].textContent;
  assert.match(text, /1h 15min líquidos/);
  assert.match(text, /2 sessão\(ões\)/);
  assert.match(text, /3 questão\(ões\) resolvida\(s\)/);
  assert.match(text, /1 revisão\(ões\)/);
  assert.match(text, /Cardiologia, Farmacologia/);
});

test("a session with no matéria shows a placeholder instead of an empty list in the daily summary", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  assert.match(dailySummaries()[0].textContent, /Sem matéria/);
});

test("the daily summary sits inside its own day group, never replacing the session entries", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  const group = document.querySelector(".sj-day-group");
  assert.strictEqual(group.querySelectorAll(".sj-entry").length, 1, "a sessão continua renderizada normalmente");
  assert.strictEqual(group.querySelectorAll(".sj-daily-summary").length, 1, "o resumo é um elemento adicional dentro do mesmo grupo");
});

test("a day's summary shows evolution indicators compared to the previous day: sessions, minutes and questions delta", async (t) => {
  const sessions = [
    // dia mais recente: 1 sessão de 55min, 1 questão
    { id: "sess-today", status: "finished", started_at: "2026-03-11T08:00:00.000Z", ended_at: "2026-03-11T08:55:00.000Z", duration_minutes: 55 },
    // dia anterior: 2 sessões somando 90min, 3 questões
    { id: "sess-prev-a", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T09:00:00.000Z", duration_minutes: 60 },
    { id: "sess-prev-b", status: "finished", started_at: "2026-03-10T10:00:00.000Z", ended_at: "2026-03-10T10:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
    listQuestions: async (sessionId) => {
      if (sessionId === "sess-today") return [{ id: "q1" }];
      if (sessionId === "sess-prev-a") return [{ id: "q2" }, { id: "q3" }];
      return [{ id: "q4" }];
    },
  });

  await mod.initStudyJournalView();

  const summaries = dailySummaries();
  assert.strictEqual(summaries.length, 2);

  const [todaySummary, prevSummary] = summaries;
  assert.match(todaySummary.textContent, /Em relação ao dia anterior/);
  assert.match(todaySummary.textContent, /↓ −1 sessão/);
  assert.match(todaySummary.textContent, /↓ −35 minutos/);
  assert.match(todaySummary.textContent, /↓ −2 questões/);

  assert.doesNotMatch(prevSummary.textContent, /Em relação ao dia anterior/, "o dia mais antigo da linha do tempo não tem dia anterior para comparar");
});

test("a lone visible day shows no comparison indicators", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  assert.doesNotMatch(dailySummaries()[0].textContent, /Em relação ao dia anterior/);
});

test("a weekly summary card appears when a new week starts, summarizing the week just finished in the timeline", async (t) => {
  const sessions = [
    // semana de 2026-03-16 (segunda) — a mais recente na linha do tempo,
    // com dois dias consecutivos estudados.
    { id: "sess-w2-b", event_id: "ev-1", status: "finished", started_at: "2026-03-17T08:00:00.000Z", ended_at: "2026-03-17T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-w2-a", event_id: "ev-2", status: "finished", started_at: "2026-03-16T08:00:00.000Z", ended_at: "2026-03-16T09:00:00.000Z", duration_minutes: 60 },
    // semana de 2026-03-09 (segunda) — mais antiga, ainda em exibição mas
    // sem uma semana seguinte no conjunto filtrado, então não ganha cartão.
    { id: "sess-w1", event_id: "ev-1", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "Aula Cardio", category: "Cardiologia" },
      { id: "ev-2", title: "Aula Farmaco", category: "Farmacologia" },
    ],
    listQuestions: async () => [{ id: "q1" }],
  });

  await mod.initStudyJournalView();

  const weeks = weekSummaries();
  assert.strictEqual(weeks.length, 1, "só a semana com uma semana mais antiga seguinte no conjunto visível ganha um cartão");
  const text = weeks[0].textContent;
  assert.match(text, /Semana de 16\/03 a 22\/03/);
  assert.match(text, /2 sessão\(ões\)/);
  assert.match(text, /1h 30min estudadas/);
  assert.match(text, /2 questão\(ões\)/);
  assert.match(text, /2 matéria\(s\)/);
  assert.match(text, /Maior sequência de estudos: 2 dia\(s\)/);

  // o cartão semanal aparece entre os grupos de dia, antes do grupo mais antigo da semana seguinte.
  const listChildren = Array.from(document.getElementById("sj-list").children);
  const weekIndex = listChildren.findIndex(el => el.classList.contains("sj-week-summary"));
  const groupIndexes = listChildren
    .map((el, i) => ({ el, i }))
    .filter(({ el }) => el.classList.contains("sj-day-group"))
    .map(({ i }) => i);
  assert.strictEqual(groupIndexes.length, 3);
  assert.ok(weekIndex > groupIndexes[1] && weekIndex < groupIndexes[2], "o card semanal fica entre o último dia da semana concluída e o primeiro dia da semana seguinte");
});

test("summaries recompute over only the currently filtered/visible sessions, without a new listSessions() call", async (t) => {
  const sessions = [
    { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-2", event_id: "ev-2", status: "finished", started_at: "2026-03-10T09:00:00.000Z", ended_at: "2026-03-10T09:30:00.000Z", duration_minutes: 30 },
  ];
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions, total: 2, hasMore: false }; },
    getEvents: async () => [
      { id: "ev-1", title: "SOI II", category: "SOI II" },
      { id: "ev-2", title: "Anatomia", category: "Anatomia" },
    ],
  });

  await mod.initStudyJournalView();
  assert.match(dailySummaries()[0].textContent, /2 sessão\(ões\)/);
  assert.match(dailySummaries()[0].textContent, /1h 0min líquidos/);
  calls.length = 0;

  document.getElementById("sj-filter-subject").value = "SOI II";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));

  assert.strictEqual(calls.length, 0, "trocar o filtro não deve chamar listSessions() novamente");
  assert.strictEqual(dailySummaries().length, 1);
  assert.match(dailySummaries()[0].textContent, /1 sessão\(ões\)/);
  assert.match(dailySummaries()[0].textContent, /30min líquidos/);
  assert.match(dailySummaries()[0].textContent, /SOI II/);
  assert.doesNotMatch(dailySummaries()[0].textContent, /Anatomia/);
});

// ── Síntese Periódica de Aprendizado (F8.6) ─────────────────────────────

test("a weekly summary card renders a derived narrative text (Resumo da Semana) below its stats", async (t) => {
  const sessions = [
    { id: "sess-w2-b", event_id: "ev-1", status: "finished", started_at: "2026-03-17T08:00:00.000Z", ended_at: "2026-03-17T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-w2-a", event_id: "ev-2", status: "finished", started_at: "2026-03-16T08:00:00.000Z", ended_at: "2026-03-16T09:00:00.000Z", duration_minutes: 60 },
    { id: "sess-w1", event_id: "ev-1", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "Aula Cardio", category: "Cardiologia" },
      { id: "ev-2", title: "Aula Farmaco", category: "Farmacologia" },
    ],
    listQuestions: async () => [{ id: "q1" }],
  });

  await mod.initStudyJournalView();

  const week = weekSummaries()[0];
  const title = week.querySelector(".sj-week-narrative-title");
  const text = week.querySelector(".sj-week-narrative-text").textContent;

  assert.strictEqual(title.textContent, "Resumo da Semana");
  assert.match(text, /Nesta semana você realizou 2 sessões/);
  assert.match(text, /estudou durante 1h30/);
  assert.match(text, /resolveu 2 questões/);
  assert.match(text, /estudou 2 matérias diferentes/);
});

test("the weekly narrative only considers the currently visible (filtered) entries of that week", async (t) => {
  const sessions = [
    { id: "sess-w2-b", event_id: "ev-1", status: "finished", started_at: "2026-03-17T08:00:00.000Z", ended_at: "2026-03-17T08:30:00.000Z", duration_minutes: 30 },
    { id: "sess-w2-a", event_id: "ev-2", status: "finished", started_at: "2026-03-16T08:00:00.000Z", ended_at: "2026-03-16T09:00:00.000Z", duration_minutes: 60 },
    { id: "sess-w1", event_id: "ev-1", status: "finished", started_at: "2026-03-09T08:00:00.000Z", ended_at: "2026-03-09T08:30:00.000Z", duration_minutes: 30 },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 3, hasMore: false }),
    getEvents: async () => [
      { id: "ev-1", title: "Aula Cardio", category: "Cardiologia" },
      { id: "ev-2", title: "Aula Farmaco", category: "Farmacologia" },
    ],
  });

  await mod.initStudyJournalView();
  document.getElementById("sj-filter-subject").value = "Cardiologia";
  document.getElementById("sj-filter-subject").dispatchEvent(new window.Event("change"));

  const text = weekSummaries()[0].querySelector(".sj-week-narrative-text").textContent;
  assert.match(text, /Nesta semana você realizou 1 sessão/);
  assert.match(text, /estudou 1 matéria diferente/);
});

// ── Marcos da Evolução (F8.7) ───────────────────────────────────────────

test("F8.7 — a first-session milestone renders as a read-only card before any day group", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "Aula Cardio", category: "Cardiologia" }],
  });

  await mod.initStudyJournalView();

  const milestonesEl = document.querySelector("#sj-list .sj-milestones");
  assert.ok(milestonesEl, "bloco de marcos deve ser renderizado");
  assert.match(milestonesEl.textContent, /Primeira sessão/);

  const listChildren = Array.from(document.getElementById("sj-list").children);
  assert.strictEqual(listChildren[0], milestonesEl, "marcos aparecem antes de qualquer grupo de dia");
});

test("F8.7 — milestones are recalculated from the filtered subset and disappear naturally when a filter removes every visible session", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "Aula Cardio", category: "Farmacologia" }],
  });

  await mod.initStudyJournalView();
  assert.ok(document.querySelector("#sj-list .sj-milestones"));

  document.getElementById("sj-filter-search").value = "termo-que-nao-existe-em-nenhum-campo";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));

  assert.strictEqual(
    document.querySelectorAll("#sj-list .sj-milestones").length, 0,
    "sem sessões visíveis após o filtro, nenhum marco (nunca persistido) é exibido"
  );
});

// ── Reflexão + destaque de busca ativa (F8.2 + F8.8) ─────────────────────

test("F8.8 — saving a reflection while a search filter is active keeps the highlight in the freshly rendered reflection, without a new interaction", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "Aula", category: "Cardiologia", description: "Estudo de cardio hoje" }],
    getReflectionBySession: async () => null,
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-search").value = "cardio";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));
  assert.strictEqual(entries().length, 1, "a sessão continua visível pois 'cardio' casa com o conteúdo do compromisso");

  const item = firstEntry();
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const reflectionEl = item.querySelector(".sj-reflection");
  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  reflectionEl.querySelector(".sj-reflection-input").value = "Anotações sobre cardio hoje";
  reflectionEl.querySelector(".sj-reflection-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.match(
    reflectionEl.innerHTML,
    /<mark class="sj-search-mark">cardio<\/mark>/,
    "o destaque da busca ativa deve continuar aparecendo na reflexão recém-salva"
  );
});

test("F8.8 — cancelling a reflection edit keeps the search highlight on the previously saved text", async (t) => {
  const session = { id: "sess-1", event_id: "ev-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-1", title: "Aula", category: "Cardiologia", description: "Estudo de cardio hoje" }],
    getReflectionBySession: async () => ({ id: "refl-1", session_id: "sess-1", content: "insight sobre cardio" }),
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-search").value = "cardio";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));

  const item = firstEntry();
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const reflectionEl = item.querySelector(".sj-reflection");
  assert.match(reflectionEl.innerHTML, /<mark class="sj-search-mark">cardio<\/mark>/);

  reflectionEl.querySelector(".sj-reflection-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  reflectionEl.querySelector(".sj-reflection-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.match(
    reflectionEl.innerHTML,
    /<mark class="sj-search-mark">cardio<\/mark>/,
    "cancelar a edição deve manter o destaque da busca ativa, igual ao estado antes de abrir o formulário"
  );
});

// ── Reset completo e isolamento por usuário ──────────────────────────────

test("resetStudyJournalView() clears the in-memory cache and the rendered list synchronously — this SPA never reloads the page between users", async (t) => {
  const sessionA = { id: "sess-a", event_id: "ev-a", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [sessionA], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "ev-a", title: "Sessão da Usuária A", category: "Cardiologia" }],
  });

  await mod.initStudyJournalView();
  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /Usuária A/);

  mod.resetStudyJournalView();

  assert.strictEqual(entries().length, 0, "a lista renderizada não pode reter os dados do usuário anterior após o reset");
  assert.strictEqual(document.getElementById("sj-list").innerHTML, "");
  assert.strictEqual(document.getElementById("sj-load-more").hidden, true);
  assert.strictEqual(document.getElementById("sj-search-stats").hidden, true);
});

test("switching users (resetStudyJournalView then initStudyJournalView again) shows only the new user's sessions, with no leftover entries or duplicates from the previous user", async (t) => {
  let activeUser = "A";
  const sessionsByUser = {
    A: [{ id: "sess-a", event_id: "ev-a", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 }],
    B: [{ id: "sess-b", event_id: "ev-b", status: "finished", started_at: "2026-03-11T08:00:00.000Z", ended_at: "2026-03-11T08:30:00.000Z", duration_minutes: 45 }],
  };
  const eventsByUser = {
    A: [{ id: "ev-a", title: "Compromisso da Usuária A", category: "Cardiologia" }],
    B: [{ id: "ev-b", title: "Compromisso do Usuário B", category: "Farmacologia" }],
  };

  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: sessionsByUser[activeUser], total: 1, hasMore: false }),
    getEvents: async () => eventsByUser[activeUser],
  });

  await mod.initStudyJournalView();
  assert.strictEqual(entries().length, 1);
  assert.match(document.getElementById("sj-list").textContent, /Usuária A/);

  mod.resetStudyJournalView();
  activeUser = "B";
  await mod.initStudyJournalView();

  assert.strictEqual(entries().length, 1, "nenhuma sessão duplicada nem perdida ao trocar de usuário");
  const text = document.getElementById("sj-list").textContent;
  assert.match(text, /Usuário B/);
  assert.doesNotMatch(text, /Usuária A/, "dados do usuário anterior não podem sobreviver à troca de usuário");
});

// ── AUD-002 — Carregamento em lote (elimina o N+1 de consultas) ──────────
// A página inteira de sessões busca questões/revisões/reflexões em uma única
// chamada por domínio (listQuestionsBySessions/listBySessions/listBySessions),
// nunca uma chamada por sessão — ver studyJournalView.js/_fetchPageExtras().

function _sessionsPage(count, { offset = 0, dayOffset = 0 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i + 1;
    const iso = `2026-03-${String(10 + dayOffset).padStart(2, "0")}T0${n % 9}:00:00.000Z`;
    return {
      id: `sess-${n}`, status: "finished",
      started_at: iso, ended_at: iso, duration_minutes: 30,
    };
  });
}

test("AUD-002 — loading a page of 10 sessions calls each batch service exactly once, not once per session", async (t) => {
  const sessions = _sessionsPage(10);
  const { mod, questionsCalls, reviewsCalls, reflectionsCalls } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 10, hasMore: false }),
  });

  await mod.initStudyJournalView();

  assert.strictEqual(questionsCalls.length, 1, "questões devem ser buscadas em uma única chamada em lote por página");
  assert.strictEqual(reviewsCalls.length, 1, "revisões devem ser buscadas em uma única chamada em lote por página");
  assert.strictEqual(reflectionsCalls.length, 1, "reflexões devem ser buscadas em uma única chamada em lote por página");

  assert.deepStrictEqual(questionsCalls[0].slice().sort(), sessions.map(s => s.id).sort());
  assert.deepStrictEqual(reviewsCalls[0].slice().sort(), sessions.map(s => s.id).sort());
  assert.deepStrictEqual(reflectionsCalls[0].slice().sort(), sessions.map(s => s.id).sort());
});

test("AUD-002 — a page of 10 sessions still renders all of them with correct questões/revisões counts (same visible content, batched)", async (t) => {
  const sessions = _sessionsPage(10);
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 10, hasMore: false }),
    listQuestions: async (sessionId) => sessionId === "sess-1" ? [{ id: "q1" }, { id: "q2" }] : [],
    listReviewsBySession: async (sessionId) => sessionId === "sess-5" ? [{ id: "r1" }] : [],
  });

  await mod.initStudyJournalView();

  assert.strictEqual(entries().length, 10);
  const sess1Entry = entries().find(li => li.textContent.includes("2 questão(ões)"));
  assert.ok(sess1Entry, "a sessão com questões batched continua mostrando a contagem correta");
  const sess5Entry = entries().find(li => li.textContent.includes("1 revisão(ões)"));
  assert.ok(sess5Entry, "a sessão com revisão batched continua mostrando a contagem correta");
});

test("AUD-002 — loading a second page only fetches extras for the newly loaded sessions, never re-fetching the first page", async (t) => {
  const page1 = _sessionsPage(10, { offset: 0 });
  const page2 = _sessionsPage(5, { offset: 10, dayOffset: -1 });

  const { mod, questionsCalls, reviewsCalls, reflectionsCalls } = await loadView(t, {
    listSessions: async (opts) => {
      if (opts.offset === 0) return { sessions: page1, total: 15, hasMore: true };
      return { sessions: page2, total: 15, hasMore: false };
    },
  });

  await mod.initStudyJournalView();
  assert.strictEqual(questionsCalls.length, 1);
  assert.deepStrictEqual(questionsCalls[0].slice().sort(), page1.map(s => s.id).sort());

  document.getElementById("sj-load-more").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(entries().length, 15, "as sessões da primeira página continuam visíveis junto com a segunda");
  assert.strictEqual(questionsCalls.length, 2, "carregar mais deve disparar uma nova chamada em lote, não uma recarga da página anterior");
  assert.strictEqual(reviewsCalls.length, 2);
  assert.strictEqual(reflectionsCalls.length, 2);

  assert.deepStrictEqual(questionsCalls[1].slice().sort(), page2.map(s => s.id).sort(),
    "a segunda chamada em lote deve pedir apenas os session_ids da nova página, nunca os da primeira");
  assert.deepStrictEqual(reviewsCalls[1].slice().sort(), page2.map(s => s.id).sort());
  assert.deepStrictEqual(reflectionsCalls[1].slice().sort(), page2.map(s => s.id).sort());
});

test("AUD-002 — a load error for the batched extras falls back to empty questões/revisões/reflexão without breaking the page", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    listQuestionsBySessions: async () => { throw new Error("network down"); },
  });

  await mod.initStudyJournalView();

  assert.strictEqual(entries().length, 1, "a sessão continua aparecendo mesmo se a busca em lote de questões falhar");
  const item = firstEntry();
  item.querySelector(".sj-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const detailEl = item.querySelector(".sj-entry-detail");
  assert.match(detailEl.textContent, /Nenhuma questão registrada\./);
});

// ── Aviso de filtragem parcial (auditoria UX #02) ────────────────────────
// Os filtros operam só sobre as sessões já carregadas em memória (F8.4/F8.8);
// com filtro ativo e páginas ainda não carregadas no servidor (hasMore), o
// aviso torna a parcialidade explícita — sem ele, as contagens do card de
// estatísticas parecem totais.

function partialNotice() {
  return document.getElementById("sj-filter-partial-notice");
}

test("UX #02 — with an active filter and more pages on the server, shows the partial-filtering notice", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 25, hasMore: true }),
  });

  await mod.initStudyJournalView();

  // Sem filtro ativo, nada de aviso — a lista é sabidamente parcial, mas
  // nenhuma contagem filtrada está sendo exibida como se fosse total.
  assert.strictEqual(partialNotice().hidden, true);

  document.getElementById("sj-filter-period").value = "30d";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));

  assert.strictEqual(partialNotice().hidden, false);
  assert.match(partialNotice().textContent, /1 sessão\(ões\) já carregada/);
  assert.match(partialNotice().textContent, /Carregar mais/);
});

test("UX #02 — the notice disappears when the filter is cleared", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 25, hasMore: true }),
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-notes").checked = true;
  document.getElementById("sj-filter-notes").dispatchEvent(new window.Event("change"));
  assert.strictEqual(partialNotice().hidden, false);

  document.getElementById("sj-filter-notes").checked = false;
  document.getElementById("sj-filter-notes").dispatchEvent(new window.Event("change"));
  assert.strictEqual(partialNotice().hidden, true);
});

test("UX #02 — with an active filter but no more pages on the server, no notice is shown", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-period").value = "30d";
  document.getElementById("sj-filter-period").dispatchEvent(new window.Event("change"));

  assert.strictEqual(partialNotice().hidden, true);
});

test("UX #02 — loading the last page while a filter is active hides the notice", async (t) => {
  const iso = (i) => `2026-03-1${i}T08:00:00.000Z`;
  let call = 0;
  const { mod } = await loadView(t, {
    listSessions: async () => {
      call += 1;
      return call === 1
        ? { sessions: [{ id: "sess-1", status: "finished", started_at: iso(0), ended_at: iso(0), duration_minutes: 30 }], total: 2, hasMore: true }
        : { sessions: [{ id: "sess-2", status: "finished", started_at: iso(1), ended_at: iso(1), duration_minutes: 30 }], total: 2, hasMore: false };
    },
  });

  await mod.initStudyJournalView();

  document.getElementById("sj-filter-period").value = "all"; // valor padrão — usa busca textual como filtro ativo
  document.getElementById("sj-filter-search").value = "sessão";
  document.getElementById("sj-filter-search").dispatchEvent(new window.Event("input"));
  assert.strictEqual(partialNotice().hidden, false);

  document.getElementById("sj-load-more").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(partialNotice().hidden, true, "com todas as páginas carregadas o filtro deixa de ser parcial");
});

test("UX #02 — resetStudyJournalView() hides the notice (no leftover between users)", async (t) => {
  const session = { id: "sess-1", status: "finished", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 25, hasMore: true }),
  });

  await mod.initStudyJournalView();
  document.getElementById("sj-filter-reviews").checked = true;
  document.getElementById("sj-filter-reviews").dispatchEvent(new window.Event("change"));
  assert.strictEqual(partialNotice().hidden, false);

  mod.resetStudyJournalView();

  assert.strictEqual(partialNotice().hidden, true);
  assert.strictEqual(partialNotice().textContent, "");
});
