/**
 * Tests for categoryService.js — CRUD + duplicate-name / in-use guards.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

function loadCategoryService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  return import(`../../categoryService.js?t=${Math.random()}`).then(mod => ({ mod, supabase }));
}

test("createCategory() trims the name and returns the created row", async (t) => {
  const created = { id: "cat-1", name: "Estudo", color: "#f59e0b" };
  const { mod, supabase } = await loadCategoryService(t, {
    categories: { data: created, error: null },
  });

  const result = await mod.createCategory("  Estudo  ", "#f59e0b");

  assert.deepStrictEqual(result, created);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall.args[0].name, "Estudo");
});

test("createCategory() maps a unique-constraint violation to a friendly message", async (t) => {
  const { mod } = await loadCategoryService(t, {
    categories: { data: null, error: { code: "23505", message: "duplicate key" } },
  });

  await assert.rejects(
    () => mod.createCategory("Aula", "#3b82f6"),
    (err) => err.message === 'Já existe uma categoria com esse nome.'
  );
});

test("updateCategory() propagates a name change to events using the old category name", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: { name: "Aula" }, error: null },               // previous-name lookup
      { data: { id: "cat-1", name: "Aulas" }, error: null },  // update result
    ],
    events: { data: null, error: null },                      // rename-sync update
  });

  const result = await mod.updateCategory("cat-1", "Aulas", "#3b82f6");

  assert.strictEqual(result.name, "Aulas");
  const eventsUpdateCall = supabase._calls.find(c => c.table === "events" && c.method === "update");
  assert.deepStrictEqual(eventsUpdateCall.args[0], { category: "Aulas" });
});

test("updateCategory() skips the events sync when the name did not change", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: { name: "Aula" }, error: null },
      { data: { id: "cat-1", name: "Aula" }, error: null },
    ],
  });

  await mod.updateCategory("cat-1", "Aula", "#000000");

  const eventsUpdateCall = supabase._calls.find(c => c.table === "events");
  assert.strictEqual(eventsUpdateCall, undefined);
});

test("deleteCategory() blocks deletion when events still use the category", async (t) => {
  const { mod } = await loadCategoryService(t, {
    categories: { data: { name: "Prova" }, error: null },
    events: { count: 3, error: null },
  });

  await assert.rejects(
    () => mod.deleteCategory("cat-1"),
    (err) => /3 compromisso/.test(err.message)
  );
});

test("deleteCategory() succeeds when no events reference the category", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: { data: { name: "Prova" }, error: null },
    events: { count: 0, error: null },
  });

  await mod.deleteCategory("cat-1");

  const deleteCall = supabase._calls.find(c => c.table === "categories" && c.method === "delete");
  assert.ok(deleteCall, "expected a delete() call on categories");
});

test("ensureDefaultCategories() creates the default set only when the user has none", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: [], error: null },                       // first getCategories() call: empty
      { data: [{ id: "c1", name: "Aula" }], error: null }, // insert-of-defaults result
    ],
  });

  const result = await mod.ensureDefaultCategories();

  assert.deepStrictEqual(result, [{ id: "c1", name: "Aula" }]);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.ok(Array.isArray(insertCall.args[0]) && insertCall.args[0].length === 8);
});

test("ensureDefaultCategories() does not insert anything when categories already exist", async (t) => {
  const existing = [{ id: "c1", name: "Aula" }];
  const { mod, supabase } = await loadCategoryService(t, {
    categories: { data: existing, error: null },
  });

  const result = await mod.ensureDefaultCategories();

  assert.deepStrictEqual(result, existing);
  const insertCall = supabase._calls.find(c => c.method === "insert");
  assert.strictEqual(insertCall, undefined);
});
