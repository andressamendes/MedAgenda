/**
 * Golden path: Calendário (visão mensal) — calendar.js wired to a mocked
 * eventService.js, exercised through the real DOM. Dates are computed
 * relative to "today" (via the pad() helper) instead of hardcoded, since
 * the view always renders the current month. Day 15 is used for the event
 * fixture so it's never in the leading/trailing "other month" cells.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { pad } from "../../utils.js";

const EVENT_SERVICE_SPECIFIER = new URL("../../eventService.js", import.meta.url).href;
const ACTIVITY_SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;

let rangeCalls;
let summaryCalls;
let container;

function mockEventService(t, { events = [], fail = false, summaries = {}, summariesFail = false } = {}) {
  rangeCalls = [];
  summaryCalls = [];
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      getEventsByRange: async (start, end) => {
        rangeCalls.push({ start, end });
        if (fail) throw new Error("network down");
        return events;
      },
    },
  });
  t.mock.module(ACTIVITY_SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getEventExecutionSummaries: async (ids) => {
        summaryCalls.push(ids);
        if (summariesFail) throw new Error("summaries down");
        return summaries;
      },
    },
  });
}

function currentMonthInfo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const start = `${y}-${pad(m + 1)}-01`;
  const end   = `${y}-${pad(m + 1)}-${pad(daysInMonth)}`;
  const day15 = `${y}-${pad(m + 1)}-15`;
  return { y, m, start, end, day15 };
}

function findCellByDayNum(num) {
  return Array.from(document.querySelectorAll(".cal-cell:not(.cal-other)"))
    .find(cell => cell.querySelector(".cal-day-num").textContent === String(num));
}

beforeEach(() => {
  installDom();
  container = document.getElementById("calendar-container");
});

afterEach(() => {
  uninstallDom();
});

test("initCalendar renders the shell and fetches events for the current month", async (t) => {
  mockEventService(t, { events: [] });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);
  const { start, end, y, m } = currentMonthInfo();

  await initCalendar(container, {});

  assert.strictEqual(rangeCalls.length, 1);
  assert.deepStrictEqual(rangeCalls[0], { start, end });
  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  assert.strictEqual(container.querySelector("#cal-title").textContent, `${MONTHS[m]} ${y}`);
});

test("an event is rendered as a chip on its day, and clicking it triggers onEventClick", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, { events: [ev] });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  let clicked = null;
  await initCalendar(container, { onEventClick: (e) => { clicked = e; } });

  const cell = findCellByDayNum(15);
  const chip = cell.querySelector(".cal-chip");
  assert.ok(chip, "event chip should be rendered on day 15");
  assert.strictEqual(chip.textContent, "Prova de Anatomia");

  chip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(clicked.id, "evt-1");
});

test("clicking an empty day cell triggers onDayClick with that day's date", async (t) => {
  mockEventService(t, { events: [] });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);
  const { day15 } = currentMonthInfo();

  let clickedDate = null;
  await initCalendar(container, { onDayClick: (date) => { clickedDate = date; } });

  const cell = findCellByDayNum(15);
  cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(clickedDate, day15);
});

test("navigating to the next month re-fetches events for that month", async (t) => {
  mockEventService(t, { events: [] });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);
  const { y, m } = currentMonthInfo();

  await initCalendar(container, {});
  container.querySelector("#cal-next").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 0 : m + 1;
  const nextDays = new Date(nextY, nextM + 1, 0).getDate();

  assert.strictEqual(rangeCalls.length, 2);
  assert.deepStrictEqual(rangeCalls[1], {
    start: `${nextY}-${pad(nextM + 1)}-01`,
    end:   `${nextY}-${pad(nextM + 1)}-${pad(nextDays)}`,
  });
});

test("a fetch error does not throw and renders an empty grid instead of crashing", async (t) => {
  mockEventService(t, { fail: true });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await assert.doesNotReject(() => initCalendar(container, {}));
  assert.strictEqual(container.querySelectorAll(".cal-chip").length, 0);
});

test("execution summaries are fetched once, in batch, for all rendered events (no N+1)", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev1 = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  const ev2 = { id: "evt-2", title: "Revisão de Fisiologia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, { events: [ev1, ev2], summaries: {} });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await initCalendar(container, {});

  assert.strictEqual(summaryCalls.length, 1, "summaries should be fetched in a single batch call");
  assert.deepStrictEqual([...summaryCalls[0]].sort(), ["evt-1", "evt-2"]);
});

test("a compromisso with a running session is visually highlighted", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, {
    events: [ev],
    summaries: { "evt-1": { totalDuration: 0, sessionsCount: 0, lastSession: null, hasFinishedSession: false, hasRunningSession: true } },
  });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await initCalendar(container, {});

  const chip = findCellByDayNum(15).querySelector(".cal-chip");
  assert.ok(chip.classList.contains("cal-chip-running"));
  assert.ok(chip.textContent.startsWith("●"));
  assert.ok(chip.title.includes("Em andamento"));
});

test("an already-executed compromisso shows the accumulated time indicator", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, {
    events: [ev],
    summaries: { "evt-1": { totalDuration: 200, sessionsCount: 2, lastSession: null, hasFinishedSession: true, hasRunningSession: false } },
  });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await initCalendar(container, {});

  const chip = findCellByDayNum(15).querySelector(".cal-chip");
  assert.ok(chip.classList.contains("cal-chip-executed"));
  assert.ok(chip.textContent.startsWith("✓"));
  assert.ok(chip.title.includes("3h20"));
});

test("a compromisso with no sessions shows no indicator", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, { events: [ev], summaries: {} });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await initCalendar(container, {});

  const chip = findCellByDayNum(15).querySelector(".cal-chip");
  assert.strictEqual(chip.textContent, "Prova de Anatomia");
  assert.strictEqual(chip.classList.contains("cal-chip-running"), false);
  assert.strictEqual(chip.classList.contains("cal-chip-executed"), false);
});

test("a failure fetching execution summaries does not break the calendar", async (t) => {
  const { day15 } = currentMonthInfo();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: day15, recurrence_type: "none" };
  mockEventService(t, { events: [ev], summariesFail: true });
  const { initCalendar } = await import(`../../calendar.js?t=${Math.random()}`);

  await assert.doesNotReject(() => initCalendar(container, {}));
  const chip = findCellByDayNum(15).querySelector(".cal-chip");
  assert.ok(chip, "event chip should still render even if summaries fail");
  assert.strictEqual(chip.textContent, "Prova de Anatomia");
});
