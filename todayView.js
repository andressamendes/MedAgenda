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
import { iconAlertTriangle } from "./icons.js";
import { getDecisions, filterSpontaneousDecisions } from "./decisionEngine.js";
import { renderSmartCards, decisionToCard } from "./smartCardView.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import { getDayRecap, setNextStudyPlan } from "./closeDayService.js";
import { getProfile } from "./profileService.js";
import { getDashboardData } from "./activityDashboardService.js";
import { setTodayStatsAnchor } from "./activityDashboardView.js";
import { formatGoalSentence } from "./timeGoals.js";
import { initModal } from "./modalController.js";
import { toast } from "./toastService.js";
import { handleError } from "./errorService.js";
import { categoryColor } from "./categoryView.js";
import { escapeHtml, isoToday, formatDuration } from "./utils.js";

let greetingTextEl, greetingDateEl, heroProgressEl, tipEl, resumeBtn, startBtn, continueBtn, apptListEl, apptEmptyEl;
let closeDayBtn, closeDayModalEl, closeDayModal;
let cdMinutesEl, cdSessionsEl, cdQuestionsEl, cdStreakEl, cdNextStudyEl, cdBtnBack, cdBtnConfirm;
let _bound = false; // AUD-005: a página não é reconstruída entre logins na mesma sessão do app — sem esta guarda, cada login empilharia mais um listener nos mesmos botões
let _unsubscribers = [];
let _continueSuggestion = null; // { title, category_id, event } | null — ver _loadContinueSuggestion()
let _closingDay = false;
let _apptItemsCache = []; // [{ ev, li }] da última _refreshAppointments — reclassificado a cada minuto sem refazer a consulta (F14 hierarquia temporal)
let _apptStateTimer = null;

