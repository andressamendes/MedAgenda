/**
 * smartCardView.js — Cards Inteligentes (F3.5).
 *
 * Componente reutilizável para apresentar reflexões/recomendações/planos já
 * existentes (recommendationEngine, planningService, reflectionService)
 * discretamente em qualquer tela — dashboard, agenda, formulário de
 * compromisso. Não busca dado algum: só renderiza `{ tipo, mensagem }` já
 * prontos, escapando HTML. Nenhuma consulta nova mora aqui.
 *
 * Cinco tipos de card (ETAPA 2), cada um com ícone e rótulo fixos — nenhum
 * texto de rótulo é decidido pela IA, só a mensagem em si.
 */
import { escapeHtml } from "./utils.js";

export const CARD_TYPES = {
  dica:     { icon: "💡", label: "Dica" },
  sugestao: { icon: "📌", label: "Sugestão" },
  atencao:  { icon: "⚠️", label: "Atenção" },
  meta:     { icon: "🎯", label: "Meta" },
  revisao:  { icon: "🔁", label: "Revisão" },
};

/** Monta um card `{ tipo, mensagem }`, caindo para "dica" se o tipo for desconhecido. */
export function buildSmartCard(tipo, mensagem) {
  return { tipo: CARD_TYPES[tipo] ? tipo : "dica", mensagem };
}

// Mapeia o `type` de recommendationEngine.computeRecommendations() para um
// tipo de card visual — nenhuma regra de recomendação é recalculada aqui,
// só a categoria de exibição é escolhida a partir do tipo já decidido pelo
// Recommendation Engine.
const RECOMMENDATION_CARD_TYPE = {
  overdue_events:          "atencao",
  pending_reviews:         "revisao",
  goals_nearly_met:        "meta",
  understudied_categories: "dica",
  heavy_week:              "atencao",
  empty_week:              "sugestao",
  long_gap_no_sessions:    "atencao",
  low_recent_execution:    "atencao",
};

/** Converte uma recomendação já computada (recommendationEngine.js) num card visual. */
export function recommendationToCard(recommendation) {
  return buildSmartCard(RECOMMENDATION_CARD_TYPE[recommendation.type] || "dica", recommendation.message);
}

/** Converte um item de plano já computado (planningService.js) num card visual. */
export function planItemToCard(item) {
  const byTipo = { overdue: "atencao", review: "revisao", study: "dica", goal: "meta" };
  return buildSmartCard(byTipo[item.tipo] || "sugestao", item.motivo);
}

/** Converte um insight de reflexão já computado (reflectionService.js) num card visual. */
export function reflectionInsightToCard(insight) {
  return buildSmartCard(insight.tipo === "positivo" ? "meta" : "atencao", insight.mensagem);
}

function _cardHTML(card) {
  const meta = CARD_TYPES[card.tipo] || CARD_TYPES.dica;
  return `
    <div class="smart-card smart-card--${card.tipo}">
      <span class="smart-card-icon" aria-hidden="true">${meta.icon}</span>
      <span class="smart-card-label">${meta.label}</span>
      <p class="smart-card-message">${escapeHtml(card.mensagem)}</p>
    </div>
  `;
}

/**
 * Renderiza uma lista de cards inteligentes num container — discreto, sem
 * gráfico e sem animação. Uma lista vazia esconde o container em vez de
 * mostrar uma seção vazia (ETAPA 9: nunca quebra a interface quando não há
 * nada a dizer).
 */
export function renderSmartCards(container, cards) {
  if (!container) return;
  const list = cards || [];
  if (!list.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = list.map(_cardHTML).join("");
}
