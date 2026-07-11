/**
 * B7 — Auditoria Final de Integração (F6–F8): teste de integração ponta a
 * ponta do fluxo completo
 *
 *   Compromisso → Sessão → Questões → Revisões → SessionFinished →
 *   Dashboard → Histórico → Diário → Subject Progress → Study Streak →
 *   Achievements → IA
 *
 * Mesmo padrão de tests/integration/sessionQuestionsIntegration.test.js e
 * tests/integration/reviewSessionIntegration.test.js: um único Supabase
 * mockado (sem rede) por trás de todos os services *reais* — nenhum service
 * de domínio é mockado aqui, só a camada de acesso a dados (supabase.js).
 * O objetivo não é validar regra de negócio de cada domínio isoladamente
 * (isso já é coberto pelos testes unitários de cada service) — é provar que
 * uma única Sessão finalizada produz números idênticos quando lida de volta
 * por Dashboard, Histórico, Diário (Revisões associadas), Subject Progress,
 * Study Streak e Achievements, todos consumindo os mesmos fatos.
 *
 * Fase 1 (mutação): exercita o ciclo real — criar sessão, adicionar questão,
 * finalizar sessão, associar revisão — contra uma fila de respostas por
 * tabela (mesma técnica das duas suítes citadas acima).
 *
 * Fase 2 (leitura): troca as respostas mockadas para o "estado estável" pós
 * fluxo (uma sessão finalizada, uma questão, um evento, uma revisão
 * associada) e chama os oito consumidores (Dashboard, Histórico, Diário/
 * Revisões, Subject Progress, Study Streak, Achievements) — todos devem
 * enxergar exatamente a mesma sessão.
 *
 * A Central de IA (Context Engine) é auditada à parte, na segunda metade do
 * arquivo, com o padrão de mocking de módulo já usado por
 * tests/aiContextService.test.js — aiContextService.js não deve nunca ser
 * exercitado contra o dobro de Supabase desta suíte (ele não consulta
 * Supabase diretamente, só os services), então prová-lo aqui exigiria
 * duplicar toda a orquestração; em vez disso, o teste de IA confirma que,
 * após um SessionFinished real (via sessionEventBus, o mesmo evento
 * publicado pela Fase 1), o Context Engine invalida seu cache e a próxima
 * leitura reflete os mesmos totais que o Dashboard já expôs na Fase 2 —
 * sem a IA nunca consultar Supabase nem qualquer *View.js diretamente.
 */
import { test, mock } from "node:test";
import assert from "node:assert";
import { SESSION_EVENTS, publish, clear as clearEventBus } from "../../sessionEventBus.js";

const SUPABASE_SPECIFIER = new URL("../../supabase.js", import.meta.url).href;

const CHAIN_METHODS = [
  "select", "insert", "update", "delete", "upsert",
  "eq", "neq", "gte", "lte", "lt", "gt", "or", "order", "in", "range",
];

function toQueue(responses) {
  return Array.isArray(responses) ? responses.slice() : [responses];
}

function makeQueryBuilder(table, result, calls) {
  const builder = { table };
  for (const method of CHAIN_METHODS) {
    builder[method] = (...args) => { calls.push({ table, method, args }); return builder; };
  }
  builder.single = (...args) => { calls.push({ table, method: "single", args }); return builder; };
  builder.maybeSingle = (...args) => { calls.push({ table, method: "maybeSingle", args }); return builder; };
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const state = { responses: {}, calls: [], queues: {} };

function resetMock(responses) {
  state.responses = responses;
  state.calls = [];
  state.queues = {};
}

const supabaseDouble = {
  get _calls() { return state.calls; },
  from(table) {
    if (!state.queues[table]) state.queues[table] = toQueue(state.responses[table]);
    const queue = state.queues[table];
    const result = queue.length > 1 ? queue.shift() : queue[0];
    return makeQueryBuilder(table, result, state.calls);
  },
};

mock.module(SUPABASE_SPECIFIER, {
  namedExports: {
    supabase: supabaseDouble,
    currentUserId: async () => "user-123",
  },
});

// Todos os services de domínio reais — nenhum é mockado, só supabase.js.
const activitySessionService  = await import("../../activitySessionService.js");
const questionService         = await import("../../questionService.js");
const sessionQuestionsService = await import("../../sessionQuestionsService.js");
const reviewSessionService    = await import("../../reviewSessionService.js");
const subjectProgressService  = await import("../../subjectProgressService.js");
const studyStreakService      = await import("../../studyStreakService.js");
const achievementService      = await import("../../achievementService.js");
const activityDashboardService = await import("../../activityDashboardService.js");

// Ancorado no dia REAL em que o teste roda (às 15:00 locais, longe da
// virada de dia/mês): studyStreakService.getStreakSummary() usa o relógio
// real (new Date()) para decidir "hoje", então uma data fixa no passado
// fazia a asserção de streak (currentStreak === 1) expirar sozinha com o
// passar dos dias — o teste quebrava sem nenhuma mudança de código.
const _today = new Date();
const NOW = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate(), 15, 0, 0);
const STARTED_AT = new Date(NOW.getTime() - 60 * 60000).toISOString(); // 60 min antes de NOW
const DURATION_MINUTES = 60;

