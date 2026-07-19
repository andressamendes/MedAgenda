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

// F11 E9 — navegação sem nenhuma microinteração fazia a troca de página
// parecer um corte seco. showPage() agora aplica um fade+translate curto
// (.page-enter, 180ms — CSS trata prefers-reduced-motion) na página que
// acabou de aparecer, reaproveitando o mesmo princípio de
// transitionUtils.js/revealWithAnimation() já usado em accordions.
test("F11 E9 — showPage() adds .page-enter to the page that becomes visible", () => {
  nav.showPage("journal");
  assert.strictEqual(document.getElementById("page-journal").classList.contains("page-enter"), true);
  assert.strictEqual(document.getElementById("page-agenda").classList.contains("page-enter"), false);
});

test("F11 E9 — showPage() called again for the already-active page does not replay the animation", () => {
  nav.showPage("journal");
  const journalPage = document.getElementById("page-journal");
  journalPage.classList.remove("page-enter"); // simula a animação já ter terminado

  nav.showPage("journal");

  assert.strictEqual(journalPage.classList.contains("page-enter"), false, "re-render da mesma página não deve reiniciar o fade");
});

test("showPage() shows only the target page and hides the others", () => {
  nav.showPage("agenda");

  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
  assert.strictEqual(document.getElementById("page-today").hidden, true);
  assert.strictEqual(document.getElementById("page-study-session").hidden, true);
});

// F11 E8 (auditoria #15) — document.title era fixo em "Anoti" independente
// da página; sem isso o histórico do navegador e o alt-tab entre abas eram
// inúteis para diferenciar telas do app.
test("F11 E8 — showPage() updates document.title to match the destination page", () => {
  nav.showPage("study-session");
  assert.strictEqual(document.title, "Sessão · Anoti");

  nav.showPage("journal");
  assert.strictEqual(document.title, "Diário · Anoti");

  nav.showPage("progress");
  assert.strictEqual(document.title, "Progresso · Anoti");

  nav.showPage("agenda");
  assert.strictEqual(document.title, "Agenda · Anoti");

  nav.showPage("today");
  assert.strictEqual(document.title, "Hoje · Anoti");
});

// F14.1 — "Hoje" é a nova porta de entrada: qualquer nome de página
// inválido/removido cai agora em "today", não mais em "agenda".
test("F11 E8 — showPage() with an unknown page name falls back to the Hoje title", () => {
  nav.showPage("calendar");
  assert.strictEqual(document.title, "Hoje · Anoti");
});

test("showPage() marks the matching nav item as active with aria-current", () => {
  nav.showPage("agenda");

  const agendaBtn = document.querySelector('.nav-item[data-page="agenda"]');
  const sessionBtn = document.querySelector('.nav-item[data-page="study-session"]');
  assert.strictEqual(agendaBtn.classList.contains("nav-item--active"), true);
  assert.strictEqual(agendaBtn.getAttribute("aria-current"), "page");
  assert.strictEqual(sessionBtn.classList.contains("nav-item--active"), false);
  assert.strictEqual(sessionBtn.hasAttribute("aria-current"), false);
});

// F10 #4.1 — Mês deixou de ser uma página própria (#page-calendar removido);
// foi absorvido como a aba "Mês" de #agenda-view-tabs, dentro da própria
// página da Agenda. "calendar" não é mais um nome de página válido — cai no
// fallback de showPage(), hoje "today" (F14.1), não mais "agenda".
test("F10 #4.1 — showPage('calendar') falls back to today: 'calendar' is no longer a valid page", () => {
  nav.showPage("calendar");

  assert.strictEqual(document.getElementById("page-today").hidden, false);
  assert.strictEqual(document.getElementById("page-calendar"), null, "a página própria do Mês não existe mais no DOM");
});

// F14.7 — "Lista" (antes a página própria "Compromissos") entrou como
// terceira aba de #agenda-view-tabs, ao lado de Semana/Mês.
test("F10 #4.1/F14.7 — a página Agenda tem as abas Semana/Mês/Lista que absorveram Mês e Compromissos", () => {
  nav.showPage("agenda");

  const tabs = Array.from(document.querySelectorAll("#agenda-view-tabs .tab"));
  const labels = tabs.map(btn => btn.textContent);
  assert.deepStrictEqual(labels, ["Semana", "Mês", "Lista"]);
  assert.strictEqual(document.querySelector('.nav-item[data-page="calendar"]'), null, "não existe mais um item de navegação próprio para o Mês na sidebar");
  assert.strictEqual(document.querySelector('.nav-item[data-page="appointments"]'), null, "não existe mais um item de navegação próprio para Compromissos na sidebar");
  assert.strictEqual(document.querySelectorAll('.nav-item[data-page="agenda"]').length, 1, "Semana, Mês e Lista compartilham um único item 'Agenda' na sidebar");
});

