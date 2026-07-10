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
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const INSIGHTS_SERVICE_SPECIFIER = new URL("../../insightsService.js", import.meta.url).href;
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

  let reviewStatusCb = null, profileUpdatedCb = null;
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: { onReviewStatusChanged: (cb) => { reviewStatusCb = cb; return () => { reviewStatusCb = null; }; } },
  });
  t.mock.module(PROFILE_SERVICE_SPECIFIER, {
    namedExports: { onProfileUpdated: (cb) => { profileUpdatedCb = cb; return () => { profileUpdatedCb = null; }; } },
  });

  return import(`../../insightsView.js?t=${Math.random()}`).then(mod => ({
    mod,
    handleErrorCalls,
    triggerReviewStatusChanged: (r) => reviewStatusCb?.(r),
    triggerProfileUpdated: (p) => profileUpdatedCb?.(p),
  }));
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => { installDom(); });
afterEach(() => {
  uninstallDom();
  // Each test re-imports insightsView.js with a cache-busting query string
  // (fresh module state), but sessionEventBus.js is a true singleton shared
  // across every import — without this, subscriptions from one test's view
  // instance would leak into the next test's publish() calls.
  clearEventBus();
});

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

// ── Sincronização com o barramento de eventos (F6.5) ────────────────────────
// A Central assina SessionFinished/Cancelled/Updated diretamente no
// barramento (F6.2) — não usa mais onSessionFinished()/activitySessionService.
// SessionStarted/Paused/Resumed não são assinados: nenhum indicador da
// Central (todos derivados de sessões *finalizadas*) muda com eles.

test("subscribes to the event bus on init: publishing SessionFinished triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });
  await tick();

  assert.strictEqual(calls, 2);
});

test("publishing SessionCancelled triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.CANCELLED, { id: "s1", status: "cancelled" });
  await tick();

  assert.strictEqual(calls, 2);
});

test("publishing SessionUpdated triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.UPDATED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 2);
});

test("publishing SessionStarted does NOT trigger a reload (no insights indicator depends on a session merely starting — all are based on finished sessions)", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.STARTED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 1);
});

test("publishing SessionPaused/SessionResumed does NOT trigger a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.PAUSED, { id: "s1", status: "paused" });
  publish(SESSION_EVENTS.RESUMED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 1);
});

test("a burst of events in the same tick (Updated -> Finished, as happens when finishSession() runs) coalesces into a single reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.UPDATED, { id: "s1", status: "finished" });
  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });
  publish(SESSION_EVENTS.UPDATED, { id: "s1", status: "finished" });
  await tick();

  assert.strictEqual(calls, 2); // initial load + exactly one coalesced reload
});

test("multiple consecutive events across separate ticks each trigger their own reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();
  assert.strictEqual(calls, 2);

  publish(SESSION_EVENTS.CANCELLED, { id: "s2" });
  await tick();
  assert.strictEqual(calls, 3);
});

test("resetInsightsView() unsubscribes from the event bus: further events no longer trigger a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  mod.resetInsightsView();

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();

  assert.strictEqual(calls, 1); // no reload after reset
});

test("resetInsightsView() cancels an already-scheduled-but-not-fired reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" }); // schedules a reload for the next tick
  mod.resetInsightsView(); // must cancel the pending timer
  await tick();

  assert.strictEqual(calls, 1); // reload never happened
});

test("resetInsightsView() also unsubscribes onReviewStatusChanged/onProfileUpdated", async (t) => {
  let calls = 0;
  const { mod, triggerReviewStatusChanged, triggerProfileUpdated } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  assert.strictEqual(calls, 1);

  mod.resetInsightsView();

  triggerReviewStatusChanged({ id: "r1", status: "completed" });
  triggerProfileUpdated({ daily_goal_minutes: 60 });
  await tick();

  assert.strictEqual(calls, 1); // no reload after reset
});

test("resetInsightsView() clears the rendered cards of all four blocks (no data survives logout)", async (t) => {
  const { mod } = await loadView(t, { getInsightsData: async () => EMPTY_INSIGHTS });

  await mod.initInsightsView();

  // Sanity: dados do usuário estão renderizados antes do logout.
  assert.notStrictEqual(document.getElementById("insights-execucao-cards").innerHTML, "");
  assert.notStrictEqual(document.getElementById("insights-revisoes-cards").innerHTML, "");

  mod.resetInsightsView();

  // Simetria A1.3: nenhum dado do usuário anterior pode sobreviver no DOM
  // após o logout, em nenhum dos quatro blocos.
  for (const cardsId of ["insights-execucao-cards", "insights-metas-cards", "insights-revisoes-cards", "insights-produtividade-cards"]) {
    assert.strictEqual(document.getElementById(cardsId).innerHTML, "", `${cardsId} must be empty after logout`);
  }
});

test("repeated initInsightsView() calls don't double-subscribe (no double reload per event)", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => { calls++; return EMPTY_INSIGHTS; },
  });

  await mod.initInsightsView();
  await mod.initInsightsView();
  assert.strictEqual(calls, 2); // one _load() per init call, no subscription-related extra

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();

  assert.strictEqual(calls, 3); // exactly one reload, not one per subscription

  // Preservação dos estados parciais/erro (ETAPA 7): mesmo após o reload
  // automático, cada bloco continua isolado — nenhuma regressão introduzida
  // pela migração para o barramento.
});

test("after an automatic reload triggered by the event bus, a block error state still isolates from the others (no regression from the migration)", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => {
      attempt += 1;
      if (attempt === 1) return EMPTY_INSIGHTS;
      return { execucao: { status: "error", data: null, error: new Error("boom") }, metas: OK_METAS, revisoes: OK_REVISOES, produtividade: OK_PRODUTIVIDADE };
    },
  });

  await mod.initInsightsView();
  assert.strictEqual(document.getElementById("insights-execucao-error").hidden, true);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();

  assert.strictEqual(document.getElementById("insights-execucao-error").hidden, false);
  assert.strictEqual(document.getElementById("insights-metas-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-produtividade-cards").hidden, false);
});

test("after an automatic reload triggered by the event bus, a block partial state (with notice) is preserved", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getInsightsData: async () => {
      attempt += 1;
      if (attempt === 1) return EMPTY_INSIGHTS;
      return {
        execucao: OK_EXECUCAO,
        metas: OK_METAS,
        revisoes: { status: "partial", data: { pendingCount: 2, completedCount: null }, error: new Error("permission denied") },
        produtividade: OK_PRODUTIVIDADE,
      };
    },
    friendlyMessage: "Você não tem permissão para acessar este recurso.",
  });

  await mod.initInsightsView();
  assert.strictEqual(document.getElementById("insights-revisoes-notice").hidden, true);

  publish(SESSION_EVENTS.UPDATED, { id: "s1" });
  await tick();

  assert.strictEqual(document.getElementById("insights-revisoes-cards").hidden, false);
  assert.strictEqual(document.getElementById("insights-revisoes-notice").hidden, false);
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
