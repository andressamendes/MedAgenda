// ── settingsModal.js — Modal de configurações (lembretes unificados: local + push) ──

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
import { initTabs, updateTabsRovingIndex } from "./tabsController.js";

let remindersStatusText, btnRemindersToggle, remindersHint;
let themeTabs = [];
let settingsModal   = null;

export function initSettingsModal() {
  const settingsOverlay = document.getElementById("settings-overlay");
  remindersStatusText = document.getElementById("reminders-status-text");
  btnRemindersToggle   = document.getElementById("btn-reminders-toggle");
  remindersHint        = document.getElementById("reminders-hint");
  themeTabs            = Array.from(document.querySelectorAll("#theme-tabs .tab"));

  if (!settingsOverlay) return;

  initTabs(document.getElementById("theme-tabs"), tab => {
    setTheme(tab.dataset.theme);
    renderThemeState();
  });

  settingsModal = initModal(settingsOverlay, closeSettings);

  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("settings-close")?.addEventListener("click", closeSettings);

  document.getElementById("btn-diagnostic")?.addEventListener("click", () => {
    closeSettings();
    openDiagnosticModal();
  });

  btnRemindersToggle.addEventListener("click", async () => {
    const perm    = permissionStatus();
    const enabled = (isEnabled() || isPushEnabled()) && perm === "granted";

    btnRemindersToggle.disabled = true;
    remindersHint.hidden        = true;

    try {
      if (enabled) {
        setEnabled(false);
        scheduleReminders([]); // cancela todos os timeouts locais
        if (isPushEnabled()) {
          await unsubscribeFromPush().catch(err => {
            handleError(err, { context: 'settingsModal.pushUnsubscribeOnDisable', silent: true });
          });
        }
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

          // Push é o mecanismo preferido (funciona com o app fechado); tentamos
          // ativá-lo além do agendamento local, mas sua indisponibilidade
          // (navegador sem suporte, VAPID não configurada, erro de servidor)
          // não deve impedir o usuário de ter lembretes locais funcionando.
          if (isPushSupported() && VAPID_PUBLIC_KEY) {
            try {
              await subscribeToPush();
            } catch (err) {
              handleError(err, { context: 'settingsModal.pushSubscribeAfterEnable', silent: true });
            }
          }
        }
      }
    } finally {
      btnRemindersToggle.disabled = false;
    }

    renderSettingsState();
  });
}

export function openSettings() {
  renderThemeState();
  renderSettingsState();
  settingsModal?.open();
}

function renderThemeState() {
  const current = getTheme();
  themeTabs.forEach(tab => {
    const active = tab.dataset.theme === current;
    tab.classList.toggle("tab--active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  updateTabsRovingIndex(document.getElementById("theme-tabs"));
}

export function closeSettings() {
  settingsModal?.close();
}

function renderSettingsState() {
  if (!isSupported()) {
    remindersStatusText.textContent = "Seu navegador não suporta lembretes.";
    btnRemindersToggle.hidden       = true;
    remindersHint.hidden            = true;
    return;
  }

  const perm = permissionStatus();

  if (perm === "denied") {
    remindersStatusText.textContent = "Permissão de notificação negada pelo navegador.";
    btnRemindersToggle.hidden       = true;
    remindersHint.hidden            = false;
    remindersHint.textContent       = "Para reativar, clique no ícone de cadeado na barra de endereços e permita notificações para este site.";
    return;
  }

  remindersHint.hidden        = true;
  btnRemindersToggle.hidden   = false;

  const pushOn  = isPushEnabled() && perm === "granted";
  const localOn = isEnabled() && perm === "granted";
  const enabled = pushOn || localOn;

  if (enabled) {
    remindersStatusText.textContent = pushOn
      ? "Ativados — você recebe lembretes mesmo com o app fechado."
      : "Ativados — lembretes exibidos enquanto o app está aberto.";
    btnRemindersToggle.textContent  = "Desativar";
    btnRemindersToggle.className    = "btn btn-sm btn-ghost";
  } else {
    remindersStatusText.textContent = perm === "default"
      ? "Desativados — clique em Ativar para autorizar o navegador."
      : "Desativados.";
    btnRemindersToggle.textContent  = "Ativar";
    // F13.3 — btn-primary é reservado para 1 ação por tela; este toggle
    // não é a ação principal da tela de Configurações.
    btnRemindersToggle.className    = "btn btn-sm btn-secondary";
  }
}
