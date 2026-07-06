// ── activitySessionView.js — Cronômetro global de Sessão de Atividade ───────
// F1.3: apenas renderização + interação. Toda regra de negócio (impedir
// sessões simultâneas, calcular duração, transições de status válidas) mora
// em activitySessionService.js — este módulo não decide nada, só reflete o
// estado retornado pelo service e reage a cliques.
//
// F1.4: sessões podem se originar de um compromisso (event_id/category_id).
// Título e categoria exibidos no widget são resolvidos a partir do evento
// (eventService/categoryService) só para exibição — nunca persistidos na
// sessão além dos ids que o service já grava. Nenhuma outra camada (ex.:
// eventFormView.js) implementa a regra de "uma sessão por vez": todas
// chamam startSessionForEvent() e recebem o conflito já tratado aqui.

import {
  getRunningSession,
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
} from "./activitySessionService.js";
import { getEventById } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { confirmDialog } from "./confirmDialog.js";
import { handleError } from "./errorService.js";

const TICK_MS = 1000;

let widget, statusEl, timeEl, eventEl, noteEl;
let btnStart, btnPause, btnResume, btnFinish;

let _session   = null; // fonte da verdade: a última linha conhecida do banco
let _eventMeta = null; // { title, category } — só para exibição, nunca persistido
let _tickId    = null;
let _busy      = false; // evita cliques duplicados durante uma chamada em andamento

function _buildWidget() {
  widget = document.createElement("div");
  widget.className = "as-widget";
  widget.setAttribute("role", "status");
  widget.setAttribute("aria-label", "Cronômetro de sessão de atividade");
  widget.innerHTML = `
    <div class="as-widget-body">
      <span class="as-widget-status" id="as-status">Nenhuma sessão de estudo em andamento</span>
      <span class="as-widget-event" id="as-event" hidden></span>
      <span class="as-widget-time" id="as-time" aria-hidden="true"></span>
      <p class="as-widget-note" id="as-note" hidden></p>
    </div>
    <div class="as-widget-actions">
      <button type="button" class="btn btn-primary btn-sm" id="as-btn-start">Iniciar</button>
      <button type="button" class="btn btn-ghost btn-sm"   id="as-btn-pause"  hidden>Pausar</button>
      <button type="button" class="btn btn-ghost btn-sm"   id="as-btn-resume" hidden>Continuar</button>
      <button type="button" class="btn btn-danger btn-sm"  id="as-btn-finish" hidden>Finalizar</button>
    </div>
  `;
  document.body.appendChild(widget);

  statusEl  = widget.querySelector("#as-status");
  eventEl   = widget.querySelector("#as-event");
  timeEl    = widget.querySelector("#as-time");
  noteEl    = widget.querySelector("#as-note");
  btnStart  = widget.querySelector("#as-btn-start");
  btnPause  = widget.querySelector("#as-btn-pause");
  btnResume = widget.querySelector("#as-btn-resume");
  btnFinish = widget.querySelector("#as-btn-finish");

  btnStart.addEventListener("click", () => _run(() => startSession({ source: "manual" })));
  btnPause.addEventListener("click", () => _run(() => pauseSession(_session.id)));
  btnResume.addEventListener("click", () => _run(() => resumeSession(_session.id)));
  btnFinish.addEventListener("click", () => _run(() => finishSession(_session.id)));
}

function _formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// O tempo exibido é sempre recalculado a partir de started_at (o banco é a
// fonte da verdade) — o timer local só decide QUANDO redesenhar, nunca o
// valor em si.
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
  // No-op in browsers; in Node (tests) this stops the interval from keeping
  // the process alive when a test ends with a session still "running".
  _tickId.unref?.();
}

function _setButtonsDisabled(disabled) {
  [btnStart, btnPause, btnResume, btnFinish].forEach(b => { b.disabled = disabled; });
}

function _render() {
  const status = _session?.status;

  statusEl.textContent =
    status === "running" ? "Em andamento" :
    status === "paused"  ? "Pausada" :
    "Nenhuma sessão de estudo em andamento";

  btnStart.hidden  = !!_session;
  btnPause.hidden  = status !== "running";
  btnResume.hidden = status !== "paused";
  btnFinish.hidden = !_session;

  // Nada além de título e categoria — sem estatísticas, sem progresso.
  eventEl.hidden = !_session || !_eventMeta;
  if (_session && _eventMeta) {
    eventEl.textContent = _eventMeta.category
      ? `${_eventMeta.title} · ${_eventMeta.category}`
      : _eventMeta.title;
  }

  // Limitação conhecida (ver activitySessionService.js): o modelo não
  // acumula tempo pausado separadamente, então a duração final de
  // finishSession() sempre inclui qualquer intervalo em pausa.
  noteEl.hidden = status !== "paused";
  if (status === "paused") {
    noteEl.textContent = "O tempo em pausa será contabilizado na duração final.";
  }

  if (status === "running") {
    timeEl.hidden = false;
    _startTicking();
  } else if (status === "paused") {
    timeEl.hidden = false;
    _stopTicking();
    _renderTime(); // último valor exibido antes de congelar
  } else {
    timeEl.hidden = true;
    _stopTicking();
  }
}

