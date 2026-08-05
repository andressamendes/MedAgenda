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
const NARRATIVE_SERVICE_SPECIFIER  = new URL("../../progressNarrativeService.js", import.meta.url).href;
const PROFILE_SERVICE_SPECIFIER    = new URL("../../profileService.js", import.meta.url).href;
const ACCOUNT_VIEW_SPECIFIER       = new URL("../../accountView.js", import.meta.url).href;
const ERROR_SPECIFIER              = new URL("../../errorService.js", import.meta.url).href;

// F14.5 — dados neutros (sem sessões, sem sequência) para o resumo
// narrativo, mesmo padrão de EMPTY_DATA/EMPTY_ACHIEVEMENTS acima.
const EMPTY_NARRATIVE = { weekMinutes: 0, previousWeekMinutes: 0, dominantCategory: null, currentStreak: 0 };

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };

const EMPTY_DATA = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};

// Auditoria UX #23 / V5.3 — achievementService.js mockado por inteiro (mesmo
// padrão de decisionEngine.js acima): a derivação de conquistas em si já é
// coberta isoladamente em tests/services/achievementService.test.js. Cada
// item segue o formato real de listAchievements() (V5.3).
function _achievement(overrides) {
  return {
    id: "study-time", title: "Tempo de estudo", description: "Acumule 100 horas de estudo.",
    category: "tempo_de_estudo", current: 0, target: 100, completed: false, progress: 0, icon: "clock",
    ...overrides,
  };
}

const EMPTY_ACHIEVEMENTS = [
  _achievement({ id: "study-time", title: "Tempo de estudo", icon: "clock" }),
  _achievement({ id: "sessions-completed", title: "Sessões concluídas", icon: "check-circle" }),
  _achievement({ id: "questions-solved", title: "Questões resolvidas", icon: "target" }),
  _achievement({ id: "study-streak", title: "Constância", icon: "flame" }),
  _achievement({ id: "subjects-studied", title: "Matérias estudadas", icon: "book" }),
];

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
    namedExports: {
      listAchievements: overrides.listAchievements ?? (async () => EMPTY_ACHIEVEMENTS),
      // V5.7 — consumeNewlyCompleted() é uma decisão do próprio
      // achievementService (coberta isoladamente em
      // tests/services/achievementCelebration.test.js): aqui basta um mock
      // neutro que nunca reporta nada como "recém-concluído", para não
      // disparar a tela de celebração por engano nestes testes de
      // renderização.
      consumeNewlyCompleted: overrides.consumeNewlyCompleted ?? (() => []),
    },
  });

  t.mock.module(NARRATIVE_SERVICE_SPECIFIER, {
    namedExports: { getProgressNarrativeData: overrides.getProgressNarrativeData ?? (async () => EMPTY_NARRATIVE) },
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
// qual nível/página um card específico caiu — só que os 11 cards de sempre
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

// Etapa 6 — #dash-cards-today funde suas 3 métricas num único bloco
// `.stat-summary` (1 filho), em vez de 3 `.stat-card` separados; os outros
// dois níveis (página Progresso) continuam com um filho por card de sempre.
function totalCardsCount() {
  return cardGroupEls().reduce((sum, el) => sum + el.querySelectorAll(".stat-card, .stat-summary-item").length, 0);
}

function allConfigureLinks() {
  return cardGroupEls().flatMap(el => Array.from(el.querySelectorAll('[data-action="configure-goal"]')));
}

// V5.3 — lista de Conquistas vive em #achievements-list, fora dos três
// containers de stat-cards acima (não é mais um stat-card único).
function achievementsListEl() {
  return document.getElementById("achievements-list");
}

function achievementItemEls() {
  return Array.from(achievementsListEl().querySelectorAll(".achievement-item"));
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

test("with no sessions, all eight cards render with empty/zero/no-goal values", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false));
  assert.strictEqual(totalCardsCount(), 8);
  const text = allCardsText();
  assert.match(text, /Tempo estudado hoje/);
  assert.match(text, /Tempo estudado este mês/);
  assert.match(text, /Nenhuma sessão finalizada neste mês/);
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

// Etapa 1 — o anel da meta diária já vive no hero da página Progresso
// (_goalRingHeroMarkup), então o stat-card "Meta diária" (página "Hoje")
// não repete mais o anel: a mesma meta não pode aparecer duas vezes na
// tela. O card continua só com texto (valor + descrição).
test("Etapa 1 — the daily goal stat-card renders no progress ring (it only lives in the hero)", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  assert.strictEqual(document.querySelector("#dash-cards-today .dashboard-progress-ring"), null);
});

// V5.2 — a meta semanal/mensal usa o mesmo anel circular (SVG) da meta
// diária (Etapa 1: única metáfora visual de "% de meta cumprida" no
// produto); percentual continua em texto/aria-valuenow, nunca só na cor do
// traço.
test("Etapa 1 — a configured weekly/monthly goal renders a progress ring reflecting its percentage", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      weeklyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const ring = document.querySelector("#dash-cards-weekmonth .dashboard-progress-ring");
  assert.ok(ring, "o anel de progresso deve existir para uma meta semanal configurada");
  assert.strictEqual(ring.getAttribute("aria-valuenow"), "50");
  const fg = ring.querySelector(".dashboard-progress-ring-fg");
  assert.ok(fg, "o traço de progresso do anel deve existir");
  const circumference = 2 * Math.PI * 26;
  assert.strictEqual(fg.getAttribute("stroke-dasharray"), circumference.toFixed(2));
  assert.strictEqual(fg.getAttribute("stroke-dashoffset"), (circumference / 2).toFixed(2));
});

