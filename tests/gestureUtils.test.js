/**
 * Fase 7 — gestureUtils.js é o único ponto de lógica de gesto do projeto
 * (swipe-to-dismiss, swipe-actions, long-press, pull-to-refresh), consumido
 * por toastService.js, script.js e studyJournalView.js. Testado aqui de
 * forma isolada, sobre elementos mínimos — nenhuma view real envolvida.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

function pointer(type, x, y, extra = {}) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerType: "touch", bubbles: true, cancelable: true, ...extra });
}

function drag(el, path) {
  el.dispatchEvent(pointer("pointerdown", path[0][0], path[0][1]));
  for (let i = 1; i < path.length; i++) {
    el.dispatchEvent(pointer("pointermove", path[i][0], path[i][1]));
  }
  el.dispatchEvent(pointer("pointerup", path[path.length - 1][0], path[path.length - 1][1]));
}

test("attachSwipeToDismiss — a horizontal drag past the threshold calls onDismiss", async () => {
  const { attachSwipeToDismiss } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="t">toast</div>`;
  const el = document.getElementById("t");
  let dismissed = 0;
  attachSwipeToDismiss(el, { onDismiss: () => { dismissed++; }, threshold: 80 });

  drag(el, [[0, 0], [50, 0], [120, 0]]);

  assert.strictEqual(dismissed, 1);
});

test("attachSwipeToDismiss — a drag under the threshold springs back without dismissing", async () => {
  const { attachSwipeToDismiss } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="t">toast</div>`;
  const el = document.getElementById("t");
  let dismissed = 0;
  attachSwipeToDismiss(el, { onDismiss: () => { dismissed++; }, threshold: 80 });

  drag(el, [[0, 0], [20, 0], [40, 0]]);

  assert.strictEqual(dismissed, 0);
  assert.strictEqual(el.style.transform, "");
});

test("attachSwipeToDismiss — a mostly-vertical drag never dismisses (no scroll conflict)", async () => {
  const { attachSwipeToDismiss } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="t">toast</div>`;
  const el = document.getElementById("t");
  let dismissed = 0;
  attachSwipeToDismiss(el, { onDismiss: () => { dismissed++; }, threshold: 80 });

  drag(el, [[0, 0], [5, 40], [10, 150]]);

  assert.strictEqual(dismissed, 0);
});

test("attachSwipeActions — swiping past the threshold opens the reveal, and its button triggers the action", async () => {
  const { attachSwipeActions } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="item" style="width:300px"><span>content</span></div>`;
  const item = document.getElementById("item");
  const triggered = [];

  attachSwipeActions(item, {
    threshold: 60,
    // jsdom não tem motor de layout — clientWidth é sempre 0, então o
    // cálculo padrão de largura (itemEl.clientWidth * 0.6) nunca revela
    // nada aqui. maxWidth explícito reproduz o que um navegador real mede.
    maxWidth: 160,
    actions: [
      { label: "Excluir", className: "swipe-action-delete", onTrigger: () => triggered.push("delete") },
    ],
  });

  assert.ok(item.querySelector(".swipe-surface"), "wraps original content into .swipe-surface");
  assert.ok(item.querySelector(".swipe-reveal"), "creates a .swipe-reveal action layer");
  assert.strictEqual(item.querySelector(".swipe-surface span").textContent, "content", "original content is preserved");

  const surface = item.querySelector(".swipe-surface");
  drag(surface, [[300, 0], [200, 0], [120, 0]]);

  assert.notStrictEqual(surface.style.transform, "translateX(0px)");

  item.querySelector(".swipe-action-delete").click();
  assert.deepStrictEqual(triggered, ["delete"]);
});

test("attachSwipeActions — the reveal buttons are excluded from the accessibility tree (a real button is the fallback)", async () => {
  const { attachSwipeActions } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="item"><span>content</span></div>`;
  const item = document.getElementById("item");

  attachSwipeActions(item, { actions: [{ label: "Editar", onTrigger: () => {} }] });

  const reveal = item.querySelector(".swipe-reveal");
  assert.strictEqual(reveal.getAttribute("aria-hidden"), "true");
  assert.strictEqual(item.querySelector(".swipe-action-btn").tabIndex, -1);
});

test("attachLongPress — firing after the delay calls onLongPress", async () => {
  const { attachLongPress } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="row">row</div>`;
  const el = document.getElementById("row");
  let fired = 0;
  attachLongPress(el, { onLongPress: () => { fired++; }, delay: 20 });

  el.dispatchEvent(pointer("pointerdown", 10, 10));
  await new Promise(r => setTimeout(r, 40));

  assert.strictEqual(fired, 1);
});

test("attachLongPress — releasing before the delay never fires", async () => {
  const { attachLongPress } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="row">row</div>`;
  const el = document.getElementById("row");
  let fired = 0;
  attachLongPress(el, { onLongPress: () => { fired++; }, delay: 40 });

  el.dispatchEvent(pointer("pointerdown", 10, 10));
  el.dispatchEvent(pointer("pointerup", 10, 10));
  await new Promise(r => setTimeout(r, 60));

  assert.strictEqual(fired, 0);
});

test("attachLongPress — moving beyond the tolerance cancels the pending long-press (no conflict with a swipe/scroll)", async () => {
  const { attachLongPress } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="row">row</div>`;
  const el = document.getElementById("row");
  let fired = 0;
  attachLongPress(el, { onLongPress: () => { fired++; }, delay: 30, moveTolerance: 10 });

  el.dispatchEvent(pointer("pointerdown", 10, 10));
  el.dispatchEvent(pointer("pointermove", 40, 10));
  await new Promise(r => setTimeout(r, 50));

  assert.strictEqual(fired, 0);
});

test("attachPullToRefresh — pulling down past the threshold from the scroll top calls onRefresh", async () => {
  const { attachPullToRefresh } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="scroller"><ul><li>a</li></ul></div>`;
  const scroller = document.getElementById("scroller");
  Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true });
  let refreshCalls = 0;
  attachPullToRefresh(scroller, { onRefresh: async () => { refreshCalls++; }, threshold: 40 });

  drag(scroller, [[0, 0], [0, 60], [0, 140]]);
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(refreshCalls, 1);
});

test("attachPullToRefresh — does nothing when isActive() is false (another page owns the shared scroll container)", async () => {
  const { attachPullToRefresh } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="scroller"><ul><li>a</li></ul></div>`;
  const scroller = document.getElementById("scroller");
  Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true });
  let refreshCalls = 0;
  attachPullToRefresh(scroller, { onRefresh: async () => { refreshCalls++; }, isActive: () => false, threshold: 40 });

  drag(scroller, [[0, 0], [0, 60], [0, 140]]);
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(refreshCalls, 0);
});

test("attachPullToRefresh — pulling while already scrolled down does not trigger a refresh", async () => {
  const { attachPullToRefresh } = await import(`../gestureUtils.js?t=${Math.random()}`);
  document.body.innerHTML = `<div id="scroller"><ul><li>a</li></ul></div>`;
  const scroller = document.getElementById("scroller");
  Object.defineProperty(scroller, "scrollTop", { value: 30, writable: true });
  let refreshCalls = 0;
  attachPullToRefresh(scroller, { onRefresh: async () => { refreshCalls++; }, threshold: 40 });

  drag(scroller, [[0, 0], [0, 60], [0, 140]]);
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(refreshCalls, 0);
});
