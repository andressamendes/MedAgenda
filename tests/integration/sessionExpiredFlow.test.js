/**
 * F4.2 — Auditoria e Correção do Fluxo de Estados (ETAPA 6: Simulação).
 *
 * Teste de ponta a ponta com errorService.js e stateView.js REAIS (não
 * mockados) — só as fontes de dados de insightsService.js são mockadas, no
 * nível mais baixo possível (reviewService/activityDashboardService/
 * eventService/activitySessionService). Reproduz a causa raiz relatada: um
 * erro real do Supabase (auth-js) chegando pela pilha inteira — Serviço →
 * errorService.categorize()/handleError() → stateView.errorToState() →
 * renderStateBlock() — sem nenhuma tela decidir mensagem/ação por conta
 * própria.
 *
 * IMPORTANTE: um único teste por arquivo aqui, de propósito. insightsService.js
 * (dependência transitiva de insightsView.js) é carregado uma única vez por
 * processo de teste (mesmo problema de cache de módulo ESM documentado em
 * F4.1 para stateView.js) — misturar múltiplos cenários que mockam suas
 * dependências de forma diferente no mesmo arquivo faria os testes seguintes
 * silenciosamente reaproveitarem os mocks do primeiro. A cobertura dos
 * demais blocos/estados já está nos testes de insightsView.test.js (com
 * errorService mockado) e em tests/services/errorService.test.js (unitário,
 * já prova a classificação real de cada formato de erro).
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

// Formato real de um erro de refresh token inválido (auth-js do Supabase) —
// é isto que supabase.currentUserId() agora deixa passar adiante sem
// mascarar (F4.2), em vez do texto genérico "Usuário não autenticado.".
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

test("Revisões: a real refresh-token-expired error from Supabase, hitting both listPending and listCompleted, renders the unified 'Sessão expirada' state with 'Entrar novamente' — not 'Erro ao comunicar com o servidor'", async (t) => {
  t.mock.module(DASHBOARD_SERVICE_SPECIFIER, {
    namedExports: { getDashboardData: async () => DASHBOARD_DATA },
  });
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      listPending:   async () => { throw refreshTokenExpiredError(); },
      listCompleted: async () => { throw refreshTokenExpiredError(); },
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

  const errorEl = document.getElementById("insights-revisoes-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.match(errorEl.textContent, /Sua sessão expirou\. Faça login novamente\./);
  assert.doesNotMatch(errorEl.textContent, /Erro ao comunicar com o servidor/);
  assert.strictEqual(errorEl.querySelector(".state-block-action").textContent, "Entrar novamente");

  // Os outros blocos continuam intactos — a falha de Revisões não derruba o
  // resto da tela (ETAPA 7).
  assert.strictEqual(document.getElementById("insights-execucao-cards").hidden, false);
});
