// ── studySessionView.js — Tela de Sessão de Estudo (F7.2) ───────────────────
// Substitui o antigo cronômetro global (activitySessionView.js, F1.3): o
// cronômetro agora só existe aqui, na página dedicada "Sessão de Estudo".
// Nenhuma regra de negócio foi movida — toda transição de estado, cálculo de
// duração e evento publicado continua vindo de activitySessionService.js via
// sessionEventBus.js. Este módulo só renderiza o que o domínio retorna e reage
// a cliques, seguindo o mesmo princípio de activitySessionView.js/
// activityHistoryView.js.
//
// Diferença chave em relação ao widget antigo: em vez de esperar clique local
// para saber que algo mudou, a tela assina SESSION_EVENTS e se atualiza
// sozinha (F6.2) — reflete até starts/pauses/finishes disparados por outra
// aba/fluxo (ex.: "Iniciar Sessão" no formulário de compromisso).

import {
  getActiveSession,
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
  cancelSession,
} from "./activitySessionService.js";
import { addQuestion, listQuestions, updateQuestion, removeQuestion } from "./sessionQuestionsService.js";
import { create as createReview, listPending as listPendingReviews } from "./reviewService.js";
import { associateReview, unlinkReview, listBySession as listSessionReviews } from "./reviewSessionService.js";
import { getEventById } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { confirmDialog } from "./confirmDialog.js";
import { abandonedSessionDialog } from "./abandonedSessionDialog.js";
import { initModal } from "./modalController.js";
import { showPage } from "./navigationView.js";
import { handleError } from "./errorService.js";
import { toast } from "./toastService.js";
import { pad, escapeHtml, localDate } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

const TICK_MS = 1000;

// Sessão "running" ou "paused" restaurada com started_at anterior a este
// limiar é considerada abandonada (F7.9) — só dispara o diálogo de decisão
// abaixo; nenhuma expiração/encerramento/cancelamento automático (fora de
// escopo, ver abandonedSessionDialog.js).
const ABANDONED_SESSION_MS = 24 * 60 * 60 * 1000; // 24h

// Rótulos de exibição para os campos de Questões (F7.4) — os mesmos valores
// aceitos pelo CHECK constraint de sql/15_questions.sql, nenhum valor novo.
const QUESTION_TYPE_LABELS = {
  multiple_choice: "Múltipla escolha",
  true_false:      "Verdadeiro/Falso",
  open:             "Dissertativa",
  flashcard:        "Flashcard",
};
const QUESTION_STATUS_LABELS = {
  pending:  "Pendente",
  answered: "Respondida",
  skipped:  "Pulada",
};
const QUESTION_DIFFICULTY_LABELS = {
  easy:   "Fácil",
  medium: "Média",
  hard:   "Difícil",
};

let emptyEl, emptyMessageEl, btnStartStandalone;
let activeEl, statusBadgeEl, timeEl, pauseNoteEl;
let titleEl, categoryEl, contentEl, dateEl, startedAtEl, expectedDurationEl;
let btnPause, btnResume, btnCancel, btnFinish;

// Painel de Contexto (F7.6) — barra de progresso temporal (só quando o
// compromisso tem tempo previsto). Nenhum cálculo novo: os mesmos valores
// (started_at, duration_minutes) já usados em _render(). Os "indicadores
// rápidos" e a linha "Status" do contexto foram removidos na auditoria UX
// #07 — repetiam badge/timer/painel na mesma tela.
let progressEl, progressBarEl, progressTextEl;

const NO_EVENT_TEXT = "Sem compromisso vinculado";

// Modal de encerramento (F7.3) — resumo somente leitura + confirmação, entre
// clicar em "Finalizar" e de fato chamar activitySessionService.finishSession().
// F10 #4.3 — Questões e Revisões deixaram de fazer parte deste modal: aqui só
// resta um recap somente-leitura delas (ver seção própria abaixo, na tela da
// sessão ativa).
let finishModalEl, finishModal;
let ssfTitleEl, ssfCategoryEl, ssfContentEl, ssfStartedAtEl, ssfEndedAtEl, ssfNetTimeEl;
let ssfNotesEl, ssfBtnBack, ssfBtnConfirm;
let ssfRecapQuestionsEl, ssfRecapReviewsEl;

// Cadastro de Questões Resolvidas (F7.4) — F10 #4.3: vive na própria tela da
// sessão ativa (não mais no modal de encerramento) e cada item é persistido
// imediatamente via sessionQuestionsService.addQuestion()/updateQuestion()/
// removeQuestion() — a sessão já existe no banco, não há mais nada "pendente"
// aguardando a confirmação do encerramento.
let sqListEl, sqEmptyEl;
let sqTypeEl, sqStatusEl, sqDifficultyEl, sqSubjectEl, sqTopicEl, sqBtnAdd;
// F10 #3.3 — o formulário de adicionar/editar questão nasce oculto atrás de
// "+ Adicionar questão"; só aparece ao abrir (sqBtnToggleForm), ao editar um
// item da lista (_editQuestion) ou permanece aberto entre adições
// consecutivas (auditoria UX #25) até "Cancelar" fechá-lo de volta.
let sqFormEl, sqBtnToggleForm, sqBtnCancel;

// Seções colapsáveis (auditoria UX #04) — Questões e Revisões nascem
// fechadas a cada sessão nova, para que o cronômetro (elemento principal da
// tela) fique visível sem rolagem; o contador no título reflete o que já foi
// registrado sem precisar expandir.
let sqToggleEl, sqBodyEl, sqCountEl;
let srToggleEl, srBodyEl, srCountEl;

// Revisões (F7.5) — F10 #4.3: mesma mudança das Questões, agora registradas
// durante a sessão ativa. Toda persistência passa por reviewService.js
// (criação) e reviewSessionService.associateReview()/unlinkReview()
// (vínculo) — nenhum session_id é manipulado diretamente aqui.
let srListEl, srEmptyEl;
let srAssociateRowEl, srCreateRowEl;
let srExistingEl, srDateEl, srBtnAssociate, srBtnCreate;
let srFormEl, srBtnToggleForm, srBtnCancel;

