/**
 * Tests for studyStatisticsService.js — agregação de estatísticas de
 * questões (F17). getUserQuestionStatistics() é testada contra
 * supabase.rpc() mockado (createSupabaseMock); summarizeSessionQuestions()/
 * calculateAccuracyPercent()/accuracyIndicator() são funções puras.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadService(t, rpcResponses) {
  const supabase = createSupabaseMock({ rpcResponses });
  t.mock.module(SUPABASE_SPECIFIER, { namedExports: { supabase } });
  return import(`../../studyStatisticsService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("getUserQuestionStatistics() chama a RPC get_question_statistics e calcula o percentual de acerto", async (t) => {
  const { mod, supabase } = await loadService(t, {
    get_question_statistics: { data: [{ total: 20, correct: 15, incorrect: 5 }], error: null },
  });

  const result = await mod.getUserQuestionStatistics({});

  assert.deepStrictEqual(result, { total: 20, correct: 15, incorrect: 5, accuracyPercent: 75 });
  const call = supabase._calls.find(c => c.method === "rpc:get_question_statistics");
  assert.ok(call, "esperava uma chamada a supabase.rpc('get_question_statistics', ...)");
});

test("getUserQuestionStatistics() sem nenhuma questão retorna zeros, sem divisão por zero", async (t) => {
  const { mod } = await loadService(t, {
    get_question_statistics: { data: [{ total: 0, correct: 0, incorrect: 0 }], error: null },
  });

  const result = await mod.getUserQuestionStatistics({});
  assert.deepStrictEqual(result, { total: 0, correct: 0, incorrect: 0, accuracyPercent: 0 });
});

test("getUserQuestionStatistics() propaga erro do Supabase", async (t) => {
  const { mod } = await loadService(t, {
    get_question_statistics: { data: null, error: { message: "rpc failed" } },
  });

  await assert.rejects(
    () => mod.getUserQuestionStatistics({}),
    (err) => err.message === "rpc failed"
  );
});

test("getUserQuestionStatistics() period 'today' resolve p_start = p_end = hoje", async (t) => {
  const { mod, supabase } = await loadService(t, {
    get_question_statistics: { data: [{ total: 0, correct: 0, incorrect: 0 }], error: null },
  });

  await mod.getUserQuestionStatistics({ period: "today" });
  const call = supabase._calls.find(c => c.method === "rpc:get_question_statistics");
  const args = call.args[0];
  assert.strictEqual(args.p_start, args.p_end);
  assert.match(args.p_start, /^\d{4}-\d{2}-\d{2}$/);
});

test("getUserQuestionStatistics() period 'custom' usa startDate/endDate informados, sem recalcular", async (t) => {
  const { mod, supabase } = await loadService(t, {
    get_question_statistics: { data: [{ total: 0, correct: 0, incorrect: 0 }], error: null },
  });

  await mod.getUserQuestionStatistics({ period: "custom", startDate: "2026-01-01", endDate: "2026-01-15" });
  const call = supabase._calls.find(c => c.method === "rpc:get_question_statistics");
  assert.deepStrictEqual(
    { p_start: call.args[0].p_start, p_end: call.args[0].p_end },
    { p_start: "2026-01-01", p_end: "2026-01-15" }
  );
});

test("getUserQuestionStatistics() sem period (ou 'all') não filtra por data", async (t) => {
  const { mod, supabase } = await loadService(t, {
    get_question_statistics: { data: [{ total: 0, correct: 0, incorrect: 0 }], error: null },
  });

  await mod.getUserQuestionStatistics({});
  const call = supabase._calls.find(c => c.method === "rpc:get_question_statistics");
  assert.strictEqual(call.args[0].p_start, null);
  assert.strictEqual(call.args[0].p_end, null);
});

test("getUserQuestionStatistics() repassa categoryId e subject como p_category_id/p_subject", async (t) => {
  const { mod, supabase } = await loadService(t, {
    get_question_statistics: { data: [{ total: 0, correct: 0, incorrect: 0 }], error: null },
  });

  await mod.getUserQuestionStatistics({ categoryId: "cat-1", subject: "Cardiologia" });
  const call = supabase._calls.find(c => c.method === "rpc:get_question_statistics");
  assert.strictEqual(call.args[0].p_category_id, "cat-1");
  assert.strictEqual(call.args[0].p_subject, "Cardiologia");
});

test("summarizeSessionQuestions() soma correct_count/incorrect_count de uma lista já carregada", async (t) => {
  const { mod } = await loadService(t, {});
  const questions = [
    { correct_count: 5, incorrect_count: 1 },
    { correct_count: 3, incorrect_count: 2 },
  ];
  assert.deepStrictEqual(mod.summarizeSessionQuestions(questions), {
    total: 11, correct: 8, incorrect: 3, accuracyPercent: 73,
  });
});

test("summarizeSessionQuestions() trata lançamentos antigos (sem os campos) como zero", async (t) => {
  const { mod } = await loadService(t, {});
  const questions = [{ question_type: "multiple_choice", status: "answered" }];
  assert.deepStrictEqual(mod.summarizeSessionQuestions(questions), {
    total: 0, correct: 0, incorrect: 0, accuracyPercent: 0,
  });
});

test("summarizeSessionQuestions() sem nenhuma questão retorna zeros", async (t) => {
  const { mod } = await loadService(t, {});
  assert.deepStrictEqual(mod.summarizeSessionQuestions([]), {
    total: 0, correct: 0, incorrect: 0, accuracyPercent: 0,
  });
  assert.deepStrictEqual(mod.summarizeSessionQuestions(undefined), {
    total: 0, correct: 0, incorrect: 0, accuracyPercent: 0,
  });
});

test("accuracyIndicator() classifica 🟢 >= 70%, 🟡 50-69% e 🔴 < 50%", async (t) => {
  const { mod } = await loadService(t, {});
  assert.strictEqual(mod.accuracyIndicator(70).emoji, "🟢");
  assert.strictEqual(mod.accuracyIndicator(100).emoji, "🟢");
  assert.strictEqual(mod.accuracyIndicator(69).emoji, "🟡");
  assert.strictEqual(mod.accuracyIndicator(50).emoji, "🟡");
  assert.strictEqual(mod.accuracyIndicator(49).emoji, "🔴");
  assert.strictEqual(mod.accuracyIndicator(0).emoji, "🔴");
});
