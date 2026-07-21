// ── todayView.js — Tela "Hoje", porta de entrada do app (F14.1) ─────────────
//
// Antes desta tela, o app sempre abria na Agenda — um calendário da semana,
// isto é, uma tela de administração — mesmo para quem só quer estudar (ver
// F14 AUDITORIA PX, §1/§7). "Hoje" responde direto a "o que eu faço agora":
// compromissos de hoje e um único caminho para começar (ou continuar) a
// estudar. Vira o destino inicial em navigationView.js/APP_PAGES — a Agenda
// continua existindo, intocada, como a segunda tela.
//
// Nenhuma regra de negócio nova: reaproveita activitySessionService.js
// (mesmas transições de studySessionView.js), o Decision Engine já usado por
// weekView.js/#wk-tip (no máximo 1 card — auditoria F14 §5/§6) e
// startSessionForEvent()/openStartModal() já expostos por studySessionView.js.

import { getEventsByRange, getEventById } from "./eventService.js";
import { expandEvents } from "./recurrence.js";
import { isPersonalVisible } from "./academicCalendarView.js";
import { getActiveSession, listSessions, startSession } from "./activitySessionService.js";
import { startSessionForEvent, openStartModal } from "./studySessionView.js";
import { showPage } from "./navigationView.js";
import { getDecisions, filterSpontaneousDecisions } from "./decisionEngine.js";
import { renderSmartCards, decisionToCard } from "./smartCardView.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import { getDayRecap, setNextStudyPlan } from "./closeDayService.js";
import { initModal } from "./modalController.js";
import { toast } from "./toastService.js";
import { handleError } from "./errorService.js";
import { escapeHtml, isoToday, formatDuration } from "./utils.js";

let tipEl, resumeBtn, startBtn, continueBtn, apptListEl, apptEmptyEl;
let closeDayBtn, closeDayModalEl, closeDayModal;
let cdMinutesEl, cdSessionsEl, cdQuestionsEl, cdStreakEl, cdNextStudyEl, cdBtnBack, cdBtnConfirm;
let _bound = false; // AUD-005: a página não é reconstruída entre logins na mesma sessão do app — sem esta guarda, cada login empilharia mais um listener nos mesmos botões
let _unsubscribers = [];
let _continueSuggestion = null; // { title, category_id, event } | null — ver _loadContinueSuggestion()
let _closingDay = false;

export async function initTodayView() {
  tipEl       = document.getElementById("today-tip");
  resumeBtn   = document.getElementById("today-btn-resume");
  startBtn    = document.getElementById("today-btn-start");
  continueBtn = document.getElementById("today-btn-continue");
  apptListEl  = document.getElementById("today-appointments-list");
  apptEmptyEl = document.getElementById("today-appointments-empty");
  if (!resumeBtn) return;

  closeDayBtn      = document.getElementById("today-btn-close-day");
  closeDayModalEl  = document.getElementById("close-day-modal");
  cdMinutesEl      = document.getElementById("cd-minutes");
  cdSessionsEl     = document.getElementById("cd-sessions");
  cdQuestionsEl    = document.getElementById("cd-questions");
  cdStreakEl       = document.getElementById("cd-streak");
  cdNextStudyEl    = document.getElementById("cd-next-study");
  cdBtnBack        = document.getElementById("cd-btn-back");
  cdBtnConfirm     = document.getElementById("cd-btn-confirm");

  if (!_bound) {
    _bound = true;
    resumeBtn.addEventListener("click", () => showPage("study-session"));
    startBtn.addEventListener("click", () => {
      showPage("study-session");
      openStartModal();
    });
    continueBtn.addEventListener("click", () => _handleContinue());

    closeDayModal = initModal(closeDayModalEl, _closeCloseDayModal);
    closeDayBtn.addEventListener("click", () => _openCloseDayModal());
    cdBtnBack.addEventListener("click", () => _closeCloseDayModal());
    cdBtnConfirm.addEventListener("click", () => _confirmCloseDay());
  }

  if (_unsubscribers.length === 0) {
    _unsubscribers = [
      subscribe(SESSION_EVENTS.STARTED,   _refreshHero),
      subscribe(SESSION_EVENTS.FINISHED,  _refreshHero),
      subscribe(SESSION_EVENTS.CANCELLED, _refreshHero),
      subscribe(SESSION_EVENTS.PAUSED,    _refreshHero),
      subscribe(SESSION_EVENTS.RESUMED,   _refreshHero),
    ];
  }

  await refreshTodayView();
}

