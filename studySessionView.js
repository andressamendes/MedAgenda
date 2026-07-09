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
import { addQuestion } from "./sessionQuestionsService.js";
import { create as createReview, listPending as listPendingReviews } from "./reviewService.js";
import { associateReview } from "./reviewSessionService.js";
import { getEventById } from "./eventService.js";
import { getCategories } from "./categoryService.js";
import { confirmDialog } from "./confirmDialog.js";
import { abandonedSessionDialog } from "./abandonedSessionDialog.js";
import { initModal } from "./modalController.js";
import { openSessionSummary } from "./sessionSummaryView.js";
import { handleError } from "./errorService.js";
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
let titleEl, categoryEl, subjectEl, contentEl, objectiveEl, dateEl, startedAtEl, expectedDurationEl, statusTextEl;
let btnPause, btnResume, btnCancel, btnFinish;

// Painel de Contexto (F7.6) — barra de progresso temporal (só quando o
// compromisso tem tempo previsto) e indicadores rápidos. Nenhum cálculo novo:
// os mesmos valores (started_at, duration_minutes) já usados em _render().
let progressEl, progressBarEl, progressTextEl;
let indStartedEl, indNetEl, indStatusEl, indEventEl;

const NO_EVENT_TEXT = "Sem compromisso vinculado";

// Modal de encerramento (F7.3) — resumo somente leitura + confirmação, entre
// clicar em "Finalizar" e de fato chamar activitySessionService.finishSession().
let finishModalEl, finishModal;
let ssfTitleEl, ssfCategoryEl, ssfSubjectEl, ssfContentEl, ssfStartedAtEl, ssfEndedAtEl, ssfNetTimeEl, ssfTotalDurationEl;
let ssfNotesEl, ssfBtnBack, ssfBtnConfirm;

// Cadastro de Questões Resolvidas (F7.4) — lista editável no próprio resumo,
// só persistida via sessionQuestionsService.addQuestion() na confirmação.
let ssfQuestionsListEl, ssfQuestionsEmptyEl;
let ssfQTypeEl, ssfQStatusEl, ssfQDifficultyEl, ssfQSubjectEl, ssfQTopicEl, ssfBtnAddQuestion;

// Revisões do pós-sessão (F7.5) — etapa opcional entre Questões e Confirmar.
// Toda persistência passa por reviewService.js (criação) e
// reviewSessionService.associateReview() (vínculo) — nenhum session_id é
// manipulado diretamente aqui.
let ssfReviewsListEl, ssfReviewsEmptyEl;
let ssfReviewAssociateRowEl, ssfReviewCreateRowEl;
let ssfRExistingEl, ssfRDateEl, ssfBtnAssociateReview, ssfBtnCreateReview;

let _session   = null; // fonte da verdade: a última linha conhecida do banco
let _eventMeta = null; // { title, category, duration_minutes } — só para exibição
let _tickId    = null;
let _busy      = false; // evita cliques duplicados durante uma chamada em andamento
let _unsubscribers = [];
let _pendingEndedAt = null; // horário de término congelado ao abrir o resumo, reaproveitado na confirmação
let _pendingNetMinutes = null; // mesmo valor exibido em ssf-net-time (F7.10: reaproveitado no resumo final, sem recálculo)

// Questões adicionadas no resumo, ainda não persistidas — só viram linhas em
// public.questions (via sessionQuestionsService.addQuestion()) na confirmação
// do encerramento. Cancelar o encerramento descarta este array sem gravar
// nada; nenhum id local aqui é um id de banco.
let _pendingQuestions = [];
let _editingQuestionLocalId = null;
let _nextQuestionLocalId = 1;

