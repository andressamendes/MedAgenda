// ── activityHistoryView.js — Histórico global de Sessões de Atividade (F1.8) ─
// Tela apenas de consulta: carrega, renderiza e pagina o histórico de sessões
// já encerradas (finished/cancelled). Toda regra (o que entra no histórico,
// filtros, ordenação, paginação) mora em activitySessionService.listSessions()
// — este módulo não decide nada, só reflete o que o service retorna.
//
// Sem dashboard, sem gráficos, sem estatísticas agregadas: essa é a base que
// etapas futuras (dashboard/analytics/IA) vão consultar.
//
// F10 #4.2 — deixou de ser uma página própria (#page-history removido de
// index.html): agora é a visão "Canceladas"/"Todas" embutida dentro do
// Diário de Estudos (studyJournalView.js), que decide quando mostrar
// #sj-other-view (onde #ah-list/#ah-list-empty/#ah-load-more agora vivem)
// e controla o status exibido via setHistoryStatus(), exportada abaixo.
// Nenhuma lógica de carregamento/paginação/cache de eventos mudou — só o
// <div class="ah-filter-tabs"> próprio (com Todos/Finalizadas/Canceladas)
// foi removido e substituído pelo tab bar único do Diário, que nunca
// repassa "finished" para cá (essa é a visão rica do próprio Diário).

import { listSessions } from "./activitySessionService.js";
import { getEvents, getEventById } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { skeletonRowsMarkup } from "./skeletonView.js";
import { pad, escapeHtml } from "./utils.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

const PAGE_SIZE = 20;

const SESSION_STATUS_LABELS = {
  running:   "Em andamento",
  paused:    "Pausada",
  finished:  "Concluída",
  cancelled: "Cancelada",
};
const SESSION_SOURCE_LABELS = {
  manual: "Sessão manual",
  event:  "Iniciada pela agenda",
  quick:  "Sessão rápida",
};

let listEl, emptyEl, loadMoreBtn;

let _status  = "all";  // "all" | "finished" | "cancelled"
let _offset  = 0;
let _loading = false;

// Carregados uma vez por sessão de tela (não por item) — evita N+1: o
// histórico pode ter centenas de linhas apontando para dezenas de eventos.
// _eventsById é uma cache incremental (AUD-003): compromissos criados após
// esse carregamento inicial não estão aqui ainda, então _resolveMissingEvents
// busca sob demanda (por id) qualquer event_id referenciado por uma sessão
// que ainda não esteja no mapa, e guarda o resultado — inclusive `null`
// quando o compromisso não existe mais, para não repetir a busca a cada
// recarga. Como ids de eventos nunca são reaproveitados, um `null` cacheado
// é definitivo: nunca fica obsoleto.
let _eventsById     = new Map();
let _categoriesById = new Map();

// ── Sincronização com o barramento de eventos (F6.3) ────────────────────────
// A tela assina SessionStarted/Finished/Cancelled/Updated e recarrega sua
// própria lista (via listSessions() já existente) sempre que uma sessão muda
// de estado — nunca lê activitySessionService além dessa API pública. Pause/
// Resume não afetam o histórico (só sessões encerradas aparecem nele) e por
// isso não são assinados.
let _unsubscribers = [];
let _reloadTimer   = null;

// Vários eventos podem ser publicados em sequência imediata (ex.: Updated
// seguido de Finished, ao encerrar uma sessão). Em vez de recarregar a cada
// evento, agenda-se uma única recarga no próximo tick — se outro evento
// chegar antes do timer disparar, ele é ignorado (já há uma recarga pendente
// que vai refletir o estado mais recente de qualquer forma).
function _scheduleReload() {
  if (_reloadTimer) return;
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null;
    _loadPage(true);
  }, 0);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initActivityHistoryView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.STARTED, _scheduleReload),
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

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

