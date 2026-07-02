/**
 * Golden path: "Criar categoria" — categoryView.js wired to a mocked
 * categoryService.js, exercised through the real DOM (index.html).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const CATEGORY_SERVICE_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;

let view, serviceCalls;

function mockCategoryService(t, { categories = [], createResult, createError } = {}) {
  serviceCalls = [];
  let currentCategories = categories;
  t.mock.module(CATEGORY_SERVICE_SPECIFIER, {
    namedExports: {
      getCategories: async () => currentCategories,
      createCategory: async (name, color) => {
        serviceCalls.push({ fn: "createCategory", name, color });
        if (createError) throw createError;
        currentCategories = [...currentCategories, createResult];
        return createResult;
      },
      updateCategory: async () => { throw new Error("not used in this test"); },
      deleteCategory: async () => { throw new Error("not used in this test"); },
      ensureDefaultCategories: async () => currentCategories,
    },
  });
}

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

test("opening the modal renders the existing categories and focuses the name input", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();

  await view.openCategoryModal();

  assert.strictEqual(document.getElementById("cat-overlay").hidden, false);
  assert.strictEqual(document.querySelectorAll("#cat-list .cat-row").length, 1);
  assert.strictEqual(document.querySelector(".cat-name-display").textContent, "Aula");
  assert.strictEqual(document.activeElement, document.getElementById("cat-new-name"));
});

test("creating a category re-renders the list and clears the form", async (t) => {
  const created = { id: "cat-2", name: "Plantão", color: "#ef4444" };
  mockCategoryService(t, { categories: [], createResult: created });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "Plantão";
  document.getElementById("cat-new-color").value = "#ef4444";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0)); // let the click handler's awaits settle

  assert.deepStrictEqual(serviceCalls, [{ fn: "createCategory", name: "Plantão", color: "#ef4444" }]);
  assert.strictEqual(document.getElementById("cat-new-name").value, "");
  assert.strictEqual(document.querySelectorAll("#cat-list .cat-row").length, 1);
});

test("creating a category without a name shows a validation error and does not call the service", async (t) => {
  mockCategoryService(t, { categories: [] });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "   ";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("cat-error").textContent, "Nome é obrigatório.");
  assert.deepStrictEqual(serviceCalls, []);
});

test("a duplicate-name error from the service is surfaced without closing the modal", async (t) => {
  mockCategoryService(t, {
    categories: [],
    createError: new Error("Já existe uma categoria com esse nome."),
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "Aula";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("cat-error").textContent, "Já existe uma categoria com esse nome.");
  assert.strictEqual(document.getElementById("cat-overlay").hidden, false);
});

test("closing the modal via the close button hides the overlay and restores focus", async (t) => {
  mockCategoryService(t, { categories: [] });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();

  const trigger = document.getElementById("btn-categories");
  trigger.focus();
  await view.openCategoryModal();
  document.getElementById("cat-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("cat-overlay").hidden, true);
  assert.strictEqual(document.activeElement, trigger);
});
