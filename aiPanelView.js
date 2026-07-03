// ── aiPanelView.js — Painel de IA (Gemini): resumo, sugestão e análise

import { getEventsByRange } from "./eventService.js";
import { isoDate, mondayOf } from "./utils.js";
import { isPersonalVisible } from "./academicCalendarView.js";
import { getWeeklySummary, getStudySuggestion, getScheduleAnalysis } from "./services/ai/aiService.js";
import { bindModalBehavior, captureFocus, restoreFocus } from "./modalController.js";

export function initAIPanel() {
  const overlay     = document.getElementById('ai-panel-overlay');
  const panel       = document.getElementById('ai-panel');
  const closeBtn    = document.getElementById('ai-panel-close');
  const openBtn     = document.getElementById('nav-ai-assistant');
  const actionsDiv  = document.querySelector('.ai-panel-actions');
  const resultDiv   = document.getElementById('ai-panel-result');
  const loadingDiv  = document.getElementById('ai-panel-loading');
  const resultBody  = document.getElementById('ai-result-body');
  const resultTitle = document.getElementById('ai-result-title');
  const backBtn     = document.getElementById('btn-ai-back');

  if (!panel || !openBtn) return;

  let _prevFocus = null;

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

  function showLoading() {
    actionsDiv.hidden = true;
    resultDiv.hidden  = true;
    loadingDiv.hidden = false;
  }

  function showResult(title, text) {
    resultTitle.textContent = title;
    resultBody.textContent  = text;
    actionsDiv.hidden = true;
    loadingDiv.hidden = true;
    resultDiv.hidden  = false;
  }

  function setActionBtnsDisabled(disabled) {
    document.querySelectorAll('.ai-action-btn').forEach(b => { b.disabled = disabled; });
  }

  async function runAIAction(label, fn) {
    showLoading();
    setActionBtnsDisabled(true);
    try {
      let events;
      try {
        if (isPersonalVisible()) {
          // Superset das janelas usadas pelos 3 prompts de IA (7/14/30 dias) —
          // ver services/ai/prompts/*.js.
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const end = new Date(today);
          end.setDate(end.getDate() + 30);
          events = await getEventsByRange(isoDate(mondayOf(today)), isoDate(end));
        } else {
          events = [];
        }
      } catch (dbErr) {
        console.error('[AI] Erro ao carregar eventos do banco de dados:', dbErr);
        showResult(label, 'Não foi possível carregar seus compromissos. Verifique sua conexão e tente novamente.');
        return;
      }
      const result = await fn(events);
      showResult(label, result || 'O assistente não retornou resposta. Tente novamente.');
    } catch (err) {
      console.error('[AI] Erro no assistente de IA:', err);
      showResult(label, err.message || 'Ocorreu um erro ao contatar o assistente de IA. Verifique sua conexão e tente novamente.');
    } finally {
      setActionBtnsDisabled(false);
    }
  }

  openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backBtn?.addEventListener('click', showActions);

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
}
