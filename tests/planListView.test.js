/**
 * Tests for planListView.js — Lista estruturada do Plano da Semana (F3.5).
 *
 * Extraído de aiPanelView.js para ser reaproveitado pela visualização rápida
 * do plano na agenda (weekView.js) — mesma marcação em ambos os lugares.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";
import { renderPlanList } from "../planListView.js";

beforeEach(() => installDom());
afterEach(() => uninstallDom());

test("renderPlanList() shows the empty-state message for an empty plan", () => {
  const container = document.createElement("div");
  renderPlanList(container, []);
  assert.match(container.textContent, /Nenhuma sugestão no momento/);
});

test("renderPlanList() accepts a custom empty-state message", () => {
  const container = document.createElement("div");
  renderPlanList(container, null, "Mensagem customizada.");
  assert.match(container.textContent, /Mensagem customizada\./);
});

test("renderPlanList() renders one item per plan entry with priority, category, time and reason", () => {
  const container = document.createElement("div");
  const plan = [
    { tipo: "overdue", prioridade: "alta", categoria: "Farmacologia", tempoSugerido: "60 minutos", dataSugerida: "2026-07-06", motivo: "3 compromissos atrasados.", confianca: "alta" },
    { tipo: "study", prioridade: "baixa", categoria: null, tempoSugerido: "45 minutos", dataSugerida: "2026-07-08", motivo: "Semana vazia.", confianca: "média" },
  ];

  renderPlanList(container, plan);

  const items = container.querySelectorAll(".ai-plan-item");
  assert.strictEqual(items.length, 2);
  assert.ok(items[0].classList.contains("ai-plan-item--alta"));
  assert.match(items[0].textContent, /Farmacologia/);
  assert.match(items[0].textContent, /60 minutos/);
  assert.match(items[0].textContent, /3 compromissos atrasados\./);
  assert.strictEqual(items[1].querySelector(".ai-plan-category"), null); // sem categoria — nenhum chip inventado
});

test("renderPlanList() escapes item fields to prevent XSS", () => {
  const container = document.createElement("div");
  renderPlanList(container, [
    { tipo: "study", prioridade: "alta", categoria: "<img src=x onerror=alert(1)>", tempoSugerido: "10 minutos", dataSugerida: "2026-07-06", motivo: "m", confianca: "alta" },
  ]);
  assert.ok(!container.innerHTML.includes("<img src=x"));
});