// Revisões escolhidas no resumo, ainda não persistidas (F7.5) — cada item é
// { localId, kind: "create"|"associate", scheduled_date?, reviewId?, label }.
// Só viram chamadas de domínio (reviewService.create() + associateReview())
// na confirmação; cancelar o encerramento descarta este array sem gravar nada.
let _pendingReviews = [];
let _nextReviewLocalId = 1;
let _reviewOptionsRequestId = 0; // descarta respostas obsoletas se o resumo fechar/reabrir

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
  subjectEl            = document.getElementById("ss-subject");
  contentEl            = document.getElementById("ss-content");
  objectiveEl          = document.getElementById("ss-objective");
  dateEl               = document.getElementById("ss-date");
  startedAtEl          = document.getElementById("ss-started-at");
  expectedDurationEl   = document.getElementById("ss-expected-duration");
  statusTextEl         = document.getElementById("ss-status-text");

  progressEl      = document.getElementById("ss-progress");
  progressBarEl   = document.getElementById("ss-progress-bar");
  progressTextEl  = document.getElementById("ss-progress-text");

  indStartedEl = document.getElementById("ss-ind-started");
  indNetEl     = document.getElementById("ss-ind-net");
  indStatusEl  = document.getElementById("ss-ind-status");
  indEventEl   = document.getElementById("ss-ind-event");

  btnPause  = document.getElementById("ss-btn-pause");
  btnResume = document.getElementById("ss-btn-resume");
  btnCancel = document.getElementById("ss-btn-cancel");
  btnFinish = document.getElementById("ss-btn-finish");

  finishModalEl      = document.getElementById("ss-finish-modal");
  ssfTitleEl          = document.getElementById("ssf-event-title");
  ssfCategoryEl        = document.getElementById("ssf-category");
  ssfSubjectEl         = document.getElementById("ssf-subject");
  ssfContentEl         = document.getElementById("ssf-content");
  ssfStartedAtEl       = document.getElementById("ssf-started-at");
  ssfEndedAtEl         = document.getElementById("ssf-ended-at");
  ssfNetTimeEl         = document.getElementById("ssf-net-time");
  ssfTotalDurationEl   = document.getElementById("ssf-total-duration");
  ssfNotesEl           = document.getElementById("ssf-notes");
  ssfBtnBack           = document.getElementById("ssf-btn-back");
  ssfBtnConfirm        = document.getElementById("ssf-btn-confirm");

  ssfQuestionsListEl   = document.getElementById("ssf-questions-list");
  ssfQuestionsEmptyEl  = document.getElementById("ssf-questions-empty");
  ssfQTypeEl           = document.getElementById("ssf-q-type");
  ssfQStatusEl         = document.getElementById("ssf-q-status");
  ssfQDifficultyEl     = document.getElementById("ssf-q-difficulty");
  ssfQSubjectEl        = document.getElementById("ssf-q-subject");
  ssfQTopicEl          = document.getElementById("ssf-q-topic");
  ssfBtnAddQuestion    = document.getElementById("ssf-btn-add-question");

  ssfReviewsListEl        = document.getElementById("ssf-reviews-list");
  ssfReviewsEmptyEl       = document.getElementById("ssf-reviews-empty");
  ssfReviewAssociateRowEl = document.getElementById("ssf-review-associate-row");
  ssfReviewCreateRowEl    = document.getElementById("ssf-review-create-row");
  ssfRExistingEl          = document.getElementById("ssf-r-existing");
  ssfRDateEl              = document.getElementById("ssf-r-date");
  ssfBtnAssociateReview   = document.getElementById("ssf-btn-associate-review");
  ssfBtnCreateReview      = document.getElementById("ssf-btn-create-review");

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
    if (shouldCancel) await _run(() => cancelSession(_session.id));
  });

  ssfBtnBack.addEventListener("click", () => _closeFinishModal());
  ssfBtnAddQuestion.addEventListener("click", () => _addOrUpdatePendingQuestion());
  ssfBtnAssociateReview.addEventListener("click", () => _addPendingReviewAssociation());
  ssfBtnCreateReview.addEventListener("click", () => _addPendingReviewCreation());
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
  indNetEl.textContent = elapsedText;
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

  const statusLabel = status === "running" ? "Executando" : "Pausada";

  titleEl.textContent    = _eventMeta?.title || "Sessão avulsa";
  categoryEl.textContent = _eventFieldText(_eventMeta?.category);
  subjectEl.textContent  = _eventFieldText(_eventMeta?.category); // domínio ainda não tem campo próprio de matéria (ver subjectProgressService.js)
  contentEl.textContent  = _eventFieldText(_eventMeta?.description);
  objectiveEl.textContent = "—"; // sem campo de objetivo no domínio atual — reservado para etapa futura
  dateEl.textContent      = _eventFieldText(_formatEventDate(_eventMeta?.event_date));
  startedAtEl.textContent = _formatClockTime(_session.started_at);
  expectedDurationEl.textContent = _formatExpectedDuration(_eventMeta?.duration_minutes);
  statusTextEl.textContent = statusLabel;

  // Indicadores rápidos (F7.6, escopo 3) — mesmos dados acima, só resumidos.
  indStartedEl.textContent = _formatClockTime(_session.started_at);
  indStatusEl.textContent  = statusLabel;
  indEventEl.textContent   = _eventMeta?.title || NO_EVENT_TEXT;

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

