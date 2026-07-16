// ── settingsModal.js — Modal de configurações (notificações locais e push) ──

import { getEventsByRange } from "./eventService.js";
import { isoDate } from "./utils.js";
import {
  isSupported, isEnabled, setEnabled,
  permissionStatus, requestPermission, scheduleReminders, WINDOW_DAYS,
} from "./notificationService.js";
import {
  isPushSupported, isPushEnabled,
  subscribeToPush, unsubscribeFromPush,
} from "./pushService.js";
import { VAPID_PUBLIC_KEY } from "./config.js";
import { APP_VERSION } from "./diagnosticService.js";
import { initModal } from "./modalController.js";
import { openDiagnosticModal } from "./diagnosticModal.js";
import { toast } from "./toastService.js";
import { handleError } from "./errorService.js";

let notifStatusText, btnNotifToggle, notifPermHint;
let pushStatusText, btnPushToggle, pushErrorHint;
let btnDevmodeToggle, devmodePanel, devVersion, devEnv;
let settingsModal   = null;
let _getDevMode     = () => false;
let _setDevModeImpl = () => {};

/**
 * @param {{ isDevMode: () => boolean, setDevMode: (enabled: boolean) => void }} devmode
 *   Injetado pelo bootstrap — o modo desenvolvedor é um domínio de
 *   observabilidade separado (script.js), este módulo apenas exibe seu estado.
 */
export function initSettingsModal({ isDevMode, setDevMode } = {}) {
  if (isDevMode)  _getDevMode     = isDevMode;
  if (setDevMode) _setDevModeImpl = setDevMode;

  const settingsOverlay = document.getElementById("settings-overlay");
  notifStatusText  = document.getElementById("notif-status-text");
  btnNotifToggle   = document.getElementById("btn-notif-toggle");
  notifPermHint    = document.getElementById("notif-perm-hint");
  pushStatusText   = document.getElementById("push-status-text");
  btnPushToggle    = document.getElementById("btn-push-toggle");
  pushErrorHint    = document.getElementById("push-error-hint");
  btnDevmodeToggle = document.getElementById("btn-devmode-toggle");
  devmodePanel     = document.getElementById("devmode-panel");
  devVersion       = document.getElementById("dev-version");
  devEnv           = document.getElementById("dev-env");

  if (!settingsOverlay) return;

  settingsModal = initModal(settingsOverlay, closeSettings);

  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("settings-close")?.addEventListener("click", closeSettings);

  document.getElementById("btn-diagnostic")?.addEventListener("click", () => {
    closeSettings();
    openDiagnosticModal();
  });

  btnNotifToggle.addEventListener("click", async () => {
    const perm    = permissionStatus();
    const enabled = isEnabled() && perm === "granted";

    if (enabled) {
      setEnabled(false);
      scheduleReminders([]); // cancela todos os timeouts
    } else {
      const result = await requestPermission();
      if (result === "granted") {
        setEnabled(true);
        try {
          const start = new Date();
          const end   = new Date(start);
          end.setDate(end.getDate() + WINDOW_DAYS);
          const events = await getEventsByRange(isoDate(start), isoDate(end));
          scheduleReminders(events);
        } catch (err) {
          handleError(err, { context: 'settingsModal.rescheduleAfterEnable', silent: true });
        }
      }
    }

    renderSettingsState();
  });

  btnPushToggle.addEventListener("click", async () => {
    btnPushToggle.disabled = true;
    pushErrorHint.hidden   = true;

    try {
      if (isPushEnabled() && Notification.permission === "granted") {
        await unsubscribeFromPush();
      } else {
        await subscribeToPush();
      }
    } catch (err) {
      const { friendly } = handleError(err, { context: 'settingsModal.pushToggle', silent: true, fallbackMessage: "Erro ao configurar notificações push." });
      pushErrorHint.hidden      = false;
      pushErrorHint.textContent = friendly;
    } finally {
      btnPushToggle.disabled = false;
    }

    renderPushState();
  });

  btnDevmodeToggle?.addEventListener("click", () => {
    const current = _getDevMode();
    _setDevModeImpl(!current);
    renderDevmodeState();
    toast.info(!current ? "Modo desenvolvedor ativado." : "Modo desenvolvedor desativado.");
  });
}

