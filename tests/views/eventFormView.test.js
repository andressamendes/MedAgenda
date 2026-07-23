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
const RECURRENCE_SCOPE_DIALOG_SPECIFIER = new URL("../../recurrenceScopeDialog.js", import.meta.url).href;
const ACTIVITY_SESSION_VIEW_SPECIFIER  = new URL("../../studySessionView.js", import.meta.url).href;
const ACTIVITY_SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const AICONTEXT_SPECIFIER              = new URL("../../aiContextService.js", import.meta.url).href;
const CATEGORY_VIEW_SPECIFIER          = new URL("../../categoryView.js", import.meta.url).href;
const QUICKADD_SPECIFIER               = new URL("../../quickAdd.js", import.meta.url).href;
// recurrenceService.js (F16) é mockado por inteiro, não só suas dependências
// (academicCalendarService.js/recurrenceExceptionsService.js, que puxam
// supabase.js real): módulos "passe-through" como este mantêm o binding do
// eventService.js real da PRIMEIRA vez que são carregados no processo — um
// t.mock.module(EVENT_SERVICE_SPECIFIER) de um teste posterior não invalida
// esse binding já resolvido (limitação conhecida do module mocking do Node
// com módulos intermediários de URL estável). A fake abaixo reimplementa só
// o suficiente do contrato real (SCOPE/isRecurring/isExpandedOccurrence
// idênticos; applyEditScope/applyDeleteScope delegando em updateEvent/
// deleteEvent para o caminho "toda a série", o único exercitado aqui).
const RECURRENCE_SERVICE_SPECIFIER = new URL("../../recurrenceService.js", import.meta.url).href;
const SCOPE = { THIS: "this", FUTURE: "future", SERIES: "series" };

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
let openQuickAddCalls;

/**
 * Mocks recurrenceService.js delegating straight to the given updateEvent/
 * deleteEvent implementations — every eventFormView test only exercises the
 * "toda a série" scope (updateEvent(id, fields) / deleteEvent(id)), so this
 * fake reproduces just that path instead of the full split/exception logic.
 * Every test importing eventFormView.js must call this (directly or via
 * mockEventService()) — see the module-passthrough note above.
 */
function mockRecurrenceServicePassthrough(t, { updateEvent, deleteEvent }) {
  t.mock.module(RECURRENCE_SERVICE_SPECIFIER, {
    namedExports: {
      SCOPE,
      isRecurring:          (ev) => !!ev && !!ev.recurrence_type && ev.recurrence_type !== "none",
      isExpandedOccurrence: (ev) => !!ev?._isOccurrence,
      applyEditScope: async ({ occurrence, fields }) => {
        const baseId = occurrence?._isOccurrence ? occurrence._baseEventId : occurrence?.id;
        return updateEvent(baseId, fields);
      },
      applyDeleteScope: async ({ occurrence }) => {
        const baseId = occurrence?._isOccurrence ? occurrence._baseEventId : occurrence?.id;
        return deleteEvent(baseId);
      },
    },
  });
}