// Aplica o resultado (vindo do service) ao estado do widget, limpando os
// metadados de exibição do evento quando a sessão deixa de existir.
function _applySession(session) {
  _session = session;
  if (!_session || _session.status === "finished" || _session.status === "cancelled") {
    _session   = null;
    _eventMeta = null;
  }
  _render();
}

// Melhor esforço: resolve o nome da categoria do compromisso para o id
// esperado por activity_sessions.category_id. Nunca impede o início da
// sessão — na dúvida, fica sem categoria.
async function _resolveCategoryId(categoryName) {
  if (!categoryName) return null;
  try {
    const categories = await getCategories();
    return categories.find(c => c.name === categoryName)?.id ?? null;
  } catch {
    return null;
  }
}

// Resolve título/categoria para exibição a partir do event_id gravado na
// sessão — usado ao restaurar após reload. Se o compromisso foi excluído
// enquanto a sessão estava ativa, a sessão continua normalmente (o evento é
// independente da sessão); o widget apenas mostra um rótulo genérico.
async function _resolveEventMeta(session) {
  if (!session?.event_id) return null;
  try {
    const ev = await getEventById(session.event_id);
    return ev ? { title: ev.title, category: ev.category || null } : { title: "Compromisso removido", category: null };
  } catch (err) {
    handleError(err, { context: "activitySessionView.resolveEventMeta" });
    return { title: "Compromisso removido", category: null };
  }
}

// Executa uma ação de domínio, atualizando o widget a partir do resultado
// (ou preservando o estado anterior em caso de erro — nunca deixa a UI
// travada num estado que não corresponde ao banco).
async function _run(action) {
  if (_busy) return;
  _busy = true;
  _setButtonsDisabled(true);
  try {
    _applySession(await action());
  } catch (err) {
    handleError(err, { context: "activitySessionView" });
  } finally {
    _busy = false;
    _setButtonsDisabled(false);
  }
}

/**
 * Monta o cronômetro global e restaura, se existir, a sessão em andamento
 * do usuário atual — recarregar a página nunca deve fazer o usuário perder
 * uma sessão ativa (nem o título/categoria do compromisso vinculado, se houver).
 */
export async function initActivitySessionView() {
  if (!widget) _buildWidget();

  try {
    _session   = await getRunningSession();
    _eventMeta = await _resolveEventMeta(_session);
  } catch (err) {
    handleError(err, { context: "activitySessionView.restore" });
    _session   = null;
    _eventMeta = null;
  }
  _render();
}

/**
 * Inicia uma sessão vinculada a um compromisso (ver eventFormView.js —
 * botão "Iniciar Sessão"). Se já existir outra sessão ativa, NUNCA troca
 * silenciosamente: mostra uma mensagem amigável oferecendo apenas finalizar
 * a sessão atual, e exige um novo clique para de fato iniciar a nova.
 *
 * @returns {Promise<boolean>} true se a sessão do evento foi iniciada.
 */
export async function startSessionForEvent(event) {
  if (_busy || !widget) return false;
  _busy = true;
  _setButtonsDisabled(true);
  try {
    const category_id = await _resolveCategoryId(event.category);
    const session = await startSession({ event_id: event.id, category_id, source: "event" });
    _eventMeta = { title: event.title, category: event.category || null };
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
          _applySession(await finishSession(_session.id));
        } catch (finishErr) {
          handleError(finishErr, { context: "activitySessionView.finishBeforeSwitch" });
        }
      }
      return false;
    }
    handleError(err, { context: "activitySessionView.startSessionForEvent" });
    return false;
  } finally {
    _busy = false;
    _setButtonsDisabled(false);
  }
}

// Chamado no logout (ver script.js/authView.js): o widget não deve
// continuar mostrando/tiquetaqueando a sessão do usuário anterior.
export function resetActivitySessionView() {
  _stopTicking();
  _session   = null;
  _eventMeta = null;
  _busy      = false;
  if (widget) _render();
}
