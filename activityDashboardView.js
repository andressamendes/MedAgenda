// ── activityDashboardView.js — Dashboard de Execução (F2.1) ─────────────────
// Tela de apenas leitura: responde só "Como está minha execução?" através de
// cards simples (título + valor + descrição). Nenhum cálculo mora aqui — toda
// agregação vem de activityDashboardService.getDashboardData(), que já busca
// as sessões uma única vez e deriva todos os indicadores do mesmo conjunto.
//
// Sem gráficos, sem barras, sem animações: só números para leitura rápida.

import { getDashboardData } from "./activityDashboardService.js";
import { getAchievementSummary } from "./achievementService.js";
import { open as openAccountModal } from "./accountView.js";
import { onProfileUpdated } from "./profileService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { skeletonCardsMarkup } from "./skeletonView.js";
import { pad } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

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

// Auditoria UX #24: sem meta configurada, o card só dizia "Sem meta
// configurada." sem nenhum caminho até a tela onde ela é configurável (Minha
// Conta → Metas de Tempo). `goalKey` identifica, para cada card, qual chave
// de `data` checar — usado só por _renderCards() para decidir se mostra o
// link "Configurar meta".
const GOAL_CARD_DEFS = [
  {
    title: "Meta diária",
    value: d => _formatGoalValue(d.dailyGoal),
    desc:  d => _formatGoalDesc(d.dailyGoal),
    goalKey: "dailyGoal",
  },
  {
    title: "Meta semanal",
    value: d => _formatGoalValue(d.weeklyGoal),
    desc:  d => _formatGoalDesc(d.weeklyGoal),
    goalKey: "weeklyGoal",
  },
  {
    title: "Meta mensal",
    value: d => _formatGoalValue(d.monthlyGoal),
    desc:  d => _formatGoalDesc(d.monthlyGoal),
    goalKey: "monthlyGoal",
  },
];

// F10 #3.1 — Reestruturação em níveis: até 11 cards apareciam juntos, sem
// nenhuma hierarquia entre "o que a maioria consulta todo dia" (hoje) e
// "recordes/histórico raramente checados". Os mesmos CARD_DEFS de sempre,
// só reagrupados em três níveis (cada card continua definido uma única vez,
// nenhuma duplicação):
//   - TODAY: sempre visível — o nível 1, o que se consulta com mais frequência.
//   - WEEK_MONTH / RECORDS: nível 2, atrás das abas "Semana/Mês" e "Recordes
//     e Conquistas" (ver initActivityDashboardView) — mesmos dados de
//     sempre, só não competem visualmente com "Hoje" a cada carregamento.
const TODAY_CARD_DEFS = [
  GOAL_CARD_DEFS[0], // Meta diária
  {
    title: "Tempo estudado hoje",
    value: d => _formatDuration(d.todayMinutes),
    desc:  () => "Soma das sessões finalizadas hoje.",
  },
  {
    title: "Sessões hoje",
    value: d => String(d.todaySessionsCount),
    desc:  () => "Quantidade de sessões finalizadas hoje.",
  },
];

const WEEK_MONTH_CARD_DEFS = [
  GOAL_CARD_DEFS[1], // Meta semanal
  GOAL_CARD_DEFS[2], // Meta mensal
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
];

const RECORDS_CARD_DEFS = [
  {
    title: "Maior sessão",
    value: d => d.longestSession ? _formatDuration(d.longestSession.duration_minutes) : "—",
    desc:  d => d.longestSession
      ? `Sessão finalizada em ${_formatDate(d.longestSession.started_at)}.`
      : "Nenhuma sessão finalizada neste mês.",
  },
  // Auditoria UX #23 — achievementService.js já existia, completo e testado,
  // mas nenhuma view o consumia. Card único no Dashboard consolidado (opção
  // "sem criar tela nova" da auditoria), no mesmo padrão dos demais: só
  // formata o que getAchievementSummary() já devolve pronto.
  {
    title: "Conquistas recentes",
    value: d => d.achievements ? `${d.achievements.completed}/${d.achievements.total}` : "—",
    desc:  d => d.achievements
      ? `${d.achievements.completed > 0 ? `${d.achievements.completed} conquista(s) concluída(s)` : "Nenhuma conquista concluída ainda"}. Progresso geral: ${Math.round(d.achievements.overallProgress * 100)}%.`
      : "Não foi possível carregar este indicador.",
  },
];

const CARD_GROUPS = [
  { defs: TODAY_CARD_DEFS,      containerId: "dash-cards-today" },
  { defs: WEEK_MONTH_CARD_DEFS, containerId: "dash-cards-weekmonth" },
  { defs: RECORDS_CARD_DEFS,    containerId: "dash-cards-records" },
];

let cardsElByGroup = [];
let errorEl;
let tabsEl, panelWeekMonthEl, panelRecordsEl;
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

