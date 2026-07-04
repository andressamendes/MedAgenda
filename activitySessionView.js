// ── activitySessionView.js — Cronômetro global de Sessão de Atividade ───────
// F1.3: apenas renderização + interação. Toda regra de negócio (impedir
// sessões simultâneas, calcular duração, transições de status válidas) mora
// em activitySessionService.js — este módulo não decide nada, só reflete o
// estado retornado pelo service e reage a cliques.

import {
  getRunningSession,
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
} from "./activitySessionService.js";
import { handleError } from "./errorService.js";

const TICK_MS = 1000;

let widget, statusEl, timeEl, noteEl;
let btnStart, btnPause, btnResume, btnFinish;

let _session  = null; // fonte da verdade: a última linha conhecida do banco
let _tickId   = null;
let _busy     = false; // evita cliques duplicados durante uma chamada em andamento

function _buildWidget() {
  widget = document.createElement("div");
  widget.className = "as-widget";
  widget.setAttribute("role", "status");
  widget.setAttribute("aria-label", "Cronômetro de sessão de atividade");
  widget.innerHTML = `
    <div class="as-widget-body">
      <span class="as-widget-status" id="as-status">Nenhuma sessão em andamento</span>
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
    "Nenhuma sessão em andamento";

  btnStart.hidden  = !!_session;
  btnPause.hidden  = status !== "running";
  btnResume.hidden = status !== "paused";
  btnFinish.hidden = !_session;

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

// Executa uma ação de domínio, atualizando o widget a partir do resultado
// (ou preservando o estado anterior em caso de erro — nunca deixa a UI
// travada num estado que não corresponde ao banco).
async function _run(action) {
  if (_busy) return;
  _busy = true;
  _setButtonsDisabled(true);
  try {
    _session = await action();
    if (_session?.status === "finished" || _session?.status === "cancelled") {
      _session = null;
    }
    _render();
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
 * uma sessão ativa.
 */
export async function initActivitySessionView() {
  if (!widget) _buildWidget();

  try {
    _session = await getRunningSession();
  } catch (err) {
    handleError(err, { context: "activitySessionView.restore" });
    _session = null;
  }
  _render();
}

// Chamado no logout (ver script.js/authView.js): o widget não deve
// continuar mostrando/tiquetaqueando a sessão do usuário anterior.
export function resetActivitySessionView() {
  _stopTicking();
  _session = null;
  _busy = false;
  if (widget) _render();
}
