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
