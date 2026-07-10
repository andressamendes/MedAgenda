// ── activityDashboardView.js — Dashboard de Execução (F2.1) ─────────────────
// Tela de apenas leitura: responde só "Como está minha execução?" através de
// cards simples (título + valor + descrição). Nenhum cálculo mora aqui — toda
// agregação vem de activityDashboardService.getDashboardData(), que já busca
// as sessões uma única vez e deriva todos os indicadores do mesmo conjunto.
//
// Sem gráficos, sem barras, sem animações: só números para leitura rápida.

import { getDashboardData } from "./activityDashboardService.js";
import { onReviewStatusChanged } from "./reviewService.js";
import { onProfileUpdated } from "./profileService.js";
import { getDecisions } from "./decisionEngine.js";
import { renderSmartCards, decisionToCard } from "./smartCardView.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { pad } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

// Discreto: no máximo 3 sugestões contextuais por vez (ETAPA 3), mesma ideia
// de "sempre discreta" do enunciado — não é uma segunda central de insights.
const MAX_SMART_TIPS = 3;

function _formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function _formatDate(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Metas de Tempo (F2.2) — apenas informativas, sem recomendação automática.
// O progresso (percentual, estado) já vem pronto de
// activityDashboardService.getDashboardData() -> timeGoals.calculateGoalProgress();
// aqui só formatamos o texto do card, nenhum cálculo é feito na view.
const GOAL_STATE_LABEL = {
  no_goal:  "Sem meta configurada.",
  partial:  "Meta parcialmente atingida.",
  achieved: "Meta atingida.",
  exceeded: "Meta ultrapassada.",
};

function _formatGoalValue(progress) {
  return progress.configured ? `${progress.percentage}%` : "—";
}

function _formatGoalDesc(progress) {
  if (!progress.configured) return GOAL_STATE_LABEL.no_goal;
  const meta      = _formatDuration(progress.goalMinutes);
  const realizado = _formatDuration(progress.actualMinutes);
  return `Meta: ${meta} · Realizado: ${realizado}. ${GOAL_STATE_LABEL[progress.state]}`;
}

const GOAL_CARD_DEFS = [
  {
    title: "Meta diária",
    value: d => _formatGoalValue(d.dailyGoal),
    desc:  d => _formatGoalDesc(d.dailyGoal),
  },
  {
    title: "Meta semanal",
    value: d => _formatGoalValue(d.weeklyGoal),
    desc:  d => _formatGoalDesc(d.weeklyGoal),
  },
  {
    title: "Meta mensal",
    value: d => _formatGoalValue(d.monthlyGoal),
    desc:  d => _formatGoalDesc(d.monthlyGoal),
  },
];

// Ordem de exibição = ordem pedida na ETAPA 3. Cada card só mostra
// título/valor/descrição — nada de gráfico, barra ou ícone de tendência.
const CARD_DEFS = [
  ...GOAL_CARD_DEFS,
  {
    title: "Tempo estudado hoje",
    value: d => _formatDuration(d.todayMinutes),
    desc:  () => "Soma das sessões finalizadas hoje.",
  },
  {
    title: "Tempo estudado esta semana",
    value: d => _formatDuration(d.weekMinutes),
    desc:  () => "Soma das sessões finalizadas desde segunda-feira.",
  },
  {
    title: "Tempo estudado este mês",
    value: d => _formatDuration(d.monthMinutes),
    desc:  () => "Soma das sessões finalizadas neste mês.",
  },
  {
    title: "Sessões hoje",
    value: d => String(d.todaySessionsCount),
    desc:  () => "Quantidade de sessões finalizadas hoje.",
  },
  {
    title: "Sessões na semana",
    value: d => String(d.weekSessionsCount),
    desc:  () => "Quantidade de sessões finalizadas nesta semana.",
  },
  {
    title: "Sessões no mês",
    value: d => String(d.monthSessionsCount),
    desc:  () => "Quantidade de sessões finalizadas neste mês.",
  },
  {
    title: "Tempo médio por sessão",
    value: d => _formatDuration(d.averageMinutes),
    desc:  () => "Média de duração das sessões finalizadas neste mês.",
  },
  {
    title: "Maior sessão",
    value: d => d.longestSession ? _formatDuration(d.longestSession.duration_minutes) : "—",
    desc:  d => d.longestSession
      ? `Sessão finalizada em ${_formatDate(d.longestSession.started_at)}.`
      : "Nenhuma sessão finalizada neste mês.",
  },
];

let cardsEl, errorEl, smartTipsEl;
let _unsubscribeReview  = null;
let _unsubscribeProfile = null;
let _loading = false;

// ── Sincronização com o barramento de eventos (F6.4) ────────────────────────
// O dashboard assina SessionStarted/Finished/Cancelled/Updated diretamente no
// barramento (F6.2) — nunca conhece activitySessionService — e recarrega seus
// indicadores via getDashboardData() sempre que uma sessão muda de estado.
// Pause/Resume não alteram nenhum indicador exibido (tempo, contagem e média
// só mudam quando a sessão é iniciada, atualizada, cancelada ou finalizada) e
// por isso não são assinados, mesma leitura já usada no Histórico (F6.3).
let _unsubscribers = [];
let _reloadTimer   = null;

// Vários eventos podem ser publicados em sequência imediata (ex.: Updated
// seguido de Finished, ao encerrar uma sessão). Em vez de recarregar a cada
// evento, agenda-se uma única recarga no próximo tick — se outro evento
// chegar antes do timer disparar, ele é ignorado (já há uma recarga pendente
// que vai refletir o estado mais recente de qualquer forma).
function _scheduleReload() {
  if (_reloadTimer) return;
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null;
    _load();
  }, 0);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initActivityDashboardView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.STARTED, _scheduleReload),
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

