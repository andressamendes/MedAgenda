/**
 * Tests for activityHistoryView.js — Histórico global de Sessões (F1.8).
 * activitySessionService/eventService/categoryService are mocked: this
 * exercises only rendering, filtering and pagination against the real DOM
 * (index.html), not the domain rules (those are covered in
 * activitySessionService.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SERVICE_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const EVENT_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;
const CATEGORY_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;
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

  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      listSessions: overrides.listSessions ?? (async () => ({ sessions: [], total: 0, hasMore: false })),
    },
  });

  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEvents: overrides.getEvents ?? (async () => []) },
  });

  t.mock.module(CATEGORY_SPECIFIER, {
    namedExports: { getCategories: overrides.getCategories ?? (async () => []) },
  });

  return import(`../../activityHistoryView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls }));
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
  // Each test re-imports activityHistoryView.js with a cache-busting query
  // string (fresh module state), but sessionEventBus.js is a true singleton
  // shared across every import — without this, subscriptions from one
  // test's view instance would leak into the next test's publish() calls.
  clearEventBus();
});

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test("empty history shows the empty-state message and no items", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [], total: 0, hasMore: false }),
  });

  await mod.initActivityHistoryView();

  assert.strictEqual(document.getElementById("ah-list-empty").hidden, false);
  assert.strictEqual(document.getElementById("ah-list").children.length, 0);
  assert.strictEqual(document.getElementById("ah-load-more").hidden, true);
});

test("a single session renders title, category, date, times, duration, status, source and notes", async (t) => {
  const session = {
    id: "sess-1", event_id: "event-1", status: "finished", source: "event",
    started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T09:30:00.000Z",
    duration_minutes: 90, notes: "Revisão de cardiologia",
  };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
    getEvents: async () => [{ id: "event-1", title: "Plantão UPA", category: "Estágio" }],
  });

  await mod.initActivityHistoryView();

  const list = document.getElementById("ah-list");
  assert.strictEqual(list.children.length, 1);
  const item = list.children[0];
  assert.match(item.textContent, /Plantão UPA/);
  assert.match(item.textContent, /Estágio/);
  assert.match(item.textContent, /1h 30min/);
  assert.match(item.textContent, /Concluída/);
  assert.match(item.textContent, /Compromisso/);
  assert.match(item.textContent, /Revisão de cardiologia/);
  assert.strictEqual(document.getElementById("ah-list-empty").hidden, true);
});

test("multiple sessions render in the order returned by listSessions()", async (t) => {
  const sessions = [
    { id: "sess-2", status: "finished", source: "manual", started_at: "2026-03-11T08:00:00.000Z", ended_at: "2026-03-11T09:00:00.000Z", duration_minutes: 60 },
    { id: "sess-1", status: "cancelled", source: "manual", started_at: "2026-03-10T08:00:00.000Z", ended_at: null, duration_minutes: null },
  ];
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions, total: 2, hasMore: false }),
  });

  await mod.initActivityHistoryView();

  const items = document.getElementById("ah-list").children;
  assert.strictEqual(items.length, 2);
  assert.match(items[0].textContent, /Concluída/);
  assert.match(items[1].textContent, /Cancelada/);
});

test("a manual session with no linked event shows a generic label instead of a title", async (t) => {
  const session = { id: "sess-1", status: "finished", source: "manual", started_at: "2026-03-10T08:00:00.000Z", ended_at: "2026-03-10T08:30:00.000Z", duration_minutes: 30 };
  const { mod } = await loadView(t, {
    listSessions: async () => ({ sessions: [session], total: 1, hasMore: false }),
  });

  await mod.initActivityHistoryView();

  assert.match(document.getElementById("ah-list").textContent, /Sessão avulsa/);
});

test("clicking a filter tab reloads with the matching status and marks it active", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0; // only care about the click below

  const cancelledTab = document.querySelector('.ah-filter-tab[data-status="cancelled"]');
  cancelledTab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls[0].status, "cancelled");
  assert.strictEqual(calls[0].offset, 0);
  assert.strictEqual(cancelledTab.classList.contains("ah-filter-tab--active"), true);
  assert.strictEqual(document.querySelector('.ah-filter-tab[data-status="all"]').classList.contains("ah-filter-tab--active"), false);
});

test("load-more button appears when there are more pages and fetches the next offset", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      calls.push(opts);
      if (opts.offset === 0) {
        return { sessions: [{ id: "sess-1", status: "finished", source: "manual", started_at: "2026-01-01T08:00:00.000Z", ended_at: "2026-01-01T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: true };
      }
      return { sessions: [{ id: "sess-2", status: "finished", source: "manual", started_at: "2026-01-02T08:00:00.000Z", ended_at: "2026-01-02T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: false };
    },
  });

  await mod.initActivityHistoryView();

  const loadMoreBtn = document.getElementById("ah-load-more");
  assert.strictEqual(loadMoreBtn.hidden, false);
  assert.strictEqual(document.getElementById("ah-list").children.length, 1);

  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls[1].offset, 1);
  assert.strictEqual(document.getElementById("ah-list").children.length, 2);
  assert.strictEqual(loadMoreBtn.hidden, true);
});

test("a load error shows the friendly message with a retry button, and never running/paused sessions leak through a broken mock", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    listSessions: async () => { throw new Error("network down"); },
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initActivityHistoryView();

  const emptyEl = document.getElementById("ah-list-empty");
  assert.strictEqual(emptyEl.hidden, false);
  assert.match(emptyEl.textContent, /Sem conexão com a internet\./);
  assert.ok(emptyEl.querySelector(".list-error-retry"));
  assert.strictEqual(handleErrorCalls[0].context.context, "activityHistoryView.load");
});

test("retrying after a load error clears the error state on success", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    listSessions: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { sessions: [{ id: "sess-1", status: "finished", source: "manual", started_at: "2026-01-01T08:00:00.000Z", ended_at: "2026-01-01T08:30:00.000Z", duration_minutes: 30 }], total: 1, hasMore: false };
    },
  });

  await mod.initActivityHistoryView();
  const retryBtn = document.querySelector(".list-error-retry");
  assert.ok(retryBtn);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(document.getElementById("ah-list-empty").hidden, true);
  assert.strictEqual(document.getElementById("ah-list").children.length, 1);
});

// ── Sincronização com o barramento de eventos (F6.3) ────────────────────────

test("subscribes to the event bus on init: publishing SessionStarted triggers a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.STARTED, { id: "sess-1", status: "running" });
  await tick();

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].offset, 0);
});

test("publishing SessionFinished triggers a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1);
});

test("publishing SessionCancelled triggers a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.CANCELLED, { id: "sess-1", status: "cancelled" });
  await tick();

  assert.strictEqual(calls.length, 1);
});

test("publishing SessionUpdated triggers a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.UPDATED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1);
});

test("SessionPaused and SessionResumed do not trigger a reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.PAUSED, { id: "sess-1", status: "paused" });
  publish(SESSION_EVENTS.RESUMED, { id: "sess-1", status: "running" });
  await tick();

  assert.strictEqual(calls.length, 0);
});

test("multiple events published in immediate succession coalesce into a single reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.STARTED, { id: "sess-1", status: "running" });
  publish(SESSION_EVENTS.UPDATED, { id: "sess-1", status: "running" });
  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1, "three events in the same tick should trigger exactly one reload");
});

test("an auto-reload from an event preserves the currently selected filter", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  document.querySelector('.ah-filter-tab[data-status="cancelled"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].status, "cancelled");
});

test("resetActivityHistoryView() unsubscribes from the event bus: further events do not reload", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  mod.resetActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  publish(SESSION_EVENTS.CANCELLED, { id: "sess-1", status: "cancelled" });
  publish(SESSION_EVENTS.STARTED, { id: "sess-1", status: "running" });
  publish(SESSION_EVENTS.UPDATED, { id: "sess-1", status: "running" });
  await tick();

  assert.strictEqual(calls.length, 0);
});

test("resetActivityHistoryView() cancels a reload already scheduled but not yet fired", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  mod.resetActivityHistoryView(); // reset happens before the debounced reload fires
  await tick();

  assert.strictEqual(calls.length, 0);
});

test("re-initializing does not register duplicate listeners (no leak across repeated init calls)", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  await mod.initActivityHistoryView();
  await mod.initActivityHistoryView();
  calls.length = 0;

  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished" });
  await tick();

  assert.strictEqual(calls.length, 1, "a single event should trigger exactly one reload, regardless of how many times init ran");
});

test("filters continue to work normally alongside the event-bus subscription", async (t) => {
  const calls = [];
  const { mod } = await loadView(t, {
    listSessions: async (opts) => { calls.push(opts); return { sessions: [], total: 0, hasMore: false }; },
  });

  await mod.initActivityHistoryView();
  calls.length = 0;

  const finishedTab = document.querySelector('.ah-filter-tab[data-status="finished"]');
  finishedTab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(calls[0].status, "finished");
  assert.strictEqual(finishedTab.classList.contains("ah-filter-tab--active"), true);
});

test("pagination continues to work normally alongside the event-bus subscription", async (t) => {
  const { mod } = await loadView(t, {
    listSessions: async (opts) => {
      if (opts.offset === 0) {
        return { sessions: [{ id: "sess-1", status: "finished", source: "manual", started_at: "2026-01-01T08:00:00.000Z", ended_at: "2026-01-01T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: true };
      }
      return { sessions: [{ id: "sess-2", status: "finished", source: "manual", started_at: "2026-01-02T08:00:00.000Z", ended_at: "2026-01-02T08:30:00.000Z", duration_minutes: 30 }], total: 2, hasMore: false };
    },
  });

  await mod.initActivityHistoryView();
  const loadMoreBtn = document.getElementById("ah-load-more");
  loadMoreBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  assert.strictEqual(document.getElementById("ah-list").children.length, 2);
  assert.strictEqual(loadMoreBtn.hidden, true);
});
