/**
 * decisionEngine.js — Orquestrador da IA: Decision Engine (F3.7).
 *
 * Auditoria (ETAPA 1): hoje três motores produzem, cada um com seu próprio
 * vocabulário, uma lista de "coisas para mostrar ao usuário" —
 * recommendationEngine.computeRecommendations() (situação atual),
 * planningService.computeWeeklyPlan() (sugestão acionável, com tempo/data) e
 * reflectionService.getReflectionData().insights (retrospecto). Três Views
 * (activityDashboardView "cards inteligentes", weekView "dica do dia" e o
 * botão "Recomendações" do painel de IA) hoje decidem, cada uma à sua
 * maneira, quais desses itens mostrar, em qual ordem e o que descartar —
 * inclusive produzindo duplicidade (ex.: o Recommendation Engine avisa
 * "Você possui 5 revisões pendentes" e o Planning Engine sugere um item de
 * revisão para a mesma pendência, ao mesmo tempo).
 *
 * Este módulo é o único ponto que decide o que mostrar, quando mostrar, qual
 * prioridade usar e o que esconder — nenhuma View volta a fazer essa escolha.
 * Função pura: nunca acessa o DOM, nunca chama Gemini, nunca consulta banco.
 * Recebe as listas já produzidas pelos três motores (cada um já executado
 * uma única vez por quem orquestra a chamada, ver services/ai/aiService.js)
 * e devolve uma lista consolidada, priorizada, deduplicada e ordenada.
 *
 * ETAPA 3 — Priorização: cada item chega de seu motor de origem já com um
 * campo de severidade próprio (recommendationEngine não tem um campo de
 * prioridade explícito, mas cada `type` tem uma gravidade fixa e documentada;
 * planningService já tem `prioridade` alta/média/baixa; reflectionService já
 * tem `tipo` positivo/atenção e `nivelConfianca`). Este módulo só traduz cada
 * um desses vocabulários para uma escala comum de 4 níveis — nunca inventa um
 * limiar numérico novo, sempre lê um campo que o motor de origem já calculou.
 *
 * ETAPA 4 — Deduplicação: itens de motores diferentes que descrevem o mesmo
 * assunto (ex.: "revisões pendentes" no Recommendation Engine e no Planning
 * Engine) são agrupados por `assunto` — só o mais útil sobrevive. "Mais útil"
 * é definido, nesta ordem: (1) maior prioridade; (2) em empate, o item mais
 * acionável primeiro — Planning Engine (já sugere tempo e data) antes do
 * Recommendation Engine (só descreve a situação) antes do Reflection Engine
 * (só retrospecto).
 *
 * ETAPA 8 — Erros: cada bloco de entrada (recommendations/planning/reflection)
 * é `null` quando o motor correspondente falhou, e um array (mesmo vazio)
 * quando funcionou. Um bloco `null` nunca derruba os demais: a lista final
 * simplesmente não tem itens daquele motor, e o motor é listado em
 * `unavailable` para quem quiser avisar o usuário, sem quebrar a interface.
 *
 * Ponto de entrada com I/O (getDecisions(), no fim do arquivo): mesmo padrão
 * já usado por reflectionService.getReflectionData() e userMemoryService.
 * getUserMemory() — o motor em si (consolidateDecisions() e os
 * classify*() acima) é 100% puro, mas o módulo também expõe uma função
 * assíncrona que roda os três motores (cada um uma única vez, ETAPA 7) e
 * consolida o resultado. Essa função nunca importa Gemini nem o cliente do
 * Supabase — reaproveita só os motores/serviços que já existem
 * (aiContextService, recommendationEngine, planningService,
 * reflectionService), do mesmo jeito que reflectionService/userMemoryService
 * já reaproveitam activitySessionService/reviewService/etc. sem acessar o
 * banco diretamente.
 */

import { getAIContext } from "./aiContextService.js";
import { computeRecommendations } from "./recommendationEngine.js";
import { computeWeeklyPlan } from "./planningService.js";
import { getReflectionData } from "./reflectionService.js";
import { handleError } from "./errorService.js";

// ── Prioridade (ETAPA 3) ─────────────────────────────────────────────────────
// Quatro níveis, do mais urgente ao mais informativo — nenhum "número mágico"
// aqui: a ordem entre eles é o único dado que importa (PRIORITY_RANK), usada
// só para ordenar e para decidir o vencedor de uma deduplicação.
export const PRIORITY = Object.freeze({
  URGENTE:     "urgente",
  IMPORTANTE:  "importante",
  RECOMENDADO: "recomendado",
  INFORMATIVO: "informativo",
});

