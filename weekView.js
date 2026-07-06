import { getEventsByRange } from "./eventService.js";
import { getEventExecutionSummaries } from "./activitySessionService.js";
import { describeExecutionIndicator } from "./activitySessionStats.js";
import { expandEvents } from "./recurrence.js";
import { pad, isoDate, isoToday, mondayOf, escapeHtml } from "./utils.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock } from "./stateView.js";
import { getDecisions } from "./decisionEngine.js";
import { renderSmartCards, decisionToCard } from "./smartCardView.js";
import { renderPlanList } from "./planListView.js";

let _academicProvider  = null;
let _showPersonal      = () => true;

/** Registers a provider function (start, end) => Promise<AcademicEvent[]> */
export function setWeekViewAcademicProvider(fn) {
  _academicProvider = fn;
}

/** Registers a predicate returning whether personal events are visible */
export function setWeekViewPersonalVisibility(fn) {
  _showPersonal = fn;
}

const ROW_H      = 48; // px per 30-min slot — total height 2304px
const DAYS       = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MONTHS     = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_ABR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

let _el  = null;
let _cbs = {};
let _mon = null; // Date — Monday of the displayed week (time=00:00:00)
let _nowTimer = null;
let _weeklyPlan = []; // último plano computado por loadTip() (F3.5, ETAPA 6)
let _planExpanded = false;

// ── Public API ─────────────────────────────────────────────────────────────

export async function initWeekView(el, cbs = {}) {
  if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
  _el  = el;
  _cbs = cbs;
  _mon = mondayOf(new Date());
  buildShell();
  await fetchAndRender();
  // A dica contextual e o plano da semana (F3.5, ETAPA 4/6) usam uma janela
  // própria (Context/Planning Engine) independente da semana exibida — não
  // recarregam ao navegar entre semanas (navigate()/goToday() só chamam
  // fetchAndRender diretamente), só na carga inicial e em refreshWeekView().
  loadTip();
  _nowTimer = setInterval(updateNowLine, 60_000);
}

export async function refreshWeekView() {
  if (!_el) return;
  await fetchAndRender();
  loadTip();
}

export function destroyWeekView() {
  if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
  _el = null;
}

// ── Shell (built once) ─────────────────────────────────────────────────────

function buildShell() {
  _el.innerHTML = `
    <div class="wk-nav">
      <button class="btn btn-sm btn-ghost" id="wk-prev" aria-label="Semana anterior">‹</button>
      <span class="wk-label" id="wk-label"></span>
      <button class="btn btn-sm btn-ghost" id="wk-today">Hoje</button>
      <button class="btn btn-sm btn-ghost" id="wk-next" aria-label="Próxima semana">›</button>
    </div>
    <div class="wk-error" id="wk-error" hidden></div>
    <div id="wk-tip" class="smart-cards" hidden></div>
    <div class="wk-plan-toggle-row">
      <button type="button" class="btn btn-sm btn-ghost" id="wk-plan-toggle" hidden>Ver plano da semana</button>
    </div>
    <div id="wk-plan-list" class="ai-result-body--plan wk-plan-list" hidden></div>
    <div class="wk-wrap">
      <div class="wk-scroll" id="wk-scroll">
        <div class="wk-head-row" id="wk-head-row">
          <div class="wk-gutter-head"></div>
          ${DAYS.map((d, i) => `
            <div class="wk-day-head" id="wk-dh-${i}">
              <span class="wk-day-name">${d}</span>
              <span class="wk-day-num" id="wk-dn-${i}"></span>
            </div>`).join("")}
        </div>
        <div class="wk-allday-row" id="wk-allday-row">
          <div class="wk-gutter-allday">Dia todo</div>
          ${Array.from({length: 7}, (_, i) =>
            `<div class="wk-allday-col" id="wk-allday-${i}"></div>`).join("")}
        </div>
        <div class="wk-body">
          <div class="wk-time-col" id="wk-time-col"></div>
          <div class="wk-cols" id="wk-cols">
            ${Array.from({length: 7}, (_, i) =>
              `<div class="wk-day-col" id="wk-col-${i}"></div>`).join("")}
            <div class="wk-now-line" id="wk-now-line" hidden></div>
          </div>
        </div>
      </div>
    </div>
  `;

  _el.querySelector("#wk-prev").addEventListener("click",  () => navigate(-1));
  _el.querySelector("#wk-next").addEventListener("click",  () => navigate(1));
  _el.querySelector("#wk-today").addEventListener("click", goToday);
  _el.querySelector("#wk-plan-toggle").addEventListener("click", togglePlan);

  buildTimeCol();
  buildDayCols();
}

