// PWA registration, install prompt management, and offline UI

import { handleError } from "./errorService.js";

let deferredInstallPrompt = null;

// ── Service Worker registration ────────────────────────────────────────────
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('./service-worker.js');
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
