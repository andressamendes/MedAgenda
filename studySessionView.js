// ── studySessionView.js — Ponto de entrada da futura tela de Sessão de Estudo ─
// F7.1: a tela de Compromissos deixou de executar a sessão de estudo (sem
// cronômetro, sem Iniciar/Pausar/Continuar/Finalizar). Este módulo só faz a
// navegação para a página "Sessão de Estudo" — a interface real dessa página
// (cronômetro, registro de questões, observações etc.) é escopo de uma etapa
// futura. Nenhuma regra de ativitySessionService.js é chamada aqui.

import { showPage } from "./navigationView.js";

let titleEl = null;
let initialized = false;

export function initStudySessionView() {
  if (initialized) return;
  initialized = true;

  titleEl = document.getElementById("session-study-title");
  document.getElementById("btn-session-study-back")
    ?.addEventListener("click", () => showPage("appointments"));
}

/**
 * Abre a página "Sessão de Estudo" para o compromisso informado. Nesta etapa
 * é apenas um placeholder — não inicia sessão, não abre cronômetro.
 */
export function openStudySession(event) {
  if (titleEl) titleEl.textContent = event?.title || "Sessão de estudo";
  showPage("session-study");
}