function buildTimeCol() {
  const col = _el.querySelector("#wk-time-col");
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className   = "wk-hour-label";
    lbl.style.top   = `${h * 2 * ROW_H}px`;
    lbl.textContent = `${pad(h)}:00`;
    col.appendChild(lbl);
  }
}

function buildDayCols() {
  for (let i = 0; i < 7; i++) {
    const col = _el.querySelector(`#wk-col-${i}`);

    for (let s = 0; s < 48; s++) {
      const slot = document.createElement("div");
      slot.className = "wk-slot";
      col.appendChild(slot);
    }

    // capture colIdx in closure
    col.addEventListener("click", makeSlotHandler(i));
  }
}

function makeSlotHandler(colIdx) {
  return (e) => {
    if (e.target.closest(".wk-event")) return;
    if (!_cbs.onSlotClick) return;
    const col    = _el.querySelector(`#wk-col-${colIdx}`);
    const slotEl = e.target.closest(".wk-slot");
    if (!slotEl) return;
    const s = Array.from(col.querySelectorAll(".wk-slot")).indexOf(slotEl);
    if (s < 0) return;
    _cbs.onSlotClick(colIsoDate(colIdx), `${pad(Math.floor(s / 2))}:${pad((s % 2) * 30)}`);
  };
}

// ── Navigation ─────────────────────────────────────────────────────────────

async function navigate(delta) {
  _mon.setDate(_mon.getDate() + delta * 7);
  await fetchAndRender();
}

async function goToday() {
  _mon = mondayOf(new Date());
  await fetchAndRender();
}

// ── Fetch & render ─────────────────────────────────────────────────────────

async function fetchAndRender() {
  updateLabel();
  updateDayHeaders();
  clearEvents();

  try {
    const start = colIsoDate(0);
    const end   = colIsoDate(6);
    const [rawEvents, academicEvents] = await Promise.all([
      _showPersonal() ? getEventsByRange(start, end) : Promise.resolve([]),
      _academicProvider ? _academicProvider(start, end) : Promise.resolve([]),
    ]);
    const personal = expandEvents(rawEvents, start, end);
    const executionSummaries = await fetchExecutionSummaries(personal);
    renderEvents(personal, executionSummaries);
    renderAcademicEvents(academicEvents);
    hideWeekError();
  } catch (err) {
    // Erro (rede/banco/sessão) não deve ser tratado como "semana sem eventos" —
    // exibe um banner de erro distinto, com opção de tentar novamente, em vez
    // de deixar a grade silenciosamente vazia.
    showWeekError(errorToState(handleError(err, { context: "weekView.fetchAndRender", silent: true })));
  }

  updateNowLine();
  scrollToTime();
}

function showWeekError({ state, message }) {
  const banner = _el.querySelector("#wk-error");
  if (!banner) return;
  renderStateBlock(banner, { state, message, onRetry: fetchAndRender });
  banner.hidden = false;
}

function hideWeekError() {
  const banner = _el.querySelector("#wk-error");
  if (banner) banner.hidden = true;
}