export async function initTodayView() {
  greetingTextEl = document.getElementById("today-greeting-text");
  greetingDateEl = document.getElementById("today-greeting-date");
  heroProgressEl = document.getElementById("today-hero-progress");
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

  // "Agora" muda ao longo do dia — reclassifica passado/próximo a cada minuto
  // sem refazer a consulta (só troca classes nos <li> já montados).
  if (!_apptStateTimer) {
    _apptStateTimer = setInterval(_applyApptTemporalStates, 60000);
    _apptStateTimer.unref?.(); // não deve manter o processo (ou os testes) vivo sozinho
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
  await Promise.all([_refreshGreeting(), _refreshHero(), _refreshAppointments(), _refreshTip()]);
}

// ── Cabeçalho vivo: saudação por horário + nome do usuário + data por
// extenso (Etapa 1, diagnóstico #1 — ausência de acolhimento na chegada). Só
// leitura (getProfile()), nenhum dado novo: mesmo full_name que
// accountView.js já exibe em "Minha Conta". Sem perfil ou sem full_name
// preenchido, a saudação fica sem nome ("Bom dia" em vez de "Bom dia, ").
function _greetingByHour(hour) {
  if (hour < 5)  return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function _refreshGreeting() {
  if (!greetingTextEl) return;

  const now = new Date();
  const greeting = _greetingByHour(now.getHours());

  let firstName = "";
  try {
    const profile = await getProfile();
    firstName = (profile?.full_name || "").trim().split(/\s+/)[0] || "";
  } catch (err) {
    handleError(err, { context: "todayView.greetingProfile", silent: true });
  }

  greetingTextEl.textContent = firstName ? `${greeting}, ${firstName}` : greeting;

  const dateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  greetingDateEl.textContent = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
}

// ── Hero: sessão ativa > "Começar a estudar" (+ "Continuar: {título}") ──────

async function _refreshHero() {
  if (!resumeBtn) return;

  _refreshHeroProgress();

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
    closeDayBtn.closest(".today-close-day")?.classList.remove("today-close-day--goal-met");
    return;
  }

  resumeBtn.hidden   = true;
  startBtn.hidden    = false;
  closeDayBtn.hidden = false;
  _refreshCloseDayGoalState();

  _continueSuggestion = await _loadContinueSuggestion();
  if (_continueSuggestion) {
    continueBtn.hidden     = false;
    continueBtn.textContent = `Continuar: ${_continueSuggestion.title}`;
  } else {
    continueBtn.hidden = true;
  }
}

// Etapa 2 (auditoria UX #2) — frase de progresso sempre visível no hero, sem
// exigir o clique no disclosure "Ver números de hoje". Mesmo dado de
// activityDashboardService.getDashboardData() -> dailyGoal já usado pelo
// card "Meta diária" (activityDashboardView.js) — nenhum cálculo novo, só
// uma segunda leitura em frase (formatGoalSentence(), timeGoals.js).
//
// Etapa 19 (auditoria UX/UI V2 #6) — a mesma leitura também alimenta o
// valor-âncora do rótulo do disclosure "Ver números de hoje"
// (setTodayStatsAnchor(), activityDashboardView.js): mesmo actualMinutes,
// nenhuma chamada de rede extra. Telegráfico ("45min"), não a frase inteira
// do hero — o disclosure continua escondendo o detalhe completo até o clique.
async function _refreshHeroProgress() {
  if (!heroProgressEl) return;
  try {
    const data = await getDashboardData();
    heroProgressEl.textContent = formatGoalSentence(data.dailyGoal);
    setTodayStatsAnchor(data.dailyGoal.actualMinutes > 0 ? formatDuration(data.dailyGoal.actualMinutes) : "");
  } catch (err) {
    handleError(err, { context: "todayView.refreshHeroProgress", silent: true });
    heroProgressEl.textContent = "";
    setTodayStatsAnchor("");
  }
}

// Etapa 10 (auditoria UX/UI de Hoje) — reforço visual condicional de "Fechar
// o dia": reaproveita o mesmo dailyGoal já calculado por
// activityDashboardService.js/getDashboardData() (Etapa 2, seção "Hoje em
// números") para saber se a meta diária foi atingida hoje, sem nenhum
// cálculo de meta novo. Só liga a variante em achieved/exceeded — dias sem
// meta configurada ou ainda em andamento (partial) mantêm o botão neutro,
// para o tom nunca soar punitivo.
async function _refreshCloseDayGoalState() {
  const wrapper = closeDayBtn?.closest(".today-close-day");
  if (!wrapper) return;
  try {
    const { dailyGoal } = await getDashboardData();
    const goalMet = dailyGoal?.configured
      && (dailyGoal.state === "achieved" || dailyGoal.state === "exceeded");
    wrapper.classList.toggle("today-close-day--goal-met", !!goalMet);
  } catch (err) {
    handleError(err, { context: "todayView.closeDayGoalState", silent: true });
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
    const conflicts = _findConflictIndexes(events);
    _apptItemsCache = events.map((ev, i) => {
      const li = _buildApptItem(ev, conflicts.has(i));
      apptListEl.appendChild(li);
      return { ev, li };
    });
    _applyApptTemporalStates();
  } catch (err) {
    handleError(err, { context: "todayView.appointments", silent: true });
    apptEmptyEl.hidden = false;
    _apptItemsCache = [];
  }
}

// Hierarquia temporal (F14 diagnóstico #3/#20): entre os compromissos ainda
// não encerrados, o primeiro (mais próximo/em andamento) ganha destaque; os
// já encerrados recebem tratamento visual reduzido (sem sumir da lista). O
// estado de conflito (_today-appt-item--conflict_) é independente e nunca é
// tocado aqui. Reclassifica só as classes dos <li> já montados — nenhuma
// consulta nova, seguro para rodar a cada minuto mesmo com listas longas.
function _nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function _applyApptTemporalStates() {
  if (!_apptItemsCache.length) return;
  const now = _nowMinutes();

  let nextIndex = -1;
  for (let i = 0; i < _apptItemsCache.length; i++) {
    const { ev } = _apptItemsCache[i];
    const end = _timeToMinutes(ev.start_time) + (ev.duration_minutes || 1);
    if (end > now) {
      nextIndex = i;
      break;
    }
  }

  _apptItemsCache.forEach(({ ev, li }, i) => {
    li.classList.remove("today-appt-item--past", "today-appt-item--next");
    const end = _timeToMinutes(ev.start_time) + (ev.duration_minutes || 1);
    if (end <= now) {
      li.classList.add("today-appt-item--past");
    } else if (i === nextIndex) {
      li.classList.add("today-appt-item--next");
    }
  });
}

// Conflito de horário: dois compromissos de hoje cujos intervalos se cruzam.
// Só usa dado já carregado (start_time/duration_minutes) — nenhuma consulta
// nova. duration_minutes ausente vira um ponto de 1 minuto só para efeito de
// comparação (F14.1 §1: a tela responde "o que colide agora", e um horário
// sem duração ainda pode colidir com o intervalo de outro compromisso).
function _timeToMinutes(hhmmss) {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

function _findConflictIndexes(events) {
  const ranges = events.map(ev => {
    const start = _timeToMinutes(ev.start_time);
    return { start, end: start + (ev.duration_minutes || 1) };
  });
  const conflicts = new Set();
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (ranges[i].start < ranges[j].end && ranges[j].start < ranges[i].end) {
        conflicts.add(i);
        conflicts.add(j);
      }
    }
  }
  return conflicts;
}

// Categorias que representam estudo de fato — a única razão de existir de
// "Iniciar sessão" é abrir uma sessão de estudo, então compromissos de outras
// categorias (Ambulatório, Atividade Física, Aula, Pessoal…) não devem
// oferecer ou sugerir essa ação (ver studySessionView.js:714 pela mesma
// comparação case-insensitive contra ev.category).
const STUDY_CATEGORIES = ["estudo", "simulado"];

