/**
 * userMemoryService.js — Memória do Usuário (F3.6).
 *
 * Consolida preferências *observadas* — nunca inferidas por IA, nunca
 * aprendidas por Machine Learning. Cada preferência é uma agregação
 * estatística simples (moda, média, contagem) sobre dados que já existem em
 * serviços existentes. Função de leitura pura: sem DOM, sem chamada a
 * Gemini, sem acesso direto ao Supabase. Toda busca passa por serviços já
 * existentes (activitySessionService, reviewService, categoryService,
 * eventService, profileService) e por um bloco puro já exposto por outro
 * módulo (activitySessionStats.calculateAverageDuration/calculateTotalDuration)
 * — nenhum indicador já calculado em outro lugar é recalculado aqui (ETAPA 1
 * da auditoria). Dois cálculos (total por categoria e dias que bateram a
 * meta) espelham, localmente, a mesma regra já usada por
 * aiContextService.computeCategoryBreakdown()/reflectionService.
 * computeGoalDaysIndicators() — ver "Independência de grafo" abaixo para o
 * motivo de não importar essas funções diretamente.
 *
 * Reaproveitamento por auditoria:
 *  - activitySessionService.listByDateRange()       → sessões da janela de memória
 *  - reviewService.listCompleted()                  → revisões concluídas
 *  - categoryService.getCategories() + eventService.getEvents() → catálogo
 *  - activitySessionStats.calculateAverageDuration()/calculateTotalDuration() → agregação de minutos
 *  - profileService.getProfile()                    → meta diária configurada
 *
 * Privacidade (ETAPA 3): nenhuma preferência aqui carrega texto livre do
 * usuário (notas de sessão, títulos, descrições) nem tenta caracterizar
 * estado de humor/personalidade — apenas contagens, médias e moda sobre
 * horário/dia/categoria/frequência/intervalo, sempre com a evidência que a
 * sustenta (ETAPA 6).
 *
 * Performance (ETAPA 7): getUserMemory() busca tudo numa única rodada
 * paralela; toda a análise roda em memória sobre esses dados já carregados.
 * O Context Engine (aiContextService.js, ETAPA 4) NUNCA chama getUserMemory()
 * — chamaria de novo os mesmos serviços que ele próprio já buscou. Em vez
 * disso, ele importa a função pura buildUserMemory() e reaproveita os dados
 * que já tem em mãos (sessions/events/categories/categoryBreakdown/
 * completedReviews) — zero consulta nova, mesmo dentro do Context Engine.
 *
 * Independência de grafo: este módulo nunca importa aiContextService.js nem
 * reflectionService.js. O Context Engine importa deste módulo (ETAPA 4), e
 * este módulo importaria de volta se reaproveitasse
 * computeCategoryBreakdown()/computeGoalDaysIndicators() diretamente — uma
 * dependência circular entre módulos. Por isso os dois pontos que
 * naturalmente se apoiariam nesses helpers (o total por categoria do modo
 * standalone e a contagem de dias que bateram a meta) têm uma versão local
 * mínima aqui — mesma regra já auditada em aiContextService/reflectionService,
 * apenas reaplicada para manter o grafo de módulos acíclico (Memory Engine e
 * Reflection Engine são módulos irmãos, nenhum depende do outro).
 */

import { listByDateRange } from "./activitySessionService.js";
import { listCompleted } from "./reviewService.js";
import { getCategories } from "./categoryService.js";
import { getEvents } from "./eventService.js";
import { getProfile } from "./profileService.js";
import { calculateAverageDuration, calculateTotalDuration } from "./activitySessionStats.js";
import { handleError } from "./errorService.js";

// Janela ampla o bastante para capturar um padrão de comportamento estável
// (não só "esta semana", como o Reflection Engine) — 90 dias cobre um
// semestre letivo parcial sem carregar o histórico inteiro do usuário.
const MEMORY_WINDOW_DAYS = 90;

// Uma preferência só é reportada com evidência real: pelo menos este número
// de sessões concluídas para horário/dia/frequência/tempo médio, e pelo
// menos este número de revisões concluídas para o intervalo entre revisões.
const MIN_SESSIONS_FOR_PATTERN = 3;
const MIN_SESSIONS_FOR_CATEGORY_AVERAGE = 3;
const MIN_REVIEWS_FOR_INTERVAL = 2;

// Piso de amostra para "alta confiança" num padrão de horário/dia/frequência
// (nunca inventado — sempre o dado observado, só a confiança varia).
const HIGH_CONFIDENCE_SESSIONS = 10;
// Piso de maioria para considerar um horário/dia "preferido" com confiança
// alta (o bucket vencedor precisa concentrar pelo menos esta fração das
// sessões); abaixo disso, o padrão ainda é reportado, mas com confiança média.
const STRONG_MAJORITY_PCT = 50;

