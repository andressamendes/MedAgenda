/**
 * Tests for confirmDialog.js — Auditoria UX #15: o foco inicial ficava
 * sempre no botão "Cancelar", então Enter cancelava em toda confirmação,
 * mesmo nas não-destrutivas (danger: false) — divergente do QuickAdd, onde
 * Enter salva. Foco inicial passa a acompanhar a ação primária: Confirmar
 * quando danger é false, Cancelar (defensável) quando danger é true.
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

test("UX #15 — a non-destructive confirmation (danger: false) focuses the primary/confirm button", async () => {
  const { confirmDialog } = await import(`../confirmDialog.js?t=${Math.random()}`);

  confirmDialog({ title: "Continuar?", message: "Isso editará toda a série.", danger: false });

  assert.strictEqual(document.activeElement.id, "cd-confirm");
});

test("UX #15 — a destructive confirmation (danger: true) still focuses Cancelar", async () => {
  const { confirmDialog } = await import(`../confirmDialog.js?t=${Math.random()}`);

  confirmDialog({ title: "Excluir?", message: "Tem certeza?", danger: true });

  assert.strictEqual(document.activeElement.id, "cd-cancel");
});