function _isStudyCategory(category) {
  return STUDY_CATEGORIES.includes((category || "").trim().toLowerCase());
}

// Faixa de categoria — antes um pill de texto (.badge), agora um traço de cor
// discreto: a lista de Hoje não precisa de mais um bloco textual competindo
// com título/horário/conflito por atenção (auditoria #9/#15, excesso de
// badges). A cor ainda é a mesma que o usuário escolheu em Categorias
// (categoryColor()), só que lida de relance como faixa — e continua
// disponível como texto via title/aria-label, para quem não distingue cor.
function _categoryBadgeHtml(category) {
  if (!category) return "";
  const color = categoryColor(category);
  return `<span class="today-appt-category" style="background:${escapeHtml(color)}" title="${escapeHtml(category)}" aria-label="Categoria: ${escapeHtml(category)}"></span>`;
}

// .today-appt-next-label — rótulo textual do destaque "próximo"/"em
// andamento" (F14 diagnóstico #1: hoje esse estado só era perceptível por
// cor/contraste, exigindo aprendizado prévio de que azul = próximo). Fica
// sempre no DOM, escondido por CSS (style.css), e só aparece quando o <li>
// pai já carrega .today-appt-item--next — _applyApptTemporalStates() decide
// isso reclassificando a classe do <li>, nenhum JS extra aqui.
function _buildApptItem(ev, isConflict) {
  const li = document.createElement("li");
  li.className = isConflict ? "today-appt-item today-appt-item--conflict" : "today-appt-item";
  const startBtnHtml = _isStudyCategory(ev.category)
    ? `<button type="button" class="btn btn-sm btn-secondary today-appt-start">Iniciar sessão</button>`
    : "";
  const conflictBadgeHtml = isConflict
    ? `<span class="badge today-appt-conflict-badge"><span class="today-appt-conflict-badge-icon" aria-hidden="true">${iconAlertTriangle}</span>Conflito de horário</span>`
    : "";
  li.innerHTML = `
    ${_categoryBadgeHtml(ev.category)}
    <span class="today-appt-time">${ev.start_time.slice(0, 5)}</span>
    <span class="today-appt-next-label">Próximo</span>
    <span class="today-appt-title">${escapeHtml(ev.title)}</span>
    ${conflictBadgeHtml}
    ${startBtnHtml}
  `;
  const startBtn = li.querySelector(".today-appt-start");
  if (startBtn) {
    startBtn.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const started = await startSessionForEvent(ev);
        if (started) showPage("study-session");
      } finally {
        btn.disabled = false;
      }
    });
  }
  return li;
}

// ── Dica contextual (no máximo 1 card, só se acionável) ──────────────────
// Mesma leitura do Decision Engine que weekView.js/loadTip() — nenhuma regra
// nova, só reaproveitada aqui para que a chegada nunca abra sem nenhuma
// orientação, mas também nunca com mais de um card (auditoria F14 §5) e nunca
// com um card crítico-passivo (auditoria F14.6): filterSpontaneousDecisions()
// só deixa passar revisão pendente e compromisso atrasado — o resto continua
// disponível via getDecisions() para o painel de IA, sob demanda.
//
// Etapa 16 — tipEl (#today-tip) agora vive dentro de .today-hero (ver
// index.html), como a primeira peça da mesma superfície: renderSmartCards()
// continua só escondendo/mostrando o container em si (nenhuma mudança de
// comportamento), a fusão visual inteira é resolvida por CSS
// (.today-hero > .smart-cards, style.css) — sem tip, o container some e o
// hero não sobra com espaço vazio.

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

// ── Fechar o dia (F14.8, tela cheia própria desde V5.6) ─────────────────────
// O dia nunca tinha desfecho (auditoria F14 §7/§13): a última sessão
// terminava e nada dizia "pronto, seu dia está encerrado". Esta tela (era
// um modal genérico até V5.6, ver #close-day-modal em index.html) cobre as
// duas metades desse fechamento — um recap de 15 segundos (nenhum cálculo
// novo, ver closeDayService.getDayRecap()) e um único campo opcional para o
// primeiro estudo de amanhã, que reaparece como chip no próximo início de
// sessão (studySessionView.js/_loadStartSuggestions lê o mesmo
// closeDayService.getNextStudyPlan()). initModal() continua controlando
// abertura/fechamento (hidden), Escape, clique fora e Focus Trap — só a
// moldura visual do elemento overlay mudou, nenhuma lógica de ciclo de vida.

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
    toast.milestone("Dia encerrado. Foi um bom dia de estudo — até amanhã!");
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
  if (_apptStateTimer) {
    clearInterval(_apptStateTimer);
    _apptStateTimer = null;
  }
  _apptItemsCache = [];
}
