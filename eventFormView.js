// ── eventFormView.js — Modal de criação e edição de compromissos ─────────────

import { createEvent, updateEvent } from "./eventService.js";
import { listByEvent } from "./activitySessionService.js";
import { computeSessionStats } from "./activitySessionStats.js";
import * as reviewService from "./reviewService.js";
import { confirmDialog } from "./confirmDialog.js";
import { track, EVENTS } from "./telemetryService.js";
import { toast } from "./toastService.js";
import { initModal } from "./modalController.js";
import { handleError } from "./errorService.js";
import { startSessionForEvent } from "./activitySessionView.js";
import { getAIContext } from "./aiContextService.js";
import { renderSmartCards, buildSmartCard } from "./smartCardView.js";
import { pad, escapeHtml, localDate } from "./utils.js";

// Categoria "com poucas sessões": mesmo piso de recommendationEngine.js/
// planningService.js (categoria sem sessão finalizada há muito tempo, ou
// nunca estudada) — redefinido aqui, sem importar esses módulos, para não
// acoplar o formulário a eles.
const UNDERSTUDIED_DAYS = 5;
// Meta semanal "quase atingida": mesmo piso de recommendationEngine.js.
const GOAL_NEAR_MIN_PCT = 70;

const REMINDER_PRESETS = new Set(["0", "10", "30", "60", "120", "1440"]);

const SESSION_STATUS_LABELS = {
  running:   "Em andamento",
  paused:    "Pausada",
  finished:  "Concluída",
  cancelled: "Cancelada",
};
const SESSION_SOURCE_LABELS = {
  manual: "Manual",
  event:  "Compromisso",
  quick:  "Rápida",
};

const REVIEW_STATUS_LABELS = {
  pending:   "Pendente",
  completed: "Concluída",
  skipped:   "Ignorada",
};

let editingId    = null;
let _editingEvent = null;
let _onSave   = null;
let _historyRequestId = 0; // descarta respostas obsoletas se o evento editado mudar antes da resposta chegar
let _reviewRequestId  = 0; // mesmo padrão de _historyRequestId, para a seção de revisões
let _insightsRequestId = 0; // mesmo padrão, para os cards inteligentes (F3.5)

let eventModal         = null;
let eventForm          = null;
let formTitle          = null;
let formError          = null;
let eventIdField       = null;
let saveBtn            = null;
let startSessionBtn    = null;
let cancelBtn          = null;
let historySection     = null;
let historyEmpty       = null;
let historyList        = null;
let statsSection       = null;
let statTotal          = null;
let statCount          = null;
let statLast           = null;
let statLongest        = null;
let statAverage        = null;
let reviewSection      = null;
let generateReviewsBtn = null;
let reviewPendingList  = null;
let reviewPendingEmpty = null;
let reviewDoneList     = null;
let reviewDoneEmpty    = null;
let insightsEl         = null;
let fTitle             = null;
let fDate              = null;
let fStart             = null;
let fDuration          = null;
let fCategory          = null;
let fColor             = null;
let fLocation          = null;
let fDesc              = null;
let fReminder          = null;
let fReminderCustom    = null;
let reminderCustomWrap = null;
let fRecurrence        = null;
let fRecurrenceUntil   = null;
let fRecurrenceInterval = null;
let recurrenceExtra    = null;
let recurrenceCustom   = null;
let modal              = null;