function mockEventService(t, { createResult, createError, updateResult, updateError, deleteError, startSessionResult = true, sessionHistory = [], sessionHistoryError, aiContext = EMPTY_AI_CONTEXT, getAIContext } = {}) {
  serviceCalls = [];
  const updateEvent = async (id, fields) => {
    serviceCalls.push({ fn: "updateEvent", id, fields });
    if (updateError) throw updateError;
    return updateResult ?? { id, ...fields };
  };
  const deleteEvent = async (id) => {
    serviceCalls.push({ fn: "deleteEvent", id });
    if (deleteError) throw deleteError;
  };
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      createEvent: async (fields) => {
        serviceCalls.push({ fn: "createEvent", fields });
        if (createError) throw createError;
        return createResult ?? { id: "evt-new", ...fields };
      },
      updateEvent,
      deleteEvent,
    },
  });

  mockRecurrenceServicePassthrough(t, { updateEvent, deleteEvent });

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

  // F11 E10 — eventFormView.js consulta categoryView.js/categoryColor() para
  // decidir se abre "Mais opções" já expandido (cor personalizada, diferente
  // da cor atual da categoria). categoryView.js importa categoryService.js,
  // que precisa de Supabase de verdade — mockado aqui como qualquer outra
  // dependência.
  t.mock.module(CATEGORY_VIEW_SPECIFIER, {
    namedExports: { categoryColor: () => "#6b7280" },
  });

  // F15.6 — "+ Novo compromisso" passou a abrir o QuickAdd; mockado aqui
  // para espionar a chamada sem arrastar o overlay real do QuickAdd (e sua
  // cadeia de imports) para dentro destes testes.
  openQuickAddCalls = [];
  t.mock.module(QUICKADD_SPECIFIER, {
    namedExports: { openQuickAdd: (...args) => { openQuickAddCalls.push(args); } },
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

// F16 — recurrenceScopeDialog.js substitui confirmDialog.js sempre que a
// edição/exclusão parte de uma ocorrência expandida de uma série
// (ev._isOccurrence — ver recurrenceService.js/isExpandedOccurrence).
function mockRecurrenceScopeDialog(t, resolveTo) {
  const calls = [];
  t.mock.module(RECURRENCE_SCOPE_DIALOG_SPECIFIER, {
    namedExports: {
      recurrenceScopeDialog: async (opts) => { calls.push(opts); return resolveTo; },
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

// F15.6 (auditoria M7) — o botão mais visível de criação abre o QuickAdd
// (título + hora + Enter), com a data de hoje editável; o formulário completo
// continua alcançável por "Mais opções" (openEventFormPrefilled).
test("F15.6 — clicking '+ Novo compromisso' opens the QuickAdd for today with an editable date, not the full form", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventFormPrefilled } = await import(`../../eventFormView.js?t=${Math.random()}`);
  const onSave = async () => {};
  initEventForm(onSave);

  document.getElementById("btn-new-event").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("event-modal").hidden, true, "full form must not open");
  assert.strictEqual(openQuickAddCalls.length, 1);
  const [date, onSaveArg, time, onMoreOptions, opts] = openQuickAddCalls[0];
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.strictEqual(date, todayISO);
  assert.strictEqual(onSaveArg, onSave, "QuickAdd saves must trigger the same refresh as the form");
  assert.strictEqual(time, "");
  assert.strictEqual(onMoreOptions, openEventFormPrefilled, "'Mais opções' must hand off to the pre-filled full form");
  assert.deepStrictEqual(opts, { editableDate: true });
});

test("openEventForm() opens the modal, resets the form and focuses the title field", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();

  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("form-title").textContent, "Novo compromisso");
  assert.strictEqual(document.getElementById("btn-save").textContent, "Salvar compromisso");
  assert.strictEqual(document.activeElement, document.getElementById("f-title"));
});

// F11 E16 (auditoria #20) — "Mais opções" a partir do QuickAdd: abre o
// formulário completo já preenchido, continuando um cadastro novo (nunca uma
// edição).
test("F11 E16 — openEventFormPrefilled() opens the modal as a new event, pre-filled with what was typed in QuickAdd", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventFormPrefilled } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventFormPrefilled({ title: "Revisar Cardiologia", event_date: "2026-08-10", start_time: "14:00" });

  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("f-title").value, "Revisar Cardiologia");
  assert.strictEqual(document.getElementById("f-date").value, "2026-08-10");
  assert.strictEqual(document.getElementById("f-start").value, "14:00");
  // Continua um cadastro NOVO — nunca uma edição do QuickAdd (que nem chega a
  // criar o compromisso antes de "Mais opções" ser clicado).
  assert.strictEqual(document.getElementById("form-title").textContent, "Novo compromisso");
  assert.strictEqual(document.getElementById("btn-save").textContent, "Salvar compromisso");
  assert.strictEqual(document.getElementById("event-id").value, "");
  assert.strictEqual(document.getElementById("btn-start-session").hidden, true);
  assert.strictEqual(document.getElementById("btn-delete-event").hidden, true);
});

test("F11 E16 — openEventFormPrefilled() with no time typed yet leaves the time field empty for the user to fill in", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventFormPrefilled } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventFormPrefilled({ title: "", event_date: "2026-08-10", start_time: "" });

  assert.strictEqual(document.getElementById("f-title").value, "");
  assert.strictEqual(document.getElementById("f-date").value, "2026-08-10");
  assert.strictEqual(document.getElementById("f-start").value, "");
});

