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

import { getInsightsData } from "./insightsService.js";
import { onSessionFinished } from "./activitySessionService.js";
import { onReviewStatusChanged } from "./reviewService.js";
import { onProfileUpdated } from "./profileService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock, STATES } from "./stateView.js";

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

let _unsubscribers = [];
let _loading = false;

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
 * Assina os mecanismos de notificação já existentes (ETAPA 5) para
 * recalcular automaticamente sempre que uma sessão terminar
 * (activitySessionService.onSessionFinished), uma revisão for concluída/pulada
 * (reviewService.onReviewStatusChanged) ou o perfil (metas) mudar
 * (profileService.onProfileUpdated) — sem exigir reload da página nem polling.
 */
export async function initInsightsView() {
  if (_unsubscribers.length === 0) {
    _unsubscribers = [
      onSessionFinished(() => _load()),
      onReviewStatusChanged(() => _load()),
      onProfileUpdated(() => _load()),
    ];
  }
  await _load();
}
