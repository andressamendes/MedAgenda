// ── studySessionView.js — Tela de Sessão de Estudo (F7.2) ───────────────────
// Substitui o antigo cronômetro global (activitySessionView.js, F1.3): o
// cronômetro agora só existe aqui, na página dedicada "Sessão de Estudo".
// Nenhuma regra de negócio foi movida — toda transição de estado, cálculo de
// duração e evento publicado continua vindo de activitySessionService.js via
// sessionEventBus.js. Este módulo só renderiza o que o domínio retorna e reage
// a cliques, seguindo o mesmo princípio de activitySessionView.js/
// activityHistoryView.js.
//
// Diferença chave em relação ao widget antigo: em vez de esperar clique local
// para saber que algo mudou, a tela assina SESSION_EVENTS e se atualiza
// sozinha (F6.2) — reflete até starts/pauses/finishes disparados por outra
// aba/fluxo (ex.: "Iniciar Sessão" no formulário de compromisso).

import {
  getRunningSession,
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
  cancelSession,
} from "./activitySessionService.js";
import { getEventById } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { confirmDialog } from "./confirmDialog.js";
import { initModal } from "./modalController.js";
import { handleError } from "./errorService.js";
import { pad } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

const TICK_MS = 1000;

let emptyEl, emptyMessageEl, btnStartStandalone;
let activeEl, statusBadgeEl, timeEl, pauseNoteEl;
let titleEl, categoryEl, subjectEl, contentEl, objectiveEl, startedAtEl, expectedDurationEl;
let btnPause, btnResume, btnCancel, btnFinish;

// Modal de encerramento (F7.3) — resumo somente leitura + confirmação, entre
// clicar em "Finalizar" e de fato chamar activitySessionService.finishSession().
let finishModalEl, finishModal;
let ssfTitleEl, ssfCategoryEl, ssfSubjectEl, ssfContentEl, ssfStartedAtEl, ssfEndedAtEl, ssfNetTimeEl, ssfTotalDurationEl;
let ssfNotesEl, ssfBtnAddQuestions, ssfBtnBack, ssfBtnConfirm;

let _session   = null; // fonte da verdade: a última linha conhecida do banco
let _eventMeta = null; // { title, category, duration_minutes } — só para exibição
let _tickId    = null;
let _busy      = false; // evita cliques duplicados durante uma chamada em andamento
let _unsubscribers = [];
let _pendingEndedAt = null; // horário de término congelado ao abrir o resumo, reaproveitado na confirmação

function _queryElements() {
  emptyEl             = document.getElementById("ss-empty");
  emptyMessageEl      = document.getElementById("ss-empty-message");
  btnStartStandalone  = document.getElementById("ss-btn-start-standalone");

  activeEl            = document.getElementById("ss-active");
  statusBadgeEl        = document.getElementById("ss-status-badge");
  timeEl               = document.getElementById("ss-time");
  pauseNoteEl          = document.getElementById("ss-pause-note");

  titleEl              = document.getElementById("ss-event-title");
  categoryEl           = document.getElementById("ss-category");
  subjectEl            = document.getElementById("ss-subject");
  contentEl            = document.getElementById("ss-content");
  objectiveEl          = document.getElementById("ss-objective");
  startedAtEl          = document.getElementById("ss-started-at");
  expectedDurationEl   = document.getElementById("ss-expected-duration");

  btnPause  = document.getElementById("ss-btn-pause");
  btnResume = document.getElementById("ss-btn-resume");
  btnCancel = document.getElementById("ss-btn-cancel");
  btnFinish = document.getElementById("ss-btn-finish");

  finishModalEl      = document.getElementById("ss-finish-modal");
  ssfTitleEl          = document.getElementById("ssf-event-title");
  ssfCategoryEl        = document.getElementById("ssf-category");
  ssfSubjectEl         = document.getElementById("ssf-subject");
  ssfContentEl         = document.getElementById("ssf-content");
  ssfStartedAtEl       = document.getElementById("ssf-started-at");
  ssfEndedAtEl         = document.getElementById("ssf-ended-at");
  ssfNetTimeEl         = document.getElementById("ssf-net-time");
  ssfTotalDurationEl   = document.getElementById("ssf-total-duration");
  ssfNotesEl           = document.getElementById("ssf-notes");
  ssfBtnAddQuestions   = document.getElementById("ssf-btn-add-questions");
  ssfBtnBack           = document.getElementById("ssf-btn-back");
  ssfBtnConfirm        = document.getElementById("ssf-btn-confirm");

  finishModal = initModal(finishModalEl, _closeFinishModal);
}

