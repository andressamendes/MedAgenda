import { getEventsByRange } from "./eventService.js";
import { expandEvents } from "./recurrence.js";
import { pad, isoDate, isoToday, mondayOf, escapeHtml } from "./utils.js";
import { handleError } from "./errorService.js";

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

// ── Public API ─────────────────────────────────────────────────────────────

export async function initWeekView(el, cbs = {}) {
  if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
  _el  = el;
  _cbs = cbs;
  _mon = mondayOf(new Date());
  buildShell();
  await fetchAndRender();
  _nowTimer = setInterval(updateNowLine, 60_000);
}

export async function refreshWeekView() {
  if (!_el) return;
  await fetchAndRender();
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
    renderEvents(personal);
    renderAcademicEvents(academicEvents);
  } catch (err) {
    // Erro (rede/banco/sessão) não deve ser tratado como "semana sem eventos" —
    // registrar via infraestrutura existente. Toast fica a cargo de loadEvents()
    // em script.js para não duplicar notificações no mesmo refreshAll().
    handleError(err, { context: "weekView.fetchAndRender", silent: true });
  }

  updateNowLine();
  scrollToTime();
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

function renderEvents(events) {
  events.forEach(ev => {
    if (!ev.start_time) return;

    const colIdx = dateToCol(ev.event_date);
    if (colIdx < 0) return;

    const [h, m] = ev.start_time.split(":").map(Number);
    const totalMin = h * 60 + m;
    const top    = (totalMin / 30) * ROW_H;
    const dur    = ev.duration_minutes || 30;
    const height = Math.max((dur / 30) * ROW_H - 2, 22);

    const block = document.createElement("div");
    block.className   = "wk-event";
    block.style.top      = `${top}px`;
    block.style.height   = `${height}px`;
    block.style.background = ev.color || "#3b82f6";
    block.innerHTML = `
      <span class="wk-ev-title">${escapeHtml(ev.title)}</span>
      ${ev.category ? `<span class="wk-ev-cat">${escapeHtml(ev.category)}</span>` : ""}
      <span class="wk-ev-time">${ev.start_time.slice(0, 5)}</span>
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
