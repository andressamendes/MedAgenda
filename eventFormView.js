// ── eventFormView.js — Modal de criação e edição de compromissos ─────────────

import { createEvent, updateEvent, deleteEvent } from "./eventService.js";
import { listByEvent } from "./activitySessionService.js";
import { computeSessionStats } from "./activitySessionStats.js";
import { confirmDialog } from "./confirmDialog.js";
import { track, EVENTS } from "./telemetryService.js";
import { toast } from "./toastService.js";
import { initModal, bindModalBehavior, captureFocus, restoreFocus } from "./modalController.js";
import { handleError } from "./errorService.js";
import { startSessionForEvent } from "./studySessionView.js";
import { showPage } from "./navigationView.js";
import { getAIContext } from "./aiContextService.js";
import { renderSmartCards, buildSmartCard } from "./smartCardView.js";
import { categoryColor } from "./categoryView.js";
import { revealWithAnimation } from "./transitionUtils.js";
import { pad, escapeHtml, isoToday } from "./utils.js";
import { openQuickAdd } from "./quickAdd.js";

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

let editingId    = null;
let _editingEvent = null;
let _onSave   = null;
let _historyRequestId = 0; // descarta respostas obsoletas se o evento editado mudar antes da resposta chegar
let _insightsRequestId = 0; // mesmo padrão, para os cards inteligentes (F3.5)
// Identifica qual edição está "ao vivo" no formulário — incrementado toda vez
// que o formulário passa a representar uma edição diferente (nova abertura,
// reset, fechamento). Um salvamento em andamento captura o valor no início e
// só limpa/fecha o formulário ao terminar se ele ainda corresponder à MESMA
// edição — do contrário o usuário já cancelou e passou para outro
// compromisso, e o salvamento tardio não pode sobrescrever a digitação nem
// fechar um modal que não é mais o dele (BUG 02 / BUG 03).
let _formGeneration = 0;

let eventModal         = null;
let eventForm          = null;
let formTitle          = null;
let formError          = null;
let eventIdField       = null;
let saveBtn            = null;
let startSessionBtn    = null;
let cancelBtn          = null;
let deleteBtn           = null;
let historySection     = null;
let historyToggle      = null;
let historyBody        = null;
let historyEmpty       = null;
let historyList        = null;
let statsSection       = null;
let statTotal          = null;
let statCount          = null;
let statLast           = null;
let statLongest        = null;
let statAverage        = null;
let insightsEl         = null;
let fTitle             = null;
let fDate              = null;
let fStart             = null;
let fDuration          = null;
let fCategory          = null;
let fColor             = null;
let fColorToggle       = null;
let fColorWrap         = null;
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
let recurrenceToggleBtn = null;
let recurrenceWrap     = null;
let modal              = null;