test("Etapa 1 — an unconfigured goal renders no progress ring", async (t) => {
  const { mod } = await loadView(t);
  await mod.initActivityDashboardView();

  assert.strictEqual(document.querySelector("#dash-cards-weekmonth .dashboard-progress-ring"), null);
});

test("F11 E11 — an exceeded goal's ring is capped at 100% offset but keeps the uncapped percentage in aria-valuenow", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      monthlyGoal: { configured: true, goalMinutes: 2400, actualMinutes: 3000, percentage: 125, remainingMinutes: 0, state: "exceeded" },
    }),
  });

  await mod.initActivityDashboardView();

  const ring = document.querySelector("#dash-cards-weekmonth .dashboard-progress-ring");
  assert.strictEqual(ring.getAttribute("aria-valuenow"), "125");
  const fg = ring.querySelector(".dashboard-progress-ring-fg--exceeded");
  assert.ok(fg, "o traço deve marcar visualmente o estado 'exceeded'");
  assert.strictEqual(fg.getAttribute("stroke-dashoffset"), "0.00");
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

  const text = allCardsText();
  assert.match(text, /4h 5min/);
  // Etapa 7 — "Sessões na semana" não é mais um card próprio: a contagem
  // vira a frase secundária deste mesmo card de tempo.
  assert.match(text, /5 sessões finalizadas desde segunda-feira/);
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

  const text = allCardsText();
  assert.match(text, /20h 30min/);
  // Etapa 7 — "Sessões no mês" não é mais um card próprio: a contagem vira
  // a frase secundária deste mesmo card de tempo.
  assert.match(text, /20 sessões finalizadas neste mês/);
});

test("average duration renders as secondary text inside the month card, not its own card", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({ ...EMPTY_DATA, monthSessionsCount: 3, averageMinutes: 42 }),
  });

  await mod.initActivityDashboardView();

  const text = allCardsText();
  assert.match(text, /Média de 42min por sessão/);
  assert.doesNotMatch(text, /Tempo médio por sessão/);
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
    friendlyMessage: "Sua sessão expirou. Entre de novo para continuar.",
  });

  await mod.initActivityDashboardView();

  const errorEl = document.getElementById("dash-error");
  assert.strictEqual(errorEl.hidden, false);
  assert.match(errorEl.textContent, /Sessão expirada/);
  assert.match(errorEl.textContent, /Sua sessão expirou\. Entre de novo para continuar\./);
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
  const data = {
    ...EMPTY_DATA, todayMinutes: 90, todaySessionsCount: 2,
    dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
  };
  const { mod } = await loadView(t, { getDashboardData: async () => data });

  await mod.initActivityDashboardView();

  // Sanity: dados do usuário estão renderizados antes do logout.
  assert.match(allCardsText(), /1h 30min/);
  assert.match(document.getElementById("progress-goal-ring").textContent, /50%/);

  mod.resetActivityDashboardView();

  // Simetria A1.3: nenhum dado do usuário anterior pode sobreviver no DOM
  // após o logout — cards de execução voltam ao estado de uma aplicação
  // recém-aberta.
  assert.strictEqual(allCardsHtml(), "", "logout must leave no rendered data behind");
  assert.strictEqual(document.getElementById("progress-goal-ring").innerHTML, "", "logout must leave no rendered data behind in the hero ring either");
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

  assert.strictEqual(totalCardsCount(), 8, "the real cards replace the loading indicator once data arrives");
});

