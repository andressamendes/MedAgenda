/**
 * Tests for reviewService.js — CRUD + geração manual, contra Supabase mockado.
 * Supabase é totalmente mockado: sem rede, sem projeto real.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadReviewService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../reviewService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

const EXISTING_EVENT = { id: "event-1", title: "Farmaco", user_id: "user-123" };

test("create() valida event_id e scheduled_date antes de consultar o banco", async (t) => {
  const { mod } = await loadReviewService(t, {});

  await assert.rejects(
    () => mod.create({ scheduled_date: "2026-07-06" }),
    (err) => err.code === "EVENT_ID_REQUIRED"
  );
  await assert.rejects(
    () => mod.create({ event_id: "event-1" }),
    (err) => err.code === "SCHEDULED_DATE_REQUIRED"
  );
});

test("create() rejeita quando o compromisso original não existe", async (t) => {
  const { mod } = await loadReviewService(t, {
    events: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.create({ event_id: "event-missing", scheduled_date: "2026-07-06" }),
    (err) => err.code === "EVENT_NOT_FOUND"
  );
});

test("create() insere uma revisão pendente vinculada ao usuário atual", async (t) => {
  const created = {
    id: "rev-1", event_id: "event-1", scheduled_date: "2026-07-06",
    status: "pending", review_type: "manual", origin: "user", user_id: "user-123",
  };
  const { mod, supabase } = await loadReviewService(t, {
    events:  { data: EXISTING_EVENT, error: null },
    reviews: { data: created, error: null },
  });

  const result = await mod.create({ event_id: "event-1", scheduled_date: "2026-07-06" });

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.table === "reviews" && c.method === "insert");
  assert.strictEqual(insertCall.args[0].user_id, "user-123");
  assert.strictEqual(insertCall.args[0].status, "pending");
  assert.strictEqual(insertCall.args[0].review_type, "manual");
  assert.strictEqual(insertCall.args[0].origin, "user");
});

test("create() propaga erro do Supabase", async (t) => {
  const { mod } = await loadReviewService(t, {
    events:  { data: EXISTING_EVENT, error: null },
    reviews: { data: null, error: { message: "insert failed" } },
  });

  await assert.rejects(
    () => mod.create({ event_id: "event-1", scheduled_date: "2026-07-06" }),
    (err) => err.message === "insert failed"
  );
});

test("getById() escopa a busca por id + user_id", async (t) => {
  const row = { id: "rev-1", status: "pending" };
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: row, error: null },
  });

  const result = await mod.getById("rev-1");

  assert.deepStrictEqual(result, row);
  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["id", "rev-1"], ["user_id", "user-123"]]);
});

test("getById() retorna null quando não há revisão, sem lançar erro", async (t) => {
  const { mod } = await loadReviewService(t, {
    reviews: { data: null, error: null },
  });

  const result = await mod.getById("rev-missing");
  assert.strictEqual(result, null);
});

test("list() filtra por usuário + evento e ordena por data prevista", async (t) => {
  const rows = [{ id: "rev-1" }, { id: "rev-2" }];
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: rows, error: null },
  });

  const result = await mod.list("event-1");

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["event_id", "event-1"]]);
  const orderCall = supabase._calls.find(c => c.table === "reviews" && c.method === "order");
  assert.deepStrictEqual(orderCall.args, ["scheduled_date", { ascending: true }]);
});

test("listPending() filtra apenas status pending, globalmente", async (t) => {
  const rows = [{ id: "rev-1", status: "pending" }];
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: rows, error: null },
  });

  const result = await mod.listPending();

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["status", "pending"]]);
});

test("listPending(eventId) também filtra por evento", async (t) => {
  const rows = [{ id: "rev-1", status: "pending", event_id: "event-1" }];
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: rows, error: null },
  });

  await mod.listPending("event-1");

  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["status", "pending"], ["event_id", "event-1"]]);
});

test("listCompleted() filtra apenas status completed, globalmente", async (t) => {
  const rows = [{ id: "rev-1", status: "completed" }];
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: rows, error: null },
  });

  const result = await mod.listCompleted();

  assert.deepStrictEqual(result, rows);
  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["status", "completed"]]);
});

test("listCompleted(eventId) também filtra por evento", async (t) => {
  const rows = [{ id: "rev-1", status: "completed", event_id: "event-1" }];
  const { mod, supabase } = await loadReviewService(t, {
    reviews: { data: rows, error: null },
  });

  await mod.listCompleted("event-1");

  const eqCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "eq").map(c => c.args);
  assert.deepStrictEqual(eqCalls, [["user_id", "user-123"], ["status", "completed"], ["event_id", "event-1"]]);
});

test("complete() marca a revisão como concluída com completed_at", async (t) => {
  const pending   = { id: "rev-1", status: "pending" };
  const completed = { id: "rev-1", status: "completed", completed_at: "2026-07-05T10:00:00.000Z" };
  const { mod, supabase } = await loadReviewService(t, {
    reviews: [
      { data: pending, error: null },   // getById() dentro de _updateStatus
      { data: completed, error: null }, // update()
    ],
  });

  const result = await mod.complete("rev-1", new Date("2026-07-05T10:00:00.000Z"));

  assert.deepStrictEqual(result, completed);
  const updateCall = supabase._calls.find(c => c.table === "reviews" && c.method === "update");
  assert.strictEqual(updateCall.args[0].status, "completed");
  assert.strictEqual(updateCall.args[0].completed_at, "2026-07-05T10:00:00.000Z");
});

test("complete() rejeita quando a revisão não existe", async (t) => {
  const { mod } = await loadReviewService(t, {
    reviews: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.complete("rev-missing"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
});

test("complete() rejeita revisão já encerrada", async (t) => {
  const { mod } = await loadReviewService(t, {
    reviews: { data: { id: "rev-1", status: "completed" }, error: null },
  });

  await assert.rejects(
    () => mod.complete("rev-1"),
    (err) => err.code === "REVIEW_ALREADY_ENDED"
  );
});

test("skip() marca a revisão como skipped", async (t) => {
  const pending = { id: "rev-1", status: "pending" };
  const skipped = { id: "rev-1", status: "skipped" };
  const { mod, supabase } = await loadReviewService(t, {
    reviews: [
      { data: pending, error: null },
      { data: skipped, error: null },
    ],
  });

  const result = await mod.skip("rev-1");

  assert.deepStrictEqual(result, skipped);
  const updateCall = supabase._calls.find(c => c.table === "reviews" && c.method === "update");
  assert.deepStrictEqual(updateCall.args[0], { status: "skipped" });
});

test("skip() rejeita quando a revisão não existe", async (t) => {
  const { mod } = await loadReviewService(t, {
    reviews: { data: null, error: null },
  });

  await assert.rejects(
    () => mod.skip("rev-missing"),
    (err) => err.code === "REVIEW_NOT_FOUND"
  );
});

// ── onReviewStatusChanged() — notificação (F2.4) ────────────────────────────

test("onReviewStatusChanged() é notificado com a revisão já atualizada quando complete() é chamado", async (t) => {
  const pending   = { id: "rev-1", status: "pending" };
  const completed = { id: "rev-1", status: "completed", completed_at: "2026-07-05T10:00:00.000Z" };
  const { mod } = await loadReviewService(t, {
    reviews: [
      { data: pending, error: null },
      { data: completed, error: null },
    ],
  });

  const received = [];
  mod.onReviewStatusChanged((review) => received.push(review));
  await mod.complete("rev-1", new Date("2026-07-05T10:00:00.000Z"));

  assert.deepStrictEqual(received, [completed]);
});

test("onReviewStatusChanged() é notificado quando skip() é chamado", async (t) => {
  const pending = { id: "rev-1", status: "pending" };
  const skipped = { id: "rev-1", status: "skipped" };
  const { mod } = await loadReviewService(t, {
    reviews: [
      { data: pending, error: null },
      { data: skipped, error: null },
    ],
  });

  const received = [];
  mod.onReviewStatusChanged((review) => received.push(review));
  await mod.skip("rev-1");

  assert.deepStrictEqual(received, [skipped]);
});

test("a função retornada por onReviewStatusChanged() cancela a assinatura", async (t) => {
  const pending   = { id: "rev-1", status: "pending" };
  const completed = { id: "rev-1", status: "completed", completed_at: "2026-07-05T10:00:00.000Z" };
  const { mod } = await loadReviewService(t, {
    reviews: [
      { data: pending, error: null },
      { data: completed, error: null },
    ],
  });

  let calls = 0;
  const unsubscribe = mod.onReviewStatusChanged(() => calls++);
  unsubscribe();
  await mod.complete("rev-1", new Date("2026-07-05T10:00:00.000Z"));

  assert.strictEqual(calls, 0);
});

test("generateForEvent() cria revisões em +1, +7 e +30 dias por padrão", async (t) => {
  const { mod, supabase } = await loadReviewService(t, {
    events:  { data: EXISTING_EVENT, error: null },
    reviews: { data: { id: "rev-x" }, error: null },
  });

  const result = await mod.generateForEvent("event-1", "2026-07-05");

  assert.strictEqual(result.length, 3);
  const insertCalls = supabase._calls.filter(c => c.table === "reviews" && c.method === "insert");
  const dates = insertCalls.map(c => c.args[0].scheduled_date);
  assert.deepStrictEqual(dates, ["2026-07-06", "2026-07-12", "2026-08-04"]);
  insertCalls.forEach(c => {
    assert.strictEqual(c.args[0].origin, "event");
    assert.strictEqual(c.args[0].review_type, "manual");
  });
});

test("generateForEvent() aceita deslocamentos customizados", async (t) => {
  const { mod, supabase } = await loadReviewService(t, {
    events:  { data: EXISTING_EVENT, error: null },
    reviews: { data: { id: "rev-x" }, error: null },
  });

  const result = await mod.generateForEvent("event-1", "2026-07-05", [3]);

  assert.strictEqual(result.length, 1);
  const insertCall = supabase._calls.find(c => c.table === "reviews" && c.method === "insert");
  assert.strictEqual(insertCall.args[0].scheduled_date, "2026-07-08");
});

test("generateForEvent() exige eventId e baseDate", async (t) => {
  const { mod } = await loadReviewService(t, {});

  await assert.rejects(
    () => mod.generateForEvent(null, "2026-07-05"),
    (err) => err.code === "EVENT_ID_REQUIRED"
  );
  await assert.rejects(
    () => mod.generateForEvent("event-1", null),
    (err) => err.code === "BASE_DATE_REQUIRED"
  );
});