// F11 E10 (auditoria #13) — perguntar a cor em todo cadastro era uma decisão
// a mais sem necessidade, já que ela segue a categoria escolhida
// (categoryView.js). O picker de cor nasce escondido atrás de "Mais opções".
test("F11 E10 — a new event starts with the color field collapsed behind 'Mais opções'", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();

  assert.strictEqual(document.getElementById("f-color-wrap").hidden, true);
  assert.strictEqual(document.getElementById("f-color-toggle").getAttribute("aria-expanded"), "false");
});

test("F11 E10 — clicking the color toggle reveals the color field and flips the label to Ocultar", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  openEventForm();

  const toggle = document.getElementById("f-color-toggle");
  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("f-color-wrap").hidden, false);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ocultar");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("f-color-wrap").hidden, true);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Mostrar");
});

test("F11 E10 — editing an event whose color matches its category's current color keeps the color field collapsed", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  // mockEventService() já registra categoryColor() retornando "#6b7280" —
  // mesmo valor da cor do evento abaixo, então nada foi personalizado.
  openEventForm({
    id: "evt-1", title: "Aula", event_date: "2026-08-12", start_time: "08:00",
    category: "Estudo", color: "#6b7280",
  });

  assert.strictEqual(document.getElementById("f-color-wrap").hidden, true);
  assert.strictEqual(document.getElementById("f-color-toggle").getAttribute("aria-expanded"), "false");
});

test("F11 E10 — editing an event with a custom color (different from its category's color) opens 'Mais opções' automatically", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({
    id: "evt-1", title: "Aula", event_date: "2026-08-12", start_time: "08:00",
    category: "Estudo", color: "#ff0000",
  });

  assert.strictEqual(document.getElementById("f-color").value, "#ff0000");
  assert.strictEqual(document.getElementById("f-color-wrap").hidden, false, "cor personalizada não pode ficar escondida sem o usuário saber que ela existe");
  assert.strictEqual(document.getElementById("f-color-toggle").getAttribute("aria-expanded"), "true");
});

test("submitting without a title shows a validation error and does not call createEvent", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  openEventForm();

  document.getElementById("f-date").value  = "2026-08-10";
  document.getElementById("f-start").value = "14:00";
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(document.getElementById("form-error").textContent, "Título é obrigatório.");
  assert.deepStrictEqual(serviceCalls, []);
});

test("submitting without a date shows a validation error and does not call createEvent", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  openEventForm();

  document.getElementById("f-title").value = "Prova de Anatomia";
  document.getElementById("f-start").value = "14:00";
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(document.getElementById("form-error").textContent, "Data é obrigatória.");
  assert.deepStrictEqual(serviceCalls, []);
});

test("creating an event calls createEvent with the form fields, closes the modal and triggers onSave", async (t) => {
  mockEventService(t, { createResult: { id: "evt-new" } });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  let onSaveCalled = false;
  initEventForm(async () => { onSaveCalled = true; });
  openEventForm();

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
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  openEventForm();

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

// ── Auditoria UX #12: excluir a partir do modal de edição ──────────────────

test("UX #12 — the delete button is hidden for a new event and shown when editing an existing one", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();
  assert.strictEqual(document.getElementById("btn-delete-event").hidden, true);

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" });
  assert.strictEqual(document.getElementById("btn-delete-event").hidden, false);
});

test("UX #12 — clicking Excluir asks for confirmation, deletes the event, closes the modal and refreshes", async (t) => {
  mockEventService(t);
  const confirmCalls = mockConfirmDialog(t, true);
  let refreshCalls = 0;
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm(async () => { refreshCalls++; });

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" });
  document.getElementById("btn-delete-event").click();
  await flush();

  assert.strictEqual(confirmCalls.length, 1);
  assert.strictEqual(confirmCalls[0].danger, true);
  assert.strictEqual(serviceCalls.length, 1);
  assert.deepStrictEqual(serviceCalls[0], { fn: "deleteEvent", id: "evt-1" });
  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.strictEqual(refreshCalls, 1);
});

test("UX #12 — declining the confirmation keeps the modal open and never calls deleteEvent", async (t) => {
  mockEventService(t);
  mockConfirmDialog(t, false);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" });
  document.getElementById("btn-delete-event").click();
  await flush();

  assert.strictEqual(serviceCalls.length, 0);
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
});

test("UX #12 — a deletion error keeps the modal open and shows an error toast", async (t) => {
  mockEventService(t, { deleteError: new Error("Não foi possível excluir. Tente novamente.") });
  mockConfirmDialog(t, true);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" });
  document.getElementById("btn-delete-event").click();
  await flush();

  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("btn-delete-event").disabled, false);
});