// ── Dica contextual e plano rápido (F3.5, ETAPA 4/6; consumindo o Decision
// Engine — F3.7) ─────────────────────────────────────────────────────────────
// decisionEngine.getDecisions() já roda Recommendation/Planning/
// Reflection Engine uma única vez e devolve, via decisionEngine.js, a lista
// final priorizada e sem duplicidade — junto com o plano bruto do Planning
// Engine (mesma rodada, sem recalcular nada), usado só pela lista completa
// por trás do botão "Ver plano da semana". A dica é a decisão de origem
// "planning" cuja data sugerida é hoje (mais concreta: já tem tempo e data);
// na ausência de uma para hoje, cai para a decisão de maior prioridade geral
// (já ordenada pelo Decision Engine). Nunca cria, altera ou agenda nada — é
// só leitura.
async function loadTip() {
  const tipEl = _el?.querySelector("#wk-tip");
  const toggleBtn = _el?.querySelector("#wk-plan-toggle");
  const planListEl = _el?.querySelector("#wk-plan-list");
  if (!tipEl || !toggleBtn || !planListEl) return;

  let decisions = [];
  try {
    const result = await getDecisions();
    decisions = result.decisions;
    _weeklyPlan = result.planning;
  } catch (err) {
    handleError(err, { context: "weekView.loadTip", silent: true });
    _weeklyPlan = [];
  }

  const todayISO = isoToday();
  const todayDecision = decisions.find(d => d.origem === "planning" && d.acaoSugerida?.dataSugerida === todayISO);
  const decision = todayDecision || decisions[0] || null;
  let tip = null;
  if (decision) {
    tip = decisionToCard(decision);
    // "study" com categoria conhecida vira a frase de exemplo do enunciado
    // ("Hoje seria interessante revisar Anatomia."); os demais tipos mantêm
    // a própria mensagem já redigida pelo motor de origem.
    if (decision.origemTipo === "study" && decision.dadosUtilizados?.categoria) {
      tip = { ...tip, mensagem: `Hoje seria interessante revisar ${decision.dadosUtilizados.categoria}.` };
    }
  }
  renderSmartCards(tipEl, tip ? [tip] : []);

  toggleBtn.hidden = _weeklyPlan.length === 0;
  _planExpanded = false;
  planListEl.hidden = true;
  toggleBtn.textContent = "Ver plano da semana";
  if (_weeklyPlan.length) renderPlanList(planListEl, _weeklyPlan);
}

function togglePlan() {
  const toggleBtn = _el?.querySelector("#wk-plan-toggle");
  const planListEl = _el?.querySelector("#wk-plan-list");
  if (!toggleBtn || !planListEl) return;
  _planExpanded = !_planExpanded;
  planListEl.hidden = !_planExpanded;
  toggleBtn.textContent = _planExpanded ? "Ocultar plano da semana" : "Ver plano da semana";
}

function updateLabel() {
  const el = _el.querySelector("#wk-label");
  if (!el) return;

  const sun = new Date(_mon);
  sun.setDate(sun.getDate() + 6);

  const d1 = _mon.getDate(), m1 = _mon.getMonth(), y1 = _mon.getFullYear();
  const d2 = sun.getDate(),  m2 = sun.getMonth(),  y2 = sun.getFullYear();

  if (m1 === m2 && y1 === y2) {
    el.textContent = `${d1} a ${d2} de ${MONTHS[m1]} ${y1}`;
  } else if (y1 === y2) {
    el.textContent = `${d1} de ${MONTHS_ABR[m1]} a ${d2} de ${MONTHS[m2]} ${y2}`;
  } else {
    el.textContent = `${d1} de ${MONTHS_ABR[m1]} ${y1} a ${d2} de ${MONTHS[m2]} ${y2}`;
  }
}

function updateDayHeaders() {
  const todayISO = isoToday();
  for (let i = 0; i < 7; i++) {
    const iso  = colIsoDate(i);
    const date = new Date(iso + "T00:00:00");
    const head = _el.querySelector(`#wk-dh-${i}`);
    const num  = _el.querySelector(`#wk-dn-${i}`);
    const col  = _el.querySelector(`#wk-col-${i}`);
    if (num)  num.textContent = date.getDate();
    const isToday = iso === todayISO;
    head?.classList.toggle("wk-today",     isToday);
    col?.classList.toggle("wk-col-today",  isToday);
  }
}

function clearEvents() {
  _el.querySelectorAll(".wk-event").forEach(el => el.remove());
  for (let i = 0; i < 7; i++) {
    const col = _el.querySelector(`#wk-allday-${i}`);
    if (col) col.innerHTML = "";
  }
}

// Busca os resumos de execução de todos os compromissos exibidos em uma
// única consulta em lote (evita N+1 — uma chamada por compromisso). Falha
// aqui nunca impede a agenda de exibir os compromissos: só os indicadores
// deixam de aparecer.
async function fetchExecutionSummaries(events) {
  const ids = [...new Set(events.map(ev => ev.id).filter(Boolean))];
  if (!ids.length) return {};
  try {
    return await getEventExecutionSummaries(ids);
  } catch (err) {
    handleError(err, { context: "weekView.executionSummaries", silent: true });
    return {};
  }
}