const TOP_CATEGORIES_LIMIT = 3;
const GOAL_WINDOW_DAYS = 30;

const HOUR_BUCKETS = [
  { name: "madrugada", from: 0,  to: 5  },
  { name: "manhã",     from: 6,  to: 11 },
  { name: "tarde",     from: 12, to: 17 },
  { name: "noite",     from: 18, to: 23 },
];
const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function _hourBucketName(hour) {
  return HOUR_BUCKETS.find(b => hour >= b.from && hour <= b.to)?.name ?? "madrugada";
}

function _startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function _daysAgo(now, days) {
  const d = _startOfDay(now);
  d.setDate(d.getDate() - days);
  return d;
}

function _finished(sessions) {
  return (sessions || []).filter(s => s.status === "finished");
}

// Mesma resolução de categoria de sessão usada por
// aiContextService.computeCategoryBreakdown() (sessão vinculada a um
// compromisso herda a categoria do compromisso; sessão avulsa usa
// category_id) — reimplementada aqui só para agrupar sessões por categoria
// (computeCategoryBreakdown não expõe a lista de sessões por categoria,
// apenas os totais), nunca para recalcular tempo/última sessão, que
// continuam vindo exclusivamente de computeCategoryBreakdown().
function _resolveSessionCategoryName(session, eventsById, categoriesById) {
  if (session.event_id) return eventsById.get(session.event_id)?.category ?? null;
  if (session.category_id) return categoriesById.get(session.category_id)?.name ?? null;
  return null;
}

async function _safe(promise, fallback, context, errors) {
  try {
    return await promise;
  } catch (err) {
    handleError(err, { context, silent: true });
    errors.push(context);
    return fallback;
  }
}

// ── Blocos puros (testáveis isoladamente, sem I/O) ──────────────────────────

/** Período do dia (madrugada/manhã/tarde/noite) em que o usuário mais conclui sessões. */
export function computePreferredTimeOfDay(sessions) {
  const finished = _finished(sessions);
  if (finished.length < MIN_SESSIONS_FOR_PATTERN) return null;

  const counts = { madrugada: 0, "manhã": 0, tarde: 0, noite: 0 };
  for (const s of finished) counts[_hourBucketName(new Date(s.started_at).getHours())] += 1;

  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const pct = Math.round((bestCount / finished.length) * 100);

  return {
    valor: best,
    baseadoEm: `${finished.length} sessões concluídas`,
    motivo: `${bestCount} de ${finished.length} sessões concluídas aconteceram no período da ${best}.`,
    confianca: pct >= STRONG_MAJORITY_PCT ? "alta" : "média",
  };
}

/** Dia da semana em que o usuário mais conclui sessões. */
export function computePreferredDayOfWeek(sessions) {
  const finished = _finished(sessions);
  if (finished.length < MIN_SESSIONS_FOR_PATTERN) return null;

  const counts = new Array(7).fill(0);
  for (const s of finished) counts[new Date(s.started_at).getDay()] += 1;

  const bestIndex = counts.reduce((best, count, i) => (count > counts[best] ? i : best), 0);
  const bestCount = counts[bestIndex];
  const pct = Math.round((bestCount / finished.length) * 100);

  return {
    valor: WEEKDAY_NAMES[bestIndex],
    baseadoEm: `${finished.length} sessões concluídas`,
    motivo: `${bestCount} de ${finished.length} sessões concluídas aconteceram às ${WEEKDAY_NAMES[bestIndex]}s.`,
    confianca: pct >= STRONG_MAJORITY_PCT ? "alta" : "média",
  };
}

