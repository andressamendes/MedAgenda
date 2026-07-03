/**
 * Tests for settingsModal.js + diagnosticModal.js — extracted from script.js
 * (F2.7 / M8). Notification permission toggle, push toggle, dev mode display,
 * and the "Ver diagnóstico" hand-off between the two modals.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { installDom, uninstallDom } from "../mocks/domFixture.js";
import { installNotificationMock, uninstallNotificationMock } from "../mocks/notificationMock.js";
import { ensureTestConfig } from "../mocks/configFixture.js";
import * as notificationService from "../../notificationService.js";

const EVENT_SERVICE_SPECIFIER      = new URL("../../eventService.js", import.meta.url).href;
const PUSH_SERVICE_SPECIFIER       = new URL("../../pushService.js", import.meta.url).href;
const DIAGNOSTIC_SERVICE_SPECIFIER = new URL("../../diagnosticService.js", import.meta.url).href;

let restoreConfig;

function mockServices(t, { pushSupported = false, diagnostics } = {}) {
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { getEventsByRange: async () => [] },
  });
  t.mock.module(PUSH_SERVICE_SPECIFIER, {
    namedExports: {
      isPushSupported:     () => pushSupported,
      isPushEnabled:       () => false,
      subscribeToPush:     async () => {},
      unsubscribeFromPush: async () => {},
    },
  });
  t.mock.module(DIAGNOSTIC_SERVICE_SPECIFIER, {
    namedExports: {
      APP_VERSION: "1.0.0-test",
      runDiagnostics: async () => diagnostics ?? {
        supabase:      { ok: true, latency: 12 },
        auth:          { ok: true, email: "user@example.com", expiresAt: "01/01/2030" },
        serviceWorker: { ok: true, status: "Ativo" },
        push:          { ok: false, status: "Permissão não solicitada" },
        lastSync:      "01/01/2026",
        version:       "1.0.0-test",
        environment:   "localhost",
        timestamp:     "2026-01-01T00:00:00.000Z",
      },
    },
  });
}

async function loadModules() {
  // settingsModal.js resolves "./diagnosticModal.js" as a plain (non-cache-busted)
  // relative specifier — importing it here without a `?t=` query targets the
  // exact same module instance, so initDiagnosticModal() sets up the DOM refs
  // that settingsModal's internal openDiagnosticModal() call actually uses.
  const settings   = await import(`../../settingsModal.js?t=${Math.random()}`);
  const diagnostic = await import("../../diagnosticModal.js");
  return { settings, diagnostic };
}

beforeEach(() => {
  restoreConfig = ensureTestConfig();
  installDom();
  installNotificationMock({ permission: "granted" });
  localStorage.clear();
});

afterEach(() => {
  uninstallNotificationMock();
  uninstallDom();
  restoreConfig();
});

test("openSettings() shows the overlay with current notification/push state", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal({ isDevMode: () => false, setDevMode: () => {} });
  diagnostic.initDiagnosticModal();

  settings.openSettings();

  assert.strictEqual(document.getElementById("settings-overlay").hidden, false);
  assert.strictEqual(
    document.getElementById("notif-status-text").textContent,
    "Ativadas — lembretes exibidos enquanto o app está aberto."
  );
  assert.strictEqual(document.getElementById("push-status-text").textContent, "Push não é suportado neste navegador.");
});

test("closeSettings() hides the overlay", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal({ isDevMode: () => false, setDevMode: () => {} });
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  settings.closeSettings();

  assert.strictEqual(document.getElementById("settings-overlay").hidden, true);
});

test("clicking the notification toggle disables notifications and cancels pending reminders", async (t) => {
  mockServices(t);
  notificationService.initNotifications("test-user");
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal({ isDevMode: () => false, setDevMode: () => {} });
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.getElementById("btn-notif-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("notif-status-text").textContent, "Desativadas.");
  assert.strictEqual(document.getElementById("btn-notif-toggle").textContent, "Ativar");
});

test("clicking 'Ver diagnóstico' closes settings and opens the diagnostic modal with live data", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal({ isDevMode: () => false, setDevMode: () => {} });
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.getElementById("btn-diagnostic").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("settings-overlay").hidden, true);
  assert.strictEqual(document.getElementById("diagnostic-overlay").hidden, false);
  assert.match(document.getElementById("diagnostic-body").textContent, /user@example\.com/);
});

test("diagnostic modal escapes non-static status strings before rendering", async (t) => {
  // Imported fresh (cache-busted) and in isolation from settingsModal.js so
  // this test's diagnosticService mock can't be shadowed by a diagnosticModal.js
  // instance already cached (with a different mock) by an earlier test.
  mockServices(t, {
    diagnostics: {
      supabase:      { ok: true, latency: 5 },
      auth:          { ok: false, status: '<img src=x onerror=alert(1)>' },
      serviceWorker: { ok: true, status: "Ativo" },
      push:          { ok: true, status: "Autorizado" },
      lastSync:      "01/01/2026",
      version:       "1.0.0-test",
      environment:   "localhost",
      timestamp:     "2026-01-01T00:00:00.000Z",
    },
  });
  const diagnostic = await import(`../../diagnosticModal.js?t=${Math.random()}`);
  diagnostic.initDiagnosticModal();

  await diagnostic.openDiagnosticModal();

  const body = document.getElementById("diagnostic-body");
  assert.strictEqual(body.querySelector("img"), null);
  assert.match(body.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("dev mode toggle reflects the injected isDevMode/setDevMode callbacks", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  let devMode = false;
  settings.initSettingsModal({
    isDevMode:  () => devMode,
    setDevMode: (v) => { devMode = v; },
  });
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.getElementById("btn-devmode-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(devMode, true);
  assert.strictEqual(document.getElementById("devmode-panel").hidden, false);
  assert.strictEqual(document.getElementById("dev-version").textContent, "1.0.0-test");
});
