// ── activityDashboardView.js — Dashboard de Execução (F2.1) ─────────────────
// Tela de apenas leitura: responde só "Como está minha execução?" através de
// cards simples (título + valor + descrição). Nenhum cálculo mora aqui — toda
// agregação vem de activityDashboardService.getDashboardData(), que já busca
// as sessões uma única vez e deriva todos os indicadores do mesmo conjunto.
//
// Sem gráficos, sem barras, sem animações: só números para leitura rápida —
// os cards, ao menos. F14.5 acrescenta, no topo da página Progresso, um
// resumo narrativo que interpreta os mesmos números em vez de só listá-los;
// Etapa 3 reduziu esse resumo a 1 única frase de destaque (ver
// _highlightSentence() abaixo) — as demais frases viraram legenda dos cards
// correspondentes, dentro do disclosure. Os cards recuam para trás
// de um disclosure ("Ver detalhes", V5.17). V5.17 também soma o anel de meta
// diária (V5.2) ao topo da página, ao lado do heatmap de constância (V5.1):
// as três peças (anel + heatmap + narrativa) formam a composição visual
// primária de Progresso — nenhum cálculo novo, só uma segunda leitura do
// mesmo data.dailyGoal. Etapa 1 removeu a duplicata: o stat-card "Meta
// diária" (na página "Hoje") não repete mais o anel, só o texto — a meta
// diária aparece visualmente uma única vez, no hero. Semanal/mensal usam o
// mesmo anel (mesma metáfora visual), cada um só no seu próprio stat-card.
//
// F14.5 — a antiga página "Dashboard" (#page-dashboard) foi removida: sua
// única seção ("Hoje") passou a viver dentro da página "Hoje" (#page-today,
// ver todayView.js/index.html). O container #dash-cards-today continua
// existindo com o mesmo id — só o destino no DOM mudou, esta view não sabe
// (nem precisa saber) qual página o envolve.

import { getDashboardData } from "./activityDashboardService.js";
import { listAchievements, consumeNewlyCompleted } from "./achievementService.js";
import { setAchievementIcons, celebrateAchievements, initAchievementCelebrationView, resetAchievementCelebrationView } from "./achievementCelebrationView.js";
import { getProgressNarrativeData } from "./progressNarrativeService.js";
import { open as openAccountModal } from "./accountView.js";
import { onProfileUpdated } from "./profileService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { skeletonCardsMarkup } from "./skeletonView.js";
import { pad, escapeHtml, formatDuration } from "./utils.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import { iconClock, iconCheckCircle, iconTarget, iconFlame, iconBookOpen } from "./icons.js";

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