const PRIORITY_RANK = {
  [PRIORITY.URGENTE]:     0,
  [PRIORITY.IMPORTANTE]:  1,
  [PRIORITY.RECOMENDADO]: 2,
  [PRIORITY.INFORMATIVO]: 3,
};

// Preferência de origem em caso de empate de prioridade na deduplicação
// (ETAPA 4): quanto menor, mais acionável — um item do Planning Engine já
// diz quanto tempo e em que data agir; o Recommendation Engine só descreve a
// situação; o Reflection Engine é só retrospecto.
const ORIGIN_PREFERENCE = { planning: 0, recommendation: 1, reflection: 2 };

// ── Recommendation Engine → decisão ─────────────────────────────────────────
// Assunto: agrupa cada `type` do Recommendation Engine com o item equivalente
// do Planning Engine (ver _planSubject) sempre que os dois puderem descrever
// a mesma pendência. "understudied_categories" usa a categoria mais
// negligenciada da própria evidência (a que o texto da recomendação já cita
// primeiro) para poder colidir com o item de plano dessa categoria.
function _recommendationSubject(rec) {
  switch (rec.type) {
    case "overdue_events":          return "compromissos_atrasados";
    case "pending_reviews":         return "revisoes_pendentes";
    case "goals_nearly_met":        return "meta_semanal";
    case "understudied_categories": return `categoria_negligenciada:${rec.evidence.categories[0].name}`;
    case "heavy_week":
    case "empty_week":              return "carga_semana";
    case "long_gap_no_sessions":
    case "low_recent_execution":    return "execucao_recente";
    case "preferred_schedule":      return "preferencia_horario";
    default:                        return `recomendacao:${rec.type}`;
  }
}

// Severidade fixa por `type` — documentada aqui, nunca um limiar novo:
//  - já vencido (compromisso) ou abandono prolongado (sem sessão há muito
//    tempo) é sempre URGENTE;
//  - revisões pendentes usam a própria evidência (`overdueCount`) que o
//    Recommendation Engine já calcula para diferenciar "só pendente" de
//    "já atrasada", em vez de um novo cálculo;
//  - semana muito carregada e pouca execução recente pedem atenção, mas
//    ainda não são um atraso — IMPORTANTE;
//  - metas quase batidas e categorias negligenciadas são oportunidade, não
//    cobrança — RECOMENDADO;
//  - semana vazia e horário preferido são só contexto, sem cobrança alguma —
//    INFORMATIVO.
function _recommendationPriority(rec) {
  switch (rec.type) {
    case "overdue_events":
    case "long_gap_no_sessions":
      return PRIORITY.URGENTE;
    case "pending_reviews":
      return rec.evidence.overdueCount > 0 ? PRIORITY.URGENTE : PRIORITY.IMPORTANTE;
    case "heavy_week":
    case "low_recent_execution":
      return PRIORITY.IMPORTANTE;
    case "goals_nearly_met":
    case "understudied_categories":
      return PRIORITY.RECOMENDADO;
    case "empty_week":
    case "preferred_schedule":
      return PRIORITY.INFORMATIVO;
    default:
      return PRIORITY.RECOMENDADO;
  }
}

/** Traduz uma recomendação (recommendationEngine.computeRecommendations()) numa decisão normalizada. */
export function classifyRecommendation(rec) {
  return {
    origem:      "recommendation",
    origemTipo:  rec.type,
    assunto:     _recommendationSubject(rec),
    prioridade:  _recommendationPriority(rec),
    mensagem:    rec.message,
    confianca:   "alta", // todo o Recommendation Engine só aciona sobre evidência real (ver seu próprio cabeçalho)
    dadosUtilizados: rec.evidence,
    acaoSugerida: null, // recomendação descreve a situação; não sugere tempo/data
  };
}

// ── Planning Engine → decisão ────────────────────────────────────────────────
// Assunto: "study" cobre tanto categoria negligenciada (quando tem
// `categoria`) quanto o preenchimento de semana vazia (quando não tem) — os
// dois já são regras distintas em planningService (findUnderstudiedPlanItems
// vs. findEmptyWeekPlanItem), só o `tipo` "study" é compartilhado.
function _planSubject(item) {
  switch (item.tipo) {
    case "overdue": return "compromissos_atrasados";
    case "review":  return "revisoes_pendentes";
    case "goal":    return "meta_semanal";
    case "study":   return item.categoria ? `categoria_negligenciada:${item.categoria}` : "carga_semana";
    default:        return `plano:${item.tipo}`;
  }
}

