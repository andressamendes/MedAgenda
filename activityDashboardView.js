// ── activityDashboardView.js — Dashboard de Execução (F2.1) ─────────────────
// Tela de apenas leitura: responde só "Como está minha execução?" através de
// cards simples (título + valor + descrição). Nenhum cálculo mora aqui — toda
// agregação vem de activityDashboardService.getDashboardData(), que já busca
// as sessões uma única vez e deriva todos os indicadores do mesmo conjunto.
//
// Sem gráficos, sem barras, sem animações: só números para leitura rápida —
// os cards, ao menos. F14.5 acrescenta, no topo da página Progresso, um
// resumo narrativo (2-3 frases) que interpreta os mesmos números em vez de
// só listá-los (ver _narrativeSentences() abaixo); os cards recuam para trás
// de um disclosure ("Ver números").
//
// F14.5 — a antiga página "Dashboard" (#page-dashboard) foi removida: sua
// única seção ("Hoje") passou a viver dentro da página "Hoje" (#page-today,
// ver todayView.js/index.html). O container #dash-cards-today continua
// existindo com o mesmo id — só o destino no DOM mudou, esta view não sabe
// (nem precisa saber) qual página o envolve.

import { getDashboardData } from "./activityDashboardService.js";
import { getAchievementSummary } from "./achievementService.js";
import { getProgressNarrativeData } from "./progressNarrativeService.js";
import { open as openAccountModal } from "./accountView.js";
import { onProfileUpdated } from "./profileService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { skeletonCardsMarkup } from "./skeletonView.js";
import { pad, escapeHtml, formatDuration } from "./utils.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

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
  const meta      = formatDuration(progress.goalMinutes);
  const realizado = formatDuration(progress.actualMinutes);
  return `Meta: ${meta} · Realizado: ${realizado}. ${GOAL_STATE_LABEL[progress.state]}`;
}

// F11 E11 — barra de progresso visual para as metas de tempo, complementando
// o percentual já escrito em _formatGoalDesc() (nunca o substitui — a barra é
// puramente decorativa/redundante, então nenhuma leitora de tela perde
// informação: role="progressbar" + aria-valuenow espelham o mesmo percentual
// já lido no parágrafo). Sem meta configurada, nenhuma barra é desenhada.
function _progressBarMarkup(progress) {
  if (!progress.configured) return "";
  const pct = Math.max(0, Math.min(100, progress.percentage));
  const stateClass = progress.state === "exceeded" ? " dashboard-progress-bar--exceeded"
    : progress.state === "achieved" ? " dashboard-progress-bar--achieved" : "";
  return `
    <div class="dashboard-progress" role="progressbar" aria-valuenow="${progress.percentage}" aria-valuemin="0" aria-valuemax="100">
      <div class="dashboard-progress-bar${stateClass}" style="width: ${pct}%"></div>
    </div>`;
}

// F11 E11 — minigráfico de barras dos minutos estudados por dia, desde
// segunda-feira (dados de computeWeekSparkline(), já buscados junto com o
// resto do dashboard — nenhuma consulta nova). SVG puro (sem lib externa),
// cor via currentColor (acompanha o tema claro/escuro como o resto dos
// ícones do app — ver icons.js).
function _sparklineMarkup(days) {
  if (!days || days.length === 0) return "";
  const WIDTH = 100, HEIGHT = 32, GAP = 4, MIN_BAR_HEIGHT = 2;
  const barWidth = (WIDTH - GAP * (days.length - 1)) / days.length;
  const max = Math.max(1, ...days.map(d => d.minutes));
  const bars = days.map((d, i) => {
    const barHeight = Math.max(MIN_BAR_HEIGHT, Math.round((d.minutes / max) * HEIGHT));
    const x = i * (barWidth + GAP);
    const y = HEIGHT - barHeight;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${barHeight}" rx="1.5"/>`;
  }).join("");
  return `
    <svg class="dashboard-sparkline" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Minutos estudados por dia, desde segunda-feira">
      ${bars}
    </svg>`;
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
    extra: d => _progressBarMarkup(d.dailyGoal),
    goalKey: "dailyGoal",
  },
  {
    title: "Meta semanal",
    value: d => _formatGoalValue(d.weeklyGoal),
    desc:  d => _formatGoalDesc(d.weeklyGoal),
    extra: d => _progressBarMarkup(d.weeklyGoal),
    goalKey: "weeklyGoal",
  },
  {
    title: "Meta mensal",
    value: d => _formatGoalValue(d.monthlyGoal),
    desc:  d => _formatGoalDesc(d.monthlyGoal),
    extra: d => _progressBarMarkup(d.monthlyGoal),
    goalKey: "monthlyGoal",
  },
];