// ── Auditoria UX #23 / V5.3: Conquistas construídas e invisíveis — antes um
// único card resumido ("3/5"), agora as 5 conquistas de
// achievementService.listAchievements() renderizadas individualmente (ícone +
// estado), sem nenhuma agregação nova.

test("V5.3 — the 5 achievements render individually, each with its title and current/target count", async (t) => {
  const { mod } = await loadView(t, {
    listAchievements: async () => [
      _achievement({ id: "study-time", title: "Tempo de estudo", current: 40, target: 100, progress: 0.4, completed: false }),
      _achievement({ id: "sessions-completed", title: "Sessões concluídas", current: 30, target: 30, progress: 1, completed: true }),
    ],
  });

  await mod.initActivityDashboardView();

  const items = achievementItemEls();
  assert.strictEqual(items.length, 2);
  const text = achievementsListEl().textContent;
  assert.match(text, /Tempo de estudo/);
  assert.match(text, /40\/100/);
  assert.match(text, /Sessões concluídas/);
  assert.match(text, /30\/30/);
});

test("V5.3 — an achievement with progress 0 renders as 'locked', in progress as 'in progress', and completed as 'completed'", async (t) => {
  const { mod } = await loadView(t, {
    listAchievements: async () => [
      _achievement({ id: "study-time", current: 0, target: 100, progress: 0, completed: false }),
      _achievement({ id: "sessions-completed", current: 10, target: 30, progress: 10 / 30, completed: false }),
      _achievement({ id: "questions-solved", current: 1000, target: 1000, progress: 1, completed: true }),
    ],
  });

  await mod.initActivityDashboardView();

  const items = achievementItemEls();
  assert.ok(items[0].classList.contains("achievement-item--locked"));
  assert.ok(items[1].classList.contains("achievement-item--in-progress"));
  assert.ok(items[2].classList.contains("achievement-item--completed"));
});

test("V5.3 — each achievement renders its own icon based on achievementService's icon field", async (t) => {
  const { mod } = await loadView(t, { listAchievements: async () => EMPTY_ACHIEVEMENTS });

  await mod.initActivityDashboardView();

  achievementItemEls().forEach(item => {
    assert.ok(item.querySelector(".achievement-icon svg"), "every achievement item renders an icon");
  });
});

test("V5.3 — a failure fetching achievements never breaks the other execution cards (falls back to a message)", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    listAchievements: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => mod.initActivityDashboardView());

  cardGroupEls().forEach(el => assert.strictEqual(el.hidden, false));
  assert.strictEqual(totalCardsCount(), 8);
  assert.match(allCardsText(), /Tempo estudado hoje/); // demais cards seguem de pé
  assert.match(achievementsListEl().textContent, /Não conseguimos carregar suas conquistas agora\./);
  assert.ok(handleErrorCalls.some(c => c.context.context === "activityDashboardView.achievements" && c.context.silent === true));
});

// Etapa 8 — a falha real de carregamento das conquistas (diferente de "aluno
// novo", que já vem com as 5 conquistas bloqueadas, nunca lista vazia) agora
// oferece uma ação de nova tentativa, igual às demais falhas do produto.
test("Etapa 8 — the achievements failure message offers a retry action that reloads the dashboard", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    listAchievements: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return EMPTY_ACHIEVEMENTS;
    },
  });

  await mod.initActivityDashboardView();
  assert.match(achievementsListEl().textContent, /Não conseguimos carregar suas conquistas agora\./);

  const retryBtn = achievementsListEl().querySelector('[data-action="retry-achievements"]');
  assert.ok(retryBtn, "expected a retry button in the achievements failure message");
  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(attempt, 2, "expected the retry button to trigger a reload");
  assert.doesNotMatch(achievementsListEl().textContent, /Não conseguimos carregar suas conquistas agora\./);
});

// F13.4/F14.5 — "Hoje" (as três cards de sempre) vive agora dentro da página
// "Hoje" (#page-today — a antiga #page-dashboard foi removida); "Períodos" e
// "Progresso e Conquistas" seguem sempre visíveis (sem abas) na página
// "Progresso" (#page-progress), atrás de um disclosure "Ver detalhes" — nunca
// reduzindo os dados exibidos, nem mudando como/quando são buscados (os três
// níveis continuam chegando juntos em uma única _load()).

