/**
 * Tests for activityDashboardView.js — Dashboard de Execução (F2.1).
 * activityDashboardService/activitySessionService are mocked: this exercises
 * only rendering and the auto-refresh subscription against the real DOM
 * (index.html), not the aggregation math itself (covered in
 * tests/activityDashboardService.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const DASHBOARD_SERVICE_SPECIFIER  = new URL("../../activityDashboardService.js", import.meta.url).href;
const ACHIEVEMENT_SERVICE_SPECIFIER = new URL("../../achievementService.js", import.meta.url).href;
const REVIEW_SERVICE_SPECIFIER     = new URL("../../reviewService.js", import.meta.url).href;
const PROFILE_SERVICE_SPECIFIER    = new URL("../../profileService.js", import.meta.url).href;
const DECISION_ENGINE_SPECIFIER    = new URL("../../decisionEngine.js", import.meta.url).href;
const ACCOUNT_VIEW_SPECIFIER       = new URL("../../accountView.js", import.meta.url).href;
const ERROR_SPECIFIER              = new URL("../../errorService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

const EMPTY_DATA = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

// Cards inteligentes (F3.5, consumindo o Decision Engine — F3.7):
// decisionEngine.js é mockado por inteiro aqui — a consolidação em si (multi-
// motor, deduplicação, prioridade) já é coberta isoladamente em
// tests/decisionEngine.test.js; estes testes só verificam que a view chama
// getDecisions() uma vez e renderiza exatamente o que ele devolve.
const EMPTY_DECISIONS = { decisions: [], planning: [], unavailable: [] };

// Auditoria UX #23 — achievementService.js mockado por inteiro (mesmo padrão
// de decisionEngine.js acima): a derivação de conquistas em si já é coberta
// isoladamente em tests/services/achievementService.test.js.
const EMPTY_ACHIEVEMENTS = { total: 5, completed: 0, inProgress: 5, overallProgress: 0 };

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

  t.mock.module(DASHBOARD_SERVICE_SPECIFIER, {
    namedExports: {
      getDashboardData: overrides.getDashboardData ?? (async () => EMPTY_DATA),
    },
  });

  let reviewChangedCallback = null;
  t.mock.module(REVIEW_SERVICE_SPECIFIER, {
    namedExports: {
      onReviewStatusChanged: (cb) => { reviewChangedCallback = cb; return () => {}; },
    },
  });

  let profileUpdatedCallback = null;
  t.mock.module(PROFILE_SERVICE_SPECIFIER, {
    namedExports: {
      onProfileUpdated: (cb) => { profileUpdatedCallback = cb; return () => {}; },
    },
  });

  t.mock.module(DECISION_ENGINE_SPECIFIER, {
    namedExports: { getDecisions: overrides.getDecisions ?? (async () => EMPTY_DECISIONS) },
  });

  t.mock.module(ACHIEVEMENT_SERVICE_SPECIFIER, {
    namedExports: { getAchievementSummary: overrides.getAchievementSummary ?? (async () => EMPTY_ACHIEVEMENTS) },
  });

  const openAccountCalls = [];
  t.mock.module(ACCOUNT_VIEW_SPECIFIER, {
    namedExports: { open: (opts) => { openAccountCalls.push(opts); } },
  });

  return import(`../../activityDashboardView.js?t=${Math.random()}`)
    .then(mod => ({
      mod, handleErrorCalls, openAccountCalls,
      triggerReviewStatusChanged: (review) => reviewChangedCallback?.(review),
      triggerProfileUpdated: (profile) => profileUpdatedCallback?.(profile),
    }));
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function decision({ origem = "recommendation", origemTipo = "empty_week", prioridade = "informativo", mensagem, assunto }) {
  return {
    origem, origemTipo, prioridade, mensagem,
    assunto: assunto ?? `${origem}:${origemTipo}`,
    confianca: "alta", dadosUtilizados: {}, acaoSugerida: null,
  };
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
  // Each test re-imports activityDashboardView.js with a cache-busting query
  // string (fresh module state), but sessionEventBus.js is a true singleton
  // shared across every import — without this, subscriptions from one
  // test's view instance would leak into the next test's publish() calls.
  clearEventBus();
});

test("with no sessions, all twelve cards render with empty/zero/no-goal values", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  assert.strictEqual(cards.hidden, false);
  assert.strictEqual(cards.children.length, 12);
  assert.match(cards.textContent, /Tempo estudado hoje/);
  assert.match(cards.textContent, /Sessões no mês/);
  assert.match(cards.textContent, /Maior sessão/);
  assert.match(cards.textContent, /—/); // sem sessão mais longa
  assert.strictEqual(document.getElementById("dash-error").hidden, true);
});

// ── Metas de Tempo (F2.2) — estados ─────────────────────────────────────────

test("with no goals configured, the three goal cards show 'Sem meta configurada'", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /Meta diária/);
  assert.match(text, /Meta semanal/);
  assert.match(text, /Meta mensal/);
  assert.strictEqual((text.match(/Sem meta configurada/g) || []).length, 3);
});

// ── Auditoria UX #24: "Configurar meta" — sem meta configurada, o card antes
// não tinha nenhum caminho até a configuração (Minha Conta → Metas de Tempo).

test("UX #24 — an unconfigured goal card shows a 'Configurar meta' link that opens Minha Conta on the goals section", async (t) => {
  const { mod, openAccountCalls } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  const links = cards.querySelectorAll('[data-action="configure-goal"]');
  assert.strictEqual(links.length, 3); // uma por meta (diária/semanal/mensal)

  links[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(openAccountCalls.length, 1);
  assert.deepStrictEqual(openAccountCalls[0], { focusSection: "goals" });
});

test("UX #24 — a configured goal card does NOT show the 'Configurar meta' link", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  assert.strictEqual(cards.querySelectorAll('[data-action="configure-goal"]').length, 2); // só semanal/mensal seguem sem meta
});

test("a partially reached goal shows the percentage and remaining-time message", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /50%/);
  assert.match(text, /Meta parcialmente atingida/);
});

test("a goal reached exactly shows 'Meta atingida'", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      weeklyGoal: { configured: true, goalMinutes: 600, actualMinutes: 600, percentage: 100, remainingMinutes: 0, state: "achieved" },
    }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /Meta atingida/);
});

test("a goal exceeded shows 'Meta ultrapassada'", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthlyGoal: { configured: true, goalMinutes: 2400, actualMinutes: 3000, percentage: 125, remainingMinutes: 0, state: "exceeded" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /125%/);
  assert.match(text, /Meta ultrapassada/);
});

test("today's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      todayMinutes: 90,
      todaySessionsCount: 2,
    }),
  });

  await mod.initActivityDashboardView();

  const cards = document.getElementById("dash-cards");
  assert.match(cards.textContent, /1h 30min/);
  assert.match(cards.textContent, /Sessões hoje/);
});

test("week's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      weekMinutes: 245,
      weekSessionsCount: 5,
    }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /4h 5min/);
});

test("month's indicator renders the formatted duration and count", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthMinutes: 1230,
      monthSessionsCount: 20,
    }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /20h 30min/);
});

test("average duration renders the average minutes formatted", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({ ...EMPTY_DATA, averageMinutes: 42 }),
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /42min/);
});

test("longest session renders its duration and date", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      longestSession: { id: "s1", duration_minutes: 150, started_at: "2026-07-05T08:00:00.000Z" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /2h 30min/);
  assert.match(text, /05\/07\/2026/);
});

test("a load error shows the friendly message with a retry button", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => { throw new Error("network down"); },
    friendlyMessage: "Sem conexão com a internet.",
  });

  await mod.initActivityDashboardView();

  const errorEl = document.getElementById("dash-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sem conexão com a internet\./);
  assert.ok(errorEl.querySelector(".list-error-retry"));
  assert.strictEqual(document.getElementById("dash-cards").hidden, true);
});

// ── F4.1 — Fluxo Unificado de Sessão Expirada ───────────────────────────────

test("a session-expired error (auth category) shows 'Sessão expirada' with an 'Entrar novamente' action, never a retry button", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => { throw new Error("JWT expired"); },
    category: "auth",
    friendlyMessage: "Sua sessão expirou. Faça login novamente.",
  });

  await mod.initActivityDashboardView();

  const errorEl = document.getElementById("dash-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.match(errorEl.textContent, /Sua sessão expirou\. Faça login novamente\./);
  const actionBtn = errorEl.querySelector(".state-block-action");
  assert.strictEqual(actionBtn.textContent, "Entrar novamente");
  assert.strictEqual(document.getElementById("dash-cards").hidden, true);
});

test("clicking 'Entrar novamente' on a session-expired dashboard error runs the official reauth flow, not a data retry", async (t) => {
  const stateViewSpecifier = new URL("../../stateView.js", import.meta.url).href;
  const { setReauthHandler } = await import(stateViewSpecifier);
  let reauthCalls = 0;
  setReauthHandler(() => { reauthCalls++; });

  let loadCalls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { loadCalls++; throw new Error("JWT expired"); },
    category: "auth",
  });

  await mod.initActivityDashboardView();
  const callsAfterLoad = loadCalls;

  document.getElementById("dash-error").querySelector(".state-block-action")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(reauthCalls, 1);
  assert.strictEqual(loadCalls, callsAfterLoad); // never re-fetched — reauth handles it
});

test("retrying after a load error clears the error state on success", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { ...EMPTY_DATA, todayMinutes: 30 };
    },
  });

  await mod.initActivityDashboardView();
  const retryBtn = document.querySelector(".list-error-retry");
  assert.ok(retryBtn);

  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(document.getElementById("dash-error").hidden, true);
  assert.strictEqual(document.getElementById("dash-cards").hidden, false);
});

// ── Sincronização com o barramento de eventos (F6.4) ────────────────────────
// O dashboard não conhece mais onSessionFinished()/activitySessionService:
// assina SESSION_EVENTS diretamente do barramento (F6.2), igual ao Histórico
// (F6.3). onSessionFinished() permanece só como adaptador legado para quem
// ainda não migrou — não é mais usado por esta view.

test("subscribes to the event bus on init: publishing SessionStarted triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => {
      calls += 1;
      return calls === 1 ? EMPTY_DATA : { ...EMPTY_DATA, todaySessionsCount: 1, todayMinutes: 25 };
    },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.STARTED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 2);
  assert.match(document.getElementById("dash-cards").textContent, /25min/);
});

test("publishing SessionFinished triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => {
      calls += 1;
      return calls === 1 ? EMPTY_DATA : { ...EMPTY_DATA, todaySessionsCount: 1, todayMinutes: 25 };
    },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);
  assert.doesNotMatch(document.getElementById("dash-cards").textContent, /25min/);

  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });
  await tick();

  assert.strictEqual(calls, 2);
  assert.match(document.getElementById("dash-cards").textContent, /25min/);
});

test("publishing SessionCancelled triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.CANCELLED, { id: "s1", status: "cancelled" });
  await tick();

  assert.strictEqual(calls, 2);
});

test("publishing SessionUpdated triggers a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.UPDATED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 2);
});

test("publishing SessionPaused/SessionResumed does NOT trigger a reload (no visible indicator depends on pause state)", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.PAUSED, { id: "s1", status: "paused" });
  publish(SESSION_EVENTS.RESUMED, { id: "s1", status: "running" });
  await tick();

  assert.strictEqual(calls, 1);
});

test("a burst of events in the same tick (Updated -> Finished, as happens when finishSession() runs) coalesces into a single reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.UPDATED, { id: "s1", status: "finished" });
  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });
  await tick();

  assert.strictEqual(calls, 2); // initial load + exactly one coalesced reload
});

test("multiple consecutive events across separate ticks each trigger their own reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.STARTED, { id: "s1" });
  await tick();
  assert.strictEqual(calls, 2);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();
  assert.strictEqual(calls, 3);
});

test("resetActivityDashboardView() unsubscribes from the event bus: further events no longer trigger a reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  mod.resetActivityDashboardView();

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();

  assert.strictEqual(calls, 1); // no reload after reset
});

test("resetActivityDashboardView() cancels an already-scheduled-but-not-fired reload", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  publish(SESSION_EVENTS.FINISHED, { id: "s1" }); // schedules a reload for the next tick
  mod.resetActivityDashboardView(); // must cancel the pending timer
  await tick();

  assert.strictEqual(calls, 1); // reload never happened
});

test("repeated initActivityDashboardView() calls don't double-subscribe (no double reload per event)", async (t) => {
  let calls = 0;
  const { mod } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 2); // one _load() per init call, no subscription-related extra

  publish(SESSION_EVENTS.FINISHED, { id: "s1" });
  await tick();

  assert.strictEqual(calls, 3); // exactly one reload, not one per subscription
});

test("resetActivityDashboardView() clears the rendered cards (no data survives logout)", async (t) => {
  const data = { ...EMPTY_DATA, todayMinutes: 90, todaySessionsCount: 2 };
  const { mod } = await loadView(t, { getDashboardData: async () => data });

  await mod.initActivityDashboardView();

  // Sanity: dados do usuário estão renderizados antes do logout.
  assert.match(document.getElementById("dash-cards").textContent, /1h 30min/);

  mod.resetActivityDashboardView();

  // Simetria A1.3: nenhum dado do usuário anterior pode sobreviver no DOM
  // após o logout — cards de execução e cards inteligentes voltam ao estado
  // de uma aplicação recém-aberta.
  assert.strictEqual(document.getElementById("dash-cards").innerHTML, "", "logout must leave no rendered data behind");
  assert.strictEqual(document.getElementById("dash-smart-tips").innerHTML, "");
});

// ── Cards inteligentes (F3.5, ETAPA 3/7; consumindo o Decision Engine — F3.7)
// A view só chama decisionEngine.getDecisions() uma vez e renderiza o que
// vier — nenhum cálculo, priorização ou deduplicação mora aqui (isso já é
// coberto isoladamente em tests/decisionEngine.test.js). Isolado do
// carregamento principal: nunca esconde os cards de execução.

test("a decision from the Decision Engine renders as a smart card", async (t) => {
  const { mod } = await loadView(t, {
    getDecisions: async () => ({
      decisions: [decision({ origemTipo: "empty_week", mensagem: "Sua semana está vazia." })],
      planning: [], unavailable: [],
    }),
  });

  await mod.initActivityDashboardView();
  await new Promise(resolve => setTimeout(resolve, 0));

  const tips = document.getElementById("dash-smart-tips");
  assert.strictEqual(tips.hidden, false);
  assert.match(tips.textContent, /Sua semana está vazia/);
});

test("a reflection-origin decision ('Você concluiu X% do planejamento') renders as a smart card", async (t) => {
  const { mod } = await loadView(t, {
    getDecisions: async () => ({
      decisions: [decision({ origem: "reflection", origemTipo: "plan_completion", prioridade: "importante", mensagem: "Você concluiu 82% do planejamento nos últimos 7 dias." })],
      planning: [], unavailable: [],
    }),
  });

  await mod.initActivityDashboardView();
  await new Promise(resolve => setTimeout(resolve, 0));

  const tips = document.getElementById("dash-smart-tips");
  assert.match(tips.textContent, /Você concluiu 82% do planejamento/);
});

test("an empty decision list never produces an invented card", async (t) => {
  const { mod } = await loadView(t); // getDecisions padrão devolve uma lista vazia

  await mod.initActivityDashboardView();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(document.getElementById("dash-smart-tips").hidden, true);
});

test("smart tips stay discreet: at most 3 cards even with several decisions", async (t) => {
  const { mod } = await loadView(t, {
    getDecisions: async () => ({
      decisions: [
        decision({ origemTipo: "overdue_events", prioridade: "urgente", mensagem: "Você tem 1 compromisso atrasado." }),
        decision({ origemTipo: "pending_reviews", prioridade: "urgente", mensagem: "Você possui 3 revisões pendentes." }),
        decision({ origemTipo: "heavy_week", prioridade: "importante", mensagem: "Sua semana está muito carregada." }),
        decision({ origemTipo: "goals_nearly_met", prioridade: "recomendado", mensagem: "Você está perto de bater sua meta." }),
        decision({ origem: "reflection", origemTipo: "plan_completion", prioridade: "importante", mensagem: "Você concluiu 82% do planejamento." }),
      ],
      planning: [], unavailable: [],
    }),
  });

  await mod.initActivityDashboardView();
  await new Promise(resolve => setTimeout(resolve, 0));

  const cards = document.getElementById("dash-smart-tips").querySelectorAll(".smart-card");
  assert.ok(cards.length <= 3);
});

test("smart tips never break the dashboard when the Decision Engine fails", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    getDecisions: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => mod.initActivityDashboardView());
  await new Promise(resolve => setTimeout(resolve, 0));

  // Cards de execução continuam de pé mesmo com a fonte de cards inteligentes fora do ar.
  assert.strictEqual(document.getElementById("dash-cards").hidden, false);
  assert.strictEqual(document.getElementById("dash-smart-tips").hidden, true);
  assert.ok(handleErrorCalls.some(c => c.context.context === "activityDashboardView.smartTips" && c.context.silent === true));
});

test("smart tips refresh automatically when a review is completed/skipped or a goal (profile) is updated", async (t) => {
  let decisionCalls = 0;
  const { mod, triggerReviewStatusChanged, triggerProfileUpdated } = await loadView(t, {
    getDecisions: async () => {
      decisionCalls += 1;
      return { decisions: [], planning: [], unavailable: [] };
    },
  });

  await mod.initActivityDashboardView();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(decisionCalls, 1);

  triggerReviewStatusChanged({ id: "r1", status: "completed" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(decisionCalls, 2);

  triggerProfileUpdated({ weekly_goal_minutes: 300 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(decisionCalls, 3);
});

// ── Auditoria UX #20: loading inconsistente — tela em branco durante a carga

test("UX #20 — shows a 'Carregando…' indicator while the dashboard data is being fetched, instead of staying blank", async (t) => {
  let resolveData;
  const dataPromise = new Promise(r => { resolveData = r; });
  const { mod } = await loadView(t, { getDashboardData: () => dataPromise });

  const pending = mod.initActivityDashboardView();
  await tick();

  const cards = document.getElementById("dash-cards");
  assert.strictEqual(cards.hidden, false, "a loading indicator is shown instead of a blank/hidden block");
  assert.match(cards.textContent, /Carregando/);

  resolveData(EMPTY_DATA);
  await pending;

  assert.strictEqual(cards.children.length, 12, "the real cards replace the loading indicator once data arrives");
});

// ── Auditoria UX #23: Conquistas construídas e invisíveis — expostas como um
// card no Dashboard consolidado, usando achievementService.getAchievementSummary()
// já pronto e testado (nenhuma agregação nova).

test("UX #23 — the 'Conquistas recentes' card renders the completed/total count and overall progress", async (t) => {
  const { mod } = await loadView(t, {
    getAchievementSummary: async () => ({ total: 5, completed: 2, inProgress: 3, overallProgress: 0.4 }),
  });

  await mod.initActivityDashboardView();

  const text = document.getElementById("dash-cards").textContent;
  assert.match(text, /Conquistas recentes/);
  assert.match(text, /2\/5/);
  assert.match(text, /2 conquista\(s\) concluída\(s\)/);
  assert.match(text, /40%/);
});

test("UX #23 — with no achievements completed yet, the card shows a neutral message instead of '0 conquista(s)'", async (t) => {
  const { mod } = await loadView(t, {
    getAchievementSummary: async () => EMPTY_ACHIEVEMENTS,
  });

  await mod.initActivityDashboardView();

  assert.match(document.getElementById("dash-cards").textContent, /Nenhuma conquista concluída ainda/);
});

test("UX #23 — a failure fetching achievements never breaks the other execution cards (falls back to '—')", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    getAchievementSummary: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => mod.initActivityDashboardView());

  const cards = document.getElementById("dash-cards");
  assert.strictEqual(cards.hidden, false);
  assert.strictEqual(cards.children.length, 12);
  assert.match(cards.textContent, /Tempo estudado hoje/); // demais cards seguem de pé
  assert.match(cards.textContent, /Não foi possível carregar este indicador\./);
  assert.ok(handleErrorCalls.some(c => c.context.context === "activityDashboardView.achievements" && c.context.silent === true));
});
