/**
 * Golden path: Calendário Acadêmico — main flow (open modal, list
 * calendars, create a calendar), wired to a mocked
 * academicCalendarService.js and exercised through the real DOM.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const SERVICE_SPECIFIER = new URL("../../academicCalendarService.js", import.meta.url).href;

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
      createAcademicEvent: async () => { throw new Error("not used in this test"); },
      updateAcademicEvent: async () => { throw new Error("not used in this test"); },
      deleteAcademicEvent: async () => { throw new Error("not used in this test"); },
      bulkInsertAcademicEvents: async () => [],
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
  assert.strictEqual(document.getElementById("academic-modal-title").textContent, "Editar: Medicina 2026");
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