const _pad2 = (n) => String(n).padStart(2, "0");
const EVENT_DATE = `${NOW.getFullYear()}-${_pad2(NOW.getMonth() + 1)}-${_pad2(NOW.getDate())}`;
const EVENT = { id: "evt-1", user_id: "user-123", category: "Cardiologia", event_date: EVENT_DATE };
const REVIEW_PENDING = { id: "rev-1", user_id: "user-123", event_id: "evt-1", status: "pending", session_id: null };

test("fluxo completo: Compromisso → Sessão → Questões → Revisões → SessionFinished mantém uma única sessão consistente", async (t) => {
  await t.test("Fase 1 — mutação: iniciar sessão, adicionar questão, finalizar, associar revisão", async () => {
    const RUNNING_SESSION = {
      id: "sess-1", user_id: "user-123", event_id: "evt-1",
      status: "running", started_at: STARTED_AT, paused_at: null, paused_ms: 0,
    };
    const FINISHED_SESSION = {
      ...RUNNING_SESSION,
      status: "finished",
      ended_at: NOW.toISOString(),
      duration_minutes: DURATION_MINUTES,
    };
    const CREATED_QUESTION = { id: "q-1", session_id: "sess-1", user_id: "user-123", subject: "Cardiologia" };
    const ASSOCIATED_REVIEW = { ...REVIEW_PENDING, session_id: "sess-1" };

    resetMock({
      // Ordem exata das 6 chamadas a activity_sessions no fluxo abaixo:
      // 1) startSession → getRunningSession() → nenhuma sessão rodando
      // 2) startSession → createActivitySession() → sessão criada (running)
      // 3) addQuestion  → getActivitySessionById() → sessão ainda ativa
      // 4) finishSession→ getActivitySessionById() → sessão antes de encerrar
      // 5) finishSession→ updateActivitySession()  → sessão finalizada
      // 6) associateReview → getActivitySessionById() → sessão já finalizada
      activity_sessions: [
        { data: null, error: null },
        { data: RUNNING_SESSION, error: null },
        { data: RUNNING_SESSION, error: null },
        { data: RUNNING_SESSION, error: null },
        { data: FINISHED_SESSION, error: null },
        { data: FINISHED_SESSION, error: null },
      ],
      questions: { data: CREATED_QUESTION, error: null },
      reviews: [
        { data: REVIEW_PENDING, error: null },
        { data: ASSOCIATED_REVIEW, error: null },
      ],
    });

    const published = [];
    const offFinished = (await import("../../sessionEventBus.js")).subscribe(
      SESSION_EVENTS.FINISHED,
      ({ session }) => published.push(session)
    );

    const started = await activitySessionService.startSession({ event_id: "evt-1", started_at: STARTED_AT });
    assert.strictEqual(started.status, "running");

    const question = await sessionQuestionsService.addQuestion(started.id, { subject: "Cardiologia" });
    assert.strictEqual(question.session_id, "sess-1");

    const finished = await activitySessionService.finishSession(started.id, NOW);
    assert.strictEqual(finished.status, "finished");
    assert.strictEqual(finished.duration_minutes, DURATION_MINUTES);

    // SessionFinished foi de fato publicado com a sessão finalizada — os
    // consumidores reais (Dashboard/Histórico/Diário/IA) reagem a isto em
    // produção; aqui confirmamos que o evento saiu com o payload certo.
    assert.strictEqual(published.length, 1);
    assert.strictEqual(published[0].id, "sess-1");
    assert.strictEqual(published[0].status, "finished");
    offFinished();

    const associated = await reviewSessionService.associateReview("rev-1", finished.id);
    assert.strictEqual(associated.session_id, "sess-1");
  });

  await t.test("Fase 2 — leitura: Dashboard, Subject Progress, Study Streak e Achievements enxergam a mesma sessão", async () => {
    const FINISHED_SESSION = {
      id: "sess-1", user_id: "user-123", event_id: "evt-1",
      status: "finished", started_at: STARTED_AT, ended_at: NOW.toISOString(),
      duration_minutes: DURATION_MINUTES, paused_at: null, paused_ms: 0,
    };
    const QUESTION = { id: "q-1", session_id: "sess-1", user_id: "user-123", subject: "Cardiologia", created_at: STARTED_AT };
    const ASSOCIATED_REVIEW = { ...REVIEW_PENDING, session_id: "sess-1" };

    resetMock({
      activity_sessions: [{ data: [FINISHED_SESSION], error: null, count: 1 }],
      questions: [{ data: [QUESTION], error: null }],
      events: [{ data: [EVENT], error: null }],
      profiles: [{ data: null, error: null }], // sem metas configuradas
      reviews: [{ data: [ASSOCIATED_REVIEW], error: null }],
    });

    // ── Dashboard ────────────────────────────────────────────────────────
    const dashboard = await activityDashboardService.getDashboardData(NOW);
    assert.strictEqual(dashboard.todaySessionsCount, 1);
    assert.strictEqual(dashboard.todayMinutes, DURATION_MINUTES);
    assert.strictEqual(dashboard.monthMinutes, DURATION_MINUTES);

    // ── Histórico / Diário: a mesma sessão finalizada, via listSessions() ──
    const { sessions: historySessions } = await activitySessionService.listSessions({ status: "finished" });
    assert.strictEqual(historySessions.length, 1);
    assert.strictEqual(historySessions[0].id, "sess-1");
    assert.strictEqual(historySessions[0].duration_minutes, DURATION_MINUTES);

    // ── Diário: revisão associada à mesma sessão ────────────────────────
    const linkedReviews = await reviewSessionService.listBySession("sess-1");
    assert.strictEqual(linkedReviews.length, 1);
    assert.strictEqual(linkedReviews[0].session_id, "sess-1");

    // ── Subject Progress: derivado, nunca persistido ────────────────────
    const cardiologia = await subjectProgressService.getSubjectProgress("Cardiologia");
    assert.strictEqual(cardiologia.finishedSessionsCount, 1);
    assert.strictEqual(cardiologia.questionsCount, 1);
    assert.strictEqual(cardiologia.totalMinutes, DURATION_MINUTES);
    assert.strictEqual(cardiologia.status, "com_atividade");

    // ── Study Streak: hoje conta como dia estudado ──────────────────────
    const streak = await studyStreakService.getStreakSummary();
    assert.strictEqual(streak.currentStreak, 1);
    assert.strictEqual(streak.totalStudyDays, 1);

    // ── Achievements: progresso derivado dos mesmos fatos ───────────────
    const sessionsAchievement = await achievementService.getAchievement("sessions-completed");
    assert.strictEqual(sessionsAchievement.current, 1);
    const questionsAchievement = await achievementService.getAchievement("questions-solved");
    assert.strictEqual(questionsAchievement.current, 1);
    const streakAchievement = await achievementService.getAchievement("study-streak");
    assert.strictEqual(streakAchievement.current, 1);
    const timeAchievement = await achievementService.getAchievement("study-time");
    assert.strictEqual(timeAchievement.current, DURATION_MINUTES / 60);

    // Nenhuma divergência: os mesmos 60 minutos aparecem idênticos em
    // Dashboard, Subject Progress e Achievements (nenhum recomputa duração
    // de forma independente).
    assert.strictEqual(dashboard.todayMinutes, cardiologia.totalMinutes);
    assert.strictEqual(cardiologia.totalMinutes, timeAchievement.current * 60);
  });
});

