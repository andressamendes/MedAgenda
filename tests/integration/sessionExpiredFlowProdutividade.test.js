/**
 * F4.2 — ETAPA 6 (Simulação), continuação de sessionExpiredFlow.test.js.
 * Mesma ideia (errorService.js e stateView.js reais), agora para o bloco de
 * Produtividade — prova que o mesmo erro real do Supabase produz exatamente o
 * mesmo estado unificado em qualquer bloco, não só em Revisões. Em arquivo
 * próprio pelo mesmo motivo documentado lá: insightsService.js é carregado
 * uma única vez por processo de teste.
 *
 * (Este cenário cobria originalmente o bloco de Execução; após a
 * consolidação da Central de Insights no Dashboard — auditoria UX #01 —
 * Execução/Metas deixaram de ser renderizados por insightsView.js, então o
 * mesmo contrato passa a ser provado no bloco de Produtividade, cuja fonte é
 * eventService.getEvents().)
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

function refreshTokenExpiredError() {
  return Object.assign(new Error("Invalid Refresh Token: Refresh Token Not Found"), {
    name: "AuthApiError",
    __isAuthError: true,
    status: 400,
    code: "refresh_token_not_found",
  });
}

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("Produtividade: the same real refresh-token error renders the exact same unified session-expired state as Revisões — no page-specific message", async (t) => {
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
    namedExports: { getEvents: async () => { throw refreshTokenExpiredError(); } },
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
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.strictEqual(errorEl.querySelector(".state-block-action").textContent, "Entrar novamente");

  // Revisões usa fontes próprias (reviewService, mockado com sucesso aqui) —
  // continua intacto, com o mesmo isolamento por bloco de antes.
  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
});
