import {
  getCalendars, createCalendar, updateCalendar, deleteCalendar,
  getAcademicEventsByRange, expandAcademicEvents,
} from "./academicCalendarService.js";
import { toast } from "./toastService.js";
import { escapeHtml } from "./utils.js";
import { confirmDialog } from "./confirmDialog.js";
import {
  isCalendarVisible,
  renderFilterBar as renderFilterBarImpl,
} from "./academicCalendarFilter.js";
import { initEventsView, showEventList } from "./academicCalendarEventsView.js";
import { initICSView, triggerICSImport, handleICSExport } from "./academicCalendarICSView.js";
import { initModal } from "./modalController.js";
import { handleError } from "./errorService.js";
import { errorToState, stateBlockMarkup, wireStateBlock } from "./stateView.js";
import { iconMoreHorizontal } from "./icons.js";

// ── State ──────────────────────────────────────────────────────────────────

let _calendarsCache = [];
let _onChange       = null; // () => void — called after any mutation
let _activeCalendar = null; // calendar currently being browsed

// ── Filter re-exports ─────────────────────────────────────────────────────

export { isPersonalVisible } from "./academicCalendarFilter.js";
export { isCalendarVisible } from "./academicCalendarFilter.js";

// ── Public init & cache ────────────────────────────────────────────────────

export async function initAcademicCalendarView(onChangeCb) {
  _onChange = onChangeCb;
  _calendarsCache = await getCalendars();

  initEventsView({
    getCalendarsCache: () => _calendarsCache,
    getActiveCalendar: () => _activeCalendar,
    setActiveCalendar: (cal) => { _activeCalendar = cal; },
    getOnChange:       () => _onChange,
    openModal,
    getModalBody:      () => _modalBody,
    onBack:            showCalendarList,
  });

  initICSView({
    getCalendarsCache: () => _calendarsCache,
    getActiveCalendar: () => _activeCalendar,
    getOnChange:       () => _onChange,
    showEventList,
    showCalendarList,
  });

  return _calendarsCache;
}

export function getAcademicEventProvider() {
  return async (start, end) => {
    const visibleIds = _calendarsCache
      .filter(c => isCalendarVisible(c.id))
      .map(c => c.id);
    if (visibleIds.length === 0) return [];
    const raw = await getAcademicEventsByRange(visibleIds, start, end);
    return expandAcademicEvents(raw, start, end);
  };
}

// ── Filter bar ─────────────────────────────────────────────────────────────

export function renderFilterBar(containerId) {
  renderFilterBarImpl(containerId, _calendarsCache, _onChange);
}

// ── Modal infrastructure ───────────────────────────────────────────────────

let _modalOverlay = null;
let _modalTitle   = null;
let _modalBody    = null;
let _modal        = null;

export function initAcademicModal() {
  // Chamada a cada login (ver script.js/_initApp) — sem esta guarda, um
  // segundo login na mesma sessão de página (após logout, sem reload)
  // registraria um novo modalController (novo listener de Escape/clique-fora
  // em document) e um novo listener em academic-close a cada vez, empilhando
  // handlers indefinidamente.
  if (_modalOverlay) return;

  _modalOverlay = document.getElementById("academic-overlay");
  _modalTitle   = document.getElementById("academic-modal-title");
  _modalBody    = document.getElementById("academic-modal-body");

  document.getElementById("academic-close")?.addEventListener("click", closeModal);
  if (_modalOverlay) _modal = initModal(_modalOverlay, closeModal);

  // Menu "⋯" por calendário (auditoria UX #36) — delegado em _modalBody, que
  // é o mesmo nó em todos os re-renders de showCalendarList(), então um único
  // par de listeners (aqui, dentro da mesma guarda acima) basta para toda a
  // vida da página, sem precisar re-registrar a cada renderização da lista.
  _modalBody?.addEventListener("click", (e) => {
    const btn = e.target.closest(".acal-row-menu-btn");
    if (!btn) return;
    e.stopPropagation();
    const dropdown = btn.nextElementSibling;
    const wasHidden = dropdown?.hidden;
    _closeAllRowMenus();
    if (dropdown && wasHidden) {
      dropdown.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }
  });
  document.addEventListener("click", _closeAllRowMenus);
}

