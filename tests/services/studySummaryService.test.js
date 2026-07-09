/**
 * Tests for studySummaryService.js — Síntese Periódica de Aprendizado (F8.6).
 * Módulo puro, sem I/O: nenhum mock necessário — mesmo padrão de
 * studyTimelineService.test.js, que também testa agregação isolada da busca
 * de dados.
 */
import { test } from "node:test";
import assert from "node:assert";
import { buildWeeklySummary, buildMonthlySummary } from "../../studySummaryService.js";

function entry({
  minutes = 30,
  notes = null,
  subject = null,
  title = null,
  questions = [],
  reviews = [],
  reflection = null,
} = {}) {
  return {
    session: { duration_minutes: minutes, notes },
    meta: { subject, title },
    extras: { questions, reviews, reflection },
  };
}

function question(topic) {
  return { topic };
}

// ── Agregação: campos numéricos ──────────────────────────────────────────

test("buildWeeklySummary sums tempo, sessões, questões e revisões", () => {
  const entries = [
    entry({ minutes: 90, questions: [question("Sepse"), question("Sepse")], reviews: [{}] }),
    entry({ minutes: 30, questions: [question("Choque")], reviews: [{}, {}] }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.strictEqual(summary.totalMinutes, 120);
  assert.strictEqual(summary.sessionsCount, 2);
  assert.strictEqual(summary.questionsCount, 3);
  assert.strictEqual(summary.reviewsCount, 3);
  assert.strictEqual(summary.averageMinutes, 60);
});

test("buildWeeklySummary of an empty period returns all zeros/nulls", () => {
  const summary = buildWeeklySummary([]);

  assert.strictEqual(summary.totalMinutes, 0);
  assert.strictEqual(summary.sessionsCount, 0);
  assert.strictEqual(summary.questionsCount, 0);
  assert.strictEqual(summary.reviewsCount, 0);
  assert.deepStrictEqual(summary.subjects, []);
  assert.strictEqual(summary.topSubject, null);
  assert.deepStrictEqual(summary.topContents, []);
  assert.strictEqual(summary.reflectionsCount, 0);
  assert.strictEqual(summary.observationsCount, 0);
  assert.strictEqual(summary.biggestSession, null);
  assert.strictEqual(summary.smallestSession, null);
  assert.strictEqual(summary.averageMinutes, 0);
});

// ── Matérias e conteúdos ─────────────────────────────────────────────────

test("buildWeeklySummary deduplicates and sorts matérias (pt-BR), ignoring null", () => {
  const entries = [
    entry({ subject: "Ética" }),
    entry({ subject: "Anatomia" }),
    entry({ subject: "Ética" }),
    entry({ subject: null }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.deepStrictEqual(summary.subjects, ["Anatomia", "Ética"]);
});

test("buildWeeklySummary picks topSubject by total minutes dedicated, tie-broken alphabetically", () => {
  const entries = [
    entry({ subject: "Processo Civil", minutes: 120 }),
    entry({ subject: "Penal", minutes: 40 }),
    entry({ subject: "Processo Civil", minutes: 18 }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.strictEqual(summary.topSubject, "Processo Civil");
});

test("buildWeeklySummary breaks a topSubject tie alphabetically (pt-BR)", () => {
  const entries = [
    entry({ subject: "Farmaco", minutes: 60 }),
    entry({ subject: "Anatomia", minutes: 60 }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.strictEqual(summary.topSubject, "Anatomia");
});

test("buildWeeklySummary ranks topContents by question topic frequency, ties alphabetical", () => {
  const entries = [
    entry({ questions: [question("Sepse"), question("Sepse"), question("Choque")] }),
    entry({ questions: [question("Choque"), question("Arritmia")] }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.deepStrictEqual(summary.topContents, [
    { content: "Choque", count: 2 },
    { content: "Sepse", count: 2 },
    { content: "Arritmia", count: 1 },
  ]);
});

// ── Reflexões e observações ──────────────────────────────────────────────

test("buildWeeklySummary counts sessions with a reflection and sessions with non-empty notes", () => {
  const entries = [
    entry({ reflection: { content: "Aprendi bastante" }, notes: "Estudei com foco" }),
    entry({ reflection: null, notes: "   " }),
    entry({ reflection: { content: "Preciso revisar" }, notes: null }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.strictEqual(summary.reflectionsCount, 2);
  assert.strictEqual(summary.observationsCount, 1);
});

// ── Maior/menor sessão ───────────────────────────────────────────────────

test("buildWeeklySummary finds the biggest and smallest session by net duration", () => {
  const entries = [
    entry({ minutes: 45, subject: "Cardio" }),
    entry({ minutes: 138, subject: "Processo Civil" }),
    entry({ minutes: 20, subject: "Ética" }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.strictEqual(summary.biggestSession.minutes, 138);
  assert.strictEqual(summary.biggestSession.subject, "Processo Civil");
  assert.strictEqual(summary.smallestSession.minutes, 20);
  assert.strictEqual(summary.smallestSession.subject, "Ética");
});

// ── Texto derivado ────────────────────────────────────────────────────────

test("buildWeeklySummary generates fully derived narrative text with all key figures", () => {
  const entries = [
    entry({ minutes: 138, subject: "Processo Civil", questions: [question("Recurso")], reflection: { content: "x" } }),
    entry({ minutes: 30, subject: "Penal", questions: [question("Prescrição")], reviews: [{}] }),
  ];

  const summary = buildWeeklySummary(entries);

  assert.match(summary.text, /Nesta semana você realizou 2 sessões/);
  assert.match(summary.text, /estudou durante 2h48/);
  assert.match(summary.text, /resolveu 2 questões/);
  assert.match(summary.text, /revisou 1 conteúdo /);
  assert.match(summary.text, /estudou 2 matérias diferentes/);
  assert.match(summary.text, /Sua maior dedicação foi em Processo Civil\./);
  assert.match(summary.text, /A sessão mais longa teve 2h18\./);
  assert.match(summary.text, /Foram registradas 1 reflexão pessoal e 0 observações\./);
});

test("buildWeeklySummary text handles an empty period without other paragraphs", () => {
  const summary = buildWeeklySummary([]);
  assert.strictEqual(summary.text, "Nesta semana você ainda não registrou nenhuma sessão de estudo.");
});

test("buildWeeklySummary text uses singular forms for a single session/question/review/matéria", () => {
  const summary = buildWeeklySummary([
    entry({ minutes: 42, subject: "Cardio", questions: [question("Sepse")], reviews: [{}] }),
  ]);

  assert.match(summary.text, /realizou 1 sessão,/);
  assert.match(summary.text, /resolveu 1 questão,/);
  assert.match(summary.text, /revisou 1 conteúdo /);
  assert.match(summary.text, /estudou 1 matéria diferente\./);
});

test("buildWeeklySummary text omits topSubject/topContents/biggestSession paragraphs when there is no data for them", () => {
  const summary = buildWeeklySummary([entry({ minutes: 20 })]); // sem matéria, sem questões

  assert.doesNotMatch(summary.text, /Sua maior dedicação/);
  assert.doesNotMatch(summary.text, /conteúdos mais frequentes/);
  assert.match(summary.text, /A sessão mais longa teve 20min\./);
});

// ── buildMonthlySummary ───────────────────────────────────────────────────

test("buildMonthlySummary aggregates the same way as buildWeeklySummary but with 'mês' phrasing", () => {
  const entries = [entry({ minutes: 60, subject: "Cardio", questions: [question("Sepse")] })];

  const weekly = buildWeeklySummary(entries);
  const monthly = buildMonthlySummary(entries);

  assert.strictEqual(monthly.totalMinutes, weekly.totalMinutes);
  assert.strictEqual(monthly.sessionsCount, weekly.sessionsCount);
  assert.strictEqual(monthly.topSubject, weekly.topSubject);
  assert.match(monthly.text, /^Neste mês você realizou 1 sessão/);
});

test("buildMonthlySummary of an empty period returns the 'mês' phrasing", () => {
  const summary = buildMonthlySummary([]);
  assert.strictEqual(summary.text, "Neste mês você ainda não registrou nenhuma sessão de estudo.");
});