function renderEvents(events, summaries = {}) {
  events.forEach(ev => {
    if (!ev.start_time) return;

    const colIdx = dateToCol(ev.event_date);
    if (colIdx < 0) return;

    const [h, m] = ev.start_time.split(":").map(Number);
    const totalMin = h * 60 + m;
    const top    = (totalMin / 30) * ROW_H;
    const dur    = ev.duration_minutes || 30;
    const height = Math.max((dur / 30) * ROW_H - 2, 22);

    const indicator = describeExecutionIndicator(summaries[ev.id]);

    const block = document.createElement("div");
    block.className = indicator ? `wk-event wk-event-${indicator.state}` : "wk-event";
    block.style.top      = `${top}px`;
    block.style.height   = `${height}px`;
    block.style.background = ev.color || "#3b82f6";
    block.innerHTML = `
      <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
      ${ev.category ? `<span class="wk-ev-cat">${escapeHtml(ev.category)}</span>` : ""}
      <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      ${indicator ? `<span class="wk-ev-indicator">${indicator.icon} ${escapeHtml(indicator.text)}</span>` : ""}
    `;

    if (_cbs.onEventClick) {
      block.addEventListener("click", e => {
        e.stopPropagation();
        _cbs.onEventClick(ev);
      });
    }

    _el.querySelector(`#wk-col-${colIdx}`).appendChild(block);
  });
}

function renderAcademicEvents(events) {
  events.forEach(ev => {
    const colIdx = dateToCol(ev.event_date);
    if (colIdx < 0) return;

    if (ev.all_day !== false) {
      // All-day → show in the all-day row as a chip
      const col = _el.querySelector(`#wk-allday-${colIdx}`);
      if (!col) return;
      const chip = document.createElement("div");
      chip.className = "wk-allday-chip";
      chip.style.background = ev.color || ev._calendarColor || "#7c3aed";
      chip.title = `[${ev._calendarName}] ${ev.title}`;
      chip.textContent = ev.title;
      if (_cbs.onAcademicEventClick) {
        chip.addEventListener("click", e => { e.stopPropagation(); _cbs.onAcademicEventClick(ev); });
      }
      col.appendChild(chip);
    } else if (ev.start_time) {
      // Timed academic event → time grid, with distinct style
      const [h, m] = ev.start_time.split(":").map(Number);
      const totalMin = h * 60 + m;
      const top    = (totalMin / 30) * ROW_H;
      const dur    = ev.duration_minutes || 60;
      const height = Math.max((dur / 30) * ROW_H - 2, 22);

      const block = document.createElement("div");
      block.className = "wk-event wk-event-academic";
      block.style.top        = `${top}px`;
      block.style.height     = `${height}px`;
      block.style.background = ev.color || ev._calendarColor || "#7c3aed";
      block.innerHTML = `
        <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
        <span class="wk-ev-cat">${escapeHtml(ev._calendarName || "Acadêmico")}</span>
        <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      `;

      if (_cbs.onAcademicEventClick) {
        block.addEventListener("click", e => { e.stopPropagation(); _cbs.onAcademicEventClick(ev); });
      }

      _el.querySelector(`#wk-col-${colIdx}`)?.appendChild(block);
    }
  });
}

// ── Now line ───────────────────────────────────────────────────────────────

function updateNowLine() {
  const line = _el?.querySelector("#wk-now-line");
  if (!line) return;

  if (!sameWeek(new Date(), _mon)) {
    line.hidden = true;
    return;
  }

  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  line.hidden    = false;
  line.style.top = `${(mins / 30) * ROW_H}px`;
}

// ── Auto-scroll ────────────────────────────────────────────────────────────

function scrollToTime() {
  const scroll = _el.querySelector("#wk-scroll");
  if (!scroll) return;
  requestAnimationFrame(() => {
    const now  = new Date();
    const mins = sameWeek(now, _mon)
      ? now.getHours() * 60 + now.getMinutes()
      : 8 * 60;
    scroll.scrollTop = Math.max(0, (mins / 30) * ROW_H - scroll.clientHeight / 2);
  });
}

// ── Date helpers ───────────────────────────────────────────────────────────

function colIsoDate(colIdx) {
  const d = new Date(_mon);
  d.setDate(d.getDate() + colIdx);
  return isoDate(d);
}

function dateToCol(isoStr) {
  if (isoStr < colIsoDate(0) || isoStr > colIsoDate(6)) return -1;
  const d   = new Date(isoStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun
  return day === 0 ? 6 : day - 1; // Mon=0 … Sun=6
}

function sameWeek(date, mon) {
  return isoDate(mondayOf(date)) === isoDate(mon);
}