let _session   = null; // fonte da verdade: a última linha conhecida do banco
let _eventMeta = null; // { title, category, duration_minutes } — só para exibição
let _tickId    = null;
let _busy      = false; // evita cliques duplicados durante uma chamada em andamento
let _unsubscribers = [];
let _pendingEndedAt = null; // horário de término congelado ao abrir o resumo, reaproveitado na confirmação
let _pendingNetMinutes = null; // mesmo valor exibido em ssf-net-time (F7.10: reaproveitado no resumo final, sem recálculo)

// F10 #4.3 — Questões/Revisões da sessão ativa: refletem exatamente o que já
// está persistido no banco (sessionQuestionsService.listQuestions()/
// reviewSessionService.listBySession()). _sessionDataLoadedFor evita refazer
// essa consulta a cada _applySession() — start/pause/resume da MESMA sessão
// chamam _applySession() de novo com o mesmo id; só uma sessão realmente nova
// (id diferente) ou nenhuma sessão dispara recarga/limpeza.
let _sessionQuestions = [];
let _editingQuestionId = null;
let _sessionReviews = [];
let _sessionDataLoadedFor = null;
let _reviewOptionsRequestId = 0; // descarta respostas obsoletas de _loadReviewOptions()
let _qrBusy = false; // evita cliques duplicados nas ações de Questões/Revisões (independente de _busy)

function _queryElements() {
  emptyEl             = document.getElementById("ss-empty");
  emptyMessageEl      = document.getElementById("ss-empty-message");
  btnStartStandalone  = document.getElementById("ss-btn-start-standalone");

  activeEl            = document.getElementById("ss-active");
  statusBadgeEl        = document.getElementById("ss-status-badge");
  timeEl               = document.getElementById("ss-time");
  pauseNoteEl          = document.getElementById("ss-pause-note");

  titleEl              = document.getElementById("ss-event-title");
  categoryEl           = document.getElementById("ss-category");
  contentEl            = document.getElementById("ss-content");
  dateEl               = document.getElementById("ss-date");
  startedAtEl          = document.getElementById("ss-started-at");
  expectedDurationEl   = document.getElementById("ss-expected-duration");

  progressEl      = document.getElementById("ss-progress");
  progressBarEl   = document.getElementById("ss-progress-bar");
  progressTextEl  = document.getElementById("ss-progress-text");

  btnPause  = document.getElementById("ss-btn-pause");
  btnResume = document.getElementById("ss-btn-resume");
  btnCancel = document.getElementById("ss-btn-cancel");
  btnFinish = document.getElementById("ss-btn-finish");

  sqListEl       = document.getElementById("ss-questions-list");
  sqEmptyEl      = document.getElementById("ss-questions-empty");
  sqToggleEl     = document.getElementById("ss-questions-toggle");
  sqBodyEl       = document.getElementById("ss-questions-body");
  sqCountEl      = document.getElementById("ss-questions-count");
  sqTypeEl       = document.getElementById("ss-q-type");
  sqStatusEl     = document.getElementById("ss-q-status");
  sqDifficultyEl = document.getElementById("ss-q-difficulty");
  sqSubjectEl    = document.getElementById("ss-q-subject");
  sqTopicEl      = document.getElementById("ss-q-topic");
  sqBtnAdd       = document.getElementById("ss-btn-add-question");
  sqFormEl        = document.getElementById("ss-question-form");
  sqBtnToggleForm = document.getElementById("ss-btn-toggle-question-form");
  sqBtnCancel     = document.getElementById("ss-btn-cancel-question");

  srToggleEl = document.getElementById("ss-reviews-toggle");
  srBodyEl   = document.getElementById("ss-reviews-body");
  srCountEl  = document.getElementById("ss-reviews-count");
  srListEl         = document.getElementById("ss-reviews-list");
  srEmptyEl        = document.getElementById("ss-reviews-empty");
  srAssociateRowEl = document.getElementById("ss-review-associate-row");
  srCreateRowEl    = document.getElementById("ss-review-create-row");
  srExistingEl     = document.getElementById("ss-r-existing");
  srDateEl         = document.getElementById("ss-r-date");
  srBtnAssociate   = document.getElementById("ss-btn-associate-review");
  srBtnCreate      = document.getElementById("ss-btn-create-review");
  srFormEl        = document.getElementById("ss-review-form");
  srBtnToggleForm = document.getElementById("ss-btn-toggle-review-form");
  srBtnCancel     = document.getElementById("ss-btn-cancel-review");

  finishModalEl       = document.getElementById("ss-finish-modal");
  ssfTitleEl           = document.getElementById("ssf-event-title");
  ssfCategoryEl        = document.getElementById("ssf-category");
  ssfContentEl         = document.getElementById("ssf-content");
  ssfStartedAtEl       = document.getElementById("ssf-started-at");
  ssfEndedAtEl         = document.getElementById("ssf-ended-at");
  ssfNetTimeEl         = document.getElementById("ssf-net-time");
  ssfNotesEl           = document.getElementById("ssf-notes");
  ssfBtnBack           = document.getElementById("ssf-btn-back");
  ssfBtnConfirm        = document.getElementById("ssf-btn-confirm");
  ssfRecapQuestionsEl  = document.getElementById("ssf-recap-questions");
  ssfRecapReviewsEl    = document.getElementById("ssf-recap-reviews");

  finishModal = initModal(finishModalEl, _closeFinishModal);
}

