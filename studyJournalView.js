// ── studyJournalView.js — Linha do Tempo da Aprendizagem (F8.1–F8.4) ───────
// Tela majoritariamente de consulta, foco narrativo: cada Sessão concluída
// vira um registro cronológico da jornada de estudo. Reutiliza
// exclusivamente activitySessionService.listSessions() (mesmo contrato
// paginado do Histórico, F1.8), eventService.getEvents() (metadados do
// compromisso), sessionQuestionsService.listQuestions() e
// reviewSessionService.listBySession() (F8.1) — nenhum acesso direto ao
// banco para esses dados, nenhum SQL novo, nenhum evento novo —
// sessionEventBus.js não é tocado, só assinado (mesmo padrão de
// activityHistoryView.js/F6.3).
//
// A única escrita desta tela é a Reflexão (F8.2), via
// studyReflectionService.js — um domínio próprio, separado de Observações
// (activity_sessions.notes): Observações representam o estudo, Reflexão
// representa a aprendizagem. Nenhum outro domínio (Dashboard, Insights, IA,
// Conquistas, Progresso, Estatísticas) é lido ou alterado por essa escrita.
//
// F8.3 — agrupamento por dia: puramente uma reorganização visual das mesmas
// sessões retornadas por listSessions() (já ordenadas started_at desc, ver
// activitySessionService.js). Nenhum dado novo é buscado ou persistido; data,
// contagem de sessões e tempo líquido do cabeçalho diário são derivados em
// memória das sessões já carregadas na página atual.
//
// F8.4 — filtros e navegação: período, matéria, categoria e busca textual
// operam inteiramente sobre `_allEntries`, o acumulado em memória das
// sessões (+ metadados do compromisso + questões/revisões/reflexão) já
// carregadas via "Carregar mais" — trocar um filtro nunca dispara uma nova
// chamada a listSessions()/getEvents()/listQuestions()/listBySession()/
// getBySession(); apenas re-renderiza o mesmo array já resolvido. As opções
// de matéria/categoria dos <select> são derivadas do próprio conjunto
// carregado (nenhuma consulta a subjectProgressService/categoryService).

import { listSessions } from "./activitySessionService.js";
import { getEvents } from "./eventService.js";
import { listQuestions } from "./sessionQuestionsService.js";
import { listBySession as listReviewsBySession } from "./reviewSessionService.js";
import { getBySession as getReflectionBySession, saveReflection } from "./studyReflectionService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { pad, localDate, escapeHtml } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

const PAGE_SIZE = 10;

// Rótulos de exibição — mesmos valores já usados em studySessionView.js
// (F7.4/F7.5) e permitidos pelos CHECK constraints de sql/15_questions.sql/
// sql/13_reviews.sql, nenhum valor novo.
const QUESTION_TYPE_LABELS = {
  multiple_choice: "Múltipla escolha",
  true_false:      "Verdadeiro/Falso",
  open:             "Dissertativa",
  flashcard:        "Flashcard",
};
const QUESTION_STATUS_LABELS = {
  pending:  "Pendente",
  answered: "Respondida",
  skipped:  "Pulada",
};
const REVIEW_STATUS_LABELS = {
  pending:   "Pendente",
  completed: "Concluída",
  skipped:   "Pulada",
};

let listEl, emptyEl, loadMoreBtn;
let periodSelect, subjectSelect, categorySelect, searchInput;

let _offset  = 0;
let _loading = false;

// Resolvido uma única vez por página carregada (não por cartão) — mesma
// otimização N+1 de activityHistoryView.js/_loadLookups().
let _eventsById = new Map();

let _unsubscribers = [];
let _reloadTimer   = null;

// Acumulado em memória de tudo que já foi carregado (todas as páginas até
// agora), na mesma ordem started_at desc devolvida por listSessions() — a
// base sobre a qual os filtros (F8.4) operam sem nenhuma consulta nova.
// Cada item: { session, meta, extras }.
let _allEntries = [];

// Estado dos filtros (F8.4) — puramente client-side, nenhum valor novo
// persistido. `search` já normalizado (trim + lowercase) ao ser lido do input.
let _filters = { period: "all", subject: "", category: "", search: "" };

