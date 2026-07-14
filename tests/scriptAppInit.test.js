/**
 * Tests for script.js — AUD-005 (o listener de "btn-academic-cals" era
 * re-registrado a cada login, empilhando handlers indefinidamente).
 *
 * script.js é o bootstrap principal — importa ~30 módulos e executa
 * inicialização no topo do arquivo (initErrorService, initTelemetry,
 * initAuthView(...), vários safeInit(...)). Para isolar o alvo do teste
 * (o listener de "btn-academic-cals", ligado dentro de _initApp — o
 * callback onSignedIn passado a initAuthView), mockamos por completo cada
 * import direto de script.js (mesmo padrão de tests/decisionEngine.test.js
 * ao mockar os imports diretos de decisionEngine.js): assim nenhuma
 * dependência transitiva pesada (supabase.js/config.js) chega a carregar.
 *
 * authView.js é mockado para capturar { onSignedIn, onBeforeSignOut } sem
 * executar o fluxo real de autenticação — o teste invoca esses callbacks
 * diretamente para simular múltiplos ciclos de login/logout na mesma carga
 * de página (exatamente a situação em que o listener duplicava).
 */
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";
import { ensureTestConfig } from "./mocks/configFixture.js";

const SPECIFIERS = {
  eventService: new URL("../eventService.js", import.meta.url).href,
  calendar: new URL("../calendar.js", import.meta.url).href,
  weekView: new URL("../weekView.js", import.meta.url).href,
  quickAdd: new URL("../quickAdd.js", import.meta.url).href,
  notificationService: new URL("../notificationService.js", import.meta.url).href,
  pushService: new URL("../pushService.js", import.meta.url).href,
  config: new URL("../config.js", import.meta.url).href,
  toastService: new URL("../toastService.js", import.meta.url).href,
  telemetryService: new URL("../telemetryService.js", import.meta.url).href,
  errorService: new URL("../errorService.js", import.meta.url).href,
  diagnosticService: new URL("../diagnosticService.js", import.meta.url).href,
  accountView: new URL("../accountView.js", import.meta.url).href,
  academicCalendarView: new URL("../academicCalendarView.js", import.meta.url).href,
  assistantView: new URL("../assistantView.js", import.meta.url).href,
  aiPanelView: new URL("../aiPanelView.js", import.meta.url).href,
  confirmDialog: new URL("../confirmDialog.js", import.meta.url).href,
  navigationView: new URL("../navigationView.js", import.meta.url).href,
  categoryView: new URL("../categoryView.js", import.meta.url).href,
  eventFormView: new URL("../eventFormView.js", import.meta.url).href,
  authView: new URL("../authView.js", import.meta.url).href,
  stateView: new URL("../stateView.js", import.meta.url).href,
  schemaService: new URL("../schemaService.js", import.meta.url).href,
  pwa: new URL("../pwa.js", import.meta.url).href,
  settingsModal: new URL("../settingsModal.js", import.meta.url).href,
  diagnosticModal: new URL("../diagnosticModal.js", import.meta.url).href,
  studySessionView: new URL("../studySessionView.js", import.meta.url).href,
  activityHistoryView: new URL("../activityHistoryView.js", import.meta.url).href,
  studyJournalView: new URL("../studyJournalView.js", import.meta.url).href,
  activityDashboardView: new URL("../activityDashboardView.js", import.meta.url).href,
  insightsView: new URL("../insightsView.js", import.meta.url).href,
  aiContextService: new URL("../aiContextService.js", import.meta.url).href,
};

let container;
let authCallbacks;
let openAcademicCalendarModalCalls;
let startSessionForEventCalls;
let showPageCalls;
let confirmDialogCalls;
let deleteEventCalls;