function _renderCards(data) {
  errorEl.hidden = true;
  errorEl.innerHTML = "";
  clearStateBlock(errorEl);
  cardsEl.hidden = false;
  cardsEl.innerHTML = CARD_DEFS.map(def => `
    <div class="dashboard-card">
      <span class="dashboard-card-title">${def.title}</span>
      <span class="dashboard-card-value">${def.value(data)}</span>
      <p class="dashboard-card-desc">${def.desc(data)}</p>
    </div>
  `).join("");
}

function _renderError({ state, message }) {
  cardsEl.hidden = true;
  cardsEl.innerHTML = "";
  errorEl.hidden = false;
  renderStateBlock(errorEl, { state, message, onRetry: () => _load() });
}

// ── Cards inteligentes (F3.5, ETAPA 3/7; consumindo o Decision Engine — F3.7) ─
// Nenhuma decisão é tomada aqui: decisionEngine.getDecisions() já roda
// Recommendation/Planning/Reflection Engine uma única vez e devolve a lista
// final, priorizada e sem duplicidade, via decisionEngine.js. Esta view só
// converte as primeiras decisões em cards visuais — isolado do carregamento
// principal: uma falha aqui nunca esconde os cards de execução (ETAPA 9).
async function _loadSmartTips() {
  if (!smartTipsEl) return;
  try {
    const { decisions } = await getDecisions();
    renderSmartCards(smartTipsEl, decisions.slice(0, MAX_SMART_TIPS).map(decisionToCard));
  } catch (err) {
    handleError(err, { context: "activityDashboardView.smartTips", silent: true });
    renderSmartCards(smartTipsEl, []);
  }
}

async function _load() {
  if (_loading) return;
  _loading = true;
  try {
    const data = await getDashboardData();
    _renderCards(data);
  } catch (err) {
    _renderError(errorToState(handleError(err, { context: "activityDashboardView.load", silent: true })));
  } finally {
    _loading = false;
  }
  await _loadSmartTips();
}

/**
 * Monta o dashboard (uma única vez) e carrega os indicadores. Assina o
 * barramento de eventos da sessão (F6.4) e onReviewStatusChanged()/
 * onProfileUpdated() para recalcular automaticamente — cards de execução e
 * cards inteligentes — sempre que uma sessão, revisão ou meta mudar, sem
 * exigir reload da página nem polling.
 */
export async function initActivityDashboardView() {
  if (!cardsEl) {
    cardsEl     = document.getElementById("dash-cards");
    errorEl     = document.getElementById("dash-error");
    smartTipsEl = document.getElementById("dash-smart-tips");
  }
  _subscribeToEventBus();
  if (!_unsubscribeReview)  _unsubscribeReview  = onReviewStatusChanged(() => _loadSmartTips());
  if (!_unsubscribeProfile) _unsubscribeProfile = onProfileUpdated(() => _load());
  await _load();
}

/**
 * Desfaz a assinatura do barramento de eventos e demais listeners, além de
 * qualquer recarga pendente, e descarta o DOM renderizado (cards de execução
 * e cards inteligentes). Chamada no logout/troca de usuário (ver
 * script.js/onBeforeSignOut) — sem isso, os listeners registrados em
 * _subscribeToEventBus() sobreviveriam à troca de sessão e recarregariam o
 * dashboard com o usuário errado, e os indicadores do usuário anterior
 * permaneceriam visíveis no DOM durante a janela entre o logout e o próximo
 * login (SPA sem reload de página — mesma simetria init/reset da auditoria
 * A1.3).
 */
export function resetActivityDashboardView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }
  if (_unsubscribeReview)  { _unsubscribeReview();  _unsubscribeReview  = null; }
  if (_unsubscribeProfile) { _unsubscribeProfile(); _unsubscribeProfile = null; }
  if (cardsEl) cardsEl.innerHTML = "";
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.innerHTML = "";
    clearStateBlock(errorEl);
  }
  if (smartTipsEl) smartTipsEl.innerHTML = "";
  _loading = false;
}
