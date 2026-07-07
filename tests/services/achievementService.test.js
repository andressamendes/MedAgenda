/**
 * Tests for achievementService.js — Domínio de Conquistas (F6.12).
 * studyStreakService.js, subjectProgressService.js, activitySessionService.js
 * e questionService.js são mockados como módulos inteiros (mesmo padrão de
 * subjectProgressService.test.js / studyStreakService.test.js): o objetivo é
 * validar apenas a derivação do estado de conquistas, nunca acesso a
 * rede/Supabase. Conquistas nunca são persistidas — estes testes validam
 * justamente que tudo é recalculado a partir das projeções existentes a cada
 * chamada, sem estado próprio.
 */
import { test } from "node:test";
import assert from "node:assert";

const STREAK_SERVICE_SPECIFIER = new URL("../../studyStreakService.js", import.meta.url).href;
const SUBJECT_PROGRESS_SERVICE_SPECIFIER = new URL("../../subjectProgressService.js", import.meta.url).href;
const SESSION_SERVICE_SPECIFIER = new URL("../../activitySessionService.js", import.meta.url).href;
const QUESTION_SERVICE_SPECIFIER = new URL("../../questionService.js", import.meta.url).href;

function loadAchievementService(t, {
  streakSummary = { currentStreak: 0, longestStreak: 0, totalStudyDays: 0, lastStudyDay: null, daysSinceLastStudy: null },
  subjectsProgress = [],
  sessions = [],
  questions = [],
} = {}) {
  const calls = [];

  t.mock.module(STREAK_SERVICE_SPECIFIER, {
    namedExports: {
      getStreakSummary: async () => {
        calls.push({ fn: "getStreakSummary" });
        return streakSummary;
      },
    },
  });

  t.mock.module(SUBJECT_PROGRESS_SERVICE_SPECIFIER, {
    namedExports: {
      listSubjectsProgress: async () => {
        calls.push({ fn: "listSubjectsProgress" });
        return subjectsProgress;
      },
    },
  });

  t.mock.module(SESSION_SERVICE_SPECIFIER, {
    namedExports: {
      getActivitySessions: async () => {
        calls.push({ fn: "getActivitySessions" });
        return sessions;
      },
    },
  });

  t.mock.module(QUESTION_SERVICE_SPECIFIER, {
    namedExports: {
      getQuestions: async () => {
        calls.push({ fn: "getQuestions" });
        return questions;
      },
    },
  });

  return import(`../../achievementService.js?t=${Math.random()}`).then((mod) => ({ mod, calls }));
}

function subjectEntry(overrides = {}) {
  return {
    subject: "Cardiologia",
    sessionsCount: 1,
    finishedSessionsCount: 1,
    cancelledSessionsCount: 0,
    questionsCount: 0,
    totalMinutes: 60,
    lastSessionAt: null,
    lastQuestionAt: null,
    lastActivityAt: null,
    status: "com_atividade",
    ...overrides,
  };
}

function session(overrides = {}) {
  return { id: "sess-1", status: "finished", ...overrides };
}

// ── nenhuma conquista com atividade ──────────────────────────────────────

test("nenhuma atividade → todas as conquistas zeradas e não concluídas", async (t) => {
  const { mod } = await loadAchievementService(t, {});

  const achievements = await mod.listAchievements();
  assert.strictEqual(achievements.length, 5);
  for (const achievement of achievements) {
    assert.strictEqual(achievement.current, 0);
    assert.strictEqual(achievement.completed, false);
    assert.strictEqual(achievement.progress, 0);
  }

  const summary = await mod.getAchievementSummary();
  assert.deepStrictEqual(summary, { total: 5, completed: 0, inProgress: 5, overallProgress: 0 });
});

// ── tempo de estudo ──────────────────────────────────────────────────────

test("tempo de estudo: horas derivadas da soma de totalMinutes por matéria", async (t) => {
  const subjectsProgress = [
    subjectEntry({ subject: "Cardiologia", totalMinutes: 3000 }),
    subjectEntry({ subject: "Nefrologia", totalMinutes: 3000 }),
  ];
  const { mod } = await loadAchievementService(t, { subjectsProgress });

  const achievement = await mod.getAchievement("study-time");
  assert.strictEqual(achievement.current, 100); // 6000 min / 60 = 100h
  assert.strictEqual(achievement.target, 100);
  assert.strictEqual(achievement.completed, true);
  assert.strictEqual(achievement.progress, 1);
});

test("tempo de estudo: progresso parcial (99/100 horas)", async (t) => {
  const subjectsProgress = [subjectEntry({ totalMinutes: 99 * 60 })];
  const { mod } = await loadAchievementService(t, { subjectsProgress });

  const achievement = await mod.getAchievement("study-time");
  assert.strictEqual(achievement.current, 99);
  assert.strictEqual(achievement.completed, false);
  assert.strictEqual(achievement.progress, 0.99);
});

// ── sessões concluídas ───────────────────────────────────────────────────

test("sessões concluídas: conta apenas sessões finalizadas", async (t) => {
  const sessions = [
    session({ id: "s1", status: "finished" }),
    session({ id: "s2", status: "cancelled" }),
    session({ id: "s3", status: "paused" }),
    session({ id: "s4", status: "running" }),
  ];
  const { mod } = await loadAchievementService(t, { sessions });

  const progress = await mod.getAchievementProgress("sessions-completed");
  assert.strictEqual(progress.current, 1);
  assert.strictEqual(progress.target, 30);
  assert.strictEqual(progress.completed, false);
});

// ── questões resolvidas ──────────────────────────────────────────────────

