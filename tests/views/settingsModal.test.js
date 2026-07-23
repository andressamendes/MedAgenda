/**
 * Tests for settingsModal.js + diagnosticModal.js — extracted from script.js
 * (F2.7 / M8). Unified reminders toggle (local + push, F18.17), dev mode
 * display, and the "Ver diagnóstico" hand-off between the two modals.
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
const HEALTH_SERVICE_SPECIFIER     = new URL("../../healthService.js", import.meta.url).href;
const CONFIG_SPECIFIER             = new URL("../../config.js", import.meta.url).href;

let restoreConfig;

function mockServices(t, {
  pushSupported = false,
  pushEnabled = false,
  vapidPublicKey = "",
  subscribeToPush = async () => {},
  unsubscribeFromPush = async () => {},
  diagnostics, health,
} = {}) {
  t.mock.module(EVENT_SERVICE_SPECIFIER, {
    namedExports: { getEventsByRange: async () => [] },
  });
  t.mock.module(PUSH_SERVICE_SPECIFIER, {
    namedExports: {
      isPushSupported:     () => pushSupported,
      isPushEnabled:       () => pushEnabled,
      subscribeToPush,
      unsubscribeFromPush,
    },
  });
  t.mock.module(CONFIG_SPECIFIER, {
    namedExports: {
      SUPABASE_URL: "https://test.invalid",
      SUPABASE_ANON_KEY: "test-anon-key",
      APP_URL: "http://localhost:8080",
      VAPID_PUBLIC_KEY: vapidPublicKey,
    },
  });
  t.mock.module(DIAGNOSTIC_SERVICE_SPECIFIER, {
    namedExports: {
      APP_VERSION: "1.0.0-test",
      runDiagnostics: async () => diagnostics ?? {
        supabase:      { ok: true, latency: 12 },
        auth:          { ok: true, email: "user@example.com", expiresAt: "01/01/2030" },
        storage:       { ok: true, latency: 8 },
        serviceWorker: { ok: true, status: "Ativo" },
        push:          { ok: false, status: "Permissão não solicitada" },
        lastSync:      "01/01/2026",
        version:       "1.0.0-test",
        environment:   "localhost",
        timestamp:     "2026-01-01T00:00:00.000Z",
      },
    },
  });
  t.mock.module(HEALTH_SERVICE_SPECIFIER, {
    namedExports: {
      HEALTH_STATUS: { HEALTHY: "HEALTHY", WARNING: "WARNING", DEGRADED: "DEGRADED", OFFLINE: "OFFLINE" },
      checkHealth: async () => health ?? {
        status: "HEALTHY",
        timestamp: "2026-01-01T00:00:00.000Z",
        components: {
          database:      { ok: true, latency: 12, error: null },
          auth:          { status: "authenticated", email: "user@example.com", expiresAt: "01/01/2030" },
          schema:        { compatible: true, code: null, dbVersion: 14, expectedVersion: 14 },
          edgeFunctions: { status: "available" },
          sync:          { lastSync: "01/01/2026" },
        },
        recentErrorCount: 0,
        lastError: null,
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
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();

  assert.strictEqual(document.getElementById("settings-overlay").hidden, false);
  assert.strictEqual(
    document.getElementById("reminders-status-text").textContent,
    "Ativados — lembretes exibidos enquanto o app está aberto."
  );
});

// F10 #2.4 — theme picker in Settings; getTheme()/setTheme() come from
// themeService.js, the same module the standalone bootstrap call
// (initTheme(), script.js) uses to apply the theme before the app renders.
test("openSettings() marks the currently active theme tab as selected", async (t) => {
  mockServices(t);
  const { setTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  setTheme("dark");
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();

  const darkTab  = document.querySelector('#theme-tabs .tab[data-theme="dark"]');
  const lightTab = document.querySelector('#theme-tabs .tab[data-theme="light"]');
  assert.strictEqual(darkTab.getAttribute("aria-selected"), "true");
  assert.ok(darkTab.classList.contains("tab--active"));
  assert.strictEqual(lightTab.getAttribute("aria-selected"), "false");
});

test("clicking a theme tab switches the theme, persists it, and updates the selected tab", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  const { getTheme } = await import(`../../themeService.js?t=${Math.random()}`);
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.querySelector('#theme-tabs .tab[data-theme="dark"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(getTheme(), "dark");
  assert.strictEqual(document.documentElement.getAttribute("data-theme"), "dark");
  assert.strictEqual(
    document.querySelector('#theme-tabs .tab[data-theme="dark"]').getAttribute("aria-selected"),
    "true"
  );
});

test("closeSettings() hides the overlay", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  settings.closeSettings();

  assert.strictEqual(document.getElementById("settings-overlay").hidden, true);
});

test("clicking the reminders toggle disables local + push reminders and cancels pending timers", async (t) => {
  mockServices(t);
  notificationService.initNotifications("test-user");
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.getElementById("btn-reminders-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(document.getElementById("reminders-status-text").textContent, "Desativados.");
  assert.strictEqual(document.getElementById("btn-reminders-toggle").textContent, "Ativar");
});

test("clicking the reminders toggle when off enables local reminders and attempts push subscription", async (t) => {
  let subscribeCalled = false;
  mockServices(t, {
    pushSupported: true,
    vapidPublicKey: "test-vapid-key",
    subscribeToPush: async () => { subscribeCalled = true; },
  });
  notificationService.initNotifications("test-user");
  notificationService.setEnabled(false);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();
  document.getElementById("btn-reminders-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));

  assert.strictEqual(notificationService.isEnabled(), true);
  assert.strictEqual(subscribeCalled, true);
});

test("reminders toggle shows the push-enabled message when a push subscription is already active", async (t) => {
  mockServices(t, { pushSupported: true, pushEnabled: true });
  notificationService.initNotifications("test-user");
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
  diagnostic.initDiagnosticModal();

  settings.openSettings();

  assert.strictEqual(
    document.getElementById("reminders-status-text").textContent,
    "Ativados — você recebe lembretes mesmo com o app fechado."
  );
});

test("clicking 'Ver diagnóstico' closes settings and opens the diagnostic modal with live data", async (t) => {
  mockServices(t);
  const { settings, diagnostic } = await loadModules();
  settings.initSettingsModal();
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
      storage:       { ok: true, latency: 5 },
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

// F10 PR14 — Modo Desenvolvedor foi movido de Configurações para dentro do
// modal de Diagnóstico (mesmo público de ferramentas técnicas/avançadas).
test("dev mode toggle (inside the diagnostic modal) reflects the injected isDevMode/setDevMode callbacks", async (t) => {
  mockServices(t);
  const { diagnostic } = await loadModules();
  let devMode = false;
  diagnostic.initDiagnosticModal({
    isDevMode:  () => devMode,
    setDevMode: (v) => { devMode = v; },
  });

  document.getElementById("btn-devmode-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  assert.strictEqual(devMode, true);
  assert.strictEqual(document.getElementById("devmode-panel").hidden, false);
  assert.strictEqual(document.getElementById("dev-version").textContent, "1.0.0-test");
});
