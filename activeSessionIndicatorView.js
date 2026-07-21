// ── activeSessionIndicatorView.js — Chip de sessão ativa no header (F11 E13) ─
//
// Auditoria #10: sem nenhum indicador global, uma sessão de estudo em
// andamento fica invisível assim que o usuário sai da página "Sessão" (F7.2,
// único lugar com o cronômetro completo) — sessões esquecidas, confiança
// perdida nos dados de estudo. Este módulo mostra um chip discreto no header
// (tempo decorrido + link de volta) em qualquer página, enquanto houver uma
// sessão "running" ou "paused" — sem duplicar nenhum controle de
// pausar/retomar/finalizar, que continuam exclusivos de studySessionView.js.
//
// Atualiza por minuto (não por segundo): o chip só precisa comunicar "ainda
// rodando, há quanto tempo" — não ser um cronômetro de precisão.

import { getActiveSession } from "./activitySessionService.js";
import { handleError } from "./errorService.js";
import { formatDuration } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import { showPage } from "./navigationView.js";

const TICK_MS = 60_000;

let chipEl = null;
let timeEl = null;
let _session = null;
let _tickTimer = null;
let _unsubscribers = [];

// Mesma fórmula de studySessionView.js/_minutesBetween() — não é uma regra
// nova, só a mesma leitura de started_at/paused_ms/paused_at usada lá.
function _minutesElapsed(session, now = new Date()) {
  const currentPauseMs = session.status === "paused" && session.paused_at
    ? Math.max(0, now - new Date(session.paused_at))
    : 0;
  const totalPausedMs = (session.paused_ms || 0) + currentPauseMs;
  return Math.max(0, Math.floor((now - new Date(session.started_at) - totalPausedMs) / 60000));
}

function _stopTicking() {
  if (_tickTimer) {
    clearInterval(_tickTimer);
    _tickTimer = null;
  }
}

function _startTicking() {
  if (_tickTimer) return;
  _tickTimer = setInterval(_render, TICK_MS);
  // Só existe em Node (testes) — no browser é sempre undefined/no-op. Sem
  // isso, um timer de 60s pendente mantém o processo de teste vivo até
  // expirar, mesmo depois de todos os testes já terem terminado.
  _tickTimer.unref?.();
}

function _render() {
  if (!chipEl) return;
  if (!_session) {
    chipEl.hidden = true;
    _stopTicking();
    return;
  }
  chipEl.hidden = false;
  const paused = _session.status === "paused";
  timeEl.textContent = `${formatDuration(_minutesElapsed(_session))}${paused ? " · Pausada" : ""}`;
  _startTicking();
}

function _handleBusEvent({ session, eventType }) {
  const ended = eventType === SESSION_EVENTS.FINISHED || eventType === SESSION_EVENTS.CANCELLED;
  _session = ended ? null : session;
  _render();
}

/**
 * Monta o chip (uma única vez) e restaura, se existir, a sessão em andamento
 * ou pausada do usuário atual — mesma consulta de recuperação já usada por
 * studySessionView.js/F7.8, aqui repetida de forma independente (nenhum
 * acoplamento entre os dois módulos: cada view se inicializa a partir dos
 * serviços, nunca de estado interno de outra view). Assina o barramento de
 * eventos (F6.2) para manter o chip sincronizado sem polling.
 */
export async function initActiveSessionIndicator() {
  if (!chipEl) {
    chipEl = document.getElementById("active-session-chip");
    timeEl = document.getElementById("active-session-chip-time");
    chipEl?.addEventListener("click", () => showPage("study-session"));
  }

  if (_unsubscribers.length === 0) {
    _unsubscribers = [
      subscribe(SESSION_EVENTS.STARTED,   _handleBusEvent),
      subscribe(SESSION_EVENTS.PAUSED,    _handleBusEvent),
      subscribe(SESSION_EVENTS.RESUMED,   _handleBusEvent),
      subscribe(SESSION_EVENTS.FINISHED,  _handleBusEvent),
      subscribe(SESSION_EVENTS.CANCELLED, _handleBusEvent),
      subscribe(SESSION_EVENTS.UPDATED,   _handleBusEvent),
    ];
  }

  try {
    _session = await getActiveSession();
  } catch (err) {
    handleError(err, { context: "activeSessionIndicatorView.restore", silent: true });
    _session = null;
  }
  _render();
}

/**
 * Desfaz as assinaturas e o intervalo de atualização, e esconde o chip.
 * Chamada no logout/troca de usuário (ver script.js/onBeforeSignOut) — sem
 * isso, o chip do usuário anterior (e o timer rodando) sobreviveria à troca
 * de sessão.
 */
export function resetActiveSessionIndicator() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  _stopTicking();
  _session = null;
  if (chipEl) chipEl.hidden = true;
}
