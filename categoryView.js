// ── categoryView.js — Modal de gerenciamento de categorias ───────────────────

import {
  getCategories, createCategory, updateCategory,
  deleteCategory, ensureDefaultCategories, invalidateCategoriesCache,
} from "./categoryService.js";
import { escapeHtml } from "./utils.js";
import { confirmDialog } from "./confirmDialog.js";
import { initModal } from "./modalController.js";
import { handleError } from "./errorService.js";
import { errorToState, stateBlockMarkup, wireStateBlock } from "./stateView.js";
import { revealWithAnimation } from "./transitionUtils.js";

let categoriesCache = [];

// Paleta curada oferecida por padrão na criação de novas categorias (F14) —
// reduz colisão visual entre categorias ao longo do tempo. O picker de cor
// livre (nativo, atrás do disclosure "Cor livre") continua disponível como
// opção avançada. Categorias já cadastradas mantêm sua cor atual: esta
// paleta só entra em jogo no formulário de criação.
const CURATED_PALETTE = [
  "#3b82f6", "#ef4444", "#10b981", "#8b5cf6",
  "#f59e0b", "#ec4899", "#06b6d4", "#f97316",
  "#14b8a6", "#a855f7", "#84cc16", "#6b7280",
];

let fCategory  = null;
let fColor     = null;
let catOverlay = null;
let catList    = null;
let catPalette  = null;
let catNewColor = null;
let catNewName  = null;
let catAddBtn   = null;
let catError    = null;
let catColorToggle   = null;
let catColorAdvanced = null;
let modal       = null;

// Notificado depois de cada criação/edição/exclusão bem-sucedida para que
// telas fora do modal (lista, semana, calendário, filtro por categoria em
// script.js) se atualizem sem exigir reload da aplicação (BUG 14).
let _onCategoriesChanged = null;

// Incrementado sempre que o modal é reaberto ou a lista é reconstruída —
// captura de generation nos handlers assíncronos evita que uma resposta
// tardia (ex.: erro de uma edição já abandonada) escreva em `catError`
// depois que o usuário já passou para outra categoria/operação (BUG 13).
let _catGeneration = 0;

export function initCategoryView(onCategoriesChanged) {
  // Evita religar todos os listeners (e, com isso, duplicar submissões) caso
  // initCategoryView() seja chamado mais de uma vez.
  if (catAddBtn) return;

  _onCategoriesChanged = onCategoriesChanged || null;

  fCategory   = document.getElementById("f-category");
  fColor      = document.getElementById("f-color");
  catOverlay  = document.getElementById("cat-overlay");
  catList     = document.getElementById("cat-list");
  catPalette  = document.getElementById("cat-palette");
  catNewColor = document.getElementById("cat-new-color");
  catNewName  = document.getElementById("cat-new-name");
  catAddBtn   = document.getElementById("cat-add");
  catError    = document.getElementById("cat-error");
  catColorToggle   = document.getElementById("cat-color-toggle");
  catColorAdvanced = document.getElementById("cat-color-advanced");

  _renderPalette();
  catNewColor?.addEventListener("input", _syncPaletteSelection);
  // Cor livre — mesmo padrão aria-expanded + hidden dos demais disclosures
  // do app (ex.: "Mostrar" em eventFormView.js); colapsado por padrão para
  // que a paleta curada seja o caminho principal (F14).
  catColorToggle?.addEventListener("click", () => _setColorAdvancedExpanded(catColorAdvanced.hidden));

  document.getElementById("btn-categories")?.addEventListener("click", openCategoryModal);
  document.getElementById("cat-close")?.addEventListener("click", closeCategoryModal);
  if (catOverlay) modal = initModal(catOverlay, closeCategoryModal);

  fCategory?.addEventListener("change", () => {
    const cat = categoriesCache.find(c => c.name === fCategory.value);
    if (cat) fColor.value = cat.color;
  });

  catAddBtn?.addEventListener("click", async () => {
    // Impede duplo clique de disparar duas criações concorrentes enquanto a
    // primeira ainda está em rede (`disabled` sozinho não basta: um segundo
    // clique disparado antes do primeiro repaint ainda encontra o listener).
    if (catAddBtn.disabled) return;

    catError.textContent = "";
    const name  = catNewName.value.trim();
    const color = catNewColor.value;
    if (!name) { catError.textContent = "Nome é obrigatório."; catNewName.focus(); return; }

    const generation = _catGeneration;
    catAddBtn.disabled = true;
    try {
      await createCategory(name, color);
      catNewName.value  = "";
      catNewColor.value = "#3b82f6";
      _syncPaletteSelection();
      await _reloadCategories();
      await _renderCatList();
      _onCategoriesChanged?.();
    } catch (err) {
      handleError(err, { context: 'categoryView.create', silent: true });
      if (generation === _catGeneration) catError.textContent = err.message;
    } finally {
      catAddBtn.disabled = false;
    }
  });
}

export async function initCategories() {
  categoriesCache = await ensureDefaultCategories();
  _populateCategorySelect();
}

/**
 * Chamado no logout (ver script.js) — a próxima sessão de usuário não deve
 * herdar as categorias em cache do usuário anterior, mesmo que initCategories()
 * ainda não tenha rodado de novo (ex.: uma tela ainda aberta lendo categoryColor()).
 * Também descarta o DOM do modal (lista de categorias e select do formulário
 * de compromisso) — o modal é apenas ocultado no logout (_closeAllModals),
 * não fechado via modal.close(), então sem isto a lista do usuário anterior
 * ficaria presente (embora oculta) até a próxima abertura do modal.
 */