function _bindEvents() {
  btnStartStandalone.addEventListener("click", () => _run(() => startSession({ source: "manual" })));
  btnPause.addEventListener("click",  () => _run(() => pauseSession(_session.id)));
  btnResume.addEventListener("click", () => _run(() => resumeSession(_session.id)));
  btnFinish.addEventListener("click", () => _openFinishModal());
  btnCancel.addEventListener("click", async () => {
    if (_busy || !_session) return;
    const shouldCancel = await confirmDialog({
      title:       "Cancelar sessão",
      message:     "A sessão será encerrada como cancelada e não entrará nas suas estatísticas de execução. Deseja continuar?",
      confirmText: "Cancelar sessão",
      cancelText:  "Voltar",
      danger:      true,
    });
    if (shouldCancel) await _run(() => cancelSession(_session.id));
  });

  ssfBtnBack.addEventListener("click", () => _closeFinishModal());
  ssfBtnAddQuestions.addEventListener("click", () => {}); // placeholder — cadastro de questões fica para etapa futura
  ssfBtnConfirm.addEventListener("click", () => _confirmFinish());
}

function _formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function _formatClockTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatExpectedDuration(minutes) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// O tempo exibido é sempre recalculado a partir de started_at (o banco é a
// fonte da verdade) — o timer local só decide QUANDO redesenhar, nunca o
// valor em si (mesmo princípio do widget antigo, ver F1.3).
function _renderTime() {
  if (!_session) return;
  timeEl.textContent = _formatElapsed(Date.now() - new Date(_session.started_at).getTime());
}

function _stopTicking() {
  if (_tickId) { clearInterval(_tickId); _tickId = null; }
}

function _startTicking() {
  _stopTicking();
  _renderTime();
  _tickId = setInterval(_renderTime, TICK_MS);
  _tickId.unref?.(); // no-op em browser; evita segurar o processo vivo nos testes
}

function _render() {
  const status = _session?.status ?? null;

  emptyEl.hidden  = !!_session;
  activeEl.hidden = !_session;
  if (!_session) {
    _stopTicking();
    return;
  }

  statusBadgeEl.textContent = status === "running" ? "Executando" : "Pausada";
  statusBadgeEl.className   = `ss-status-badge ss-status-badge--${status}`;

  btnPause.hidden  = status !== "running";
  btnFinish.hidden = false;
  btnResume.hidden = status !== "paused";
  btnCancel.hidden = status !== "paused";

  // Limitação conhecida (ver activitySessionService.js): o modelo não
  // acumula tempo pausado separadamente, então a duração final de
  // finishSession() sempre inclui qualquer intervalo em pausa.
  pauseNoteEl.hidden = status !== "paused";

  titleEl.textContent    = _eventMeta?.title || "Sessão avulsa";
  categoryEl.textContent = _eventMeta?.category || "—";
  subjectEl.textContent  = _eventMeta?.category || "—"; // domínio ainda não tem campo próprio de matéria (ver subjectProgressService.js)
  contentEl.textContent  = _eventMeta?.description || "—";
  objectiveEl.textContent = "—"; // sem campo de objetivo no domínio atual — reservado para etapa futura
  startedAtEl.textContent = _formatClockTime(_session.started_at);
  expectedDurationEl.textContent = _formatExpectedDuration(_eventMeta?.duration_minutes);

  if (status === "running") {
    _startTicking();
  } else {
    _stopTicking();
    _renderTime(); // último valor exibido antes de congelar
  }
}

