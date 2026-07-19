/**
 * Tests for todayView.js — tela "Hoje", nova porta de entrada do app (F14.1).
 * activitySessionService.js, eventService.js, studySessionView.js,
 * navigationView.js, academicCalendarView.js and decisionEngine.js are
 * mocked; sessionEventBus.js and smartCardView.js are used for real (pure,
 * no DOM/I/O) — same pattern as tests/views/activeSessionIndicatorView.test.js.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

// t.mock.module(DECISION_ENGINE_SPECIFIER, ...) substitui TODOS os exports
// do módulo — não dá pra importar o filtro real de decisionEngine.js aqui
// (import estático rodaria antes de qualquer mock e arrastaria toda a cadeia
// de dependências reais, incluindo supabase.js). Reproduz só a regra pura
// que filterSpontaneousDecisions() aplica (F14.6): mesmo conjunto de
// assuntos acionáveis, sem nenhuma lógica nova.
const SPONTANEOUS_SUBJECTS = new Set(["revisoes_pendentes", "compromissos_atrasados"]);
function filterSpontaneousDecisions(decisions) {
  return (decisions || []).filter(d => SPONTANEOUS_SUBJECTS.has(d.assunto));
}

const EVENT_SERVICE_SPECIFIER    = new URL("../../eventService.js", import.meta.url).href;
const RECURRENCE_SPECIFIER       = new URL("../../recurrence.js", import.meta.url).href;
const ACADEMIC_SPECIFIER         = new URL("../../academicCalendarView.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const STUDY_SESSION_SPECIFIER    = new URL("../../studySessionView.js", import.meta.url).href;
const NAVIGATION_SPECIFIER       = new URL("../../navigationView.js", import.meta.url).href;
const DECISION_ENGINE_SPECIFIER  = new URL("../../decisionEngine.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER    = new URL("../../errorService.js", import.meta.url).href;

let showPageCalls;
let startSessionForEventCalls;
let openStartModalCalls;
let startSessionCalls;

function loadView(t, overrides = {}) {
  showPageCalls = [];
  startSessionForEventCalls = [];
  openStartModalCalls = [];
  startSessionCalls = [];

  t.mock.module(ERROR_SERVICE_SPECIFIER, {
    namedExports: { handleError: (err) => ({ category: "unknown", friendly: err?.message }) },
  });
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      getEventsByRange: overrides.getEventsByRange ?? (async () => []),
      getEventById:     overrides.getEventById ?? (async () => null),
    },
  });
  t.mock.module(RECURRENCE_SPECIFIER, {
    namedExports: { expandEvents: overrides.expandEvents ?? ((events) => events) },
  });
  t.mock.module(ACADEMIC_SPECIFIER, {
    namedExports: { isPersonalVisible: overrides.isPersonalVisible ?? (() => true) },
  });
  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActiveSession: overrides.getActiveSession ?? (async () => null),
      listSessions:     overrides.listSessions ?? (async () => ({ sessions: [], total: 0, hasMore: false })),
      startSession:     overrides.startSession ?? (async (fields) => { startSessionCalls.push(fields); return { id: "s-new", status: "running" }; }),
    },
  });
  t.mock.module(STUDY_SESSION_SPECIFIER, {
    namedExports: {
      startSessionForEvent: overrides.startSessionForEvent ?? (async (ev) => { startSessionForEventCalls.push(ev); return true; }),
      openStartModal: () => { openStartModalCalls.push(true); },
    },
  });
  t.mock.module(NAVIGATION_SPECIFIER, {
    namedExports: { showPage: (name) => { showPageCalls.push(name); } },
  });
  t.mock.module(DECISION_ENGINE_SPECIFIER, {
    namedExports: {
      getDecisions: overrides.getDecisions ?? (async () => ({ decisions: [], planning: [] })),
      filterSpontaneousDecisions,
    },
  });

  return import(`../../todayView.js?t=${Math.random()}`);
}

beforeEach(() => {
  installDom();
  clearEventBus();
});

afterEach(() => {
  uninstallDom();
  clearEventBus();
});

test("with no active session and no history, only 'Começar a estudar' is shown", async (t) => {
  const { initTodayView } = await loadView(t);
  await initTodayView();

  assert.strictEqual(document.getElementById("today-btn-start").hidden, false);
  assert.strictEqual(document.getElementById("today-btn-resume").hidden, true);
  assert.strictEqual(document.getElementById("today-btn-continue").hidden, true);
});

test("clicking 'Começar a estudar' navigates to the study session page and opens the start modal", async (t) => {
  const { initTodayView } = await loadView(t);
  await initTodayView();

  document.getElementById("today-btn-start").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(showPageCalls, ["study-session"]);
  assert.strictEqual(openStartModalCalls.length, 1);
});

test("an active (running/paused) session shows only 'Continuar sessão em andamento'", async (t) => {
  const { initTodayView } = await loadView(t, {
    getActiveSession: async () => ({ id: "s1", status: "running" }),
  });
  await initTodayView();

  assert.strictEqual(document.getElementById("today-btn-resume").hidden, false);
  assert.strictEqual(document.getElementById("today-btn-start").hidden, true);
  assert.strictEqual(document.getElementById("today-btn-continue").hidden, true);

  document.getElementById("today-btn-resume").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.deepStrictEqual(showPageCalls, ["study-session"]);
});

test("a last finished session (manual, with a title) shows 'Continuar: {título}'", async (t) => {
  const { initTodayView } = await loadView(t, {
    listSessions: async () => ({ sessions: [{ id: "s0", title: "Revisão de Cardiologia", category_id: "cat-1" }], total: 1, hasMore: false }),
  });
  await initTodayView();

  const continueBtn = document.getElementById("today-btn-continue");
  assert.strictEqual(continueBtn.hidden, false);
  assert.strictEqual(continueBtn.textContent, "Continuar: Revisão de Cardiologia");

  continueBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.deepStrictEqual(startSessionCalls, [{ source: "manual", title: "Revisão de Cardiologia", category_id: "cat-1" }]);
  assert.ok(showPageCalls.includes("study-session"));
});

test("a last finished session linked to a (still existing) event resolves the title from the event", async (t) => {
  const { initTodayView } = await loadView(t, {
    listSessions: async () => ({ sessions: [{ id: "s0", event_id: "evt-9", category_id: null }], total: 1, hasMore: false }),
    getEventById: async (id) => (id === "evt-9" ? { id, title: "Plantão UPA" } : null),
  });
  await initTodayView();

  assert.strictEqual(document.getElementById("today-btn-continue").hidden, false);
  assert.strictEqual(document.getElementById("today-btn-continue").textContent, "Continuar: Plantão UPA");
});

test("no last session at all keeps 'Continuar' hidden", async (t) => {
  const { initTodayView } = await loadView(t, {
    listSessions: async () => ({ sessions: [], total: 0, hasMore: false }),
  });
  await initTodayView();

  assert.strictEqual(document.getElementById("today-btn-continue").hidden, true);
});

test("today's appointments are listed, sorted by start time", async (t) => {
  const events = [
    { id: "e2", title: "Aula de Cardiologia", start_time: "14:00:00" },
    { id: "e1", title: "Plantão UPA", start_time: "08:00:00" },
  ];
  const { initTodayView } = await loadView(t, {
    getEventsByRange: async () => events,
  });
  await initTodayView();

  const items = Array.from(document.querySelectorAll("#today-appointments-list .today-appt-item"));
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].querySelector(".today-appt-title").textContent, "Plantão UPA");
  assert.strictEqual(items[0].querySelector(".today-appt-time").textContent, "08:00");
  assert.strictEqual(items[1].querySelector(".today-appt-title").textContent, "Aula de Cardiologia");
  assert.strictEqual(document.getElementById("today-appointments-empty").hidden, true);
});

test("no appointments today shows the empty message", async (t) => {
  const { initTodayView } = await loadView(t);
  await initTodayView();

  assert.strictEqual(document.getElementById("today-appointments-empty").hidden, false);
  assert.strictEqual(document.querySelectorAll("#today-appointments-list .today-appt-item").length, 0);
});

test("clicking 'Iniciar sessão' on a today's appointment starts the session and navigates", async (t) => {
  const event = { id: "e1", title: "Plantão UPA", start_time: "08:00:00" };
  const { initTodayView } = await loadView(t, { getEventsByRange: async () => [event] });
  await initTodayView();

  document.querySelector(".today-appt-start").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionForEventCalls.length, 1);
  assert.strictEqual(startSessionForEventCalls[0].id, "e1");
  assert.ok(showPageCalls.includes("study-session"));
});

test("personal events hidden (isPersonalVisible() false) show no appointments", async (t) => {
  const { initTodayView } = await loadView(t, {
    isPersonalVisible: () => false,
    getEventsByRange: async () => { throw new Error("should not be called"); },
  });
  await initTodayView();

  assert.strictEqual(document.getElementById("today-appointments-empty").hidden, false);
});

// F14.6 — a dica espontânea só considera decisões acionáveis (assunto
// "revisoes_pendentes"/"compromissos_atrasados"); mesmo havendo duas
// decisões acionáveis, nunca mais de um card aparece de graça.
test("at most one smart card is shown, taken from the Decision Engine", async (t) => {
  const { initTodayView } = await loadView(t, {
    getDecisions: async () => ({
      decisions: [
        { origem: "recommendation", origemTipo: "pending_reviews", assunto: "revisoes_pendentes", mensagem: "Você tem 3 revisões pendentes." },
        { origem: "recommendation", origemTipo: "overdue_events", assunto: "compromissos_atrasados", mensagem: "Você tem 2 compromissos atrasados." },
      ],
      planning: [],
    }),
  });
  await initTodayView();

  const tip = document.getElementById("today-tip");
  assert.strictEqual(tip.hidden, false);
  assert.strictEqual(tip.querySelectorAll(".smart-card").length, 1);
  assert.match(tip.textContent, /Você tem 3 revisões pendentes\./);
});

test("no decisions at all keeps the tip container hidden", async (t) => {
  const { initTodayView } = await loadView(t);
  await initTodayView();

  assert.strictEqual(document.getElementById("today-tip").hidden, true);
});

test("F14.6 — a non-actionable decision (no matching assunto) never shows as a spontaneous tip", async (t) => {
  const { initTodayView } = await loadView(t, {
    getDecisions: async () => ({
      decisions: [
        { origem: "recommendation", origemTipo: "study", assunto: "carga_semana", mensagem: "Revise Anatomia hoje." },
        { origem: "recommendation", origemTipo: "goal", assunto: "meta_semanal", mensagem: "Meta quase batida." },
      ],
      planning: [],
    }),
  });
  await initTodayView();

  assert.strictEqual(document.getElementById("today-tip").hidden, true);
});

test("SessionStarted published elsewhere refreshes the hero without a page reload", async (t) => {
  let active = null;
  const { initTodayView } = await loadView(t, { getActiveSession: async () => active });
  await initTodayView();
  assert.strictEqual(document.getElementById("today-btn-start").hidden, false);

  active = { id: "s2", status: "running" };
  publish(SESSION_EVENTS.STARTED, active);
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("today-btn-resume").hidden, false);
  assert.strictEqual(document.getElementById("today-btn-start").hidden, true);
});

test("resetTodayView() stops reacting to further bus events", async (t) => {
  const { initTodayView, resetTodayView } = await loadView(t);
  await initTodayView();
  resetTodayView();

  publish(SESSION_EVENTS.STARTED, { id: "s-leftover", status: "running" });
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("today-btn-resume").hidden, true);
});

test("initTodayView() called twice never registers duplicate click listeners", async (t) => {
  const { initTodayView } = await loadView(t);
  await initTodayView();
  await initTodayView();

  document.getElementById("today-btn-start").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(openStartModalCalls.length, 1, "a second init must not double-bind the click listener");
});
