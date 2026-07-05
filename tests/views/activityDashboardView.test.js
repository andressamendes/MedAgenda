/**
 * Tests for activityDashboardView.js — Dashboard de Execução (F2.1).
 * activityDashboardService/activitySessionService are mocked: this exercises
 * only rendering and the auto-refresh subscription against the real DOM
 * (index.html), not the aggregation math itself (covered in
 * tests/activityDashboardService.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const DASHBOARD_SERVICE_SPECIFIER = new URL("../../activityDashboardService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER   = new URL("../../activitySessionService.js", import.meta.url).href;
const ERROR_SPECIFIER             = new URL("../../errorService.js", import.meta.url).href;

const EMPTY_DATA = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
};

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

  t.mock.module(DASHBOARD_SERVICE_SPECIFIER, {
    namedExports: {
      getDashboardData: overrides.getDashboardData ?? (async () => EMPTY_DATA),
    },
  });

  let finishedCallback = null;
  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      onSessionFinished: (cb) => { finishedCallback = cb; return () => {}; },
    },
  });

  return import(`../../activityDashboardView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls, triggerSessionFinished: (session) => finishedCallback?.(session) }));
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("with no sessions, all eight cards render with empty/zero values", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  assert.strictEqual(cards.hidden, false);
  assert.strictEqual(cards.children.length, 8);
  assert.match(cards.textContent, /Tempo estudado hoje/);
  assert.match(cards.textContent, /Sessões no mês/);
  assert.match(cards.textContent, /Maior sessão/);
  assert.match(cards.textContent, /—/); // sem sessão mais longa
  assert.strictEqual(document.getElementById("dash-error").hidden, true);
});

test("today's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      todayMinutes: 90,
      todaySessionsCount: 2,
    }),
  });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  assert.match(cards.textContent, /1h 30min/);
  assert.match(cards.textContent, /Sessões hoje/);
});

test("week's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      weekMinutes: 245,
      weekSessionsCount: 5,
    }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /4h 5min/);
});

test("month's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthMinutes: 1230,
      monthSessionsCount: 20,
    }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /20h 30min/);
});

test("average duration renders the average minutes formatted", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({ ...EMPTY_DATA, averageMinutes: 42 }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /42min/);
});

test("longest session renders its duration and date", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      longestSession: { id: "s1", duration_minutes: 150, started_at: "2026-07-05T08:00:00.000Z" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /2h 30min/);
  assert.match(text, /05\/07\/2026/);
});

test("a load error shows the friendly message with a retry button", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => { throw new Error("network down"); },
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initActivityDashboardView();

  const errorEl = document.getElementById("dash-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sem conexão com a internet\./);
  assert.ok(errorEl.querySelector(".list-error-retry"));
  assert.strictEqual(document.getElementById("dash-cards").hidden, true);
});

test("retrying after a load error clears the error state on success", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { ...EMPTY_DATA, todayMinutes: 30 };
    },
  });

  await mod.initActivityDashboardView();
  const retryBtn = document.querySelector(".list-error-retry");
  assert.ok(retryBtn);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(document.getElementById("dash-error").hidden, true);
  assert.strictEqual(document.getElementById("dash-cards").hidden, false);
});

test("indicators refresh automatically when a session finishes, without reloading", async (t) => {
  let calls = 0;
  const { mod, triggerSessionFinished } = await loadView(t, {
    getDashboardData: async () => {
      calls += 1;
      return calls === 1 ? EMPTY_DATA : { ...EMPTY_DATA, todaySessionsCount: 1, todayMinutes: 25 };
    },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);
  assert.doesNotMatch(document.getElementById("dash-cards").textContent, /25min/);

  triggerSessionFinished({ id: "s1", status: "finished" });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls, 2);
  assert.match(document.getElementById("dash-cards").textContent, /25min/);
});
