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
const PROFILE_SERVICE_SPECIFIER    = new URL("../../profileService.js", import.meta.url).href;
const ACCOUNT_VIEW_SPECIFIER       = new URL("../../accountView.js", import.meta.url).href;
const ERROR_SPECIFIER              = new URL("../../errorService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

const EMPTY_DATA = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

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

  let profileUpdatedCallback = null;
  t.mock.module(PROFILE_SERVICE_SPECIFIER, {
    namedExports: {
      onProfileUpdated: (cb) => { profileUpdatedCallback = cb; return () => {}; },
    },
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
      triggerProfileUpdated: (profile) => profileUpdatedCallback?.(profile),
    }));
}

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// F10 #3.1 / F13.4 — o Dashboard passou de um único container (#dash-cards)
// para três níveis (#dash-cards-today, na página Dashboard; #dash-cards-
// weekmonth e #dash-cards-records, na página Progresso — ver #page-progress
// em index.html). Os testes abaixo, em sua maioria, não precisam saber em
// qual nível/página um card específico caiu — só que os 12 cards de sempre
// continuam todos lá, com os mesmos dados. Estes helpers tratam os três
// containers como um só para esse propósito.
const CARD_GROUP_IDS = ["dash-cards-today", "dash-cards-weekmonth", "dash-cards-records"];

function cardGroupEls() {
  return CARD_GROUP_IDS.map(id => document.getElementById(id));
}

function allCardsText() {
  return cardGroupEls().map(el => el.textContent).join(" ");
}

function allCardsHtml() {
  return cardGroupEls().map(el => el.innerHTML).join("");
}

function totalCardsCount() {
  return cardGroupEls().reduce((sum, el) => sum + el.children.length, 0);
}

function allConfigureLinks() {
  return cardGroupEls().flatMap(el => Array.from(el.querySelectorAll('[data-action="configure-goal"]')));
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

  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false));
  assert.strictEqual(totalCardsCount(), 12);
  const text = allCardsText();
  assert.match(text, /Tempo estudado hoje/);
  assert.match(text, /Sessões no mês/);
  assert.match(text, /Maior sessão/);
  assert.match(text, /—/); // sem sessão mais longa
  assert.strictEqual(document.getElementById("dash-error").hidden, true);
});

// ── Metas de Tempo (F2.2) — estados ─────────────────────────────────────────

test("with no goals configured, the three goal cards show 'Sem meta configurada'", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const text = allCardsText();
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

  const links = allConfigureLinks();
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

  assert.strictEqual(allConfigureLinks().length, 2); // só semanal/mensal seguem sem meta
});

test("a partially reached goal shows the percentage and remaining-time message", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = allCardsText();
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

  assert.match(allCardsText(), /Meta atingida/);
});

test("a goal exceeded shows 'Meta ultrapassada'", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthlyGoal: { configured: true, goalMinutes: 2400, actualMinutes: 3000, percentage: 125, remainingMinutes: 0, state: "exceeded" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = allCardsText();
  assert.match(text, /125%/);
  assert.match(text, /Meta ultrapassada/);
});

// F11 E11 — barra de progresso visual, complementando (nunca substituindo) o
// percentual já escrito em texto/aria-valuenow.
test("F11 E11 — a configured goal renders a progress bar reflecting its percentage", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const bar = document.querySelector("#dash-cards-today .dashboard-progress-bar");
  assert.ok(bar, "a barra de progresso deve existir para uma meta configurada");
  assert.strictEqual(bar.style.width, "50%");
  const wrap = document.querySelector("#dash-cards-today .dashboard-progress");
  assert.strictEqual(wrap.getAttribute("aria-valuenow"), "50");
});

test("F11 E11 — an unconfigured goal renders no progress bar", async (t) => {
  const { mod } = await loadView(t);
  await mod.initActivityDashboardView();

  assert.strictEqual(document.querySelector("#dash-cards-today .dashboard-progress"), null);
});