// planningService já calcula `prioridade` (alta/média/baixa) por regra
// própria (ver GOAL_LOW_PCT_THRESHOLD/UNDERSTUDIED_DAYS em planningService.js)
// — este módulo só traduz essa escala de 3 níveis para a escala comum de 4,
// nunca recalcula a prioridade em si.
const PLAN_PRIORITY_TO_LEVEL = {
  alta:    PRIORITY.URGENTE,
  "média": PRIORITY.IMPORTANTE,
  baixa:   PRIORITY.RECOMENDADO,
};

/** Traduz um item de plano (planningService.computeWeeklyPlan()) numa decisão normalizada. */
export function classifyPlanItem(item) {
  return {
    origem:      "planning",
    origemTipo:  item.tipo,
    assunto:     _planSubject(item),
    prioridade:  PLAN_PRIORITY_TO_LEVEL[item.prioridade] || PRIORITY.RECOMENDADO,
    mensagem:    item.motivo,
    confianca:   item.confianca,
    dadosUtilizados: { categoria: item.categoria, tempoSugerido: item.tempoSugerido },
    acaoSugerida: { tempoSugerido: item.tempoSugerido, dataSugerida: item.dataSugerida },
  };
}

// ── Reflection Engine → decisão ──────────────────────────────────────────────
// Assunto: liga cada insight retrospectivo ao mesmo tema de recomendação/
// planejamento quando eles descrevem a mesma coisa sob outro ângulo (ex.:
// "productivity_drop" e "session_completion_rate" são, os dois, sobre
// execução recente — mesmo assunto que long_gap_no_sessions/
// low_recent_execution do Recommendation Engine). Insights sem equivalente
// direto (ex.: qual categoria você mais estudou) ficam com um assunto só
// deles, então nunca são descartados por deduplicação.
function _reflectionSubject(insight) {
  switch (insight.id) {
    case "plan_completion":          return "meta_semanal";
    case "goal_days_met":            return "meta_diaria_historico";
    case "session_completion_rate":
    case "productivity_drop":
    case "productivity_up":          return "execucao_recente";
    case "neglected_category":       return `categoria_negligenciada:${insight.dadosUtilizados.category}`;
    case "reviews_drop":             return "revisoes_tendencia";
    case "top_category":             return "categoria_destaque";
    default:                         return `reflexao:${insight.id}`;
  }
}

// reflectionService já classifica cada insight como "positivo" ou "atenção"
// (`tipo`) com um `nivelConfianca` próprio — este módulo só lê os dois campos:
//  - "positivo" é sempre uma boa notícia, não pede ação — INFORMATIVO;
//  - "atenção" com confiança alta pede atenção mais próxima — IMPORTANTE;
//  - "atenção" com confiança média ainda é só uma oportunidade — RECOMENDADO.
function _reflectionPriority(insight) {
  if (insight.tipo === "positivo") return PRIORITY.INFORMATIVO;
  return insight.nivelConfianca === "alta" ? PRIORITY.IMPORTANTE : PRIORITY.RECOMENDADO;
}

/** Traduz um insight de reflexão (reflectionService.getReflectionData().insights) numa decisão normalizada. */
export function classifyReflectionInsight(insight) {
  return {
    origem:      "reflection",
    origemTipo:  insight.id,
    assunto:     _reflectionSubject(insight),
    prioridade:  _reflectionPriority(insight),
    mensagem:    insight.mensagem,
    confianca:   insight.nivelConfianca,
    dadosUtilizados: insight.dadosUtilizados,
    acaoSugerida: null, // reflexão é retrospecto; nunca sugere tempo/data
  };
}

// ── Deduplicação (ETAPA 4) ───────────────────────────────────────────────────

function _isBetter(a, b) {
  if (PRIORITY_RANK[a.prioridade] !== PRIORITY_RANK[b.prioridade]) {
    return PRIORITY_RANK[a.prioridade] < PRIORITY_RANK[b.prioridade];
  }
  return ORIGIN_PREFERENCE[a.origem] < ORIGIN_PREFERENCE[b.origem];
}

