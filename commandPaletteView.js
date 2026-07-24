// ── commandPaletteView.js — Paleta de comando (Ctrl/Cmd+K) ───────────────────
//
// V5.10 — superfície única de comando: navegação entre páginas, ações rápidas
// (novo compromisso, iniciar sessão) e atalho para as buscas do Diário/Agenda.
// Nenhuma lógica de negócio própria: cada item delega ao mesmo caminho já
// usado pelo mouse (showPage(), clique nos botões existentes), o mesmo
// padrão que keyboardService.js já usa para "N" (delega a #btn-new-event).
//
// Construção da paleta é preguiçosa (só no primeiro Ctrl/Cmd+K, ver
// _ensureBuilt) — mesmo padrão de confirmDialog.js. Como as ações desta
// paleta só fazem sentido logado (showPage(), #btn-new-event etc. só existem
// dentro de #app-screen) e o atalho que a abre só é escutado depois do login
// (initKeyboardShortcuts roda em _initApp), não há necessidade de um
// reset próprio: a paleta simplesmente nunca é aberta antes do login, e
// nenhum estado dela sobrevive a um clique fora/Esc entre uma sessão e outra
// (query e seleção são zeradas a cada abertura, ver openCommandPalette).

import { showPage } from "./navigationView.js";
import { initModal } from "./modalController.js";

// Mesmos ícones/rótulos usados na sidebar (ver index.html/.nav-item) —
// repetidos aqui como string porque a paleta é montada via innerHTML, não a
// partir do DOM da sidebar (que pode estar colapsada/oculta em mobile).
const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2.5" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="21.5"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2.5" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="21.5" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><rect x="6" y="13" width="12" height="4" fill="currentColor" stroke="none"/></svg>',
  "study-session": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M2 4h7a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h8z"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>',
};

// "Iniciar sessão" nunca inicia nada direto: reaproveita o mesmo botão que
// abre o modal de configuração pré-início (ver studySessionView.js), só
// clicado quando não existe sessão em andamento (#ss-empty visível) — com
// uma sessão ativa, a página já mostra o cronômetro, não faz sentido reabrir
// o modal por cima.
function _startStudySession() {
  showPage("study-session");
  const emptyEl = document.getElementById("ss-empty");
  if (emptyEl && !emptyEl.hidden) {
    document.getElementById("ss-btn-start-standalone")?.click();
  }
}

// A busca da Agenda vive dentro da aba "Lista" (#agenda-view-tabs), escondida
// quando Semana/Mês está ativa — clicar na própria aba (em vez de mexer
// direto em `hidden`) garante que o estado salvo em localStorage
// (medagenda_agenda_view) e o roving tabindex fiquem consistentes.
function _openAppointmentsSearch() {
  showPage("agenda");
  document.querySelector('#agenda-view-tabs .tab[data-view="list"]')?.click();
  document.getElementById("search-appointments")?.focus();
}

// A busca do Diário fica atrás de um disclosure (#sj-search-toggle) — clicar
// nele quando ainda fechado já revela e foca o campo (ver
// studyJournalView.js/_toggleSearch); se já estiver aberto, só falta focar.
function _openJournalSearch() {
  showPage("journal");
  const wrap = document.getElementById("sj-search-wrap");
  if (wrap && wrap.hidden) {
    document.getElementById("sj-search-toggle")?.click();
  } else {
    document.getElementById("sj-filter-search")?.focus();
  }
}

const GROUPS = [
  {
    label: "Navegar",
    items: [
      { id: "nav-today",   label: "Ir para Hoje",      keywords: "hoje inicio home g h", icon: ICONS.today,          hint: "G H", action: () => showPage("today") },
      { id: "nav-agenda",  label: "Ir para Agenda",     keywords: "agenda semana mes calendario g a", icon: ICONS.agenda, hint: "G A", action: () => showPage("agenda") },
      { id: "nav-session", label: "Ir para Sessão",     keywords: "sessao estudo cronometro g s", icon: ICONS["study-session"], hint: "G S", action: () => showPage("study-session") },
      { id: "nav-journal", label: "Ir para Diário",     keywords: "diario historico journal g j", icon: ICONS.journal, hint: "G J", action: () => showPage("journal") },
      { id: "nav-progress",label: "Ir para Progresso",  keywords: "progresso estatisticas dashboard g p", icon: ICONS.progress, hint: "G P", action: () => showPage("progress") },
    ],
  },
  {
    label: "Ações rápidas",
    items: [
      { id: "action-new-event", label: "Novo compromisso",         keywords: "novo compromisso criar evento agendar n", icon: ICONS.plus, hint: "N", action: () => document.getElementById("btn-new-event")?.click() },
      { id: "action-start-session", label: "Iniciar sessão de estudo", keywords: "iniciar comecar sessao estudo cronometro", icon: ICONS.play, action: _startStudySession },
    ],
  },
  {
    label: "Buscar",
    items: [
      { id: "search-journal",      label: "Buscar no Diário",       keywords: "buscar procurar pesquisar diario", icon: ICONS.search, action: _openJournalSearch },
      { id: "search-appointments", label: "Buscar compromissos",    keywords: "buscar procurar pesquisar agenda compromissos", icon: ICONS.search, action: _openAppointmentsSearch },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.label })));

