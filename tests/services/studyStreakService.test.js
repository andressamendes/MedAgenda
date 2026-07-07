/**
 * Tests for studyStreakService.js — Constância / Study Streak (F6.11).
 * activitySessionService.js é mockado como módulo inteiro (mesmo padrão de
 * subjectProgressService.test.js): o objetivo é validar apenas o cálculo de
 * constância, nunca acesso a rede/Supabase. Constância nunca é persistida —
 * estes testes validam justamente que tudo é derivado das Sessões a cada
 * chamada, sem estado próprio.
 *
 * Datas são geradas relativas ao "hoje" real do processo de teste (nunca
 * literais fixas) para o cálculo de sequência atual não ficar frágil
 * dependendo de quando a suíte roda.
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;

function loadStudyStreakService(t, { sessions = [] } = {}) {
  const calls = [];

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActivitySessions: async () => {
        calls.push({ fn: "getActivitySessions" });
        return sessions;
      },
    },
  });

  return import(`../../studyStreakService.js?t=${Math.random()}`).then((mod) => ({ mod, calls }));
}

function isoAtLocalDayOffset(offsetDays, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function session(overrides = {}) {
  return {
    id: "sess-1",
    status: "finished",
    started_at: isoAtLocalDayOffset(0),
    duration_minutes: 60,
    ...overrides,
  };
}

// ── nenhum estudo ────────────────────────────────────────────────────────

test("nenhuma sessão → todas as métricas zeradas", async (t) => {
  const { mod } = await loadStudyStreakService(t, { sessions: [] });

  assert.strictEqual(await mod.getCurrentStreak(), 0);
  assert.strictEqual(await mod.getLongestStreak(), 0);
  assert.deepStrictEqual(await mod.getStudyDays(), []);
  assert.deepStrictEqual(await mod.getStudyCalendar(), {});

  const summary = await mod.getStreakSummary();
  assert.deepStrictEqual(summary, {
    currentStreak: 0,
    longestStreak: 0,
    totalStudyDays: 0,
    lastStudyDay: null,
    daysSinceLastStudy: null,
  });
});

// ── um único dia ─────────────────────────────────────────────────────────

test("uma única sessão finalizada hoje → sequência atual e maior sequência = 1", async (t) => {
  const sessions = [session({ started_at: isoAtLocalDayOffset(0) })];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 1);
  assert.strictEqual(await mod.getLongestStreak(), 1);
  assert.strictEqual((await mod.getStudyDays()).length, 1);
});

// ── dias consecutivos ────────────────────────────────────────────────────

test("sessões em dias consecutivos até hoje → sequência atual acumula", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-2) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(-1) }),
    session({ id: "s3", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 3);
  assert.strictEqual(await mod.getLongestStreak(), 3);
});

test("sequência atual permanece viva quando o último estudo foi ontem (hoje ainda não estudado)", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-2) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(-1) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 2);
});

// ── quebra de sequência ──────────────────────────────────────────────────

test("gap de mais de um dia sem estudo → sequência atual cai para zero", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-5) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(-4) }),
    // gap: -3, -2, -1, 0 sem sessão
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 0);
  assert.strictEqual(await mod.getLongestStreak(), 2); // histórico preserva a maior sequência já feita
});

test("quebra no meio do histórico não afeta a sequência atual, só a maior sequência", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-10) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(-9) }),
    session({ id: "s3", started_at: isoAtLocalDayOffset(-8) }),
    // quebra
    session({ id: "s4", started_at: isoAtLocalDayOffset(-1) }),
    session({ id: "s5", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 2);
  assert.strictEqual(await mod.getLongestStreak(), 3);
});

// ── múltiplas sessões no mesmo dia ───────────────────────────────────────

test("múltiplas sessões no mesmo dia contam como um único dia estudado", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(0, 8) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(0, 14) }),
    session({ id: "s3", started_at: isoAtLocalDayOffset(0, 20) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  const days = await mod.getStudyDays();
  assert.strictEqual(days.length, 1);
  assert.strictEqual(await mod.getCurrentStreak(), 1);

  const summary = await mod.getStreakSummary();
  assert.strictEqual(summary.totalStudyDays, 1);
});

// ── sessões canceladas ────────────────────────────────────────────────────

test("sessões canceladas são ignoradas no cálculo de constância", async (t) => {
  const sessions = [
    session({ id: "s1", status: "cancelled", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 0);
  assert.deepStrictEqual(await mod.getStudyDays(), []);
});

// ── sessões pausadas ──────────────────────────────────────────────────────

test("sessões pausadas são ignoradas no cálculo de constância", async (t) => {
  const sessions = [
    session({ id: "s1", status: "paused", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 0);
  assert.deepStrictEqual(await mod.getStudyDays(), []);
});

test("sessão running (em andamento) não conta como dia estudado", async (t) => {
  const sessions = [
    session({ id: "s1", status: "running", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 0);
});

test("mistura de sessões finalizadas, canceladas e pausadas no mesmo dia: dia conta se houver ao menos uma finalizada", async (t) => {
  const sessions = [
    session({ id: "s1", status: "cancelled", started_at: isoAtLocalDayOffset(0, 8) }),
    session({ id: "s2", status: "paused", started_at: isoAtLocalDayOffset(0, 10) }),
    session({ id: "s3", status: "finished", started_at: isoAtLocalDayOffset(0, 12) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  assert.strictEqual(await mod.getCurrentStreak(), 1);
  assert.strictEqual((await mod.getStudyDays()).length, 1);
});

// ── isolamento por usuário ────────────────────────────────────────────────

test("isolamento por usuário é herdado de activitySessionService — nenhuma filtragem própria é adicionada", async (t) => {
  const sessions = [session({ id: "s1", started_at: isoAtLocalDayOffset(0) })];
  const { mod, calls } = await loadStudyStreakService(t, { sessions });

  await mod.getStreakSummary();

  assert.strictEqual(calls.filter((c) => c.fn === "getActivitySessions").length, 1);
});

// ── calendário ────────────────────────────────────────────────────────────

test("getStudyCalendar() retorna mapa de dias estudados", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-2) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  const calendar = await mod.getStudyCalendar();
  const days = await mod.getStudyDays();

  assert.strictEqual(Object.keys(calendar).length, 2);
  for (const day of days) {
    assert.strictEqual(calendar[day], true);
  }
});

// ── resumo consolidado ──────────────────────────────────────────────────

test("getStreakSummary() consolida todas as métricas em uma única chamada", async (t) => {
  const sessions = [
    session({ id: "s1", started_at: isoAtLocalDayOffset(-1) }),
    session({ id: "s2", started_at: isoAtLocalDayOffset(0) }),
  ];
  const { mod } = await loadStudyStreakService(t, { sessions });

  const summary = await mod.getStreakSummary();

  assert.strictEqual(summary.currentStreak, 2);
  assert.strictEqual(summary.longestStreak, 2);
  assert.strictEqual(summary.totalStudyDays, 2);
  assert.strictEqual(summary.lastStudyDay, (await mod.getStudyDays())[1]);
  assert.strictEqual(summary.daysSinceLastStudy, 0);
});

test("daysSinceLastStudy reflete dias sem estudo desde a última sessão", async (t) => {
  const sessions = [session({ id: "s1", started_at: isoAtLocalDayOffset(-4) })];
  const { mod } = await loadStudyStreakService(t, { sessions });

  const summary = await mod.getStreakSummary();
  assert.strictEqual(summary.daysSinceLastStudy, 4);
  assert.strictEqual(summary.currentStreak, 0);
});