function _scheduleReload() {
  if (_reloadTimer) return;
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null;
    _loadPage(true);
  }, 0);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initStudyJournalView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

async function _loadEventsLookup() {
  try {
    const events = await getEvents();
    _eventsById = new Map(events.map(e => [e.id, e]));
  } catch (err) {
    handleError(err, { context: "studyJournalView.loadEventsLookup", silent: true });
    _eventsById = new Map();
  }
}

// Mesmo mapeamento de sessionSummaryView.js/_render (F7.10): "matéria"
// reaproveita a mesma categoria do compromisso — o domínio ainda não tem um
// campo próprio de matéria (ver subjectProgressService.js).
function _resolveMeta(session) {
  const event = session.event_id ? _eventsById.get(session.event_id) : null;
  if (session.event_id && !event) {
    return { title: "Compromisso removido", category: null, subject: null, content: null };
  }
  return {
    title:   event?.title || "Sessão avulsa",
    category: event?.category || null,
    subject:  event?.category || null,
    content:  event?.description || null,
  };
}

function _formatDate(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _formatReviewDate(dateStr) {
  if (!dateStr) return "—";
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Agrupamento diário (F8.3) ───────────────────────────────────────────
// Chave/rótulo derivados apenas de started_at (data local) — mesma sessão,
// nenhum campo novo. "Hoje"/"Ontem" comparam por ano/mês/dia local, sem
// round-trip por ISO/UTC (evita virar o dia perto da meia-noite em fusos
// negativos).
function _dayKeyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _dayKey(iso) {
  return _dayKeyFromDate(new Date(iso));
}

function _dayLabel(iso) {
  const key = _dayKey(iso);
  const now = new Date();
  if (key === _dayKeyFromDate(now)) return "Hoje";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === _dayKeyFromDate(yesterday)) return "Ontem";
  return _formatDate(iso);
}

// ── Questões/Revisões da sessão (contagem no cartão + detalhamento) ────────
// O cartão precisa mostrar "quantidade de questões" e "quantidade de
// revisões" sem exigir que o usuário expanda o registro — por isso a busca
// acontece uma vez por sessão, junto com a página (não em N chamadas
// repetidas: cada sessão é buscada uma única vez, o resultado é reutilizado
// tanto para a contagem quanto para o detalhamento expandido, sem refazer a
// busca ao expandir).
async function _fetchSessionExtras(sessionId) {
  try {
    const [questions, reviews, reflection] = await Promise.all([
      listQuestions(sessionId),
      listReviewsBySession(sessionId),
      getReflectionBySession(sessionId),
    ]);
    return { questions, reviews, reflection };
  } catch (err) {
    handleError(err, { context: "studyJournalView.fetchSessionExtras", silent: true });
    return { questions: [], reviews: [], reflection: null, loadError: true };
  }
}

// ── Reflexão da sessão (F8.2) ────────────────────────────────────────────
// Bloco à parte de Observações: Observações vêm de activity_sessions.notes
// (o estudo em si), Reflexão vem de studyReflectionService.js (a
// aprendizagem) — nunca a mesma fonte, nunca o mesmo domínio.

function _renderReflectionView(sectionEl, entry, reflection) {
  sectionEl.innerHTML = `
    ${reflection
      ? `<p class="sj-reflection-text">${escapeHtml(reflection.content)}</p>`
      : `<p class="sj-detail-empty">Sem reflexão.</p>`}
    <button type="button" class="btn btn-ghost btn-sm sj-reflection-toggle">
      ${reflection ? "Editar reflexão" : "Adicionar reflexão"}
    </button>
  `;
  sectionEl.querySelector(".sj-reflection-toggle")
    .addEventListener("click", () => _renderReflectionForm(sectionEl, entry, reflection));
}

function _renderReflectionForm(sectionEl, entry, reflection) {
  sectionEl.innerHTML = `
    <textarea class="sj-reflection-input" rows="4">${reflection ? escapeHtml(reflection.content) : ""}</textarea>
    <p class="sj-reflection-error" hidden></p>
    <div class="sj-reflection-actions">
      <button type="button" class="btn btn-primary btn-sm sj-reflection-save">Salvar</button>
      <button type="button" class="btn btn-ghost btn-sm sj-reflection-cancel">Cancelar</button>
    </div>
  `;

  const textarea = sectionEl.querySelector(".sj-reflection-input");
  const errorEl  = sectionEl.querySelector(".sj-reflection-error");

  sectionEl.querySelector(".sj-reflection-cancel")
    .addEventListener("click", () => _renderReflectionView(sectionEl, entry, reflection));

  sectionEl.querySelector(".sj-reflection-save").addEventListener("click", async () => {
    errorEl.hidden = true;
    try {
      const saved = await saveReflection(entry.session.id, textarea.value);
      // Mantém _allEntries consistente (mesmo objeto usado pela busca
      // textual do F8.4) sem refazer getBySession — a resposta de
      // saveReflection já é a reflexão salva.
      entry.extras.reflection = saved;
      _renderReflectionView(sectionEl, entry, saved);
    } catch (err) {
      const { friendly } = handleError(err, { context: "studyJournalView.saveReflection", silent: true });
      errorEl.textContent = friendly;
      errorEl.hidden = false;
    }
  });
}

function _renderDetail(detailEl, questions, reviews, notes) {
  const questionsHtml = questions.length
    ? `<ul class="sj-detail-items">${questions.map(q => `
        <li class="sj-detail-item">
          <span>${QUESTION_TYPE_LABELS[q.question_type] || q.question_type}</span>
          <span>${QUESTION_STATUS_LABELS[q.status] || q.status}</span>
          ${[q.subject, q.topic].filter(Boolean).map(escapeHtml).join(" — ")}
        </li>`).join("")}</ul>`
    : `<p class="sj-detail-empty">Nenhuma questão registrada.</p>`;

  const reviewsHtml = reviews.length
    ? `<ul class="sj-detail-items">${reviews.map(r => `
        <li class="sj-detail-item">
          <span>${_formatReviewDate(r.scheduled_date)}</span>
          <span class="review-status review-status--${r.status}">${REVIEW_STATUS_LABELS[r.status] || r.status}</span>
        </li>`).join("")}</ul>`
    : `<p class="sj-detail-empty">Nenhuma revisão vinculada.</p>`;

  const notesHtml = notes
    ? `<p class="sj-detail-notes">${escapeHtml(notes)}</p>`
    : `<p class="sj-detail-empty">Nenhuma observação registrada.</p>`;

  detailEl.innerHTML = `
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Questões</h3>
      ${questionsHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Revisões</h3>
      ${reviewsHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Observações</h3>
      ${notesHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Reflexão</h3>
      <div class="sj-reflection"></div>
    </div>
  `;
}

function _toggleEntry(toggleBtn, detailEl) {
  const expand = detailEl.hidden;
  detailEl.hidden = !expand;
  toggleBtn.setAttribute("aria-expanded", String(expand));
  toggleBtn.textContent = expand ? "Recolher" : "Detalhar";
}

// Cabeçalho do grupo diário: data, quantidade de sessões e tempo líquido —
// tudo somado a partir das sessões já anexadas ao grupo (nenhuma consulta
// extra; duration_minutes já vem de listSessions/ver F7.7 desconto de pausas).
function _updateGroupHeader(group) {
  const totalMinutes = group.sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  group.countEl.textContent = `${group.sessions.length} sessão(ões)`;
  group.durationEl.textContent = _formatDuration(totalMinutes);
}

function _createDayGroup(iso) {
  const li = document.createElement("li");
  li.className = "sj-day-group";
  li.innerHTML = `
    <div class="sj-day-header">
      <span class="sj-day-header-date">${escapeHtml(_dayLabel(iso))}</span>
      <span class="sj-day-header-count"></span>
      <span class="sj-day-header-duration"></span>
    </div>
    <ul class="sj-day-sessions"></ul>
  `;
  listEl.appendChild(li);

  return {
    key: _dayKey(iso),
    sessions: [],
    countEl: li.querySelector(".sj-day-header-count"),
    durationEl: li.querySelector(".sj-day-header-duration"),
    sessionsEl: li.querySelector(".sj-day-sessions"),
  };
}

function _buildEntryEl(entry) {
  const { session: s, meta, extras } = entry;
  const { questions, reviews, reflection } = extras;

  const li = document.createElement("li");
  li.className = "sj-entry";
  li.innerHTML = `
    <div class="sj-entry-header">
      <div class="sj-entry-title-row">
        <span class="ah-item-title">${escapeHtml(meta.title)}</span>
        ${meta.category ? `<span class="ah-item-category">· ${escapeHtml(meta.category)}</span>` : ""}
      </div>
      <button type="button" class="btn btn-ghost btn-sm sj-toggle" aria-expanded="false">Detalhar</button>
    </div>
    <div class="session-history-row session-history-meta">
      <span class="session-history-date">${_formatDate(s.started_at)}</span>
      <span>${_formatTime(s.started_at)} – ${_formatTime(s.ended_at)}</span>
      <span>${_formatDuration(s.duration_minutes)}</span>
    </div>
    <div class="session-history-row session-history-meta">
      <span>Matéria: ${meta.subject ? escapeHtml(meta.subject) : "—"}</span>
      <span>Conteúdo: ${meta.content ? escapeHtml(meta.content) : "—"}</span>
    </div>
    <div class="session-history-row session-history-meta">
      <span>${questions.length} questão(ões)</span>
      <span>${reviews.length} revisão(ões)</span>
    </div>
    <div class="sj-entry-detail" hidden></div>
  `;

  const toggleBtn = li.querySelector(".sj-toggle");
  const detailEl  = li.querySelector(".sj-entry-detail");
  _renderDetail(detailEl, questions, reviews, s.notes);
  _renderReflectionView(detailEl.querySelector(".sj-reflection"), entry, reflection);
  toggleBtn.addEventListener("click", () => _toggleEntry(toggleBtn, detailEl));

  return li;
}

function _renderLoadError({ state, message }) {
  emptyEl.hidden = false;
  emptyEl.classList.add("list-error");
  renderStateBlock(emptyEl, { state, message, onRetry: () => _loadPage(true) });
}

// ── Filtros (F8.4) ───────────────────────────────────────────────────────
// Tudo abaixo opera exclusivamente sobre `_allEntries` (já em memória) —
// trocar um filtro nunca chama nenhum dos services novamente.

function _periodStart(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") return today;
  if (period === "7d")  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  if (period === "30d") return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return null; // "all"
}

function _matchesFilters(entry) {
  const { session: s, meta, extras } = entry;

  const periodStart = _periodStart(_filters.period);
  if (periodStart && new Date(s.started_at) < periodStart) return false;

  if (_filters.subject && meta.subject !== _filters.subject) return false;
  if (_filters.category && meta.category !== _filters.category) return false;

  if (_filters.search) {
    const haystack = [meta.title, meta.content, s.notes, extras.reflection?.content]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase();
    if (!haystack.includes(_filters.search)) return false;
  }

  return true;
}

// Opções de matéria/categoria derivadas do próprio conjunto já carregado —
// nenhuma consulta a categoryService/subjectProgressService.
function _collectFieldValues(field) {
  const values = new Set();
  _allEntries.forEach(entry => {
    if (entry.meta[field]) values.add(entry.meta[field]);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function _populateSelect(selectEl, values, allLabel) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${allLabel}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  selectEl.value = values.includes(current) ? current : "";
}

function _refreshFilterOptions() {
  _populateSelect(subjectSelect, _collectFieldValues("subject"), "Todas as matérias");
  _populateSelect(categorySelect, _collectFieldValues("category"), "Todas as categorias");
}

function _onFilterChange() {
  _filters = {
    period: periodSelect.value,
    subject: subjectSelect.value,
    category: categorySelect.value,
    search: searchInput.value.trim().toLowerCase(),
  };
  _render();
}

function _bindFilters() {
  periodSelect?.addEventListener("change", _onFilterChange);
  subjectSelect?.addEventListener("change", _onFilterChange);
  categorySelect?.addEventListener("change", _onFilterChange);
  searchInput?.addEventListener("input", _onFilterChange);
}

// ── Renderização (F8.3 + F8.4) ──────────────────────────────────────────
// Reconstrói a lista inteira a partir de `_allEntries` filtrado — mesma
// ordem started_at desc já devolvida por listSessions(), então o
// agrupamento por dia continua correto mesmo após um filtro remover
// sessões de um grupo (o grupo simplesmente não é recriado).
function _render() {
  listEl.innerHTML = "";
  const filtered = _allEntries.filter(_matchesFilters);

  if (filtered.length === 0) {
    emptyEl.hidden = false;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
    emptyEl.textContent = _allEntries.length === 0
      ? "Nenhuma sessão de estudo registrada ainda."
      : "Nenhuma sessão encontrada para os filtros selecionados.";
    return;
  }

  emptyEl.hidden = true;

  let openGroup = null;
  filtered.forEach(entry => {
    const dayKey = _dayKey(entry.session.started_at);
    if (!openGroup || openGroup.key !== dayKey) {
      openGroup = _createDayGroup(entry.session.started_at);
    }
    openGroup.sessionsEl.appendChild(_buildEntryEl(entry));
    openGroup.sessions.push(entry.session);
    _updateGroupHeader(openGroup);
  });
}

async function _loadEntriesData(sessions) {
  const extrasList = await Promise.all(sessions.map(s => _fetchSessionExtras(s.id)));
  sessions.forEach((s, i) => {
    _allEntries.push({ session: s, meta: _resolveMeta(s), extras: extrasList[i] });
  });
}

async function _loadPage(reset) {
  if (_loading) return;
  _loading = true;

  if (reset) {
    _offset = 0;
    _allEntries = [];
    listEl.innerHTML = "";
    emptyEl.hidden = true;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
    loadMoreBtn.hidden = true;
  }

  try {
    const { sessions, hasMore } = await listSessions({ status: "finished", limit: PAGE_SIZE, offset: _offset });
    _offset += sessions.length;

    if (reset && sessions.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Nenhuma sessão de estudo registrada ainda.";
    } else {
      await _loadEntriesData(sessions);
      _refreshFilterOptions();
      _render();
    }
    loadMoreBtn.hidden = !hasMore;
  } catch (err) {
    const errorState = errorToState(handleError(err, { context: "studyJournalView.load", silent: true }));
    if (reset) {
      _renderLoadError(errorState);
    } else {
      loadMoreBtn.hidden = false;
    }
  } finally {
    _loading = false;
  }
}

/**
 * Monta a tela (uma única vez) e carrega a primeira página do Diário.
 * Chamada a cada login (ver script.js/_initApp) — sempre recarrega do zero.
 */
export async function initStudyJournalView() {
  if (!listEl) {
    listEl      = document.getElementById("sj-list");
    emptyEl     = document.getElementById("sj-list-empty");
    loadMoreBtn = document.getElementById("sj-load-more");

    periodSelect   = document.getElementById("sj-filter-period");
    subjectSelect  = document.getElementById("sj-filter-subject");
    categorySelect = document.getElementById("sj-filter-category");
    searchInput    = document.getElementById("sj-filter-search");

    loadMoreBtn?.addEventListener("click", () => _loadPage(false));
    _bindFilters();
  }

  _subscribeToEventBus();
  await _loadEventsLookup();
  await _loadPage(true);
}

/**
 * Desfaz a assinatura do barramento de eventos e qualquer recarga pendente.
 * Chamada no logout/troca de usuário (ver script.js/onBeforeSignOut).
 */
export function resetStudyJournalView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }

  // Filtros voltam ao padrão no próximo login — nenhum filtro fica preso
  // entre usuários diferentes na mesma sessão do navegador.
  _filters = { period: "all", subject: "", category: "", search: "" };
  if (periodSelect)   periodSelect.value = "all";
  if (subjectSelect)  subjectSelect.value = "";
  if (categorySelect) categorySelect.value = "";
  if (searchInput)    searchInput.value = "";
}
