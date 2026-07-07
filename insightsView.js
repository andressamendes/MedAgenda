// ── insightsView.js — Central de Insights: Infraestrutura (F2.4) ────────────
// Tela de apenas leitura, organizada em quatro blocos (Execução / Metas /
// Revisões / Produtividade). Nenhum cálculo mora aqui — toda a consolidação
// vem de insightsService.getInsightsData(), que já busca as quatro fontes em
// paralelo e devolve cada bloco com seu próprio estado ("ok" | "partial" |
// "error"). Esta view só formata e decide, bloco a bloco, o que exibir —
// nunca combina dados de serviços diferentes manualmente.
//
// Sem gráficos, sem barras, sem animações: só cards simples, mesmo padrão de
// activityDashboardView.js.
//
// F6.5: a Central assina o barramento de eventos da sessão (sessionEventBus,
// F6.2) diretamente — nunca activitySessionService, nunca onSessionFinished()
// (adaptador legado mantido só para módulos ainda não migrados) — mesmo
// padrão já usado pelo Histórico (F6.3) e pelo Dashboard (F6.4).

import { getInsightsData } from "./insightsService.js";
import { onReviewStatusChanged } from "./reviewService.js";
import { onProfileUpdated } from "./profileService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock, STATES } from "./stateView.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

function _formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Metas de Tempo — mesma formatação de activityDashboardView.js (F2.2):
// o progresso já vem pronto de timeGoals.calculateGoalProgress(); aqui só se
// formata o texto do card.
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

// ── Definição dos blocos (ETAPA 4) — ordem = ordem pedida na auditoria ──────

const EXECUCAO_CARD_DEFS = [
  { title: "Tempo estudado hoje",           value: d => _formatDuration(d.todayMinutes), desc: () => "Soma das sessões finalizadas hoje." },
  { title: "Tempo estudado esta semana",    value: d => _formatDuration(d.weekMinutes),  desc: () => "Soma das sessões finalizadas desde segunda-feira." },
  { title: "Tempo estudado este mês",       value: d => _formatDuration(d.monthMinutes), desc: () => "Soma das sessões finalizadas neste mês." },
  { title: "Sessões concluídas hoje",       value: d => String(d.todaySessionsCount), desc: () => "Quantidade de sessões finalizadas hoje." },
  { title: "Sessões concluídas na semana",  value: d => String(d.weekSessionsCount),  desc: () => "Quantidade de sessões finalizadas nesta semana." },
  { title: "Sessões concluídas no mês",     value: d => String(d.monthSessionsCount), desc: () => "Quantidade de sessões finalizadas neste mês." },
];

const METAS_CARD_DEFS = [
  { title: "Meta diária",   value: d => _formatGoalValue(d.dailyGoal),   desc: d => _formatGoalDesc(d.dailyGoal) },
  { title: "Meta semanal",  value: d => _formatGoalValue(d.weeklyGoal),  desc: d => _formatGoalDesc(d.weeklyGoal) },
  { title: "Meta mensal",   value: d => _formatGoalValue(d.monthlyGoal), desc: d => _formatGoalDesc(d.monthlyGoal) },
];

const REVISOES_CARD_DEFS = [
  {
    title: "Revisões pendentes",
    value: d => d.pendingCount === null ? "—" : String(d.pendingCount),
    desc:  d => d.pendingCount === null ? "Não foi possível carregar este indicador." : "Revisões aguardando conclusão.",
  },
  {
    title: "Revisões concluídas",
    value: d => d.completedCount === null ? "—" : String(d.completedCount),
    desc:  d => d.completedCount === null ? "Não foi possível carregar este indicador." : "Revisões já concluídas.",
  },
];

const PRODUTIVIDADE_CARD_DEFS = [
  { title: "Compromissos executados",         value: d => String(d.executedCount),      desc: () => "Compromissos com ao menos uma sessão finalizada." },
  { title: "Compromissos nunca executados",   value: d => String(d.neverExecutedCount), desc: () => "Compromissos sem nenhuma sessão finalizada." },
];

const BLOCK_DEFS = [
  { key: "execucao",      cardDefs: EXECUCAO_CARD_DEFS,      cardsId: "insights-execucao-cards",      errorId: "insights-execucao-error",      noticeId: "insights-execucao-notice" },
  { key: "metas",         cardDefs: METAS_CARD_DEFS,         cardsId: "insights-metas-cards",         errorId: "insights-metas-error",         noticeId: "insights-metas-notice" },
  { key: "revisoes",      cardDefs: REVISOES_CARD_DEFS,      cardsId: "insights-revisoes-cards",      errorId: "insights-revisoes-error",      noticeId: "insights-revisoes-notice" },
  { key: "produtividade", cardDefs: PRODUTIVIDADE_CARD_DEFS, cardsId: "insights-produtividade-cards", errorId: "insights-produtividade-error", noticeId: "insights-produtividade-notice" },
];

let _unsubscribeReview  = null;
let _unsubscribeProfile = null;
let _loading = false;

