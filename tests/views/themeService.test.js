/**
 * themeService.js — persistência e aplicação do tema (F10 #2.4). jsdom não
 * implementa matchMedia (lança "not a function"), então "auto" sempre
 * resolve para "light" nestes testes — o guard `typeof window.matchMedia
 * === "function"` do próprio módulo cobre esse ambiente sem navegador real.
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

test("getTheme() defaults to 'auto' with nothing stored", async () => {
  const { getTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  assert.strictEqual(getTheme(), "auto");
});

test("initTheme() applies data-theme on <html>, resolving 'auto' to 'light' (no matchMedia in jsdom)", async () => {
  const { initTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  initTheme();
  assert.strictEqual(document.documentElement.getAttribute("data-theme"), "light");
});

test("setTheme('dark') persists the choice and applies it immediately", async () => {
  const { setTheme, getTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  setTheme("dark");
  assert.strictEqual(getTheme(), "dark");
  assert.strictEqual(document.documentElement.getAttribute("data-theme"), "dark");
  assert.strictEqual(localStorage.getItem("medagenda_theme"), "dark");
});

test("setTheme() with an invalid value is ignored", async () => {
  const { setTheme, getTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  setTheme("dark");
  setTheme("neon");
  assert.strictEqual(getTheme(), "dark");
});

test("a later initTheme() call re-applies the previously stored choice (simulates reload)", async () => {
  const mod = await import(`../../themeService.js?t=${Math.random()}`);
  mod.setTheme("dark");
  document.documentElement.removeAttribute("data-theme");

  mod.initTheme();
  assert.strictEqual(document.documentElement.getAttribute("data-theme"), "dark");
});

test("onThemeChange() notifies listeners with the new theme on setTheme()", async () => {
  const { setTheme, onThemeChange } = await import(`../../themeService.js?t=${Math.random()}`);
  const seen = [];
  const off = onThemeChange(theme => seen.push(theme));

  setTheme("dark");
  setTheme("light");
  off();
  setTheme("auto");

  assert.deepStrictEqual(seen, ["dark", "light"]);
});
