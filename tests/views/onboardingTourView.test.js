/**
 * F10 #5.4 — tour de boas-vindas leve e opcional: um cartão dispensável no
 * topo da Agenda (nunca um modal), mostrado uma única vez para quem nunca
 * teve nenhuma sessão de estudo.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const ACTIVITY_SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const NAVIGATION_VIEW_SPECIFIER = new URL("../../navigationView.js", import.meta.url).href;
const ERROR_SERVICE_SPECIFIER = new URL("../../errorService.js", import.meta.url).href;

const TOUR_SEEN_KEY = "medagenda_tour_seen";

let showPageCalls;
let handleErrorCalls;

function mockDeps(t, { hasAnySession = async () => false, throwOnCheck = false } = {}) {
  showPageCalls = [];
  handleErrorCalls = [];
  t.mock.module(ACTIVITY_SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      hasAnySession: throwOnCheck
        ? async () => { throw new Error("network down"); }
        : hasAnySession,
    },
  });
  t.mock.module(NAVIGATION_VIEW_SPECIFIER, {
    namedExports: { showPage: (page) => showPageCalls.push(page) },
  });
  t.mock.module(ERROR_SERVICE_SPECIFIER, {
    namedExports: { handleError: (err, ctx) => { handleErrorCalls.push({ err, ctx }); return { friendly: "erro" }; } },
  });
}

function loadOnboardingTourView(t, opts) {
  mockDeps(t, opts);
  return import(`../../onboardingTourView.js?t=${Math.random()}`);
}

beforeEach(() => {
  installDom();
  try { localStorage.removeItem(TOUR_SEEN_KEY); } catch { /* noop */ }
});

afterEach(() => {
  uninstallDom();
});

test("a brand-new user (no sessions ever) sees the dismissible tour card, never a modal", async (t) => {
  const { initOnboardingTour } = await loadOnboardingTourView(t, { hasAnySession: async () => false });

  await initOnboardingTour();

  const card = document.getElementById("onboarding-tour-card");
  assert.strictEqual(card.hidden, false);
  assert.ok(!card.classList.contains("modal-overlay"), "the tour renders inline, never as a modal overlay");
  assert.strictEqual(card.querySelectorAll(".onboarding-tour-step").length, 4, "3-4 short steps, per the roadmap item");
});

test("a user who already has at least one session never sees the tour", async (t) => {
  const { initOnboardingTour } = await loadOnboardingTourView(t, { hasAnySession: async () => true });

  await initOnboardingTour();

  const card = document.getElementById("onboarding-tour-card");
  assert.strictEqual(card.hidden, true);
});

test("an already-active user (per hasAnySession) is marked as seen, so the check never runs again on the next init", async (t) => {
  let checkCalls = 0;
  const { initOnboardingTour } = await loadOnboardingTourView(t, {
    hasAnySession: async () => { checkCalls++; return true; },
  });

  await initOnboardingTour();
  await initOnboardingTour();

  assert.strictEqual(checkCalls, 1, "hasAnySession() short-circuits after the first check via the localStorage flag");
  assert.strictEqual(localStorage.getItem(TOUR_SEEN_KEY), "1");
});

test("clicking 'Entendi, vamos começar' dismisses the card and it never reappears", async (t) => {
  const { initOnboardingTour } = await loadOnboardingTourView(t, { hasAnySession: async () => false });
  await initOnboardingTour();

  document.getElementById("onboarding-tour-dismiss").click();

  const card = document.getElementById("onboarding-tour-card");
  assert.strictEqual(card.hidden, true);
  assert.strictEqual(localStorage.getItem(TOUR_SEEN_KEY), "1");

  // A fresh init (e.g. next page load) must not show it again.
  await initOnboardingTour();
  assert.strictEqual(card.hidden, true);
});

test("clicking a step navigates to that page via showPage(), without dismissing the card", async (t) => {
  const { initOnboardingTour } = await loadOnboardingTourView(t, { hasAnySession: async () => false });
  await initOnboardingTour();

  const steps = document.querySelectorAll(".onboarding-tour-step");
  steps[1].click(); // "Sessão" step

  assert.deepStrictEqual(showPageCalls, ["study-session"]);
  assert.strictEqual(document.getElementById("onboarding-tour-card").hidden, false, "clicking a step is not the same as dismissing");
});

test("a failure checking hasAnySession() never shows the tour by mistake", async (t) => {
  const { initOnboardingTour } = await loadOnboardingTourView(t, { throwOnCheck: true });

  await initOnboardingTour();

  const card = document.getElementById("onboarding-tour-card");
  assert.strictEqual(card.hidden, true);
  assert.strictEqual(handleErrorCalls.length, 1);
  assert.strictEqual(localStorage.getItem(TOUR_SEEN_KEY), null, "a transient failure does not permanently suppress the tour either");
});

test("a user who already dismissed the tour in a previous visit never triggers hasAnySession() again", async (t) => {
  try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* noop */ }
  let checkCalls = 0;
  const { initOnboardingTour } = await loadOnboardingTourView(t, {
    hasAnySession: async () => { checkCalls++; return false; },
  });

  await initOnboardingTour();

  assert.strictEqual(checkCalls, 0);
  assert.strictEqual(document.getElementById("onboarding-tour-card").hidden, true);
});

test("resetOnboardingTourView() hides and clears the card (logout/user switch — no state survives)", async (t) => {
  const { initOnboardingTour, resetOnboardingTourView } = await loadOnboardingTourView(t, { hasAnySession: async () => false });
  await initOnboardingTour();
  assert.strictEqual(document.getElementById("onboarding-tour-card").hidden, false);

  resetOnboardingTourView();

  const card = document.getElementById("onboarding-tour-card");
  assert.strictEqual(card.hidden, true);
  assert.strictEqual(card.innerHTML, "");
});
