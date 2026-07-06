// ── aiPanelView.js — Painel de IA (Gemini): resumo, sugestão, análise e
// recomendações (F3.2). A View nunca busca nem monta contexto: cada ação só
// chama uma função do gateway (services/ai/aiService.js), que por sua vez
// consulta exclusivamente aiContextService.getAIContext() — a única fonte
// de contexto do app (ver aiContextService.js).

import {
  getWeeklySummary, getStudySuggestion, getScheduleAnalysis, getContextualRecommendations, getWeeklyPlan,
} from "./services/ai/aiService.js";
import { bindModalBehavior, captureFocus, restoreFocus } from "./modalController.js";
import { handleError } from "./errorService.js";
import { AI_CONFIG } from "./config/ai.js";
import { escapeHtml } from "./utils.js";

const PRIORITY_LABELS = { alta: "Alta prioridade", "média": "Prioridade média", baixa: "Baixa prioridade" };

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
    resultBody.classList.remove('ai-result-body--plan');
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
    if (retryBtn) retryBtn.hidden = !isError;
  }

  // Plano da Semana (F3.3): planningService já devolve uma lista estruturada
  // (tipo/prioridade/categoria/tempoSugerido/dataSugerida/motivo/confiança) —
  // esta é a única ação do painel renderizada como lista em vez de texto
  // corrido. Nenhum item aqui cria evento, grava dado ou dispara notificação:
  // é só leitura do plano sugerido.
  function showPlanResult(plan) {
    resultTitle.textContent = 'Plano da Semana';
    resultBody.textContent = '';
    resultBody.classList.add('ai-result-body--plan');
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
    if (retryBtn) retryBtn.hidden = true;

    if (!plan || !plan.length) {
      resultBody.innerHTML = `<p class="ai-plan-empty">Nenhuma sugestão no momento — sua semana está em dia!</p>`;
      return;
    }

    resultBody.innerHTML = plan.map(item => `
      <div class="ai-plan-item ai-plan-item--${escapeHtml(item.prioridade)}">
        <div class="ai-plan-item-header">
          <span class="ai-plan-priority ai-plan-priority--${escapeHtml(item.prioridade)}">${escapeHtml(PRIORITY_LABELS[item.prioridade] || item.prioridade)}</span>
          ${item.categoria ? `<span class="ai-plan-category">${escapeHtml(item.categoria)}</span>` : ''}
          <span class="ai-plan-time">${escapeHtml(item.tempoSugerido)}</span>
        </div>
        <p class="ai-plan-reason">${escapeHtml(item.motivo)}</p>
      </div>
    `).join('');
  }

  function setActionBtnsDisabled(disabled) {
    document.querySelectorAll('.ai-action-btn').forEach(b => { b.disabled = disabled; });
  }

  async function runAIAction(label, fn) {
    lastAction = { kind: 'text', label, fn };
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

  async function runPlanAction() {
    lastAction = { kind: 'plan' };
    showLoading();
    setActionBtnsDisabled(true);
    currentController = new AbortController();
    try {
      const plan = await getWeeklyPlan(currentController);
      showPlanResult(plan);
    } catch (err) {
      if (err?.code === 'CANCELLED') {
        showActions();
        return;
      }
      handleError(err, { context: 'aiPanel.runPlanAction', silent: true });
      showResult('Plano da Semana', err.message || 'Ocorreu um erro ao gerar o plano da semana. Verifique sua conexão e tente novamente.', true);
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
    if (!lastAction) return;
    if (lastAction.kind === 'plan') runPlanAction();
    else runAIAction(lastAction.label, lastAction.fn);
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
  document.getElementById('btn-ai-plan')?.addEventListener('click', runPlanAction);
}
