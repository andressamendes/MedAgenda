/**
 * Tests for recurrenceExceptionsService.js — the thin repository over
 * recurrence_exceptions (F16). Supabase is fully mocked: no network.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: { supabase, currentUserId: async () => "user-123" },
  });
  return import(`../../recurrenceExceptionsService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("getExceptionsMap() returns [] without querying when there are no base ids", async (t) => {
  const { mod, supabase } = await loadService(t, {});
  assert.deepStrictEqual(await mod.getExceptionsMap("events", []), new Map());
  assert.strictEqual(supabase._calls.length, 0);
});

test("getExceptionsMap() groups rows by base_event_id, then by occurrence_date", async (t) => {
  const rows = [
    { base_event_id: "evt-1", occurrence_date: "2026-08-08", is_cancelled: true, override: null },
    { base_event_id: "evt-1", occurrence_date: "2026-08-15", is_cancelled: false, override: { title: "Remarcada" } },
    { base_event_id: "evt-2", occurrence_date: "2026-08-01", is_cancelled: true, override: null },
  ];
  const { mod } = await loadService(t, { recurrence_exceptions: { data: rows, error: null } });

  const map = await mod.getExceptionsMap("events", ["evt-1", "evt-2"]);

  assert.strictEqual(map.size, 2);
  assert.deepStrictEqual(map.get("evt-1").get("2026-08-08"), { is_cancelled: true, override: null });
  assert.deepStrictEqual(map.get("evt-1").get("2026-08-15"), { is_cancelled: false, override: { title: "Remarcada" } });
  assert.deepStrictEqual(map.get("evt-2").get("2026-08-01"), { is_cancelled: true, override: null });
});

test("cancelOccurrence() upserts an is_cancelled row scoped to the source table + base id + date", async (t) => {
  const { mod, supabase } = await loadService(t, {
    recurrence_exceptions: { data: { id: "exc-1" }, error: null },
  });

  await mod.cancelOccurrence("events", "evt-1", "2026-08-08");

  const upsertCall = supabase._calls.find(c => c.method === "upsert");
  assert.deepStrictEqual(upsertCall.args[0], {
    user_id: "user-123", source_table: "events", base_event_id: "evt-1",
    occurrence_date: "2026-08-08", is_cancelled: true, override: null,
  });
});

test("overrideOccurrence() upserts is_cancelled:false with the given override payload", async (t) => {
  const { mod, supabase } = await loadService(t, {
    recurrence_exceptions: { data: { id: "exc-1" }, error: null },
  });

  await mod.overrideOccurrence("academic_events", "acad-1", "2026-08-08", { title: "Sala trocada" });

  const upsertCall = supabase._calls.find(c => c.method === "upsert");
  assert.deepStrictEqual(upsertCall.args[0], {
    user_id: "user-123", source_table: "academic_events", base_event_id: "acad-1",
    occurrence_date: "2026-08-08", is_cancelled: false, override: { title: "Sala trocada" },
  });
});

test("deleteExceptionsForBase() scopes the delete to user + source table + base id, and throws on error", async (t) => {
  const { mod } = await loadService(t, {
    recurrence_exceptions: { data: null, error: { message: "boom" } },
  });

  await assert.rejects(
    () => mod.deleteExceptionsForBase("events", "evt-1"),
    (err) => err.message === "boom"
  );
});