function _bindEvents() {
  btnStartStandalone.addEventListener("click", () => _run(() => startSession({ source: "manual" })));
  btnPause.addEventListener("click",  () => _run(() => pauseSession(_session.id)));
  btnResume.addEventListener("click", () => _run(() => resumeSession(_session.id)));
  btnFinish.addEventListener("click", () => _openFinishModal());
  btnCancel.addEventListener("click", async () => {
    if (_busy || !_session) return;
    const shouldCancel = await confirmDialog({
      title:       "Cancelar sessão",
      message:     "A sessão será encerrada como cancelada e não entrará nas suas estatísticas de execução. Deseja continuar?",
      confirmText: "Cancelar sessão",
      cancelText:  "Voltar",
      danger:      true,
    });
    if (shouldCancel) {
      await _run(() => cancelSession(_session.id));
      // Auditoria UX #22: ao contrário de finalizar (que abre o resumo — F7.3
      // — e por isso já comunica o resultado), cancelar só fazia a tela
      // voltar ao estado ocioso, sem nenhum sinal de que a ação funcionou.
      toast.success("Sessão cancelada.");
    }
  });

  sqToggleEl.addEventListener("click", () => _setSectionExpanded(sqToggleEl, sqBodyEl, sqBodyEl.hidden));
  srToggleEl.addEventListener("click", () => _setSectionExpanded(srToggleEl, srBodyEl, srBodyEl.hidden));
  sqBtnAdd.addEventListener("click", () => _submitQuestionForm());
  srBtnAssociate.addEventListener("click", () => _associateExistingReview());
  srBtnCreate.addEventListener("click", () => _createAndAssociateReview());

  sqBtnToggleForm.addEventListener("click", () => {
    _setInlineFormVisible(sqFormEl, sqBtnToggleForm, true);
    sqTypeEl.focus();
  });
  sqBtnCancel.addEventListener("click", () => {
    _resetQuestionForm();
    _setInlineFormVisible(sqFormEl, sqBtnToggleForm, false);
  });
  srBtnToggleForm.addEventListener("click", () =>
    _setInlineFormVisible(srFormEl, srBtnToggleForm, true));
  srBtnCancel.addEventListener("click", () => {
    srDateEl.value = "";
    _setInlineFormVisible(srFormEl, srBtnToggleForm, false);
  });

  ssfBtnBack.addEventListener("click", () => _closeFinishModal());
  ssfBtnConfirm.addEventListener("click", () => _confirmFinish());
}

