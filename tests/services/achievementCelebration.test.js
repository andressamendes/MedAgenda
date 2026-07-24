/**
 * Tests for the celebration tracking added to achievementService.js (V5.7).
 * Conquistas continuam nunca persistidas — apenas uma marca "já celebrada"
 * por device/usuário em localStorage (mesmo padrão de TOUR_SEEN_KEY em
 * onboardingTourView.js), separada dos valores de progresso em si.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const STREAK_SERVICE_SPECIFIER = new URL("../../studyStreakService.js", import.meta.url).href;
const SUBJECT_PROGRESS_SERVICE_SPECIFIER = new URL("../../subjectProgressService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTION_SERVICE_SPECIFIER = new URL("../../questionService.js", import.meta.url).href;

function achievement(overrides = {}) {
  return { id: "a1", title: "T", description: "D", completed: false, ...overrides };
}

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

// A celebração só depende do resultado já computado de listAchievements()
// (recebido como argumento pelos testes abaixo), nunca das fontes derivadas
// em si — mas achievementService.js importa os quatro services abaixo no
// topo do arquivo, e sem mocká-los o import real encadearia até
// supabase.js. Mesmo mock "módulo inteiro" de achievementService.test.js,
// usado aqui só para permitir o import.
function loadService(t) {
  const noop = async () => { throw new Error("não deveria ser chamado nestes testes"); };
  t.mock.module(STREAK_SERVICE_SPECIFIER, { namedExports: { getStreakSummary: noop } });
  t.mock.module(SUBJECT_PROGRESS_SERVICE_SPECIFIER, { namedExports: { listSubjectsProgress: noop } });
  t.mock.module(SESSION_SERVICE_SPECIFIER, { namedExports: { getActivitySessions: noop } });
  t.mock.module(QUESTION_SERVICE_SPECIFIER, { namedExports: { getQuestions: noop } });
  return import(`../../achievementService.js?t=${Math.random()}`);
}

test("without a userId (never logged in yet), consumeNewlyCompleted is a safe no-op", async (t) => {
  const { consumeNewlyCompleted } = await loadService(t);
  const result = consumeNewlyCompleted([achievement({ id: "a1", completed: true })]);
  assert.deepStrictEqual(result, []);
});

test("first call ever for a user backfills already-completed achievements as seen, without celebrating them", async (t) => {
  const { initAchievementCelebrationTracking, consumeNewlyCompleted } = await loadService(t);
  initAchievementCelebrationTracking("user-1");

  const achievements = [
    achievement({ id: "a1", completed: true }),
    achievement({ id: "a2", completed: false }),
  ];
  const result = consumeNewlyCompleted(achievements);

  assert.deepStrictEqual(result, [], "no retroactive celebration on the very first check");
  assert.strictEqual(localStorage.getItem("medagenda_achv_seen_user-1"), JSON.stringify(["a1"]));
});

test("an achievement that crosses into completed after the baseline is reported exactly once", async (t) => {
  const { initAchievementCelebrationTracking, consumeNewlyCompleted } = await loadService(t);
  initAchievementCelebrationTracking("user-1");

  // Baseline: nothing completed yet.
  consumeNewlyCompleted([achievement({ id: "a1", completed: false })]);

  const firstCompletion = consumeNewlyCompleted([achievement({ id: "a1", completed: true, title: "Tempo de estudo" })]);
  assert.strictEqual(firstCompletion.length, 1);
  assert.strictEqual(firstCompletion[0].id, "a1");

  // Reloading the page (a fresh call with the same already-completed state)
  // must never celebrate it again.
  const secondCall = consumeNewlyCompleted([achievement({ id: "a1", completed: true })]);
  assert.deepStrictEqual(secondCall, []);
});

test("two achievements completing in the same load are both reported", async (t) => {
  const { initAchievementCelebrationTracking, consumeNewlyCompleted } = await loadService(t);
  initAchievementCelebrationTracking("user-1");

  consumeNewlyCompleted([achievement({ id: "a1" }), achievement({ id: "a2" })]);
  const result = consumeNewlyCompleted([
    achievement({ id: "a1", completed: true }),
    achievement({ id: "a2", completed: true }),
  ]);

  assert.deepStrictEqual(result.map((a) => a.id).sort(), ["a1", "a2"]);
});

test("tracking is scoped per user — one user's seen achievements never leak into another's", async (t) => {
  const { initAchievementCelebrationTracking, consumeNewlyCompleted } = await loadService(t);

  initAchievementCelebrationTracking("user-1");
  consumeNewlyCompleted([achievement({ id: "a1", completed: true })]); // backfilled for user-1

  initAchievementCelebrationTracking("user-2");
  const result = consumeNewlyCompleted([achievement({ id: "a1", completed: true })]);

  assert.deepStrictEqual(result, [], "user-2 also gets a silent backfill on its own first check, not a celebration");
  assert.strictEqual(localStorage.getItem("medagenda_achv_seen_user-2"), JSON.stringify(["a1"]));
});

test("resetAchievementCelebrationTracking() clears the active user, so calls afterwards are a safe no-op", async (t) => {
  const { initAchievementCelebrationTracking, resetAchievementCelebrationTracking, consumeNewlyCompleted } = await loadService(t);
  initAchievementCelebrationTracking("user-1");
  resetAchievementCelebrationTracking();

  const result = consumeNewlyCompleted([achievement({ id: "a1", completed: true })]);
  assert.deepStrictEqual(result, []);
});
