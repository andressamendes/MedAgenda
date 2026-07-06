/**
 * planListView.js — Lista estruturada do Plano da Semana (F3.3/F3.5).
 *
 * Extraído de aiPanelView.js para ser reaproveitado também pela visualização
 * rápida do plano na agenda (weekView.js, ETAPA 6 da F3.5) — mesma marcação,
 * sem duplicar o componente em dois lugares. Só renderiza a lista já
 * computada por planningService.computeWeeklyPlan(); nenhuma sugestão aqui
 * cria evento, grava dado ou dispara notificação.
 */
import { escapeHtml } from "./utils.js";

const PRIORITY_LABELS = { alta: "Alta prioridade", "média": "Prioridade média", baixa: "Baixa prioridade" };

/** Renderiza o plano da semana (ou uma mensagem vazia) dentro de `container`. */
export function renderPlanList(container, plan, emptyMessage = "Nenhuma sugestão no momento — sua semana está em dia!") {
  if (!container) return;

  if (!plan || !plan.length) {
    container.innerHTML = `<p class="ai-plan-empty">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = plan.map(item => `
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
