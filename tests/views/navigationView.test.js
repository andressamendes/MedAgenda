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
  nav.showPage("appointments");

  assert.strictEqual(document.getElementById("page-agenda").hidden, true);
  assert.strictEqual(document.getElementById("page-appointments").hidden, false);
  assert.strictEqual(document.getElementById("page-study-session").hidden, true);
});

// F11 E8 (auditoria #15) — document.title era fixo em "Anoti" independente
// da página; sem isso o histórico do navegador e o alt-tab entre abas eram
// inúteis para diferenciar telas do app.
test("F11 E8 — showPage() updates document.title to match the destination page", () => {
  nav.showPage("appointments");
  assert.strictEqual(document.title, "Compromissos · Anoti");

  nav.showPage("study-session");
  assert.strictEqual(document.title, "Sessão · Anoti");

  nav.showPage("journal");
  assert.strictEqual(document.title, "Diário · Anoti");

  nav.showPage("dashboard");
  assert.strictEqual(document.title, "Dashboard · Anoti");

  nav.showPage("agenda");
  assert.strictEqual(document.title, "Agenda · Anoti");
});

test("F11 E8 — showPage() with an unknown page name falls back to the Agenda title", () => {
  nav.showPage("calendar");
  assert.strictEqual(document.title, "Agenda · Anoti");
});

test("showPage() marks the matching nav item as active with aria-current", () => {
  nav.showPage("appointments");

  const aptBtn = document.querySelector('.nav-item[data-page="appointments"]');
  const agendaBtn = document.querySelector('.nav-item[data-page="agenda"]');
  assert.strictEqual(aptBtn.classList.contains("nav-item--active"), true);
  assert.strictEqual(aptBtn.getAttribute("aria-current"), "page");
  assert.strictEqual(agendaBtn.classList.contains("nav-item--active"), false);
  assert.strictEqual(agendaBtn.hasAttribute("aria-current"), false);
});

// F10 #4.1 — Mês deixou de ser uma página própria (#page-calendar removido);
// foi absorvido como a aba "Mês" de #agenda-view-tabs, dentro da própria
// página da Agenda. "calendar" não é mais um nome de página válido — cai no
// fallback de showPage() para "agenda", como qualquer outro nome desconhecido.
test("F10 #4.1 — showPage('calendar') falls back to agenda: 'calendar' is no longer a valid page", () => {
  nav.showPage("calendar");

  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
  assert.strictEqual(document.getElementById("page-calendar"), null, "a página própria do Mês não existe mais no DOM");
});

test("F10 #4.1 — a página Agenda tem as abas Semana/Mês que absorveram o Mês", () => {
  nav.showPage("agenda");

  const tabs = Array.from(document.querySelectorAll("#agenda-view-tabs .ah-filter-tab"));
  const labels = tabs.map(btn => btn.textContent);
  assert.deepStrictEqual(labels, ["Semana", "Mês"]);
  assert.strictEqual(document.querySelector('.nav-item[data-page="calendar"]'), null, "não existe mais um item de navegação próprio para o Mês na sidebar");
  assert.strictEqual(document.querySelectorAll('.nav-item[data-page="agenda"]').length, 1, "Semana e Mês compartilham um único item 'Agenda' na sidebar");
});

// F10 #4.2 — o Histórico de Sessões deixou de ser uma página própria
// (#page-history removido); foi absorvido como as abas "Canceladas"/"Todas"
// de #sj-status-tabs, dentro da própria página do Diário. "history" não é
// mais um nome de página válido — cai no fallback de showPage() para
// "agenda", como qualquer outro nome desconhecido (ver teste abaixo).
test("F10 #4.2 — showPage('history') falls back to agenda: 'history' is no longer a valid page", () => {
  nav.showPage("history");

  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
  assert.strictEqual(document.getElementById("page-journal").hidden, true);
  assert.strictEqual(document.getElementById("page-history"), null, "a página própria do Histórico não existe mais no DOM");
});

test("F10 #4.2 — o Diário de Estudos tem as abas Concluídas/Canceladas/Todas que absorveram o Histórico", () => {
  nav.showPage("journal");

  const tabs = Array.from(document.querySelectorAll("#sj-status-tabs .ah-filter-tab"));
  const labels = tabs.map(btn => btn.textContent);
  assert.deepStrictEqual(labels, ["Concluídas", "Canceladas", "Todas"]);
  assert.strictEqual(document.querySelector('.nav-item[data-page="history"]'), null, "o item de navegação do Histórico não existe mais na sidebar");
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
  nav.showPage("appointments");
  nav.showPage("agenda"); // move away
  localStorage.setItem("medagenda_last_page", "appointments");

  nav.restoreLastPage();

  assert.strictEqual(document.getElementById("page-appointments").hidden, false);
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
  const aptBtn = document.querySelector('.nav-item[data-page="appointments"]');
  aptBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-appointments").hidden, false);
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

// F10 #4.1 supersedes UX #10 ("rótulos 'Semana'/'Mês' não se confundem mais
// entre si"): não há mais dois rótulos de nav distintos para se confundir —
// Semana e Mês são abas dentro da mesma página "Agenda" (ver teste F10 #4.1
// acima), então o que resta a verificar é que "Agenda" e "Calendários
// Acadêmicos" (que abre um modal, não uma página) continuam claramente
// distintos.
test("UX #10 — rótulo 'Agenda' não se confunde com 'Calendários Acadêmicos'", () => {
  const agendaLabel = document.querySelector('.nav-item[data-page="agenda"] .nav-label').textContent;
  const academicLabel = document.getElementById("btn-academic-cals").querySelector(".nav-label").textContent;

  assert.strictEqual(agendaLabel, "Agenda");
  assert.strictEqual(academicLabel, "Calendários Acadêmicos");
  assert.strictEqual(document.getElementById("page-agenda").querySelector(".page-title").textContent, "Agenda");
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
test("F10 #4.4 — o bottom nav do mobile reflete Agenda/Compromissos/Sessão/Diário/Mais, sem destacar Mês ou o Assistente IA", () => {
  const items = Array.from(document.querySelectorAll(".bottom-nav-item"));
  const labels = items.map(el => el.querySelector(".bottom-nav-label").textContent);
  // F10 #4.1 — o rótulo "Semana" virou "Agenda" (Semana/Mês agora são abas
  // da mesma página, ver testes F10 #4.1 acima).
  assert.deepStrictEqual(labels, ["Agenda", "Compromissos", "Sessão", "Diário", "Mais"]);

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