/** Categorias mais estudadas, a partir do breakdown já existente (aiContextService). */
export function computeTopCategories(categoryBreakdown) {
  const studied = (categoryBreakdown || []).filter(c => c.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  if (!studied.length) return null;

  const top = studied.slice(0, TOP_CATEGORIES_LIMIT).map(c => ({ nome: c.name, minutos: c.minutes }));
  return {
    valor: top,
    baseadoEm: `${studied.length} ${studied.length === 1 ? "categoria com sessões registradas" : "categorias com sessões registradas"}`,
    motivo: `${studied[0].name} concentra o maior tempo estudado (${studied[0].minutes} minutos).`,
    confianca: "alta",
  };
}

/**
 * Tempo médio de sessão — geral e por categoria (ex.: "Nesta categoria suas
 * sessões duram em média 42 minutos"). Reaproveita
 * activitySessionStats.calculateAverageDuration() para o cálculo em si;
 * só agrupa por categoria antes de chamá-la.
 */
export function computeAverageSessionDuration(sessions, events, categories) {
  const finished = _finished(sessions);
  if (finished.length < MIN_SESSIONS_FOR_PATTERN) return null;

  const eventsById     = new Map((events || []).map(e => [e.id, e]));
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));

  const byCategory = new Map();
  for (const s of finished) {
    const name = _resolveSessionCategoryName(s, eventsById, categoriesById);
    if (!name) continue;
    const list = byCategory.get(name) || [];
    list.push(s);
    byCategory.set(name, list);
  }

  const porCategoria = [...byCategory.entries()]
    .filter(([, list]) => list.length >= MIN_SESSIONS_FOR_CATEGORY_AVERAGE)
    .map(([nome, list]) => {
      const minutos = calculateAverageDuration(list);
      return {
        categoria: nome,
        valor: minutos,
        baseadoEm: `${list.length} sessões`,
        motivo: `Nesta categoria suas sessões duram em média ${minutos} minutos.`,
        confianca: list.length >= HIGH_CONFIDENCE_SESSIONS ? "alta" : "média",
      };
    })
    .sort((a, b) => b.valor - a.valor); // maior duração média primeiro — determinístico para a mesma entrada

  const geralMinutos = calculateAverageDuration(finished);
  return {
    geral: {
      valor: geralMinutos,
      baseadoEm: `${finished.length} sessões`,
      motivo: `Suas sessões concluídas duram em média ${geralMinutos} minutos.`,
      confianca: finished.length >= HIGH_CONFIDENCE_SESSIONS ? "alta" : "média",
    },
    porCategoria,
  };
}

/** Frequência semanal média de sessões concluídas, na janela observada. */
export function computeWeeklyFrequency(sessions, windowDays, now = new Date()) {
  const finished = _finished(sessions);
  if (finished.length < MIN_SESSIONS_FOR_PATTERN) return null;

  const weeks = Math.max(1, windowDays / 7);
  const perWeek = Math.round((finished.length / weeks) * 10) / 10;

  return {
    valor: perWeek,
    baseadoEm: `${finished.length} sessões nos últimos ${windowDays} dias`,
    motivo: `Em média você realiza ${perWeek} sessões por semana.`,
    confianca: finished.length >= HIGH_CONFIDENCE_SESSIONS ? "alta" : "média",
  };
}

/** Intervalo médio (em dias) entre revisões concluídas consecutivas. */
export function computeAverageReviewInterval(completedReviews) {
  const sorted = (completedReviews || [])
    .filter(r => r.completed_at)
    .map(r => new Date(r.completed_at))
    .sort((a, b) => a - b);
  if (sorted.length < MIN_REVIEWS_FOR_INTERVAL) return null;

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(Math.round((sorted[i] - sorted[i - 1]) / 86400000));
  }
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

  return {
    valor: avg,
    unidade: "dias",
    baseadoEm: `${sorted.length} revisões concluídas`,
    motivo: `Em média você faz uma revisão a cada ${avg} dias.`,
    confianca: sorted.length >= 5 ? "alta" : "média",
  };
}

/**
 * Padrão histórico de metas atingidas — mesma regra de "dia bateu a meta"
 * já usada pelo Reflection Engine (reflectionService.computeGoalDaysIndicators),
 * reaplicada aqui numa janela mais longa (GOAL_WINDOW_DAYS) para refletir um
 * padrão, não uma semana isolada. Ver nota de independência de grafo no
 * cabeçalho do módulo — Memory Engine e Reflection Engine não se importam
 * um ao outro, então este pequeno loop dia-a-dia é replicado, não reaproveitado.
 */
export function computeGoalAchievementPattern(sessions, dailyGoalMinutes, windowDays, now = new Date()) {
  if (!dailyGoalMinutes) return null;

  let daysMet = 0;
  for (let i = 0; i < windowDays; i++) {
    const dayStart = _daysAgo(now, i);
    const dayEnd = _endOfDay(dayStart);
    const dayMinutes = calculateTotalDuration((sessions || []).filter(s => {
      const started = new Date(s.started_at);
      return started >= dayStart && started <= dayEnd;
    }));
    if (dayMinutes >= dailyGoalMinutes) daysMet += 1;
  }

  const pct = Math.round((daysMet / windowDays) * 100);
  return {
    valor: pct,
    baseadoEm: `${windowDays} dias analisados`,
    motivo: `Você atingiu sua meta diária em ${daysMet} dos últimos ${windowDays} dias.`,
    confianca: "alta",
  };
}