test("questões resolvidas: conta o total de questões registradas", async (t) => {
  const questions = Array.from({ length: 400 }, (_, i) => ({ id: `q${i}` }));
  const { mod } = await loadAchievementService(t, { questions });

  const achievement = await mod.getAchievement("questions-solved");
  assert.strictEqual(achievement.current, 400);
  assert.strictEqual(achievement.target, 1000);
  assert.strictEqual(achievement.completed, false);
  assert.strictEqual(achievement.progress, 0.4);
});

// ── constância ───────────────────────────────────────────────────────────

test("constância: usa a sequência atual de studyStreakService", async (t) => {
  const streakSummary = { currentStreak: 7, longestStreak: 10, totalStudyDays: 20, lastStudyDay: "2026-07-01", daysSinceLastStudy: 0 };
  const { mod } = await loadAchievementService(t, { streakSummary });

  const achievement = await mod.getAchievement("study-streak");
  assert.strictEqual(achievement.current, 7);
  assert.strictEqual(achievement.target, 10);
  assert.strictEqual(achievement.completed, false);
});

test("constância: sequência que atinge a meta é marcada como concluída", async (t) => {
  const streakSummary = { currentStreak: 10, longestStreak: 10, totalStudyDays: 10, lastStudyDay: "2026-07-01", daysSinceLastStudy: 0 };
  const { mod } = await loadAchievementService(t, { streakSummary });

  const achievement = await mod.getAchievement("study-streak");
  assert.strictEqual(achievement.completed, true);
  assert.strictEqual(achievement.progress, 1);
});

// ── matérias estudadas ───────────────────────────────────────────────────

test("matérias estudadas: conta apenas matérias nomeadas com atividade", async (t) => {
  const subjectsProgress = [
    subjectEntry({ subject: "Cardiologia", status: "com_atividade" }),
    subjectEntry({ subject: "Nefrologia", status: "em_andamento" }),
    subjectEntry({ subject: "Pneumologia", status: "sem_atividade" }),
    subjectEntry({ subject: null, status: "com_atividade" }),
  ];
  const { mod } = await loadAchievementService(t, { subjectsProgress });

  const achievement = await mod.getAchievement("subjects-studied");
  assert.strictEqual(achievement.current, 2);
  assert.strictEqual(achievement.target, 12);
});

// ── conclusão ────────────────────────────────────────────────────────────

test("conquista é marcada como concluída quando current atinge o target", async (t) => {
  const questions = Array.from({ length: 1000 }, (_, i) => ({ id: `q${i}` }));
  const { mod } = await loadAchievementService(t, { questions });

  const achievement = await mod.getAchievement("questions-solved");
  assert.strictEqual(achievement.completed, true);
  assert.strictEqual(achievement.progress, 1);
});

test("conquista permanece concluída mesmo quando current ultrapassa o target (progress não passa de 1)", async (t) => {
  const questions = Array.from({ length: 1500 }, (_, i) => ({ id: `q${i}` }));
  const { mod } = await loadAchievementService(t, { questions });

  const achievement = await mod.getAchievement("questions-solved");
  assert.strictEqual(achievement.current, 1500);
  assert.strictEqual(achievement.completed, true);
  assert.strictEqual(achievement.progress, 1);
});

// ── progresso parcial / estrutura ────────────────────────────────────────

test("cada conquista possui a estrutura consistente esperada", async (t) => {
  const { mod } = await loadAchievementService(t, {});
  const achievements = await mod.listAchievements();

  for (const achievement of achievements) {
    assert.ok(typeof achievement.id === "string");
    assert.ok(typeof achievement.title === "string");
    assert.ok(typeof achievement.description === "string");
    assert.ok(typeof achievement.category === "string");
    assert.ok(typeof achievement.current === "number");
    assert.ok(typeof achievement.target === "number");
    assert.ok(typeof achievement.completed === "boolean");
    assert.ok(typeof achievement.progress === "number");
    assert.ok(typeof achievement.icon === "string");
  }
});

// ── getAchievement / getAchievementProgress com id inexistente ──────────

test("getAchievement retorna null para id inexistente", async (t) => {
  const { mod } = await loadAchievementService(t, {});
  assert.strictEqual(await mod.getAchievement("id-que-nao-existe"), null);
});

test("getAchievementProgress retorna null para id inexistente", async (t) => {
  const { mod } = await loadAchievementService(t, {});
  assert.strictEqual(await mod.getAchievementProgress("id-que-nao-existe"), null);
});

// ── isolamento ───────────────────────────────────────────────────────────

test("isolamento por usuário é herdado das fontes de dados — nenhuma filtragem própria é adicionada", async (t) => {
  const { mod, calls } = await loadAchievementService(t, {});

  await mod.listAchievements();

  assert.ok(calls.some((c) => c.fn === "getStreakSummary"));
  assert.ok(calls.some((c) => c.fn === "getActivitySessions"));
  assert.ok(calls.some((c) => c.fn === "getQuestions"));
  assert.ok(calls.some((c) => c.fn === "listSubjectsProgress"));
});

// ── resumo consolidado ───────────────────────────────────────────────────

test("getAchievementSummary consolida total, concluídas e progresso geral", async (t) => {
  const questions = Array.from({ length: 1000 }, (_, i) => ({ id: `q${i}` }));
  const streakSummary = { currentStreak: 10, longestStreak: 10, totalStudyDays: 10, lastStudyDay: "2026-07-01", daysSinceLastStudy: 0 };
  const { mod } = await loadAchievementService(t, { questions, streakSummary });

  const summary = await mod.getAchievementSummary();
  assert.strictEqual(summary.total, 5);
  assert.strictEqual(summary.completed, 2); // questions-solved e study-streak
  assert.strictEqual(summary.inProgress, 3);
  assert.ok(summary.overallProgress > 0 && summary.overallProgress < 1);
});
