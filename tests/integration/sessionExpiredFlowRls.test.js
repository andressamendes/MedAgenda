/**
 * F4.2 — ETAPA 6 (Simulação), continuação de sessionExpiredFlow.test.js.
 * Mesma ideia (errorService.js e stateView.js reais), agora com um erro de
 * banco/RLS genuíno (sem __isAuthError, código 42501 — permission denied) —
 * prova que o novo sinal de auth (F4.2) não classifica indevidamente um erro
 * de permissão real como sessão expirada; continua caindo em "Erro ao
 * comunicar com o servidor", com "Tentar novamente".
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const DASHBOARD_SERVICE_SPECIFIER = new URL("../../activityDashboardService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER     = new URL("../../reviewService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER      = new URL("../../eventService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER    = new URL("../../activitySessionService.js", import.meta.url).href;
const PROFILE_SERVICE_SPECIFIER    = new URL("../../profileService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
const DASHBOARD_DATA = {
  todayMinutes: 30, weekMinutes: 90, monthMinutes: 300,
  todaySessionsCount: 1, weekSessionsCount: 3, monthSessionsCount: 10,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("Produtividade: a genuine RLS/permission error (no __isAuthError) renders the server-error state, distinct from session-expired", async (t) => {
  t.mock.module(DASHBOARD_SERVICE_SPECIFIER, {
    namedExports: { getDashboardData: async () => DASHBOARD_DATA },
  });
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      listPending: async () => [], listCompleted: async () => [],
      onReviewStatusChanged: () => () => {},
    },
  });
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: {
      getEvents: async () => { throw Object.assign(new Error("permission denied for table events"), { code: "42501" }); },
    },
  });
  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getEventExecutionSummaries: async () => ({}),
      onSessionFinished: () => () => {},
    },
  });
  t.mock.module(PROFILE_SERVICE_SPECIFIER, {
    namedExports: { onProfileUpdated: () => () => {} },
  });

  const { initInsightsView } = await import(`../../insightsView.js?t=${Math.random()}`);
  await initInsightsView();

  const errorEl = document.getElementById("insights-produtividade-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Erro ao comunicar com o servidor/);
  assert.doesNotMatch(errorEl.textContent, /Sessão expirada/);
  assert.strictEqual(errorEl.querySelector(".state-block-action").textContent, "Tentar novamente");
});