// F10 #3.1 — Reestruturação em níveis: até 11 cards apareciam juntos, sem
// nenhuma hierarquia entre "o que a maioria consulta todo dia" (hoje) e
// "recordes/histórico raramente checados". Os mesmos CARD_DEFS de sempre,
// só reagrupados em três níveis (cada card continua definido uma única vez,
// nenhuma duplicação):
//   - TODAY: sempre visível — o nível 1, o que se consulta com mais frequência.
//   - WEEK_MONTH / RECORDS: nível 2, atrás das abas "Períodos" e "Progresso
//     e Conquistas" (ver initActivityDashboardView) — mesmos dados de
//     sempre, só não competem visualmente com "Hoje" a cada carregamento.
//     F11 E12: nomes atualizados (eram "Semana/Mês"/"Recordes e
//     Conquistas") para anunciar que Revisões e Produtividade também vivem
//     na segunda aba (auditoria #12, #29).
const TODAY_CARD_DEFS = [
  GOAL_CARD_DEFS[0], // Meta diária
  {
    title: "Tempo estudado hoje",
    value: d => formatDuration(d.todayMinutes),
  },
  {
    title: "Sessões hoje",
    value: d => String(d.todaySessionsCount),
  },
];

const WEEK_MONTH_CARD_DEFS = [
  GOAL_CARD_DEFS[1], // Meta semanal
  GOAL_CARD_DEFS[2], // Meta mensal
  {
    title: "Tempo estudado esta semana",
    value: d => formatDuration(d.weekMinutes),
    desc:  () => "Soma das sessões finalizadas desde segunda-feira.",
    extra: d => _sparklineMarkup(d.weekSparkline),
  },
  {
    title: "Tempo estudado este mês",
    value: d => formatDuration(d.monthMinutes),
  },
  {
    title: "Sessões na semana",
    value: d => String(d.weekSessionsCount),
  },
  {
    title: "Sessões no mês",
    value: d => String(d.monthSessionsCount),
  },
  {
    title: "Tempo médio por sessão",
    value: d => formatDuration(d.averageMinutes),
    desc:  () => "Média de duração das sessões finalizadas neste mês.",
  },
];

