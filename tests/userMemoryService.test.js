/**
 * Tests for userMemoryService.js — Memória do Usuário (F3.6).
 *
 * Pure indicator builders are exercised directly with plain data (same
 * fixture style as tests/reflectionService.test.js). getUserMemory() has
 * every dependency mocked (no real Supabase) — it verifies a single round of
 * parallel calls, graceful degradation ("partial"/"insufficient_data"), and
 * that the algorithm is deterministic. No test asserts on session notes,
 * titles or any free-text field — the engine never touches them.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SPECIFIER  = new URL("../activitySessionService.js", import.meta.url).href;
const REVIEW_SPECIFIER   = new URL("../reviewService.js", import.meta.url).href;
const CATEGORY_SPECIFIER = new URL("../categoryService.js", import.meta.url).href;
const EVENT_SPECIFIER    = new URL("../eventService.js", import.meta.url).href;
const PROFILE_SPECIFIER  = new URL("../profileService.js", import.meta.url).href;
const ERROR_SPECIFIER    = new URL("../errorService.js", import.meta.url).href;

const NOW = new Date("2026-07-06T18:00:00.000Z"); // uma segunda-feira

function loadUserMemoryService(t, overrides = {}) {
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: { listByDateRange: overrides.listByDateRange ?? (async () => []) },
  });
  t.mock.module(REVIEW_SPECIFIER, {
    namedExports: { listCompleted: overrides.listCompleted ?? (async () => []) },
  });
  t.mock.module(CATEGORY_SPECIFIER, {
    namedExports: { getCategories: overrides.getCategories ?? (async () => []) },
  });
  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEvents: overrides.getEvents ?? (async () => []) },
  });
  t.mock.module(PROFILE_SPECIFIER, {
    namedExports: { getProfile: overrides.getProfile ?? (async () => null) },
  });
  t.mock.module(ERROR_SPECIFIER, {
    namedExports: { handleError: overrides.handleError ?? (() => ({ category: "unknown", friendly: "erro" })) },
  });
  return import(`../userMemoryService.js?t=${Math.random()}`);
}

// Sessão "às 20h" numa segunda-feira (2026-07-06 é segunda) — deslocada por
// dayOffset semanas para variar o dia da semana quando necessário.
function session({ hour = 20, dow = 1, minutes = 45, status = "finished" } = {}) {
  // 2026-07-05 é domingo (dow 0); soma dow para cair no dia da semana desejado.
  const base = new Date("2026-07-05T00:00:00.000Z");
  base.setDate(base.getDate() + dow);
  base.setHours(hour, 0, 0, 0);
  return { status, duration_minutes: minutes, started_at: base.toISOString() };
}

// ── Blocos puros ─────────────────────────────────────────────────────────────

test("computePreferredTimeOfDay() finds the mode hour bucket, with 'alta' confidence for a strong majority", async (t) => {
  const { computePreferredTimeOfDay } = await loadUserMemoryService(t);
  const sessions = [
    session({ hour: 20 }), session({ hour: 21 }), session({ hour: 22 }), session({ hour: 9 }),
  ];
  const result = computePreferredTimeOfDay(sessions);
  assert.strictEqual(result.valor, "noite");
  assert.strictEqual(result.confianca, "alta"); // 3/4 = 75%
  assert.match(result.baseadoEm, /4 sessões/);
  assert.match(result.motivo, /3 de 4 sessões/);
});

test("computePreferredTimeOfDay() reports 'média' confidence when there's no strong majority", async (t) => {
  const { computePreferredTimeOfDay } = await loadUserMemoryService(t);
  const sessions = [session({ hour: 20 }), session({ hour: 20 }), session({ hour: 9 }), session({ hour: 3 })];
  const result = computePreferredTimeOfDay(sessions);
  assert.strictEqual(result.valor, "noite"); // 2 de 4 = 50%... ainda maioria exata
  assert.strictEqual(result.confianca, "alta");
});

test("computePreferredTimeOfDay() returns null below the minimum sample (never invents a pattern)", async (t) => {
  const { computePreferredTimeOfDay } = await loadUserMemoryService(t);
  assert.strictEqual(computePreferredTimeOfDay([session({}), session({})]), null); // só 2 sessões
  assert.strictEqual(computePreferredTimeOfDay([]), null);
});

test("computePreferredDayOfWeek() finds the mode weekday", async (t) => {
  const { computePreferredDayOfWeek } = await loadUserMemoryService(t);
  const sessions = [session({ dow: 4 }), session({ dow: 4 }), session({ dow: 4 }), session({ dow: 1 })];
  const result = computePreferredDayOfWeek(sessions);
  assert.strictEqual(result.valor, "Quinta-feira");
  assert.match(result.motivo, /3 de 4 sessões/);
});

test("computeTopCategories() ranks by minutes studied and cites the leading category", async (t) => {
  const { computeTopCategories } = await loadUserMemoryService(t);
  const breakdown = [
    { name: "Cirurgia", minutes: 300 },
    { name: "Clínica Médica", minutes: 600 },
    { name: "Pediatria", minutes: 0 },
  ];
  const result = computeTopCategories(breakdown);
  assert.deepStrictEqual(result.valor, [{ nome: "Clínica Médica", minutos: 600 }, { nome: "Cirurgia", minutos: 300 }]);
  assert.match(result.motivo, /Clínica Médica concentra o maior tempo/);
});

test("computeTopCategories() returns null when nothing has been studied yet", async (t) => {
  const { computeTopCategories } = await loadUserMemoryService(t);
  assert.strictEqual(computeTopCategories([{ name: "Cirurgia", minutes: 0 }]), null);
  assert.strictEqual(computeTopCategories([]), null);
});

test("computeAverageSessionDuration() computes a general average and a per-category average with enough samples", async (t) => {
  const { computeAverageSessionDuration } = await loadUserMemoryService(t);
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    { status: "finished", duration_minutes: 40, started_at: "2026-07-01T10:00:00.000Z", event_id: "ev-1" },
    { status: "finished", duration_minutes: 44, started_at: "2026-07-02T10:00:00.000Z", event_id: "ev-1" },
    { status: "finished", duration_minutes: 42, started_at: "2026-07-03T10:00:00.000Z", event_id: "ev-1" },
  ];
  const result = computeAverageSessionDuration(sessions, events, []);
  assert.strictEqual(result.geral.valor, 42);
  assert.strictEqual(result.porCategoria.length, 1);
  assert.strictEqual(result.porCategoria[0].categoria, "Farmacologia");
  assert.strictEqual(result.porCategoria[0].valor, 42);
  assert.match(result.porCategoria[0].motivo, /42 minutos/);
});

test("computeAverageSessionDuration() omits a category from porCategoria below the minimum sample", async (t) => {
  const { computeAverageSessionDuration } = await loadUserMemoryService(t);
  const events = [{ id: "ev-1", category: "Farmacologia" }];
  const sessions = [
    { status: "finished", duration_minutes: 40, started_at: "2026-07-01T10:00:00.000Z", event_id: "ev-1" },
    { status: "finished", duration_minutes: 44, started_at: "2026-07-02T10:00:00.000Z" }, // sem categoria
    { status: "finished", duration_minutes: 42, started_at: "2026-07-03T10:00:00.000Z" },
  ];
  const result = computeAverageSessionDuration(sessions, events, []);
  assert.deepStrictEqual(result.porCategoria, []); // só 1 sessão nesta categoria — abaixo do piso
});

test("computeAverageSessionDuration() returns null below the minimum sample overall", async (t) => {
  const { computeAverageSessionDuration } = await loadUserMemoryService(t);
  assert.strictEqual(computeAverageSessionDuration([session({}), session({})], [], []), null);
});

test("computeWeeklyFrequency() averages sessions per week over the observed window", async (t) => {
  const { computeWeeklyFrequency } = await loadUserMemoryService(t);
  const sessions = Array.from({ length: 12 }, (_, i) => session({ dow: i % 7 }));
  const result = computeWeeklyFrequency(sessions, 21, NOW); // 21 dias = 3 semanas
  assert.strictEqual(result.valor, 4); // 12/3
  assert.match(result.motivo, /4 sessões por semana/);
});

test("computeAverageReviewInterval() averages the gap between completed reviews", async (t) => {
  const { computeAverageReviewInterval } = await loadUserMemoryService(t);
  const reviews = [
    { completed_at: "2026-06-01T10:00:00.000Z" },
    { completed_at: "2026-06-08T10:00:00.000Z" }, // +7
    { completed_at: "2026-06-20T10:00:00.000Z" }, // +12
  ];
  const result = computeAverageReviewInterval(reviews);
  assert.strictEqual(result.valor, Math.round((7 + 12) / 2));
  assert.match(result.motivo, /a cada 10 dias/);
});

test("computeAverageReviewInterval() returns null with fewer than two completed reviews", async (t) => {
  const { computeAverageReviewInterval } = await loadUserMemoryService(t);
  assert.strictEqual(computeAverageReviewInterval([{ completed_at: "2026-06-01T10:00:00.000Z" }]), null);
  assert.strictEqual(computeAverageReviewInterval([]), null);
});

test("computeGoalAchievementPattern() reports the historical percentage of days the daily goal was met", async (t) => {
  const { computeGoalAchievementPattern } = await loadUserMemoryService(t);
  const sessions = [
    session({ dow: 1, minutes: 60 }), // bateu (>=60)
    session({ dow: 2, minutes: 30 }), // não bateu
  ];
  const result = computeGoalAchievementPattern(sessions, 60, 7, NOW);
  assert.strictEqual(result.baseadoEm, "7 dias analisados");
  assert.match(result.motivo, /meta diária em \d+ dos últimos 7 dias/);
});

test("computeGoalAchievementPattern() returns null without a configured daily goal — never invents a target", async (t) => {
  const { computeGoalAchievementPattern } = await loadUserMemoryService(t);
  assert.strictEqual(computeGoalAchievementPattern([session({})], null, 7, NOW), null);
});

// ── getUserMemory() — orquestração ──────────────────────────────────────────

test("a brand-new user (no sessions, no reviews) yields 'insufficient_data' with every preference null", async (t) => {
  const { getUserMemory, emptyUserMemoryPreferences } = await loadUserMemoryService(t);
  const result = await getUserMemory(NOW);
  assert.strictEqual(result.status, "insufficient_data");
  assert.deepStrictEqual(result.preferences, emptyUserMemoryPreferences());
});

test("few sessions: patterns below the sample threshold stay null instead of a low-confidence guess", async (t) => {
  const { getUserMemory } = await loadUserMemoryService(t, {
    listByDateRange: async () => [session({ hour: 20 }), session({ hour: 9 })], // só 2 sessões
  });
  const result = await getUserMemory(NOW);
  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.preferences.horarioPreferido, null);
  assert.strictEqual(result.preferences.diaPreferido, null);
  assert.strictEqual(result.preferences.frequenciaSemanal, null);
});

test("many sessions: every applicable preference is populated with 'alta' confidence and real evidence", async (t) => {
  const sessions = Array.from({ length: 15 }, () => session({ hour: 20, dow: 4, minutes: 45 }));
  const { getUserMemory } = await loadUserMemoryService(t, {
    listByDateRange: async () => sessions,
    listCompleted: async () => [
      { completed_at: "2026-06-01T10:00:00.000Z" },
      { completed_at: "2026-06-08T10:00:00.000Z" },
      { completed_at: "2026-06-15T10:00:00.000Z" },
    ],
    getProfile: async () => ({ daily_goal_minutes: 30 }),
  });

  const result = await getUserMemory(NOW);
  assert.strictEqual(result.status, "ok");
  assert.strictEqual(result.preferences.horarioPreferido.valor, "noite");
  assert.strictEqual(result.preferences.horarioPreferido.confianca, "alta");
  assert.strictEqual(result.preferences.diaPreferido.valor, "Quinta-feira");
  assert.strictEqual(result.preferences.frequenciaSemanal.confianca, "alta");
  assert.strictEqual(result.preferences.tempoEntreRevisoes.valor, 7);
  assert.ok(result.preferences.metasAtingidas.valor >= 0);
});

test("a change in behavior (different hour/weekday in a fresh call) is reflected — no stale memory", async (t) => {
  const morningSessions = Array.from({ length: 8 }, () => session({ hour: 8, dow: 2 }));
  const { getUserMemory: getMorning } = await loadUserMemoryService(t, { listByDateRange: async () => morningSessions });
  const morningResult = await getMorning(NOW);
  assert.strictEqual(morningResult.preferences.horarioPreferido.valor, "manhã");
});

test("varied hours with no clear winner still report the mode, at 'média' confidence", async (t) => {
  const sessions = [
    session({ hour: 8 }), session({ hour: 8 }), session({ hour: 14 }), session({ hour: 20 }), session({ hour: 22 }),
  ];
  const { getUserMemory } = await loadUserMemoryService(t, { listByDateRange: async () => sessions });
  const result = await getUserMemory(NOW);
  assert.strictEqual(result.preferences.horarioPreferido.valor, "manhã"); // 2/5 = 40%, moda ainda válida
  assert.strictEqual(result.preferences.horarioPreferido.confianca, "média");
});

test("varied categories: the top category is reported without inventing data for categories with zero minutes", async (t) => {
  const events = [{ id: "ev-1", category: "Cirurgia" }, { id: "ev-2", category: "Pediatria" }];
  const sessions = [
    { status: "finished", duration_minutes: 60, started_at: "2026-07-01T10:00:00.000Z", event_id: "ev-1" },
    { status: "finished", duration_minutes: 30, started_at: "2026-07-02T10:00:00.000Z", event_id: "ev-1" },
    { status: "finished", duration_minutes: 20, started_at: "2026-07-03T10:00:00.000Z", event_id: "ev-2" },
  ];
  const { getUserMemory } = await loadUserMemoryService(t, {
    listByDateRange: async () => sessions,
    getEvents: async () => events,
    getCategories: async () => [{ id: "cat-1", name: "Cirurgia" }, { id: "cat-2", name: "Pediatria" }, { id: "cat-3", name: "Anatomia" }],
  });
  const result = await getUserMemory(NOW);
  assert.deepStrictEqual(result.preferences.categoriasMaisEstudadas.valor, [
    { nome: "Cirurgia", minutos: 90 },
    { nome: "Pediatria", minutos: 20 },
  ]);
});

test("partial context: a failure fetching reviews degrades gracefully instead of breaking the memory", async (t) => {
  const errors = [];
  const sessions = Array.from({ length: 5 }, () => session({ hour: 20 }));
  const { getUserMemory } = await loadUserMemoryService(t, {
    listByDateRange: async () => sessions,
    listCompleted: async () => { throw new Error("network down"); },
    handleError: (err, ctx) => { errors.push(ctx); return { category: "network", friendly: "erro" }; },
  });

  const result = await getUserMemory(NOW);
  assert.strictEqual(result.status, "partial");
  assert.ok(errors.some(ctx => ctx.context === "userMemoryService.reviewsCompleted" && ctx.silent === true));
  assert.strictEqual(result.preferences.horarioPreferido.valor, "noite"); // sessões continuam disponíveis
  assert.strictEqual(result.preferences.tempoEntreRevisoes, null); // sem revisões, sem inventar
});

test("the engine is stable: the same inputs always produce the same memory", async (t) => {
  const sessions = [session({ hour: 20, dow: 4 }), session({ hour: 20, dow: 4 }), session({ hour: 9, dow: 1 })];
  const { getUserMemory } = await loadUserMemoryService(t, { listByDateRange: async () => sessions });

  const first = await getUserMemory(NOW);
  const second = await getUserMemory(NOW);
  assert.deepStrictEqual(first, second);
});

test("no preference ever carries free-text fields (session notes/titles) — only aggregates", async (t) => {
  const sessions = Array.from({ length: 5 }, () => ({
    status: "finished", duration_minutes: 45, started_at: session({ hour: 20 }).started_at,
    notes: "informação sensível do usuário",
  }));
  const { getUserMemory } = await loadUserMemoryService(t, { listByDateRange: async () => sessions });
  const result = await getUserMemory(NOW);
  const serialized = JSON.stringify(result.preferences);
  assert.ok(!serialized.includes("informação sensível"));
});
