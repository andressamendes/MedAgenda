/**
 * Tests for closeDayService.js — Fechar o dia (F14.8).
 *
 * Every dependency (activitySessionService, sessionQuestionsService,
 * studyStreakService, profileService) is mocked — same style as
 * tests/reflectionService.test.js. getDayRecap() is exercised for the
 * aggregation (minutes/sessions/questions/streak, only "finished" sessions
 * counting); getNextStudyPlan()/setNextStudyPlan()/clearNextStudyPlan() for
 * the profiles round-trip (sql/22_next_study_plan.sql).
 */
import { test } from "node:test";
import assert from "node:assert";

const SESSION_SPECIFIER   = new URL("../activitySessionService.js", import.meta.url).href;
const QUESTIONS_SPECIFIER = new URL("../sessionQuestionsService.js", import.meta.url).href;
const STREAK_SPECIFIER    = new URL("../studyStreakService.js", import.meta.url).href;
const PROFILE_SPECIFIER   = new URL("../profileService.js", import.meta.url).href;

const NOW = new Date("2026-07-19T20:00:00.000Z"); // um domingo

function loadCloseDayService(t, overrides = {}) {
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: { listByDateRange: overrides.listByDateRange ?? (async () => []) },
  });
  t.mock.module(QUESTIONS_SPECIFIER, {
    namedExports: {
      listQuestionsBySessions: overrides.listQuestionsBySessions ?? (async () => ({})),
    },
  });
  t.mock.module(STREAK_SPECIFIER, {
    namedExports: {
      getStreakSummary: overrides.getStreakSummary ?? (async () => ({ currentStreak: 0 })),
    },
  });
  const upsertProfileCalls = [];
  t.mock.module(PROFILE_SPECIFIER, {
    namedExports: {
      getProfile: overrides.getProfile ?? (async () => null),
      upsertProfile: overrides.upsertProfile ?? (async (fields) => {
        upsertProfileCalls.push(fields);
        return { id: "user-1", ...fields };
      }),
    },
  });

  return import(`../closeDayService.js?t=${Math.random()}`)
    .then(mod => ({ mod, upsertProfileCalls }));
}

// ── getDayRecap() ────────────────────────────────────────────────────────

test("getDayRecap() sums minutes/sessions and counts questions across only finished sessions", async (t) => {
  const finished1 = { id: "s1", status: "finished", duration_minutes: 40 };
  const finished2 = { id: "s2", status: "finished", duration_minutes: 20 };
  const cancelled = { id: "s3", status: "cancelled", duration_minutes: 999 };

  const { mod } = await loadCloseDayService(t, {
    listByDateRange: async () => [finished1, finished2, cancelled],
    listQuestionsBySessions: async (ids) => {
      assert.deepStrictEqual([...ids].sort(), ["s1", "s2"]);
      return { s1: [{ id: "q1" }, { id: "q2" }], s2: [{ id: "q3" }] };
    },
    getStreakSummary: async () => ({ currentStreak: 4 }),
  });

  const recap = await mod.getDayRecap(NOW);

  assert.strictEqual(recap.minutes, 60);
  assert.strictEqual(recap.sessionsCount, 2);
  assert.strictEqual(recap.questionsCount, 3);
  assert.strictEqual(recap.currentStreak, 4);
});

test("getDayRecap() with no sessions today never calls listQuestionsBySessions and returns all zeros", async (t) => {
  let questionsCalled = false;
  const { mod } = await loadCloseDayService(t, {
    listByDateRange: async () => [],
    listQuestionsBySessions: async () => { questionsCalled = true; return {}; },
    getStreakSummary: async () => ({ currentStreak: 0 }),
  });

  const recap = await mod.getDayRecap(NOW);

  assert.strictEqual(recap.minutes, 0);
  assert.strictEqual(recap.sessionsCount, 0);
  assert.strictEqual(recap.questionsCount, 0);
  assert.strictEqual(recap.currentStreak, 0);
  assert.strictEqual(questionsCalled, false);
});

// ── getNextStudyPlan() ───────────────────────────────────────────────────

test("getNextStudyPlan() returns null when the profile has no plan saved", async (t) => {
  const { mod } = await loadCloseDayService(t, {
    getProfile: async () => ({ id: "user-1", next_study_title: null, next_study_category_id: null }),
  });

  assert.strictEqual(await mod.getNextStudyPlan(), null);
});

test("getNextStudyPlan() returns the saved title and category", async (t) => {
  const { mod } = await loadCloseDayService(t, {
    getProfile: async () => ({ id: "user-1", next_study_title: "Cardiologia", next_study_category_id: "cat-1" }),
  });

  assert.deepStrictEqual(await mod.getNextStudyPlan(), { title: "Cardiologia", category_id: "cat-1" });
});

// ── setNextStudyPlan() / clearNextStudyPlan() ───────────────────────────

test("setNextStudyPlan() trims the title and persists it via upsertProfile", async (t) => {
  const { mod, upsertProfileCalls } = await loadCloseDayService(t);

  await mod.setNextStudyPlan({ title: "  Cardiologia  ", category_id: "cat-1" });

  assert.deepStrictEqual(upsertProfileCalls, [
    { next_study_title: "Cardiologia", next_study_category_id: "cat-1" },
  ]);
});

test("setNextStudyPlan() with a blank title clears both fields instead of saving an empty string", async (t) => {
  const { mod, upsertProfileCalls } = await loadCloseDayService(t);

  await mod.setNextStudyPlan({ title: "   ", category_id: "cat-1" });

  assert.deepStrictEqual(upsertProfileCalls, [
    { next_study_title: null, next_study_category_id: null },
  ]);
});

test("clearNextStudyPlan() nulls both fields", async (t) => {
  const { mod, upsertProfileCalls } = await loadCloseDayService(t);

  await mod.clearNextStudyPlan();

  assert.deepStrictEqual(upsertProfileCalls, [
    { next_study_title: null, next_study_category_id: null },
  ]);
});
