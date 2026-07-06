// ── aiPanelView.js — Painel de IA (Gemini): resumo, sugestão, análise e
// recomendações (F3.2). A View nunca busca nem monta contexto: cada ação só
// chama uma função do gateway (services/ai/aiService.js), que por sua vez
// consulta exclusivamente aiContextService.getAIContext() — a única fonte
// de contexto do app (ver aiContextService.js).

import {
  getWeeklySummary, getStudySuggestion, getScheduleAnalysis, getContextualRecommendations, getWeeklyPlan,
  getMyEvolution,
} from "./services/ai/aiService.js";
import { bindModalBehavior, captureFocus, restoreFocus } from "./modalController.js";
import { handleError } from "./errorService.js";
import { categoryToState, STATES, triggerReauth } from "./stateView.js";
import { AI_CONFIG } from "./config/ai.js";
import { escapeHtml } from "./utils.js";
import { renderPlanList } from "./planListView.js";

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

// Preenchido dentro de initAIPanel() (fechamento sobre o estado do painel,
// que é local à função). Chamado no logout via resetAIPanel() — sem isto,
// uma chamada de IA em andamento no momento do logout continuaria rodando em
// segundo plano e poderia renderizar a resposta do usuário anterior quando o
// próximo usuário abrisse o painel.
let _resetPanel = () => {};

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
  let _resultState = null; // estado do último erro exibido (F4.1) — decide o que o botão de ação faz

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

  // `state` é um dos STATES de stateView.js (ou null quando não é erro) —
  // decide se o botão aparece como "Tentar novamente" (rede/servidor) ou
  // "Entrar novamente" (sessão expirada), nunca os dois ao mesmo tempo
  // (ETAPA 5: sessão expirada nunca oferece retry).
  function showResult(title, text, state = null) {
    resultTitle.textContent = title;
    resultBody.textContent  = text;
    resultBody.classList.remove('ai-result-body--plan');
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
    _resultState = state;
    if (retryBtn) {
      retryBtn.hidden = !state;
      retryBtn.textContent = state === STATES.SESSION_EXPIRED ? 'Entrar novamente' : 'Tentar novamente';
    }
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
    _resultState = null;
    if (retryBtn) retryBtn.hidden = true;

    renderPlanList(resultBody, plan);
  }

  // Minha Evolução (F3.4): reflectionService já devolve tudo estruturado
  // (resumo/pontosPositivos/pontosAtencao/evolucaoRecente, cada item com
  // dadosUtilizados/periodoAnalisado/motivo/nivelConfianca) — a View só
  // renderiza como lista simples, sem gráficos e sem animações.
  function _evolutionSection(title, items) {
    if (!items || !items.length) return '';
    const rows = items.map(i => `
      <li class="ai-evolution-item">
        <p class="ai-evolution-message">${escapeHtml(i.mensagem)}</p>
        <p class="ai-evolution-detail">${escapeHtml(i.motivo)} — ${escapeHtml(i.periodoAnalisado)} · confiança: ${escapeHtml(i.nivelConfianca)}</p>
      </li>
    `).join('');
    return `
      <div class="ai-evolution-section">
        <h4 class="ai-evolution-heading">${escapeHtml(title)}</h4>
        <ul class="ai-evolution-list">${rows}</ul>
      </div>
    `;
  }

  function showEvolutionResult(report) {
    resultTitle.textContent = 'Minha Evolução';
    resultBody.textContent = '';
    resultBody.classList.add('ai-result-body--plan');
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
    _resultState = null;
    if (retryBtn) retryBtn.hidden = true;

    if (!report || report.status === 'insufficient_data' || !report.insights?.length) {
      resultBody.innerHTML = `<p class="ai-plan-empty">${escapeHtml(report?.resumo || 'Ainda não há dados suficientes para refletir sobre seu histórico.')}</p>`;
      return;
    }

    resultBody.innerHTML = `
      <div class="ai-evolution-section">
        <h4 class="ai-evolution-heading">Resumo</h4>
        <p class="ai-evolution-summary">${escapeHtml(report.resumo)}</p>
      </div>
      ${_evolutionSection('Pontos positivos', report.pontosPositivos)}
      ${_evolutionSection('Pontos de atenção', report.pontosAtencao)}
      ${_evolutionSection('Evolução recente', report.evolucaoRecente)}
    `;
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
      showResult(label, result || 'O assistente não retornou resposta. Tente novamente.', result ? null : STATES.SERVER);
    } catch (err) {
      if (err?.code === 'CANCELLED') {
        showActions();
        return;
      }
      const { category } = handleError(err, { context: 'aiPanel.runAIAction', silent: true });
      showResult(label, err.message || 'Ocorreu um erro ao contatar o assistente de IA. Verifique sua conexão e tente novamente.', categoryToState(category));
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
      const { category } = handleError(err, { context: 'aiPanel.runPlanAction', silent: true });
      showResult('Plano da Semana', err.message || 'Ocorreu um erro ao gerar o plano da semana. Verifique sua conexão e tente novamente.', categoryToState(category));
    } finally {
      stopLoadingStages();
      setActionBtnsDisabled(false);
      currentController = null;
    }
  }

  async function runEvolutionAction() {
    lastAction = { kind: 'evolution' };
    showLoading();
    setActionBtnsDisabled(true);
    currentController = new AbortController();
    try {
      const report = await getMyEvolution();
      showEvolutionResult(report);
    } catch (err) {
      const { category } = handleError(err, { context: 'aiPanel.runEvolutionAction', silent: true });
      showResult('Minha Evolução', err.message || 'Ocorreu um erro ao gerar sua reflexão. Verifique sua conexão e tente novamente.', categoryToState(category));
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
    // Sessão expirada nunca repete a mesma chamada (ETAPA 5) — leva direto
    // ao fluxo oficial de reautenticação.
    if (_resultState === STATES.SESSION_EXPIRED) { triggerReauth(); return; }
    if (!lastAction) return;
    if (lastAction.kind === 'plan') runPlanAction();
    else if (lastAction.kind === 'evolution') runEvolutionAction();
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
  document.getElementById('btn-ai-evolution')?.addEventListener('click', runEvolutionAction);

  _resetPanel = () => {
    currentController?.abort('signout');
    stopLoadingStages();
    lastAction   = null;
    _resultState = null;
    panel.hidden   = true;
    overlay.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    showActions();
  };
}

/**
 * Chamado no logout (ver script.js) — cancela qualquer chamada de IA em
 * andamento, fecha o painel e limpa o resultado exibido, para que o próximo
 * usuário nunca veja a análise de IA de outra sessão.
 */
export function resetAIPanel() {
  _resetPanel();
}
