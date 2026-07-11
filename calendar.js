import { getEventsByRange } from "./eventService.js";
import { getEventExecutionSummaries } from "./activitySessionService.js";
import { describeExecutionIndicator } from "./activitySessionStats.js";
import { expandEvents } from "./recurrence.js";
import { pad, isoDate, isoToday } from "./utils.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock } from "./stateView.js";

let _showPersonal = () => true;

const MONTHS   = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

let container, calYear, calMonth, callbacks;
let _academicProvider = null;
let _fetchGeneration = 0; // AUD-007: descarta respostas de fetchAndRender() obsoletas em navegações rápidas

/** Registers a provider function (start, end) => Promise<AcademicEvent[]> */
export function setCalendarAcademicProvider(fn) {
  _academicProvider = fn;
}

/** Registers a predicate returning whether personal events are visible */
export function setCalendarPersonalVisibility(fn) {
  _showPersonal = fn;
}

// ── API pública ────────────────────────────────────────────────────────────

export async function initCalendar(el, cbs = {}) {
  container = el;
  callbacks = cbs;
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

// Chamada no logout/troca de usuário (ver script.js/onBeforeSignOut). Descarta
// o DOM renderizado e o estado do módulo: esta é uma SPA sem reload de página
// entre sessões, então os compromissos do usuário anterior não podem
// sobreviver no DOM durante a janela entre o logout e o próximo _initApp —
// mesma simetria init/reset dos demais subsistemas (auditoria A1.3). Com
// `container` zerado, refreshCalendar() volta a ser no-op até o próximo
// initCalendar().
export function resetCalendar() {
  if (container) container.innerHTML = "";
  container = null;
  callbacks = null;
  _academicProvider = null;
  _showPersonal = () => true;
  _fetchGeneration++; // descarta qualquer fetchAndRender() ainda em voo desta instância
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
  // AUD-007: cada chamada recebe uma geração própria; se o mês exibido mudar
  // de novo (nova navegação) antes desta resolver, esta geração fica obsoleta
  // e seu resultado é descartado — só a navegação mais recente chega a
  // renderizar.
  const generation = ++_fetchGeneration;

  updateTitle();
  showLoading();
  try {
    const start = monthStart(calYear, calMonth);
    const end   = monthEnd(calYear, calMonth);
    const [rawEvents, academicEvents] = await Promise.all([
      _showPersonal() ? getEventsByRange(start, end) : Promise.resolve([]),
      _academicProvider ? _academicProvider(start, end) : Promise.resolve([]),
    ]);
    const personal = expandEvents(rawEvents, start, end);
    const executionSummaries = await fetchExecutionSummaries(personal);
    if (generation !== _fetchGeneration) return; // navegação mais recente já assumiu a tela
    renderGrid(groupByDate([...personal, ...academicEvents]), executionSummaries);
  } catch (err) {
    if (generation !== _fetchGeneration) return;
    // Erro (rede/banco/sessão) não deve ser tratado como "mês sem eventos" —
    // renderiza um estado de erro distinto, com opção de tentar novamente,
    // em vez de uma grade vazia indistinguível de um mês sem compromissos.
    renderCalError(errorToState(handleError(err, { context: "calendar.fetchAndRender", silent: true })));
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

function renderCalError({ state, message }) {
  const body = container.querySelector("#cal-body");
  if (!body) return;
  body.innerHTML = `<div class="cal-error"></div>`;
  renderStateBlock(body.querySelector(".cal-error"), { state, message, onRetry: fetchAndRender });
}

// Busca os resumos de execução de todos os compromissos exibidos em uma
// única consulta em lote (evita N+1 — uma chamada por compromisso). Falha
// aqui nunca impede o mês de ser exibido: só os indicadores deixam de aparecer.
async function fetchExecutionSummaries(events) {
  const ids = [...new Set(events.map(ev => ev.id).filter(Boolean))];
  if (!ids.length) return {};
  try {
    return await getEventExecutionSummaries(ids);
  } catch (err) {
    handleError(err, { context: "calendar.executionSummaries", silent: true });
    return {};
  }
}

// ── Grade ──────────────────────────────────────────────────────────────────

// Chips de evento são <div>s — para serem operáveis por teclado (auditoria
// UX #03), cada chip clicável recebe role="button", entra na ordem de Tab e
// ativa com Enter/Espaço, espelhando o clique. Mesmo helper local em
// weekView.js (padrão do app: helpers pequenos são duplicados entre views).
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

function renderGrid(byDate, summaries = {}) {
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

    // Clique na célula → criar novo compromisso naquele dia
    if (!otherMonth && callbacks?.onDayClick) {
      cell.classList.add("cal-clickable");
      cell.addEventListener("click", () => callbacks.onDayClick(date));
    }

    const numEl = document.createElement("span");
    numEl.className = "cal-day-num";
    numEl.textContent = day;
    cell.appendChild(numEl);

    const chipsEl = document.createElement("div");
    chipsEl.className = "cal-chips";
    (byDate[date] || []).forEach(ev => {
      const chip = document.createElement("div");
      const isAcademic = !!ev._isAcademic;
      chip.className = isAcademic ? "cal-chip cal-chip-academic" : "cal-chip";
      chip.style.background = isAcademic
        ? (ev.color || ev._calendarColor || "#7c3aed")
        : (ev.color || "#3b82f6");
      chip.title = isAcademic
        ? `[${ev._calendarName}] ${ev.title}`
        : ev.title;
      chip.textContent = ev.title;

      if (!isAcademic) {
        const indicator = describeExecutionIndicator(summaries[ev.id]);
        if (indicator) {
          chip.classList.add(`cal-chip-${indicator.state}`);
          chip.textContent = `${indicator.icon} ${ev.title}`;
          chip.title = `${chip.title} — ${indicator.text}`;
        }
      }

      if (!isAcademic && callbacks?.onEventClick) {
        chip.classList.add("cal-chip-clickable");
        bindActivate(chip, (e) => {
          e.stopPropagation();
          callbacks.onEventClick(ev);
        });
      } else if (isAcademic && callbacks?.onAcademicEventClick) {
        chip.classList.add("cal-chip-clickable");
        bindActivate(chip, (e) => {
          e.stopPropagation();
          callbacks.onAcademicEventClick(ev);
        });
      }

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
    cells.push({ date: isoYMD(prevYear, prevMonthNum, d), day: d, otherMonth: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: isoYMD(calYear, calMonth + 1, d), day: d, otherMonth: false });
  }

  const nextMonthNum = calMonth === 11 ? 1 : calMonth + 2;         // 1-indexed
  const nextYear     = calMonth === 11 ? calYear + 1 : calYear;
  const trailing     = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let d = 1; d <= trailing; d++) {
    cells.push({ date: isoYMD(nextYear, nextMonthNum, d), day: d, otherMonth: true });
  }

  return cells;
}

function groupByDate(events) {
  return events.reduce((acc, ev) => {
    (acc[ev.event_date] ||= []).push(ev);
    return acc;
  }, {});
}

function monthStart(y, m) { return isoYMD(y, m + 1, 1); }
function monthEnd(y, m)   { return isoYMD(y, m + 1, new Date(y, m + 1, 0).getDate()); }
function isoYMD(y, m, d)  { return `${y}-${pad(m)}-${pad(d)}`; }
