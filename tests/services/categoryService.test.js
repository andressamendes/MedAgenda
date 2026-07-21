/**
 * Tests for categoryService.js — CRUD + duplicate-name / in-use guards.
 * Supabase is fully mocked: no network, no real project required.
 */
import { test } from "node:test";
import assert from "node:assert";
import { createSupabaseMock } from "../mocks/supabaseMock.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;
const EVENT_SERVICE_SPECIFIER = new URL("../../eventService.js", import.meta.url).href;

function loadCategoryService(t, tableResponses) {
  const supabase = createSupabaseMock({ tableResponses });
  const invalidateEventsCalls = [];
  t.mock.module(SUPABASE_SPECIFIER, {
    namedExports: {
      supabase,
      currentUserId: async () => "user-123",
    },
  });
  // F15.10 — categoryService importa invalidateEventsCache (rename de
  // categoria escreve em events.category por fora de eventService); mockado
  // como espião para as assertivas de invalidação cruzada.
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { invalidateEventsCache: () => { invalidateEventsCalls.push(1); } },
  });
  return import(`../../categoryService.js?t=${Math.random()}`)
    .then(mod => ({ mod, supabase, invalidateEventsCalls }));
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

// ── F15.10 — cache de leitura por carregamento ──────────────────────────────
// getCategories() memoiza a consulta; toda escrita do service (e o
// invalidateCategoriesCache() exportado) descarta o cache. Consultas
// completas são identificáveis no mock por select("*") — os `.select()`/
// `.select("name")` dos writes não usam "*".

function countFullSelects(supabase) {
  return supabase._calls.filter(
    c => c.table === "categories" && c.method === "select" && c.args[0] === "*"
  ).length;
}

test("getCategories() memoizes: two consecutive calls fire a single query", async (t) => {
  const rows = [{ id: "c1", name: "Aula" }];
  const { mod, supabase } = await loadCategoryService(t, {
    categories: { data: rows, error: null },
  });

  const first  = await mod.getCategories();
  const second = await mod.getCategories();

  assert.strictEqual(countFullSelects(supabase), 1);
  assert.deepStrictEqual(first, rows);
  assert.deepStrictEqual(second, rows);
  // Cópia rasa por chamada — consumidores não corrompem o cache compartilhado.
  assert.notStrictEqual(first, second);
});

test("createCategory() invalidates the getCategories() cache", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: [{ id: "c1", name: "Aula" }], error: null },                          // initial getCategories
      { data: { id: "c2", name: "Prova" }, error: null },                           // insert
      { data: [{ id: "c1", name: "Aula" }, { id: "c2", name: "Prova" }], error: null }, // refetch
    ],
  });

  await mod.getCategories();
  await mod.createCategory("Prova", "#ec4899");
  const after = await mod.getCategories();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.deepStrictEqual(after.map(c => c.name), ["Aula", "Prova"]);
});

test("deleteCategory() invalidates the getCategories() cache", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: [{ id: "c1", name: "Prova" }], error: null }, // initial getCategories
      { data: { name: "Prova" }, error: null },             // in-use name lookup
      { data: null, error: null },                          // delete
      { data: [], error: null },                            // refetch
    ],
    events: { count: 0, error: null },
  });

  await mod.getCategories();
  await mod.deleteCategory("c1");
  const after = await mod.getCategories();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.deepStrictEqual(after, []);
});

test("updateCategory() invalidates the getCategories() cache even without a rename", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: [
      { data: [{ id: "c1", name: "Aula", color: "#3b82f6" }], error: null }, // initial getCategories
      { data: { name: "Aula" }, error: null },                               // previous-name lookup
      { data: { id: "c1", name: "Aula", color: "#000000" }, error: null },   // update result
      { data: [{ id: "c1", name: "Aula", color: "#000000" }], error: null }, // refetch
    ],
  });

  await mod.getCategories();
  await mod.updateCategory("c1", "Aula", "#000000");
  const after = await mod.getCategories();

  assert.strictEqual(countFullSelects(supabase), 2);
  assert.strictEqual(after[0].color, "#000000");
});

test("updateCategory() with a rename also invalidates eventService's events cache", async (t) => {
  const { mod, invalidateEventsCalls } = await loadCategoryService(t, {
    categories: [
      { data: { name: "Aula" }, error: null },
      { data: { id: "c1", name: "Aulas" }, error: null },
    ],
    events: { data: null, error: null },
  });

  await mod.updateCategory("c1", "Aulas", "#3b82f6");

  assert.strictEqual(invalidateEventsCalls.length, 1);
});

test("updateCategory() without a rename does not touch the events cache", async (t) => {
  const { mod, invalidateEventsCalls } = await loadCategoryService(t, {
    categories: [
      { data: { name: "Aula" }, error: null },
      { data: { id: "c1", name: "Aula" }, error: null },
    ],
  });

  await mod.updateCategory("c1", "Aula", "#000000");

  assert.strictEqual(invalidateEventsCalls.length, 0);
});

test("ensureDefaultCategories() invalidates the cache after creating the defaults", async (t) => {
  const defaults = [{ id: "c1", name: "Aula" }];
  const { mod } = await loadCategoryService(t, {
    categories: [
      { data: [], error: null },       // getCategories inside ensureDefaultCategories (memoized as [])
      { data: defaults, error: null }, // insert of the defaults
      { data: defaults, error: null }, // refetch after invalidation
    ],
  });

  await mod.ensureDefaultCategories();
  const after = await mod.getCategories();

  // Without the invalidation, the memoized [] from the first read would leak.
  assert.deepStrictEqual(after, defaults);
});

test("invalidateCategoriesCache() forces the next getCategories() to re-query (logout reset)", async (t) => {
  const { mod, supabase } = await loadCategoryService(t, {
    categories: { data: [{ id: "c1", name: "Aula" }], error: null },
  });

  await mod.getCategories();
  mod.invalidateCategoriesCache();
  await mod.getCategories();

  assert.strictEqual(countFullSelects(supabase), 2);
});

test("a failed getCategories() is not memoized: the next call re-queries", async (t) => {
  const rows = [{ id: "c1", name: "Aula" }];
  const { mod } = await loadCategoryService(t, {
    categories: [
      { data: null, error: { message: "network down" } },
      { data: rows, error: null },
    ],
  });

  await assert.rejects(() => mod.getCategories(), (err) => err.message === "network down");
  const retry = await mod.getCategories();

  assert.deepStrictEqual(retry, rows);
});
