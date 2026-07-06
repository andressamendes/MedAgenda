/**
 * Golden path: Agenda semanal — weekView.js wired to a mocked
 * eventService.js, exercised through the real DOM. Dates are computed
 * relative to "today" (via the real mondayOf/isoDate helpers) instead of
 * hardcoded, since the view always renders the current week.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { mondayOf, isoDate } from "../../utils.js";

const EVENT_SERVICE_SPECIFIER = new URL("../../eventService.js", import.meta.url).href;
const ACTIVITY_SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const DECISION_ENGINE_SPECIFIER = new URL("../../decisionEngine.js", import.meta.url).href;

const EMPTY_DECISIONS = { decisions: [], planning: [], unavailable: [] };

let rangeCalls;
let summaryCalls;
let container;
let destroyWeekView;

function decision({ origem = "recommendation", origemTipo = "empty_week", prioridade = "informativo", mensagem, dadosUtilizados = {}, acaoSugerida = null }) {
  return { origem, origemTipo, prioridade, mensagem, assunto: `${origem}:${origemTipo}`, confianca: "alta", dadosUtilizados, acaoSugerida };
}

// weekView.js reaproveita decisionEngine.getDecisions() (F3.7 — Decision
// Engine) para a dica contextual (a decisão de maior prioridade) e o plano
// bruto do Planning Engine, já devolvido pela mesma chamada, para o botão
// "Ver plano da semana" (F3.5) — mockado aqui por padrão sem nenhuma decisão
// e sem plano, com `getDecisions` disponível para sobrescrever por teste.
function mockEventService(t, { events = [], fail = false, summaries = {}, summariesFail = false, getDecisions } = {}) {
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
  t.mock.module(DECISION_ENGINE_SPECIFIER, {
    namedExports: { getDecisions: getDecisions ?? (async () => EMPTY_DECISIONS) },
  });
}

function currentWeekRange() {
  const mon = mondayOf(new Date());
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return { mon, start: isoDate(mon), end: isoDate(sun) };
}

beforeEach(() => {
  installDom();
  container = document.getElementById("week-container");
});

afterEach(() => {
  // initWeekView() starts a real setInterval (the "now" line clock) that
  // would otherwise keep the process alive past the test run.
  destroyWeekView?.();
  destroyWeekView = null;
  uninstallDom();
});

test("initWeekView renders the shell and fetches events for the current week", async (t) => {
  mockEventService(t, { events: [] });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;
  const { start, end } = currentWeekRange();

  await initWeekView(container, {});

  assert.strictEqual(rangeCalls.length, 1);
  assert.deepStrictEqual(rangeCalls[0], { start, end });
  assert.ok(container.querySelector("#wk-label").textContent.length > 0);
});

test("an event on the displayed Monday is rendered and clicking it triggers onEventClick", async (t) => {
  const { mon } = currentWeekRange();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  mockEventService(t, { events: [ev] });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  let clicked = null;
  await initWeekView(container, { onEventClick: (e) => { clicked = e; } });

  const block = container.querySelector("#wk-col-0 .wk-event");
  assert.ok(block, "event block should be rendered in Monday's column");
  assert.ok(block.textContent.includes("Prova de Anatomia"));

  block.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(clicked.id, "evt-1");
});

test("clicking an empty slot triggers onSlotClick with the slot's date and time", async (t) => {
  mockEventService(t, { events: [] });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;
  const { mon } = currentWeekRange();

  let slotArgs = null;
  await initWeekView(container, { onSlotClick: (date, time) => { slotArgs = { date, time }; } });

  // First slot (index 0) in Monday's column corresponds to 00:00.
  const firstSlot = container.querySelector("#wk-col-0 .wk-slot");
  firstSlot.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(slotArgs, { date: isoDate(mon), time: "00:00" });
});

test("navigating to the next week re-fetches events for the following week", async (t) => {
  mockEventService(t, { events: [] });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;
  const { mon } = currentWeekRange();

  await initWeekView(container, {});
  container.querySelector("#wk-next").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  const nextMon = new Date(mon);
  nextMon.setDate(nextMon.getDate() + 7);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextSun.getDate() + 6);

  assert.strictEqual(rangeCalls.length, 2);
  assert.deepStrictEqual(rangeCalls[1], { start: isoDate(nextMon), end: isoDate(nextSun) });
});

test("a fetch error does not throw and leaves the week view usable", async (t) => {
  mockEventService(t, { fail: true });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await assert.doesNotReject(() => initWeekView(container, {}));
  assert.strictEqual(container.querySelectorAll(".wk-event").length, 0);
});

test("execution summaries are fetched once, in batch, for all rendered events (no N+1)", async (t) => {
  const { mon } = currentWeekRange();
  const ev1 = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  const tue = new Date(mon); tue.setDate(tue.getDate() + 1);
  const ev2 = { id: "evt-2", title: "Revisão de Fisiologia", event_date: isoDate(tue), start_time: "09:00:00", duration_minutes: 30, recurrence_type: "none" };
  mockEventService(t, { events: [ev1, ev2], summaries: {} });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});

  assert.strictEqual(summaryCalls.length, 1, "summaries should be fetched in a single batch call");
  assert.deepStrictEqual([...summaryCalls[0]].sort(), ["evt-1", "evt-2"]);
});

test("a compromisso with a running session is visually highlighted", async (t) => {
  const { mon } = currentWeekRange();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  mockEventService(t, {
    events: [ev],
    summaries: { "evt-1": { totalDuration: 0, sessionsCount: 0, lastSession: null, hasFinishedSession: false, hasRunningSession: true } },
  });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});

  const block = container.querySelector("#wk-col-0 .wk-event");
  assert.ok(block.classList.contains("wk-event-running"));
  assert.ok(block.querySelector(".wk-ev-indicator").textContent.includes("Em andamento"));
});

test("an already-executed compromisso shows the accumulated time indicator", async (t) => {
  const { mon } = currentWeekRange();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  mockEventService(t, {
    events: [ev],
    summaries: { "evt-1": { totalDuration: 200, sessionsCount: 2, lastSession: null, hasFinishedSession: true, hasRunningSession: false } },
  });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});

  const block = container.querySelector("#wk-col-0 .wk-event");
  assert.ok(block.classList.contains("wk-event-executed"));
  assert.ok(block.querySelector(".wk-ev-indicator").textContent.includes("3h20"));
});

test("a compromisso with no sessions shows no indicator", async (t) => {
  const { mon } = currentWeekRange();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  mockEventService(t, { events: [ev], summaries: {} });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});

  const block = container.querySelector("#wk-col-0 .wk-event");
  assert.strictEqual(block.querySelector(".wk-ev-indicator"), null);
  assert.strictEqual(block.classList.contains("wk-event-running"), false);
  assert.strictEqual(block.classList.contains("wk-event-executed"), false);
});

test("a failure fetching execution summaries does not break the week view", async (t) => {
  const { mon } = currentWeekRange();
  const ev = { id: "evt-1", title: "Prova de Anatomia", event_date: isoDate(mon), start_time: "14:00:00", duration_minutes: 60, recurrence_type: "none" };
  mockEventService(t, { events: [ev], summariesFail: true });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await assert.doesNotReject(() => initWeekView(container, {}));
  const block = container.querySelector("#wk-col-0 .wk-event");
  assert.ok(block, "event should still render even if summaries fail");
  assert.strictEqual(block.querySelector(".wk-ev-indicator"), null);
});

// ── Dica contextual e plano rápido (F3.5, ETAPA 4/6; consumindo o Decision
// Engine — F3.7) ─────────────────────────────────────────────────────────────
// loadTip() reaproveita decisionEngine.getDecisions() (mockado acima) para
// uma dica discreta e um botão "Ver plano da semana" que nunca abre o painel
// de IA.

async function flush() {
  await new Promise(r => setTimeout(r, 0));
}

test("a decision with an understudied category shows the 'Hoje seria interessante revisar X' tip", async (t) => {
  mockEventService(t, {
    events: [],
    getDecisions: async () => ({
      decisions: [decision({
        origem: "planning", origemTipo: "study", prioridade: "urgente",
        mensagem: "Esta categoria não recebe sessões há 10 dias.",
        dadosUtilizados: { categoria: "Anatomia" },
        acaoSugerida: { tempoSugerido: "45 minutos", dataSugerida: "2099-01-01" },
      })],
      planning: [], unavailable: [],
    }),
  });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});
  await flush();

  const tip = container.querySelector("#wk-tip");
  assert.strictEqual(tip.hidden, false);
  assert.match(tip.textContent, /Hoje seria interessante revisar Anatomia\./);
});

test("no decisions hides the tip and the plan toggle — never invents anything", async (t) => {
  mockEventService(t, { events: [] }); // getDecisions padrão devolve uma lista vazia
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});
  await flush();

  assert.strictEqual(container.querySelector("#wk-tip").hidden, true);
  assert.strictEqual(container.querySelector("#wk-plan-toggle").hidden, true);
});

test("'Ver plano da semana' toggles an inline list, without opening the AI panel", async (t) => {
  mockEventService(t, {
    events: [],
    getDecisions: async () => ({
      decisions: [],
      planning: [{ tipo: "review", prioridade: "alta", categoria: null, tempoSugerido: "15 minutos", dataSugerida: "2026-07-06", motivo: "Existem 2 revisões pendentes.", confianca: "alta" }],
      unavailable: [],
    }),
  });
  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});
  await flush();

  const toggleBtn = container.querySelector("#wk-plan-toggle");
  const planList  = container.querySelector("#wk-plan-list");
  assert.strictEqual(toggleBtn.hidden, false);
  assert.strictEqual(planList.hidden, true); // colapsado por padrão

  toggleBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(planList.hidden, false);
  assert.ok(planList.querySelector(".ai-plan-item"));
  assert.strictEqual(document.getElementById("ai-panel")?.hidden ?? true, true); // painel de IA continua fechado

  toggleBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(planList.hidden, true);
});

test("a failure loading the tip/plan decisions degrades silently, without breaking the week grid", async (t) => {
  mockEventService(t, { events: [], getDecisions: async () => { throw new Error("network down"); } });

  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await assert.doesNotReject(() => initWeekView(container, {}));
  await flush();

  assert.strictEqual(container.querySelector("#wk-tip").hidden, true);
  assert.strictEqual(container.querySelector("#wk-plan-toggle").hidden, true);
  assert.ok(container.querySelector("#wk-label").textContent.length > 0); // grade continua funcionando
});

test("navigating between weeks does not re-fetch the tip/plan decisions (no duplicated query)", async (t) => {
  let decisionCalls = 0;
  mockEventService(t, { events: [], getDecisions: async () => { decisionCalls++; return EMPTY_DECISIONS; } });

  const { initWeekView, destroyWeekView: destroy } = await import(`../../weekView.js?t=${Math.random()}`);
  destroyWeekView = destroy;

  await initWeekView(container, {});
  await flush();
  const callsAfterInit = decisionCalls;

  container.querySelector("#wk-next").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(decisionCalls, callsAfterInit, "navigating weeks must not re-fetch the Decision Engine");
});
