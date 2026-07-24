// ── constancyHeatmapView.js — Heatmap de Constância (V5.1) ──────────────────
// Tela de apenas leitura: desenha um heatmap dos dias estudados nas últimas
// 12 semanas, no topo da página Progresso, acima da narrativa (F14.5). Toda
// a lógica de "quais dias foram estudados" já existe, pronta e testada, em
// studyStreakService.getStudyCalendar() — documentada desde a F6.11 como
// "pensada para consumo futuro por um widget de calendário" sem nunca ter
// sido conectada a nenhuma view. Este módulo só formata a grade; nenhum
// cálculo de constância é feito aqui.
//
// Só 84 dias (12 semanas) são desenhados, nunca todo o histórico — protege
// contas antigas de uma grade enorme (a única leitura relevante de "como
// tenho sido" é recente, não o histórico completo).

import { getStudyCalendar } from "./studyStreakService.js";
import { handleError } from "./errorService.js";
import { pad } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";

const WEEKS = 12;
const DAYS_PER_WEEK = 7;

function _dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _formatDate(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Segunda-feira da semana de `date` (getDay(): 0=domingo..6=sábado).
function _mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // 0 para segunda, 6 para domingo
  d.setDate(d.getDate() - offset);
  return d;
}

// Lista plana de 84 dias (12 semanas × 7 dias), da segunda-feira de
// (hoje − 11 semanas) até o domingo da semana atual. Ordem: dia 1..7 da
// semana mais antiga primeiro, dia 1..7 da semana mais recente por último —
// combinado com grid-auto-flow: column no CSS, isso desenha cada semana como
// uma coluna, da mais antiga (esquerda) à mais recente (direita), sem
// nenhuma estrutura aninhada no markup.
function _buildDays(calendar, today) {
  const currentMonday = _mondayOf(today);
  const startMonday = new Date(currentMonday);
  startMonday.setDate(startMonday.getDate() - (WEEKS - 1) * DAYS_PER_WEEK);

  const days = [];
  for (let i = 0; i < WEEKS * DAYS_PER_WEEK; i++) {
    const date = new Date(startMonday);
    date.setDate(date.getDate() + i);
    const key = _dayKey(date);
    days.push({
      date,
      key,
      studied: Boolean(calendar[key]),
      future: date > today,
    });
  }
  return days;
}

function _cellsMarkup(days) {
  return days.map(day => {
    if (day.future) {
      return `<span class="heatmap-cell heatmap-cell--future" aria-hidden="true"></span>`;
    }
    const stateClass = day.studied ? "heatmap-cell--studied" : "heatmap-cell--empty";
    const label = `${_formatDate(day.date)} — ${day.studied ? "Estudou" : "Não estudou"}`;
    return `<span class="heatmap-cell ${stateClass}" title="${label}" aria-hidden="true"></span>`;
  }).join("");
}

function _summaryLabel(days) {
  const studiedCount = days.filter(d => d.studied).length;
  const totalPastDays = days.filter(d => !d.future).length;
  return `Heatmap de constância: ${studiedCount} de ${totalPastDays} dias estudados nas últimas ${WEEKS} semanas.`;
}

function _markup(calendar) {
  const days = _buildDays(calendar, new Date());
  return `
    <div class="heatmap-grid" role="img" aria-label="${_summaryLabel(days)}">
      ${_cellsMarkup(days)}
    </div>
    <div class="heatmap-legend">
      <span class="heatmap-swatch heatmap-swatch--empty" aria-hidden="true"></span>
      <span>Não estudou</span>
      <span class="heatmap-swatch heatmap-swatch--studied" aria-hidden="true"></span>
      <span>Estudou</span>
    </div>
  `;
}

let heatmapEl = null;
let _unsubscribers = [];
let _reloadTimer = null;
let _loading = false;

async function _load() {
  if (!heatmapEl || _loading) return;
  _loading = true;
  try {
    const calendar = await getStudyCalendar();
    heatmapEl.innerHTML = _markup(calendar);
  } catch (err) {
    handleError(err, { context: "constancyHeatmapView.load", silent: true });
    heatmapEl.innerHTML = `<p class="progress-narrative-fallback">Não foi possível carregar o heatmap de constância.</p>`;
  } finally {
    _loading = false;
  }
}

// Mesmo padrão de debounce de activityDashboardView._scheduleReload(): vários
// eventos em sequência imediata (ex.: Updated seguido de Finished) recarregam
// a grade uma única vez.
function _scheduleReload() {
  if (_reloadTimer) return;
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null;
    _load();
  }, 0);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return;
  _unsubscribers = [
    subscribe(SESSION_EVENTS.STARTED, _scheduleReload),
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

export async function initConstancyHeatmapView() {
  if (!heatmapEl) heatmapEl = document.getElementById("constancy-heatmap");
  _subscribeToEventBus();
  await _load();
}

export function resetConstancyHeatmapView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }
  if (heatmapEl) heatmapEl.innerHTML = "";
  _loading = false;
}
