/**
 * Tests for modalController.js — the shared modal lifecycle utility
 * (open/close, Focus Trap, Escape, click-outside, focus restoration) that
 * all 9 modals in the app were migrated to (Auditoria A3 + M1).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

let mc;
let overlay, closeBtn, colorInput, nameInput, addBtn, outsideButton;

beforeEach(async () => {
  installDom();
  mc = await import(`../../modalController.js?t=${Math.random()}`);

  overlay    = document.getElementById("cat-overlay");
  closeBtn   = document.getElementById("cat-close");
  colorInput = document.getElementById("cat-new-color");
  nameInput  = document.getElementById("cat-new-name");
  addBtn     = document.getElementById("cat-add");

  outsideButton = document.createElement("button");
  outsideButton.textContent = "outside";
  document.body.appendChild(outsideButton);
});

afterEach(() => {
  uninstallDom();
});

test("open() reveals the overlay and close() hides it again", () => {
  const modal = mc.initModal(overlay, () => {});
  assert.strictEqual(overlay.hidden, true);

  modal.open();
  assert.strictEqual(overlay.hidden, false);

  modal.close();
  assert.strictEqual(overlay.hidden, true);
});

test("open() moves focus to the element passed as initialFocusEl", () => {
  const modal = mc.initModal(overlay, () => {});
  modal.open(nameInput);
  assert.strictEqual(document.activeElement, nameInput);
});

test("close() restores focus to whatever was focused before open()", () => {
  outsideButton.focus();
  assert.strictEqual(document.activeElement, outsideButton);

  const modal = mc.initModal(overlay, () => {});
  modal.open(nameInput);
  assert.strictEqual(document.activeElement, nameInput);

  modal.close();
  assert.strictEqual(document.activeElement, outsideButton);
});

test("Escape closes the modal via the onClose callback", () => {
  let closed = false;
  const modal = mc.initModal(overlay, () => { closed = true; modal.close(); });
  modal.open(nameInput);

  const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(esc);

  assert.strictEqual(closed, true);
  assert.strictEqual(overlay.hidden, true);
});

test("Escape does nothing when the modal is already closed", () => {
  let closed = false;
  mc.initModal(overlay, () => { closed = true; });

  const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(esc);

  assert.strictEqual(closed, false);
});

test("clicking the overlay backdrop (not a child) closes the modal", () => {
  let closed = false;
  const modal = mc.initModal(overlay, () => { closed = true; modal.close(); });
  modal.open(nameInput);

  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(closed, true);
});

test("clicking inside the modal card does not close it", () => {
  let closed = false;
  const modal = mc.initModal(overlay, () => { closed = true; });
  modal.open(nameInput);

  nameInput.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(closed, false);
});

test("Focus Trap: Tab from the last focusable element wraps to the first", () => {
  const modal = mc.initModal(overlay, () => {});
  modal.open(nameInput);
  addBtn.focus();
  assert.strictEqual(document.activeElement, addBtn);

  const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  document.dispatchEvent(tab);

  assert.strictEqual(document.activeElement, closeBtn);
});

test("Focus Trap: Shift+Tab from the first focusable element wraps to the last", () => {
  const modal = mc.initModal(overlay, () => {});
  modal.open(nameInput);
  closeBtn.focus();
  assert.strictEqual(document.activeElement, closeBtn);

  const shiftTab = new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(shiftTab);

  assert.strictEqual(document.activeElement, addBtn);
});

test("Focus Trap: Tab between interior elements is left alone (no wrap)", () => {
  const modal = mc.initModal(overlay, () => {});
  modal.open(nameInput);
  colorInput.focus();

  const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  document.dispatchEvent(tab);

  // Our handler only intervenes at the boundaries; it does not simulate
  // native mid-sequence tab order, so focus simply stays where our code
  // left it (jsdom does not move focus for untrapped Tab presses either).
  assert.strictEqual(document.activeElement, colorInput);
});

test("Focus Trap and click-outside are inert once the modal is closed", () => {
  let closed = false;
  const modal = mc.initModal(overlay, () => { closed = true; });
  modal.open(nameInput);
  modal.close();

  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(esc);

  assert.strictEqual(closed, false);
});