export function resetCategories() {
  categoriesCache = [];
  // F15.10 — o cache de leitura do service também não pode sobreviver à troca
  // de usuário (mesma simetria init/reset do restante do logout).
  invalidateCategoriesCache();
  if (catList) catList.innerHTML = "";
  if (catError) catError.textContent = "";
  if (fCategory) fCategory.innerHTML = '<option value="">— Selecione —</option>';
}

export function categoryColor(name) {
  const cat = categoriesCache.find(c => c.name === name);
  return cat?.color || "#6b7280";
}

export async function openCategoryModal() {
  _catGeneration++;
  catError.textContent = "";
  catNewName.value  = "";
  catNewColor.value = "#3b82f6";
  _syncPaletteSelection();
  _setColorAdvancedExpanded(false);
  await _renderCatList();
  modal.open(catNewName);
}

/** Expande/recolhe o picker de cor livre — mesmo padrão usado pelos demais
 * disclosures do app (aria-expanded + hidden no wrap, rótulo Mostrar/Ocultar). */
function _setColorAdvancedExpanded(expand) {
  if (!catColorToggle || !catColorAdvanced) return;
  catColorAdvanced.hidden = !expand;
  catColorToggle.setAttribute("aria-expanded", String(expand));
  const label = catColorToggle.querySelector(".disclosure-label");
  if (label) label.textContent = expand ? "Ocultar" : "Cor livre";
  if (expand) revealWithAnimation(catColorAdvanced);
}

/**
 * Monta os botões da paleta curada (F14). Renderizado uma única vez em
 * initCategoryView(); a seleção visual é sincronizada separadamente por
 * _syncPaletteSelection() sempre que #cat-new-color muda (clique num swatch
 * ou escolha manual via "Cor livre").
 */
function _renderPalette() {
  if (!catPalette) return;
  catPalette.innerHTML = "";
  CURATED_PALETTE.forEach(color => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-swatch-btn";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.title = color;
    btn.setAttribute("aria-label", `Usar cor ${color}`);
    btn.addEventListener("click", () => {
      catNewColor.value = color;
      _syncPaletteSelection();
    });
    catPalette.appendChild(btn);
  });
  _syncPaletteSelection();
}

/** Marca como selecionado o swatch da paleta que corresponde à cor atual de
 * #cat-new-color (comparação case-insensitive); nenhum swatch fica marcado
 * quando o valor vem do picker livre e não bate com nenhuma cor curada. */
function _syncPaletteSelection() {
  if (!catPalette || !catNewColor) return;
  const current = catNewColor.value.toLowerCase();
  catPalette.querySelectorAll(".cat-swatch-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.color.toLowerCase() === current);
  });
}

function closeCategoryModal() {
  modal.close();
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
  _catGeneration++;
  catList.innerHTML = "";

  let cats;
  try {
    cats = await getCategories();
  } catch (err) {
    // Erro ao carregar não pode aparecer como "nenhuma categoria cadastrada" —
    // exibe o estado único de erro (F4.1), com a ação adequada (reautenticar
    // ou tentar novamente).
    const errorState = errorToState(handleError(err, { context: 'categoryView.load', silent: true }));
    catList.innerHTML = stateBlockMarkup(errorState);
    wireStateBlock(catList, _renderCatList);
    return;
  }

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
  catError.textContent = "";

  const catSaveBtn = row.querySelector(".btn-primary");
  catSaveBtn.addEventListener("click", async () => {
    const newName  = row.querySelector(".cat-edit-name").value.trim();
    const newColor = row.querySelector(".cat-edit-color").value;
    if (!newName) return;
    const generation = _catGeneration;
    catSaveBtn.disabled = true;
    try {
      await updateCategory(cat.id, newName, newColor);
      await _reloadCategories();
      await _renderCatList();
      _onCategoriesChanged?.();
    } catch (err) {
      handleError(err, { context: 'categoryView.update', silent: true });
      // Se o modal já avançou para outra categoria/render enquanto este
      // salvamento estava em rede, esta linha é um nó de DOM órfão — não
      // atribuir o erro à operação/categoria atual do usuário.
      if (generation === _catGeneration) {
        catError.textContent = err.message;
        catSaveBtn.disabled = false;
      }
    }
  });

  row.querySelector(".btn-ghost").addEventListener("click", _renderCatList);
}

async function _handleCatDelete(cat, row) {
  const ok = await confirmDialog({
    title:   'Excluir categoria',
    message: `A categoria "${cat.name}" será removida de todos os compromissos vinculados a ela. Excluir mesmo assim?`,
    danger:  true,
  });
  if (!ok) return;
  catError.textContent = "";
  const generation = _catGeneration;
  const btns = row.querySelectorAll("button");
  btns.forEach(b => b.disabled = true);
  row.style.opacity = ".4";
  try {
    await deleteCategory(cat.id);
    await _reloadCategories();
    await _renderCatList();
    _onCategoriesChanged?.();
  } catch (err) {
    handleError(err, { context: 'categoryView.delete', silent: true });
    if (generation === _catGeneration) {
      row.style.opacity = "1";
      btns.forEach(b => b.disabled = false);
      catError.textContent = err.message;
    }
  }
}