export function initEventForm(onSave) {
  _onSave = onSave;

  eventModal          = document.getElementById("event-modal");
  eventForm           = document.getElementById("event-form");
  formTitle           = document.getElementById("form-title");
  formError           = document.getElementById("form-error");
  eventIdField        = document.getElementById("event-id");
  saveBtn             = document.getElementById("btn-save");
  startSessionBtn     = document.getElementById("btn-start-session");
  cancelBtn           = document.getElementById("btn-cancel");
  historySection      = document.getElementById("session-history");
  historyEmpty        = document.getElementById("session-history-empty");
  historyList         = document.getElementById("session-history-list");
  statsSection        = document.getElementById("session-stats");
  statTotal           = document.getElementById("stat-total");
  statCount           = document.getElementById("stat-count");
  statLast            = document.getElementById("stat-last");
  statLongest         = document.getElementById("stat-longest");
  statAverage         = document.getElementById("stat-average");
  reviewSection       = document.getElementById("review-section");
  generateReviewsBtn  = document.getElementById("btn-generate-reviews");
  reviewPendingList   = document.getElementById("review-pending-list");
  reviewPendingEmpty  = document.getElementById("review-pending-empty");
  reviewDoneList      = document.getElementById("review-done-list");
  reviewDoneEmpty     = document.getElementById("review-done-empty");
  insightsEl          = document.getElementById("event-insights");
  fTitle              = document.getElementById("f-title");
  fDate               = document.getElementById("f-date");
  fStart              = document.getElementById("f-start");
  fDuration           = document.getElementById("f-duration");
  fCategory           = document.getElementById("f-category");
  fColor              = document.getElementById("f-color");
  fLocation           = document.getElementById("f-location");
  fDesc               = document.getElementById("f-description");
  fReminder           = document.getElementById("f-reminder");
  fReminderCustom     = document.getElementById("f-reminder-custom");
  reminderCustomWrap  = document.getElementById("reminder-custom-wrap");
  fRecurrence         = document.getElementById("f-recurrence");
  fRecurrenceUntil    = document.getElementById("f-recurrence-until");
  fRecurrenceInterval = document.getElementById("f-recurrence-interval");
  recurrenceExtra     = document.getElementById("recurrence-extra");
  recurrenceCustom    = document.getElementById("recurrence-custom");

  if (eventModal) modal = initModal(eventModal, _handleModalClose);

  document.getElementById("event-modal-close")?.addEventListener("click", _handleModalClose);

  ["btn-new-event", "btn-new-event-cal", "btn-new-event-apt"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => openEventForm());
  });

  fReminder?.addEventListener("change", () => {
    reminderCustomWrap.hidden = fReminder.value !== "custom";
  });

  fRecurrence?.addEventListener("change", () => {
    const v = fRecurrence.value;
    recurrenceExtra.hidden  = v === "none";
    recurrenceCustom.hidden = v !== "custom";
  });

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("day-btn-active"));
  });

  cancelBtn?.addEventListener("click", _handleModalClose);

  startSessionBtn?.addEventListener("click", async () => {
    if (!_editingEvent) return;
    startSessionBtn.disabled = true;
    try {
      const started = await startSessionForEvent(_editingEvent);
      if (started) _handleModalClose();
    } finally {
      startSessionBtn.disabled = false;
    }
  });

  generateReviewsBtn?.addEventListener("click", async () => {
    if (!_editingEvent) return;
    generateReviewsBtn.disabled = true;
    try {
      await reviewService.generateForEvent(_editingEvent.id, _editingEvent.event_date);
      toast.success("Revisões geradas com sucesso.");
      await _loadReviews(_editingEvent.id);
    } catch (err) {
      const { friendly } = handleError(err, { context: "eventFormView.generateReviews", silent: true });
      toast.error(friendly);
    } finally {
      generateReviewsBtn.disabled = false;
    }
  });

  eventForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    if (!fTitle.value.trim()) { formError.textContent = "Título é obrigatório."; return; }
    if (!fDate.value)         { formError.textContent = "Data é obrigatória."; return; }
    if (!fStart.value)        { formError.textContent = "Hora de início é obrigatória."; return; }

    const recType = fRecurrence.value || "none";
    const fields = {
      title:                   fTitle.value.trim(),
      event_date:              fDate.value,
      start_time:              fStart.value || null,
      duration_minutes:        fDuration.value  ? parseInt(fDuration.value)  : null,
      category:                fCategory.value  || null,
      color:                   fColor.value     || null,
      location:                fLocation.value.trim()  || null,
      description:             fDesc.value.trim()      || null,
      reminder_minutes:        _reminderMinutes(),
      recurrence_type:         recType,
      recurrence_interval:     recType === "custom" ? (parseInt(fRecurrenceInterval.value) || 1) : null,
      recurrence_until:        recType !== "none"   ? (fRecurrenceUntil.value || null)            : null,
      recurrence_days_of_week: recType === "custom" ? (_getSelectedDays() || null)                : null,
    };

    saveBtn.disabled    = true;
    saveBtn.textContent = editingId ? "Atualizando…" : "Salvando…";

    try {
      if (editingId) {
        await updateEvent(editingId, fields);
        track(EVENTS.APPOINTMENT_EDITED, { title: fields.title });
        toast.success("Compromisso atualizado com sucesso.");
      } else {
        await createEvent(fields);
        track(EVENTS.APPOINTMENT_CREATED, { title: fields.title });
        toast.success("Compromisso salvo com sucesso.");
      }
      _clearForm();
      _closeEventModal();
      if (_onSave) await _onSave();
    } catch (err) {
      handleError(err, { context: editingId ? 'eventFormView.update' : 'eventFormView.create', silent: true });
      formError.textContent = err.message || "Não foi possível salvar. Tente novamente.";
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = editingId ? "Atualizar compromisso" : "Salvar compromisso";
    }
  });
}