/**
 * Mantém, por `assunto`, apenas a decisão mais útil (ETAPA 4) — nunca duas
 * decisões sobre o mesmo assunto ao mesmo tempo. A ordem relativa de entrada
 * é preservada entre assuntos diferentes (Map mantém ordem de inserção da
 * primeira ocorrência), o que dá estabilidade determinística (ETAPA 9).
 */
function _deduplicate(decisions) {
  const bestBySubject = new Map();
  for (const decision of decisions) {
    const current = bestBySubject.get(decision.assunto);
    if (!current || _isBetter(decision, current)) {
      bestBySubject.set(decision.assunto, decision);
    }
  }
  return [...bestBySubject.values()];
}

// ── Ponto de entrada único ───────────────────────────────────────────────────

/**
 * Consolida os resultados já produzidos pelos três motores (ETAPA 5/7 — cada
 * motor roda uma única vez, em quem orquestra a chamada; este módulo só
 * organiza). Cada bloco de entrada é um array (mesmo vazio, quando o motor
 * funcionou e não tinha nada a reportar) ou `null`/`undefined` (quando o
 * motor falhou — ETAPA 8: os demais blocos continuam normalmente).
 *
 * Devolve a lista consolidada — já priorizada, deduplicada e ordenada da
 * maior para a menor prioridade (Array.prototype.sort é estável, ES2019+:
 * decisões de mesma prioridade mantêm a ordem em que os motores foram
 * combinados: recomendações, depois plano, depois reflexão) — e a lista de
 * motores indisponíveis nesta rodada.
 *
 * Nunca lança: uma entrada ausente ou vazia simplesmente não contribui itens.
 */
export function consolidateDecisions({ recommendations, planning, reflection } = {}) {
  const unavailable = [];
  const raw = [];

  if (Array.isArray(recommendations)) raw.push(...recommendations.map(classifyRecommendation));
  else unavailable.push("recommendations");

  if (Array.isArray(planning)) raw.push(...planning.map(classifyPlanItem));
  else unavailable.push("planning");

  if (Array.isArray(reflection)) raw.push(...reflection.map(classifyReflectionInsight));
  else unavailable.push("reflection");

  const decisions = _deduplicate(raw)
    .sort((a, b) => PRIORITY_RANK[a.prioridade] - PRIORITY_RANK[b.prioridade]);

  return { decisions, unavailable };
}

// ── Ponto de entrada com I/O — roda os três motores e consolida (ETAPA 7) ───

/**
 * Roda Recommendation, Planning e Reflection Engine — cada um uma única vez
 * (ETAPA 7) — e devolve o resultado já consolidado por consolidateDecisions().
 * Este é o único lugar do app que busca dado para os três motores ao mesmo
 * tempo; nenhuma View volta a chamá-los diretamente (ver
 * activityDashboardView.js, weekView.js, services/ai/aiService.js).
 *
 * ETAPA 8 (erros): Context Engine e Reflection Engine já nunca rejeitam (cada
 * um tem seu próprio fallback vazio — ver aiContextService.js/
 * reflectionService.js), mas esta função ainda protege cada rodada
 * individualmente por segurança: uma falha inesperada num motor não impede
 * os demais de aparecer, e o motor afetado só some da lista `unavailable`.
 *
 * Também devolve `planning` (a lista bruta do Planning Engine, com
 * tempo/data/prioridade originais) para quem precisa do plano completo (ex.:
 * o botão "Ver plano da semana" da Agenda) sem rodar o motor de novo.
 *
 * @returns {Promise<{decisions: Array<object>, planning: Array<object>, unavailable: Array<string>}>}
 */
export async function getDecisions(now) {
  let context = null;
  try {
    context = await getAIContext(now);
  } catch (err) {
    handleError(err, { context: "decisionEngine.getDecisions.context", silent: true });
  }

  const recommendations = context ? computeRecommendations(context) : null;
  const planning        = context ? computeWeeklyPlan(context, now) : null;

  let reflection = null;
  try {
    const report = await getReflectionData(now);
    reflection = report.insights ?? [];
  } catch (err) {
    handleError(err, { context: "decisionEngine.getDecisions.reflection", silent: true });
  }

  const { decisions, unavailable } = consolidateDecisions({ recommendations, planning, reflection });
  return { decisions, planning: planning || [], unavailable };
}