export async function refreshTodayView() {
  await Promise.all([_refreshHero(), _refreshAppointments(), _refreshTip()]);
}

// ── Hero: sessão ativa > "Começar a estudar" (+ "Continuar: {título}") ──────

async function _refreshHero() {
  if (!resumeBtn) return;

  let active = null;
  try {
    active = await getActiveSession();
  } catch (err) {
    handleError(err, { context: "todayView.getActiveSession", silent: true });
  }

  if (active) {
    resumeBtn.hidden   = false;
    startBtn.hidden    = true;
    continueBtn.hidden = true;
    closeDayBtn.hidden = true; // fechar o dia não faz sentido com uma sessão em andamento
    return;
  }

  resumeBtn.hidden   = true;
  startBtn.hidden    = false;
  closeDayBtn.hidden = false;

  _continueSuggestion = await _loadContinueSuggestion();
  if (_continueSuggestion) {
    continueBtn.hidden     = false;
    continueBtn.textContent = `Continuar: ${_continueSuggestion.title}`;
  } else {
    continueBtn.hidden = true;
  }
}

// Sugestão de retomada (F14.1, §1: "não existe retomar") — a última sessão
// concluída, resolvendo o título do mesmo jeito que
// studySessionView.js/_resolveEventMeta(): compromisso vinculado (se ainda
// existir) ou o nome digitado numa sessão avulsa. O evento resolvido fica
// guardado inteiro: continuar uma sessão de compromisso deve recriar uma
// sessão de compromisso (F15.7), não uma avulsa com o mesmo nome.
async function _loadContinueSuggestion() {
  try {
    const { sessions } = await listSessions({ status: "finished", limit: 1 });
    const last = sessions[0];
    if (!last) return null;

    let title = last.title || null;
    let event = null;
    if (last.event_id) {
      event = await getEventById(last.event_id).catch(() => null);
      title = event?.title || null;
    }
    if (!title) return null;

    return { title, category_id: last.category_id || null, event };
  } catch (err) {
    handleError(err, { context: "todayView.loadContinueSuggestion", silent: true });
    return null;
  }
}

async function _handleContinue() {
  if (!_continueSuggestion) return;
  continueBtn.disabled = true;
  try {
    // F15.7 — sessão de compromisso continua como sessão de compromisso:
    // startSessionForEvent() preserva event_id, categoria herdada e a barra
    // de progresso temporal. O caminho manual fica só para sessões avulsas
    // (ou compromisso já excluído, quando resta apenas o título).
    if (_continueSuggestion.event) {
      const started = await startSessionForEvent(_continueSuggestion.event);
      if (started) showPage("study-session");
      return;
    }
    await startSession({
      source:      "manual",
      title:       _continueSuggestion.title,
      category_id: _continueSuggestion.category_id,
    });
    showPage("study-session");
  } catch (err) {
    handleError(err, { context: "todayView.continue" });
  } finally {
    continueBtn.disabled = false;
  }
}

// ── Compromissos de hoje ─────────────────────────────────────────────────

async function _refreshAppointments() {
  if (!apptListEl) return;
  apptListEl.innerHTML = "";
  try {
    const today = isoToday();
    const raw = isPersonalVisible() ? await getEventsByRange(today, today) : [];
    const events = expandEvents(raw, today, today)
      .filter(ev => ev.start_time)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    apptEmptyEl.hidden = events.length > 0;
    events.forEach(ev => apptListEl.appendChild(_buildApptItem(ev)));
  } catch (err) {
    handleError(err, { context: "todayView.appointments", silent: true });
    apptEmptyEl.hidden = false;
  }
}

