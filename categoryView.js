// ── categoryView.js — Modal de gerenciamento de categorias ───────────────────

import {
  getCategories, createCategory, updateCategory,
  deleteCategory, ensureDefaultCategories,
} from "./categoryService.js";
import { escapeHtml } from "./utils.js";
import { confirmDialog } from "./confirmDialog.js";

let categoriesCache = [];

let fCategory  = null;
let fColor     = null;
let catOverlay = null;
let catList    = null;
let catNewColor = null;
let catNewName  = null;
let catAddBtn   = null;
let catError    = null;

export function initCategoryView() {
  fCategory   = document.getElementById("f-category");
  fColor      = document.getElementById("f-color");
  catOverlay  = document.getElementById("cat-overlay");
  catList     = document.getElementById("cat-list");
  catNewColor = document.getElementById("cat-new-color");
  catNewName  = document.getElementById("cat-new-name");
  catAddBtn   = document.getElementById("cat-add");
  catError    = document.getElementById("cat-error");

  document.getElementById("btn-categories")?.addEventListener("click", openCategoryModal);
  document.getElementById("cat-close")?.addEventListener("click", closeCategoryModal);
  catOverlay?.addEventListener("click", (e) => { if (e.target === catOverlay) closeCategoryModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && catOverlay && !catOverlay.hidden) closeCategoryModal();
  });

  fCategory?.addEventListener("change", () => {
    const cat = categoriesCache.find(c => c.name === fCategory.value);
    if (cat) fColor.value = cat.color;
  });

  catAddBtn?.addEventListener("click", async () => {
    catError.textContent = "";
    const name  = catNewName.value.trim();
    const color = catNewColor.value;
    if (!name) { catError.textContent = "Nome é obrigatório."; catNewName.focus(); return; }
    try {
      await createCategory(name, color);
      catNewName.value  = "";
      catNewColor.value = "#3b82f6";
      await _reloadCategories();
      await _renderCatList();
    } catch (err) {
      catError.textContent = err.message;
    }
  });
}

export async function initCategories() {
  categoriesCache = await ensureDefaultCategories();
  _populateCategorySelect();
}

export function categoryColor(name) {
  const cat = categoriesCache.find(c => c.name === name);
  return cat?.color || "#6b7280";
}

export async function openCategoryModal() {
  catError.textContent = "";
  catNewName.value  = "";
  catNewColor.value = "#3b82f6";
  await _renderCatList();
  catOverlay.hidden = false;
  catNewName.focus();
}

function closeCategoryModal() {
  catOverlay.hidden = true;
}

async function _reloadCategories() {
  categoriesCache = await getCategories();
  _populateCategorySelect();
}

function _populateCategorySelect() {
  if (!fCategory) return;
  const current = fCategory.value;
  fCategory.innerHTML = '<option value="">— Selecione —</option>';
  categoriesCache.forEach(cat => {
    const opt = document.createElement("option");
    opt.value       = cat.name;
    opt.textContent = cat.name;
    fCategory.appendChild(opt);
  });
  fCategory.value = current;
}

async function _renderCatList() {
  catList.innerHTML = "";
  const cats = await getCategories();

  if (cats.length === 0) {
    catList.innerHTML = `<p class="cat-empty">Nenhuma categoria cadastrada.</p>`;
    return;
  }

  cats.forEach(cat => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <span class="cat-swatch" style="background:${escapeHtml(cat.color)}"></span>
      <span class="cat-name-display">${escapeHtml(cat.name)}</span>
      <div class="cat-row-actions">
        <button class="btn btn-sm btn-ghost">Editar</button>
        <button class="btn btn-sm btn-danger">Excluir</button>
      </div>
    `;

    row.querySelector(".btn-ghost").addEventListener("click",  () => _enterEditMode(row, cat));
    row.querySelector(".btn-danger").addEventListener("click", () => _handleCatDelete(cat, row));
    catList.appendChild(row);
  });
}

function _enterEditMode(row, cat) {
  row.innerHTML = `
    <input type="color" class="cat-edit-color" value="${escapeHtml(cat.color)}" title="Cor" />
    <input type="text"  class="cat-edit-name"  value="${escapeHtml(cat.name)}" />
    <div class="cat-row-actions">
      <button class="btn btn-sm btn-primary">Salvar</button>
      <button class="btn btn-sm btn-ghost">Cancelar</button>
    </div>
  `;
  row.querySelector(".cat-edit-name").focus();

  const catSaveBtn = row.querySelector(".btn-primary");
  catSaveBtn.addEventListener("click", async () => {
    const newName  = row.querySelector(".cat-edit-name").value.trim();
    const newColor = row.querySelector(".cat-edit-color").value;
    if (!newName) return;
    catSaveBtn.disabled = true;
    try {
      await updateCategory(cat.id, newName, newColor);
      await _reloadCategories();
      await _renderCatList();
    } catch (err) {
      catError.textContent = err.message;
      catSaveBtn.disabled = false;
    }
  });

  row.querySelector(".btn-ghost").addEventListener("click", _renderCatList);
}

async function _handleCatDelete(cat, row) {
  const ok = await confirmDialog({
    title:   'Excluir categoria',
    message: `Excluir a categoria "${cat.name}"?`,
    danger:  true,
  });
  if (!ok) return;
  row.style.opacity = ".4";
  try {
    await deleteCategory(cat.id);
    await _reloadCategories();
    await _renderCatList();
  } catch (err) {
    row.style.opacity = "1";
    catError.textContent = err.message;
  }
}