// ── Auditoria UX #14: excluir evento recorrente não avisava sobre a série ──

test("UX #14 — deleting a recurring event from the edit modal warns that it deletes the whole series", async (t) => {
  mockEventService(t);
  const confirmCalls = mockConfirmDialog(t, true);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Aula semanal", event_date: "2026-08-12", start_time: "08:00:00", recurrence_type: "weekly" });
  document.getElementById("btn-delete-event").click();
  await flush();

  assert.strictEqual(confirmCalls.length, 1);
  assert.match(confirmCalls[0].message, /série/i);
  assert.deepStrictEqual(serviceCalls[0], { fn: "deleteEvent", id: "evt-1" });
});

test("UX #14 — deleting a non-recurring event keeps the plain confirmation message", async (t) => {
  mockEventService(t);
  const confirmCalls = mockConfirmDialog(t, true);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00", recurrence_type: "none" });
  document.getElementById("btn-delete-event").click();
  await flush();

  assert.strictEqual(confirmCalls.length, 1);
  assert.doesNotMatch(confirmCalls[0].message, /série/i);
});

// ── F1.5: Histórico de Sessões do compromisso ───────────────────────────────

test("a new event never shows the session history section", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();

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

// ── Auditoria UX #26: histórico/estatísticas colapsados por padrão — o modal
// de edição não deve mais abrir direto num relatório inteiro.

test("UX #26 — the session history/stats body starts collapsed, behind a 'Mostrar histórico deste compromisso' toggle", async (t) => {
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

  const toggle = document.getElementById("session-history-toggle");
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
  assert.strictEqual(document.getElementById("session-history-body").hidden, true);
  // Os dados já foram carregados (F1.5/F1.6) — só a exibição fica colapsada.
  assert.strictEqual(document.querySelectorAll("#session-history-list .session-history-item").length, 1);

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
  assert.strictEqual(document.getElementById("session-history-body").hidden, false);

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
  assert.strictEqual(document.getElementById("session-history-body").hidden, true);
});

test("UX #26 — closing and reopening the edit modal (even for a different event) always starts the history toggle collapsed again", async (t) => {
  mockEventService(t, { sessionHistory: [] });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  await flush();
  document.getElementById("session-history-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("session-history-body").hidden, false);

  document.getElementById("btn-cancel").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  openEventForm({ id: "evt-2", title: "Aula de Cardio", event_date: "2026-08-13" });
  await flush();

  assert.strictEqual(document.getElementById("session-history-toggle").getAttribute("aria-expanded"), "false");
  assert.strictEqual(document.getElementById("session-history-body").hidden, true);
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

// F11 E14 (auditoria #18) — "Iniciar Sessão" era a última ação do formulário
// inteiro (depois de todos os campos), com estilo secundário; promovida para
// o topo do modal, antes do <form>, com destaque visual primário.
test("F11 E14 — the start-session button is promoted before the form, not buried in the bottom form-actions", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", category: "Plantão" });

  const startBtn = document.getElementById("btn-start-session");
  const form = document.getElementById("event-form");
  assert.ok(startBtn.classList.contains("event-start-cta"), "deve usar o estilo de destaque, não btn-ghost");
  assert.strictEqual(startBtn.classList.contains("btn-primary"), true);
  // compareDocumentPosition: bit 4 (DOCUMENT_POSITION_FOLLOWING) em `form`
  // relativo a `startBtn` confirma que o botão vem ANTES do formulário no DOM.
  assert.ok(startBtn.compareDocumentPosition(form) & 4);
  assert.strictEqual(form.contains(startBtn), false, "não deve mais estar dentro do <form>/.form-actions");
});

test("'Iniciar Sessão' is hidden for a new event and shown when editing an existing one", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();
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
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();
  openEventForm();

  fillRequiredFields();
  document.getElementById("btn-cancel").click();

  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.deepStrictEqual(serviceCalls, []);
});

test("handleEventClick on an expanded occurrence of a recurring series asks for the edit scope, and choosing one opens the form", async (t) => {
  mockEventService(t);
  const scopeCalls = mockRecurrenceScopeDialog(t, "series");
  const { initEventForm, handleEventClick } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const recurring = {
    id: "evt-recur", title: "Aula semanal", event_date: "2026-08-10",
    start_time: "10:00:00", recurrence_type: "weekly",
    _isOccurrence: true, _baseEventId: "evt-recur", _baseEventDate: "2026-08-03",
  };
  await handleEventClick(recurring);

  assert.strictEqual(scopeCalls.length, 1);
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("f-title").value, "Aula semanal");
});

test("cancelling the recurrence-scope dialog leaves the form closed", async (t) => {
  mockEventService(t);
  mockRecurrenceScopeDialog(t, null);
  const { initEventForm, handleEventClick } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const recurring = {
    id: "evt-recur", title: "Aula semanal", event_date: "2026-08-10",
    start_time: "10:00:00", recurrence_type: "weekly",
    _isOccurrence: true, _baseEventId: "evt-recur", _baseEventDate: "2026-08-03",
  };
  await handleEventClick(recurring);

  assert.strictEqual(document.getElementById("event-modal").hidden, true);
});

// ── F18.5 — sem bypass do Decision Engine no modal de compromisso ──────────
// Até a auditoria F18, este formulário montava seus próprios "smart cards"
// lendo o Context Engine diretamente (aiContextService.getAIContext()), com
// limiares próprios (dias sem sessão, % de meta semanal) duplicados dos já
// existentes em recommendationEngine.js — produzindo, para o mesmo dado
// ("categoria negligenciada"), um card calmo ("dica") quando passa pelo
// Decision Engine em outras telas e um card de alerta ("atenção") só aqui.
// O formulário não decide mais isso por conta própria: nenhum card espontâneo
// é montado neste modal, em nenhum cenário — quem quiser o retrospecto da
// categoria/compromisso continua tendo o botão "Ver histórico e estatísticas"
// (session-history/session-stats, já existente).

test("editing an event never shows an ad hoc smart card, however understudied the category or however close the weekly goal", async (t) => {
  mockEventService(t, {
    aiContext: {
      ...EMPTY_AI_CONTEXT,
      categories: [{ name: "Farmacologia", minutes: 120, lastStudiedDate: "2026-06-01T00:00:00.000Z", daysSinceLastStudy: 12 }],
      execution: {
        ...EMPTY_AI_CONTEXT.execution,
        weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 570, percentage: 95, remainingMinutes: 30, state: "partial" },
      },
    },
  });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Revisão", event_date: "2026-08-12", start_time: "08:00:00", category: "Farmacologia", recurrence_type: "none" });
  await flush();

  assert.strictEqual(document.getElementById("event-insights"), null);
  assert.strictEqual(document.querySelectorAll("#event-modal .smart-card, #event-detail-panel .smart-card").length, 0);
});

