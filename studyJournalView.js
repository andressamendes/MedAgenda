// ── studyJournalView.js — Diário de Estudos (F8.1) ──────────────────────────
// Tela apenas de consulta, foco narrativo: cada Sessão concluída vira um
// registro cronológico da jornada de estudo. Nenhum dado novo é persistido
// e nenhum domínio existente é alterado — este módulo só organiza o que já
// existe, reutilizando exclusivamente activitySessionService.listSessions()
// (mesmo contrato paginado do Histórico, F1.8), eventService.getEvents()
// (metadados do compromisso), sessionQuestionsService.listQuestions() e
// reviewSessionService.listBySession() (F8.1). Nenhum acesso direto ao
// banco, nenhum SQL novo, nenhum evento novo — sessionEventBus.js não é
// tocado, só assinado (mesmo padrão de activityHistoryView.js/F6.3).

import { listSessions } from "./activitySessionService.js";
import { getEvents } from "./eventService.js";
import { listQuestions } from "./sessionQuestionsService.js";
import { listBySession as listReviewsBySession } from "./reviewSessionService.js";
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

let _offset  = 0;
let _loading = false;

// Resolvido uma única vez por página carregada (não por cartão) — mesma
// otimização N+1 de activityHistoryView.js/_loadLookups().
let _eventsById = new Map();

let _unsubscribers = [];
let _reloadTimer   = null;

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

// ── Questões/Revisões da sessão (contagem no cartão + detalhamento) ────────
// O cartão precisa mostrar "quantidade de questões" e "quantidade de
// revisões" sem exigir que o usuário expanda o registro — por isso a busca
// acontece uma vez por sessão, junto com a página (não em N chamadas
// repetidas: cada sessão é buscada uma única vez, o resultado é reutilizado
// tanto para a contagem quanto para o detalhamento expandido, sem refazer a
// busca ao expandir).
async function _fetchSessionExtras(sessionId) {
  try {
    const [questions, reviews] = await Promise.all([
      listQuestions(sessionId),
      listReviewsBySession(sessionId),
    ]);
    return { questions, reviews };
  } catch (err) {
    handleError(err, { context: "studyJournalView.fetchSessionExtras", silent: true });
    return { questions: [], reviews: [], loadError: true };
  }
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
  `;
}

function _toggleEntry(toggleBtn, detailEl) {
  const expand = detailEl.hidden;
  detailEl.hidden = !expand;
  toggleBtn.setAttribute("aria-expanded", String(expand));
  toggleBtn.textContent = expand ? "Recolher" : "Detalhar";
}

async function _renderSessions(sessions) {
  const extras = await Promise.all(sessions.map(s => _fetchSessionExtras(s.id)));

  sessions.forEach((s, i) => {
    const meta = _resolveMeta(s);
    const { questions, reviews } = extras[i];
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
    toggleBtn.addEventListener("click", () => _toggleEntry(toggleBtn, detailEl));

    listEl.appendChild(li);
  });
}

function _renderLoadError({ state, message }) {
  emptyEl.hidden = false;
  emptyEl.classList.add("list-error");
  renderStateBlock(emptyEl, { state, message, onRetry: () => _loadPage(true) });
}

async function _loadPage(reset) {
  if (_loading) return;
  _loading = true;

  if (reset) {
    _offset = 0;
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
      await _renderSessions(sessions);
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

    loadMoreBtn?.addEventListener("click", () => _loadPage(false));
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
}