// V5.2 — anel circular (SVG puro), a única metáfora visual de "% de meta
// cumprida" no produto (Etapa 1: substituiu de vez a antiga barra linear
// também nas metas semanal/mensal, ver GOAL_CARD_DEFS). O percentual
// continua escrito em _formatGoalDesc() e em .stat-card-value — o anel é só
// uma segunda representação do mesmo dado, nunca a única: role="progressbar"
// + aria-valuenow espelham o mesmo percentual já lido no parágrafo.
const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function _progressRingMarkup(progress) {
  if (!progress.configured) return "";
  const pct = Math.max(0, Math.min(100, progress.percentage));
  const stateClass = progress.state === "exceeded" ? " dashboard-progress-ring-fg--exceeded"
    : progress.state === "achieved" ? " dashboard-progress-ring-fg--achieved" : "";
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
  return `
    <div class="dashboard-progress-ring" role="progressbar" aria-valuenow="${progress.percentage}" aria-valuemin="0" aria-valuemax="100">
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle class="dashboard-progress-ring-bg" cx="32" cy="32" r="${RING_RADIUS}"></circle>
        <circle class="dashboard-progress-ring-fg${stateClass}" cx="32" cy="32" r="${RING_RADIUS}"
          stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
      </svg>
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
    // Etapa 1 — o anel da meta diária já vive no hero da página Progresso
    // (_goalRingHeroMarkup/_renderGoalRingHero); este card não repete o
    // mesmo anel, só o texto (valor + descrição), evitando a mesma meta
    // aparecer duas vezes na tela.
    goalKey: "dailyGoal",
  },
  {
    title: "Meta semanal",
    value: d => _formatGoalValue(d.weeklyGoal),
    desc:  d => _formatGoalDesc(d.weeklyGoal),
    // Etapa 1 — mesma metáfora visual do anel da meta diária, em vez da
    // barra linear (uma única linguagem visual de "% de meta cumprida").
    extra: d => _progressRingMarkup(d.weeklyGoal),
    goalKey: "weeklyGoal",
  },
  {
    title: "Meta mensal",
    value: d => _formatGoalValue(d.monthlyGoal),
    desc:  d => _formatGoalDesc(d.monthlyGoal),
    extra: d => _progressRingMarkup(d.monthlyGoal),
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
    // Etapa 3 — a frase de matéria dominante ("Cardiologia concentrou 67% do
    // tempo") saiu da narrativa do topo e virou a segunda linha da descrição
    // deste card, que já é sobre "esta semana": mesmo dado, mesma leitura,
    // só sem competir com a frase de destaque lá em cima.
    desc:  d => {
      const base = "Soma das sessões finalizadas desde segunda-feira.";
      const sentence = _dominantCategorySentence(d.narrative);
      return sentence ? `${base} ${sentence}` : base;
    },
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
];

// ── Conquistas (V5.3, vitrine na Etapa 5) ────────────────────────────────
// Auditoria UX #23 já tinha exposto achievementService.js como um único card
// resumido ("3/5"). V5.3 renderiza as 5 conquistas individualmente — mesmo
// domínio, mesmos dados de listAchievements(), nenhum cálculo novo: só forma
// visual (ícone + estado) para o que já existia pronto e testado. Etapa 5
// troca o card horizontal por um "troféu" vertical em grade (.achievements-shelf,
// style.css), sem mexer em classe/estrutura que os testes já cobrem
// (achievement-item, achievement-item--{state}, achievement-icon svg).
const ACHIEVEMENT_ICONS = {
  clock: iconClock,
  "check-circle": iconCheckCircle,
  target: iconTarget,
  flame: iconFlame,
  book: iconBookOpen,
};
// V5.7 — mesmo mapa ícone→SVG é reaproveitado pela tela de celebração, sem
// duplicar a tabela nem importar icons.js com nomes diferentes em dois
// lugares.
setAchievementIcons(ACHIEVEMENT_ICONS);

function _achievementState(achievement) {
  if (achievement.completed) return "completed";
  if (achievement.current > 0) return "in-progress";
  return "locked";
}

const ACHIEVEMENT_STATE_LABEL = {
  completed:   "Concluída",
  "in-progress": "Em progresso",
  locked:      "Bloqueada",
};

function _achievementItemMarkup(achievement) {
  const state = _achievementState(achievement);
  const pct = Math.round(achievement.progress * 100);
  const icon = ACHIEVEMENT_ICONS[achievement.icon] || "";
  return `
    <li class="achievement-item achievement-item--${state}">
      <span class="achievement-icon" aria-hidden="true">${icon}</span>
      <span class="achievement-state achievement-state--${state}">${ACHIEVEMENT_STATE_LABEL[state]}</span>
      <div class="achievement-body">
        <span class="achievement-title">${escapeHtml(achievement.title)}</span>
        <p class="achievement-desc">${escapeHtml(achievement.description)}</p>
        <div class="achievement-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="achievement-progress-bar achievement-progress-bar--${state}" style="width: ${pct}%"></div>
        </div>
        <span class="achievement-count">${achievement.current}/${achievement.target}</span>
      </div>
    </li>`;
}

function _achievementsMarkup(achievements) {
  if (!achievements) {
    return `<p class="list-empty">Não conseguimos carregar suas conquistas agora. Tente de novo em instantes.</p>`;
  }
  return `<ul class="achievements-list achievements-shelf">${achievements.map(_achievementItemMarkup).join("")}</ul>`;
}

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
let goalRingHeroEl;
let achievementsEl;
let numbersToggleEl, numbersBodyEl;
let todayStatsToggleEl, todayStatsBodyEl;
let _unsubscribeProfile = null;
let _loading = false;

// ── Progresso narrativo (F14.5, reduzida na Etapa 3) ─────────────────────────
// Substitui a superfície de BI (grades de stat-cards) por uma interpretação
// em frase, no topo da página Progresso (auditoria F14 §10, modelo Apple
// Health: "uma frase que interpreta, não uma grade que reporta"). Os dados já
// vêm prontos de progressNarrativeService.getProgressNarrativeData() — esta
// função só decide a redação, nunca recalcula nada.
//
// Etapa 3 — a narrativa virou 1 única frase de destaque em vez de até 4
// frases de mesmo peso ("parede de texto", auditoria de Progresso). Critério
// de prioridade, da mais para a menos urgente: alerta (nenhum estudo esta
// semana) > tendência (comparação com a semana anterior) > neutro (só o
// tempo desta semana, sem semana anterior para comparar) — os três ramos do
// if/else abaixo já são mutuamente exclusivos, então a ordem de checagem é a
// própria regra de prioridade. As demais frases de antes (matéria dominante,
// revisões, produtividade) não desaparecem: matéria dominante virou a
// segunda linha da descrição do card "Tempo estudado esta semana"
// (_dominantCategorySentence, usado em WEEK_MONTH_CARD_DEFS acima); revisões
// e produtividade viram legenda dos próprios blocos em insightsView.js
// (_reviewsSentence/_productivitySentence lá) — mesmos dados de sempre, só
// mais perto do card a que se referem.
function _highlightSentence(data) {
  const { weekMinutes, previousWeekMinutes } = data;

  if (weekMinutes <= 0) {
    return "Você ainda não estudou esta semana.";
  }

  const duration = formatDuration(weekMinutes);
  if (previousWeekMinutes > 0) {
    const diff = weekMinutes - previousWeekMinutes;
    if (Math.abs(diff) < 5) {
      return `Você estudou ${duration} esta semana — praticamente o mesmo tempo que a semana anterior.`;
    }
    const diffDuration = formatDuration(Math.abs(diff));
    const comparison = diff > 0 ? "a mais" : "a menos";
    return `Você estudou ${duration} esta semana — ${diffDuration} ${comparison} que a semana anterior.`;
  }

  return `Você estudou ${duration} esta semana.`;
}

function _formatCategoryPercentage(category, weekMinutes) {
  if (!weekMinutes) return 0;
  return Math.round((category.minutes / weekMinutes) * 100);
}

// Etapa 3 — antes uma frase da narrativa do topo, agora a segunda linha da
// descrição do card "Tempo estudado esta semana" (ver WEEK_MONTH_CARD_DEFS).
// `narrative` é o mesmo objeto de getProgressNarrativeData() já buscado em
// _load(); nenhuma consulta nova.
function _dominantCategorySentence(narrative) {
  const category = narrative?.dominantCategory;
  if (!category) return null;
  const pct = _formatCategoryPercentage(category, narrative.weekMinutes);
  // F15.1 — dominantCategory.name é texto livre de events.category (também
  // gravável via importação .ics de terceiros) e o resultado entra em
  // innerHTML (via def.desc() em _cardsMarkup): escape obrigatório (XSS
  // armazenado, M1).
  return `${escapeHtml(category.name)} concentrou ${pct}% do tempo.`;
}

// V5.17 — mesmo anel de _progressRingMarkup() (meta diária), agora também
// solto no topo da página Progresso, com o mesmo texto de _formatGoalDesc()
// ao lado (nenhuma leitura nova: é o mesmo par valor+descrição do stat-card
// "Meta diária", só fora do card).
function _goalRingHeroMarkup(progress) {
  if (!progress.configured) {
    return `<p class="progress-goal-ring-empty">${GOAL_STATE_LABEL.no_goal} <button type="button" class="link-btn" data-action="configure-goal">Configurar meta</button></p>`;
  }
  return `
    ${_progressRingMarkup(progress)}
    <div class="progress-goal-ring-text">
      <span class="progress-goal-ring-value">${_formatGoalValue(progress)}</span>
      <span class="progress-goal-ring-desc">${_formatGoalDesc(progress)}</span>
    </div>`;
}

function _renderGoalRingHero(data) {
  if (!goalRingHeroEl) return;
  goalRingHeroEl.innerHTML = _goalRingHeroMarkup(data.dailyGoal);
}

function _renderNarrative(data) {
  if (!narrativeEl) return;
  if (!data) {
    narrativeEl.innerHTML = `<p class="progress-narrative-fallback">Não foi possível carregar o resumo desta semana.</p>`;
    return;
  }
  narrativeEl.innerHTML = `<p class="progress-narrative-highlight">${_highlightSentence(data)}</p>`;
}

function _toggleNumbers() {
  if (!numbersToggleEl || !numbersBodyEl) return;
  const expanded = numbersToggleEl.getAttribute("aria-expanded") === "true";
  const next = !expanded;
  numbersBodyEl.hidden = !next;
  numbersToggleEl.setAttribute("aria-expanded", String(next));
  numbersToggleEl.querySelector(".disclosure-label").textContent = next ? "Ocultar detalhes" : "Ver detalhes";
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

function _renderAchievements(achievements) {
  if (!achievementsEl) return;
  achievementsEl.innerHTML = _achievementsMarkup(achievements);
}

function _renderError({ state, message }) {
  cardsElByGroup.forEach(({ el }) => { el.hidden = true; el.innerHTML = ""; });
  if (narrativeEl) narrativeEl.innerHTML = "";
  if (goalRingHeroEl) goalRingHeroEl.innerHTML = "";
  if (achievementsEl) achievementsEl.innerHTML = "";
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
      // Isolado do carregamento principal: uma falha aqui vira uma mensagem
      // de fallback na lista de Conquistas (mesmo padrão de fallback parcial
      // do bloco Revisões em insightsView.js), nunca esconde os demais cards
      // de execução.
      listAchievements().catch(err => {
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
    // Etapa 3 — a frase de matéria dominante (antes na narrativa) agora vive
    // na descrição do card "Tempo estudado esta semana" (ver
    // WEEK_MONTH_CARD_DEFS/_dominantCategorySentence); `data` é só
    // enriquecido com o mesmo `narrative` já buscado acima, nenhuma consulta
    // nova.
    data.narrative = narrative;
    _renderCards(data);
    _renderGoalRingHero(data);
    _renderNarrative(narrative);
    _renderAchievements(achievements);
    // V5.7 — celebração de conquista desbloqueada: só dispara para o que
    // achievementService.consumeNewlyCompleted() determinar como recém-
    // concluído neste device (nunca recalculado aqui, nunca duplicado se
    // listAchievements() falhou e achievements veio null).
    if (achievements) celebrateAchievements(consumeNewlyCompleted(achievements));
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
  initAchievementCelebrationView();
  if (cardsElByGroup.length === 0) {
    errorEls = [
      document.getElementById("dash-error-today"),
      document.getElementById("dash-error"),
    ].filter(Boolean);
    narrativeEl     = document.getElementById("progress-narrative");
    goalRingHeroEl  = document.getElementById("progress-goal-ring");
    goalRingHeroEl?.addEventListener("click", _onCardsClick);
    achievementsEl  = document.getElementById("achievements-list");
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
  if (goalRingHeroEl) goalRingHeroEl.innerHTML = "";
  if (achievementsEl) achievementsEl.innerHTML = "";
  resetAchievementCelebrationView();
  if (numbersBodyEl) numbersBodyEl.hidden = true;
  if (numbersToggleEl) {
    numbersToggleEl.setAttribute("aria-expanded", "false");
    const label = numbersToggleEl.querySelector(".disclosure-label");
    if (label) label.textContent = "Ver detalhes";
  }
  if (todayStatsBodyEl) todayStatsBodyEl.hidden = true;
  if (todayStatsToggleEl) {
    todayStatsToggleEl.setAttribute("aria-expanded", "false");
    const label = todayStatsToggleEl.querySelector(".disclosure-label");
    if (label) label.textContent = "Ver números de hoje";
  }
  _loading = false;
}
