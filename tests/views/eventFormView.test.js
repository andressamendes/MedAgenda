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
const ACTIVITY_SESSION_VIEW_SPECIFIER  = new URL("../../activitySessionView.js", import.meta.url).href;

let serviceCalls;
let startSessionForEventCalls;

function mockEventService(t, { createResult, createError, updateResult, updateError, startSessionResult = true } = {}) {
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

  // activitySessionView.js (F1.4's "Iniciar Sessão" button) pulls in
  // categoryService/eventService transitively, which need real Supabase
  // config — mocked here like any other dependency instead.
  startSessionForEventCalls = [];
  t.mock.module(ACTIVITY_SESSION_VIEW_SPECIFIER, {
    namedExports: {
      startSessionForEvent: async (event) => {
        startSessionForEventCalls.push(event);
        return startSessionResult;
      },
    },
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

test("'Iniciar Sessão' is hidden for a new event and shown when editing an existing one", async (t) => {
  mockEventService(t);
  const { initEventForm, openEventForm } = await import(`../../eventFormView.js?t=${Math.random()}`);
  initEventForm();

  document.getElementById("btn-new-event").click();
  assert.strictEqual(document.getElementById("btn-start-session").hidden, true);

  openEventForm({ id: "evt-1", title: "Plantão UPA", event_date: "2026-08-12", category: "Plantão" });
  assert.strictEqual(document.getElementById("btn-start-session").hidden, false);
});

test("clicking 'Iniciar Sessão' starts a session for the event being edited and closes the modal", async (t) => {
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