test("F10 #3.1/F14.5 — 'Hoje' has exactly the three today-scoped cards, rendered but behind the disclosure", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const today = document.getElementById("dash-cards-today");
  assert.strictEqual(today.hidden, false);
  assert.strictEqual(today.querySelectorAll(".stat-summary-item").length, 3);
  assert.match(today.textContent, /Meta diária/);
  assert.match(today.textContent, /Tempo estudado hoje/);
  assert.match(today.textContent, /Sessões hoje/);
  assert.ok(document.getElementById("page-today").contains(today), "expected #dash-cards-today inside #page-today");
});

// F15.13 — a grade "Hoje em números" reintroduzia uma grade de stats no
// primeiro olhar do dia, em tensão com "mede em silêncio, fala em frases"
// (mesmo princípio do disclosure "Ver detalhes" do Progresso, F14.5/V5.17). Mesmo
// padrão aplicado aqui: a tela Hoje abre sem grade visível; os cards em si
// não mudam (mesmos ids, mesmos dados, mesma _load()).

test("F15.13 — the Hoje page opens with the number grid collapsed behind a disclosure", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  assert.strictEqual(document.getElementById("today-stats-body").hidden, true, "the number grid must start collapsed");
  const toggle = document.getElementById("today-stats-toggle");
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ver números de hoje");
});

test("F15.13 — clicking 'Ver números de hoje' reveals the same three cards as before", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });
  await mod.initActivityDashboardView();

  const toggle = document.getElementById("today-stats-toggle");
  const body   = document.getElementById("today-stats-body");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(body.hidden, false);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ocultar números de hoje");
  const today = document.getElementById("dash-cards-today");
  assert.strictEqual(today.querySelectorAll(".stat-summary-item").length, 3);
  assert.match(today.textContent, /Meta diária/);

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(body.hidden, true);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
});

// Etapa 19 (auditoria UX/UI V2 #6, itens #18/#19 pendentes da 1ª auditoria) —
// setTodayStatsAnchor() é o seam que todayView.js usa para acrescentar o
// valor-âncora ("45min") ao rótulo, reaproveitando o mesmo
// dailyGoal.actualMinutes já lido para a frase do hero.
test("Etapa 19 — setTodayStatsAnchor() adds a value anchor to the closed disclosure label", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });
  await mod.initActivityDashboardView();

  const toggle = document.getElementById("today-stats-toggle");
  mod.setTodayStatsAnchor("45min");

  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ver números de hoje · 45min");
});

test("Etapa 19 — an empty anchor keeps the plain label", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });
  await mod.initActivityDashboardView();

  const toggle = document.getElementById("today-stats-toggle");
  mod.setTodayStatsAnchor("");

  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ver números de hoje");
});

test("Etapa 19 — the anchor is not shown while the disclosure is expanded, and returns once it's closed again", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });
  await mod.initActivityDashboardView();

  const toggle = document.getElementById("today-stats-toggle");
  mod.setTodayStatsAnchor("45min");
  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); // expand

  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ocultar números de hoje");

  mod.setTodayStatsAnchor("50min"); // e.g. a session finished while expanded — must not clobber "Ocultar…"
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ocultar números de hoje");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); // collapse
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ver números de hoje · 50min");
});

test("F13.4/F14.5 — 'Períodos' and 'Progresso e Conquistas' cards render on the Progresso page without any tab click", async (t) => {
  const { mod } = await loadView(t, { getDashboardData: async () => EMPTY_DATA });

  await mod.initActivityDashboardView();

  const weekMonth = document.getElementById("dash-cards-weekmonth");
  assert.strictEqual(weekMonth.hidden, false);
  assert.strictEqual(weekMonth.children.length, 4);
  assert.match(weekMonth.textContent, /Meta semanal/);
  assert.match(weekMonth.textContent, /Tempo estudado este mês/);

  const records = document.getElementById("dash-cards-records");
  assert.strictEqual(records.hidden, false);
  assert.strictEqual(records.children.length, 1);
  assert.match(records.textContent, /Maior sessão/);

  // V5.3 — Conquistas saiu de dash-cards-records e virou uma lista própria.
  assert.match(achievementsListEl().textContent, /Tempo de estudo/);
});

// ── F14.5 / Etapa 3 — Progresso narrativo ───────────────────────────────────

