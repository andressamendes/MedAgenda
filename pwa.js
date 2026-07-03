// PWA registration, install prompt management, and offline/update UI

import { handleError } from "./errorService.js";

let deferredInstallPrompt = null;

// ── Service Worker registration ────────────────────────────────────────────
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js');

    // Detect when a new service worker is waiting to activate
    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;

      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }
      });
    });

    // Check for an already-waiting worker on page load (e.g. user refreshed)
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(registration);
    }

  } catch (err) {
    handleError(err, { context: 'pwa.registerServiceWorker', silent: true });
  }
}

// ── Install prompt ─────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallButton();
});

function showInstallButton() {
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.hidden = false;
}

function hideInstallButton() {
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.hidden = true;
}

export function initInstallButton() {
  const btn = document.getElementById('btn-install-pwa');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredInstallPrompt = null;
      hideInstallButton();
    }
  });
}

// ── Update banner ──────────────────────────────────────────────────────────
function showUpdateBanner(registration) {
  const banner = document.getElementById('pwa-update-banner');
  if (!banner) return;
  banner.hidden = false;

  const btn = document.getElementById('btn-pwa-update');
  if (!btn) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  }, { once: true });

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Atualizando…';
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, { once: true });
}

// ── Offline / online detection ─────────────────────────────────────────────
export function initOfflineDetection() {
  const bar = document.getElementById('pwa-offline-bar');
  if (!bar) return;

  function update() {
    bar.hidden = navigator.onLine;
  }

  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update(); // set initial state
}