test("F11 E11 — an exceeded goal's progress bar is capped at 100% width even though the percentage text exceeds it", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthlyGoal: { configured: true, goalMinutes: 2400, actualMinutes: 3000, percentage: 125, remainingMinutes: 0, state: "exceeded" },
    }),
  });

  await mod.initActivityDashboardView();

  const bar = document.querySelector("#dash-cards-weekmonth .dashboard-progress-bar--exceeded");
  assert.ok(bar, "a barra deve marcar visualmente o estado 'exceeded'");
  assert.strictEqual(bar.style.width, "100%");
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

  const text = allCardsText();
  assert.match(text, /1h 30min/);
  assert.match(text, /Sessões hoje/);
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

  assert.match(allCardsText(), /4h 5min/);
});

// F11 E11 — minigráfico semanal (SVG puro, sem lib externa) no card "Tempo
// estudado esta semana", a partir de computeWeekSparkline() já pronto no
// mesmo objeto retornado por getDashboardData().
test("F11 E11 — the week card renders a sparkline bar per day when weekSparkline has data", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      weekSparkline: [
        { date: new Date("2026-07-06"), minutes: 30 },
        { date: new Date("2026-07-07"), minutes: 0 },
        { date: new Date("2026-07-08"), minutes: 60 },
      ],
    }),
  });

  await mod.initActivityDashboardView();

  const svg = document.querySelector("#dash-cards-weekmonth .dashboard-sparkline");
  assert.ok(svg, "o minigráfico deve ser renderizado quando há dados");
  assert.strictEqual(svg.querySelectorAll("rect").length, 3);
});

test("F11 E11 — no weekSparkline data renders no sparkline element (never a broken/empty SVG)", async (t) => {
  const { mod } = await loadView(t); // EMPTY_DATA não define weekSparkline
  await mod.initActivityDashboardView();

  assert.strictEqual(document.querySelector("#dash-cards-weekmonth .dashboard-sparkline"), null);
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

  assert.match(allCardsText(), /20h 30min/);
});

test("average duration renders the average minutes formatted", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({ ...EMPTY_DATA, averageMinutes: 42 }),
  });

  await mod.initActivityDashboardView();

  assert.match(allCardsText(), /42min/);
});

test("longest session renders its duration and date", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      longestSession: { id: "s1", duration_minutes: 150, started_at: "2026-07-05T08:00:00.000Z" },
    }),
  });

  await mod.initActivityDashboardView();

  const text = allCardsText();
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
  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, true));
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
  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, true));
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
  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false));
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
  assert.match(allCardsText(), /25min/);
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
  assert.doesNotMatch(allCardsText(), /25min/);

  publish(SESSION_EVENTS.FINISHED, { id: "s1", status: "finished" });
  await tick();

  assert.strictEqual(calls, 2);
  assert.match(allCardsText(), /25min/);
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
  assert.match(allCardsText(), /1h 30min/);

  mod.resetActivityDashboardView();

  // Simetria A1.3: nenhum dado do usuário anterior pode sobreviver no DOM
  // após o logout — cards de execução voltam ao estado de uma aplicação
  // recém-aberta.
  assert.strictEqual(allCardsHtml(), "", "logout must leave no rendered data behind");
});

test("subscribes to onProfileUpdated on init: a profile (goal) update triggers a reload", async (t) => {
  let calls = 0;
  const { mod, triggerProfileUpdated } = await loadView(t, {
    getDashboardData: async () => { calls += 1; return EMPTY_DATA; },
  });

  await mod.initActivityDashboardView();
  assert.strictEqual(calls, 1);

  triggerProfileUpdated({ weekly_goal_minutes: 300 });
  await tick();

  assert.strictEqual(calls, 2);
});

// ── Auditoria UX #20: loading inconsistente — tela em branco durante a carga