function _cardsMarkup(defs, data) {
  return defs.map(def => {
    const noGoal = def.goalKey && !data[def.goalKey]?.configured;
    const configureLink = noGoal
      ? '<button type="button" class="link-btn" data-action="configure-goal">Configurar meta</button>'
      : "";
    return `
    <div class="dashboard-card">
      <span class="dashboard-card-title">${def.title}</span>
      <span class="dashboard-card-value">${def.value(data)}</span>
      <p class="dashboard-card-desc">${def.desc(data)}</p>
      ${configureLink}
    </div>
  `;
  }).join("");
}

function _renderCards(data) {
  errorEl.hidden = true;
  errorEl.innerHTML = "";
  clearStateBlock(errorEl);
  cardsElByGroup.forEach(({ defs, el }) => {
    el.hidden = false;
    el.innerHTML = _cardsMarkup(defs, data);
  });
}

// Auditoria UX #24 — um único listener delegado por container, montado uma
// vez em initActivityDashboardView() (os cards são recriados via innerHTML a
// cada _load(), então um listener por botão se perderia a cada recarga).
function _onCardsClick(ev) {
  if (ev.target.closest('[data-action="configure-goal"]')) {
    openAccountModal({ focusSection: "goals" });
  }
}

// F10 #3.1 — Abas "Semana/Mês" / "Recordes e Conquistas": puramente
// apresentacional, sem re-fetch — os dados dos dois níveis já foram
// carregados juntos em _load(), só a visibilidade do painel muda. A aba
// "Semana/Mês" começa ativa em toda visita à tela (sem persistência):
// diferente do tema (F10 #2.4), aqui não há uma escolha estável para
// lembrar — os dois painéis são igualmente prováveis de interessar.
function _setActiveTab(panel) {
  tabsEl?.querySelectorAll(".dash-tab").forEach(btn => {
    const active = btn.dataset.panel === panel;
    btn.classList.toggle("dash-tab--active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  if (panelWeekMonthEl) panelWeekMonthEl.hidden = panel !== "week-month";
  if (panelRecordsEl)   panelRecordsEl.hidden   = panel !== "records";
}

function _renderError({ state, message }) {
  cardsElByGroup.forEach(({ el }) => { el.hidden = true; el.innerHTML = ""; });
  errorEl.hidden = false;
  renderStateBlock(errorEl, { state, message, onRetry: () => _load() });
}

async function _load() {
  if (_loading) return;
  _loading = true;
  // Auditoria UX #20 — sem isto, os cards ficavam hidden (tela em branco)
  // durante a carga, diferente do Calendário (calendar.js/showLoading()).
  errorEl.hidden = true;
  cardsElByGroup.forEach(({ defs, el }) => {
    el.hidden = false;
    el.innerHTML = skeletonCardsMarkup(defs.length);
  });
  try {
    const [data, achievements] = await Promise.all([
      getDashboardData(),
      // Isolado do carregamento principal: uma falha aqui vira "—" no card
      // de Conquistas (mesmo padrão de fallback parcial do bloco Revisões em
      // insightsView.js), nunca esconde os demais dez cards de execução.
      getAchievementSummary().catch(err => {
        handleError(err, { context: "activityDashboardView.achievements", silent: true });
        return null;
      }),
    ]);
    _renderCards({ ...data, achievements });
  } catch (err) {
    _renderError(errorToState(handleError(err, { context: "activityDashboardView.load", silent: true })));
  } finally {
    _loading = false;
  }
}

/**
 * Monta o dashboard (uma única vez) e carrega os indicadores. Assina o
 * barramento de eventos da sessão (F6.4) e onProfileUpdated() para
 * recalcular automaticamente os cards de execução sempre que uma sessão ou
 * meta mudar, sem exigir reload da página nem polling.
 */
export async function initActivityDashboardView() {
  if (cardsElByGroup.length === 0) {
    errorEl         = document.getElementById("dash-error");
    tabsEl          = document.getElementById("dash-tabs");
    panelWeekMonthEl = document.getElementById("dash-panel-week-month");
    panelRecordsEl   = document.getElementById("dash-panel-records");

    cardsElByGroup = CARD_GROUPS.map(({ defs, containerId }) => {
      const el = document.getElementById(containerId);
      el.addEventListener("click", _onCardsClick);
      return { defs, el };
    });

    tabsEl?.querySelectorAll(".dash-tab").forEach(btn => {
      btn.addEventListener("click", () => _setActiveTab(btn.dataset.panel));
    });
  }
  _setActiveTab("week-month");
  _subscribeToEventBus();
  if (!_unsubscribeProfile) _unsubscribeProfile = onProfileUpdated(() => _load());
  await _load();
}

/**
 * Desfaz a assinatura do barramento de eventos e demais listeners, além de
 * qualquer recarga pendente, e descarta o DOM renderizado (cards de
 * execução). Chamada no logout/troca de usuário (ver script.js/
 * onBeforeSignOut) — sem isso, os listeners registrados em
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
  if (_unsubscribeProfile) { _unsubscribeProfile(); _unsubscribeProfile = null; }
  cardsElByGroup.forEach(({ el }) => { el.innerHTML = ""; });
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.innerHTML = "";
    clearStateBlock(errorEl);
  }
  _loading = false;
}