export function openSettings() {
  renderSettingsState();
  renderPushState();
  renderDevmodeState();
  settingsModal?.open();
}

export function closeSettings() {
  settingsModal?.close();
}

function renderSettingsState() {
  if (!isSupported()) {
    notifStatusText.textContent = "Seu navegador não suporta notificações.";
    btnNotifToggle.hidden       = true;
    notifPermHint.hidden        = true;
    return;
  }

  const perm    = permissionStatus();
  const enabled = isEnabled() && perm === "granted";

  if (perm === "denied") {
    notifStatusText.textContent = "Permissão de notificação negada pelo navegador.";
    btnNotifToggle.hidden       = true;
    notifPermHint.hidden        = false;
    notifPermHint.textContent   = "Para reativar, clique no ícone de cadeado na barra de endereços e permita notificações para este site.";
    return;
  }

  notifPermHint.hidden  = true;
  btnNotifToggle.hidden = false;

  if (enabled) {
    notifStatusText.textContent = "Ativadas — lembretes exibidos enquanto o app está aberto.";
    btnNotifToggle.textContent  = "Desativar";
    btnNotifToggle.className    = "btn btn-sm btn-ghost";
  } else {
    notifStatusText.textContent = perm === "default"
      ? "Desativadas — clique em Ativar para autorizar o navegador."
      : "Desativadas.";
    btnNotifToggle.textContent  = "Ativar";
    btnNotifToggle.className    = "btn btn-sm btn-primary";
  }
}

function renderPushState() {
  pushErrorHint.hidden = true;

  if (!isPushSupported()) {
    pushStatusText.textContent = "Push não é suportado neste navegador.";
    btnPushToggle.hidden       = true;
    return;
  }

  if (!VAPID_PUBLIC_KEY) {
    pushStatusText.textContent = "VAPID_PUBLIC_KEY não configurada — consulte a documentação.";
    btnPushToggle.hidden       = true;
    return;
  }

  const perm    = Notification.permission;
  const enabled = isPushEnabled() && perm === "granted";

  btnPushToggle.hidden = false;

  if (perm === "denied") {
    pushStatusText.textContent = "Permissão de notificação negada pelo navegador.";
    btnPushToggle.hidden       = true;
    pushErrorHint.hidden       = false;
    pushErrorHint.textContent  = "Para reativar, clique no ícone de cadeado na barra de endereços e permita notificações para este site.";
    return;
  }

  if (enabled) {
    pushStatusText.textContent = "Ativadas — você receberá lembretes mesmo com o app fechado.";
    btnPushToggle.textContent  = "Desativar Push";
    btnPushToggle.className    = "btn btn-sm btn-ghost";
  } else {
    pushStatusText.textContent = "Desativadas — ative para receber lembretes com o app fechado.";
    btnPushToggle.textContent  = "Ativar Push";
    btnPushToggle.className    = "btn btn-sm btn-primary";
  }
}

function renderDevmodeState() {
  const enabled = _getDevMode();
  if (!btnDevmodeToggle) return;

  btnDevmodeToggle.textContent = enabled ? "Desativar" : "Ativar";
  btnDevmodeToggle.className   = `btn btn-sm ${enabled ? 'btn-ghost' : 'btn-ghost'}`;

  if (devmodePanel) {
    devmodePanel.hidden = !enabled;
    if (enabled) {
      if (devVersion) devVersion.textContent = APP_VERSION;
      if (devEnv) {
        const h = window.location.hostname;
        devEnv.textContent = h === 'localhost' || h === '127.0.0.1'
          ? 'Desenvolvimento (local)'
          : h.endsWith('github.io') ? 'Produção (GitHub Pages)' : h;
      }
    }
  }
}