// F10 #4.2 — o Histórico de Sessões deixou de ser uma página própria
// (#page-history removido); foi absorvido como as abas "Canceladas"/"Todas"
// de #sj-status-tabs, dentro da própria página do Diário. "history" não é
// mais um nome de página válido — cai no fallback de showPage(), hoje
// "today" (F14.1), como qualquer outro nome desconhecido (ver teste abaixo).
test("F10 #4.2 — showPage('history') falls back to today: 'history' is no longer a valid page", () => {
  nav.showPage("history");

  assert.strictEqual(document.getElementById("page-today").hidden, false);
  assert.strictEqual(document.getElementById("page-journal").hidden, true);
  assert.strictEqual(document.getElementById("page-history"), null, "a página própria do Histórico não existe mais no DOM");
});

// F14.7 — "Canceladas" deixou de ser uma aba própria: virou um filtro
// (#sj-other-only-cancelled) dentro de "Todas".
test("F10 #4.2/F14.7 — o Diário de Estudos tem as abas Concluídas/Todas que absorveram o Histórico", () => {
  nav.showPage("journal");

  const tabs = Array.from(document.querySelectorAll("#sj-status-tabs .tab"));
  const labels = tabs.map(btn => btn.textContent);
  assert.deepStrictEqual(labels, ["Concluídas", "Todas"]);
  assert.strictEqual(document.querySelector('.nav-item[data-page="history"]'), null, "o item de navegação do Histórico não existe mais na sidebar");
});

test("showPage() with an unknown page name falls back to today", () => {
  nav.showPage("nonexistent-page");
  assert.strictEqual(document.getElementById("page-today").hidden, false);
});

test("showPage() persists the last page to localStorage", () => {
  nav.showPage("journal");
  assert.strictEqual(localStorage.getItem("medagenda_last_page"), "journal");
});

test("restoreLastPage() re-shows the previously saved page", () => {
  nav.showPage("journal");
  nav.showPage("agenda"); // move away
  localStorage.setItem("medagenda_last_page", "journal");

  nav.restoreLastPage();

  assert.strictEqual(document.getElementById("page-journal").hidden, false);
  assert.strictEqual(document.getElementById("page-agenda").hidden, true);
});

// F14.1 — "Hoje" é a nova porta de entrada: sem nenhuma página salva, o app
// abre nela, não mais na Agenda.
test("restoreLastPage() defaults to today (F14.1) when nothing was saved", () => {
  nav.restoreLastPage();
  assert.strictEqual(document.getElementById("page-today").hidden, false);
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
  const agendaBtn = document.querySelector('.nav-item[data-page="agenda"]');
  agendaBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
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

// F14.7 — "Compromissos" deixou de ser um destino próprio (virou a aba
// "Lista" da Agenda); o lugar que ocupava no bottom nav (F10 #4.4) passa
// para "Hoje" (F14.1), a nova porta de entrada do app.
test("F14.7 — o bottom nav do mobile reflete Hoje/Agenda/Sessão/Diário/Mais, sem destacar Mês, Compromissos ou o Assistente IA", () => {
  const items = Array.from(document.querySelectorAll(".bottom-nav-item"));
  const labels = items.map(el => el.querySelector(".bottom-nav-label").textContent);
  // F10 #4.1 — o rótulo "Semana" virou "Agenda" (Semana/Mês agora são abas
  // da mesma página, ver testes F10 #4.1 acima).
  assert.deepStrictEqual(labels, ["Hoje", "Agenda", "Sessão", "Diário", "Mais"]);

  assert.strictEqual(document.querySelector('.bottom-nav-item[data-page="calendar"]'), null, "Mês não ocupa mais um lugar fixo no bottom nav");
  assert.strictEqual(document.querySelector('.bottom-nav-item[data-page="appointments"]'), null, "Compromissos não ocupa mais um lugar fixo no bottom nav");
  assert.strictEqual(document.getElementById("bottom-nav-ai"), null, "o Assistente IA não ocupa mais um lugar fixo no bottom nav");

  const agendaBtn = document.querySelector('.bottom-nav-item[data-page="agenda"]');
  agendaBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-agenda").hidden, false);
  assert.strictEqual(agendaBtn.classList.contains("bottom-nav-item--active"), true);

  const journalBtn = document.querySelector('.bottom-nav-item[data-page="journal"]');
  journalBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-journal").hidden, false);
  assert.strictEqual(journalBtn.classList.contains("bottom-nav-item--active"), true);
});

// F14.1 — "Hoje" é o primeiro item da sidebar e o destino inicial do app.
test("F14.1 — 'Hoje' é o primeiro item de navegação da sidebar e abre por padrão", () => {
  const hojeBtn = document.querySelector('.nav-item[data-page="today"]');
  assert.ok(hojeBtn, "existe um item de navegação 'Hoje' na sidebar");
  assert.strictEqual(hojeBtn.querySelector(".nav-label").textContent, "Hoje");

  const firstNavItem = document.querySelector(".sidebar-nav-group .nav-item[data-page]");
  assert.strictEqual(firstNavItem, hojeBtn, "'Hoje' é o primeiro destino de navegação da sidebar");

  hojeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(document.getElementById("page-today").hidden, false);
  assert.strictEqual(hojeBtn.classList.contains("nav-item--active"), true);
});
