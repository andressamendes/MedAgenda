/**
 * Tests for quickAdd.js — modal leve de criação rápida de compromisso.
 * eventService.js and errorService.js are mocked (Supabase, telemetry); the
 * modal itself (overlay + modalController.js) is exercised through the real
 * DOM, same pattern as confirmDialog.js's own tests.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const EVENT_SERVICE_SPECIFIER = new URL("../../eventService.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER = new URL("../../errorService.js", import.meta.url).href;

function mockDeps(t, { createEvent } = {}) {
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { createEvent: createEvent ?? (async (fields) => ({ id: "evt-1", ...fields })) },
  });
  t.mock.module(ERROR_SERVICE_SPECIFIER, {
    namedExports: { handleError: (err) => ({ category: "unknown", friendly: err.message }) },
  });
}

beforeEach(() => installDom());
afterEach(() => uninstallDom());

// index.html already has other `.modal-overlay` elements (event form, etc.) —
// QuickAdd appends its own overlay to <body>, identified here by the
// date-label it owns.
function qaOverlay() {
  return document.getElementById("qa-date-label").closest(".modal-overlay");
}

test("openQuickAdd() shows the date label and pre-fills the time when given", async (t) => {
  mockDeps(t);
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  openQuickAdd("2026-08-10", async () => {}, "09:30");

  assert.match(document.getElementById("qa-date-label").textContent, /10 de agosto/);
  assert.strictEqual(document.getElementById("qa-time").value, "09:30");
  assert.strictEqual(qaOverlay().hidden, false);
});

// F11 E16 (auditoria #20) — "Mais opções" abre o formulário completo sem
// perder o que já foi digitado, e sem persistir nada via QuickAdd.

// F15.6 — aberto sem slot (ex.: "+ Novo compromisso"), o QuickAdd mostra um
// campo de data editável iniciado na data recebida; escolher outra data
// atualiza o cabeçalho e vale para salvar e para "Mais opções".

test("F15.6 — the date field stays hidden when opened from a calendar slot (default)", async (t) => {
  mockDeps(t);
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  openQuickAdd("2026-08-10", async () => {}, "09:30");

  assert.strictEqual(document.getElementById("qa-date").hidden, true);
});

test("F15.6 — editableDate shows the date field pre-filled and saving uses the chosen date", async (t) => {
  const createCalls = [];
  mockDeps(t, { createEvent: async (fields) => { createCalls.push(fields); return { id: "evt-1", ...fields }; } });
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  openQuickAdd("2026-08-10", async () => {}, "", undefined, { editableDate: true });

  const dateInput = document.getElementById("qa-date");
  assert.strictEqual(dateInput.hidden, false);
  assert.strictEqual(dateInput.value, "2026-08-10");

  dateInput.value = "2026-08-12";
  dateInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(document.getElementById("qa-date-label").textContent, /12 de agosto/, "header must follow the chosen date");

  document.getElementById("qa-title").value = "Revisar Cardiologia";
  document.getElementById("qa-time").value  = "14:00";
  document.getElementById("qa-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createCalls.length, 1);
  assert.strictEqual(createCalls[0].event_date, "2026-08-12");
});

test("F15.6 — with editableDate, clearing the date blocks saving with a friendly error", async (t) => {
  const createCalls = [];
  mockDeps(t, { createEvent: async (fields) => { createCalls.push(fields); return { id: "evt-1", ...fields }; } });
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  openQuickAdd("2026-08-10", async () => {}, "", undefined, { editableDate: true });
  document.getElementById("qa-title").value = "Revisar Cardiologia";
  document.getElementById("qa-time").value  = "14:00";
  const dateInput = document.getElementById("qa-date");
  dateInput.value = "";
  dateInput.dispatchEvent(new window.Event("change", { bubbles: true }));

  document.getElementById("qa-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createCalls.length, 0);
  assert.strictEqual(document.getElementById("qa-error").textContent, "Data é obrigatória.");
});

test("F15.6 — 'Mais opções' hands off the date edited inside the QuickAdd", async (t) => {
  mockDeps(t);
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  let prefillReceived = null;
  openQuickAdd("2026-08-10", async () => {}, "", (prefill) => { prefillReceived = prefill; }, { editableDate: true });
  document.getElementById("qa-title").value = "Revisar Cardiologia";
  const dateInput = document.getElementById("qa-date");
  dateInput.value = "2026-08-12";
  dateInput.dispatchEvent(new window.Event("change", { bubbles: true }));

  document.getElementById("qa-more-options").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(prefillReceived, { title: "Revisar Cardiologia", event_date: "2026-08-12", start_time: "" });
});

test("F11 E16 — clicking 'Mais opções' closes QuickAdd and hands off what was typed, without saving", async (t) => {
  const createCalls = [];
  mockDeps(t, { createEvent: async (fields) => { createCalls.push(fields); return { id: "evt-1", ...fields }; } });
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  let prefillReceived = null;
  openQuickAdd("2026-08-10", async () => {}, "", (prefill) => { prefillReceived = prefill; });
  document.getElementById("qa-title").value = "Revisar Cardiologia";
  document.getElementById("qa-time").value  = "14:00";

  document.getElementById("qa-more-options").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(qaOverlay().hidden, true, "QuickAdd must close");
  assert.deepStrictEqual(prefillReceived, { title: "Revisar Cardiologia", event_date: "2026-08-10", start_time: "14:00" });
  assert.strictEqual(createCalls.length, 0, "'Mais opções' must never create the event itself");
});

test("F11 E16 — 'Mais opções' works even with nothing typed yet (empty title/time prefill)", async (t) => {
  mockDeps(t);
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  let prefillReceived = null;
  openQuickAdd("2026-08-10", async () => {}, "", (prefill) => { prefillReceived = prefill; });
  document.getElementById("qa-more-options").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(prefillReceived, { title: "", event_date: "2026-08-10", start_time: "" });
});

test("F11 E16 — 'Mais opções' with no callback wired (e.g. old call site) degrades silently", async (t) => {
  mockDeps(t);
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  openQuickAdd("2026-08-10", async () => {});
  assert.doesNotThrow(() => {
    document.getElementById("qa-more-options").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
});

test("saving with title and time creates the event and calls onSave()", async (t) => {
  const createCalls = [];
  mockDeps(t, { createEvent: async (fields) => { createCalls.push(fields); return { id: "evt-1", ...fields }; } });
  const { openQuickAdd } = await import(`../../quickAdd.js?t=${Math.random()}`);

  let onSaveCalled = false;
  openQuickAdd("2026-08-10", async () => { onSaveCalled = true; });
  document.getElementById("qa-title").value = "Revisar Cardiologia";
  document.getElementById("qa-time").value  = "14:00";
  document.getElementById("qa-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(createCalls.length, 1);
  assert.strictEqual(createCalls[0].title, "Revisar Cardiologia");
  assert.strictEqual(onSaveCalled, true);
  assert.strictEqual(qaOverlay().hidden, true);
});