// ── Questões Resolvidas do resumo (F7.4) ────────────────────────────────────
// Lista local, editável até a confirmação — nenhuma chamada a
// sessionQuestionsService.addQuestion() acontece antes de _confirmFinish().
// Todo acesso ao domínio de Questões passa exclusivamente por
// sessionQuestionsService.js (nunca questionService.js diretamente aqui).

function _resetQuestionForm() {
  ssfQTypeEl.value       = "multiple_choice";
  ssfQStatusEl.value     = "pending";
  ssfQDifficultyEl.value = "medium";
  ssfQSubjectEl.value    = "";
  ssfQTopicEl.value      = "";
  _editingQuestionLocalId = null;
  ssfBtnAddQuestion.textContent = "Adicionar questão";
}

function _renderQuestionsList() {
  ssfQuestionsListEl.innerHTML = "";
  ssfQuestionsEmptyEl.hidden = _pendingQuestions.length > 0;

  _pendingQuestions.forEach(q => {
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
        <button type="button" class="btn btn-ghost btn-sm" data-question-edit="${q.localId}">Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-question-remove="${q.localId}">Remover</button>
      </div>
    `;
    li.querySelector("[data-question-edit]").addEventListener("click", () => _editPendingQuestion(q.localId));
    li.querySelector("[data-question-remove]").addEventListener("click", () => _removePendingQuestion(q.localId));
    ssfQuestionsListEl.appendChild(li);
  });
}

function _addOrUpdatePendingQuestion() {
  const fields = {
    question_type: ssfQTypeEl.value,
    status:        ssfQStatusEl.value,
    difficulty:    ssfQDifficultyEl.value,
    subject:       ssfQSubjectEl.value.trim() || null,
    topic:         ssfQTopicEl.value.trim() || null,
  };

  if (_editingQuestionLocalId !== null) {
    const idx = _pendingQuestions.findIndex(q => q.localId === _editingQuestionLocalId);
    if (idx !== -1) _pendingQuestions[idx] = { ..._pendingQuestions[idx], ...fields };
  } else {
    _pendingQuestions.push({ localId: _nextQuestionLocalId++, ...fields });
  }

  _resetQuestionForm();
  _renderQuestionsList();
}

function _editPendingQuestion(localId) {
  const q = _pendingQuestions.find(q => q.localId === localId);
  if (!q) return;
  ssfQTypeEl.value       = q.question_type;
  ssfQStatusEl.value     = q.status;
  ssfQDifficultyEl.value = q.difficulty;
  ssfQSubjectEl.value    = q.subject || "";
  ssfQTopicEl.value      = q.topic || "";
  _editingQuestionLocalId = localId;
  ssfBtnAddQuestion.textContent = "Salvar alteração";
}

function _removePendingQuestion(localId) {
  _pendingQuestions = _pendingQuestions.filter(q => q.localId !== localId);
  if (_editingQuestionLocalId === localId) _resetQuestionForm();
  _renderQuestionsList();
}

// ── Revisões do pós-sessão (F7.5) ───────────────────────────────────────────
// Etapa opcional entre Questões e Confirmar: o usuário pode criar uma revisão
// nova, associar uma revisão pendente existente, ou ignorar a etapa. Nada é
// persistido antes de _confirmFinish() — mesmo contrato das Questões (F7.4).
// Criação usa reviewService.create() (revisão pertence a um compromisso, então
// só está disponível quando a sessão tem event_id); o vínculo Sessão↔Revisão
// usa exclusivamente reviewSessionService.associateReview().

// scheduled_date é uma DATE pura ("YYYY-MM-DD") — localDate() (utils.js) evita
// o desvio de fuso de `new Date("YYYY-MM-DD")`, mesmo padrão do restante do app.
function _formatReviewDate(dateStr) {
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _renderReviewsList() {
  ssfReviewsListEl.innerHTML = "";
  ssfReviewsEmptyEl.hidden = _pendingReviews.length > 0;

  _pendingReviews.forEach(r => {
    const li = document.createElement("li");
    li.className = "ss-question-item";
    li.innerHTML = `
      <div class="ss-question-item-info">
        <span>${escapeHtml(r.label)}</span>
      </div>
      <div class="ss-question-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-review-remove="${r.localId}">Remover</button>
      </div>
    `;
    li.querySelector("[data-review-remove]").addEventListener("click", () => _removePendingReview(r.localId));
    ssfReviewsListEl.appendChild(li);
  });
}

function _removePendingReview(localId) {
  _pendingReviews = _pendingReviews.filter(r => r.localId !== localId);
  _renderReviewsList();
}

function _addPendingReviewCreation() {
  const scheduled_date = ssfRDateEl.value;
  if (!scheduled_date) return;
  // BUG 15: sem esta checagem, clicar "Criar revisão" duas vezes com a mesma
  // data enfileirava duas entradas idênticas, e cada uma virava um INSERT
  // separado em _confirmFinish() — duas revisões pendentes duplicadas para o
  // mesmo compromisso/data. Mesma proteção que _addPendingReviewAssociation()
  // já tinha para revisões existentes (linha abaixo).
  if (_pendingReviews.some(r => r.kind === "create" && r.scheduled_date === scheduled_date)) return;
  _pendingReviews.push({
    localId: _nextReviewLocalId++,
    kind:    "create",
    scheduled_date,
    label:   `Nova revisão em ${_formatReviewDate(scheduled_date)}`,
  });
  ssfRDateEl.value = "";
  _renderReviewsList();
}

function _addPendingReviewAssociation() {
  const reviewId = ssfRExistingEl.value;
  if (!reviewId) return;
  if (_pendingReviews.some(r => r.kind === "associate" && r.reviewId === reviewId)) return;
  const label = ssfRExistingEl.selectedOptions[0]?.textContent || "Revisão existente";
  _pendingReviews.push({
    localId: _nextReviewLocalId++,
    kind:    "associate",
    reviewId,
    label:   `Associar: ${label}`,
  });
  _renderReviewsList();
}

// Preenche o select de revisões pendentes — do compromisso vinculado quando a
// sessão tem event_id, ou globais numa sessão avulsa (mesma semântica opcional
// de reviewService.listPending()). Falha aqui nunca bloqueia o encerramento:
// a etapa é opcional, então o erro só desabilita a associação.
async function _loadReviewOptions() {
  const requestId = ++_reviewOptionsRequestId;
  ssfRExistingEl.innerHTML = "";
  try {
    const pending = await listPendingReviews(_session?.event_id || undefined);
    if (requestId !== _reviewOptionsRequestId) return;
    ssfRExistingEl.innerHTML = "";
    // BUG 17: status "pending" não implica "sem sessão" — uma revisão já
    // associada a outra Sessão continua pending até ser concluída/pulada.
    // Oferecê-la aqui de novo levaria reviewSessionService.associateReview()
    // a rejeitar a confirmação (ou, antes da correção, a roubar o vínculo
    // silenciosamente); filtrar por session_id evita oferecer uma opção que
    // já sabemos que vai falhar.
    const available = pending.filter(r => !r.session_id);
    available.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `Revisão de ${_formatReviewDate(r.scheduled_date)}`;
      ssfRExistingEl.appendChild(opt);
    });
    ssfReviewAssociateRowEl.hidden = available.length === 0;
  } catch (err) {
    if (requestId !== _reviewOptionsRequestId) return;
    handleError(err, { context: "studySessionView.loadReviewOptions", silent: true });
    ssfReviewAssociateRowEl.hidden = true;
  }
}

function _openFinishModal() {
  if (_busy || !_session) return;

  _pendingEndedAt = new Date();
  const netMinutes = _minutesBetween(_session, _pendingEndedAt);
  _pendingNetMinutes = netMinutes;

  ssfTitleEl.textContent    = _eventMeta?.title || "Sessão avulsa";
  ssfCategoryEl.textContent = _eventMeta?.category || "—";
  ssfSubjectEl.textContent  = _eventMeta?.category || "—"; // ver studySessionView.js:_render — domínio ainda não tem campo próprio de matéria
  ssfContentEl.textContent  = _eventMeta?.description || "—";
  ssfStartedAtEl.textContent     = _formatClockTime(_session.started_at);
  ssfEndedAtEl.textContent       = _formatClockTime(_pendingEndedAt.toISOString());
  ssfNetTimeEl.textContent       = _formatExpectedDuration(netMinutes);
  ssfTotalDurationEl.textContent = _formatExpectedDuration(netMinutes);
  ssfNotesEl.value = "";
  ssfBtnConfirm.disabled = false;
  ssfBtnBack.disabled = false;

  _pendingQuestions = [];
  _resetQuestionForm();
  _renderQuestionsList();

  // Revisões (F7.5): criar exige um compromisso (reviewService.create() valida
  // event_id), então a linha de criação só aparece em sessões vinculadas.
  _pendingReviews = [];
  ssfRDateEl.value = "";
  ssfReviewCreateRowEl.hidden = !_session.event_id;
  ssfReviewAssociateRowEl.hidden = true; // reaparece se _loadReviewOptions() encontrar pendentes
  _renderReviewsList();
  _loadReviewOptions();

  finishModal.open(ssfBtnBack);
}

function _closeFinishModal() {
  _pendingEndedAt = null;
  _pendingNetMinutes = null;
  _pendingQuestions = [];
  _editingQuestionLocalId = null;
  _pendingReviews = [];
  _reviewOptionsRequestId++; // invalida qualquer busca de revisões pendentes em andamento
  finishModal.close();
}

// Ordem de persistência do encerramento (F7.4 + F7.5): Questões primeiro,
// depois Revisões (criação via reviewService.create() + vínculo via
// reviewSessionService.associateReview()), e só então finishSession() — a
// Sessão continua sendo a entidade raiz, e SessionFinished continua sendo o
// único evento emitido ao final (por activitySessionService, intocado).
async function _confirmFinish() {
  if (_busy || !_session || !_pendingEndedAt) return;
  const sessionId = _session.id;
  const eventId = _session.event_id;
  const endedAt = _pendingEndedAt;
  const questions = _pendingQuestions;
  const reviews = _pendingReviews;
  const eventMeta = _eventMeta;
  const notes = ssfNotesEl.value;
  const startedAt = _session.started_at; // _session vira null após _run() (sessão finalizada), então precisa ser capturado antes

  // F7.10: capturado só para alimentar o resumo final somente leitura aberto
  // logo abaixo — o valor vem pronto de finishSession() (activitySessionService,
  // intocado), nenhum recálculo de duração/status acontece aqui.
  let finishedSession = null;
  ssfBtnConfirm.disabled = true;
  ssfBtnBack.disabled = true;
  try {
    await _run(async () => {
      for (const q of questions) {
        await addQuestion(sessionId, {
          question_type: q.question_type,
          status:        q.status,
          difficulty:    q.difficulty,
          subject:       q.subject,
          topic:         q.topic,
        });
      }
      for (const r of reviews) {
        // BUG 16: se uma falha (ex.: erro de rede) interrompe este loop no meio
        // e o usuário confirma de novo (BUG 08 mantém o resumo aberto com
        // _pendingReviews intactos para permitir retry), reprocessar do zero
        // recriava reviewService.create() para entradas já persistidas com
        // sucesso na tentativa anterior — revisão duplicada. Ao converter a
        // entrada para "associate" assim que ela é criada, o retry apenas
        // reassocia a mesma revisão (idempotente) em vez de criar outra.
        if (r.kind === "create") {
          const created = await createReview({ event_id: eventId, scheduled_date: r.scheduled_date });
          r.kind = "associate";
          r.reviewId = created.id;
        }
        await associateReview(r.reviewId, sessionId);
      }
      finishedSession = await finishSession(sessionId, endedAt);
      return finishedSession;
    });
  } finally {
    ssfBtnConfirm.disabled = false;
    ssfBtnBack.disabled = false;
  }

  // BUG 08: uma falha em qualquer etapa (Questões, Revisões ou finishSession)
  // já foi reportada por handleError() dentro de _run() — o fluxo não pode
  // seguir adiante nem descartar o que o usuário preencheu. O resumo continua
  // aberto, com _pendingQuestions/_pendingReviews intactos, para permitir
  // corrigir e confirmar de novo, em vez de fechar o modal silenciosamente e
  // deixar a sessão presa num limbo (nem finalizada, nem com o resumo aberto).
  if (!finishedSession) return;

  _closeFinishModal();
  openSessionSummary({
    eventMeta,
    startedAt:      finishedSession.started_at ?? startedAt,
    endedAt:        finishedSession.ended_at ?? endedAt,
    netMinutes:     finishedSession.duration_minutes ?? _pendingNetMinutes,
    status:         finishedSession.status,
    questionsCount: questions.length,
    reviewsCount:   reviews.length,
    notes,
  });
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
  _pendingEndedAt = null;
  _pendingNetMinutes = null;
  _pendingQuestions = [];
  _editingQuestionLocalId = null;
  _pendingReviews = [];
  _reviewOptionsRequestId++;
  if (finishModalEl && !finishModalEl.hidden) finishModal.close();
  if (emptyEl) _render();
}