const RECORDS_CARD_DEFS = [
  {
    title: "Maior sessão",
    value: d => d.longestSession ? formatDuration(d.longestSession.duration_minutes) : "—",
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
// F14.5 — dois elementos de erro (um em cada página que consome
// getDashboardData(): "Hoje" e "Progresso"), já que os dois passaram a viver
// em páginas diferentes, mas continuam carregados juntos numa única _load().
let errorEls = [];
let narrativeEl;
let numbersToggleEl, numbersBodyEl;
let todayStatsToggleEl, todayStatsBodyEl;
let _unsubscribeProfile = null;
let _loading = false;

// ── Progresso narrativo (F14.5) ──────────────────────────────────────────────
// Substitui a superfície de BI (grades de stat-cards) por uma interpretação
// em frases, no topo da página Progresso (auditoria F14 §10, modelo Apple
// Health: "uma frase que interpreta, não uma grade que reporta"). Os dados já
// vêm prontos de progressNarrativeService.getProgressNarrativeData() — esta
// função só decide a redação, nunca recalcula nada.

function _formatCategoryPercentage(category, weekMinutes) {
  if (!weekMinutes) return 0;
  return Math.round((category.minutes / weekMinutes) * 100);
}

function _narrativeSentences(data) {
  const { weekMinutes, previousWeekMinutes, dominantCategory, currentStreak } = data;
  const sentences = [];

  if (weekMinutes <= 0) {
    sentences.push("Você ainda não estudou esta semana.");
  } else {
    const duration = formatDuration(weekMinutes);
    if (previousWeekMinutes > 0) {
      const diff = weekMinutes - previousWeekMinutes;
      if (Math.abs(diff) < 5) {
        sentences.push(`Você estudou ${duration} esta semana — praticamente o mesmo tempo que a semana anterior.`);
      } else {
        const diffDuration = formatDuration(Math.abs(diff));
        const comparison = diff > 0 ? "a mais" : "a menos";
        sentences.push(`Você estudou ${duration} esta semana — ${diffDuration} ${comparison} que a semana anterior.`);
      }
    } else {
      sentences.push(`Você estudou ${duration} esta semana.`);
    }

    if (dominantCategory) {
      const pct = _formatCategoryPercentage(dominantCategory, weekMinutes);
      // F15.1 — dominantCategory.name é texto livre de events.category (também
      // gravável via importação .ics de terceiros) e o resultado entra em
      // narrativeEl.innerHTML: escape obrigatório (XSS armazenado, M1).
      sentences.push(`${escapeHtml(dominantCategory.name)} concentrou ${pct}% do tempo.`);
    }
  }

  sentences.push(currentStreak > 0
    ? `Sequência atual: ${currentStreak} ${currentStreak === 1 ? "dia seguido" : "dias seguidos"} estudando.`
    : "Nenhuma sequência ativa no momento.");

  return sentences;
}

function _renderNarrative(data) {
  if (!narrativeEl) return;
  if (!data) {
    narrativeEl.innerHTML = `<p class="progress-narrative-fallback">Não foi possível carregar o resumo desta semana.</p>`;
    return;
  }
  narrativeEl.innerHTML = _narrativeSentences(data).map(s => `<p>${s}</p>`).join("");
}

function _toggleNumbers() {
  if (!numbersToggleEl || !numbersBodyEl) return;
  const expanded = numbersToggleEl.getAttribute("aria-expanded") === "true";
  const next = !expanded;
  numbersBodyEl.hidden = !next;
  numbersToggleEl.setAttribute("aria-expanded", String(next));
  numbersToggleEl.querySelector(".disclosure-label").textContent = next ? "Ocultar números" : "Ver números";
  if (next) revealWithAnimation(numbersBodyEl);
}

// F15.13 — mesmo padrão de disclosure acima ("Ver números"), agora também na
// grade "Hoje em números" da tela Hoje (auditoria final M13): a tela de
// chegada nasce sem grade visível, 1 clique revela os mesmos cards de sempre.
function _toggleTodayStats() {
  if (!todayStatsToggleEl || !todayStatsBodyEl) return;
  const expanded = todayStatsToggleEl.getAttribute("aria-expanded") === "true";
  const next = !expanded;
  todayStatsBodyEl.hidden = !next;
  todayStatsToggleEl.setAttribute("aria-expanded", String(next));
  todayStatsToggleEl.querySelector(".disclosure-label").textContent = next ? "Ocultar números de hoje" : "Ver números de hoje";
  if (next) revealWithAnimation(todayStatsBodyEl);
}

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
    // F11 E7 — nem todo card tem `desc`: cards cujo título já diz tudo
    // ("Sessões hoje", "Tempo estudado este mês"...) não definem uma, para
    // não repetir em prosa o que o título e o número acima já mostram.
    // O parágrafo só é impresso quando há algo a acrescentar de fato (ex.:
    // metas com valor real, ou desambiguações como "este mês"/"esta semana").
    const desc = def.desc ? `<p class="stat-card-desc">${def.desc(data)}</p>` : "";
    // F11 E11 — slot opcional para conteúdo visual extra (barra de progresso
    // das metas, minigráfico semanal); a maioria dos cards não define `extra`
    // e permanece só título+valor+desc, como antes.
    const extra = def.extra ? def.extra(data) : "";
    return `
    <div class="stat-card">
      <span class="stat-card-title">${def.title}</span>
      <span class="stat-card-value">${def.value(data)}</span>
      ${desc}
      ${extra}
      ${configureLink}
    </div>
  `;
  }).join("");
}