// Aplica o resultado (vindo do service ou do barramento) ao estado da tela,
// limpando os metadados de exibição do evento quando a sessão deixa de existir.
function _applySession(session) {
  _session = session;
  if (!_session || _session.status === "finished" || _session.status === "cancelled") {
    _session   = null;
    _eventMeta = null;
  }
  _render();
}

// Resolve título/categoria/descrição/duração prevista para exibição a partir
// do event_id gravado na sessão — usado ao restaurar após reload e sempre que
// o barramento notifica uma mudança (ver F1.4/activitySessionView.js original).
async function _resolveEventMeta(session) {
  if (!session?.event_id) return null;
  try {
    const ev = await getEventById(session.event_id);
    return ev
      ? { title: ev.title, category: ev.category || null, description: ev.description || null, duration_minutes: ev.duration_minutes || null }
      : { title: "Compromisso removido", category: null, description: null, duration_minutes: null };
  } catch (err) {
    handleError(err, { context: "studySessionView.resolveEventMeta" });
    return { title: "Compromisso removido", category: null, description: null, duration_minutes: null };
  }
}

async function _resolveCategoryId(categoryName) {
  if (!categoryName) return null;
  try {
    const categories = await getCategories();
    return categories.find(c => c.name === categoryName)?.id ?? null;
  } catch {
    return null;
  }
}

function _setActionsDisabled(disabled) {
  [btnStartStandalone, btnPause, btnResume, btnCancel, btnFinish].forEach(b => { b.disabled = disabled; });
}

// Executa uma ação de domínio, atualizando a tela a partir do resultado (ou
// preservando o estado anterior em caso de erro — nunca deixa a UI travada
// num estado que não corresponde ao banco).
async function _run(action) {
  if (_busy) return;
  _busy = true;
  _setActionsDisabled(true);
  try {
    const session = await action();
    _eventMeta = await _resolveEventMeta(session);
    _applySession(session);
  } catch (err) {
    handleError(err, { context: "studySessionView" });
  } finally {
    _busy = false;
    _setActionsDisabled(false);
  }
}

// ── Encerramento da sessão (F7.3) ───────────────────────────────────────────
// "Finalizar" nunca chama activitySessionService.finishSession() direto: antes
// abre este resumo (somente leitura, sem cálculo novo — os mesmos campos que
// finishSession() usaria) para o usuário revisar e confirmar. O horário de
// término é congelado no momento em que o resumo abre e reaproveitado, sem
// mudanças, na chamada de confirmação — o que a tela mostra é exatamente o
// que será persistido.

// Espelha a fórmula de duração de activitySessionService.finishSession() só
// para exibição — não introduz uma regra nova, e o mesmo valor (em minutos) é
// o que será de fato enviado a finishSession() ao confirmar.
function _minutesBetween(startIso, endedAtDate) {
  return Math.max(0, Math.round((endedAtDate - new Date(startIso)) / 60000));
}

function _openFinishModal() {
  if (_busy || !_session) return;

  _pendingEndedAt = new Date();
  const netMinutes = _minutesBetween(_session.started_at, _pendingEndedAt);

  ssfTitleEl.textContent    = _eventMeta?.title || "Sessão avulsa";
  ssfCategoryEl.textContent = _eventMeta?.category || "—";
  ssfSubjectEl.textContent  = _eventMeta?.category || "—"; // ver studySessionView.js:_render — domínio ainda não tem campo próprio de matéria
  ssfContentEl.textContent  = _eventMeta?.description || "—";
  ssfStartedAtEl.textContent     = _formatClockTime(_session.started_at);
  ssfEndedAtEl.textContent       = _formatClockTime(_pendingEndedAt.toISOString());
  ssfNetTimeEl.textContent       = _formatExpectedDuration(netMinutes);
  ssfTotalDurationEl.textContent = _formatExpectedDuration(netMinutes);
  ssfNotesEl.value = "";

  finishModal.open(ssfBtnBack);
}

function _closeFinishModal() {
  _pendingEndedAt = null;
  finishModal.close();
}

async function _confirmFinish() {
  if (_busy || !_session || !_pendingEndedAt) return;
  const endedAt = _pendingEndedAt;
  await _run(() => finishSession(_session.id, endedAt));
  _closeFinishModal();
}

