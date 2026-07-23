/**
 * F15.17 — padrão WAI-ARIA Tabs (roving tabindex + navegação por setas)
 * aplicado através de initTabs()/updateTabsRovingIndex(). Exercita o helper
 * isoladamente sobre um tablist mínimo, sem depender de nenhuma view real.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";
import { initTabs, updateTabsRovingIndex } from "../tabsController.js";

beforeEach(() => {
  installDom();
  document.body.innerHTML = `
    <div id="tl" role="tablist">
      <button type="button" role="tab" aria-selected="true" data-v="a">A</button>
      <button type="button" role="tab" aria-selected="false" data-v="b">B</button>
      <button type="button" role="tab" aria-selected="false" data-v="c">C</button>
    </div>
  `;
});

afterEach(() => {
  uninstallDom();
});

function fireKey(el, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
}

test("clicking a tab calls onActivate with that tab", () => {
  const tablist = document.getElementById("tl");
  const activated = [];
  initTabs(tablist, tab => activated.push(tab.dataset.v));

  tablist.querySelector('[data-v="b"]').click();

  assert.deepStrictEqual(activated, ["b"]);
});

test("ArrowRight/ArrowLeft move focus and wrap at the ends", () => {
  const tablist = document.getElementById("tl");
  const [a, b, c] = tablist.querySelectorAll('[role="tab"]');
  const activated = [];
  initTabs(tablist, tab => activated.push(tab.dataset.v));

  a.focus();
  fireKey(a, "ArrowRight");
  assert.strictEqual(document.activeElement, b);
  assert.deepStrictEqual(activated, ["b"]);

  fireKey(b, "ArrowRight");
  assert.strictEqual(document.activeElement, c);

  // wraps back to the first tab
  fireKey(c, "ArrowRight");
  assert.strictEqual(document.activeElement, a);

  fireKey(a, "ArrowLeft");
  assert.strictEqual(document.activeElement, c);
});

test("Home/End jump to the first/last visible tab", () => {
  const tablist = document.getElementById("tl");
  const [a, b, c] = tablist.querySelectorAll('[role="tab"]');
  initTabs(tablist, () => {});

  b.focus();
  fireKey(b, "End");
  assert.strictEqual(document.activeElement, c);

  fireKey(c, "Home");
  assert.strictEqual(document.activeElement, a);
});

test("keyboard navigation skips hidden tabs", () => {
  const tablist = document.getElementById("tl");
  const [a, b, c] = tablist.querySelectorAll('[role="tab"]');
  b.hidden = true;
  initTabs(tablist, () => {});

  a.focus();
  fireKey(a, "ArrowRight");
  assert.strictEqual(document.activeElement, c);
});

test("updateTabsRovingIndex gives tabindex 0 only to the aria-selected tab", () => {
  const tablist = document.getElementById("tl");
  const [a, b, c] = tablist.querySelectorAll('[role="tab"]');
  a.setAttribute("aria-selected", "false");
  b.setAttribute("aria-selected", "true");

  updateTabsRovingIndex(tablist);

  assert.strictEqual(a.tabIndex, -1);
  assert.strictEqual(b.tabIndex, 0);
  assert.strictEqual(c.tabIndex, -1);
});

test("updateTabsRovingIndex ignores hidden tabs when picking the selected one", () => {
  const tablist = document.getElementById("tl");
  const [a, b] = tablist.querySelectorAll('[role="tab"]');
  a.setAttribute("aria-selected", "true");
  a.hidden = true;

  updateTabsRovingIndex(tablist);

  assert.strictEqual(a.tabIndex, -1);
  assert.strictEqual(b.tabIndex, -1);
});