function _renderCards(data) {
  errorEls.forEach(el => {
    el.hidden = true;
    el.innerHTML = "";
    clearStateBlock(el);
  });
  cardsElByGroup.forEach(({ defs, el }) => {
    el.hidden = false;
    el.innerHTML = _cardsMarkup(defs, data);
    revealWithAnimation(el);
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

function _renderError({ state, message }) {
  cardsElByGroup.forEach(({ el }) => { el.hidden = true; el.innerHTML = ""; });
  if (narrativeEl) narrativeEl.innerHTML = "";
  errorEls.forEach(el => {
    el.hidden = false;
    renderStateBlock(el, { state, message, onRetry: () => _load() });
  });
}

async function _load() {
  if (_loading) return;
  _loading = true;
  // Auditoria UX #20 — sem isto, os cards ficavam hidden (tela em branco)
  // durante a carga, diferente do Calendário (calendar.js/showLoading()).
  errorEls.forEach(el => { el.hidden = true; });
  cardsElByGroup.forEach(({ defs, el }) => {
    el.hidden = false;
    el.innerHTML = skeletonCardsMarkup(defs.length);
  });
  if (narrativeEl) narrativeEl.innerHTML = `<p class="progress-narrative-loading">Carregando…</p>`;
  try {
    const [data, achievements, narrative] = await Promise.all([
      getDashboardData(),
      // Isolado do carregamento principal: uma falha aqui vira "—" no card
      // de Conquistas (mesmo padrão de fallback parcial do bloco Revisões em
      // insightsView.js), nunca esconde os demais dez cards de execução.
      getAchievementSummary().catch(err => {
        handleError(err, { context: "activityDashboardView.achievements", silent: true });
        return null;
      }),
      // Mesmo isolamento (F14.5): uma falha ao montar a narrativa nunca
      // esconde os cards — vira uma frase de fallback (ver _renderNarrative).
      getProgressNarrativeData().catch(err => {
        handleError(err, { context: "activityDashboardView.narrative", silent: true });
        return null;
      }),
    ]);
    _renderCards({ ...data, achievements });
    _renderNarrative(narrative);
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
    errorEls = [
      document.getElementById("dash-error-today"),
      document.getElementById("dash-error"),
    ].filter(Boolean);
    narrativeEl     = document.getElementById("progress-narrative");
    numbersToggleEl = document.getElementById("progress-numbers-toggle");
    numbersBodyEl   = document.getElementById("progress-numbers-body");
    numbersToggleEl?.addEventListener("click", _toggleNumbers);
    todayStatsToggleEl = document.getElementById("today-stats-toggle");
    todayStatsBodyEl   = document.getElementById("today-stats-body");
    todayStatsToggleEl?.addEventListener("click", _toggleTodayStats);

    cardsElByGroup = CARD_GROUPS.map(({ defs, containerId }) => {
      const el = document.getElementById(containerId);
      el.addEventListener("click", _onCardsClick);
      return { defs, el };
    });
  }
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
  errorEls.forEach(el => {
    el.hidden = true;
    el.innerHTML = "";
    clearStateBlock(el);
  });
  if (narrativeEl) narrativeEl.innerHTML = "";
  if (numbersBodyEl) numbersBodyEl.hidden = true;
  if (numbersToggleEl) {
    numbersToggleEl.setAttribute("aria-expanded", "false");
    const label = numbersToggleEl.querySelector(".disclosure-label");
    if (label) label.textContent = "Ver números";
  }
  if (todayStatsBodyEl) todayStatsBodyEl.hidden = true;
  if (todayStatsToggleEl) {
    todayStatsToggleEl.setAttribute("aria-expanded", "false");
    const label = todayStatsToggleEl.querySelector(".disclosure-label");
    if (label) label.textContent = "Ver números de hoje";
  }
  _loading = false;
}