function _formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function _formatClockTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatExpectedDuration(minutes) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// event_date é uma DATE pura ("YYYY-MM-DD") — localDate() (utils.js) evita o
// desvio de fuso de `new Date("YYYY-MM-DD")`, mesmo padrão do restante do app
// (ver reviewService.js/_formatReviewDate abaixo).
function _formatEventDate(dateStr) {
  if (!dateStr) return null;
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Campos que só existem quando a sessão tem um compromisso vinculado
// (categoria/matéria/conteúdo/data, todos lidos do evento) — numa sessão
// avulsa não há "—" ambíguo, e sim uma indicação explícita (F7.6, escopo 4).
function _eventFieldText(value) {
  if (value) return value;
  return _session?.event_id ? "—" : NO_EVENT_TEXT;
}

// O tempo exibido é sempre recalculado a partir de started_at (o banco é a
// fonte da verdade) — o timer local só decide QUANDO redesenhar, nunca o
// valor em si (mesmo princípio do widget antigo, ver F1.3). F7.7: o tempo
// bruto descontado de paused_ms (pausas já concluídas) é o tempo líquido.
// BUG 07: enquanto pausada, a pausa corrente (started em paused_at) também
// precisa ser descontada — não só paused_ms — senão qualquer redesenho que
// aconteça enquanto pausada (restaurar após reload/navegação, ou um evento
// do barramento) usa um Date.now() mais recente que o momento da pausa e
// exibe a pausa em si como se fosse tempo de estudo. Mesma fórmula já usada
// em _minutesBetween() (resumo de encerramento) e em
// activitySessionService.finishSession()/resumeSession() — nenhuma conta nova.
function _renderTime() {
  if (!_session) return;
  const currentPauseMs = _session.status === "paused" && _session.paused_at
    ? Math.max(0, Date.now() - new Date(_session.paused_at).getTime())
    : 0;
  const totalPausedMs = (_session.paused_ms || 0) + currentPauseMs;
  const elapsedMs = Date.now() - new Date(_session.started_at).getTime() - totalPausedMs;
  const elapsedText = _formatElapsed(elapsedMs);
  timeEl.textContent = elapsedText;
  _renderProgress(elapsedMs);
}

// Barra de progresso temporal (F7.6, escopo 2) — só existe quando o
// compromisso tem tempo previsto (duration_minutes); o percentual nunca é
// persistido, é sempre recalculado a partir de started_at + duration_minutes.
function _renderProgress(elapsedMs) {
  const expectedMinutes = _eventMeta?.duration_minutes;
  progressEl.hidden = !expectedMinutes;
  if (!expectedMinutes) return;

  const expectedMs = expectedMinutes * 60000;
  const pct = Math.min(100, Math.max(0, (elapsedMs / expectedMs) * 100));
  progressBarEl.style.width = `${pct}%`;
  progressTextEl.textContent = `${_formatElapsed(elapsedMs)} / ${_formatExpectedDuration(expectedMinutes)}`;
}

function _stopTicking() {
  if (_tickId) { clearInterval(_tickId); _tickId = null; }
}

function _startTicking() {
  _stopTicking();
  _renderTime();
  _tickId = setInterval(_renderTime, TICK_MS);
  _tickId.unref?.(); // no-op em browser; evita segurar o processo vivo nos testes
}

function _render() {
  const status = _session?.status ?? null;

  emptyEl.hidden  = !!_session;
  activeEl.hidden = !_session;
  if (!_session) {
    _stopTicking();
    return;
  }

  statusBadgeEl.textContent = status === "running" ? "Executando" : "Pausada";
  statusBadgeEl.className   = `ss-status-badge ss-status-badge--${status}`;

  btnPause.hidden  = status !== "running";
  btnFinish.hidden = false;
  btnResume.hidden = status !== "paused";
  btnCancel.hidden = status !== "paused";

  pauseNoteEl.hidden = status !== "paused";

  titleEl.textContent    = _eventMeta?.title || "Sessão sem compromisso";
  categoryEl.textContent = _eventFieldText(_eventMeta?.category);
  contentEl.textContent  = _eventFieldText(_eventMeta?.description);
  dateEl.textContent      = _eventFieldText(_formatEventDate(_eventMeta?.event_date));
  startedAtEl.textContent = _formatClockTime(_session.started_at);
  expectedDurationEl.textContent = _formatExpectedDuration(_eventMeta?.duration_minutes);

  if (status === "running") {
    _startTicking();
  } else {
    _stopTicking();
    _renderTime(); // último valor exibido antes de congelar
  }
}

// Aplica o resultado (vindo do service ou do barramento) ao estado da tela,
// limpando os metadados de exibição do evento quando a sessão deixa de existir.
function _applySession(session) {
  _session = session;
  if (!_session || _session.status === "finished" || _session.status === "cancelled") {
    _session   = null;
    _eventMeta = null;
  }
  _render();
  _syncSessionQuestionsAndReviews();
}

// Resolve título/categoria/descrição/duração prevista para exibição a partir
// do event_id gravado na sessão — usado ao restaurar após reload e sempre que
// o barramento notifica uma mudança (ver F1.4/activitySessionView.js original).
async function _resolveEventMeta(session) {
  if (!session?.event_id) return null;
  try {
    const ev = await getEventById(session.event_id);
    return ev
      ? { title: ev.title, category: ev.category || null, description: ev.description || null, duration_minutes: ev.duration_minutes || null, event_date: ev.event_date || null }
      : { title: "Compromisso removido", category: null, description: null, duration_minutes: null, event_date: null };
  } catch (err) {
    handleError(err, { context: "studySessionView.resolveEventMeta" });
    return { title: "Compromisso removido", category: null, description: null, duration_minutes: null, event_date: null };
  }
}

async function _resolveCategoryId(categoryName) {
  if (!categoryName) return null;
  try {
    const categories = await getCategories();
    return categories.find(c => c.name === categoryName)?.id ?? null;
  } catch {
    return null;
  }
}

function _setActionsDisabled(disabled) {
  [btnStartStandalone, btnPause, btnResume, btnCancel, btnFinish].forEach(b => { b.disabled = disabled; });
}

// Executa uma ação de domínio, atualizando a tela a partir do resultado (ou
// preservando o estado anterior em caso de erro — nunca deixa a UI travada
// num estado que não corresponde ao banco).
async function _run(action) {
  if (_busy) return;
  _busy = true;
  _setActionsDisabled(true);
  try {
    const session = await action();
    _eventMeta = await _resolveEventMeta(session);
    _applySession(session);
  } catch (err) {
    handleError(err, { context: "studySessionView" });
  } finally {
    _busy = false;
    _setActionsDisabled(false);
  }
}

// ── Encerramento da sessão (F7.3) ───────────────────────────────────────────
// "Finalizar" nunca chama activitySessionService.finishSession() direto: antes
// abre este resumo (somente leitura, sem cálculo novo — os mesmos campos que
// finishSession() usaria) para o usuário revisar e confirmar. O horário de
// término é congelado no momento em que o resumo abre e reaproveitado, sem
// mudanças, na chamada de confirmação — o que a tela mostra é exatamente o
// que será persistido.

// Espelha a fórmula de duração de activitySessionService.finishSession() só
// para exibição — não introduz uma regra nova, e o mesmo valor (em minutos) é
// o que será de fato calculado por finishSession() ao confirmar (F7.7: já
// descontando paused_ms e, se a sessão está pausada agora, a pausa corrente).
function _minutesBetween(session, endedAtDate) {
  const currentPauseMs = session.status === "paused" && session.paused_at
    ? Math.max(0, endedAtDate - new Date(session.paused_at))
    : 0;
  const totalPausedMs = (session.paused_ms || 0) + currentPauseMs;
  return Math.max(0, Math.round((endedAtDate - new Date(session.started_at) - totalPausedMs) / 60000));
}

// Expande/colapsa uma seção opcional (auditoria UX #04) — mesmo padrão
// aria-expanded + hidden do "Detalhar" do Diário (studyJournalView).
function _setSectionExpanded(toggleBtn, bodyEl, expanded) {
  bodyEl.hidden = !expanded;
  toggleBtn.setAttribute("aria-expanded", String(expanded));
  toggleBtn.textContent = expanded ? "Ocultar" : "Mostrar";
}

// F10 #3.3 — o formulário de adicionar questão/revisão e o botão
// "+ Adicionar..." que o revela nunca ficam visíveis ao mesmo tempo: a
// lista compacta (já existente) passa a ser o que aparece por padrão dentro
// de cada seção opcional, com o formulário só surgindo sob demanda.
function _setInlineFormVisible(formEl, toggleBtn, visible) {
  formEl.hidden = !visible;
  toggleBtn.hidden = visible;
  toggleBtn.setAttribute("aria-expanded", String(visible));
}

// F10 #4.3 — carrega Questões/Revisões já persistidas sempre que a sessão
// ativa muda de identidade (nova sessão iniciada, ou nenhuma sessão ativa) —
// start/pause/resume da MESMA sessão chamam _applySession() de novo com o
// mesmo id; sem a guarda de _sessionDataLoadedFor, cada clique em
// Pausar/Continuar refaria a mesma consulta e sobrescreveria uma edição em
// andamento no formulário.
function _syncSessionQuestionsAndReviews() {
  if (_session?.id === _sessionDataLoadedFor) return;
  _sessionDataLoadedFor = _session?.id ?? null;

  _resetQuestionForm();
  _setInlineFormVisible(sqFormEl, sqBtnToggleForm, false);
  _setSectionExpanded(sqToggleEl, sqBodyEl, false);
  srDateEl.value = "";
  _setInlineFormVisible(srFormEl, srBtnToggleForm, false);
  _setSectionExpanded(srToggleEl, srBodyEl, false);

  if (!_session) {
    _sessionQuestions = [];
    _sessionReviews   = [];
    _renderQuestionsList();
    _renderReviewsList();
    return;
  }

  // Revisões: criar exige um compromisso (reviewService.create() valida
  // event_id), então a linha de criação só aparece em sessões vinculadas.
  srCreateRowEl.hidden = !_session.event_id;
  srAssociateRowEl.hidden = true; // reaparece se _loadReviewOptions() encontrar pendentes

  _loadSessionQuestionsAndReviews(_session.id);
  _loadReviewOptions();
}

// Busca em paralelo o que já está persistido para esta sessão — nenhuma das
// duas listas é "pendente": ambas refletem exatamente o banco, e cada
// adição/remoção subsequente (_submitQuestionForm, _removeQuestionEntry,
// _createAndAssociateReview, _associateExistingReview, _removeReviewEntry)
// atualiza estes mesmos arrays em memória sem precisar recarregar tudo de novo.
async function _loadSessionQuestionsAndReviews(sessionId) {
  try {
    const [questions, reviews] = await Promise.all([
      listQuestions(sessionId),
      listSessionReviews(sessionId),
    ]);
    if (_session?.id !== sessionId) return; // a sessão trocou enquanto a consulta estava em voo
    _sessionQuestions = questions;
    _sessionReviews    = reviews;
    _renderQuestionsList();
    _renderReviewsList();
  } catch (err) {
    if (_session?.id !== sessionId) return;
    handleError(err, { context: "studySessionView.loadSessionQuestionsAndReviews", silent: true });
  }
}

// ── Questões Resolvidas (F7.4) ──────────────────────────────────────────────
// F10 #4.3: cada questão é persistida assim que adicionada/editada/removida —
// _sessionQuestions é só o espelho em memória do que sessionQuestionsService
// já confirmou no banco. Todo acesso ao domínio de Questões passa
// exclusivamente por sessionQuestionsService.js (nunca questionService.js
// diretamente aqui).

// Auditoria UX #25: `keepSubjectTopic` repete a matéria/tópico da última
// questão adicionada — quem resolveu um bloco inteiro de uma mesma
// matéria/tópico não precisa redigitar a cada questão. Tipo/status/
// dificuldade já voltam a um default razoável (não em branco), por isso só
// matéria/tópico precisam desse tratamento especial.
function _resetQuestionForm({ keepSubjectTopic = false } = {}) {
  sqTypeEl.value       = "multiple_choice";
  sqStatusEl.value     = "pending";
  sqDifficultyEl.value = "medium";
  if (!keepSubjectTopic) {
    sqSubjectEl.value = "";
    sqTopicEl.value   = "";
  }
  _editingQuestionId = null;
  sqBtnAdd.textContent = "Adicionar questão";
}

function _renderQuestionsList() {
  sqListEl.innerHTML = "";
  sqEmptyEl.hidden = _sessionQuestions.length > 0;
  if (sqCountEl) {
    sqCountEl.textContent = _sessionQuestions.length ? ` (${_sessionQuestions.length})` : "";
  }

  _sessionQuestions.forEach(q => {
    const li = document.createElement("li");
    li.className = "ss-question-item";
    const subjectTopic = [q.subject, q.topic].filter(Boolean).map(escapeHtml).join(" — ");
    li.innerHTML = `
      <div class="ss-question-item-info">
        <span>${QUESTION_TYPE_LABELS[q.question_type] || q.question_type}</span>
        <span>${QUESTION_STATUS_LABELS[q.status] || q.status}</span>
        <span>${QUESTION_DIFFICULTY_LABELS[q.difficulty] || q.difficulty}</span>
        ${subjectTopic ? `<span>${subjectTopic}</span>` : ""}
      </div>
      <div class="ss-question-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-question-edit="${q.id}">Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-question-remove="${q.id}">Remover</button>
      </div>
    `;
    li.querySelector("[data-question-edit]").addEventListener("click", () => _editQuestion(q.id));
    li.querySelector("[data-question-remove]").addEventListener("click", () => _removeQuestionEntry(q.id));
    sqListEl.appendChild(li);
  });
}

async function _submitQuestionForm() {
  if (_qrBusy || !_session) return;
  const fields = {
    question_type: sqTypeEl.value,
    status:        sqStatusEl.value,
    difficulty:    sqDifficultyEl.value,
    subject:       sqSubjectEl.value.trim() || null,
    topic:         sqTopicEl.value.trim() || null,
  };

  const editingId = _editingQuestionId;
  _qrBusy = true;
  sqBtnAdd.disabled = true;
  try {
    if (editingId !== null) {
      const updated = await updateQuestion(editingId, fields);
      const idx = _sessionQuestions.findIndex(q => q.id === editingId);
      if (idx !== -1) _sessionQuestions[idx] = updated;
    } else {
      const created = await addQuestion(_session.id, fields);
      _sessionQuestions.push(created);
    }
  } catch (err) {
    handleError(err, { context: "studySessionView.submitQuestion" });
    return;
  } finally {
    _qrBusy = false;
    sqBtnAdd.disabled = false;
  }

  _resetQuestionForm({ keepSubjectTopic: true });
  _renderQuestionsList();
  // Auditoria UX #22: antes, a única confirmação era a lista crescendo —
  // fácil de não notar numa lista já longa. Microfeedback (duração curta):
  // várias questões podem ser adicionadas em sequência no mesmo formulário,
  // então um toast com a duração padrão acumularia na tela.
  toast.info(editingId !== null ? "Questão atualizada." : "Questão adicionada.", 2000);
  // Auditoria UX #25: foco de volta ao primeiro campo permite cadência rápida
  // por teclado ao lançar várias questões em sequência (ex.: resolveu um
  // bloco inteiro de uma prova), sem precisar clicar de volta no formulário.
  sqTypeEl.focus();
}

function _editQuestion(questionId) {
  const q = _sessionQuestions.find(q => q.id === questionId);
  if (!q) return;
  sqTypeEl.value       = q.question_type;
  sqStatusEl.value     = q.status;
  sqDifficultyEl.value = q.difficulty;
  sqSubjectEl.value    = q.subject || "";
  sqTopicEl.value      = q.topic || "";
  _editingQuestionId = questionId;
  sqBtnAdd.textContent = "Salvar alteração";
  _setInlineFormVisible(sqFormEl, sqBtnToggleForm, true);
}

async function _removeQuestionEntry(questionId) {
  if (_qrBusy) return;
  _qrBusy = true;
  try {
    await removeQuestion(questionId);
    _sessionQuestions = _sessionQuestions.filter(q => q.id !== questionId);
    if (_editingQuestionId === questionId) {
      _resetQuestionForm();
      _setInlineFormVisible(sqFormEl, sqBtnToggleForm, false);
    }
    _renderQuestionsList();
  } catch (err) {
    handleError(err, { context: "studySessionView.removeQuestion" });
  } finally {
    _qrBusy = false;
  }
}

// ── Revisões (F7.5) ──────────────────────────────────────────────────────────
// F10 #4.3: criar/associar uma revisão persiste (e vincula) na hora — nada
// fica "pendente" aguardando o encerramento. Criação usa reviewService.create()
// (revisão pertence a um compromisso, então só está disponível quando a sessão
// tem event_id); o vínculo Sessão↔Revisão usa exclusivamente
// reviewSessionService.associateReview()/unlinkReview().

// scheduled_date é uma DATE pura ("YYYY-MM-DD") — localDate() (utils.js) evita
// o desvio de fuso de `new Date("YYYY-MM-DD")`, mesmo padrão do restante do app.
function _formatReviewDate(dateStr) {
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _reviewLabel(r) {
  return `Revisão de ${_formatReviewDate(r.scheduled_date)}`;
}

function _renderReviewsList() {
  srListEl.innerHTML = "";
  srEmptyEl.hidden = _sessionReviews.length > 0;
  if (srCountEl) {
    srCountEl.textContent = _sessionReviews.length ? ` (${_sessionReviews.length})` : "";
  }

  _sessionReviews.forEach(r => {
    const li = document.createElement("li");
    li.className = "ss-question-item";
    li.innerHTML = `
      <div class="ss-question-item-info">
        <span>${escapeHtml(_reviewLabel(r))}</span>
      </div>
      <div class="ss-question-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-review-remove="${r.id}">Remover</button>
      </div>
    `;
    li.querySelector("[data-review-remove]").addEventListener("click", () => _removeReviewEntry(r.id));
    srListEl.appendChild(li);
  });
}

async function _removeReviewEntry(reviewId) {
  if (_qrBusy) return;
  _qrBusy = true;
  try {
    await unlinkReview(reviewId);
    _sessionReviews = _sessionReviews.filter(r => r.id !== reviewId);
    _renderReviewsList();
    _loadReviewOptions(); // a revisão desvinculada volta a ficar disponível para associação
  } catch (err) {
    handleError(err, { context: "studySessionView.removeReview" });
  } finally {
    _qrBusy = false;
  }
}

// BUG 15 (herdado do fluxo antigo, agora contra duplo clique real em vez de
// duplicata numa lista pendente): _qrBusy evita criar duas revisões
// idênticas se o clique disparar de novo antes do primeiro terminar.
async function _createAndAssociateReview() {
  const scheduled_date = srDateEl.value;
  if (!scheduled_date || _qrBusy || !_session) return;
  _qrBusy = true;
  srBtnCreate.disabled = true;
  let created = null;
  try {
    created = await createReview({ event_id: _session.event_id, scheduled_date });
    const linked = await associateReview(created.id, _session.id);
    _sessionReviews.push(linked);
    srDateEl.value = "";
    _renderReviewsList();
  } catch (err) {
    handleError(err, { context: "studySessionView.createReview" });
    // BUG 16 (herdado do fluxo antigo): se createReview() teve sucesso mas
    // associateReview() falhou logo em seguida (ex.: rede caiu no meio), a
    // revisão já existe no banco, sem vínculo — sem recarregar as opções
    // aqui, ela ficaria invisível até a próxima sessão, e um novo clique em
    // "Criar revisão" criaria uma segunda revisão duplicada para a mesma
    // data em vez de reaproveitar a órfã. Recarregar a lista de pendentes a
    // oferece de volta em "Revisão existente", pronta para associar.
    if (created) await _loadReviewOptions();
  } finally {
    _qrBusy = false;
    srBtnCreate.disabled = false;
  }
}

async function _associateExistingReview() {
  const reviewId = srExistingEl.value;
  if (!reviewId || _qrBusy || !_session) return;
  _qrBusy = true;
  srBtnAssociate.disabled = true;
  try {
    const linked = await associateReview(reviewId, _session.id);
    _sessionReviews.push(linked);
    _renderReviewsList();
    await _loadReviewOptions(); // a revisão associada não pode ser oferecida de novo
  } catch (err) {
    handleError(err, { context: "studySessionView.associateReview" });
  } finally {
    _qrBusy = false;
    srBtnAssociate.disabled = false;
  }
}

// Preenche o select de revisões pendentes — do compromisso vinculado quando a
// sessão tem event_id, ou globais numa sessão avulsa (mesma semântica opcional
// de reviewService.listPending()). Falha aqui nunca bloqueia a sessão: a
// etapa é opcional, então o erro só desabilita a associação.
async function _loadReviewOptions() {
  const requestId = ++_reviewOptionsRequestId;
  srExistingEl.innerHTML = "";
  try {
    const pending = await listPendingReviews(_session?.event_id || undefined);
    if (requestId !== _reviewOptionsRequestId) return;
    srExistingEl.innerHTML = "";
    // BUG 17: status "pending" não implica "sem sessão" — uma revisão já
    // associada a outra Sessão continua pending até ser concluída/pulada.
    // Oferecê-la aqui de novo levaria reviewSessionService.associateReview()
    // a rejeitar a associação (ou, antes da correção, a roubar o vínculo
    // silenciosamente); filtrar por session_id evita oferecer uma opção que
    // já sabemos que vai falhar.
    const available = pending.filter(r => !r.session_id);
    available.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = _reviewLabel(r);
      srExistingEl.appendChild(opt);
    });
    srAssociateRowEl.hidden = available.length === 0;
  } catch (err) {
    if (requestId !== _reviewOptionsRequestId) return;
    handleError(err, { context: "studySessionView.loadReviewOptions", silent: true });
    srAssociateRowEl.hidden = true;
  }
}

