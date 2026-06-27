import { getEventsByRange } from "./eventService.js";

const MONTHS   = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

let container, calYear, calMonth;

// ── API pública ────────────────────────────────────────────────────────────

export async function initCalendar(el) {
  container = el;
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth(); // 0-indexed
  buildShell();
  await fetchAndRender();
}

export async function refreshCalendar() {
  if (!container) return;
  await fetchAndRender();
}

// ── Shell (estrutura estática — criada uma vez) ────────────────────────────

function buildShell() {
  container.innerHTML = `
    <div class="cal-header">
      <button class="btn btn-sm btn-ghost" id="cal-prev" aria-label="Mês anterior">‹</button>
      <h2 class="cal-title" id="cal-title"></h2>
      <button class="btn btn-sm btn-ghost" id="cal-next" aria-label="Próximo mês">›</button>
      <button class="btn btn-sm btn-ghost" id="cal-today">Hoje</button>
    </div>
    <div class="cal-weekdays">
      ${WEEKDAYS.map(d => `<div>${d}</div>`).join("")}
    </div>
    <div class="cal-body" id="cal-body"></div>
  `;

  container.querySelector("#cal-prev").addEventListener("click",  () => navigate(-1));
  container.querySelector("#cal-next").addEventListener("click",  () => navigate(1));
  container.querySelector("#cal-today").addEventListener("click", goToday);
}

// ── Navegação ──────────────────────────────────────────────────────────────

async function navigate(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  await fetchAndRender();
}

async function goToday() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  await fetchAndRender();
}

// ── Busca e renderização ───────────────────────────────────────────────────

async function fetchAndRender() {
  updateTitle();
  showLoading();
  try {
    const start = monthStart(calYear, calMonth);
    const end   = monthEnd(calYear, calMonth);
    const events = await getEventsByRange(start, end);
    renderGrid(groupByDate(events));
  } catch {
    renderGrid({});
  }
}

function updateTitle() {
  const el = container.querySelector("#cal-title");
  if (el) el.textContent = `${MONTHS[calMonth]} ${calYear}`;
}

function showLoading() {
  const body = container.querySelector("#cal-body");
  if (body) body.innerHTML = `<div class="cal-loading">Carregando…</div>`;
}

// ── Grade ──────────────────────────────────────────────────────────────────

function renderGrid(byDate) {
  const body = container.querySelector("#cal-body");
  if (!body) return;

  const todayISO = isoToday();
  body.innerHTML = "";

  buildCells().forEach(({ date, day, otherMonth }) => {
    const isToday = date === todayISO;
    const cell = document.createElement("div");
    cell.className = [
      "cal-cell",
      otherMonth ? "cal-other" : "",
      isToday    ? "cal-today" : "",
    ].filter(Boolean).join(" ");

    const numEl = document.createElement("span");
    numEl.className = "cal-day-num";
    numEl.textContent = day;
    cell.appendChild(numEl);

    const chipsEl = document.createElement("div");
    chipsEl.className = "cal-chips";
    (byDate[date] || []).forEach(ev => {
      const chip = document.createElement("div");
      chip.className = "cal-chip";
      chip.style.background = ev.color || "#3b82f6";
      chip.title = ev.title;
      chip.textContent = ev.title;
      chipsEl.appendChild(chip);
    });
    cell.appendChild(chipsEl);

    body.appendChild(cell);
  });
}

// ── Helpers de data ────────────────────────────────────────────────────────

function buildCells() {
  const cells = [];
  const firstDow    = new Date(calYear, calMonth, 1).getDay();     // 0=Dom
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();

  const prevMonthNum = calMonth === 0 ? 12 : calMonth;             // 1-indexed
  const prevYear     = calMonth === 0 ? calYear - 1 : calYear;

  for (let i = 0; i < firstDow; i++) {
    const d = daysInPrev - firstDow + 1 + i;
    cells.push({ date: iso(prevYear, prevMonthNum, d), day: d, otherMonth: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: iso(calYear, calMonth + 1, d), day: d, otherMonth: false });
  }

  const nextMonthNum = calMonth === 11 ? 1 : calMonth + 2;         // 1-indexed
  const nextYear     = calMonth === 11 ? calYear + 1 : calYear;
  const trailing     = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let d = 1; d <= trailing; d++) {
    cells.push({ date: iso(nextYear, nextMonthNum, d), day: d, otherMonth: true });
  }

  return cells;
}

function groupByDate(events) {
  return events.reduce((acc, ev) => {
    (acc[ev.event_date] ||= []).push(ev);
    return acc;
  }, {});
}

function monthStart(y, m) { return iso(y, m + 1, 1); }
function monthEnd(y, m)   { return iso(y, m + 1, new Date(y, m + 1, 0).getDate()); }
function iso(y, m, d)     { return `${y}-${pad(m)}-${pad(d)}`; }
function isoToday()       { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function pad(n)           { return String(n).padStart(2, "0"); }
