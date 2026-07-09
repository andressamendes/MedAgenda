/**
 * Tests for studyTimelineService.js — Linha do Tempo da Evolução (F8.5).
 * Módulo puro, sem I/O: nenhum mock necessário — mesmo padrão de
 * activityDashboardService.test.js/computeDashboardIndicators(), que também
 * testa a função de agregação isoladamente da busca de dados.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  summarizeDayEntries,
  compareDailySummaries,
  weekKeyOf,
  weekLabel,
  summarizeWeekGroups,
} from "../../studyTimelineService.js";

function entry({ minutes = 30, questions = [], reviews = [], subject = null } = {}) {
  return {
    session: { duration_minutes: minutes },
    meta: { subject },
    extras: { questions, reviews },
  };
}

// ── summarizeDayEntries ──────────────────────────────────────────────────

test("summarizeDayEntries sums tempo líquido, sessões, questões e revisões", () => {
  const entries = [
    entry({ minutes: 45, questions: [{}, {}], reviews: [{}], subject: "Cardio" }),
    entry({ minutes: 30, questions: [{}], reviews: [], subject: "Farmaco" }),
  ];

  const summary = summarizeDayEntries(entries);

  assert.strictEqual(summary.totalMinutes, 75);
  assert.strictEqual(summary.sessionsCount, 2);
  assert.strictEqual(summary.questionsCount, 3);
  assert.strictEqual(summary.reviewsCount, 1);
  assert.deepStrictEqual(summary.subjects, ["Cardio", "Farmaco"]);
});

test("summarizeDayEntries deduplicates and sorts matérias (pt-BR), ignoring null", () => {
  const entries = [
    entry({ subject: "Ética" }),
    entry({ subject: "Anatomia" }),
    entry({ subject: "Ética" }),
    entry({ subject: null }),
  ];

  const summary = summarizeDayEntries(entries);

  assert.deepStrictEqual(summary.subjects, ["Anatomia", "Ética"]);
});

test("summarizeDayEntries of an empty group returns all zeros", () => {
  const summary = summarizeDayEntries([]);
  assert.deepStrictEqual(summary, {
    totalMinutes: 0,
    sessionsCount: 0,
    questionsCount: 0,
    reviewsCount: 0,
    subjects: [],
  });
});

// ── compareDailySummaries ────────────────────────────────────────────────

test("compareDailySummaries returns null when there is no previous day", () => {
  const today = summarizeDayEntries([entry({ minutes: 30 })]);
  assert.strictEqual(compareDailySummaries(today, null), null);
  assert.strictEqual(compareDailySummaries(today, undefined), null);
});

test("compareDailySummaries computes signed deltas relative to the previous day", () => {
  const previous = summarizeDayEntries([
    entry({ minutes: 60, questions: [{}, {}] }),
    entry({ minutes: 30, questions: [{}] }),
  ]); // 90min, 2 sessões, 3 questões
  const current = summarizeDayEntries([
    entry({ minutes: 55, questions: [{}] }),
  ]); // 55min, 1 sessão, 1 questão

  const cmp = compareDailySummaries(current, previous);

  assert.deepStrictEqual(cmp, { sessionsDelta: -1, minutesDelta: -35, questionsDelta: -2 });
});

test("compareDailySummaries returns zero deltas when nothing changed", () => {
  const a = summarizeDayEntries([entry({ minutes: 30, questions: [{}] })]);
  const b = summarizeDayEntries([entry({ minutes: 30, questions: [{}] })]);
  assert.deepStrictEqual(compareDailySummaries(a, b), { sessionsDelta: 0, minutesDelta: 0, questionsDelta: 0 });
});

// ── weekKeyOf / weekLabel ────────────────────────────────────────────────

test("weekKeyOf groups any day of the same Mon-Sun week under the same key", () => {
  const monday = weekKeyOf("2026-03-09T08:00:00.000Z"); // segunda-feira
  const wednesday = weekKeyOf("2026-03-11T20:00:00.000Z");
  const sunday = weekKeyOf("2026-03-15T23:00:00.000Z");
  assert.strictEqual(monday, "2026-03-09");
  assert.strictEqual(wednesday, "2026-03-09");
  assert.strictEqual(sunday, "2026-03-09");
});

test("weekKeyOf assigns the following Monday's week to a session on the next Monday", () => {
  assert.strictEqual(weekKeyOf("2026-03-16T08:00:00.000Z"), "2026-03-16");
});

test("weekLabel formats a human-readable Monday-Sunday range from the week key", () => {
  assert.strictEqual(weekLabel("2026-03-09"), "Semana de 09/03 a 15/03");
});

// ── summarizeWeekGroups ──────────────────────────────────────────────────

test("summarizeWeekGroups sums minutes/sessions/questions and counts distinct matérias across day groups", () => {
  const dayGroups = [
    { dayKey: "2026-03-10", summary: summarizeDayEntries([entry({ minutes: 60, questions: [{}], subject: "Cardio" })]) },
    { dayKey: "2026-03-11", summary: summarizeDayEntries([entry({ minutes: 30, questions: [{}, {}], subject: "Farmaco" }), entry({ minutes: 30, subject: "Cardio" })]) },
  ];

  const summary = summarizeWeekGroups(dayGroups);

  assert.strictEqual(summary.totalMinutes, 120);
  assert.strictEqual(summary.sessionsCount, 3);
  assert.strictEqual(summary.questionsCount, 3);
  assert.strictEqual(summary.subjectsCount, 2);
});

test("summarizeWeekGroups computes the longest run of consecutive studied days in the window", () => {
  const dayGroups = [
    { dayKey: "2026-03-09", summary: summarizeDayEntries([entry()]) },
    { dayKey: "2026-03-10", summary: summarizeDayEntries([entry()]) },
    { dayKey: "2026-03-11", summary: summarizeDayEntries([entry()]) },
    { dayKey: "2026-03-13", summary: summarizeDayEntries([entry()]) }, // pula 03-12: quebra a sequência
  ];

  const summary = summarizeWeekGroups(dayGroups);

  assert.strictEqual(summary.longestStreak, 3);
});

test("summarizeWeekGroups of an empty week returns zeros and no streak", () => {
  const summary = summarizeWeekGroups([]);
  assert.strictEqual(summary.totalMinutes, 0);
  assert.strictEqual(summary.sessionsCount, 0);
  assert.strictEqual(summary.questionsCount, 0);
  assert.strictEqual(summary.subjectsCount, 0);
  assert.strictEqual(summary.longestStreak, 0);
});