// Busca sob demanda, por id, qualquer compromisso referenciado pelas
// sessões da página atual que ainda não esteja em _eventsById — sem isso,
// uma sessão finalizada logo após a criação do compromisso (que só existe
// no banco depois do carregamento inicial do cache) apareceria como
// "Compromisso removido" mesmo existindo (AUD-003). Só busca o que falta:
// nunca recarrega a lista inteira de eventos.
async function _resolveMissingEvents(sessions) {
  const missingIds = [...new Set(
    sessions
      .filter(s => s.event_id && !_eventsById.has(s.event_id))
      .map(s => s.event_id)
  )];
  if (missingIds.length === 0) return;

  const fetched = await Promise.all(missingIds.map(async id => {
    try {
      return await getEventById(id);
    } catch (err) {
      handleError(err, { context: "activityHistoryView.resolveMissingEvents", silent: true });
      return undefined; // falha na busca: não afirma que foi removido, tenta de novo na próxima recarga
    }
  }));

  missingIds.forEach((id, i) => {
    if (fetched[i] !== undefined) _eventsById.set(id, fetched[i]); // objeto encontrado, ou null (removido)
  });
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
  return { title: "Sessão sem compromisso", category: cat?.name || null };
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
    // Auditoria UX #20 — sem isto, a lista ficava em branco durante a
    // carga, diferente do Calendário (calendar.js/showLoading()).
    emptyEl.hidden = false;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
    emptyEl.innerHTML = skeletonRowsMarkup(4);
    loadMoreBtn.hidden = true;
  }

  try {
    const { sessions, hasMore } = await listSessions({ status: _status, limit: PAGE_SIZE, offset: _offset });
    _offset += sessions.length;
    await _resolveMissingEvents(sessions);

    if (reset && sessions.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Nenhuma sessão encontrada.";
    } else {
      emptyEl.hidden = true;
      _renderSessions(sessions);
      if (reset) revealWithAnimation(listEl);
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

// Chamada pelo Diário (studyJournalView.js) ao trocar de aba para
// "Canceladas"/"Todas" — nunca chamada com "finished" (essa é a visão rica
// do próprio Diário, que nem importa este módulo para isso).
export function setHistoryStatus(status) {
  if (status === _status) return;
  _status = status;
  _loadPage(true);
}

/**
 * Monta a tela (uma única vez) e carrega a primeira página do histórico.
 * Chamada a cada login (ver script.js/_initApp) — sempre recarrega do zero,
 * então nunca mostra dados de uma sessão de usuário anterior. Também assina
 * o barramento de eventos (F6.3) para manter a lista sincronizada sem exigir
 * reload da página.
 */
export async function initActivityHistoryView() {
  if (!listEl) {
    listEl      = document.getElementById("ah-list");
    emptyEl     = document.getElementById("ah-list-empty");
    loadMoreBtn = document.getElementById("ah-load-more");

    loadMoreBtn?.addEventListener("click", () => _loadPage(false));
  }

  _subscribeToEventBus();
  _status = "all";
  await _loadLookups();
  await _loadPage(true);
}

/**
 * Desfaz a assinatura do barramento de eventos e qualquer recarga pendente,
 * além de descartar o DOM renderizado e as caches em memória (_eventsById,
 * _categoriesById). Chamada no logout/troca de usuário (ver
 * script.js/onBeforeSignOut) — sem isso, os listeners registrados em
 * _subscribeToEventBus() sobreviveriam à troca de sessão e recarregariam a
 * lista com o usuário errado, e o histórico do usuário anterior permaneceria
 * visível no DOM durante a janela entre o logout e o próximo login (SPA sem
 * reload de página — mesma simetria init/reset da auditoria A1.3).
 */
export function resetActivityHistoryView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }
  if (listEl) listEl.innerHTML = "";
  if (emptyEl) {
    emptyEl.hidden = true;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
  }
  if (loadMoreBtn) loadMoreBtn.hidden = true;
  _eventsById     = new Map();
  _categoriesById = new Map();
  _status  = "all";
  _offset  = 0;
  _loading = false;
}