// Recarrega a partir de um evento do barramento — nunca assume que o payload
// já traz tudo que a tela precisa exibir (ex.: SessionStarted disparado pelo
// formulário de compromisso não conhece o título do evento).
async function _handleBusEvent({ session }) {
  if (_busy) return; // uma ação local já vai atualizar a tela ao terminar
  _eventMeta = await _resolveEventMeta(session);
  _applySession(session);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initStudySessionView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.STARTED,   _handleBusEvent),
    subscribe(SESSION_EVENTS.PAUSED,    _handleBusEvent),
    subscribe(SESSION_EVENTS.RESUMED,   _handleBusEvent),
    subscribe(SESSION_EVENTS.FINISHED,  _handleBusEvent),
    subscribe(SESSION_EVENTS.CANCELLED, _handleBusEvent),
    subscribe(SESSION_EVENTS.UPDATED,   _handleBusEvent),
  ];
}

/**
 * Monta a tela (uma única vez) e restaura, se existir, a sessão em andamento
 * do usuário atual — reabrir a página (ou recarregar o app) nunca deve fazer
 * o usuário perder uma sessão ativa nem o contexto do compromisso vinculado.
 * Também assina o barramento de eventos (F6.2) para manter a tela sincronizada
 * sem polling e sem recarga completa.
 */
export async function initStudySessionView() {
  if (!emptyEl) {
    _queryElements();
    _bindEvents();
  }

  _subscribeToEventBus();

  try {
    _session   = await getRunningSession();
    _eventMeta = await _resolveEventMeta(_session);
  } catch (err) {
    handleError(err, { context: "studySessionView.restore" });
    _session   = null;
    _eventMeta = null;
  }
  _render();
}

/**
 * Inicia uma sessão vinculada a um compromisso (ver eventFormView.js — botão
 * "Iniciar Sessão"). Se já existir outra sessão ativa, NUNCA troca
 * silenciosamente: mostra uma mensagem amigável oferecendo apenas finalizar a
 * sessão atual, e exige um novo clique para de fato iniciar a nova. Mesmo
 * contrato do activitySessionView.js original (F1.4) — só muda o destino
 * visual (a tela dedicada, não mais um widget flutuante).
 *
 * @returns {Promise<boolean>} true se a sessão do evento foi iniciada.
 */
export async function startSessionForEvent(event) {
  if (_busy || !emptyEl) return false;
  _busy = true;
  _setActionsDisabled(true);
  try {
    const category_id = await _resolveCategoryId(event.category);
    const session = await startSession({ event_id: event.id, category_id, source: "event" });
    _eventMeta = { title: event.title, category: event.category || null, description: event.description || null, duration_minutes: event.duration_minutes || null };
    _applySession(session);
    return true;
  } catch (err) {
    if (err?.code === "SESSION_ALREADY_RUNNING") {
      const runningLabel = _eventMeta?.title ? `"${_eventMeta.title}"` : "outra atividade";
      const shouldFinish = await confirmDialog({
        title:       "Sessão em andamento",
        message:     `Já existe uma sessão em andamento para ${runningLabel}. Finalize-a antes de iniciar uma nova sessão.`,
        confirmText: "Finalizar sessão atual",
        cancelText:  "Cancelar",
      });
      if (shouldFinish && _session) {
        try {
          const finished = await finishSession(_session.id);
          _applySession(finished);
        } catch (finishErr) {
          handleError(finishErr, { context: "studySessionView.finishBeforeSwitch" });
        }
      }
      return false;
    }
    handleError(err, { context: "studySessionView.startSessionForEvent" });
    return false;
  } finally {
    _busy = false;
    _setActionsDisabled(false);
  }
}

// Chamado no logout (ver script.js/authView.js): a tela não deve continuar
// mostrando/tiquetaqueando a sessão do usuário anterior.
export function resetStudySessionView() {
  _stopTicking();
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  _session   = null;
  _eventMeta = null;
  _busy      = false;
  _pendingEndedAt = null;
  if (finishModalEl && !finishModalEl.hidden) finishModal.close();
  if (emptyEl) _render();
}