// ── Sincronização com o barramento de eventos (F6.5) ────────────────────────
// A Central assina SessionFinished/Cancelled/Updated diretamente no
// barramento (F6.2) — nunca conhece activitySessionService — e recarrega
// getInsightsData() sempre que uma sessão muda de estado. Os quatro blocos
// (execução, metas, revisões, produtividade) são todos derivados de sessões
// *finalizadas* (activityDashboardService.computeDashboardIndicators() e
// activitySessionStats usam apenas status "finished"; produtividade usa
// hasFinishedSession) — nenhum deles reflete uma sessão apenas iniciada.
// Por isso, diferente do Dashboard/Histórico (F6.3/F6.4), SessionStarted NÃO
// é assinado aqui: publicá-lo não mudaria nenhum indicador exibido. Pelo
// mesmo motivo, SessionPaused/SessionResumed também ficam de fora — nenhum
// bloco depende do estado de pausa de uma sessão em andamento.
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
  if (_unsubscribers.length > 0) return; // já assinado — initInsightsView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

// Renderiza um único bloco a partir do seu estado ("ok" | "partial" | "error").
// Uma falha aqui nunca deve impedir os outros três blocos de renderizar
// (ETAPA 7: "a tela nunca deve quebrar completamente caso apenas um bloco falhe").
// Usa sempre o mesmo componente único de estados (F4.1, ETAPA 6): nenhum
// bloco decide mensagem, ícone ou ação por conta própria.
function _renderBlock(blockDef, block) {
  const cardsEl  = document.getElementById(blockDef.cardsId);
  const errorEl  = document.getElementById(blockDef.errorId);
  const noticeEl = document.getElementById(blockDef.noticeId);

  // F4.2 (causa raiz — ETAPA 4): sessão expirada nunca pode ser mascarada
  // como "dados parciais". O bloco de Revisões combina duas fontes
  // independentes (pendentes/concluídas — ver insightsService._reviewsBlock())
  // e, se só uma delas falhar, o bloco antes caía direto no aviso passivo de
  // "partial" (sem botão de ação nenhum) mesmo quando a causa da falha era a
  // sessão ter caído — que compromete o bloco inteiro, não só a fonte que
  // falhou. Calculamos o estado do erro uma única vez aqui (chamando
  // handleError uma só vez, nunca duas, para não duplicar telemetria) e, se a
  // categoria for "sessão expirada", promovemos o bloco a "error" para usar o
  // mesmo componente único com "Entrar novamente" (F4.1) em vez do aviso mudo.
  let status = block.status;
  let errorState = null;
  if (block.error) {
    errorState = errorToState(handleError(block.error, { context: "insightsView.load", silent: true }));
    if (status === "partial" && errorState.state === STATES.SESSION_EXPIRED) {
      status = "error";
    }
  }

  if (status === "error") {
    cardsEl.hidden = true;
    cardsEl.innerHTML = "";
    if (noticeEl) noticeEl.hidden = true;
    errorEl.hidden = false;
    renderStateBlock(errorEl, { ...errorState, onRetry: () => _load() });
    return;
  }

  errorEl.hidden = true;
  errorEl.innerHTML = "";
  clearStateBlock(errorEl);
  cardsEl.hidden = false;
  cardsEl.innerHTML = blockDef.cardDefs.map(def => `
    <div class="dashboard-card">
      <span class="dashboard-card-title">${def.title}</span>
      <span class="dashboard-card-value">${def.value(block.data)}</span>
      <p class="dashboard-card-desc">${def.desc(block.data)}</p>
    </div>
  `).join("");

  if (noticeEl) {
    noticeEl.hidden = status !== "partial";
    if (status === "partial" && errorState) {
      noticeEl.textContent = `Alguns dados deste bloco não puderam ser carregados: ${errorState.message}`;
    }
  }
}

async function _load() {
  if (_loading) return;
  _loading = true;
  try {
    const data = await getInsightsData();
    for (const blockDef of BLOCK_DEFS) {
      _renderBlock(blockDef, data[blockDef.key]);
    }
  } catch (err) {
    // Última rede de segurança: insightsService.getInsightsData() nunca
    // deveria rejeitar (cada bloco captura seu próprio erro), mas se algo
    // inesperado escapar, nenhum bloco fica num estado indefinido.
    for (const blockDef of BLOCK_DEFS) {
      _renderBlock(blockDef, { status: "error", data: null, error: err });
    }
  } finally {
    _loading = false;
  }
}

/**
 * Monta a Central de Insights (uma única vez) e carrega os indicadores.
 * Assina o barramento de eventos da sessão (F6.5) e
 * onReviewStatusChanged()/onProfileUpdated() para recalcular automaticamente
 * sempre que uma sessão, revisão ou meta mudar — sem exigir reload da página
 * nem polling.
 */
export async function initInsightsView() {
  _subscribeToEventBus();
  if (!_unsubscribeReview)  _unsubscribeReview  = onReviewStatusChanged(() => _load());
  if (!_unsubscribeProfile) _unsubscribeProfile = onProfileUpdated(() => _load());
  await _load();
}

/**
 * Desfaz a assinatura do barramento de eventos e demais listeners, além de
 * qualquer recarga pendente. Chamada no logout/troca de usuário (ver
 * script.js/onBeforeSignOut) — sem isso, os listeners registrados em
 * _subscribeToEventBus() sobreviveriam à troca de sessão e recarregariam a
 * Central de Insights com o usuário errado.
 */
export function resetInsightsView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }
  if (_unsubscribeReview)  { _unsubscribeReview();  _unsubscribeReview  = null; }
  if (_unsubscribeProfile) { _unsubscribeProfile(); _unsubscribeProfile = null; }
}