function mockScriptDependencies(t, { events = [], startSessionResult = false, confirmResult = true, getEventsImpl } = {}) {
  authCallbacks = null;
  openAcademicCalendarModalCalls = 0;
  startSessionForEventCalls = [];
  showPageCalls = [];
  confirmDialogCalls = [];
  deleteEventCalls = [];

  t.mock.module(SPECIFIERS.eventService, {
    namedExports: {
      getEvents: getEventsImpl || (async () => events), getEventById: async () => null,
      deleteEvent: async (id) => { deleteEventCalls.push(id); },
    },
  });
  t.mock.module(SPECIFIERS.calendar, {
    namedExports: {
      initCalendar: async () => {}, refreshCalendar: async () => {}, resetCalendar: () => {},
      setCalendarAcademicProvider: () => {}, setCalendarPersonalVisibility: () => {},
    },
  });
  t.mock.module(SPECIFIERS.weekView, {
    namedExports: {
      initWeekView: async () => {}, refreshWeekView: async () => {},
      setWeekViewAcademicProvider: () => {}, setWeekViewPersonalVisibility: () => {},
    },
  });
  t.mock.module(SPECIFIERS.quickAdd, { namedExports: { openQuickAdd: () => {} } });
  t.mock.module(SPECIFIERS.notificationService, {
    namedExports: { initNotifications: () => {}, scheduleReminders: () => {}, resetNotifications: () => {} },
  });
  t.mock.module(SPECIFIERS.pushService, {
    namedExports: { initPushService: () => {}, syncPushSubscription: async () => {}, resetPushService: () => {} },
  });
  t.mock.module(SPECIFIERS.config, { namedExports: { VAPID_PUBLIC_KEY: "" } });
  t.mock.module(SPECIFIERS.toastService, {
    namedExports: { toast: { error: () => {}, success: () => {}, info: () => {} } },
  });
  t.mock.module(SPECIFIERS.telemetryService, {
    namedExports: { initTelemetry: () => {}, setTelemetryDevMode: () => {}, track: () => {}, EVENTS: {} },
  });
  t.mock.module(SPECIFIERS.errorService, {
    namedExports: {
      initErrorService: () => {}, setErrorDevMode: () => {},
      handleError: (err) => ({ category: "unknown", friendly: String(err?.message || err) }),
    },
  });
  t.mock.module(SPECIFIERS.diagnosticService, { namedExports: { updateLastSync: () => {} } });
  t.mock.module(SPECIFIERS.accountView, { namedExports: { initAccountView: async () => {}, resetAccountView: () => {} } });
  t.mock.module(SPECIFIERS.academicCalendarView, {
    namedExports: {
      initAcademicCalendarView: async () => {}, initAcademicModal: () => {},
      openAcademicCalendarModal: () => { openAcademicCalendarModalCalls++; },
      renderFilterBar: () => {}, getAcademicEventProvider: () => () => Promise.resolve([]),
      isPersonalVisible: () => true, resetAcademicCalendarView: () => {},
    },
  });
  t.mock.module(SPECIFIERS.assistantView, {
    namedExports: { initAssistantView: () => {}, renderAssistant: () => {}, resetAssistant: () => {} },
  });
  t.mock.module(SPECIFIERS.aiPanelView, { namedExports: { initAIPanel: () => {}, resetAIPanel: () => {} } });
  t.mock.module(SPECIFIERS.confirmDialog, {
    namedExports: { confirmDialog: async (opts) => { confirmDialogCalls.push(opts); return confirmResult; } },
  });
  t.mock.module(SPECIFIERS.navigationView, {
    namedExports: {
      initNavigation: () => {}, restoreLastPage: () => {}, restoreSidebarState: () => {},
      showPage: (name) => { showPageCalls.push(name); },
    },
  });
  t.mock.module(SPECIFIERS.categoryView, {
    namedExports: { initCategoryView: () => {}, initCategories: async () => {}, categoryColor: () => "#3b82f6", resetCategories: () => {} },
  });
  t.mock.module(SPECIFIERS.eventFormView, {
    namedExports: { initEventForm: () => {}, openEventForm: () => {}, handleEventClick: () => {}, resetEventForm: () => {} },
  });
  t.mock.module(SPECIFIERS.authView, {
    namedExports: {
      initAuthView: (cbs) => { authCallbacks = cbs; },
      forceReauth: () => {},
    },
  });
  t.mock.module(SPECIFIERS.stateView, {
    namedExports: {
      setReauthHandler: () => {}, errorToState: () => ({ state: "error", message: "" }),
      renderStateBlock: () => {}, clearStateBlock: () => {}, STATES: { SCHEMA_MISMATCH: "schema_mismatch" },
    },
  });
  t.mock.module(SPECIFIERS.schemaService, { namedExports: { assertSchemaCompatible: async () => {} } });
  t.mock.module(SPECIFIERS.pwa, {
    namedExports: { registerServiceWorker: () => {}, initInstallButton: () => {}, initOfflineDetection: () => {} },
  });
  t.mock.module(SPECIFIERS.settingsModal, { namedExports: { initSettingsModal: () => {} } });
  t.mock.module(SPECIFIERS.diagnosticModal, { namedExports: { initDiagnosticModal: () => {} } });
  t.mock.module(SPECIFIERS.studySessionView, {
    namedExports: {
      initStudySessionView: async () => false, resetStudySessionView: () => {},
      startSessionForEvent: async (ev) => { startSessionForEventCalls.push(ev); return startSessionResult; },
    },
  });
  t.mock.module(SPECIFIERS.activityHistoryView, {
    namedExports: { initActivityHistoryView: async () => {}, resetActivityHistoryView: () => {} },
  });
  t.mock.module(SPECIFIERS.studyJournalView, {
    namedExports: { initStudyJournalView: async () => {}, resetStudyJournalView: () => {} },
  });
  t.mock.module(SPECIFIERS.activityDashboardView, {
    namedExports: { initActivityDashboardView: async () => {}, resetActivityDashboardView: () => {} },
  });
  t.mock.module(SPECIFIERS.insightsView, {
    namedExports: { initInsightsView: async () => {}, resetInsightsView: () => {} },
  });
  t.mock.module(SPECIFIERS.aiContextService, { namedExports: { resetAIContextService: () => {} } });
}