// ── B2: ciclo de vida do formulário (BUG 02 + BUG 03) ───────────────────────
// BUG 02 — um salvamento que ainda está em rede quando o usuário cancela e
// passa a editar outro compromisso não pode, ao terminar, sobrescrever o
// campo Data (ou qualquer outro) do compromisso que está sendo editado agora.
// BUG 03 — nenhum estado do formulário (campos, editingId, modal aberto) pode
// sobreviver ao cancelar, salvar, fechar ou trocar de usuário (logout).

test("editing the Data field repeatedly, then reopening the same event, always reflects the event's own date — never a leftover edit", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const event = { id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" };
  openEventForm(event);
  assert.strictEqual(document.getElementById("f-date").value, "2026-08-12");

  const fDate = document.getElementById("f-date");
  fDate.value = "2026-08-15";
  fDate.dispatchEvent(new window.Event("input"));
  fDate.value = "2026-08-20";
  fDate.dispatchEvent(new window.Event("change"));
  assert.strictEqual(fDate.value, "2026-08-20");

  // Cancelar descarta a edição não salva — reabrir o MESMO compromisso deve
  // mostrar sua data original, não o valor editado e abandonado.
  document.getElementById("btn-cancel").click();
  openEventForm(event);
  assert.strictEqual(document.getElementById("f-date").value, "2026-08-12");
});

