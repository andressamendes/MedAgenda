// ── activityDashboardView.js — Dashboard de Execução (F2.1) ─────────────────
// Tela de apenas leitura: responde só "Como está minha execução?" através de
// cards simples (título + valor + descrição). Nenhum cálculo mora aqui — toda
// agregação vem de activityDashboardService.getDashboardData(), que já busca
// as sessões uma única vez e deriva todos os indicadores do mesmo conjunto.
//
// Sem gráficos, sem barras, sem animações: só números para leitura rápida.

import { getDashboardData } from "./activityDashboardService.js";
import { onSessionFinished } from "./activitySessionService.js";
import { handleError } from "./errorService.js";
import { pad } from "./utils.js";

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

let cardsEl, errorEl;
let _unsubscribe = null;
let _loading = false;

function _renderCards(data) {
  errorEl.hidden = true;
  errorEl.innerHTML = "";
  cardsEl.hidden = false;
  cardsEl.innerHTML = CARD_DEFS.map(def => `
    <div class="dashboard-card">
      <span class="dashboard-card-title">${def.title}</span>
      <span class="dashboard-card-value">${def.value(data)}</span>
      <p class="dashboard-card-desc">${def.desc(data)}</p>
    </div>
  `).join("");
}

function _renderError(friendly) {
  cardsEl.hidden = true;
  cardsEl.innerHTML = "";
  errorEl.hidden = false;
  errorEl.innerHTML = "";

  const msg = document.createElement("span");
  msg.textContent = friendly;
  errorEl.appendChild(msg);

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn btn-sm btn-ghost list-error-retry";
  retryBtn.textContent = "Tentar novamente";
  retryBtn.addEventListener("click", () => _load());
  errorEl.appendChild(retryBtn);
}

async function _load() {
  if (_loading) return;
  _loading = true;
  try {
    const data = await getDashboardData();
    _renderCards(data);
  } catch (err) {
    const { friendly } = handleError(err, { context: "activityDashboardView.load", silent: true });
    _renderError(friendly);
  } finally {
    _loading = false;
  }
}

/**
 * Monta o dashboard (uma única vez) e carrega os indicadores. Assina
 * onSessionFinished() para recalcular automaticamente quando uma sessão for
 * finalizada, sem exigir reload da página nem polling.
 */
export async function initActivityDashboardView() {
  if (!cardsEl) {
    cardsEl = document.getElementById("dash-cards");
    errorEl = document.getElementById("dash-error");
  }
  if (!_unsubscribe) {
    _unsubscribe = onSessionFinished(() => _load());
  }
  await _load();
}
