/**
 * Tests for pomodoroTimer.js — the Pomodoro state machine used by the modo
 * Pomodoro auxiliary tool inside a Study Session (studySessionView.js).
 * Pure module, no I/O: no mock.module needed, only node:test's mock timers
 * (same technique already used for the real session chronometer, see
 * tests/views/studySessionView.test.js).
 */
import { test } from "node:test";
import assert from "node:assert";
import { createPomodoroTimer } from "../../pomodoroTimer.js";

test("starts off, with no ticks and no phase", () => {
  const timer = createPomodoroTimer();
  assert.deepStrictEqual(timer.getState(), {
    mode: "off", running: false, remainingMs: 0, focusMinutes: 25, breakMinutes: 5,
  });
});

test("startFocus() begins a 25-minute focus phase by default and ticks down every second", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ticks = [];
  const timer = createPomodoroTimer({ onTick: (s) => ticks.push(s) });

  timer.startFocus();
  assert.strictEqual(timer.getState().mode, "focus");
  assert.strictEqual(timer.getState().running, true);
  assert.strictEqual(timer.getState().remainingMs, 25 * 60000);

  t.mock.timers.tick(1000);
  assert.strictEqual(timer.getState().remainingMs, 25 * 60000 - 1000);
  assert.ok(ticks.length >= 2); // uma emissão no start, outra no tick
});

test("configure() changes the duration used by the NEXT phase, not one already running", () => {
  const timer = createPomodoroTimer();
  timer.configure(50, 10);
  timer.startFocus();
  assert.strictEqual(timer.getState().remainingMs, 50 * 60000);
});

test("pause()/resume() keep the remaining time — no reset on resume", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const timer = createPomodoroTimer();
  timer.configure(1, 1); // 1 min foco / 1 min pausa — tempos curtos para o teste
  timer.startFocus();

  t.mock.timers.tick(20_000);
  timer.pause();
  const remainingAtPause = timer.getState().remainingMs;
  assert.strictEqual(timer.getState().running, false);
  assert.strictEqual(remainingAtPause, 40_000);

  // Tempo não passa enquanto pausado (o interval interno foi parado).
  t.mock.timers.tick(30_000);
  assert.strictEqual(timer.getState().remainingMs, remainingAtPause);

  timer.resume();
  assert.strictEqual(timer.getState().running, true);
  t.mock.timers.tick(5000);
  assert.strictEqual(timer.getState().remainingMs, remainingAtPause - 5000);
});

test("pause() is a no-op when off or already paused — never creates a duplicate interval", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const timer = createPomodoroTimer();
  timer.pause(); // off — no-op
  assert.strictEqual(timer.getState().mode, "off");

  timer.startFocus();
  timer.pause();
  timer.pause(); // já pausado — segunda chamada não deve quebrar nada
  assert.strictEqual(timer.getState().running, false);
});

test("resume() is a no-op when off or already running", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const timer = createPomodoroTimer();
  timer.resume(); // off — no-op
  assert.strictEqual(timer.getState().mode, "off");

  timer.startFocus();
  const before = timer.getState().remainingMs;
  timer.resume(); // já rodando — no-op, não deve reiniciar a contagem
  assert.strictEqual(timer.getState().remainingMs, before);
});

test("when focus reaches zero, break starts automatically — and vice-versa (foco → pausa → foco…)", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const phaseCompletions = [];
  const timer = createPomodoroTimer({ onPhaseComplete: (s) => phaseCompletions.push(s.mode) });
  timer.configure(1, 1); // 1 min foco / 1 min pausa
  timer.startFocus();

  t.mock.timers.tick(60_000); // foco zera
  assert.strictEqual(timer.getState().mode, "break");
  assert.strictEqual(timer.getState().running, true);
  assert.strictEqual(timer.getState().remainingMs, 60_000);
  assert.deepStrictEqual(phaseCompletions, ["focus"]);

  t.mock.timers.tick(60_000); // pausa zera → novo ciclo de foco
  assert.strictEqual(timer.getState().mode, "focus");
  assert.strictEqual(timer.getState().running, true);
  assert.deepStrictEqual(phaseCompletions, ["focus", "break"]);
});

test("onPhaseComplete calling stop() cancels the automatic transition to the next phase", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const timer = createPomodoroTimer({
    onPhaseComplete: () => timer.stop(),
  });
  timer.configure(1, 1);
  timer.startFocus();

  t.mock.timers.tick(60_000);
  assert.strictEqual(timer.getState().mode, "off");
});

test("stop() returns to off from any phase and clears the interval — never leaves a dangling timer", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ticks = [];
  const timer = createPomodoroTimer({ onTick: (s) => ticks.push(s) });
  timer.startFocus();
  timer.stop();
  assert.deepStrictEqual(timer.getState(), {
    mode: "off", running: false, remainingMs: 0, focusMinutes: 25, breakMinutes: 5,
  });

  const countAfterStop = ticks.length;
  t.mock.timers.tick(5000);
  // Nenhum tick novo — o setInterval foi de fato limpo, não só ignorado.
  assert.strictEqual(ticks.length, countAfterStop);
});

test("starting a new focus phase while one is already running never duplicates the interval (only one tick per second)", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ticks = [];
  const timer = createPomodoroTimer({ onTick: (s) => ticks.push(s.remainingMs) });
  timer.startFocus();
  timer.startFocus(); // reinicia — não deve empilhar um segundo interval

  const before = ticks.length;
  t.mock.timers.tick(1000);
  // Se houvesse dois intervals ativos, o tick avançaria 2000ms nesta única
  // chamada de tick(1000); com um único interval, avança exatamente 1000ms.
  assert.strictEqual(25 * 60000 - timer.getState().remainingMs, 1000);
  assert.strictEqual(ticks.length, before + 1);
});