test("a save still in flight when the user cancels and opens a different event does not clear/close that new edit when it resolves (BUG 02)", async (t) => {
  let resolveUpdate;
  serviceCalls = [];
  const updateEvent = (id, fields) => {
    serviceCalls.push({ fn: "updateEvent", id, fields });
    return new Promise((resolve) => { resolveUpdate = () => resolve({ id, ...fields }); });
  };
  const deleteEvent = async (id) => { serviceCalls.push({ fn: "deleteEvent", id }); };
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      createEvent: async (fields) => { serviceCalls.push({ fn: "createEvent", fields }); return { id: "evt-new", ...fields }; },
      updateEvent,
      deleteEvent,
    },
  });
  mockRecurrenceServicePassthrough(t, { updateEvent, deleteEvent });
  t.mock.module(ACTIVITY_SESSION_VIEW_SPECIFIER, { namedExports: { startSessionForEvent: async () => true } });
  t.mock.module(ACTIVITY_SESSION_SERVICE_SPECIFIER, { namedExports: { listByEvent: async () => [] } });
  t.mock.module(AICONTEXT_SPECIFIER, { namedExports: { getAIContext: async () => EMPTY_AI_CONTEXT } });
  t.mock.module(CATEGORY_VIEW_SPECIFIER, { namedExports: { categoryColor: () => "#6b7280" } });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  const eventA = { id: "evt-a", title: "Prova de Anatomia", event_date: "2026-08-10", start_time: "08:00:00" };
  openEventForm(eventA);
  document.getElementById("f-title").value = "Prova de Anatomia (editada)";
  const savePromise = new Promise((resolve) => {
    document.getElementById("btn-save").addEventListener("click", () => setTimeout(resolve, 0), { once: true });
  });
  document.getElementById("btn-save").click();
  await savePromise;

  // O usuário não espera a rede: cancela e abre outro compromisso enquanto
  // o updateEvent de A ainda está pendente.
  document.getElementById("btn-cancel").click();
  const eventB = { id: "evt-b", title: "Plantão UPA", event_date: "2026-09-01", start_time: "20:00:00" };
  openEventForm(eventB);
  const fDate = document.getElementById("f-date");
  fDate.value = "2026-09-15"; // usuário já está digitando a nova data de B

  // O salvamento de A finalmente resolve...
  resolveUpdate();
  await flush();

  // ...mas não pode fechar o modal nem sobrescrever o que o usuário está
  // editando agora — o formulário continua mostrando B, intacto.
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("f-title").value, "Plantão UPA");
  assert.strictEqual(fDate.value, "2026-09-15");
  assert.strictEqual(document.getElementById("event-id").value, "evt-b");
});

test("opening a different event after properly closing the previous one never inherits its field values", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({
    id: "evt-a", title: "Prova de Anatomia", event_date: "2026-08-10", start_time: "08:00:00",
    duration_minutes: 90, category: "Anatomia", location: "Sala 3", description: "Levar prancheta",
    reminder_minutes: 30, recurrence_type: "none",
  });
  document.getElementById("btn-cancel").click();

  openEventForm({ id: "evt-b", title: "Plantão UPA", event_date: "2026-09-01", start_time: "20:00:00" });

  assert.strictEqual(document.getElementById("f-title").value, "Plantão UPA");
  assert.strictEqual(document.getElementById("f-date").value, "2026-09-01");
  assert.strictEqual(document.getElementById("f-duration").value, "");
  assert.strictEqual(document.getElementById("f-category").value, "");
  assert.strictEqual(document.getElementById("f-location").value, "");
  assert.strictEqual(document.getElementById("f-description").value, "");
  assert.strictEqual(document.getElementById("f-reminder").value, "");
  assert.strictEqual(document.getElementById("event-id").value, "evt-b");
});