test("Etapa 3 — the Progresso page opens with a single highlight sentence and no number grid visible", async (t) => {
  const { mod } = await loadView(t, {
    getProgressNarrativeData: async () => ({ weekMinutes: 90, previousWeekMinutes: 60, dominantCategory: { name: "Cardiologia", minutes: 60 }, currentStreak: 3 }),
  });

  await mod.initActivityDashboardView();

  const narrative = document.getElementById("progress-narrative");
  assert.match(narrative.textContent, /1h 30min esta semana/);
  assert.match(narrative.textContent, /30min a mais que a semana anterior/);
  // Etapa 3 — matéria dominante saiu da narrativa: agora só na legenda do
  // card "Tempo estudado esta semana" (ver teste abaixo).
  assert.doesNotMatch(narrative.textContent, /Cardiologia/);
  assert.strictEqual(narrative.querySelectorAll("p").length, 1, "only 1 highlight sentence outside the disclosure");
  assert.ok(narrative.querySelector("p").classList.contains("progress-narrative-highlight"));
  // Etapa 2 — a sequência saiu da narrativa em frase: agora só o número
  // junto do heatmap (constancyHeatmapView.js).
  assert.doesNotMatch(narrative.textContent, /Sequência atual/);

  assert.strictEqual(document.getElementById("progress-numbers-body").hidden, true, "the number grid must start collapsed");
  const toggle = document.getElementById("progress-numbers-toggle");
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
});

test("Etapa 3 — the dominant category sentence appears as legend of the 'Tempo estudado esta semana' card, inside the disclosure", async (t) => {
  const { mod } = await loadView(t, {
    getProgressNarrativeData: async () => ({ weekMinutes: 90, previousWeekMinutes: 60, dominantCategory: { name: "Cardiologia", minutes: 60 }, currentStreak: 3 }),
  });

  await mod.initActivityDashboardView();

  const weekMonth = document.getElementById("dash-cards-weekmonth");
  assert.match(weekMonth.textContent, /Cardiologia concentrou 67% do tempo\./);
});

test("Etapa 3 — no dominant category (e.g. only untracked sessions this week) leaves the card's base description untouched", async (t) => {
  const { mod } = await loadView(t, {
    getProgressNarrativeData: async () => ({ weekMinutes: 90, previousWeekMinutes: 0, dominantCategory: null, currentStreak: 0 }),
  });

  await mod.initActivityDashboardView();

  const weekMonth = document.getElementById("dash-cards-weekmonth");
  assert.match(weekMonth.textContent, /Nenhuma sessão finalizada desde segunda-feira\./);
  assert.doesNotMatch(weekMonth.textContent, /concentrou/);
});

test("V5.17 — clicking 'Ver detalhes' reveals the number grid behind the disclosure", async (t) => {
  const { mod } = await loadView(t);
  await mod.initActivityDashboardView();

  const toggle = document.getElementById("progress-numbers-toggle");
  const body   = document.getElementById("progress-numbers-body");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(body.hidden, false);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "true");
  assert.strictEqual(toggle.querySelector(".disclosure-label").textContent, "Ocultar detalhes");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(body.hidden, true);
  assert.strictEqual(toggle.getAttribute("aria-expanded"), "false");
});

// ── V5.17 — Composição visual primária (anel + heatmap + narrativa) ────────

test("V5.17 — a configured daily goal renders its own progress ring at the top of the Progresso page", async (t) => {
  const { mod } = await loadView(t, {
    getDashboardData: async () => ({
      ...EMPTY_DATA,
      dailyGoal: { configured: true, goalMinutes: 120, actualMinutes: 60, percentage: 50, remainingMinutes: 60, state: "partial" },
    }),
  });

  await mod.initActivityDashboardView();

  const hero = document.getElementById("progress-goal-ring");
  assert.ok(document.getElementById("page-progress").contains(hero), "expected #progress-goal-ring inside #page-progress");
  const ring = hero.querySelector(".dashboard-progress-ring");
  assert.ok(ring, "o anel de progresso deve existir para uma meta diária configurada");
  assert.strictEqual(ring.getAttribute("aria-valuenow"), "50");
  assert.match(hero.textContent, /50%/);
  assert.match(hero.textContent, /Meta parcialmente atingida/);
});

test("V5.17 — the hero ring appears before the heatmap and both appear before the number grid disclosure", async (t) => {
  const { mod } = await loadView(t);
  await mod.initActivityDashboardView();

  const page = document.getElementById("page-progress");
  const positions = ["progress-goal-ring", "constancy-heatmap", "progress-narrative", "progress-numbers-toggle", "dash-cards-weekmonth"]
    .map(id => Array.from(page.querySelectorAll("*")).indexOf(document.getElementById(id)));
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepStrictEqual(positions, sorted, "expected ring, heatmap and narrative before the number-grid disclosure");
});