test("UX #20 — shows a 'Carregando…' indicator while the dashboard data is being fetched, instead of staying blank", async (t) => {
  let resolveData;
  const dataPromise = new Promise(r => { resolveData = r; });
  const { mod } = await loadView(t, { getDashboardData: () => dataPromise });

  const pending = mod.initActivityDashboardView();
  await tick();

  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false, "a loading indicator is shown instead of a blank/hidden block"));
  assert.match(allCardsText(), /Carregando/);

  resolveData(EMPTY_DATA);
  await pending;

  assert.strictEqual(totalCardsCount(), 12, "the real cards replace the loading indicator once data arrives");
});

// ── Auditoria UX #23: Conquistas construídas e invisíveis — expostas como um
// card no Dashboard consolidado, usando achievementService.getAchievementSummary()
// já pronto e testado (nenhuma agregação nova).

test("UX #23 — the 'Conquistas recentes' card renders the completed/total count and overall progress", async (t) => {
  const { mod } = await loadView(t, {
    getAchievementSummary: async () => ({ total: 5, completed: 2, inProgress: 3, overallProgress: 0.4 }),
  });

  await mod.initActivityDashboardView();

  const text = allCardsText();
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

  assert.match(allCardsText(), /Nenhuma conquista concluída ainda/);
});

test("UX #23 — a failure fetching achievements never breaks the other execution cards (falls back to '—')", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    getAchievementSummary: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => mod.initActivityDashboardView());

  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false));
  assert.strictEqual(totalCardsCount(), 12);
  const text = allCardsText();
  assert.match(text, /Tempo estudado hoje/); // demais cards seguem de pé
  assert.match(text, /Não foi possível carregar este indicador\./);
  assert.ok(handleErrorCalls.some(c => c.context.context === "activityDashboardView.achievements" && c.context.silent === true));
});

// F13.4 — o Dashboard deixou de alternar "Hoje"/"Períodos"/"Progresso e
// Conquistas" por abas empilhadas na mesma tela: "Hoje" é a única seção do
// Dashboard; "Períodos" e "Progresso e Conquistas" viraram seções sempre
// visíveis (sem abas) da página dedicada "Progresso" (#page-progress),
// alcançada por um link — nunca reduzindo os dados exibidos, nem mudando
// como/quando são buscados (os três níveis continuam chegando juntos em uma
// única _load()).

test("F10 #3.1 — 'Hoje' shows exactly the three today-scoped cards, always visible", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const today = document.getElementById("dash-cards-today");
  assert.strictEqual(today.hidden, false);
  assert.strictEqual(today.children.length, 3);
  assert.match(today.textContent, /Meta diária/);
  assert.match(today.textContent, /Tempo estudado hoje/);
  assert.match(today.textContent, /Sessões hoje/);
});

test("F13.4 — 'Períodos' and 'Progresso e Conquistas' cards render on the Progresso page without any tab click", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const weekMonth = document.getElementById("dash-cards-weekmonth");
  assert.strictEqual(weekMonth.hidden, false);
  assert.strictEqual(weekMonth.children.length, 7);
  assert.match(weekMonth.textContent, /Meta semanal/);
  assert.match(weekMonth.textContent, /Tempo médio por sessão/);

  const records = document.getElementById("dash-cards-records");
  assert.strictEqual(records.hidden, false);
  assert.strictEqual(records.children.length, 2);
  assert.match(records.textContent, /Maior sessão/);
  assert.match(records.textContent, /Conquistas recentes/);
});

test("F13.4 — the Dashboard page links to the dedicated Progresso page instead of stacking tabs", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });
  await mod.initActivityDashboardView();

  const link = document.getElementById("dash-progress-link");
  assert.ok(link, "expected a link/button to the Progresso page on the Dashboard");
  assert.strictEqual(link.dataset.page, "progress");
  assert.ok(document.getElementById("page-progress"), "expected a dedicated #page-progress");
});
