/**
 * Golden path: Calendário Acadêmico — main flow (open modal, list
 * calendars, create a calendar), wired to a mocked
 * academicCalendarService.js and exercised through the real DOM.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const SERVICE_SPECIFIER = new URL("../../academicCalendarService.js", import.meta.url).href;
// academicCalendarEventsView.js (real, imported by academicCalendarView.js)
// pulls in recurrenceService.js (F16), which unconditionally imports
// eventService.js and recurrenceExceptionsService.js at the top level — both
// need a mock too, or their own (unmocked) static import of supabase.js
// blows up even though nothing in this test file exercises recurrence.
const EVENT_SERVICE_SPECIFIER = new URL("../../eventService.js", import.meta.url).href;
const RECURRENCE_EXCEPTIONS_SPECIFIER = new URL("../../recurrenceExceptionsService.js", import.meta.url).href;

let view, serviceCalls;

function mockService(t, { calendars = [], createResult } = {}) {
  serviceCalls = [];
  let current = calendars;
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      getCalendars: async () => current,
      createCalendar: async (fields) => {
        serviceCalls.push({ fn: "createCalendar", fields });
        current = [...current, createResult];
        return createResult;
      },
      updateCalendar: async () => { throw new Error("not used in this test"); },
      deleteCalendar: async () => { throw new Error("not used in this test"); },
      getAcademicEventsByRange: async () => [],
      expandAcademicEvents: () => [],
      // Also imported by academicCalendarEventsView.js / academicCalendarICSView.js,
      // which resolve to the same specifier and therefore the same mock.
      getAcademicEvents: async () => [],
      getAcademicEventById: async () => null,
      createAcademicEvent: async () => { throw new Error("not used in this test"); },
      updateAcademicEvent: async () => { throw new Error("not used in this test"); },
      deleteAcademicEvent: async () => { throw new Error("not used in this test"); },
      bulkInsertAcademicEvents: async () => [],
    },
  });

  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      createEvent: async () => { throw new Error("not used in this test"); },
      updateEvent: async () => { throw new Error("not used in this test"); },
      deleteEvent: async () => { throw new Error("not used in this test"); },
      getEventById: async () => null,
    },
  });
  t.mock.module(RECURRENCE_EXCEPTIONS_SPECIFIER, {
    namedExports: {
      getExceptionsMap:        async () => new Map(),
      cancelOccurrence:        async () => ({}),
      overrideOccurrence:      async () => ({}),
      deleteExceptionsForBase: async () => {},
    },
  });
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("opening the modal lists the user's existing calendars", async (t) => {
  mockService(t, { calendars: [{ id: "cal-1", name: "Medicina 2026", color: "#7c3aed" }] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();

  await view.openAcademicCalendarModal();

  assert.strictEqual(document.getElementById("academic-overlay").hidden, false);
  assert.strictEqual(document.querySelectorAll(".acal-row").length, 1);
  assert.strictEqual(document.querySelector(".acal-row-name").textContent, "Medicina 2026");
});

// ── Auditoria UX #36: 5 botões por linha → "Eventos" + menu "⋯" ────────────

test("UX #36 — a calendar row shows 'Eventos' as the primary action and the rest (Importar/Exportar/Editar/Excluir) inside a collapsed '⋯' menu", async (t) => {
  mockService(t, { calendars: [{ id: "cal-1", name: "Medicina 2026", color: "#7c3aed" }] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  const row = document.querySelector(".acal-row");
  assert.ok(row.querySelector(".btn-acal-events"), "'Eventos' stays visible as the primary action");
  assert.ok(row.querySelector(".acal-row-menu-btn"), "the row has a '⋯' toggle for the remaining actions");

  const dropdown = row.querySelector(".acal-row-menu-dropdown");
  assert.ok(dropdown, "the row has a collapsed dropdown");
  assert.strictEqual(dropdown.hidden, true, "the dropdown starts collapsed");
  assert.ok(dropdown.querySelector(".btn-acal-import"));
  assert.ok(dropdown.querySelector(".btn-acal-export"));
  assert.ok(dropdown.querySelector(".btn-acal-edit"));
  assert.ok(dropdown.querySelector(".btn-acal-delete"));
});

test("UX #36 — clicking the '⋯' button opens the row's menu, and clicking outside closes it again", async (t) => {
  mockService(t, { calendars: [{ id: "cal-1", name: "Medicina 2026", color: "#7c3aed" }] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  const menuBtn = document.querySelector(".acal-row-menu-btn");
  const dropdown = document.querySelector(".acal-row-menu-dropdown");

  menuBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(dropdown.hidden, false, "opens on click");
  assert.strictEqual(menuBtn.getAttribute("aria-expanded"), "true");

  document.body.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(dropdown.hidden, true, "closes when clicking outside the menu");
  assert.strictEqual(menuBtn.getAttribute("aria-expanded"), "false");
});

test("UX #36 — opening one row's menu closes any other row's menu already open", async (t) => {
  mockService(t, {
    calendars: [
      { id: "cal-1", name: "Medicina 2026", color: "#7c3aed" },
      { id: "cal-2", name: "Residência", color: "#10b981" },
    ],
  });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  const [menuBtn1, menuBtn2] = document.querySelectorAll(".acal-row-menu-btn");
  const [dropdown1, dropdown2] = document.querySelectorAll(".acal-row-menu-dropdown");

  menuBtn1.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(dropdown1.hidden, false);

  menuBtn2.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(dropdown2.hidden, false, "the clicked row's menu opens");
  assert.strictEqual(dropdown1.hidden, true, "the previously open row's menu closes");
});

test("creating a calendar re-renders the list with the new entry", async (t) => {
  const created = { id: "cal-2", name: "Residência", color: "#10b981" };
  mockService(t, { calendars: [], createResult: created });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  document.getElementById("acal-new-name").value = "Residência";
  document.getElementById("acal-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(serviceCalls.length, 1);
  assert.strictEqual(serviceCalls[0].fields.name, "Residência");
  assert.strictEqual(document.querySelectorAll(".acal-row").length, 1);
});

// ── Auditoria UX #37: escritas mostravam err.message cru, não a mensagem
// categorizada de errorService (ex.: offline virava "Failed to fetch" em
// inglês, em vez de "Sem conexão com a internet...") ────────────────────────

test("UX #37 — creating a calendar while offline shows the network-specific message, not the raw fetch error", async (t) => {
  t.mock.module(SERVICE_SPECIFIER, {
    namedExports: {
      getCalendars: async () => [],
      createCalendar: async () => { throw new TypeError("Failed to fetch"); },
      updateCalendar: async () => { throw new Error("not used in this test"); },
      deleteCalendar: async () => { throw new Error("not used in this test"); },
      getAcademicEventsByRange: async () => [],
      expandAcademicEvents: () => [],
      getAcademicEvents: async () => [],
      createAcademicEvent: async () => { throw new Error("not used in this test"); },
      updateAcademicEvent: async () => { throw new Error("not used in this test"); },
      deleteAcademicEvent: async () => { throw new Error("not used in this test"); },
      bulkInsertAcademicEvents: async () => [],
    },
  });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  document.getElementById("acal-new-name").value = "Residência";
  document.getElementById("acal-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(
    document.getElementById("acal-error").textContent,
    "Sem conexão com a internet. Verifique sua rede e tente novamente.",
    "shows errorService's categorized network message instead of the raw 'Failed to fetch' error"
  );
});

test("creating a calendar without a name shows a validation error", async (t) => {
  mockService(t, { calendars: [] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();

  document.getElementById("acal-new-name").value = "";
  document.getElementById("acal-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("acal-error").textContent, "Nome é obrigatório.");
  assert.strictEqual(serviceCalls.length, 0);
});

test("navigating to a sub-view while already open does not re-trigger the open transition (wasHidden guard)", async (t) => {
  mockService(t, { calendars: [{ id: "cal-1", name: "Medicina 2026", color: "#7c3aed" }] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();

  const trigger = document.getElementById("btn-academic-cals");
  trigger.focus();
  await view.openAcademicCalendarModal();
  assert.strictEqual(document.getElementById("academic-overlay").hidden, false);

  // Simulate navigating to a sub-view (e.g. "Editar") while the modal is
  // already open — openModal() is reused for this and must not treat it as
  // a fresh open (which would re-capture focus mid-session). "Editar" is
  // handled entirely inside this module (no cross-module async work), so
  // it exercises the guard without pulling in unrelated sub-view mocks.
  document.querySelector(".btn-acal-edit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("academic-overlay").hidden, false);
  assert.strictEqual(document.getElementById("academic-modal-title").textContent, "Calendários Acadêmicos › Editar: Medicina 2026");
});

test("closing the modal hides the overlay and restores focus to the trigger", async (t) => {
  mockService(t, { calendars: [] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();

  const trigger = document.getElementById("btn-academic-cals");
  trigger.focus();
  await view.openAcademicCalendarModal();
  document.getElementById("academic-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("academic-overlay").hidden, true);
  assert.strictEqual(document.activeElement, trigger);
});

test("calling initAcademicModal again (second login, no page reload) does not register a duplicate close listener", async (t) => {
  mockService(t, { calendars: [] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  view.initAcademicModal(); // simulates logout + a new login in the same page session
  view.initAcademicModal();

  await view.openAcademicCalendarModal();
  assert.strictEqual(document.getElementById("academic-overlay").hidden, false);

  // A single click must close the modal exactly once, not toggle it back
  // open — the symptom of a duplicated closeModal() listener.
  document.getElementById("academic-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("academic-overlay").hidden, true);
});

test("resetAcademicCalendarView() clears the cached calendars and closes the modal", async (t) => {
  mockService(t, { calendars: [{ id: "cal-1", name: "Medicina 2026", color: "#7c3aed" }] });
  view = await import(`../../academicCalendarView.js?t=${Math.random()}`);
  view.initAcademicModal();
  await view.openAcademicCalendarModal();
  assert.strictEqual(document.getElementById("academic-overlay").hidden, false);

  view.resetAcademicCalendarView();

  assert.strictEqual(document.getElementById("academic-overlay").hidden, true);
  // The cache is empty again — the event provider short-circuits to no
  // events instead of returning the previous user's academic calendar data.
  const events = await view.getAcademicEventProvider()("2026-01-01", "2026-01-31");
  assert.deepStrictEqual(events, []);
});