test("V5.17 — an unconfigured daily goal shows a 'Configurar meta' link instead of an empty ring", async (t) => {
  const { mod, openAccountCalls } = await loadView(t);
  await mod.initActivityDashboardView();

  const hero = document.getElementById("progress-goal-ring");
  assert.strictEqual(hero.querySelector(".dashboard-progress-ring"), null);
  const link = hero.querySelector('[data-action="configure-goal"]');
  assert.ok(link, "expected a 'Configurar meta' link when the daily goal is unconfigured");

  link.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(openAccountCalls.length, 1);
  assert.deepStrictEqual(openAccountCalls[0], { focusSection: "goals" });
});

test("F15.1 — a category name containing HTML renders as literal text in the card legend (stored XSS, M1)", async (t) => {
  const payload = `<img src=x onerror="window.__xss = true">`;
  const { mod } = await loadView(t, {
    getProgressNarrativeData: async () => ({ weekMinutes: 90, previousWeekMinutes: 0, dominantCategory: { name: payload, minutes: 60 }, currentStreak: 0 }),
  });

  await mod.initActivityDashboardView();

  const weekMonth = document.getElementById("dash-cards-weekmonth");
  assert.strictEqual(weekMonth.querySelector("img"), null, "the payload must never become a DOM element");
  assert.ok(weekMonth.textContent.includes(payload), "the payload must appear escaped, as literal text");
  assert.match(weekMonth.textContent, /concentrou 67% do tempo\./);
  assert.strictEqual(window.__xss, undefined);
});

test("F14.5 — with no sessions this week, the narrative says so instead of comparing to zero", async (t) => {
  const { mod } = await loadView(t, { getProgressNarrativeData: async () => EMPTY_NARRATIVE });

  await mod.initActivityDashboardView();

  const text = document.getElementById("progress-narrative").textContent;
  assert.match(text, /Você ainda não estudou esta semana\./);
});

test("F14.5 — a failure building the narrative falls back to a neutral message without breaking the cards", async (t) => {
  const { mod, handleErrorCalls } = await loadView(t, {
    getProgressNarrativeData: async () => { throw new Error("network down"); },
  });

  await assert.doesNotReject(() => mod.initActivityDashboardView());

  assert.match(document.getElementById("progress-narrative").textContent, /Não foi possível carregar o resumo desta semana\./);
  assert.strictEqual(document.getElementById("dash-cards-weekmonth").hidden, false);
  assert.ok(handleErrorCalls.some(c => c.context.context === "activityDashboardView.narrative" && c.context.silent === true));
});

// Etapa 8 — a mensagem de falha real da narrativa (ver acima) nunca deve ser
// confundida com o texto de "aluno novo"/"sem estudo esta semana" (já
// coberto por "F14.5 — with no sessions this week..."): esta cobre só o caso
// de falha real, e garante que ela oferece a mesma ação de retry das demais
// falhas do produto.
test("Etapa 8 — the narrative failure message offers a retry action that reloads the dashboard", async (t) => {
  let attempt = 0;
  const { mod } = await loadView(t, {
    getProgressNarrativeData: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return EMPTY_NARRATIVE;
    },
  });

  await mod.initActivityDashboardView();
  const narrativeEl = document.getElementById("progress-narrative");
  assert.match(narrativeEl.textContent, /Não foi possível carregar o resumo desta semana\./);

  const retryBtn = narrativeEl.querySelector('[data-action="retry-narrative"]');
  assert.ok(retryBtn, "expected a retry button in the narrative failure message");
  retryBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(attempt, 2, "expected the retry button to trigger a reload");
  assert.match(narrativeEl.textContent, /Você ainda não estudou esta semana\./);
});

// Fase J4 movia frases de Revisões/Produtividade para dentro da narrativa;
// Etapa 3 as devolveu para dentro dos próprios blocos, como legenda (ver
// tests/views/insightsView.test.js — "Etapa 3").

test("the stat-card grids (Períodos/Recordes/Revisões/Produtividade) never render outside the 'Ver detalhes' disclosure", async (t) => {
  const { mod } = await loadView(t);
  await mod.initActivityDashboardView();

  assert.strictEqual(document.getElementById("progress-numbers-body").hidden, true);
  document.getElementById("progress-numbers-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("progress-numbers-body").hidden, false);
});
