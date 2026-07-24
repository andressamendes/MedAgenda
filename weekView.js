import { getEventsByRange } from "./eventService.js";
import { getEventExecutionSummaries } from "./activitySessionService.js";
import { describeExecutionIndicator } from "./activitySessionStats.js";
import { expandEvents } from "./recurrence.js";
import { pad, isoDate, isoToday, mondayOf, escapeHtml, readableTextColor } from "./utils.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock } from "./stateView.js";
import { getDecisions, filterSpontaneousDecisions } from "./decisionEngine.js";
import { renderSmartCards, decisionToCard } from "./smartCardView.js";
import { renderPlanList } from "./planListView.js";
import { iconCalendarWeek, iconChevronDown } from "./icons.js";

// F10 #1.6 — Estado vazio didático: um usuário novo, com a agenda ainda sem
// nenhum compromisso, via só a grade em branco — "zero onboarding hoje"
// (F10, item 1.6). Mostrado uma única vez, na primeira semana visitada sem
// nenhum evento (pessoal ou acadêmico); some assim que a semana passar a ter
// ao menos um evento, ou ao clicar em "Entendi". Reaproveita o mesmo padrão
// visual (ícone + título + descrição) já usado pelos estados de
// carregamento em stateView.js — classes `.state-block`/`.state-block-*` —
// mas não a função renderStateBlock() em si, que é específica de erros
// (STATES/retry/reautenticação); aqui não há erro nem nova tentativa, só uma
// dica que se dispensa sozinha.
const WEEK_INTRO_SEEN_KEY = "medagenda_week_intro_seen";

function _hasSeenWeekIntro() {
  try { return localStorage.getItem(WEEK_INTRO_SEEN_KEY) === "1"; } catch { return true; }
}

function _markWeekIntroSeen() {
  try { localStorage.setItem(WEEK_INTRO_SEEN_KEY, "1"); } catch { /* storage indisponível */ }
}

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
const DAYS_FULL  = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"]; // índice = Date.getDay()
const MONTHS     = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_ABR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

let _el  = null;
let _cbs = {};
let _mon = null; // Date — Monday of the displayed week (time=00:00:00)
let _nowTimer = null;
let _weeklyPlan = []; // último plano computado por loadTip() (F3.5, ETAPA 6)
let _planExpanded = false;
let _fetchGeneration = 0; // AUD-007: descarta respostas de fetchAndRender() obsoletas em navegações rápidas

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

// Chamada no logout/troca de usuário (ver authView.js/showAuthView). Além do
// timer, descarta o DOM renderizado e o cache em memória (_weeklyPlan): esta
// é uma SPA sem reload de página entre sessões, então os compromissos, a dica
// de IA e o plano da semana do usuário anterior não podem sobreviver no DOM
// nem em memória durante a janela entre o logout e o próximo _initApp —
// mesma simetria init/reset dos demais subsistemas (auditoria A1.3).
export function destroyWeekView() {
  if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
  if (_el) _el.innerHTML = "";
  _el = null;
  _cbs = {};
  _mon = null;
  _weeklyPlan = [];
  _planExpanded = false;
  _academicProvider = null;
  _showPersonal = () => true;
  _fetchGeneration++; // descarta qualquer fetchAndRender() ainda em voo desta instância
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
    <div id="wk-empty-tip" class="state-block wk-empty-tip" hidden>
      <span class="state-block-icon" aria-hidden="true">${iconCalendarWeek}</span>
      <strong class="state-block-title">Sua semana está vazia</strong>
      <span class="state-block-desc">Clique em qualquer horário da grade abaixo para criar um compromisso, ou use "+ Novo compromisso".</span>
      <button type="button" class="btn btn-sm btn-ghost state-block-action" id="wk-empty-tip-dismiss">Entendi</button>
    </div>
    <div id="wk-tip" class="smart-cards" hidden></div>
    <div class="wk-plan-toggle-row">
      <button type="button" class="btn btn-sm btn-ghost disclosure-toggle" id="wk-plan-toggle" aria-expanded="false" aria-controls="wk-plan-list" hidden><span class="disclosure-label">Mostrar plano da semana</span><span class="disclosure-chevron" aria-hidden="true">${iconChevronDown}</span></button>
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
  _el.querySelector("#wk-empty-tip-dismiss").addEventListener("click", () => {
    _markWeekIntroSeen();
    _el.querySelector("#wk-empty-tip").hidden = true;
  });

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
  // AUD-007: cada chamada recebe uma geração própria; se _mon mudar de novo
  // (nova navegação) antes desta resolver, esta geração fica obsoleta e seu
  // resultado é descartado — só a navegação mais recente chega a renderizar.
  const generation = ++_fetchGeneration;

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
    if (generation !== _fetchGeneration) return; // navegação mais recente já assumiu a tela
    renderEvents(personal, executionSummaries);
    renderAcademicEvents(academicEvents);
    hideWeekError();
    updateEmptyTip(personal.length + academicEvents.length === 0);
  } catch (err) {
    if (generation !== _fetchGeneration) return;
    // Erro (rede/banco/sessão) não deve ser tratado como "semana sem eventos" —
    // exibe um banner de erro distinto, com opção de tentar novamente, em vez
    // de deixar a grade silenciosamente vazia.
    showWeekError(errorToState(handleError(err, { context: "weekView.fetchAndRender", silent: true })));
  }

  if (generation !== _fetchGeneration) return;
  updateNowLine();
  scrollToTime();
}

