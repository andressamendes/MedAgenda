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
import { initModal } from "./modalController.js";
import { openDiagnosticModal } from "./diagnosticModal.js";
import { handleError } from "./errorService.js";
import { getTheme, setTheme } from "./themeService.js";

let notifStatusText, btnNotifToggle, notifPermHint;
let pushStatusText, btnPushToggle, pushErrorHint;
let themeTabs = [];
let settingsModal   = null;

export function initSettingsModal() {
  const settingsOverlay = document.getElementById("settings-overlay");
  notifStatusText  = document.getElementById("notif-status-text");
  btnNotifToggle   = document.getElementById("btn-notif-toggle");
  notifPermHint    = document.getElementById("notif-perm-hint");
  pushStatusText   = document.getElementById("push-status-text");
  btnPushToggle    = document.getElementById("btn-push-toggle");
  pushErrorHint    = document.getElementById("push-error-hint");
  themeTabs        = Array.from(document.querySelectorAll("#theme-tabs .tab"));

  if (!settingsOverlay) return;

  themeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      setTheme(tab.dataset.theme);
      renderThemeState();
    });
  });

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
}

export function openSettings() {
  renderThemeState();
  renderSettingsState();
  renderPushState();
  settingsModal?.open();
}

function renderThemeState() {
  const current = getTheme();
  themeTabs.forEach(tab => {
    const active = tab.dataset.theme === current;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", String(active));
  });
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
    // F13.3 — btn-primary é reservado para 1 ação por tela; este toggle
    // (como o de Push abaixo) não é a ação principal da tela de Configurações.
    btnNotifToggle.className    = "btn btn-sm btn-secondary";
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
    btnPushToggle.className    = "btn btn-sm btn-secondary";
  }
}