function _openFinishModal() {
  if (_busy || !_session) return;

  _pendingEndedAt = new Date();
  const netMinutes = _minutesBetween(_session, _pendingEndedAt);
  _pendingNetMinutes = netMinutes;

  ssfTitleEl.textContent    = _eventMeta?.title || "Sessão sem compromisso";
  ssfCategoryEl.textContent = _eventMeta?.category || "—";
  ssfContentEl.textContent  = _eventMeta?.description || "—";
  ssfStartedAtEl.textContent     = _formatClockTime(_session.started_at);
  ssfEndedAtEl.textContent       = _formatClockTime(_pendingEndedAt.toISOString());
  ssfNetTimeEl.textContent = _formatExpectedDuration(netMinutes);
  ssfNotesEl.value = "";
  ssfBtnConfirm.disabled = false;
  ssfBtnBack.disabled = false;

  // F10 #4.3 — Questões/Revisões já foram registradas (ou não) durante a
  // sessão ativa; aqui só um recap somente-leitura do que já está persistido
  // (_sessionQuestions/_sessionReviews). Esqueceu de registrar algo?
  // "Continuar sessão" fecha este resumo sem encerrar nada, voltando à tela
  // onde as seções continuam disponíveis.
  ssfRecapQuestionsEl.textContent = _sessionQuestions.length
    ? `${_sessionQuestions.length} questão(ões) registrada(s) nesta sessão.`
    : "Nenhuma questão registrada nesta sessão.";
  ssfRecapReviewsEl.textContent = _sessionReviews.length
    ? `${_sessionReviews.length} revisão(ões) vinculada(s) a esta sessão.`
    : "Nenhuma revisão vinculada a esta sessão.";

  finishModal.open(ssfBtnBack);
}