export async function handleEventClick(ev) {
  const isRecurring = ev.recurrence_type && ev.recurrence_type !== "none";

  if (isRecurring) {
    const ok = await confirmDialog({
      title:       `"${ev.title}" é um evento recorrente.`,
      message:     'Isso editará toda a série. Deseja continuar?',
      confirmText: 'Continuar',
    });
    if (!ok) return;
  }

  const formEv = ev._isOccurrence
    ? { ...ev, id: ev._baseEventId, event_date: ev._baseEventDate }
    : ev;

  openEventForm(formEv);
}

export function openEventForm(ev) {
  if (ev) {
    _populateForm(ev);
  } else {
    _clearForm();
  }
  modal?.open(fTitle);
}

function _closeEventModal() {
  modal?.close();
}

function _handleModalClose() {
  _closeEventModal();
  _clearForm();
}

function _clearForm() {
  editingId      = null;
  _editingEvent  = null;
  startSessionBtn.hidden = true;
  _historyRequestId++; // invalida qualquer busca de histórico ainda em andamento
  historySection.hidden = true;
  historyList.innerHTML = "";
  historyEmpty.hidden = true;
  statsSection.hidden = true;
  _reviewRequestId++; // mesmo padrão, para a seção de revisões
  reviewSection.hidden = true;
  reviewPendingList.innerHTML = "";
  reviewDoneList.innerHTML = "";
  reviewPendingEmpty.hidden = true;
  reviewDoneEmpty.hidden = true;
  _insightsRequestId++; // mesmo padrão, para os cards inteligentes (F3.5)
  if (insightsEl) renderSmartCards(insightsEl, []);
  eventIdField.value = "";
  eventForm.reset();
  fColor.value              = "#3b82f6";
  fReminder.value           = "";
  reminderCustomWrap.hidden = true;
  fReminderCustom.value     = "";
  fRecurrence.value         = "none";
  fRecurrenceInterval.value = 1;
  fRecurrenceUntil.value    = "";
  recurrenceExtra.hidden    = true;
  recurrenceCustom.hidden   = true;
  _setSelectedDays("");
  formTitle.textContent = "Novo compromisso";
  saveBtn.textContent   = "Salvar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

function _populateForm(ev) {
  editingId             = ev.id;
  _editingEvent         = ev;
  startSessionBtn.hidden = false;
  historySection.hidden  = false;
  _loadSessionHistory(ev.id);
  reviewSection.hidden = false;
  _loadReviews(ev.id);
  _loadInsights(ev);
  eventIdField.value    = ev.id;
  fTitle.value          = ev.title           || "";
  fDate.value           = ev.event_date       || "";
  fStart.value          = ev.start_time       ? ev.start_time.slice(0, 5) : "";
  fDuration.value       = ev.duration_minutes || "";
  fCategory.value       = ev.category         || "";
  fColor.value          = ev.color            || "#3b82f6";
  fLocation.value       = ev.location         || "";
  fDesc.value           = ev.description      || "";
  _populateReminder(ev.reminder_minutes);
  fRecurrence.value         = ev.recurrence_type           || "none";
  fRecurrenceInterval.value = ev.recurrence_interval       || 1;
  fRecurrenceUntil.value    = ev.recurrence_until          || "";
  _setSelectedDays(ev.recurrence_days_of_week || "");
  fRecurrence.dispatchEvent(new Event("change"));
  formTitle.textContent = "Editar compromisso";
  saveBtn.textContent   = "Atualizar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

function _populateReminder(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") {
    fReminder.value           = "";
    reminderCustomWrap.hidden = true;
    fReminderCustom.value     = "";
  } else if (REMINDER_PRESETS.has(String(minutes))) {
    fReminder.value           = String(minutes);
    reminderCustomWrap.hidden = true;
    fReminderCustom.value     = "";
  } else {
    fReminder.value           = "custom";
    fReminderCustom.value     = String(minutes);
    reminderCustomWrap.hidden = false;
  }
}

function _reminderMinutes() {
  const v = fReminder.value;
  if (v === "")       return null;
  if (v === "custom") return parseInt(fReminderCustom.value) || null;
  return parseInt(v);
}

function _getSelectedDays() {
  return Array.from(document.querySelectorAll(".day-btn.day-btn-active"))
    .map(b => b.dataset.day)
    .join(",");
}

function _setSelectedDays(str) {
  const days = str ? str.split(",") : [];
  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.classList.toggle("day-btn-active", days.includes(btn.dataset.day));
  });
}

