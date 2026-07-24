// ── achievementCelebrationView.js — Celebração de conquista desbloqueada (V5.7) ──
// Detecta, no momento em que uma conquista cruza de "em progresso" para
// "concluída", e mostra uma revelação visual única — nunca um toast padrão
// (toastService.js já cobre avisos rotineiros; este é o único "momento de
// vitória" novo da auditoria F19). Mesma moldura de tela cheia do
// Fechamento do Dia (V5.6, ver #close-day-screen/todayView.js), com sua
// própria paleta e animação para não ser confundida com aquele ritual.
//
// Nenhum cálculo mora aqui: a decisão "isto é novo?" já vem pronta de
// achievementService.consumeNewlyCompleted() (achievementService.js
// permanece o único dono da regra "conquistas nunca são persistidas" —
// esta view só exibe o que já foi determinado como recém-concluído).
//
// Fila (não closures de Promise): se mais de uma conquista for concluída na
// mesma carga (ex.: sessão longa que fecha "Sessões concluídas" e "Tempo de
// estudo" ao mesmo tempo), cada uma ganha sua própria revelação, em
// sequência, nunca todas empilhadas na mesma tela.

import { iconSparkle } from "./icons.js";
import { initModal } from "./modalController.js";

const ACHIEVEMENT_ICONS = {}; // preenchido por setAchievementIcons() — ver activityDashboardView.js

let screenEl, iconEl, titleEl, descEl, continueBtn;
let modal;
let _queue = [];
let _showing = false;

function _renderCurrent() {
  const achievement = _queue[0];
  iconEl.innerHTML = ACHIEVEMENT_ICONS[achievement.icon] || iconSparkle;
  titleEl.textContent = achievement.title;
  descEl.textContent = achievement.description;
}

function _showNext() {
  if (_queue.length === 0) {
    _showing = false;
    return;
  }
  _showing = true;
  _renderCurrent();
  modal.open(continueBtn);
}

function _dismissCurrent() {
  modal.close();
  _queue.shift();
  _showNext();
}

// Chamada uma vez, no boot da app (ver script.js). Independe de usuário —
// só amarra o DOM e o ciclo de vida do modal.
export function initAchievementCelebrationView() {
  if (screenEl) return;
  screenEl    = document.getElementById("achievement-celebration-screen");
  iconEl      = document.getElementById("achv-celebration-icon");
  titleEl     = document.getElementById("achv-celebration-title");
  descEl      = document.getElementById("achv-celebration-desc");
  continueBtn = document.getElementById("achv-celebration-continue");
  if (!screenEl) return;

  modal = initModal(screenEl, _dismissCurrent);
  continueBtn.addEventListener("click", _dismissCurrent);
}

// Permite que activityDashboardView.js registre o mapa ícone→SVG já usado na
// lista de conquistas, sem duplicar aqui a tabela de ícones nem importar
// icons.js duas vezes com nomes diferentes.
export function setAchievementIcons(map) {
  Object.assign(ACHIEVEMENT_ICONS, map);
}

// Enfileira as conquistas recém-concluídas (já filtradas por
// achievementService.consumeNewlyCompleted()) para revelação, uma de cada
// vez. Chamar com uma lista vazia é um no-op seguro.
export function celebrateAchievements(achievements) {
  if (!screenEl || !achievements || achievements.length === 0) return;
  _queue.push(...achievements);
  if (!_showing) _showNext();
}

// Chamada no logout/troca de usuário (mesma simetria init/reset da auditoria
// A1.3): a fila e a tela de um usuário nunca podem sobreviver à troca de
// sessão nesta SPA sem reload de página.
export function resetAchievementCelebrationView() {
  _queue = [];
  _showing = false;
  if (modal) modal.close();
}