function _closeFinishModal() {
  _pendingEndedAt = null;
  _pendingNetMinutes = null;
  finishModal.close();
}

// F10 #4.3 — Questões e Revisões já estão persistidas antes de chegar aqui
// (cada uma foi gravada no momento em que o usuário a adicionou, durante a
// sessão ativa); _confirmFinish() só precisa mais encerrar a Sessão em si.
// SessionFinished continua sendo o único evento emitido ao final (por
// activitySessionService, intocado).
async function _confirmFinish() {
  if (_busy || !_session || !_pendingEndedAt) return;
  const sessionId = _session.id;
  const endedAt = _pendingEndedAt;
  const notes = ssfNotesEl.value;

  let finishedSession = null;
  ssfBtnConfirm.disabled = true;
  ssfBtnBack.disabled = true;
  try {
    await _run(async () => {
      finishedSession = await finishSession(sessionId, endedAt, notes);
      return finishedSession;
    });
  } finally {
    ssfBtnConfirm.disabled = false;
    ssfBtnBack.disabled = false;
  }

  // Uma falha em finishSession() já foi reportada por handleError() dentro de
  // _run() — o resumo continua aberto para permitir corrigir e confirmar de
  // novo, em vez de fechar o modal silenciosamente e deixar a sessão presa
  // num limbo (nem finalizada, nem com o resumo aberto).
  if (!finishedSession) return;

  // F10 #3.4 — a tela somente-leitura "Sessão concluída" (F7.10) foi removida:
  // era uma etapa extra que só repetia dados já disponíveis no Diário de
  // Estudos (compromisso/horários/observações/contagens de questões e
  // revisões — todos vindos de `sessionQuestionsService`/`reviewSessionService`/
  // `activitySessionService`, que o Diário já consulta). Em vez de um clique a
  // mais para dispensá-la, um toast confirma o encerramento e a navegação já
  // leva direto para onde a sessão finalizada aparece.
  _closeFinishModal();
  toast.success("Sessão encerrada e registrada no Diário de Estudos.");
  showPage("journal");
}