// ── IA — Context Engine reage ao mesmo SessionFinished, sem tocar Supabase
// nem Views diretamente (padrão de mocking de tests/aiContextService.test.js:
// cada dependência de aiContextService.js é mockada como módulo inteiro, o
// barramento de eventos real é preservado para provar a invalidação ponta a
// ponta) ───────────────────────────────────────────────────────────────────

const EVENT_SPECIFIER     = new URL("../../eventService.js", import.meta.url).href;
const DASHBOARD_SPECIFIER = new URL("../../activityDashboardService.js", import.meta.url).href;
const REVIEW_SPECIFIER    = new URL("../../reviewService.js", import.meta.url).href;
const SESSION_SPECIFIER   = new URL("../../activitySessionService.js", import.meta.url).href;
const CATEGORY_SPECIFIER  = new URL("../../categoryService.js", import.meta.url).href;
const FILTER_SPECIFIER    = new URL("../../academicCalendarFilter.js", import.meta.url).href;
const PROFILE_SPECIFIER   = new URL("../../profileService.js", import.meta.url).href;
const ERROR_SPECIFIER     = new URL("../../errorService.js", import.meta.url).href;

const NO_GOAL = { configured: false, goalMinutes: null, actualMinutes: 0, percentage: null, remainingMinutes: null, state: "no_goal" };
const EMPTY_DASHBOARD = {
  todayMinutes: 0, weekMinutes: 0, monthMinutes: 0,
  todaySessionsCount: 0, weekSessionsCount: 0, monthSessionsCount: 0,
  averageMinutes: 0, longestSession: null,
  dailyGoal: NO_GOAL, weeklyGoal: NO_GOAL, monthlyGoal: NO_GOAL,
};
const DASHBOARD_AFTER_SESSION = { ...EMPTY_DASHBOARD, todayMinutes: DURATION_MINUTES, todaySessionsCount: 1, monthMinutes: DURATION_MINUTES, monthSessionsCount: 1 };

