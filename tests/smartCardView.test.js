/**
 * Tests for smartCardView.js — Cards Inteligentes (F3.5, ETAPA 2).
 *
 * Pure DOM rendering: no I/O, no engine logic. Adapters
 * (recommendationToCard/planItemToCard/reflectionInsightToCard) only map an
 * already-computed object from another engine to a display type — they never
 * recompute anything.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "./mocks/domFixture.js";
import {
  CARD_TYPES, buildSmartCard, recommendationToCard, planItemToCard,
  reflectionInsightToCard, decisionToCard, renderSmartCards,
} from "../smartCardView.js";

beforeEach(() => installDom());
afterEach(() => uninstallDom());

test("buildSmartCard() keeps a known tipo and falls back to 'dica' for an unknown one", () => {
  assert.deepStrictEqual(buildSmartCard("meta", "Meta batida."), { tipo: "meta", mensagem: "Meta batida." });
  assert.deepStrictEqual(buildSmartCard("inexistente", "Texto."), { tipo: "dica", mensagem: "Texto." });
});

test("all five card types declared in ETAPA 2 have an icon and a label", () => {
  ["dica", "sugestao", "atencao", "meta", "revisao"].forEach(tipo => {
    assert.ok(CARD_TYPES[tipo].icon);
    assert.ok(CARD_TYPES[tipo].label);
  });
});

test("recommendationToCard() maps each recommendationEngine type to a sensible display type", () => {
  assert.strictEqual(recommendationToCard({ type: "overdue_events", message: "m" }).tipo, "atencao");
  assert.strictEqual(recommendationToCard({ type: "pending_reviews", message: "m" }).tipo, "revisao");
  assert.strictEqual(recommendationToCard({ type: "goals_nearly_met", message: "m" }).tipo, "meta");
  assert.strictEqual(recommendationToCard({ type: "understudied_categories", message: "m" }).tipo, "dica");
  assert.strictEqual(recommendationToCard({ type: "empty_week", message: "m" }).tipo, "sugestao");
  assert.strictEqual(recommendationToCard({ type: "unknown_type", message: "m" }).tipo, "dica");
});

test("planItemToCard() maps each planningService item type to a sensible display type", () => {
  assert.strictEqual(planItemToCard({ tipo: "overdue", motivo: "m" }).tipo, "atencao");
  assert.strictEqual(planItemToCard({ tipo: "review", motivo: "m" }).tipo, "revisao");
  assert.strictEqual(planItemToCard({ tipo: "study", motivo: "m" }).tipo, "dica");
  assert.strictEqual(planItemToCard({ tipo: "goal", motivo: "m" }).tipo, "meta");
});

test("reflectionInsightToCard() maps a positive insight to 'meta' and an attention insight to 'atencao'", () => {
  assert.strictEqual(reflectionInsightToCard({ tipo: "positivo", mensagem: "m" }).tipo, "meta");
  assert.strictEqual(reflectionInsightToCard({ tipo: "atencao", mensagem: "m" }).tipo, "atencao");
});

test("decisionToCard() maps a consolidated decision (decisionEngine.js, F3.7) to a sensible display type", () => {
  assert.strictEqual(decisionToCard({ origemTipo: "overdue_events", mensagem: "m" }).tipo, "atencao");
  assert.strictEqual(decisionToCard({ origemTipo: "review", mensagem: "m" }).tipo, "revisao");
  assert.strictEqual(decisionToCard({ origemTipo: "goal", mensagem: "m" }).tipo, "meta");
  assert.strictEqual(decisionToCard({ origemTipo: "neglected_category", mensagem: "m" }).tipo, "atencao");
  assert.strictEqual(decisionToCard({ origemTipo: "unknown_origin_type", mensagem: "m" }).tipo, "dica");
});

test("renderSmartCards() hides the container and clears it when there are no cards", () => {
  const container = document.createElement("div");
  container.hidden = false;
  container.innerHTML = "<p>stale</p>";

  renderSmartCards(container, []);

  assert.strictEqual(container.hidden, true);
  assert.strictEqual(container.innerHTML, "");
});

test("renderSmartCards() renders one card per entry, escaping the message", () => {
  const container = document.createElement("div");
  renderSmartCards(container, [
    { tipo: "atencao", mensagem: "<script>alert(1)</script>" },
    { tipo: "meta", mensagem: "Meta quase lá." },
  ]);

  assert.strictEqual(container.hidden, false);
  const cards = container.querySelectorAll(".smart-card");
  assert.strictEqual(cards.length, 2);
  assert.ok(cards[0].classList.contains("smart-card--atencao"));
  assert.ok(cards[1].classList.contains("smart-card--meta"));
  assert.ok(!container.innerHTML.includes("<script>alert"));
  assert.match(cards[0].querySelector(".smart-card-message").textContent, /alert\(1\)/);
});

test("renderSmartCards() tolerates an unknown tipo without throwing", () => {
  const container = document.createElement("div");
  assert.doesNotThrow(() => renderSmartCards(container, [{ tipo: "nope", mensagem: "x" }]));
  assert.ok(container.querySelector(".smart-card"));
});