// Recarrega a partir de um evento do barramento — nunca assume que o payload
// já traz tudo que a tela precisa exibir (ex.: SessionStarted disparado pelo
// formulário de compromisso não conhece o título do evento).
async function _handleBusEvent({ session }) {
  if (_busy) return; // uma ação local já vai atualizar a tela ao terminar
  _eventMeta = await _resolveEventMeta(session);
  _applySession(session);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initStudySessionView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.STARTED,   _handleBusEvent),
    subscribe(SESSION_EVENTS.PAUSED,    _handleBusEvent),
    subscribe(SESSION_EVENTS.RESUMED,   _handleBusEvent),
    subscribe(SESSION_EVENTS.FINISHED,  _handleBusEvent),
    subscribe(SESSION_EVENTS.CANCELLED, _handleBusEvent),
    subscribe(SESSION_EVENTS.UPDATED,   _handleBusEvent),
  ];
}

/**
 * Monta a tela (uma única vez) e restaura, se existir, a sessão em andamento
 * OU pausada do usuário atual (F7.8) — reabrir a página (ou recarregar o
 * app) nunca deve fazer o usuário perder uma sessão ativa nem o contexto do
 * compromisso vinculado, e uma sessão pausada nunca é retomada
 * automaticamente: ela reaparece exatamente como "Pausada" (_render() já
 * decide os botões/badge a partir de _session.status, sem mudança aqui).
 * O cronômetro (quando running) recalcula a partir de started_at/paused_ms —
 * os mesmos campos já usados em _renderTime() — sem qualquer ajuste manual.
 * Também assina o barramento de eventos (F6.2) para manter a tela sincronizada
 * sem polling e sem recarga completa.
 *
 * @returns {Promise<boolean>} true se uma sessão foi restaurada (running ou
 * paused) — usado por script.js para decidir se deve levar o usuário direto
 * à tela "Sessão de Estudo" ao abrir o app, em vez da última página salva.
 */
export async function initStudySessionView() {
  if (!emptyEl) {
    _queryElements();
    _bindEvents();
  }

  _subscribeToEventBus();

  try {
    _session   = await getActiveSession();
    _eventMeta = await _resolveEventMeta(_session);
  } catch (err) {
    handleError(err, { context: "studySessionView.restore" });
    _session   = null;
    _eventMeta = null;
  }
  _render();
  _syncSessionQuestionsAndReviews();

  // F7.9 — Sessão abandonada: a restauração acima já aconteceu normalmente
  // (nenhuma mudança de comportamento para sessões recentes). Uma sessão
  // "running" ou "paused" antiga demais só ganha, além disso, este diálogo —
  // que nunca decide sozinho; ele apenas devolve a escolha do usuário para
  // _resolveAbandonedSession() aplicar (ou não aplicar nada, em "continuar").
  // Deliberadamente não aguardado aqui: não pode atrasar o restante da
  // inicialização do app (script.js/_initApp) esperando o usuário decidir.
  if (_session && Date.now() - new Date(_session.started_at).getTime() > ABANDONED_SESSION_MS) {
    _resolveAbandonedSession(_session);
  }

  return !!_session;
}

