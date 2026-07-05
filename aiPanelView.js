// ── aiPanelView.js — Painel de IA (Gemini): resumo, sugestão, análise e
// recomendações (F3.2). A View nunca busca nem monta contexto: cada ação só
// chama uma função do gateway (services/ai/aiService.js), que por sua vez
// consulta exclusivamente aiContextService.getAIContext() — a única fonte
// de contexto do app (ver aiContextService.js).

import {
  getWeeklySummary, getStudySuggestion, getScheduleAnalysis, getContextualRecommendations,
} from "./services/ai/aiService.js";
import { bindModalBehavior, captureFocus, restoreFocus } from "./modalController.js";
import { handleError } from "./errorService.js";
import { AI_CONFIG } from "./config/ai.js";

// Mensagens progressivas para a espera da IA — a chamada real (Edge Function
// + Gemini) costuma levar entre 3 e 10s; os degraus abaixo cobrem esse caso
// comum e sinalizam quando a espera foge do normal, sem inventar um progresso
// que não existe de fato.
const LOADING_STAGES = [
  { at: 0,     text: 'Preparando análise…' },
  { at: 2000,  text: 'Consultando o assistente…' },
  { at: 6000,  text: 'Processando sua solicitação…' },
  { at: 12000, text: 'Esta resposta está demorando mais que o normal…' },
];

export function initAIPanel() {
  const overlay     = document.getElementById('ai-panel-overlay');
  const panel       = document.getElementById('ai-panel');
  const closeBtn    = document.getElementById('ai-panel-close');
  const openBtn     = document.getElementById('nav-ai-assistant');
  const actionsDiv  = document.querySelector('.ai-panel-actions');
  const resultDiv   = document.getElementById('ai-panel-result');
  const loadingDiv  = document.getElementById('ai-panel-loading');
  const loadingText = document.getElementById('ai-loading-text');
  const resultBody  = document.getElementById('ai-result-body');
  const resultTitle = document.getElementById('ai-result-title');
  const backBtn     = document.getElementById('btn-ai-back');
  const cancelBtn   = document.getElementById('btn-ai-cancel');
  const retryBtn    = document.getElementById('btn-ai-retry');

  if (!panel || !openBtn) return;

  let _prevFocus = null;
  let stageTimers = [];
  let currentController = null;
  let lastAction = null;

  function openPanel() {
    _prevFocus = captureFocus();
    panel.hidden   = false;
    overlay.hidden = false;
    panel.removeAttribute('aria-hidden');
    overlay.removeAttribute('aria-hidden');
    showActions();
    closeBtn.focus();
  }

  function closePanel() {
    // Não deixa a chamada em andamento "presa" em segundo plano nem os
    // temporizadores de estágio rodando depois do painel fechado.
    currentController?.abort('user');
    stopLoadingStages();
    panel.hidden   = true;
    overlay.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    restoreFocus(_prevFocus);
    _prevFocus = null;
  }

  function showActions() {
    actionsDiv.hidden = false;
    resultDiv.hidden  = true;
    loadingDiv.hidden = true;
  }

  function stopLoadingStages() {
    stageTimers.forEach(clearTimeout);
    stageTimers = [];
  }

  function startLoadingStages() {
    stopLoadingStages();
    loadingText.textContent = LOADING_STAGES[0].text;
    LOADING_STAGES.slice(1).forEach(({ at, text }) => {
      stageTimers.push(setTimeout(() => { loadingText.textContent = text; }, at));
    });
    // Avisa antes do timeout configurado (services/ai/providers/geminiProvider.js)
    // que a operação será cancelada, em vez de deixar a espera parecer travada.
    const warnAt = Math.max(AI_CONFIG.timeout - 5000, 13000);
    stageTimers.push(setTimeout(() => {
      loadingText.textContent = 'Isso está demorando mais que o esperado. A operação será cancelada automaticamente em instantes.';
    }, warnAt));
  }

  function showLoading() {
    actionsDiv.hidden = true;
    resultDiv.hidden  = true;
    loadingDiv.hidden = false;
    startLoadingStages();
  }

  function showResult(title, text, isError = false) {
    resultTitle.textContent = title;
    resultBody.textContent  = text;
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
    if (retryBtn) retryBtn.hidden = !isError;
  }

  function setActionBtnsDisabled(disabled) {
    document.querySelectorAll('.ai-action-btn').forEach(b => { b.disabled = disabled; });
  }

  async function runAIAction(label, fn) {
    lastAction = { label, fn };
    showLoading();
    setActionBtnsDisabled(true);
    currentController = new AbortController();
    try {
      const result = await fn(currentController);
      showResult(label, result || 'O assistente não retornou resposta. Tente novamente.', !result);
    } catch (err) {
      if (err?.code === 'CANCELLED') {
        showActions();
        return;
      }
      handleError(err, { context: 'aiPanel.runAIAction', silent: true });
      showResult(label, err.message || 'Ocorreu um erro ao contatar o assistente de IA. Verifique sua conexão e tente novamente.', true);
    } finally {
      stopLoadingStages();
      setActionBtnsDisabled(false);
      currentController = null;
    }
  }

  openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backBtn?.addEventListener('click', showActions);
  cancelBtn?.addEventListener('click', () => currentController?.abort('user'));
  retryBtn?.addEventListener('click', () => {
    if (lastAction) runAIAction(lastAction.label, lastAction.fn);
  });

  // Estrutura em dois elementos (painel + backdrop separado) — usa as
  // primitivas de baixo nível do modalController em vez do wrapper padrão de
  // overlay único, mas reutiliza a mesma lógica de Escape/clique fora/Focus Trap.
  bindModalBehavior(overlay, () => !panel.hidden, closePanel, panel);

  document.getElementById('btn-ai-weekly')?.addEventListener('click', () =>
    runAIAction('Resumo da semana', getWeeklySummary)
  );
  document.getElementById('btn-ai-study')?.addEventListener('click', () =>
    runAIAction('Horários para estudo', getStudySuggestion)
  );
  document.getElementById('btn-ai-analysis')?.addEventListener('click', () =>
    runAIAction('Análise da agenda', getScheduleAnalysis)
  );
  document.getElementById('btn-ai-recommendations')?.addEventListener('click', () =>
    runAIAction('Recomendações', getContextualRecommendations)
  );
}
