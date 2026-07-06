/**
 * F4.2 — ETAPA 6 (Simulação), continuação de sessionExpiredFlow.test.js.
 * Mesma ideia (errorService.js e stateView.js reais), agora para o bloco de
 * Execução — prova que o mesmo erro real do Supabase produz exatamente o
 * mesmo estado unificado em qualquer bloco, não só em Revisões. Em arquivo
 * próprio pelo mesmo motivo documentado lá: insightsService.js é carregado
 * uma única vez por processo de teste.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const DASHBOARD_SERVICE_SPECIFIER = new URL("../../activityDashboardService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER     = new URL("../../reviewService.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER      = new URL("../../eventService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER    = new URL("../../activitySessionService.js", import.meta.url).href;
const PROFILE_SERVICE_SPECIFIER    = new URL("../../profileService.js", import.meta.url).href;

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

test("Execução: the same real refresh-token error renders the exact same unified session-expired state as Revisões — no page-specific message", async (t) => {
  t.mock.module(DASHBOARD_SERVICE_SPECIFIER, {
    namedExports: { getDashboardData: async () => { throw refreshTokenExpiredError(); } },
  });
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      listPending: async () => [], listCompleted: async () => [],
      onReviewStatusChanged: () => () => {},
    },
  });
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { getEvents: async () => [] },
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

  const errorEl = document.getElementById("insights-execucao-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.strictEqual(errorEl.querySelector(".state-block-action").textContent, "Entrar novamente");

  // Metas deriva do mesmo dashboardResult (mesma chamada) — falha junto,
  // com o mesmo estado unificado, nunca uma mensagem própria.
  const metasErrorEl = document.getElementById("insights-metas-error");
  assert.strictEqual(metasErrorEl.hidden, false);
  assert.match(metasErrorEl.textContent, /Sessão expirada/);
});