// ── Histórico de sessões do compromisso (F1.5) ──────────────────────────────
// Só busca as sessões do evento aberto (listByEvent já filtra por event_id +
// user_id e ordena started_at DESC no service) — nunca a lista inteira.

async function _loadSessionHistory(eventId) {
  const requestId = ++_historyRequestId;
  historyList.innerHTML = '<li class="session-history-loading">Carregando sessões…</li>';
  historyEmpty.hidden = true;
  statsSection.hidden = true;

  try {
    const sessions = await listByEvent(eventId);
    if (requestId !== _historyRequestId) return; // formulário mudou de evento antes da resposta chegar
    // Estatísticas (F1.6) reaproveitam a MESMA lista do histórico — nunca uma
    // segunda consulta.
    _renderSessionStats(sessions);
    _renderSessionHistory(sessions);
  } catch (err) {
    if (requestId !== _historyRequestId) return;
    const { friendly } = handleError(err, { context: "eventFormView.sessionHistory", silent: true });
    historyList.innerHTML = "";
    historyEmpty.hidden = false;
    historyEmpty.textContent = friendly;
    statsSection.hidden = true;
  }
}

// ── Estatísticas do compromisso (F1.6) ──────────────────────────────────────
// Cálculos puros vivem em activitySessionStats.js — esta função só formata
// e escreve no DOM. Sem gráficos, sem porcentagens, sem agregação global.

function _renderSessionStats(sessions) {
  const stats = computeSessionStats(sessions);

  if (stats.sessionCount === 0) {
    statsSection.hidden = true;
    return;
  }

  statsSection.hidden = false;
  statTotal.textContent   = _formatSessionDuration(stats.totalMinutes);
  statCount.textContent   = String(stats.sessionCount);
  statLast.textContent    = _formatRelativeMoment(stats.lastSession.started_at);
  statLongest.textContent = _formatSessionDuration(stats.longestSession.duration_minutes);
  statAverage.textContent = _formatSessionDuration(stats.averageMinutes);
}

function _renderSessionHistory(sessions) {
  historyList.innerHTML = "";

  if (!sessions.length) {
    historyEmpty.hidden = false;
    historyEmpty.textContent = "Nenhuma sessão registrada para este compromisso.";
    return;
  }
  historyEmpty.hidden = true;

  sessions.forEach(s => {
    const li = document.createElement("li");
    li.className = "session-history-item";
    li.innerHTML = `
      <div class="session-history-row">
        <span class="session-history-date">${_formatSessionDate(s.started_at)}</span>
        <span class="session-history-status session-history-status--${s.status}">${SESSION_STATUS_LABELS[s.status] || s.status}</span>
      </div>
      <div class="session-history-row session-history-meta">
        <span>${_formatSessionTime(s.started_at)} – ${_formatSessionTime(s.ended_at)}</span>
        <span>${_formatSessionDuration(s.duration_minutes)}</span>
        <span>${SESSION_SOURCE_LABELS[s.source] || s.source}</span>
      </div>
      ${s.notes ? `<p class="session-history-notes">${escapeHtml(s.notes)}</p>` : ""}
    `;
    historyList.appendChild(li);
  });
}

