// ── activityHistoryView.js — Histórico global de Sessões de Atividade (F1.8) ─
// Tela apenas de consulta: carrega, renderiza e pagina o histórico de sessões
// já encerradas (finished/cancelled). Toda regra (o que entra no histórico,
// filtros, ordenação, paginação) mora em activitySessionService.listSessions()
// — este módulo não decide nada, só reflete o que o service retorna.
//
// Sem dashboard, sem gráficos, sem estatísticas agregadas: essa é a base que
// etapas futuras (dashboard/analytics/IA) vão consultar.

import { listSessions } from "./activitySessionService.js";
import { getEvents } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { pad, escapeHtml } from "./utils.js";

const PAGE_SIZE = 20;

const SESSION_STATUS_LABELS = {
  running:   "Em andamento",
  paused:    "Pausada",
  finished:  "Concluída",
  cancelled: "Cancelada",
};
const SESSION_SOURCE_LABELS = {
  manual: "Manual",
  event:  "Compromisso",
  quick:  "Rápida",
};

let tabsEl, listEl, emptyEl, loadMoreBtn;

let _status  = "all";  // "all" | "finished" | "cancelled"
let _offset  = 0;
let _loading = false;

// Resolvidos uma única vez por sessão de tela (não por item) — evita N+1:
// o histórico pode ter centenas de linhas apontando para dezenas de eventos.
let _eventsById     = new Map();
let _categoriesById = new Map();

async function _loadLookups() {
  try {
    const [events, categories] = await Promise.all([getEvents(), getCategories()]);
    _eventsById     = new Map(events.map(e => [e.id, e]));
    _categoriesById = new Map(categories.map(c => [c.id, c]));
  } catch (err) {
    handleError(err, { context: "activityHistoryView.loadLookups", silent: true });
    _eventsById     = new Map();
    _categoriesById = new Map();
  }
}

// Título/categoria são só para exibição — nunca persistidos na sessão além
// dos ids que o service já grava (mesmo princípio de activitySessionView.js).
function _resolveMeta(session) {
  if (session.event_id) {
    const ev = _eventsById.get(session.event_id);
    return ev
      ? { title: ev.title, category: ev.category || null }
      : { title: "Compromisso removido", category: null };
  }
  const cat = session.category_id ? _categoriesById.get(session.category_id) : null;
  return { title: "Sessão avulsa", category: cat?.name || null };
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

function _renderSessions(sessions) {
  for (const s of sessions) {
    const meta = _resolveMeta(s);
    const li = document.createElement("li");
    li.className = "session-history-item";
    li.innerHTML = `
      <div class="session-history-row">
        <span class="ah-item-title">${escapeHtml(meta.title)}${
          meta.category ? ` <span class="ah-item-category">· ${escapeHtml(meta.category)}</span>` : ""
        }</span>
        <span class="session-history-status session-history-status--${s.status}">${SESSION_STATUS_LABELS[s.status] || s.status}</span>
      </div>
      <div class="session-history-row session-history-meta">
        <span>${_formatDate(s.started_at)}</span>
        <span>${_formatTime(s.started_at)} – ${_formatTime(s.ended_at)}</span>
        <span>${_formatDuration(s.duration_minutes)}</span>
        <span>${SESSION_SOURCE_LABELS[s.source] || s.source}</span>
      </div>
      ${s.notes ? `<p class="session-history-notes">${escapeHtml(s.notes)}</p>` : ""}
    `;
    listEl.appendChild(li);
  }
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
    const { sessions, hasMore } = await listSessions({ status: _status, limit: PAGE_SIZE, offset: _offset });
    _offset += sessions.length;

    if (reset && sessions.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Nenhuma sessão encontrada.";
    } else {
      _renderSessions(sessions);
    }
    loadMoreBtn.hidden = !hasMore;
  } catch (err) {
    const errorState = errorToState(handleError(err, { context: "activityHistoryView.load", silent: true }));
    if (reset) {
      _renderLoadError(errorState);
    } else {
      // Falha ao carregar mais: preserva a lista já renderizada e deixa o
      // botão visível para o usuário tentar novamente.
      loadMoreBtn.hidden = false;
    }
  } finally {
    _loading = false;
  }
}

function _setStatus(status) {
  if (status === _status) return;
  _status = status;
  tabsEl.querySelectorAll(".ah-filter-tab").forEach(btn => {
    const active = btn.dataset.status === status;
    btn.classList.toggle("ah-filter-tab--active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  _loadPage(true);
}

/**
 * Monta a tela (uma única vez) e carrega a primeira página do histórico.
 * Chamada a cada login (ver script.js/_initApp) — sempre recarrega do zero,
 * então nunca mostra dados de uma sessão de usuário anterior.
 */
export async function initActivityHistoryView() {
  if (!listEl) {
    tabsEl      = document.getElementById("ah-filter-tabs");
    listEl      = document.getElementById("ah-list");
    emptyEl     = document.getElementById("ah-list-empty");
    loadMoreBtn = document.getElementById("ah-load-more");

    tabsEl?.querySelectorAll(".ah-filter-tab").forEach(btn => {
      btn.addEventListener("click", () => _setStatus(btn.dataset.status));
    });
    loadMoreBtn?.addEventListener("click", () => _loadPage(false));
  }

  _status = "all";
  await _loadLookups();
  await _loadPage(true);
}