const SESSION = { user: { id: "u1", email: "user@example.com" } };

let _restoreConfig;
before(() => { _restoreConfig = ensureTestConfig(); });
after(() => { _restoreConfig(); });

beforeEach(() => {
  installDom();
  container = document.getElementById("app-screen");
});

afterEach(() => {
  uninstallDom();
});

test("btn-academic-cals gets exactly one click listener across multiple login/logout cycles", async (t) => {
  mockScriptDependencies(t);

  // Espiona addEventListener("click", ...) do botão diretamente, em vez de
  // só contar cliques: addEventListener com a MESMA referência de função
  // (o caso aqui — openAcademicCalendarModal é sempre o mesmo binding de
  // import) é deduplicado nativamente pelo DOM (WHATWG DOM 2.7 "affix an
  // event listener"), então um clique só dispararia N vezes se cada
  // registro usasse uma função *diferente* — não é o caso deste botão. O
  // que a guarda de AUD-005 precisa garantir é o registro único em si.
  const btn = document.getElementById("btn-academic-cals");
  let clickListenerRegistrations = 0;
  const originalAddEventListener = btn.addEventListener.bind(btn);
  btn.addEventListener = (type, listener, options) => {
    if (type === "click") clickListenerRegistrations++;
    return originalAddEventListener(type, listener, options);
  };

  await import(`../script.js?t=${Math.random()}`);

  assert.ok(authCallbacks?.onSignedIn, "script.js should register onSignedIn with initAuthView");
  assert.ok(authCallbacks?.onBeforeSignOut, "script.js should register onBeforeSignOut with initAuthView");

  // init() -> logout -> login -> logout -> login (o ciclo pedido pela auditoria)
  await authCallbacks.onSignedIn(SESSION);
  authCallbacks.onBeforeSignOut();
  await authCallbacks.onSignedIn(SESSION);
  authCallbacks.onBeforeSignOut();
  await authCallbacks.onSignedIn(SESSION);

  assert.strictEqual(
    clickListenerRegistrations, 1,
    "addEventListener('click', ...) on btn-academic-cals must run exactly once across the whole page load, no matter how many logins ran"
  );

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(openAcademicCalendarModalCalls, 1, "a single click opens the modal exactly once");
});

// ── Auditoria UX #13: "Iniciar sessão" no card da lista de Compromissos ────

