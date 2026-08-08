// ── pomodoroTimer.js — Máquina de estado do modo Pomodoro (ferramenta auxiliar
// da Sessão de Estudo) ───────────────────────────────────────────────────────
//
// Módulo puro, sem I/O e sem conhecimento de DOM/Supabase: só a contagem
// regressiva foco/pausa e as transições entre elas. studySessionView.js é o
// único consumidor — ele decide quando criar/destruir a instância e como
// desenhar o resultado na tela.
//
// Deliberadamente não persiste nada (nem aqui, nem em quem o instancia): o
// Pomodoro é uma preferência de sessão, não um dado de histórico (ver plano
// aprovado, seção "Persistência") — nasce sempre em "off" a cada nova
// instância, igual ao modo foco (_focusMode) em studySessionView.js.
//
// Não interfere no cronômetro real da sessão (started_at/paused_ms,
// activitySessionService.js): é um `setInterval` isolado, com seu próprio
// ciclo de vida, ligado/desligado só por quem o instancia.

const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;
const TICK_MS = 1000;

/**
 * @param {object} [handlers]
 * @param {(state: PomodoroState) => void} [handlers.onTick] — chamado a cada
 *   segundo e em toda transição de estado, com o estado atual.
 * @param {(state: PomodoroState) => void} [handlers.onPhaseComplete] —
 *   chamado quando uma fase (foco ou pausa) chega a zero, antes da próxima
 *   fase começar automaticamente (foco → pausa → foco…, conforme o produto).
 */
export function createPomodoroTimer({ onTick, onPhaseComplete } = {}) {
  let mode = "off"; // "off" | "focus" | "break"
  let running = false;
  let remainingMs = 0;
  let focusMs = DEFAULT_FOCUS_MINUTES * 60000;
  let breakMs = DEFAULT_BREAK_MINUTES * 60000;
  let intervalId = null;

  function _snapshot() {
    return { mode, running, remainingMs, focusMinutes: focusMs / 60000, breakMinutes: breakMs / 60000 };
  }

  function _emitTick() {
    onTick?.(_snapshot());
  }

  function _stopInterval() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function _startInterval() {
    _stopInterval();
    intervalId = setInterval(_tick, TICK_MS);
    intervalId.unref?.(); // no-op em browser; evita segurar o processo vivo nos testes
  }

  function _tick() {
    remainingMs = Math.max(0, remainingMs - TICK_MS);
    if (remainingMs <= 0) {
      _stopInterval();
      running = false;
      _emitTick();
      const completed = mode;
      onPhaseComplete?.(_snapshot());
      // F.Pomodoro — troca automática de fase (foco→pausa→foco…), a menos
      // que quem escuta onPhaseComplete já tenha desligado o Pomodoro
      // (stop()) ou trocado de fase por conta própria durante o callback.
      if (mode === completed && mode !== "off") {
        if (mode === "focus") _startPhase("break");
        else _startPhase("focus");
      }
      return;
    }
    _emitTick();
  }

  function _startPhase(nextMode) {
    mode = nextMode;
    remainingMs = nextMode === "focus" ? focusMs : breakMs;
    running = true;
    _startInterval();
    _emitTick();
  }

  return {
    /** Define as durações (minutos) usadas pelo PRÓXIMO início de fase — não afeta uma fase já em andamento. */
    configure(focusMinutes, breakMinutes) {
      if (Number.isFinite(focusMinutes) && focusMinutes > 0) focusMs = focusMinutes * 60000;
      if (Number.isFinite(breakMinutes) && breakMinutes > 0) breakMs = breakMinutes * 60000;
    },
    /** Liga o Pomodoro, sempre começando por um ciclo de foco. */
    startFocus() { _startPhase("focus"); },
    /** Pausa a contagem corrente (foco ou pausa) sem perder o tempo restante. */
    pause() {
      if (mode === "off" || !running) return;
      running = false;
      _stopInterval();
      _emitTick();
    },
    /** Retoma a contagem corrente de onde parou. No-op se não havia nada pausado. */
    resume() {
      if (mode === "off" || running || remainingMs <= 0) return;
      running = true;
      _startInterval();
      _emitTick();
    },
    /** Desliga completamente o Pomodoro — volta a "off", zera o tempo restante. */
    stop() {
      mode = "off";
      running = false;
      remainingMs = 0;
      _stopInterval();
      _emitTick();
    },
    getState: _snapshot,
  };
}