// Painel "Histórico e estatísticas" (F13.4) — event-insights/session-history
// saíram do corpo do modal de edição para este painel lateral sob demanda,
// mesmo padrão de abrir/fechar/Focus Trap/Escape de #ai-panel (aiPanelView.js).
let eventDetailOverlay = null;
let eventDetailPanel   = null;
let eventDetailClose   = null;
let eventDetailTrigger = null;
let _eventDetailPrevFocus = null;

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
  deleteBtn           = document.getElementById("btn-delete-event");
  historySection      = document.getElementById("session-history");
  historyToggle       = document.getElementById("session-history-toggle");
  historyBody         = document.getElementById("session-history-body");
  historyEmpty        = document.getElementById("session-history-empty");
  historyList         = document.getElementById("session-history-list");
  statsSection        = document.getElementById("session-stats");
  statTotal           = document.getElementById("stat-total");
  statCount           = document.getElementById("stat-count");
  statLast            = document.getElementById("stat-last");
  statLongest         = document.getElementById("stat-longest");
  statAverage         = document.getElementById("stat-average");
  insightsEl          = document.getElementById("event-insights");
  fTitle              = document.getElementById("f-title");
  fDate               = document.getElementById("f-date");
  fStart              = document.getElementById("f-start");
  fDuration           = document.getElementById("f-duration");
  fCategory           = document.getElementById("f-category");
  fColor              = document.getElementById("f-color");
  fColorToggle        = document.getElementById("f-color-toggle");
  fColorWrap          = document.getElementById("f-color-wrap");
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
  recurrenceToggleBtn = document.getElementById("btn-recurrence-toggle");
  recurrenceWrap      = document.getElementById("f-recurrence-wrap");

  eventDetailOverlay  = document.getElementById("event-detail-overlay");
  eventDetailPanel    = document.getElementById("event-detail-panel");
  eventDetailClose    = document.getElementById("event-detail-close");
  eventDetailTrigger  = document.getElementById("event-detail-trigger");

  if (eventModal) modal = initModal(eventModal, _handleModalClose);

  document.getElementById("event-modal-close")?.addEventListener("click", _handleModalClose);

  eventDetailTrigger?.addEventListener("click", () => _openEventDetailPanel());
  eventDetailClose?.addEventListener("click", () => _closeEventDetailPanel());
  if (eventDetailOverlay && eventDetailPanel) {
    bindModalBehavior(eventDetailOverlay, () => !eventDetailPanel.hidden, _closeEventDetailPanel, eventDetailPanel);
  }

  // F15.6 (auditoria M7) — a ação de criação mais visível abre o QuickAdd
  // (título + hora + Enter), não o formulário completo de 10+ campos. A data
  // nasce em hoje e é editável dentro do próprio QuickAdd; "Mais opções"
  // continua levando ao formulário completo pré-preenchido.
  document.getElementById("btn-new-event")?.addEventListener("click", () =>
    openQuickAdd(isoToday(), _onSave, "", openEventFormPrefilled, { editableDate: true }));

  fReminder?.addEventListener("change", () => {
    reminderCustomWrap.hidden = fReminder.value !== "custom";
  });

  fRecurrence?.addEventListener("change", () => {
    const v = fRecurrence.value;
    recurrenceExtra.hidden  = v === "none";
    recurrenceCustom.hidden = v !== "custom";
  });

  // Auditoria UX F10 #1.1: repetição nasce escondida atrás de um toggle —
  // a maioria dos compromissos não é recorrente, então o select não precisa
  // ocupar espaço/atenção por padrão (mesmo princípio de progressive
  // disclosure já aplicado ao histórico de sessões abaixo).
  recurrenceToggleBtn?.addEventListener("click", () => _showRecurrenceField({ focus: true }));

  // F11 E10 — a cor segue a categoria por padrão (ver categoryView.js/
  // fCategory "change"); perguntar a cor em todo cadastro era uma decisão a
  // mais sem necessidade. O picker continua acessível, só escondido atrás de
  // "Mais opções" (mesmo padrão de disclosure de studySessionView.js/E8).
  fColorToggle?.addEventListener("click", () => {
    const expand = fColorWrap.hidden;
    fColorWrap.hidden = !expand;
    fColorToggle.setAttribute("aria-expanded", String(expand));
    const label = fColorToggle.querySelector(".disclosure-label");
    if (label) label.textContent = expand ? "Ocultar" : "Mostrar";
    if (expand) revealWithAnimation(fColorWrap);
  });

  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("day-btn-active"));
  });

  cancelBtn?.addEventListener("click", _handleModalClose);

  // Auditoria UX #26: estatísticas/histórico de sessões colapsados por
  // padrão — mesmo padrão aria-expanded + hidden já usado no encerramento
  // de sessão (studySessionView.js/_setSectionExpanded) e no Diário
  // (studyJournalView.js/_toggleEntry).
  historyToggle?.addEventListener("click", () => {
    const expand = historyBody.hidden;
    historyBody.hidden = !expand;
    historyToggle.setAttribute("aria-expanded", String(expand));
    const label = historyToggle.querySelector(".disclosure-label");
    if (label) label.textContent = expand ? "Ocultar histórico deste compromisso" : "Mostrar histórico deste compromisso";
  });

  // Auditoria UX #12: excluir só existia na página "Compromissos" — o
  // usuário tinha que fechar o modal de edição e reencontrar o item na
  // lista. Mesmo fluxo de confirmação/exclusão já usado lá (script.js/
  // handleDelete).
  deleteBtn?.addEventListener("click", async () => {
    if (!editingId) return;
    const isRecurring = _editingEvent?.recurrence_type && _editingEvent.recurrence_type !== "none";
    const ok = await confirmDialog({
      title:   "Excluir compromisso",
      message: isRecurring
        ? "Este é um evento recorrente. Isso excluirá toda a série. Deseja continuar?"
        : "Tem certeza que deseja excluir este compromisso?",
      danger:  true,
    });
    if (!ok) return;

    const generation = _formGeneration;
    deleteBtn.disabled = true;
    try {
      await deleteEvent(editingId);
      track(EVENTS.APPOINTMENT_DELETED);
      toast.success("Compromisso excluído.");
      if (generation === _formGeneration) {
        _clearForm();
        _closeEventModal();
      }
      if (_onSave) await _onSave();
    } catch (err) {
      const { friendly } = handleError(err, { context: "eventFormView.delete", silent: true, fallbackMessage: "Não foi possível excluir. Tente novamente." });
      toast.error(friendly);
    } finally {
      deleteBtn.disabled = false;
    }
  });

  startSessionBtn?.addEventListener("click", async () => {
    if (!_editingEvent) return;
    startSessionBtn.disabled = true;
    try {
      const started = await startSessionForEvent(_editingEvent);
      if (started) {
        _handleModalClose();
        showPage("study-session");
      }
    } finally {
      startSessionBtn.disabled = false;
    }
  });

  eventForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    if (!fTitle.value.trim()) { formError.textContent = "Título é obrigatório."; return; }
    if (!fDate.value)         { formError.textContent = "Data é obrigatória."; return; }
    if (!fStart.value)        { formError.textContent = "Hora de início é obrigatória."; return; }

    // Identifica a edição atual antes de qualquer `await` — se o usuário
    // cancelar e abrir outro compromisso enquanto este salvamento ainda está
    // em rede, a resposta tardia não pode limpar/fechar o formulário que
    // agora pertence a outra edição (BUG 02/03).
    const generation   = _formGeneration;
    const wasEditingId = editingId;

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
    saveBtn.textContent = wasEditingId ? "Atualizando…" : "Salvando…";

    try {
      if (wasEditingId) {
        await updateEvent(wasEditingId, fields);
        track(EVENTS.APPOINTMENT_EDITED, { title: fields.title });
        toast.success("Compromisso atualizado com sucesso.");
      } else {
        await createEvent(fields);
        track(EVENTS.APPOINTMENT_CREATED, { title: fields.title });
        toast.success("Compromisso salvo com sucesso.");
      }
      if (generation === _formGeneration) {
        _clearForm();
        _closeEventModal();
      }
      if (_onSave) await _onSave();
    } catch (err) {
      const { friendly } = handleError(err, { context: wasEditingId ? 'eventFormView.update' : 'eventFormView.create', silent: true, fallbackMessage: "Não foi possível salvar. Tente novamente." });
      if (generation === _formGeneration) {
        formError.textContent = friendly;
      }
    } finally {
      if (generation === _formGeneration) {
        saveBtn.disabled    = false;
        saveBtn.textContent = editingId ? "Atualizar compromisso" : "Salvar compromisso";
      }
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

/**
 * Abre o formulário completo já preenchido com o que foi digitado no
 * QuickAdd (F11 E16, auditoria #20) — "Mais opções" a partir do QuickAdd.
 * Continua um cadastro NOVO (nunca uma edição): _clearForm() já cobre
 * todo o resto do estado (categoria, lembrete, recorrência etc.), só os três
 * campos já preenchidos no QuickAdd são sobrescritos por cima do reset.
 */
export function openEventFormPrefilled({ title = "", event_date = "", start_time = "" } = {}) {
  _clearForm();
  fTitle.value = title;
  fDate.value  = event_date;
  fStart.value = start_time;
  modal?.open(fDuration);
}

function _closeEventModal() {
  modal?.close();
  // Evita um overlay órfão: fechar o formulário de edição sempre fecha
  // também o painel de histórico/estatísticas, se estiver aberto.
  if (eventDetailPanel && !eventDetailPanel.hidden) _closeEventDetailPanel();
}

function _handleModalClose() {
  _closeEventModal();
  _clearForm();
}

// Painel "Histórico e estatísticas" (F13.4) — mesma estrutura de abrir/fechar
// de #ai-panel (aiPanelView.js): captura/restaura foco, mostra painel +
// overlay juntos; Escape/clique-fora/Focus Trap vêm de bindModalBehavior()
// (ligado uma única vez em initEventForm()).
function _openEventDetailPanel() {
  if (!eventDetailPanel || !eventDetailOverlay) return;
  _eventDetailPrevFocus = captureFocus();
  eventDetailPanel.hidden = false;
  eventDetailOverlay.hidden = false;
  eventDetailPanel.removeAttribute("aria-hidden");
  eventDetailOverlay.removeAttribute("aria-hidden");
  eventDetailClose?.focus();
}

function _closeEventDetailPanel() {
  if (!eventDetailPanel || !eventDetailOverlay) return;
  eventDetailPanel.hidden = true;
  eventDetailOverlay.hidden = true;
  eventDetailPanel.setAttribute("aria-hidden", "true");
  eventDetailOverlay.setAttribute("aria-hidden", "true");
  restoreFocus(_eventDetailPrevFocus);
  _eventDetailPrevFocus = null;
}

/**
 * Chamado no logout/troca de usuário (ver script.js) — sem isso, um modal
 * deixado aberto (ou o `editingId`/`_editingEvent` de uma edição em curso)
 * sobreviveria à troca de sessão e vazaria para o próximo usuário.
 */
export function resetEventForm() {
  _closeEventModal();
  _clearForm();
}

function _setColorFieldExpanded(expand) {
  fColorWrap.hidden = !expand;
  fColorToggle.setAttribute("aria-expanded", String(expand));
  const label = fColorToggle.querySelector(".disclosure-label");
  if (label) label.textContent = expand ? "Ocultar" : "Mostrar";
}

function _clearForm() {
  _formGeneration++;
  editingId      = null;
  _editingEvent  = null;
  startSessionBtn.hidden = true;
  deleteBtn.hidden        = true;
  _historyRequestId++; // invalida qualquer busca de histórico ainda em andamento
  eventDetailTrigger.hidden = true;
  if (eventDetailPanel && !eventDetailPanel.hidden) _closeEventDetailPanel();
  historySection.hidden = true;
  historyBody.hidden = true;
  historyToggle.setAttribute("aria-expanded", "false");
  const historyLabel = historyToggle.querySelector(".disclosure-label");
  if (historyLabel) historyLabel.textContent = "Mostrar histórico deste compromisso";
  historyList.innerHTML = "";
  historyEmpty.hidden = true;
  statsSection.hidden = true;
  _insightsRequestId++; // mesmo padrão, para os cards inteligentes (F3.5)
  if (insightsEl) renderSmartCards(insightsEl, []);
  eventIdField.value = "";
  eventForm.reset();
  fColor.value              = "#3b82f6";
  _setColorFieldExpanded(false);
  fReminder.value           = "";
  reminderCustomWrap.hidden = true;
  fReminderCustom.value     = "";
  fRecurrence.value         = "none";
  fRecurrenceInterval.value = 1;
  fRecurrenceUntil.value    = "";
  recurrenceExtra.hidden    = true;
  recurrenceCustom.hidden   = true;
  recurrenceWrap.hidden       = true;
  recurrenceToggleBtn.hidden  = false;
  _setSelectedDays("");
  formTitle.textContent = "Novo compromisso";
  saveBtn.disabled       = false;
  saveBtn.textContent   = "Salvar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

function _populateForm(ev) {
  _formGeneration++;
  editingId             = ev.id;
  _editingEvent         = ev;
  startSessionBtn.hidden = false;
  deleteBtn.hidden        = false;
  eventDetailTrigger.hidden = false;
  historySection.hidden  = false;
  _loadSessionHistory(ev.id);
  _loadInsights(ev);
  eventIdField.value    = ev.id;
  fTitle.value          = ev.title           || "";
  fDate.value           = ev.event_date       || "";
  fStart.value          = ev.start_time       ? ev.start_time.slice(0, 5) : "";
  fDuration.value       = ev.duration_minutes || "";
  fCategory.value       = ev.category         || "";
  fColor.value          = ev.color            || "#3b82f6";
  // Evento antigo com cor personalizada (diferente da cor atual da
  // categoria) já nasce com "Mais opções" aberto, para que a personalização
  // existente não fique escondida sem o usuário saber que ela está lá.
  const inheritedColor = ev.category ? categoryColor(ev.category) : null;
  _setColorFieldExpanded(!!ev.color && ev.color !== inheritedColor);
  fLocation.value       = ev.location         || "";
  fDesc.value           = ev.description      || "";
  _populateReminder(ev.reminder_minutes);
  fRecurrence.value         = ev.recurrence_type           || "none";
  fRecurrenceInterval.value = ev.recurrence_interval       || 1;
  fRecurrenceUntil.value    = ev.recurrence_until          || "";
  _setSelectedDays(ev.recurrence_days_of_week || "");
  if (fRecurrence.value !== "none") _showRecurrenceField();
  fRecurrence.dispatchEvent(new Event("change"));
  formTitle.textContent = "Editar compromisso";
  saveBtn.disabled       = false;
  saveBtn.textContent   = "Atualizar compromisso";
  cancelBtn.hidden      = false;
  formError.textContent = "";
}

function _showRecurrenceField({ focus = false } = {}) {
  recurrenceWrap.hidden      = false;
  recurrenceToggleBtn.hidden = true;
  if (focus) fRecurrence.focus();
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
