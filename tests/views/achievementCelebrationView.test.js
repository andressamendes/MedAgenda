/**
 * V5.7 — tela de celebração de conquista desbloqueada: revelação em tela
 * cheia, nunca um toast padrão, mostrada uma conquista de cada vez quando
 * mais de uma se completa na mesma carga.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

function loadView() {
  return import(`../../achievementCelebrationView.js?t=${Math.random()}`);
}

function achievement(overrides = {}) {
  return { id: "a1", title: "Tempo de estudo", description: "Acumule 100 horas de estudo.", icon: "clock", ...overrides };
}

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("celebrating one achievement reveals the fullscreen screen with its title and description", async () => {
  const { initAchievementCelebrationView, celebrateAchievements } = await loadView();
  initAchievementCelebrationView();

  celebrateAchievements([achievement()]);

  const screen = document.getElementById("achievement-celebration-screen");
  assert.strictEqual(screen.hidden, false);
  assert.strictEqual(document.getElementById("achv-celebration-title").textContent, "Tempo de estudo");
  assert.strictEqual(document.getElementById("achv-celebration-desc").textContent, "Acumule 100 horas de estudo.");
});

test("calling with an empty list is a safe no-op", async () => {
  const { initAchievementCelebrationView, celebrateAchievements } = await loadView();
  initAchievementCelebrationView();

  celebrateAchievements([]);

  assert.strictEqual(document.getElementById("achievement-celebration-screen").hidden, true);
});

test("two achievements completing together are revealed one at a time, never stacked", async () => {
  const { initAchievementCelebrationView, celebrateAchievements } = await loadView();
  initAchievementCelebrationView();

  celebrateAchievements([
    achievement({ id: "a1", title: "Tempo de estudo" }),
    achievement({ id: "a2", title: "Constância" }),
  ]);

  const screen = document.getElementById("achievement-celebration-screen");
  const titleEl = document.getElementById("achv-celebration-title");
  assert.strictEqual(screen.hidden, false);
  assert.strictEqual(titleEl.textContent, "Tempo de estudo");

  document.getElementById("achv-celebration-continue").click();

  assert.strictEqual(screen.hidden, false, "the second achievement's celebration opens right after the first is dismissed");
  assert.strictEqual(titleEl.textContent, "Constância");

  document.getElementById("achv-celebration-continue").click();
  assert.strictEqual(screen.hidden, true, "the screen closes once the queue is empty");
});

test("resetAchievementCelebrationView() hides the screen and clears the pending queue (logout/user switch)", async () => {
  const { initAchievementCelebrationView, celebrateAchievements, resetAchievementCelebrationView } = await loadView();
  initAchievementCelebrationView();

  celebrateAchievements([achievement({ id: "a1" }), achievement({ id: "a2" })]);
  resetAchievementCelebrationView();

  const screen = document.getElementById("achievement-celebration-screen");
  assert.strictEqual(screen.hidden, true);

  // A subsequent celebration call after reset starts a clean queue: only the
  // achievement passed to that call shows, none of the reset-away ones.
  celebrateAchievements([achievement({ id: "a3", title: "Matérias estudadas" })]);
  assert.strictEqual(document.getElementById("achv-celebration-title").textContent, "Matérias estudadas");
});