function _formatSessionDate(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _formatSessionTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatSessionDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Última sessão": Hoje/Ontem às HH:MM, ou a data por extenso se for mais antiga.
function _formatRelativeMoment(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const time = _formatSessionTime(iso);
  if (_isSameLocalDay(d, today))     return `Hoje às ${time}`;
  if (_isSameLocalDay(d, yesterday)) return `Ontem às ${time}`;
  return `${_formatSessionDate(iso)} às ${time}`;
}

// ── Revisões do compromisso (F2.3) ──────────────────────────────────────────
// Só infraestrutura: lista revisões futuras (pending) e concluídas
// (completed/skipped) do compromisso aberto. Sem recomendação, sem IA, sem
// notificação — apenas listar e permitir concluir/ignorar/gerar manualmente.

async function _loadReviews(eventId) {
  const requestId = ++_reviewRequestId;
  reviewPendingList.innerHTML = "";
  reviewDoneList.innerHTML = "";
  reviewPendingEmpty.hidden = true;
  reviewDoneEmpty.hidden = true;

  try {
    const reviews = await reviewService.list(eventId);
    if (requestId !== _reviewRequestId) return; // formulário mudou de evento antes da resposta chegar
    _renderReviews(reviews);
  } catch (err) {
    if (requestId !== _reviewRequestId) return;
    const { friendly } = handleError(err, { context: "eventFormView.loadReviews", silent: true });
    reviewPendingEmpty.hidden = false;
    reviewPendingEmpty.textContent = friendly;
    reviewDoneEmpty.hidden = true;
  }
}

function _renderReviews(reviews) {
  const pending = reviews.filter(r => r.status === "pending");
  const done    = reviews.filter(r => r.status !== "pending");

  reviewPendingList.innerHTML = "";
  if (!pending.length) {
    reviewPendingEmpty.hidden = false;
    reviewPendingEmpty.textContent = "Nenhuma revisão futura para este compromisso.";
  } else {
    reviewPendingEmpty.hidden = true;
    pending.forEach(r => reviewPendingList.appendChild(_buildReviewItem(r, true)));
  }

  reviewDoneList.innerHTML = "";
  if (!done.length) {
    reviewDoneEmpty.hidden = false;
    reviewDoneEmpty.textContent = "Nenhuma revisão concluída para este compromisso.";
  } else {
    reviewDoneEmpty.hidden = true;
    done.forEach(r => reviewDoneList.appendChild(_buildReviewItem(r, false)));
  }
}

// scheduled_date é uma DATE pura ("YYYY-MM-DD"), sem horário — usa localDate()
// (mesma função de utils.js usada em todo o app) para evitar o desvio de fuso
// horário de `new Date("YYYY-MM-DD")` (interpretado como UTC meia-noite).
function _formatReviewDate(dateStr) {
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _buildReviewItem(review, withActions) {
  const li = document.createElement("li");
  li.className = "session-history-item";
  li.innerHTML = `
    <div class="session-history-row">
      <span class="session-history-date">${_formatReviewDate(review.scheduled_date)}</span>
      <span class="review-status review-status--${review.status}">${REVIEW_STATUS_LABELS[review.status] || review.status}</span>
    </div>
    ${withActions ? `
      <div class="review-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-review-complete="${review.id}">Concluir</button>
        <button type="button" class="btn btn-ghost btn-sm" data-review-skip="${review.id}">Ignorar</button>
      </div>
    ` : ""}
  `;

  if (withActions) {
    li.querySelector("[data-review-complete]")?.addEventListener("click", () => _handleReviewAction(review, "complete"));
    li.querySelector("[data-review-skip]")?.addEventListener("click", () => _handleReviewAction(review, "skip"));
  }
  return li;
}

async function _handleReviewAction(review, action) {
  if (!_editingEvent) return;
  try {
    if (action === "complete") await reviewService.complete(review.id);
    else                       await reviewService.skip(review.id);
    await _loadReviews(_editingEvent.id);
  } catch (err) {
    const { friendly } = handleError(err, { context: `eventFormView.review.${action}`, silent: true });
    toast.error(friendly);
  }
}

// ── Cards inteligentes do compromisso (F3.5, ETAPA 5) ───────────────────────
// Reaproveita integralmente o Context Engine (aiContextService.getAIContext())
// já usado pelo painel de IA/planejamento/reflexão — nenhuma consulta nova é
// feita aqui, só leitura dos mesmos blocos (categorias, meta semanal) já
// consolidados. Nunca altera o compromisso: é só um resumo informativo.
async function _loadInsights(ev) {
  const requestId = ++_insightsRequestId;
  if (!insightsEl) return;
  renderSmartCards(insightsEl, []);

  try {
    const context = await getAIContext();
    if (requestId !== _insightsRequestId) return; // formulário mudou de evento antes da resposta chegar
    renderSmartCards(insightsEl, _buildEventInsightCards(ev, context));
  } catch (err) {
    if (requestId !== _insightsRequestId) return;
    handleError(err, { context: "eventFormView.insights", silent: true });
    renderSmartCards(insightsEl, []); // silencioso — o formulário continua totalmente utilizável
  }
}

function _buildEventInsightCards(ev, context) {
  const cards = [];

  const category = (context.categories || []).find(c => c.name === ev.category);
  if (category) {
    if (category.daysSinceLastStudy === null) {
      cards.push(buildSmartCard("dica", `Categoria ${ev.category} ainda sem sessões registradas.`));
    } else if (category.daysSinceLastStudy >= UNDERSTUDIED_DAYS) {
      cards.push(buildSmartCard("atencao", `Última sessão desta categoria há ${category.daysSinceLastStudy} dias.`));
    }
  }

  const weeklyGoal = context.execution?.weeklyGoal;
  if (weeklyGoal?.configured && weeklyGoal.state === "partial" && weeklyGoal.percentage >= GOAL_NEAR_MIN_PCT) {
    cards.push(buildSmartCard("meta", `Meta semanal quase atingida: ${weeklyGoal.percentage}%.`));
  }

  return cards;
}
