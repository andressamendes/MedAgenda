// ── assistantView.js — Assistente Inteligente local (análise de eventos)

import { analyzeEvents } from "./smartAssistant.js";
import { computeStats } from "./analytics.js";
import { escapeHtml } from "./utils.js";

// ── Module-level state ────────────────────────────────────────────────────────
let _assistantSection = null;
let _assistantBody    = null;
let _assistantHidden  = false;
let _lastEvents       = [];

// Called by onBeforeSignOut so the assistant re-appears after the next login.
export function resetAssistant() {
  _assistantHidden = false;
}

export function initAssistantView() {
  _assistantSection        = document.getElementById('assistant-section');
  _assistantBody           = document.getElementById('assistant-body');
  const assistantClose     = document.getElementById('assistant-close');
  const btnShowAssistant   = document.getElementById('btn-show-assistant');

  assistantClose?.addEventListener('click', () => {
    if (_assistantSection) {
      _assistantSection.hidden = true;
      _assistantHidden = true;
      if (btnShowAssistant) btnShowAssistant.hidden = false;
    }
  });

  btnShowAssistant?.addEventListener('click', () => {
    _assistantHidden = false;
    btnShowAssistant.hidden = true;
    renderAssistant(_lastEvents);
  });
}

export function renderAssistant(events) {
  _lastEvents = events;
  if (!_assistantSection || !_assistantBody) return;
  if (_assistantHidden) return;
  _assistantSection.hidden = false;

  const btnShowAssistant = document.getElementById('btn-show-assistant');
  if (btnShowAssistant) btnShowAssistant.hidden = true;

  const { alerts, suggestions } = analyzeEvents(events);
  const stats = computeStats(events);

  _assistantBody.innerHTML = '';

  if (!events.length) {
    _assistantBody.innerHTML = `<p class="assistant-empty-state">Nenhum compromisso encontrado. Adicione eventos para receber análises personalizadas.</p>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'assistant-grid';

  // ── Card: Alertas (conflitos) ──
  const errorAlerts   = alerts.filter(a => a.severity === 'error');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');
  const allAlerts     = [...errorAlerts, ...warningAlerts];

  grid.appendChild(_buildCard(
    allAlerts.length > 0 ? 'error' : 'success',
    '⚠ Conflitos e Alertas',
    allAlerts.length > 0 ? allAlerts : null,
    allAlerts.length === 0 ? 'Nenhum conflito ou alerta detectado.' : null
  ));

  // ── Card: Sugestões ──
  grid.appendChild(_buildCard(
    suggestions.length > 0 ? 'info' : 'success',
    '💡 Sugestões',
    suggestions.length > 0 ? suggestions : null,
    suggestions.length === 0 ? 'Agenda equilibrada. Continue assim!' : null
  ));

  // ── Card: Estatísticas do mês ──
  grid.appendChild(_buildStatsCard(stats));

  // ── Card: Próximos eventos ──
  grid.appendChild(_buildUpcomingCard(stats.upcoming));

  _assistantBody.appendChild(grid);
}

function _buildCard(severity, title, items, emptyMsg) {
  const card = document.createElement('div');
  card.className = `assistant-card assistant-card--${severity}`;

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = title;
  card.appendChild(h);

  if (items && items.length > 0) {
    const list = document.createElement('div');
    list.className = 'assistant-card-items';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'assistant-card-item';
      row.textContent = item.message;
      list.appendChild(row);
    });
    card.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = emptyMsg || '';
    card.appendChild(empty);
  }

  return card;
}

function _buildStatsCard(stats) {
  const card = document.createElement('div');
  card.className = 'assistant-card assistant-card--neutral';

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = '📈 Este mês';
  card.appendChild(h);

  const summary = document.createElement('div');
  summary.className = 'assistant-summary';
  summary.innerHTML = `
    <span class="assistant-stat-pill"><strong>${stats.totalThisMonth}</strong> eventos</span>
    <span class="assistant-stat-pill"><strong>${stats.totalHours}h</strong> de atividades</span>
  `;
  card.appendChild(summary);

  if (stats.topCategories.length > 0) {
    const maxHours = stats.topCategories[0].hours || 1;
    stats.topCategories.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'stat-bar-row';
      const pct = Math.round((cat.hours / maxHours) * 100);
      row.innerHTML = `
        <span class="stat-bar-label">${escapeHtml(cat.name)}</span>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="stat-bar-value">${cat.hours}h</span>
      `;
      card.appendChild(row);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = 'Sem dados de horas neste mês.';
    card.appendChild(empty);
  }

  return card;
}

function _buildUpcomingCard(upcoming) {
  const card = document.createElement('div');
  card.className = 'assistant-card assistant-card--neutral';

  const h = document.createElement('div');
  h.className = 'assistant-card-title';
  h.textContent = '📅 Próximos 7 dias';
  card.appendChild(h);

  if (!upcoming.length) {
    const empty = document.createElement('p');
    empty.className = 'assistant-card-empty';
    empty.textContent = 'Nenhum evento nos próximos 7 dias.';
    card.appendChild(empty);
    return card;
  }

  upcoming.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'upcoming-event-row';

    const [, m, d] = ev.event_date.split('-');
    const dateLabel = `${d}/${m}`;
    const timeLabel = ev.start_time ? ev.start_time.slice(0, 5) : '';
    const meta = [dateLabel, timeLabel, ev.category].filter(Boolean).join(' · ');

    row.innerHTML = `
      <div class="upcoming-event-dot" style="background:${escapeHtml(ev.color || '#6b7280')}"></div>
      <div class="upcoming-event-info">
        <div class="upcoming-event-title">${escapeHtml(ev.title)}</div>
        <div class="upcoming-event-meta">${escapeHtml(meta)}</div>
      </div>
    `;
    card.appendChild(row);
  });

  return card;
}
