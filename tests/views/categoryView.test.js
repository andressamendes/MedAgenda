/**
 * Golden path: "Criar categoria" — categoryView.js wired to a mocked
 * categoryService.js, exercised through the real DOM (index.html).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

const CATEGORY_SERVICE_SPECIFIER = new URL("../../categoryService.js", import.meta.url).href;
const CONFIRM_DIALOG_SPECIFIER   = new URL("../../confirmDialog.js", import.meta.url).href;

let view, serviceCalls;

function mockCategoryService(t, {
  categories = [], createResult, createError,
  updateImpl, deleteImpl,
} = {}) {
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
      updateCategory: async (id, name, color) => {
        serviceCalls.push({ fn: "updateCategory", id, name, color });
        if (updateImpl) return updateImpl(id, name, color, currentCategories, (next) => { currentCategories = next; });
        currentCategories = currentCategories.map(c => c.id === id ? { ...c, name, color } : c);
        return currentCategories.find(c => c.id === id);
      },
      deleteCategory: async (id) => {
        serviceCalls.push({ fn: "deleteCategory", id });
        if (deleteImpl) return deleteImpl(id, currentCategories, (next) => { currentCategories = next; });
        currentCategories = currentCategories.filter(c => c.id !== id);
      },
      ensureDefaultCategories: async () => currentCategories,
      invalidateCategoriesCache: () => {},
    },
  });
}

// confirmDialog.js keeps its overlay in module-level state and only builds it
// once — mocked here (same pattern as eventFormView.test.js) instead of
// relying on the real DOM side effects across fresh jsdom documents.
function mockConfirmDialog(t, resolveTo = true) {
  t.mock.module(CONFIRM_DIALOG_SPECIFIER, {
    namedExports: {
      confirmDialog: async () => resolveTo,
    },
  });
}

async function flush() {
  await new Promise(r => setTimeout(r, 0));
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

test("resetCategories() clears the cached category list (logout symmetry, A1.3)", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.initCategories();

  // Before reset: categoryColor() still resolves the cached category.
  assert.strictEqual(view.categoryColor("Aula"), "#3b82f6");

  view.resetCategories();

  // After reset: no cached data survives the logout — an unknown/previous
  // category falls back to the default color instead of leaking stale data.
  assert.strictEqual(view.categoryColor("Aula"), "#6b7280");
});

test("resetCategories() also clears the modal's rendered list (no data survives logout, even hidden)", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.initCategories();
  await view.openCategoryModal();

  // Sanity: dados do usuário estão renderizados antes do logout (o modal é
  // apenas ocultado no logout, ver _closeAllModals em authView.js — nunca
  // fechado via modal.close()).
  assert.match(document.getElementById("cat-list").textContent, /Aula/);

  view.resetCategories();

  assert.strictEqual(document.getElementById("cat-list").innerHTML, "", "logout must leave no rendered data behind");
  assert.strictEqual(document.getElementById("f-category").children.length, 1, "select must be back to only the placeholder option");
});

test("editing a category saves once, updates the row, and clears a previous error", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-error").textContent = "erro de uma operação anterior";

  document.querySelector("#cat-list .cat-row .btn-ghost").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("cat-error").textContent, "", "entering edit mode clears a stale error");

  document.querySelector(".cat-edit-name").value = "Plantão";
  document.querySelector(".cat-edit-color").value = "#ef4444";
  document.querySelector("#cat-list .btn-primary").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(serviceCalls.filter(c => c.fn === "updateCategory").length, 1);
  assert.strictEqual(document.querySelector(".cat-name-display").textContent, "Plantão");
});

test("cancelling an edit discards changes without calling the service", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.querySelector("#cat-list .cat-row .btn-ghost").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.querySelector(".cat-edit-name").value = "Outro nome";
  document.querySelector("#cat-list .cat-row-actions .btn-ghost").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.deepStrictEqual(serviceCalls, []);
  assert.strictEqual(document.querySelector(".cat-name-display").textContent, "Aula");
});

test("deleting a category (after confirmation) removes it from the list", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  mockConfirmDialog(t, true);
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.querySelector("#cat-list .cat-row .btn-danger").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(serviceCalls.filter(c => c.fn === "deleteCategory").length, 1);
  assert.strictEqual(document.querySelectorAll("#cat-list .cat-row").length, 0);
  assert.strictEqual(document.querySelector(".cat-empty")?.textContent, "Nenhuma categoria cadastrada.");
});

test("declining the delete confirmation keeps the category and does not call the service", async (t) => {
  mockCategoryService(t, {
    categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }],
  });
  mockConfirmDialog(t, false);
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.querySelector("#cat-list .cat-row .btn-danger").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.deepStrictEqual(serviceCalls, []);
  assert.strictEqual(document.querySelectorAll("#cat-list .cat-row").length, 1);
});

test("create, edit and delete each notify the onCategoriesChanged callback so other screens (list, selects, filters) can refresh without a reload (BUG 14)", async (t) => {
  const created = { id: "cat-2", name: "Plantão", color: "#ef4444" };
  mockCategoryService(t, { categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }], createResult: created });
  mockConfirmDialog(t, true);
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  let changedCount = 0;
  view.initCategoryView(() => { changedCount++; });
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "Plantão";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.strictEqual(changedCount, 1, "create notifies once");

  document.querySelectorAll("#cat-list .cat-row .btn-ghost")[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  document.querySelector(".cat-edit-name").value = "Aula 2";
  document.querySelector("#cat-list .btn-primary").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.strictEqual(changedCount, 2, "edit notifies once");

  document.querySelectorAll("#cat-list .cat-row .btn-danger")[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.strictEqual(changedCount, 3, "delete notifies once");
});

test("a rapid double click on 'Adicionar' only creates the category once (no duplicate save)", async (t) => {
  const created = { id: "cat-2", name: "Plantão", color: "#ef4444" };
  mockCategoryService(t, { categories: [], createResult: created });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "Plantão";
  const addBtn = document.getElementById("cat-add");
  addBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  addBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(serviceCalls.filter(c => c.fn === "createCategory").length, 1);
});

test("initCategoryView() called twice does not double-bind listeners (no duplicate saves)", async (t) => {
  mockCategoryService(t, { categories: [] });
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  view.initCategoryView();
  await view.openCategoryModal();

  document.getElementById("cat-new-name").value = "Estudo";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();

  assert.strictEqual(serviceCalls.filter(c => c.fn === "createCategory").length, 1);
});

test("the event-form category select stays in sync with the category list after create and delete (no reload needed)", async (t) => {
  const created = { id: "cat-2", name: "Plantão", color: "#ef4444" };
  mockCategoryService(t, { categories: [{ id: "cat-1", name: "Aula", color: "#3b82f6" }], createResult: created });
  mockConfirmDialog(t, true);
  view = await import(`../../categoryView.js?t=${Math.random()}`);
  view.initCategoryView();
  await view.initCategories();
  await view.openCategoryModal();

  const fCategory = document.getElementById("f-category");
  assert.deepStrictEqual([...fCategory.options].map(o => o.value), ["", "Aula"]);

  document.getElementById("cat-new-name").value = "Plantão";
  document.getElementById("cat-add").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.deepStrictEqual([...fCategory.options].map(o => o.value), ["", "Aula", "Plantão"]);

  document.querySelectorAll("#cat-list .cat-row .btn-danger")[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
  assert.deepStrictEqual([...fCategory.options].map(o => o.value), ["", "Plantão"]);
});