// Mostra o diálogo de decisão (F7.9) e aplica exatamente a escolha do
// usuário — "continuar" não faz nenhuma chamada (a sessão restaurada já está
// na tela, intocada); "finalizar"/"cancelar" chamam só o service de domínio
// já existente, sem passar pelo resumo de encerramento (F7.3) nem por
// qualquer outra lógica paralela.
async function _resolveAbandonedSession(session) {
  const choice = await abandonedSessionDialog({ startedAt: session.started_at });

  // A sessão pode ter mudado (outra aba finalizou/cancelou via barramento,
  // ou o usuário já navegou para longe dela) enquanto o diálogo estava
  // aberto — só age se ainda for a mesma sessão pendente de decisão.
  if (_session?.id !== session.id) return;

  if (choice === "finish") {
    await _run(() => finishSession(session.id));
  } else if (choice === "cancel") {
    await _run(() => cancelSession(session.id));
  }
  // "continue": nenhuma ação — a sessão já restaurada continua exatamente como está.
}

/**
 * Inicia uma sessão vinculada a um compromisso (ver eventFormView.js — botão
 * "Iniciar Sessão"). Se já existir outra sessão ativa, NUNCA troca
 * silenciosamente: mostra uma mensagem amigável oferecendo apenas finalizar a
 * sessão atual, e exige um novo clique para de fato iniciar a nova. Mesmo
 * contrato do activitySessionView.js original (F1.4) — só muda o destino
 * visual (a tela dedicada, não mais um widget flutuante).
 *
 * @returns {Promise<boolean>} true se a sessão do evento foi iniciada.
 */
export async function startSessionForEvent(event) {
  if (_busy || !emptyEl) return false;
  _busy = true;
  _setActionsDisabled(true);
  try {
    const category_id = await _resolveCategoryId(event.category);
    const session = await startSession({ event_id: event.id, category_id, source: "event" });
    _eventMeta = { title: event.title, category: event.category || null, description: event.description || null, duration_minutes: event.duration_minutes || null, event_date: event.event_date || null };
    _applySession(session);
    return true;
  } catch (err) {
    if (err?.code === "SESSION_ALREADY_RUNNING") {
      const runningLabel = _eventMeta?.title ? `"${_eventMeta.title}"` : "outra atividade";
      const shouldFinish = await confirmDialog({
        title:       "Sessão em andamento",
        message:     `Já existe uma sessão em andamento para ${runningLabel}. Finalize-a antes de iniciar uma nova sessão.`,
        confirmText: "Finalizar sessão atual",
        cancelText:  "Cancelar",
      });
      if (shouldFinish && _session) {
        try {
          const finished = await finishSession(_session.id);
          _applySession(finished);
        } catch (finishErr) {
          handleError(finishErr, { context: "studySessionView.finishBeforeSwitch" });
        }
      }
      return false;
    }
    handleError(err, { context: "studySessionView.startSessionForEvent" });
    return false;
  } finally {
    _busy = false;
    _setActionsDisabled(false);
  }
}

// Chamado no logout (ver script.js/authView.js): a tela não deve continuar
// mostrando/tiquetaqueando a sessão do usuário anterior.
export function resetStudySessionView() {
  _stopTicking();
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  _session   = null;
  _eventMeta = null;
  _busy      = false;
  _qrBusy    = false;
  _pendingEndedAt = null;
  _pendingNetMinutes = null;
  _sessionQuestions = [];
  _editingQuestionId = null;
  _sessionReviews = [];
  _sessionDataLoadedFor = null;
  _reviewOptionsRequestId++;
  if (finishModalEl && !finishModalEl.hidden) finishModal.close();
  if (emptyEl) _render();

  // _render() acima só esconde activeEl quando _session é null — não limpa o
  // texto já escrito nos campos (título, categoria, horários etc.), que
  // ficariam presentes no DOM (embora ocultos) até o próximo login. Mesma
  // simetria init/reset da auditoria A1.3: o texto do usuário anterior não
  // pode sobreviver no DOM, mesmo dentro de uma seção hidden.
  [titleEl, categoryEl, contentEl, dateEl, startedAtEl, expectedDurationEl]
    .forEach(el => { if (el) el.textContent = ""; });
  if (timeEl) timeEl.textContent = "";
  if (statusBadgeEl) { statusBadgeEl.textContent = ""; statusBadgeEl.className = "ss-status-badge"; }

  // Campos do modal de encerramento (F7.3): _openFinishModal() sempre os
  // reconstrói do zero antes de reabrir, mas nada os limpava ao fechar por
  // logout — os dados do usuário anterior ficariam presentes no DOM enquanto
  // o modal permanece fechado.
  [ssfTitleEl, ssfCategoryEl, ssfContentEl, ssfStartedAtEl,
   ssfEndedAtEl, ssfNetTimeEl, ssfRecapQuestionsEl, ssfRecapReviewsEl]
    .forEach(el => { if (el) el.textContent = ""; });
  if (ssfNotesEl) ssfNotesEl.value = "";

  // Seções de Questões/Revisões (F10 #4.3, agora na tela ativa): mesma
  // simetria init/reset — nem a lista nem o formulário do usuário anterior
  // podem sobreviver no DOM, mesmo dentro de uma seção hidden.
  if (sqListEl) _renderQuestionsList();
  if (srListEl) _renderReviewsList();
  if (sqToggleEl) _setSectionExpanded(sqToggleEl, sqBodyEl, false);
  if (srToggleEl) _setSectionExpanded(srToggleEl, srBodyEl, false);
  if (sqFormEl) _setInlineFormVisible(sqFormEl, sqBtnToggleForm, false);
  if (srFormEl) _setInlineFormVisible(srFormEl, srBtnToggleForm, false);
  if (srDateEl) srDateEl.value = "";
}
