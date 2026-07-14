/**
 * F7.10 — Resumo Final da Sessão: modal somente leitura aberto depois que a
 * Sessão de Estudo já foi encerrada. Todos os campos chegam prontos de quem
 * chama openSessionSummary() (studySessionView.js) — este módulo não busca
 * nem calcula nada, só renderiza e liga os dois botões de navegação
 * (navigationView.js real, sem mock: showPage() já é testado isoladamente em
 * navigationView.test.js).
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

beforeEach(() => {
  installDom();
});

afterEach(() => {
  uninstallDom();
});

async function loadSessionSummaryView() {
  return import(`../../sessionSummaryView.js?t=${Math.random()}`);
}

test("openSessionSummary() renders every field from the data it receives, nothing recalculated", async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: { title: "Cardiologia — aula 3", category: "Cardiologia", description: "Insuficiência cardíaca" },
    startedAt: "2026-07-09T13:00:00.000Z",
    endedAt:   "2026-07-09T14:30:00.000Z",
    netMinutes: 90,
    status: "finished",
    questionsCount: 3,
    reviewsCount: 1,
    notes: "Revisar arritmias amanhã.",
  });

  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, false);
  assert.strictEqual(document.getElementById("sss-event-title").textContent, "Cardiologia — aula 3");
  assert.strictEqual(document.getElementById("sss-category").textContent, "Cardiologia");
  assert.strictEqual(document.getElementById("sss-subject"), null, "a linha 'Matéria' duplicava 'Categoria' e foi removida (auditoria UX #05)");
  assert.strictEqual(document.getElementById("sss-content").textContent, "Insuficiência cardíaca");
  assert.strictEqual(document.getElementById("sss-card-net-time").textContent, "1h 30min");
  assert.strictEqual(document.getElementById("sss-card-questions").textContent, "3");
  assert.strictEqual(document.getElementById("sss-card-reviews").textContent, "1");
  assert.strictEqual(document.getElementById("sss-card-status").textContent, "Concluída");
  assert.strictEqual(document.getElementById("sss-notes-block").hidden, false);
  assert.strictEqual(document.getElementById("sss-notes").textContent, "Revisar arritmias amanhã.");
});

test("a standalone session (no linked event) shows the placeholder fields instead of a title", async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null,
    startedAt: "2026-07-09T13:00:00.000Z",
    endedAt:   "2026-07-09T13:20:00.000Z",
    netMinutes: 20,
    status: "finished",
    questionsCount: 0,
    reviewsCount: 0,
    notes: "",
  });

  assert.strictEqual(document.getElementById("sss-event-title").textContent, "Sessão avulsa");
  assert.strictEqual(document.getElementById("sss-category").textContent, "Sem compromisso vinculado");
  assert.strictEqual(document.getElementById("sss-card-questions").textContent, "0");
  assert.strictEqual(document.getElementById("sss-card-reviews").textContent, "0");
});

test("empty notes hide the observações block instead of showing a blank one", async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null,
    startedAt: "2026-07-09T13:00:00.000Z",
    endedAt:   "2026-07-09T13:20:00.000Z",
    netMinutes: 20,
    status: "finished",
    questionsCount: 0,
    reviewsCount: 0,
    notes: "   ",
  });

  assert.strictEqual(document.getElementById("sss-notes-block").hidden, true);
});

test('"Ver Dashboard" closes the summary and navigates to the dashboard page', async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null, startedAt: null, endedAt: null, netMinutes: 0,
    status: "finished", questionsCount: 0, reviewsCount: 0, notes: "",
  });

  document.getElementById("sss-btn-dashboard").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true);
  assert.strictEqual(document.getElementById("page-dashboard").hidden, false);
});

test('"Ir para Histórico de Sessões" closes the summary and navigates to the history page', async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null, startedAt: null, endedAt: null, netMinutes: 0,
    status: "finished", questionsCount: 0, reviewsCount: 0, notes: "",
  });

  document.getElementById("sss-btn-history").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true);
  assert.strictEqual(document.getElementById("page-history").hidden, false);
});

// ── Auditoria UX #16: "Fechar" sem navegar ──────────────────────────────────

test('UX #16 — "Fechar" just closes the summary, without navigating anywhere', async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null, startedAt: null, endedAt: null, netMinutes: 0,
    status: "finished", questionsCount: 0, reviewsCount: 0, notes: "",
  });

  document.getElementById("sss-btn-close").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("ss-summary-modal").hidden, true);
  assert.strictEqual(document.getElementById("page-dashboard").hidden, true);
  assert.strictEqual(document.getElementById("page-history").hidden, true);
});

test("a cancelled session shows the matching status label", async () => {
  const mod = await loadSessionSummaryView();

  mod.openSessionSummary({
    eventMeta: null, startedAt: null, endedAt: null, netMinutes: 0,
    status: "cancelled", questionsCount: 0, reviewsCount: 0, notes: "",
  });

  assert.strictEqual(document.getElementById("sss-card-status").textContent, "Cancelada");
});
