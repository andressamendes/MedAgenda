/**
 * Tests for insightsView.js — Central de Insights: Infraestrutura (F2.4).
 * insightsService/activitySessionService/reviewService/profileService are
 * mocked: this exercises only rendering, per-block error isolation, and the
 * auto-refresh subscriptions against the real DOM (index.html) — not the
 * consolidation itself (covered in tests/insightsService.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const INSIGHTS_SERVICE_SPECIFIER = new URL("../../insightsService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER  = new URL("../../activitySessionService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER   = new URL("../../reviewService.js", import.meta.url).href;
const PROFILE_SERVICE_SPECIFIER  = new URL("../../profileService.js", import.meta.url).href;
const ERROR_SPECIFIER            = new URL("../../errorService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

const OK_EXECUCAO = {
  status: "ok",
  data: {
    todayMinutes: 30, weekMinutes: 90, monthMinutes: 300,
    todaySessionsCount: 1, weekSessionsCount: 3, monthSessionsCount: 10,
  },
  error: null,
};
const OK_METAS = {
  status: "ok",
  data: { dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL },
  error: null,
};
const OK_REVISOES = { status: "ok", data: { pendingCount: 2, completedCount: 5 }, error: null };
const OK_PRODUTIVIDADE = { status: "ok", data: { totalEvents: 4, executedCount: 3, neverExecutedCount: 1 }, error: null };

const EMPTY_INSIGHTS = { execucao: OK_EXECUCAO, metas: OK_METAS, revisoes: OK_REVISOES, produtividade: OK_PRODUTIVIDADE };

function loadView(t, overrides = {}) {
  const handleErrorCalls = [];
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: {
      handleError: (err, context) => {
        handleErrorCalls.push({ err, context });
        return { category: overrides.category ?? "unknown", friendly: overrides.friendlyMessage ?? err.message };
      },
    },
  });

  t.mock.module(INSIGHTS_SERVICE_SPECIFIER, {
    namedExports: {
      getInsightsData: overrides.getInsightsData ?? (async () => EMPTY_INSIGHTS),
    },
  });

  let sessionFinishedCb = null, reviewStatusCb = null, profileUpdatedCb = null;
  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: { onSessionFinished: (cb) => { sessionFinishedCb = cb; return () => {}; } },
  });
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: { onReviewStatusChanged: (cb) => { reviewStatusCb = cb; return () => {}; } },
  });
  t.mock.module(PROFILE_SERVICE_SPECIFIER, {
    namedExports: { onProfileUpdated: (cb) => { profileUpdatedCb = cb; return () => {}; } },
  });

  return import(`../../insightsView.js?t=${Math.random()}`).then(mod => ({
    mod,
    handleErrorCalls,
    triggerSessionFinished: (s) => sessionFinishedCb?.(s),
    triggerReviewStatusChanged: (r) => reviewStatusCb?.(r),
    triggerProfileUpdated: (p) => profileUpdatedCb?.(p),
  }));
}

beforeEach(() => { installDom(); });
afterEach(() => { uninstallDom(); });

test("renders all four blocks with their cards when every source succeeds", async (t) => {
  const { mod } = await loadView(t);
  await mod.initInsightsView();

  assert.strictEqual(document.getElementById("insights-execucao-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-metas-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-produtividade-cards").hidden, false);

  assert.strictEqual(document.getElementById("insights-execucao-cards").children.length, 6);
  assert.strictEqual(document.getElementById("insights-metas-cards").children.length, 3);
  assert.strictEqual(document.getElementById("insights-revisoes-cards").children.length, 2);
  assert.strictEqual(document.getElementById("insights-produtividade-cards").children.length, 2);

  assert.match(document.getElementById("insights-revisoes-cards").textContent, /Revisões pendentes/);
  assert.match(document.getElementById("insights-revisoes-cards").textContent, /2/);
  assert.match(document.getElementById("insights-produtividade-cards").textContent, /Compromissos executados/);
});

test("with no data at all, blocks render their zero/empty values instead of breaking", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: { status: "ok", data: { todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0 }, error: null },
      metas: OK_METAS,
      revisoes: { status: "ok", data: { pendingCount: 0, completedCount: 0 }, error: null },
      produtividade: { status: "ok", data: { totalEvents: 0, executedCount: 0, neverExecutedCount: 0 }, error: null },
    }),
  });

  await mod.initInsightsView();

  assert.match(document.getElementById("insights-execucao-cards").textContent, /0min/);
  assert.match(document.getElementById("insights-revisoes-cards").textContent, /Revisões pendentes/);
  assert.strictEqual(document.getElementById("insights-produtividade-cards").hidden, false);
});

test("a block in 'error' state hides its cards and shows the friendly message with retry", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: { status: "error", data: null, error: new Error("network down") },
      metas: OK_METAS,
      revisoes: OK_REVISOES,
      produtividade: OK_PRODUTIVIDADE,
    }),
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initInsightsView();

  const errorEl = document.getElementById("insights-execucao-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sem conexão com a internet\./);
  assert.ok(errorEl.querySelector(".list-error-retry"));
  assert.strictEqual(document.getElementById("insights-execucao-cards").hidden, true);

  // Other blocks are unaffected — the screen never breaks entirely.
  assert.strictEqual(document.getElementById("insights-metas-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-produtividade-cards").hidden, false);
});

// ── F4.1 — Fluxo Unificado de Sessão Expirada ───────────────────────────────

test("a block failing with a session-expired (auth) error shows 'Sessão expirada' and 'Entrar novamente', never a retry button", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: { status: "error", data: null, error: new Error("JWT expired") },
      metas: OK_METAS,
      revisoes: OK_REVISOES,
      produtividade: OK_PRODUTIVIDADE,
    }),
    category: "auth",
    friendlyMessage: "Sua sessão expirou. Faça login novamente.",
  });

  await mod.initInsightsView();

  const errorEl = document.getElementById("insights-execucao-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.match(errorEl.textContent, /Sua sessão expirou\. Faça login novamente\./);
  const actionBtn = errorEl.querySelector(".state-block-action");
  assert.strictEqual(actionBtn.textContent, "Entrar novamente");

  // Every other block keeps using the exact same component — no divergent
  // messages for the same kind of failure (ETAPA 6).
  assert.strictEqual(document.getElementById("insights-metas-cards").hidden, false);
});

test("clicking 'Entrar novamente' on a session-expired insights block runs the official reauth flow, not a data retry", async (t) => {
  const stateViewSpecifier = new URL("../../stateView.js", import.meta.url).href;
  const { setReauthHandler } = await import(stateViewSpecifier);
  let reauthCalls = 0;
  setReauthHandler(() => { reauthCalls++; });

  let loadCalls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => {
      loadCalls++;
      return {
        execucao: { status: "error", data: null, error: new Error("JWT expired") },
        metas: OK_METAS, revisoes: OK_REVISOES, produtividade: OK_PRODUTIVIDADE,
      };
    },
    category: "auth",
  });

  await mod.initInsightsView();
  const callsAfterLoad = loadCalls;

  document.getElementById("insights-execucao-error").querySelector(".state-block-action")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(reauthCalls, 1);
  assert.strictEqual(loadCalls, callsAfterLoad);
});

test("a block in 'partial' state still renders its cards, plus a partial-data notice", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: OK_EXECUCAO,
      metas: OK_METAS,
      revisoes: { status: "partial", data: { pendingCount: 2, completedCount: null }, error: new Error("permission denied") },
      produtividade: OK_PRODUTIVIDADE,
    }),
    friendlyMessage: "Você não tem permissão para acessar este recurso.",
  });

  await mod.initInsightsView();

  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.match(document.getElementById("insights-revisoes-cards").textContent, /—/);

  const notice = document.getElementById("insights-revisoes-notice");
  assert.strictEqual(notice.hidden, false);
  assert.match(notice.textContent, /Você não tem permissão para acessar este recurso\./);
});

// ── F4.2 — sessão expirada nunca pode ser mascarada como "dados parciais" ───
// (causa raiz do bloco de Revisões: ele combina duas fontes — pendentes e
// concluídas — e, se só uma falhar, virava um aviso passivo sem nenhuma ação,
// mesmo quando a causa era a sessão ter caído).

test("Revisões: when only one of its two sources fails with a session-expired error, the whole block escalates to the unified session-expired state — not a silent partial notice", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: OK_EXECUCAO,
      metas: OK_METAS,
      revisoes: { status: "partial", data: { pendingCount: null, completedCount: 5 }, error: new Error("Invalid Refresh Token: Refresh Token Not Found") },
      produtividade: OK_PRODUTIVIDADE,
    }),
    category: "auth",
    friendlyMessage: "Sua sessão expirou. Faça login novamente.",
  });

  await mod.initInsightsView();

  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, true);
  assert.strictEqual(document.getElementById("insights-revisoes-notice").hidden, true);

  const errorEl = document.getElementById("insights-revisoes-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  const actionBtn = errorEl.querySelector(".state-block-action");
  assert.strictEqual(actionBtn.textContent, "Entrar novamente");

  // Os outros blocos continuam intactos — a falha de uma fonte de Revisões
  // não derruba o resto da tela.
  assert.strictEqual(document.getElementById("insights-execucao-cards").hidden, false);
});

test("a 'partial' block whose failing source is NOT a session issue (e.g. real RLS/permission error) keeps the passive notice, unchanged", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => ({
      execucao: OK_EXECUCAO,
      metas: OK_METAS,
      revisoes: { status: "partial", data: { pendingCount: 2, completedCount: null }, error: new Error("permission denied for table reviews") },
      produtividade: OK_PRODUTIVIDADE,
    }),
    category: "database",
    friendlyMessage: "Erro ao comunicar com o servidor. Tente novamente em instantes.",
  });

  await mod.initInsightsView();

  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-revisoes-error").hidden, true);
  assert.strictEqual(document.getElementById("insights-revisoes-notice").hidden, false);
});

test("retrying after a block error clears the error state on success", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => {
      attempt += 1;
      if (attempt === 1) {
        return { execucao: { status: "error", data: null, error: new Error("boom") }, metas: OK_METAS, revisoes: OK_REVISOES, produtividade: OK_PRODUTIVIDADE };
      }
      return EMPTY_INSIGHTS;
    },
  });

  await mod.initInsightsView();
  const retryBtn = document.querySelector("#insights-execucao-error .list-error-retry");
  assert.ok(retryBtn);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(document.getElementById("insights-execucao-error").hidden, true);
  assert.strictEqual(document.getElementById("insights-execucao-cards").hidden, false);
});

// ── ETAPA 5 — atualização automática ─────────────────────────────────────────

test("reloads automatically when a session finishes", async (t) => {
  let calls = 0;
  const { mod, triggerSessionFinished } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  triggerSessionFinished({ id: "s1", status: "finished" });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls, 2);
});

test("reloads automatically when a review is completed or skipped", async (t) => {
  let calls = 0;
  const { mod, triggerReviewStatusChanged } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  triggerReviewStatusChanged({ id: "r1", status: "completed" });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls, 2);
});

test("reloads automatically when the profile (goals) is updated", async (t) => {
  let calls = 0;
  const { mod, triggerProfileUpdated } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  triggerProfileUpdated({ daily_goal_minutes: 60 });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls, 2);
});

test("a catastrophic failure of getInsightsData itself still renders every block as an error, not a blank screen", async (t) => {
  const { mod } = await loadView(t, {
    getInsightsData: async () => { throw new Error("unexpected"); },
  });

  await mod.initInsightsView();

  for (const id of ["insights-execucao-error", "insights-metas-error", "insights-revisoes-error", "insights-produtividade-error"]) {
    assert.strictEqual(document.getElementById(id).hidden, false);
  }
});
