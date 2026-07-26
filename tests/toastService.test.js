/**
 * Fase 7 — cobre só a integração nova (swipe-to-dismiss via gestureUtils.js);
 * o comportamento pré-existente de showToast() (tipos, MAX_TOASTS, timers)
 * já era coberto indiretamente pelas views que o consomem.
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

function pointer(type, x, y) {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerType: "touch", bubbles: true, cancelable: true });
}

test("a horizontal swipe past the threshold removes the toast, same as clicking its close button", async () => {
  const { showToast } = await import(`../toastService.js?t=${Math.random()}`);
  showToast("Compromisso excluído.", "success", 0);

  const toast = document.querySelector(".toast");
  assert.ok(toast, "toast was rendered");
  // O botão "Fechar" continua existindo e é o fallback acessível — o swipe é
  // só um atalho de gesto para a mesma dismiss().
  assert.ok(toast.querySelector(".toast-close"), "accessible close button fallback is still present");

  toast.dispatchEvent(pointer("pointerdown", 0, 0));
  toast.dispatchEvent(pointer("pointermove", 60, 0));
  toast.dispatchEvent(pointer("pointermove", 140, 0));
  toast.dispatchEvent(pointer("pointerup", 140, 0));

  assert.ok(toast.classList.contains("toast-out"), "swipe past the threshold starts the same exit animation as dismiss()");
});

test("a short horizontal swipe under the threshold leaves the toast in place", async () => {
  const { showToast } = await import(`../toastService.js?t=${Math.random()}`);
  showToast("Compromisso excluído.", "success", 0);

  const toast = document.querySelector(".toast");
  toast.dispatchEvent(pointer("pointerdown", 0, 0));
  toast.dispatchEvent(pointer("pointermove", 10, 0));
  toast.dispatchEvent(pointer("pointerup", 20, 0));

  assert.ok(!toast.classList.contains("toast-out"));
  assert.ok(document.body.contains(toast));
});