const SAMPLE_EVENT = {
  id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12",
  start_time: "08:00:00", duration_minutes: 60,
};

test("UX #13 — clicking 'Iniciar sessão' on an event card starts the session and navigates to the study page", async (t) => {
  mockScriptDependencies(t, { events: [SAMPLE_EVENT], startSessionResult: true });

  await import(`../script.js?t=${Math.random()}`);
  await authCallbacks.onSignedIn(SESSION);
  await new Promise(r => setTimeout(r, 0));

  const btn = document.querySelector("#event-list .btn-start-session");
  assert.ok(btn, "the appointment card has a quick 'Iniciar sessão' button");

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionForEventCalls.length, 1);
  assert.strictEqual(startSessionForEventCalls[0].id, "evt-1");
  assert.ok(showPageCalls.includes("study-session"), "navigates to the study session page once started");
});

test("UX #13 — when startSessionForEvent() declines (e.g. another session already running), no navigation happens", async (t) => {
  mockScriptDependencies(t, { events: [SAMPLE_EVENT], startSessionResult: false });

  await import(`../script.js?t=${Math.random()}`);
  await authCallbacks.onSignedIn(SESSION);
  await new Promise(r => setTimeout(r, 0));

  const btn = document.querySelector("#event-list .btn-start-session");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(startSessionForEventCalls.length, 1);
  assert.strictEqual(showPageCalls.includes("study-session"), false);
  assert.strictEqual(btn.disabled, false, "the button is re-enabled after the attempt");
});

// ── Auditoria UX #14: excluir evento recorrente não avisava sobre a série ──

const RECURRING_EVENT = {
  id: "evt-2", title: "Aula semanal", event_date: "2026-08-12",
  start_time: "08:00:00", duration_minutes: 60, recurrence_type: "weekly",
};

test("UX #14 — deleting a recurring appointment from the list warns that it deletes the whole series", async (t) => {
  mockScriptDependencies(t, { events: [RECURRING_EVENT] });

  await import(`../script.js?t=${Math.random()}`);
  await authCallbacks.onSignedIn(SESSION);
  await new Promise(r => setTimeout(r, 0));

  const btn = document.querySelector("#event-list .btn-delete");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(confirmDialogCalls.length, 1);
  assert.match(confirmDialogCalls[0].message, /série/i, "the confirm dialog must mention that the whole series is deleted");
  assert.deepStrictEqual(deleteEventCalls, ["evt-2"]);
});

test("UX #14 — deleting a non-recurring appointment keeps the plain confirmation message", async (t) => {
  mockScriptDependencies(t, { events: [SAMPLE_EVENT] });

  await import(`../script.js?t=${Math.random()}`);
  await authCallbacks.onSignedIn(SESSION);
  await new Promise(r => setTimeout(r, 0));

  const btn = document.querySelector("#event-list .btn-delete");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(confirmDialogCalls.length, 1);
  assert.doesNotMatch(confirmDialogCalls[0].message, /série/i);
  assert.deepStrictEqual(deleteEventCalls, ["evt-1"]);
});

// ── Auditoria UX #20: loading inconsistente — telas em branco durante a carga

test("UX #20 — the appointments list shows a 'Carregando…' indicator while events are being fetched, instead of staying blank", async (t) => {
  let resolveEvents;
  const eventsPromise = new Promise(r => { resolveEvents = r; });
  mockScriptDependencies(t, { getEventsImpl: () => eventsPromise });

  await import(`../script.js?t=${Math.random()}`);
  const pending = authCallbacks.onSignedIn(SESSION);
  await new Promise(r => setTimeout(r, 0));

  const listEmpty = document.getElementById("list-empty");
  assert.strictEqual(listEmpty.hidden, false, "a loading indicator is shown instead of a blank list");
  assert.strictEqual(listEmpty.textContent, "Carregando…");

  resolveEvents([SAMPLE_EVENT]);
  await pending;
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(listEmpty.hidden, true, "the loading indicator is gone once the events arrive");
  assert.ok(document.querySelector("#event-list .event-card"), "the fetched event is rendered");
});
