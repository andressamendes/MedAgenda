/**
 * Tests for navigationView.js — main page navigation, sidebar toggle,
 * and last-page persistence.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";

let nav;

beforeEach(async () => {
  installDom();
  localStorage.clear();
  nav = await import(`../../navigationView.js?t=${Math.random()}`);
  nav.initNavigation();
});

afterEach(() => {
  uninstallDom();
});

test("showPage() shows only the target page and hides the others", () => {
  nav.showPage("calendar");

  assert.strictEqual(document.getElementById("page-agenda").hidden, true);
  assert.strictEqual(document.getElementById("page-calendar").hidden, false);
  assert.strictEqual(document.getElementById("page-appointments").hidden, true);
});

test("showPage() marks the matching nav item as active with aria-current", () => {
  nav.showPage("calendar");

  const calBtn = document.querySelector('.nav-item[data-page="calendar"]');
  const agendaBtn = document.querySelector('.nav-item[data-page="agenda"]');
  assert.strictEqual(calBtn.classList.contains("nav-item--active"), true);
  assert.strictEqual(calBtn.getAttribute("aria-current"), "page");
  assert.strictEqual(agendaBtn.classList.contains("nav-item--active"), false);
  assert.strictEqual(agendaBtn.hasAttribute("aria-current"), false);
});

test("showPage() shows the history page (F1.8) and hides the others", () => {
  nav.showPage("history");

  assert.strictEqual(document.getElementById("page-history").hidden, false);
  assert.strictEqual(document.getElementById("page-agenda").hidden, true);
  const historyBtn = document.querySelector('.nav-item[data-page="history"]');
  assert.strictEqual(historyBtn.classList.contains("nav-item--active"), true);
});

test("UX #11 — Histórico e Diário têm descrições distintas e um link cruzado que navega via showPage()", () => {
  nav.showPage("history");
  const historyDesc = document.querySelector("#page-history .page-description");
  assert.ok(historyDesc, "Histórico tem um texto explicando seu papel");
  assert.match(historyDesc.textContent, /canceladas/i);

  const toJournalBtn = document.querySelector('#page-history .page-description-link[data-page="journal"]');
  assert.ok(toJournalBtn, "Histórico tem um link para o Diário");
  toJournalBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-journal").hidden, false);

  const journalDesc = document.querySelector("#page-journal .page-description");
  assert.ok(journalDesc, "Diário tem um texto explicando seu papel");
  const toHistoryBtn = document.querySelector('#page-journal .page-description-link[data-page="history"]');
  assert.ok(toHistoryBtn, "Diário tem um link de volta para o Histórico");
});

test("showPage() with an unknown page name falls back to agenda", () => {
  nav.showPage("nonexistent-page");
  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
});

test("showPage() persists the last page to localStorage", () => {
  nav.showPage("appointments");
  assert.strictEqual(localStorage.getItem("medagenda_last_page"), "appointments");
});

test("restoreLastPage() re-shows the previously saved page", () => {
  nav.showPage("calendar");
  nav.showPage("agenda"); // move away
  localStorage.setItem("medagenda_last_page", "calendar");

  nav.restoreLastPage();

  assert.strictEqual(document.getElementById("page-calendar").hidden, false);
  assert.strictEqual(document.getElementById("page-agenda").hidden, true);
});

test("restoreLastPage() defaults to agenda when nothing was saved", () => {
  nav.restoreLastPage();
  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
});

test("openSidebar()/closeSidebar() toggle the sidebar-open class and overlay visibility", () => {
  nav.openSidebar();
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  assert.strictEqual(sidebar.classList.contains("sidebar-open"), true);
  assert.strictEqual(overlay.hidden, false);

  nav.closeSidebar();
  assert.strictEqual(sidebar.classList.contains("sidebar-open"), false);
  assert.strictEqual(overlay.hidden, true);
});

test("showPage() closes an open sidebar as a side effect", () => {
  nav.openSidebar();
  nav.showPage("calendar");
  assert.strictEqual(document.getElementById("app-sidebar").classList.contains("sidebar-open"), false);
});

test("clicking a [data-page] nav button navigates via showPage()", () => {
  const calBtn = document.querySelector('.nav-item[data-page="calendar"]');
  calBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-calendar").hidden, false);
});

test("UX #09 — os itens que abrem modais (Calendários/Categorias) ficam num grupo 'Gerenciar' separado, sem misturar com páginas", () => {
  const manageGroup = document.querySelector('.sidebar-nav-group[aria-label="Gerenciar"]');
  assert.ok(manageGroup, "grupo 'Gerenciar' existe na sidebar");
  assert.ok(manageGroup.querySelector(".sidebar-group-label"), "grupo tem rótulo visível");
  assert.ok(manageGroup.querySelector("#btn-academic-cals"), "'Calendários' está no grupo Gerenciar");
  assert.ok(manageGroup.querySelector("#btn-categories"), "'Categorias' está no grupo Gerenciar");
  // Nenhum destino de navegação (data-page) convive no grupo de modais.
  assert.strictEqual(manageGroup.querySelector(".nav-item[data-page]"), null);
});

test("UX #10 — rótulos 'Semana'/'Mês'/'Calendários Acadêmicos' não se confundem mais entre si", () => {
  const weekLabel = document.querySelector('.nav-item[data-page="agenda"] .nav-label').textContent;
  const monthLabel = document.querySelector('.nav-item[data-page="calendar"] .nav-label').textContent;
  const academicLabel = document.getElementById("btn-academic-cals").querySelector(".nav-label").textContent;

  assert.strictEqual(weekLabel, "Semana");
  assert.strictEqual(monthLabel, "Mês");
  assert.strictEqual(academicLabel, "Calendários Acadêmicos");
  assert.strictEqual(document.getElementById("page-agenda").querySelector(".page-title").textContent, "Semana");
  assert.strictEqual(document.getElementById("page-calendar").querySelector(".page-title").textContent, "Mês");
});

test("UX #18 — o bottom nav do mobile abre a Sessão de Estudo diretamente", () => {
  const sessionBtn = document.querySelector('.bottom-nav-item[data-page="study-session"]');
  assert.ok(sessionBtn, "o bottom nav tem um item para a Sessão de Estudo");
  assert.strictEqual(sessionBtn.querySelector(".bottom-nav-label").textContent, "Sessão");

  sessionBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-study-session").hidden, false);
  assert.strictEqual(sessionBtn.classList.contains("bottom-nav-item--active"), true);
});

// F10 #4.4 — reorganiza o bottom nav para refletir a prioridade real de uso
// (Semana, Compromissos, Sessão, Diário, Mais) em vez de destacar o
// Assistente IA. Isto substitui a decisão da UX #18 de excluir Compromissos
// do bottom nav por "redundância com Semana/Mês": a auditoria F10 aponta o
// oposto — Compromissos é usado com mais frequência que Mês ou o Assistente
// IA no mobile, então passa a ocupar um dos 4 lugares fixos; Mês e IA
// continuam a um toque de distância dentro de "Mais" (mesma sidebar do
// desktop, inalterada).
test("F10 #4.4 — o bottom nav do mobile reflete Semana/Compromissos/Sessão/Diário/Mais, sem destacar Mês ou o Assistente IA", () => {
  const items = Array.from(document.querySelectorAll(".bottom-nav-item"));
  const labels = items.map(el => el.querySelector(".bottom-nav-label").textContent);
  assert.deepStrictEqual(labels, ["Semana", "Compromissos", "Sessão", "Diário", "Mais"]);

  assert.strictEqual(document.querySelector('.bottom-nav-item[data-page="calendar"]'), null, "Mês não ocupa mais um lugar fixo no bottom nav");
  assert.strictEqual(document.getElementById("bottom-nav-ai"), null, "o Assistente IA não ocupa mais um lugar fixo no bottom nav");

  const appointmentsBtn = document.querySelector('.bottom-nav-item[data-page="appointments"]');
  appointmentsBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-appointments").hidden, false);
  assert.strictEqual(appointmentsBtn.classList.contains("bottom-nav-item--active"), true);

  const journalBtn = document.querySelector('.bottom-nav-item[data-page="journal"]');
  journalBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-journal").hidden, false);
  assert.strictEqual(journalBtn.classList.contains("bottom-nav-item--active"), true);
});