function _buildApptItem(ev) {
  const li = document.createElement("li");
  li.className = "today-appt-item";
  li.innerHTML = `
    <span class="today-appt-time">${ev.start_time.slice(0, 5)}</span>
    <span class="today-appt-title">${escapeHtml(ev.title)}</span>
    <button type="button" class="btn btn-sm btn-secondary today-appt-start">Iniciar sessão</button>
  `;
  li.querySelector(".today-appt-start").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const started = await startSessionForEvent(ev);
      if (started) showPage("study-session");
    } finally {
      btn.disabled = false;
    }
  });
  return li;
}

// ── Dica contextual (no máximo 1 card, só se acionável) ──────────────────
// Mesma leitura do Decision Engine que weekView.js/loadTip() — nenhuma regra
// nova, só reaproveitada aqui para que a chegada nunca abra sem nenhuma
// orientação, mas também nunca com mais de um card (auditoria F14 §5) e nunca
// com um card crítico-passivo (auditoria F14.6): filterSpontaneousDecisions()
// só deixa passar revisão pendente e compromisso atrasado — o resto continua
// disponível via getDecisions() para o painel de IA, sob demanda.

async function _refreshTip() {
  if (!tipEl) return;

  let decisions = [];
  try {
    const result = await getDecisions();
    decisions = result.decisions;
  } catch (err) {
    handleError(err, { context: "todayView.tip", silent: true });
  }

  const todayISO = isoToday();
  const spontaneous = filterSpontaneousDecisions(decisions);
  const todayDecision = spontaneous.find(d => d.origem === "planning" && d.acaoSugerida?.dataSugerida === todayISO);
  const decision = todayDecision || spontaneous[0] || null;
  renderSmartCards(tipEl, decision ? [decisionToCard(decision)] : []);
}

// ── Fechar o dia (F14.8) ──────────────────────────────────────────────────
// O dia nunca tinha desfecho (auditoria F14 §7/§13): a última sessão
// terminava e nada dizia "pronto, seu dia está encerrado". Este modal cobre
// as duas metades desse fechamento — um recap de 15 segundos (nenhum
// cálculo novo, ver closeDayService.getDayRecap()) e um único campo
// opcional para o primeiro estudo de amanhã, que reaparece como chip no
// próximo início de sessão (studySessionView.js/_loadStartSuggestions lê o
// mesmo closeDayService.getNextStudyPlan()).

async function _openCloseDayModal() {
  if (_closingDay) return;

  cdMinutesEl.textContent   = "—";
  cdSessionsEl.textContent  = "—";
  cdQuestionsEl.textContent = "—";
  cdStreakEl.textContent    = "—";
  cdNextStudyEl.value       = "";
  cdBtnConfirm.disabled     = false;

  closeDayModal.open(cdNextStudyEl);

  try {
    const recap = await getDayRecap();
    cdMinutesEl.textContent   = formatDuration(recap.minutes);
    cdSessionsEl.textContent  = String(recap.sessionsCount);
    cdQuestionsEl.textContent = String(recap.questionsCount);
    cdStreakEl.textContent    = recap.currentStreak === 1 ? "1 dia" : `${recap.currentStreak} dias`;
  } catch (err) {
    handleError(err, { context: "todayView.closeDayRecap", silent: true });
  }
}

function _closeCloseDayModal() {
  closeDayModal.close();
}

async function _confirmCloseDay() {
  if (_closingDay) return;
  _closingDay = true;
  cdBtnConfirm.disabled = true;
  try {
    await setNextStudyPlan({ title: cdNextStudyEl.value });
    _closeCloseDayModal();
    toast.success("Dia encerrado. Até amanhã!");
  } catch (err) {
    handleError(err, { context: "todayView.confirmCloseDay" });
  } finally {
    _closingDay = false;
    cdBtnConfirm.disabled = false;
  }
}

// Chamado no logout (ver script.js) — mesma simetria init/reset dos demais
// subsistemas (auditoria A1.3): nenhuma sugestão/assinatura do usuário
// anterior pode sobreviver à troca de sessão.
export function resetTodayView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  _continueSuggestion = null;
}