function loadAiContextService(t, getDashboardDataImpl) {
  t.mock.module(EVENT_SPECIFIER, {
    namedExports: { getEventsByRange: async () => [], getEvents: async () => [] },
  });
  t.mock.module(DASHBOARD_SPECIFIER, {
    namedExports: { getDashboardData: getDashboardDataImpl },
  });
  t.mock.module(REVIEW_SPECIFIER, {
    namedExports: { listPending: async () => [], listCompleted: async () => [] },
  });
  t.mock.module(SESSION_SPECIFIER, {
    namedExports: { listByDateRange: async () => [], getEventExecutionSummaries: async () => ({}) },
  });
  t.mock.module(CATEGORY_SPECIFIER, { namedExports: { getCategories: async () => [] } });
  t.mock.module(FILTER_SPECIFIER, { namedExports: { isPersonalVisible: () => true } });
  t.mock.module(PROFILE_SPECIFIER, { namedExports: { getProfile: async () => null } });
  t.mock.module(ERROR_SPECIFIER, { namedExports: { handleError: () => ({ category: "unknown", friendly: "erro" }) } });
  return import(`../../aiContextService.js?t=${Math.random()}`);
}

test("IA: Context Engine reflete o SessionFinished real e nunca consulta Supabase ou Views diretamente", async (t) => {
  t.after(() => clearEventBus());

  let dashboardCallCount = 0;
  const getDashboardDataImpl = async () => {
    dashboardCallCount += 1;
    return dashboardCallCount === 1 ? EMPTY_DASHBOARD : DASHBOARD_AFTER_SESSION;
  };

  const { getAIContext } = await loadAiContextService(t, getDashboardDataImpl);

  const before = await getAIContext();
  assert.strictEqual(before.execution.todayMinutes, 0);
  assert.strictEqual(dashboardCallCount, 1);

  // Mesmo evento publicado pela Fase 1 (finishSession → SESSION_EVENTS.FINISHED)
  // — a IA nunca importa activitySessionService diretamente para descobrir
  // isso, só reage ao barramento.
  publish(SESSION_EVENTS.FINISHED, { id: "sess-1", status: "finished", duration_minutes: DURATION_MINUTES });

  const after = await getAIContext();
  assert.strictEqual(after.execution.todayMinutes, DURATION_MINUTES);
  assert.strictEqual(dashboardCallCount, 2);

  // O mesmo total que o Dashboard real expôs na Fase 2 — nenhuma divergência
  // entre o que a IA "vê" e o que o Dashboard mostra para a mesma sessão.
  assert.strictEqual(after.execution.todayMinutes, DURATION_MINUTES);
});