function _closeAllRowMenus() {
  _modalBody?.querySelectorAll(".acal-row-menu-dropdown:not([hidden])").forEach(dropdown => {
    dropdown.hidden = true;
    dropdown.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
}

/**
 * Chamado no logout (ver script.js) — a próxima sessão de usuário não deve
 * herdar os calendários acadêmicos em cache nem encontrar o modal aberto do
 * usuário anterior.
 */
export function resetAcademicCalendarView() {
  _calendarsCache = [];
  _activeCalendar = null;
  _onChange       = null;
  _modal?.close();
}

// openModal() é reutilizada tanto para a abertura inicial quanto para navegar
// entre sub-views já com o modal aberto (lista de calendários, eventos,
// import/export ICS) — só captura foco/aciona o ciclo de vida na transição
// fechado → aberto, para não sobrescrever o foco a restaurar no fechamento real.
function openModal(title, bodyHTML) {
  if (!_modalOverlay) return;
  const wasHidden = _modalOverlay.hidden;
  _modalTitle.textContent = title;
  _modalBody.innerHTML    = bodyHTML;
  if (wasHidden) _modal.open();
}

function closeModal() {
  _modal?.close();
  _activeCalendar = null;
}

// ── View: Calendar list ────────────────────────────────────────────────────

export async function openAcademicCalendarModal() {
  _activeCalendar = null;
  await showCalendarList();
}

async function showCalendarList() {
  let loadError = null;
  try {
    _calendarsCache = await getCalendars();
  } catch (err) {
    const errorState = errorToState(handleError(err, { context: 'academicCalendarView.loadCalendars', silent: true }));
    // Se já havia uma lista carregada (ex.: atualização após criar/editar),
    // degrada mostrando os dados anteriores + um aviso; sem dados anteriores,
    // a falha não pode ser mascarada como "nenhum calendário cadastrado".
    if (_calendarsCache.length === 0) loadError = errorState;
    else toast.error(errorState.message);
  }

  const listHTML = loadError
    ? stateBlockMarkup(loadError)
    : _calendarsCache.length === 0
    ? `<p class="acal-empty">Nenhum calendário acadêmico cadastrado.</p>`
    : _calendarsCache.map(c => `
        <div class="acal-row" data-id="${escapeHtml(c.id)}">
          <span class="acal-swatch" style="background:${escapeHtml(c.color)}"></span>
          <div class="acal-row-info">
            <span class="acal-row-name">${escapeHtml(c.name)}</span>
            ${c.university    ? `<span class="acal-row-sub">${escapeHtml(c.university)}</span>` : ""}
            ${c.academic_year ? `<span class="acal-row-sub">${escapeHtml(c.academic_year)}</span>` : ""}
          </div>
          <div class="acal-row-actions">
            <button class="btn btn-sm btn-primary btn-acal-events" data-id="${escapeHtml(c.id)}">Eventos</button>
            <div class="user-menu-wrap acal-row-menu-wrap">
              <button type="button" class="btn-icon btn-icon-sm acal-row-menu-btn" data-id="${escapeHtml(c.id)}" aria-haspopup="true" aria-expanded="false" aria-label="Mais ações para ${escapeHtml(c.name)}">${iconMoreHorizontal}</button>
              <div class="user-menu-dropdown acal-row-menu-dropdown" hidden role="menu">
                <button class="user-menu-item btn-acal-import" data-id="${escapeHtml(c.id)}" role="menuitem">Importar ICS</button>
                <button class="user-menu-item btn-acal-export" data-id="${escapeHtml(c.id)}" role="menuitem">Exportar ICS</button>
                <button class="user-menu-item btn-acal-edit"   data-id="${escapeHtml(c.id)}" role="menuitem">Editar</button>
                <div class="user-menu-divider"></div>
                <button class="user-menu-item user-menu-item--danger btn-acal-delete" data-id="${escapeHtml(c.id)}" role="menuitem">Excluir</button>
              </div>
            </div>
          </div>
        </div>
      `).join("");

  openModal("Calendários Acadêmicos", `
    <div class="acal-list-wrap">
      <div class="acal-list" id="acal-list">${listHTML}</div>
      <div class="acal-add-section">
        <h4 class="acal-add-title">Novo calendário</h4>
        <div class="acal-form-grid">
          <div class="field">
            <label>Nome <span class="required">*</span></label>
            <input type="text" id="acal-new-name" placeholder="Ex: Medicina 2026" maxlength="120" />
          </div>
          <div class="field">
            <label>Cor</label>
            <input type="color" id="acal-new-color" value="#7c3aed" />
          </div>
          <div class="field">
            <label>Universidade</label>
            <input type="text" id="acal-new-univ" placeholder="Ex: USP" maxlength="120" />
          </div>
          <div class="field">
            <label>Ano letivo</label>
            <input type="text" id="acal-new-year" placeholder="Ex: 2026" maxlength="9" />
          </div>
        </div>
        <p class="error" id="acal-error" role="alert"></p>
        <button class="btn btn-primary btn-sm" id="acal-add">Criar calendário</button>
      </div>
    </div>
  `);

  // Wire up list actions
  _modalBody.querySelectorAll(".btn-acal-events").forEach(btn => {
    btn.addEventListener("click", () => showEventList(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-import").forEach(btn => {
    btn.addEventListener("click", () => triggerICSImport(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-export").forEach(btn => {
    btn.addEventListener("click", () => handleICSExport(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-edit").forEach(btn => {
    btn.addEventListener("click", () => showCalendarEditForm(btn.dataset.id));
  });
  _modalBody.querySelectorAll(".btn-acal-delete").forEach(btn => {
    btn.addEventListener("click", () => handleCalendarDelete(btn.dataset.id));
  });

  document.getElementById("acal-add")?.addEventListener("click", handleCalendarCreate);
  wireStateBlock(_modalBody, showCalendarList);
}

// ── Calendar CRUD ──────────────────────────────────────────────────────────

async function handleCalendarCreate() {
  const errEl = document.getElementById("acal-error");
  errEl.textContent = "";
  const name  = document.getElementById("acal-new-name").value.trim();
  const color = document.getElementById("acal-new-color").value;
  const univ  = document.getElementById("acal-new-univ").value.trim() || null;
  const year  = document.getElementById("acal-new-year").value.trim() || null;
  if (!name) { errEl.textContent = "Nome é obrigatório."; return; }
  try {
    await createCalendar({ name, color, university: univ, academic_year: year });
    toast.success("Calendário criado.");
    _onChange?.();
    await showCalendarList();
  } catch (err) {
    const { friendly } = handleError(err, { context: 'academicCalendarView.create', silent: true, fallbackMessage: "Erro ao criar calendário." });
    errEl.textContent = friendly;
  }
}

async function showCalendarEditForm(calId) {
  const cal = _calendarsCache.find(c => c.id === calId);
  if (!cal) return;

  openModal(`Calendários Acadêmicos › Editar: ${escapeHtml(cal.name)}`, `
    <div class="acal-form-full">
      <div class="acal-form-grid">
        <div class="field">
          <label>Nome <span class="required">*</span></label>
          <input type="text" id="acal-edit-name"  value="${escapeHtml(cal.name)}" maxlength="120" />
        </div>
        <div class="field">
          <label>Cor</label>
          <input type="color" id="acal-edit-color" value="${escapeHtml(cal.color)}" />
        </div>
        <div class="field">
          <label>Universidade</label>
          <input type="text" id="acal-edit-univ" value="${escapeHtml(cal.university || "")}" maxlength="120" />
        </div>
        <div class="field">
          <label>Ano letivo</label>
          <input type="text" id="acal-edit-year" value="${escapeHtml(cal.academic_year || "")}" maxlength="9" />
        </div>
      </div>
      <p class="error" id="acal-edit-error" role="alert"></p>
      <div class="acal-form-actions">
        <button class="btn btn-primary" id="acal-save-edit">Salvar</button>
        <button class="btn btn-ghost"   id="acal-cancel-edit">Cancelar</button>
      </div>
    </div>
  `);

  document.getElementById("acal-save-edit").addEventListener("click", async () => {
    const errEl = document.getElementById("acal-edit-error");
    errEl.textContent = "";
    const name  = document.getElementById("acal-edit-name").value.trim();
    const color = document.getElementById("acal-edit-color").value;
    const univ  = document.getElementById("acal-edit-univ").value.trim() || null;
    const year  = document.getElementById("acal-edit-year").value.trim() || null;
    if (!name) { errEl.textContent = "Nome é obrigatório."; return; }
    try {
      await updateCalendar(calId, { name, color, university: univ, academic_year: year });
      toast.success("Calendário atualizado.");
      _onChange?.();
      await showCalendarList();
    } catch (err) {
      const { friendly } = handleError(err, { context: 'academicCalendarView.update', silent: true, fallbackMessage: "Erro ao atualizar." });
      errEl.textContent = friendly;
    }
  });
  document.getElementById("acal-cancel-edit").addEventListener("click", showCalendarList);
}

async function handleCalendarDelete(calId) {
  const cal = _calendarsCache.find(c => c.id === calId);
  if (!cal) return;
  const ok = await confirmDialog({
    title:   'Excluir calendário',
    message: `Excluir o calendário "${cal.name}" e todos os seus eventos?`,
    danger:  true,
  });
  if (!ok) return;
  try {
    await deleteCalendar(calId);
    toast.success("Calendário excluído.");
    _onChange?.();
    await showCalendarList();
  } catch (err) {
    const { friendly } = handleError(err, { context: 'academicCalendarView.delete', silent: true, fallbackMessage: "Erro ao excluir." });
    toast.error(friendly);
  }
}
