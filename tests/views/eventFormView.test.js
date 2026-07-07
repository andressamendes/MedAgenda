/**
 * Golden path: "Criar / editar compromisso" — eventFormView.js wired to a
 * mocked eventService.js, exercised through the real DOM (index.html).
 * confirmDialog.js and toastService.js are used for real (pure DOM, no
 * external deps) rather than mocked.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const EVENT_SERVICE_SPECIFIER          = new URL("../../eventService.js", import.meta.url).href;
const CONFIRM_DIALOG_SPECIFIER         = new URL("../../confirmDialog.js", import.meta.url).href;
const ACTIVITY_SESSION_VIEW_SPECIFIER  = new URL("../../studySessionView.js", import.meta.url).href;
const ACTIVITY_SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const AICONTEXT_SPECIFIER              = new URL("../../aiContextService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
const EMPTY_AI_CONTEXT = {
  events: [], hasAnyEvents: false, weekEventsCount: 0,
  execution: {
    todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
    todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
    dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
  },
  reviews: { pendingCount: 0, pending: [], completedCount: 0 },
  categories: [], hasStudyHistory: false, daysSinceLastSession: null, overdueEvents: [],
};

let serviceCalls;
let startSessionForEventCalls;

function mockEventService(t, { createResult, createError, updateResult, updateError, startSessionResult = true, sessionHistory = [], sessionHistoryError, aiContext = EMPTY_AI_CONTEXT, getAIContext } = {}) {
  serviceCalls = [];
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      createEvent: async (fields) => {
        serviceCalls.push({ fn: "createEvent", fields });
        if (createError) throw createError;
        return createResult ?? { id: "evt-new", ...fields };
      },
      updateEvent: async (id, fields) => {
        serviceCalls.push({ fn: "updateEvent", id, fields });
        if (updateError) throw updateError;
        return updateResult ?? { id, ...fields };
      },
    },
  });

  // studySessionView.js (F1.4's "Iniciar Sessão" button, now F7.2's dedicated
  // page) pulls in categoryService/eventService transitively, which need
  // real Supabase config — mocked here like any other dependency instead.
  startSessionForEventCalls = [];
  t.mock.module(ACTIVITY_SESSION_VIEW_SPECIFIER, {
    namedExports: {
      startSessionForEvent: async (event) => {
        startSessionForEventCalls.push(event);
        return startSessionResult;
      },
    },
  });

  // Histórico de sessões (F1.5) — listByEvent() é a única função de
  // activitySessionService.js que eventFormView.js chama diretamente.
  t.mock.module(ACTIVITY_SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      listByEvent: async () => {
        if (sessionHistoryError) throw sessionHistoryError;
        return sessionHistory;
      },
    },
  });

  // Cards inteligentes do compromisso (F3.5) reaproveitam o Context Engine
  // (aiContextService.getAIContext()) — mockado aqui como qualquer outra
  // dependência, com um contexto vazio por padrão (nenhum card exibido).
  t.mock.module(AICONTEXT_SPECIFIER, {
    namedExports: { getAIContext: getAIContext ?? (async () => aiContext) },
  });
}

// confirmDialog.js keeps its overlay in module-level state and only builds
// it once — that state would otherwise leak across the fresh jsdom document
// each test installs, so it's mocked here like any other dependency instead
// of relying on the real DOM side effects.
function mockConfirmDialog(t, resolveTo) {
  const calls = [];
  t.mock.module(CONFIRM_DIALOG_SPECIFIER, {
    namedExports: {
      confirmDialog: async (opts) => { calls.push(opts); return resolveTo; },
    },
  });
  return calls;
}

async function flush() {
  await new Promise(r => setTimeout(r, 0));
}

function fillRequiredFields({ title = "Prova de Anatomia", date = "2026-08-10", start = "14:00" } = {}) {
  document.getElementById("f-title").value = title;
  document.getElementById("f-date").value  = date;
  document.getElementById("f-start").value = start;
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("clicking 'Novo compromisso' opens the modal, resets the form and focuses the title field", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  document.getElementById("btn-new-event").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("form-title").textContent, "Novo compromisso");
  assert.strictEqual(document.getElementById("btn-save").textContent, "Salvar compromisso");
  assert.strictEqual(document.activeElement, document.getElementById("f-title"));
});

test("submitting without a title shows a validation error and does not call createEvent", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  document.getElementById("btn-new-event").click();

  document.getElementById("f-date").value  = "2026-08-10";
  document.getElementById("f-start").value = "14:00";
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(document.getElementById("form-error").textContent, "Título é obrigatório.");
  assert.deepStrictEqual(serviceCalls, []);
});

test("submitting without a date shows a validation error and does not call createEvent", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  document.getElementById("btn-new-event").click();

  document.getElementById("f-title").value = "Prova de Anatomia";
  document.getElementById("f-start").value = "14:00";
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(document.getElementById("form-error").textContent, "Data é obrigatória.");
  assert.deepStrictEqual(serviceCalls, []);
});

test("creating an event calls createEvent with the form fields, closes the modal and triggers onSave", async (t) => {
  mockEventService(t, { createResult: { id: "evt-new" } });
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  let onSaveCalled = false;
  initEventForm(async () => { onSaveCalled = true; });
  document.getElementById("btn-new-event").click();

  fillRequiredFields();
  document.getElementById("f-location").value = "Hospital das Clínicas";
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(serviceCalls.length, 1);
  assert.strictEqual(serviceCalls[0].fn, "createEvent");
  assert.strictEqual(serviceCalls[0].fields.title, "Prova de Anatomia");
  assert.strictEqual(serviceCalls[0].fields.event_date, "2026-08-10");
  assert.strictEqual(serviceCalls[0].fields.start_time, "14:00");
  assert.strictEqual(serviceCalls[0].fields.location, "Hospital das Clínicas");
  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.strictEqual(onSaveCalled, true);
});

test("a save error from the service is shown in the form and the modal stays open", async (t) => {
  mockEventService(t, { createError: new Error("Não foi possível salvar. Tente novamente.") });
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  document.getElementById("btn-new-event").click();

  fillRequiredFields();
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(document.getElementById("form-error").textContent, "Não foi possível salvar. Tente novamente.");
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
});

test("openEventForm(event) populates the fields for editing, and submitting calls updateEvent with its id", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({
    id: "evt-1",
    title: "Plantão UPA",
    event_date: "2026-08-12",
    start_time: "08:00:00",
    duration_minutes: 360,
    category: "Plantão",
    color: "#ef4444",
    location: "UPA Centro",
    description: "Levar jaleco",
    reminder_minutes: 60,
    recurrence_type: "none",
  });

  assert.strictEqual(document.getElementById("form-title").textContent, "Editar compromisso");
  assert.strictEqual(document.getElementById("btn-save").textContent, "Atualizar compromisso");
  assert.strictEqual(document.getElementById("f-title").value, "Plantão UPA");
  assert.strictEqual(document.getElementById("f-start").value, "08:00");
  assert.strictEqual(document.getElementById("f-reminder").value, "60");

  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(serviceCalls.length, 1);
  assert.strictEqual(serviceCalls[0].fn, "updateEvent");
  assert.strictEqual(serviceCalls[0].id, "evt-1");
  assert.strictEqual(serviceCalls[0].fields.title, "Plantão UPA");
});

// ── F1.5: Histórico de Sessões do compromisso ───────────────────────────────

test("a new event never shows the session history section", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  document.getElementById("btn-new-event").click();

  assert.strictEqual(document.getElementById("session-history").hidden, true);
});

test("an event with no sessions shows a friendly empty state", async (t) => {
  mockEventService(t, { sessionHistory: [] });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  assert.strictEqual(document.getElementById("session-history").hidden, false);
  assert.strictEqual(document.getElementById("session-history-empty").hidden, false);
  assert.strictEqual(document.getElementById("session-history-list").children.length, 0);
  // Sem sessões concluídas, o card de estatísticas não aparece.
  assert.strictEqual(document.getElementById("session-stats").hidden, true);
});

test("an event with one finished session shows its date, times, duration, status and source", async (t) => {
  mockEventService(t, {
    sessionHistory: [{
      id: "sess-1", status: "finished", source: "event",
      started_at: "2026-08-12T08:00:00.000Z", ended_at: "2026-08-12T09:30:00.000Z",
      duration_minutes: 90, notes: null,
    }],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  const items = document.querySelectorAll("#session-history-list .session-history-item");
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].textContent.includes("Concluída"), true);
  assert.strictEqual(items[0].textContent.includes("1h 30min"), true);
  assert.strictEqual(items[0].textContent.includes("Compromisso"), true);
});

test("multiple sessions are rendered ordered by started_at DESC (most recent first)", async (t) => {
  mockEventService(t, {
    // O service (listByEvent) já ordena DESC — a view apenas renderiza na
    // ordem recebida, sem reordenar.
    sessionHistory: [
      { id: "sess-2", status: "finished", source: "manual", started_at: "2026-08-12T14:00:00.000Z", ended_at: "2026-08-12T15:00:00.000Z", duration_minutes: 60 },
      { id: "sess-1", status: "finished", source: "manual", started_at: "2026-08-10T08:00:00.000Z", ended_at: "2026-08-10T08:30:00.000Z", duration_minutes: 30 },
    ],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  const items = document.querySelectorAll("#session-history-list .session-history-item");
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].textContent.includes("12/08/2026"), true);
  assert.strictEqual(items[1].textContent.includes("10/08/2026"), true);
});

test("a cancelled session is labeled accordingly and keeps its notes visible", async (t) => {
  mockEventService(t, {
    sessionHistory: [{
      id: "sess-1", status: "cancelled", source: "manual",
      started_at: "2026-08-12T08:00:00.000Z", ended_at: null, duration_minutes: null,
      notes: "Interrompida por emergência.",
    }],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  const item = document.querySelector("#session-history-list .session-history-item");
  assert.strictEqual(item.textContent.includes("Cancelada"), true);
  assert.strictEqual(item.textContent.includes("Interrompida por emergência."), true);
});

test("a loading error shows a friendly message via errorService instead of breaking the form", async (t) => {
  mockEventService(t, { sessionHistoryError: new Error("Failed to fetch") });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  assert.strictEqual(document.getElementById("session-history-empty").hidden, false);
  assert.strictEqual(document.getElementById("session-history-empty").textContent.length > 0, true);
  assert.strictEqual(document.getElementById("session-history-list").children.length, 0);
  assert.strictEqual(document.getElementById("session-stats").hidden, true);
});

// ── F1.6: Estatísticas do compromisso ───────────────────────────────────────
// Os cálculos em si (soma, média, maior, última) já são testados em
// tests/activitySessionStats.test.js — aqui só verificamos que a view exibe
// o resultado corretamente e reaproveita a mesma lista do histórico.

test("a single finished session fills in every stat field", async (t) => {
  mockEventService(t, {
    sessionHistory: [{
      id: "sess-1", status: "finished", source: "manual",
      started_at: "2026-08-12T08:00:00.000Z", ended_at: "2026-08-12T08:45:00.000Z",
      duration_minutes: 45,
    }],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  assert.strictEqual(document.getElementById("session-stats").hidden, false);
  assert.strictEqual(document.getElementById("stat-total").textContent, "45min");
  assert.strictEqual(document.getElementById("stat-count").textContent, "1");
  assert.strictEqual(document.getElementById("stat-longest").textContent, "45min");
  assert.strictEqual(document.getElementById("stat-average").textContent, "45min");
});

test("multiple finished sessions produce correct totals, average and longest", async (t) => {
  mockEventService(t, {
    sessionHistory: [
      { id: "s2", status: "finished", source: "manual", started_at: "2026-08-15T08:00:00.000Z", ended_at: "2026-08-15T09:52:00.000Z", duration_minutes: 112 },
      { id: "s1", status: "finished", source: "manual", started_at: "2026-08-10T08:00:00.000Z", ended_at: "2026-08-10T08:30:00.000Z", duration_minutes: 30 },
    ],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  assert.strictEqual(document.getElementById("stat-total").textContent, "2h 22min");
  assert.strictEqual(document.getElementById("stat-count").textContent, "2");
  assert.strictEqual(document.getElementById("stat-longest").textContent, "1h 52min");
  assert.strictEqual(document.getElementById("stat-average").textContent, "1h 11min"); // (112+30)/2 = 71
  // A sessão mais recente por started_at é a "última" (s2, 15/08), independente
  // da posição em que veio na lista.
  assert.strictEqual(document.getElementById("stat-last").textContent.startsWith("15/08/2026"), true);
});

test("cancelled sessions are ignored by the stats card, even when they're the only ones", async (t) => {
  mockEventService(t, {
    sessionHistory: [
      { id: "s1", status: "cancelled", source: "manual", started_at: "2026-08-10T08:00:00.000Z", ended_at: null, duration_minutes: null },
    ],
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  // Sem sessões concluídas, mesmo havendo uma cancelada no histórico, o card
  // de estatísticas fica oculto — nunca mostra um resumo baseado em zero.
  assert.strictEqual(document.getElementById("session-stats").hidden, true);
});

test("a stats-loading error (same fetch as the history) hides the stats card instead of showing stale data", async (t) => {
  mockEventService(t, { sessionHistoryError: new Error("Failed to fetch") });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();

  assert.strictEqual(document.getElementById("session-stats").hidden, true);
});

test("'Iniciar Sessão' is hidden for a new event and shown when editing an existing one", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  document.getElementById("btn-new-event").click();
  assert.strictEqual(document.getElementById("btn-start-session").hidden, true);

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", category: "Plantão" });
  assert.strictEqual(document.getElementById("btn-start-session").hidden, false);
});

test("clicking 'Iniciar Sessão' starts a session for the event being edited, closes the modal and navigates to Sessão de Estudo", async (t) => {
  mockEventService(t, { startSessionResult: true });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const event = { id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", category: "Plantão" };
  openEventForm(event);

  document.getElementById("btn-start-session").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(startSessionForEventCalls.length, 1);
  assert.strictEqual(startSessionForEventCalls[0].id, "evt-1");
  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.strictEqual(document.getElementById("page-study-session").hidden, false);
});

test("if a session conflict isn't resolved, the form stays open so the user can retry", async (t) => {
  mockEventService(t, { startSessionResult: false });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", category: "Plantão" });

  document.getElementById("btn-start-session").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(startSessionForEventCalls.length, 1);
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
});

test("cancelling the form closes the modal without calling the service", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  document.getElementById("btn-new-event").click();

  fillRequiredFields();
  document.getElementById("btn-cancel").click();

  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.deepStrictEqual(serviceCalls, []);
});

test("handleEventClick on a recurring event asks for confirmation, and confirming opens the form", async (t) => {
  mockEventService(t);
  const confirmCalls = mockConfirmDialog(t, true);
  const { initEventForm, handleEventClick } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const recurring = {
    id: "evt-recur", title: "Aula semanal", event_date: "2026-08-10",
    start_time: "10:00:00", recurrence_type: "weekly",
  };
  await handleEventClick(recurring);

  assert.strictEqual(confirmCalls.length, 1);
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("f-title").value, "Aula semanal");
});

test("cancelling the recurring-event confirmation leaves the form closed", async (t) => {
  mockEventService(t);
  mockConfirmDialog(t, false);
  const { initEventForm, handleEventClick } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const recurring = {
    id: "evt-recur", title: "Aula semanal", event_date: "2026-08-10",
    start_time: "10:00:00", recurrence_type: "weekly",
  };
  await handleEventClick(recurring);

  assert.strictEqual(document.getElementById("event-modal").hidden, true);
});

// ── Cards inteligentes do compromisso (F3.5, ETAPA 5) ───────────────────────
// Reaproveita o Context Engine (aiContextService.getAIContext(), mockado
// acima) para exibir insights sobre o compromisso aberto — nunca altera o
// compromisso automaticamente.

test("a new event never loads or shows insight cards", async (t) => {
  mockEventService(t);
  const { initEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  document.getElementById("btn-new-event").click();
  await flush();

  assert.strictEqual(document.getElementById("event-insights").hidden, true);
});

test("editing an event in a category without a session for a while shows an 'atenção' insight", async (t) => {
  mockEventService(t, {
    aiContext: {
      ...EMPTY_AI_CONTEXT,
      categories: [{ name: "Farmacologia", minutes: 120, lastStudiedDate: "2026-06-01T00:00:00.000Z", daysSinceLastStudy: 12 }],
    },
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Revisão", event_date: "2026-08-12", start_time: "08:00:00", category: "Farmacologia", recurrence_type: "none" });
  await flush();

  const insights = document.getElementById("event-insights");
  assert.strictEqual(insights.hidden, false);
  assert.match(insights.textContent, /Última sessão desta categoria há 12 dias\./);
});

test("editing an event in a never-studied category shows a 'dica' insight instead of an invented number", async (t) => {
  mockEventService(t, {
    aiContext: {
      ...EMPTY_AI_CONTEXT,
      categories: [{ name: "Pediatria", minutes: 0, lastStudiedDate: null, daysSinceLastStudy: null }],
    },
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-2", title: "Aula", event_date: "2026-08-12", start_time: "08:00:00", category: "Pediatria", recurrence_type: "none" });
  await flush();

  assert.match(document.getElementById("event-insights").textContent, /ainda sem sessões registradas/);
});

test("editing an event while the weekly goal is nearly met shows a 'meta' insight", async (t) => {
  mockEventService(t, {
    aiContext: {
      ...EMPTY_AI_CONTEXT,
      execution: {
        ...EMPTY_AI_CONTEXT.execution,
        weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 570, percentage: 95, remainingMinutes: 30, state: "partial" },
      },
    },
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-3", title: "Aula", event_date: "2026-08-12", start_time: "08:00:00", category: null, recurrence_type: "none" });
  await flush();

  assert.match(document.getElementById("event-insights").textContent, /Meta semanal quase atingida: 95%\./);
});

test("closing the form clears any insight cards, and a failure loading them degrades silently", async (t) => {
  mockEventService(t, { aiContext: null, getAIContext: async () => { throw new Error("network down"); } });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  await assert.doesNotReject(async () => {
    openEventForm({ id: "evt-4", title: "Aula", event_date: "2026-08-12", start_time: "08:00:00", category: "Farmacologia", recurrence_type: "none" });
    await flush();
  });

  assert.strictEqual(document.getElementById("event-insights").hidden, true);
  document.getElementById("btn-cancel").click();
  assert.strictEqual(document.getElementById("event-insights").hidden, true);
});