function showWeekError({ state, message }) {
  const banner = _el.querySelector("#wk-error");
  if (!banner) return;
  renderStateBlock(banner, { state, message, onRetry: fetchAndRender });
  banner.hidden = false;
  updateEmptyTip(false);
}

function hideWeekError() {
  const banner = _el.querySelector("#wk-error");
  if (banner) banner.hidden = true;
}

function updateEmptyTip(isEmpty) {
  const tip = _el?.querySelector("#wk-empty-tip");
  if (!tip) return;
  tip.hidden = !isEmpty || _hasSeenWeekIntro();
}

// ── Dica contextual e plano rápido (F3.5, ETAPA 4/6; consumindo o Decision
// Engine — F3.7) ─────────────────────────────────────────────────────────────
// decisionEngine.getDecisions() já roda Recommendation/Planning/
// Reflection Engine uma única vez e devolve, via decisionEngine.js, a lista
// final priorizada e sem duplicidade — junto com o plano bruto do Planning
// Engine (mesma rodada, sem recalcular nada), usado só pela lista completa
// por trás do botão "Mostrar plano da semana". A dica espontânea só considera
// decisões acionáveis (revisão pendente, compromisso atrasado —
// filterSpontaneousDecisions(), F14.6): críticas passivas como "baixa
// execução" ou "muito tempo sem sessões" continuam disponíveis via
// getDecisions() para o painel de IA, só deixam de aparecer sem serem
// pedidas. Dentro do que sobra, prioriza a decisão de origem "planning" cuja
// data sugerida é hoje (mais concreta: já tem tempo e data); na ausência de
// uma para hoje, cai para a de maior prioridade geral (já ordenada pelo
// Decision Engine). Nunca cria, altera ou agenda nada — é só leitura.
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
  const spontaneous = filterSpontaneousDecisions(decisions);
  const todayDecision = spontaneous.find(d => d.origem === "planning" && d.acaoSugerida?.dataSugerida === todayISO);
  const decision = todayDecision || spontaneous[0] || null;
  const tip = decision ? decisionToCard(decision) : null;
  renderSmartCards(tipEl, tip ? [tip] : []);

  toggleBtn.hidden = _weeklyPlan.length === 0;
  _planExpanded = false;
  planListEl.hidden = true;
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.querySelector(".disclosure-label").textContent = "Mostrar plano da semana";
  if (_weeklyPlan.length) renderPlanList(planListEl, _weeklyPlan);
}

