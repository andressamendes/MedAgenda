/**
 * Tests for constancyHeatmapView.js — Heatmap de Constância (V5.1).
 * studyStreakService is mocked: this exercises only rendering and the
 * auto-refresh subscription against the real DOM (index.html), not the
 * calendar derivation itself (covered in tests/studyStreakService.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const STREAK_SERVICE_SPECIFIER = new URL("../../studyStreakService.js", import.meta.url).href;
const ERROR_SPECIFIER          = new URL("../../errorService.js", import.meta.url).href;

function loadView(t, overrides = {}) {
  const handleErrorCalls = [];
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: {
      handleError: (err, context) => {
        handleErrorCalls.push({ err, context });
        return { category: "unknown", friendly: err.message };
      },
    },
  });

  t.mock.module(STREAK_SERVICE_SPECIFIER, {
    namedExports: {
      getStudyCalendar: overrides.getStudyCalendar ?? (async () => ({})),
      getStreakSummary: overrides.getStreakSummary ?? (async () => ({ currentStreak: 0 })),
    },
  });

  return import(`../../constancyHeatmapView.js?t=${Math.random()}`)
    .then(mod => ({ mod, handleErrorCalls }));
}

beforeEach(() => {
  installDom();
  clearEventBus();
});

afterEach(() => {
  clearEventBus();
  uninstallDom();
});

test("initConstancyHeatmapView renders 84 cells and a legend from an empty calendar", async (t) => {
  const { mod } = await loadView(t);
  await mod.initConstancyHeatmapView();

  const grid = document.querySelector("#constancy-heatmap .heatmap-grid");
  assert.ok(grid, "grid should be rendered");
  assert.strictEqual(grid.querySelectorAll(".heatmap-cell").length, 84);
  assert.strictEqual(grid.querySelectorAll(".heatmap-cell--studied").length, 0);
  assert.ok(document.querySelector("#constancy-heatmap .heatmap-legend"));

  mod.resetConstancyHeatmapView();
});

// ── Etapa 2 — streak numérico junto do heatmap ──────────────────────────────

test("renders the current streak count from getStreakSummary() next to the grid", async (t) => {
  const { mod } = await loadView(t, { getStreakSummary: async () => ({ currentStreak: 5 }) });
  await mod.initConstancyHeatmapView();

  const streakEl = document.querySelector("#constancy-heatmap .heatmap-streak");
  assert.ok(streakEl, "streak element should be rendered");
  assert.match(streakEl.textContent, /5/);
  assert.match(streakEl.textContent, /dias seguidos/);
  assert.match(document.querySelector("#constancy-heatmap .heatmap-grid").getAttribute("aria-label"), /Sequência atual: 5 dias seguidos estudando/);

  mod.resetConstancyHeatmapView();
});

test("uses singular wording for a 1-day streak", async (t) => {
  const { mod } = await loadView(t, { getStreakSummary: async () => ({ currentStreak: 1 }) });
  await mod.initConstancyHeatmapView();

  const streakEl = document.querySelector("#constancy-heatmap .heatmap-streak");
  assert.match(streakEl.textContent, /1/);
  assert.match(streakEl.textContent, /dia seguido/);
  assert.doesNotMatch(streakEl.textContent, /dias seguidos/);

  mod.resetConstancyHeatmapView();
});

test("a zero streak renders a neutral message instead of '0 dias seguidos'", async (t) => {
  const { mod } = await loadView(t, { getStreakSummary: async () => ({ currentStreak: 0 }) });
  await mod.initConstancyHeatmapView();

  const streakEl = document.querySelector("#constancy-heatmap .heatmap-streak");
  assert.match(streakEl.textContent, /Nenhuma sequência ativa/);
  assert.match(document.querySelector("#constancy-heatmap .heatmap-grid").getAttribute("aria-label"), /Sequência atual: Nenhuma sequência ativa estudando/);

  mod.resetConstancyHeatmapView();
});

test("initConstancyHeatmapView marks today as studied when present in the calendar", async (t) => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { mod } = await loadView(t, {
    getStudyCalendar: async () => ({ [key]: true }),
  });
  await mod.initConstancyHeatmapView();

  const studiedCells = document.querySelectorAll("#constancy-heatmap .heatmap-cell--studied");
  assert.strictEqual(studiedCells.length, 1);
  assert.match(studiedCells[0].getAttribute("title"), /Estudou/);

  mod.resetConstancyHeatmapView();
});

test("a service failure falls back to a message instead of leaving the grid stale", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    getStudyCalendar: async () => { throw new Error("boom"); },
  });
  await mod.initConstancyHeatmapView();

  assert.strictEqual(handleErrorCalls.length, 1);
  assert.ok(document.querySelector("#constancy-heatmap .progress-narrative-fallback"));
  assert.strictEqual(document.querySelectorAll("#constancy-heatmap .heatmap-cell").length, 0);

  mod.resetConstancyHeatmapView();
});

test("session events reload the heatmap after a debounce tick", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getStudyCalendar: async () => { calls += 1; return {}; },
  });
  await mod.initConstancyHeatmapView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(calls, 2);

  mod.resetConstancyHeatmapView();
});

test("resetConstancyHeatmapView clears the DOM and unsubscribes from the event bus", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getStudyCalendar: async () => { calls += 1; return {}; },
  });
  await mod.initConstancyHeatmapView();
  assert.strictEqual(calls, 1);

  mod.resetConstancyHeatmapView();
  assert.strictEqual(document.getElementById("constancy-heatmap").innerHTML, "");

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(calls, 1, "reset should have unsubscribed from the event bus");
});