let overlay, inputEl, listEl, emptyEl, modal;
let _visibleItems = [];
let _activeIndex = -1;

function _normalize(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Fuzzy simples: prefixo > substring > subsequência de caracteres (na ordem
// digitada, não necessariamente contígua) — cobre erros de digitação leves
// sem trazer uma dependência externa para um app com poucas dezenas de
// comandos.
function _score(query, item) {
  const haystack = _normalize(`${item.label} ${item.keywords || ""}`);
  const q = _normalize(query);
  if (!q) return 0;
  const idx = haystack.indexOf(q);
  if (idx === 0) return 100;
  if (idx > 0) return 60 - Math.min(idx, 40);
  let cursor = 0;
  for (const ch of q) {
    const found = haystack.indexOf(ch, cursor);
    if (found === -1) return -Infinity;
    cursor = found + 1;
  }
  return 10 - cursor * 0.01;
}

function _filter(query) {
  if (!query.trim()) return ALL_ITEMS;
  return ALL_ITEMS
    .map(item => ({ item, score: _score(query, item) }))
    .filter(({ score }) => score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function _render(query) {
  _visibleItems = _filter(query);
  _activeIndex = _visibleItems.length ? 0 : -1;

  if (!_visibleItems.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    inputEl.removeAttribute("aria-activedescendant");
    return;
  }
  emptyEl.hidden = true;

  let html = "";
  let lastGroup = null;
  _visibleItems.forEach((item, i) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      html += `<li class="cp-group-label" role="presentation">${item.group}</li>`;
    }
    html += `
      <li id="cp-item-${i}" class="cp-item" role="option" data-index="${i}" aria-selected="${i === _activeIndex}">
        <span class="cp-item-icon" aria-hidden="true">${item.icon}</span>
        <span class="cp-item-label">${item.label}</span>
        ${item.hint ? `<span class="cp-item-hint">${item.hint}</span>` : ""}
      </li>`;
  });
  listEl.innerHTML = html;
  _syncActiveDescendant();
}

function _syncActiveDescendant() {
  listEl.querySelectorAll(".cp-item").forEach(el => {
    const isActive = Number(el.dataset.index) === _activeIndex;
    el.classList.toggle("cp-item--active", isActive);
    el.setAttribute("aria-selected", String(isActive));
  });
  if (_activeIndex >= 0) {
    inputEl.setAttribute("aria-activedescendant", `cp-item-${_activeIndex}`);
    listEl.querySelector(`#cp-item-${_activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  } else {
    inputEl.removeAttribute("aria-activedescendant");
  }
}

function _moveActive(delta) {
  if (!_visibleItems.length) return;
  _activeIndex = (_activeIndex + delta + _visibleItems.length) % _visibleItems.length;
  _syncActiveDescendant();
}

function _runActive() {
  const item = _visibleItems[_activeIndex];
  if (!item) return;
  closeCommandPalette();
  item.action();
}

function _ensureBuilt() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "modal-overlay command-palette-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Paleta de comando");
  overlay.innerHTML = `
    <div class="modal-card modal-lg command-palette-card">
      <div class="cp-search-row">
        <span class="cp-search-icon" aria-hidden="true">${ICONS.search}</span>
        <input type="text" id="cp-input" class="cp-input" placeholder="Digite um comando ou busque..."
               role="combobox" aria-expanded="true" aria-controls="cp-list" aria-autocomplete="list" autocomplete="off" />
      </div>
      <p class="cp-empty" id="cp-empty" hidden>Nenhum resultado encontrado.</p>
      <ul class="cp-list" id="cp-list" role="listbox" aria-label="Comandos"></ul>
      <div class="cp-footer">
        <span><kbd>&uarr;&darr;</kbd> navegar</span>
        <span><kbd>Enter</kbd> selecionar</span>
        <span><kbd>Esc</kbd> fechar</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  inputEl = overlay.querySelector("#cp-input");
  listEl  = overlay.querySelector("#cp-list");
  emptyEl = overlay.querySelector("#cp-empty");

  inputEl.addEventListener("input", () => _render(inputEl.value));

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); _moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); _moveActive(-1); }
    else if (e.key === "Enter") { e.preventDefault(); _runActive(); }
  });

  listEl.addEventListener("click", (e) => {
    const li = e.target.closest(".cp-item");
    if (!li) return;
    _activeIndex = Number(li.dataset.index);
    _runActive();
  });

  listEl.addEventListener("mousemove", (e) => {
    const li = e.target.closest(".cp-item");
    if (!li) return;
    const index = Number(li.dataset.index);
    if (index !== _activeIndex) { _activeIndex = index; _syncActiveDescendant(); }
  });

  // Sem trapRoot próprio: o único elemento focável do diálogo é o input de
  // busca (a lista é navegada por seta, não por Tab), então o Focus Trap
  // padrão de initModal() (Tab cicla dentro do overlay) já cobre o caso.
  modal = initModal(overlay, closeCommandPalette);
}

export function openCommandPalette() {
  _ensureBuilt();
  inputEl.value = "";
  _render("");
  modal.open(inputEl);
}

export function closeCommandPalette() {
  if (!overlay || overlay.hidden) return;
  modal.close();
}