// Total por categoria (nome + minutos), usado só pelo modo standalone de
// getUserMemory() para alimentar computeTopCategories() — mesma resolução de
// categoria de _resolveSessionCategoryName() acima, sem depender de
// aiContextService.computeCategoryBreakdown() (ver nota de independência de
// grafo). Quando o Context Engine já tem seu próprio categoryBreakdown
// (com lastStudiedDate/daysSinceLastStudy), ele passa esse — computeTopCategories()
// só lê `.name`/`.minutes` de qualquer um dos dois formatos.
function _localCategoryTotals(sessions, events, categories) {
  const eventsById     = new Map((events || []).map(e => [e.id, e]));
  const categoriesById = new Map((categories || []).map(c => [c.id, c]));

  const minutesByName = new Map();
  for (const s of _finished(sessions)) {
    const name = _resolveSessionCategoryName(s, eventsById, categoriesById);
    if (!name) continue;
    minutesByName.set(name, (minutesByName.get(name) ?? 0) + (s.duration_minutes || 0));
  }

  return (categories || []).map(c => ({ name: c.name, minutes: minutesByName.get(c.name) ?? 0 }));
}

/** Preferências vazias — usuário novo ou sem histórico suficiente ainda. */
export function emptyUserMemoryPreferences() {
  return {
    horarioPreferido: null,
    diaPreferido: null,
    categoriasMaisEstudadas: null,
    tempoMedioSessao: null,
    frequenciaSemanal: null,
    tempoEntreRevisoes: null,
    metasAtingidas: null,
  };
}

/**
 * Monta o objeto de preferências a partir de dados já carregados (sem
 * nenhum I/O) — reaproveitado tanto por getUserMemory() (busca própria)
 * quanto por aiContextService.getAIContext() (dados que ele já buscou,
 * ETAPA 4/7: zero consulta duplicada).
 */
export function buildUserMemory({ sessions, events, categories, categoryBreakdown, completedReviews, dailyGoalMinutes, windowDays }, now = new Date()) {
  return {
    horarioPreferido:        computePreferredTimeOfDay(sessions),
    diaPreferido:            computePreferredDayOfWeek(sessions),
    categoriasMaisEstudadas: computeTopCategories(categoryBreakdown),
    tempoMedioSessao:        computeAverageSessionDuration(sessions, events, categories),
    frequenciaSemanal:       computeWeeklyFrequency(sessions, windowDays, now),
    tempoEntreRevisoes:      computeAverageReviewInterval(completedReviews),
    metasAtingidas:          computeGoalAchievementPattern(sessions, dailyGoalMinutes, GOAL_WINDOW_DAYS, now),
  };
}

// ── Ponto de entrada único ───────────────────────────────────────────────────

/**
 * Busca (uma única rodada paralela) e consolida as preferências observadas
 * do usuário. Ponto de entrada standalone — usado para inspeção/diagnóstico
 * e pelos próprios testes; o Context Engine (ETAPA 4) NÃO o chama, para não
 * duplicar as consultas que ele mesmo já faz — ver buildUserMemory() acima.
 * Nunca lança: cada fonte tem seu próprio fallback vazio, e a ausência total
 * de histórico produz "insufficient_data" em vez de uma preferência inventada.
 */
export async function getUserMemory(now = new Date()) {
  const rangeStart = _daysAgo(now, MEMORY_WINDOW_DAYS - 1);
  const rangeEnd   = _endOfDay(now);

  const errors = [];
  const [sessions, categories, events, completedReviews, profile] = await Promise.all([
    _safe(listByDateRange(rangeStart.toISOString(), rangeEnd.toISOString()), [], "userMemoryService.sessions", errors),
    _safe(getCategories(), [], "userMemoryService.categories", errors),
    _safe(getEvents(), [], "userMemoryService.events", errors),
    _safe(listCompleted(), [], "userMemoryService.reviewsCompleted", errors),
    _safe(getProfile(), null, "userMemoryService.profile", errors),
  ]);

  const generatedAt = now.toISOString();
  const hasHistory = sessions.length > 0 || completedReviews.length > 0;
  if (!hasHistory) {
    return { status: "insufficient_data", preferences: emptyUserMemoryPreferences(), generatedAt };
  }

  const categoryBreakdown = _localCategoryTotals(sessions, events, categories);
  const preferences = buildUserMemory({
    sessions, events, categories, categoryBreakdown, completedReviews,
    dailyGoalMinutes: profile?.daily_goal_minutes ?? null,
    windowDays: MEMORY_WINDOW_DAYS,
  }, now);

  return { status: errors.length ? "partial" : "ok", preferences, generatedAt };
}