test("repeated open/cancel and open/save cycles never trigger more than one service call per save", async (t) => {
  mockEventService(t, { createResult: { id: "evt-new" } });
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm();
  fillRequiredFields({ date: "2026-08-01" });
  document.getElementById("btn-cancel").click();

  openEventForm();
  fillRequiredFields({ date: "2026-08-02" });
  document.getElementById("btn-cancel").click();

  openEventForm();
  fillRequiredFields({ date: "2026-08-03" });
  document.getElementById("btn-save").click();
  await flush();

  assert.strictEqual(serviceCalls.length, 1);
  assert.strictEqual(serviceCalls[0].fields.event_date, "2026-08-03");
});

test("resetEventForm() (called on logout / user switch) closes the modal and clears editingId, so the next session starts clean", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm, resetEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", start_time: "08:00:00" });
  assert.strictEqual(document.getElementById("event-modal").hidden, false);

  resetEventForm();

  assert.strictEqual(document.getElementById("event-modal").hidden, true);
  assert.strictEqual(document.getElementById("f-title").value, "");
  assert.strictEqual(document.getElementById("f-date").value, "");
  assert.strictEqual(document.getElementById("event-id").value, "");

  // O reset não pode deixar o formulário "travado" — a próxima sessão
  // precisa conseguir abrir o formulário normalmente.
  openEventForm({ id: "evt-2", title: "Aula", event_date: "2026-09-05", start_time: "10:00:00" });
  assert.strictEqual(document.getElementById("event-modal").hidden, false);
  assert.strictEqual(document.getElementById("f-title").value, "Aula");
  assert.strictEqual(document.getElementById("f-date").value, "2026-09-05");
});

test("resetEventForm() invalidates any in-flight session-history/insights request from the event being edited at logout time", async (t) => {
  let resolveHistory;
  serviceCalls = [];
  t.mock.module(EVENT_SERVICE_SPECIFIER, { namedExports: { createEvent: async () => {}, updateEvent: async () => {}, deleteEvent: async () => {} } });
  mockRecurrenceServicePassthrough(t, { updateEvent: async () => {}, deleteEvent: async () => {} });
  t.mock.module(ACTIVITY_SESSION_VIEW_SPECIFIER, { namedExports: { startSessionForEvent: async () => true } });
  t.mock.module(ACTIVITY_SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      listByEvent: () => new Promise((resolve) => { resolveHistory = resolve; }),
    },
  });
  t.mock.module(AICONTEXT_SPECIFIER, { namedExports: { getAIContext: async () => EMPTY_AI_CONTEXT } });
  t.mock.module(CATEGORY_VIEW_SPECIFIER, { namedExports: { categoryColor: () => "#6b7280" } });
  const { initEventForm, openEventForm, resetEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12" });
  resetEventForm();

  resolveHistory([{
    id: "sess-1", status: "finished", source: "manual",
    started_at: "2026-08-12T08:00:00.000Z", ended_at: "2026-08-12T08:45:00.000Z", duration_minutes: 45,
  }]);
  await flush();

  // A resposta chegou depois do logout — não pode popular a lista/estatísticas
  // escondidas, nem sobreviver para o próximo usuário.
  assert.strictEqual(document.getElementById("session-history-list").children.length, 0);
  assert.strictEqual(document.getElementById("session-stats").hidden, true);
});

test("two independently-initialized module instances never share form state with each other", async (t) => {
  mockEventService(t);
  const first  = await import(`../../eventFormView.js?t=${Math.random()}`);
  const second = await import(`../../eventFormView.js?t=${Math.random()}`);

  first.initEventForm();
  first.openEventForm({ id: "evt-first", title: "Do primeiro módulo", event_date: "2026-08-12", start_time: "08:00:00" });
  assert.strictEqual(document.getElementById("f-title").value, "Do primeiro módulo");

  // O segundo módulo é uma instância totalmente separada (import com query
  // string distinta) — reinicializá-lo sobre o mesmo DOM e limpar o
  // formulário não pode ser afetado por nenhum estado retido pelo primeiro.
  second.initEventForm();
  second.resetEventForm();

  assert.strictEqual(document.getElementById("f-title").value, "");
  assert.strictEqual(document.getElementById("event-modal").hidden, true);
});