function togglePlan() {
  const toggleBtn = _el?.querySelector("#wk-plan-toggle");
  const planListEl = _el?.querySelector("#wk-plan-list");
  if (!toggleBtn || !planListEl) return;
  _planExpanded = !_planExpanded;
  planListEl.hidden = !_planExpanded;
  toggleBtn.setAttribute("aria-expanded", String(_planExpanded));
  toggleBtn.querySelector(".disclosure-label").textContent = _planExpanded ? "Ocultar plano da semana" : "Mostrar plano da semana";
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

// Blocos/chips de evento são <div>s posicionados — para serem operáveis por
// teclado (auditoria UX #03), cada elemento clicável recebe role="button",
// entra na ordem de Tab e ativa com Enter/Espaço, espelhando o clique.
// Mesmo helper local em calendar.js (padrão do app: helpers pequenos são
// duplicados entre views em vez de virar módulo compartilhado).
function bindActivate(el, handler) {
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("click", handler);
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    handler(e);
  });
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
    const bgColor = ev.color || "#3b82f6";
    block.style.background = bgColor;
    block.style.color      = readableTextColor(bgColor);
    block.innerHTML = `
      <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
      ${ev.category ? `<span class="wk-ev-cat">${escapeHtml(ev.category)}</span>` : ""}
      <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      ${indicator ? `<span class="wk-ev-indicator">${indicator.icon} ${escapeHtml(indicator.text)}</span>` : ""}
    `;

    if (_cbs.onEventClick) {
      bindActivate(block, e => {
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
      const chipColor = ev.color || ev._calendarColor || "#7c3aed";
      chip.style.background = chipColor;
      chip.style.color      = readableTextColor(chipColor);
      chip.title = `[${ev._calendarName}] ${ev.title}`;
      chip.textContent = ev.title;
      if (_cbs.onAcademicEventClick) {
        bindActivate(chip, e => { e.stopPropagation(); _cbs.onAcademicEventClick(ev); });
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
      const blockColor = ev.color || ev._calendarColor || "#7c3aed";
      block.style.background = blockColor;
      block.style.color      = readableTextColor(blockColor);
      block.innerHTML = `
        <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
        <span class="wk-ev-cat">${escapeHtml(ev._calendarName || "Acadêmico")}</span>
        <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      `;

      if (_cbs.onAcademicEventClick) {
        bindActivate(block, e => { e.stopPropagation(); _cbs.onAcademicEventClick(ev); });
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
    // A view pode ter sido destruída (logout/troca de usuário — ver
    // destroyWeekView) entre o agendamento deste frame e sua execução:
    // _el/_mon já estarão nulos e sameWeek(now, null) lançaria TypeError.
    if (!_el || !_mon) return;
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

// ── V5.12 — Vista "Dia" ──────────────────────────────────────────────────────
// Mobile-first: a grade Semana precisa de 7 colunas lado a lado (min-width
// 480px, decisão consciente — ver comentário sobre .wk-scroll em style.css) e
// força scroll horizontal em telas estreitas. "Dia" é a mesma grade de
// horários, reaproveitando os mesmos dados já expandidos por expandEvents()/
// o mesmo describeExecutionIndicator()/bindActivate() de Semana, só que com
// uma única coluna — sem 7 colunas não há min-width a forçar, então não há
// scroll horizontal. Estado independente de Semana (_dDate própria, não
// _mon): navegar em Dia não afeta a semana exibida em Semana, e vice-versa.
// Registrada como aba própria em #agenda-view-tabs (script.js/_setAgendaView)
// e torna-se a aba padrão em telas ≤767px (script.js/_initAgendaViewTabs).

let _dEl  = null;
let _dCbs = {};
let _dDate = null; // Date — dia exibido (time=00:00:00)
let _dNowTimer = null;
let _dFetchGeneration = 0; // mesmo padrão anti-race de _fetchGeneration (AUD-007)

export async function initDayView(el, cbs = {}) {
  if (_dNowTimer) { clearInterval(_dNowTimer); _dNowTimer = null; }
  _dEl  = el;
  _dCbs = cbs;
  _dDate = todayMidnight();
  buildDayShell();
  await fetchAndRenderDay();
  _dNowTimer = setInterval(updateDayNowLine, 60_000);
}

export async function refreshDayView() {
  if (!_dEl) return;
  await fetchAndRenderDay();
}

export function destroyDayView() {
  if (_dNowTimer) { clearInterval(_dNowTimer); _dNowTimer = null; }
  if (_dEl) _dEl.innerHTML = "";
  _dEl = null;
  _dCbs = {};
  _dDate = null;
  _dFetchGeneration++;
}

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDayShell() {
  _dEl.innerHTML = `
    <div class="dv-nav">
      <button class="btn btn-sm btn-ghost" id="dv-prev" aria-label="Dia anterior">‹</button>
      <span class="dv-label" id="dv-label"></span>
      <button class="btn btn-sm btn-ghost" id="dv-today">Hoje</button>
      <button class="btn btn-sm btn-ghost" id="dv-next" aria-label="Próximo dia">›</button>
    </div>
    <div class="dv-error" id="dv-error" hidden></div>
    <div id="dv-empty-tip" class="state-block wk-empty-tip" hidden>
      <span class="state-block-icon" aria-hidden="true">${iconCalendarWeek}</span>
      <strong class="state-block-title">Seu dia está vazio</strong>
      <span class="state-block-desc">Toque em qualquer horário abaixo para criar um compromisso, ou use "+ Novo compromisso".</span>
    </div>
    <div class="dv-wrap">
      <div class="dv-scroll" id="dv-scroll">
        <div class="dv-allday-row" id="dv-allday-row">
          <div class="dv-gutter-allday">Dia todo</div>
          <div class="wk-allday-col" id="dv-allday-col"></div>
        </div>
        <div class="dv-body">
          <div class="dv-time-col" id="dv-time-col"></div>
          <div class="dv-col-wrap" id="dv-col-wrap">
            <div class="dv-day-col" id="dv-day-col"></div>
            <div class="wk-now-line" id="dv-now-line" hidden></div>
          </div>
        </div>
      </div>
    </div>
  `;

  _dEl.querySelector("#dv-prev").addEventListener("click",  () => navigateDay(-1));
  _dEl.querySelector("#dv-next").addEventListener("click",  () => navigateDay(1));
  _dEl.querySelector("#dv-today").addEventListener("click", goTodayDay);

  buildDayTimeCol();
  buildDaySlots();
}

function buildDayTimeCol() {
  const col = _dEl.querySelector("#dv-time-col");
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className   = "wk-hour-label";
    lbl.style.top   = `${h * 2 * ROW_H}px`;
    lbl.textContent = `${pad(h)}:00`;
    col.appendChild(lbl);
  }
}

function buildDaySlots() {
  const col = _dEl.querySelector("#dv-day-col");
  for (let s = 0; s < 48; s++) {
    const slot = document.createElement("div");
    slot.className = "wk-slot";
    col.appendChild(slot);
  }
  col.addEventListener("click", (e) => {
    if (e.target.closest(".wk-event")) return;
    if (!_dCbs.onSlotClick) return;
    const slotEl = e.target.closest(".wk-slot");
    if (!slotEl) return;
    const s = Array.from(col.querySelectorAll(".wk-slot")).indexOf(slotEl);
    if (s < 0) return;
    _dCbs.onSlotClick(isoDate(_dDate), `${pad(Math.floor(s / 2))}:${pad((s % 2) * 30)}`);
  });
}

async function navigateDay(delta) {
  _dDate.setDate(_dDate.getDate() + delta);
  await fetchAndRenderDay();
}

async function goTodayDay() {
  _dDate = todayMidnight();
  await fetchAndRenderDay();
}

async function fetchAndRenderDay() {
  const generation = ++_dFetchGeneration;

  updateDayLabel();
  clearDayEvents();

  try {
    const iso = isoDate(_dDate);
    const [rawEvents, academicEvents] = await Promise.all([
      _showPersonal() ? getEventsByRange(iso, iso) : Promise.resolve([]),
      _academicProvider ? _academicProvider(iso, iso) : Promise.resolve([]),
    ]);
    const personal = expandEvents(rawEvents, iso, iso);
    const executionSummaries = await fetchExecutionSummaries(personal);
    if (generation !== _dFetchGeneration) return;
    renderDayEvents(personal, executionSummaries);
    renderDayAcademicEvents(academicEvents);
    hideDayError();
    updateDayEmptyTip(personal.length + academicEvents.length === 0);
  } catch (err) {
    if (generation !== _dFetchGeneration) return;
    showDayError(errorToState(handleError(err, { context: "weekView.fetchAndRenderDay", silent: true })));
  }

  if (generation !== _dFetchGeneration) return;
  updateDayNowLine();
  scrollToTimeDay();
}

function showDayError({ state, message }) {
  const banner = _dEl.querySelector("#dv-error");
  if (!banner) return;
  renderStateBlock(banner, { state, message, onRetry: fetchAndRenderDay });
  banner.hidden = false;
  updateDayEmptyTip(false);
}

function hideDayError() {
  const banner = _dEl.querySelector("#dv-error");
  if (banner) banner.hidden = true;
}

function updateDayEmptyTip(isEmpty) {
  const tip = _dEl?.querySelector("#dv-empty-tip");
  if (!tip) return;
  tip.hidden = !isEmpty;
}

function updateDayLabel() {
  const el = _dEl.querySelector("#dv-label");
  if (!el) return;
  const weekday = DAYS_FULL[_dDate.getDay()];
  el.textContent = `${weekday}, ${_dDate.getDate()} de ${MONTHS[_dDate.getMonth()]}`;
}

function clearDayEvents() {
  _dEl.querySelectorAll(".wk-event").forEach(el => el.remove());
  const allday = _dEl.querySelector("#dv-allday-col");
  if (allday) allday.innerHTML = "";
}

function renderDayEvents(events, summaries = {}) {
  const col = _dEl.querySelector("#dv-day-col");
  if (!col) return;
  events.forEach(ev => {
    if (!ev.start_time) return;

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
    const bgColor = ev.color || "#3b82f6";
    block.style.background = bgColor;
    block.style.color      = readableTextColor(bgColor);
    block.innerHTML = `
      <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
      ${ev.category ? `<span class="wk-ev-cat">${escapeHtml(ev.category)}</span>` : ""}
      <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      ${indicator ? `<span class="wk-ev-indicator">${indicator.icon} ${escapeHtml(indicator.text)}</span>` : ""}
    `;

    if (_dCbs.onEventClick) {
      bindActivate(block, e => {
        e.stopPropagation();
        _dCbs.onEventClick(ev);
      });
    }

    col.appendChild(block);
  });
}

function renderDayAcademicEvents(events) {
  events.forEach(ev => {
    if (ev.all_day !== false) {
      const col = _dEl.querySelector("#dv-allday-col");
      if (!col) return;
      const chip = document.createElement("div");
      chip.className = "wk-allday-chip";
      const chipColor = ev.color || ev._calendarColor || "#7c3aed";
      chip.style.background = chipColor;
      chip.style.color      = readableTextColor(chipColor);
      chip.title = `[${ev._calendarName}] ${ev.title}`;
      chip.textContent = ev.title;
      if (_dCbs.onAcademicEventClick) {
        bindActivate(chip, e => { e.stopPropagation(); _dCbs.onAcademicEventClick(ev); });
      }
      col.appendChild(chip);
    } else if (ev.start_time) {
      const col = _dEl.querySelector("#dv-day-col");
      if (!col) return;
      const [h, m] = ev.start_time.split(":").map(Number);
      const totalMin = h * 60 + m;
      const top    = (totalMin / 30) * ROW_H;
      const dur    = ev.duration_minutes || 60;
      const height = Math.max((dur / 30) * ROW_H - 2, 22);

      const block = document.createElement("div");
      block.className = "wk-event wk-event-academic";
      block.style.top        = `${top}px`;
      block.style.height     = `${height}px`;
      const blockColor = ev.color || ev._calendarColor || "#7c3aed";
      block.style.background = blockColor;
      block.style.color      = readableTextColor(blockColor);
      block.innerHTML = `
        <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
        <span class="wk-ev-cat">${escapeHtml(ev._calendarName || "Acadêmico")}</span>
        <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
      `;

      if (_dCbs.onAcademicEventClick) {
        bindActivate(block, e => { e.stopPropagation(); _dCbs.onAcademicEventClick(ev); });
      }

      col.appendChild(block);
    }
  });
}

function updateDayNowLine() {
  const line = _dEl?.querySelector("#dv-now-line");
  if (!line) return;

  if (!_dDate || isoDate(_dDate) !== isoToday()) {
    line.hidden = true;
    return;
  }

  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  line.hidden    = false;
  line.style.top = `${(mins / 30) * ROW_H}px`;
}

function scrollToTimeDay() {
  const scroll = _dEl.querySelector("#dv-scroll");
  if (!scroll) return;
  requestAnimationFrame(() => {
    if (!_dEl || !_dDate) return;
    const now  = new Date();
    const mins = isoDate(_dDate) === isoToday()
      ? now.getHours() * 60 + now.getMinutes()
      : 8 * 60;
    scroll.scrollTop = Math.max(0, (mins / 30) * ROW_H - scroll.clientHeight / 2);
  });
}
