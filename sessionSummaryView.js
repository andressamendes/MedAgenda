// ── sessionSummaryView.js — Resumo Final da Sessão concluída (F7.10) ───────
// Fechamento visual, somente leitura, mostrado depois que a Sessão de Estudo
// já foi encerrada (studySessionView.js/_confirmFinish chama
// activitySessionService.finishSession() e só então abre este resumo).
// Nenhum dado é calculado ou consultado aqui: todos os campos chegam prontos
// de quem já resolveu esse mesmo domínio — activitySessionService.js
// (sessão finalizada), eventService.js (via _resolveEventMeta, reaproveitado
// do resumo de encerramento F7.3) e as contagens de Questões/Revisões que o
// próprio fluxo de encerramento já conhecia antes de persistir. Nenhum evento
// novo é publicado e nenhuma tabela é consultada diretamente.

import { showPage } from "./navigationView.js";
import { initModal } from "./modalController.js";
import { pad } from "./utils.js";

const NO_EVENT_TEXT = "Sem compromisso vinculado";

let modalEl, modal;
let titleEl, categoryEl, subjectEl, contentEl, startedAtEl, endedAtEl;
let cardNetTimeEl, cardQuestionsEl, cardReviewsEl, cardStatusEl;
let notesBlockEl, notesEl;
let btnDashboard, btnHistory;

const STATUS_LABELS = {
  finished:  "Concluída",
  cancelled: "Cancelada",
};

function _queryElements() {
  modalEl = document.getElementById("ss-summary-modal");

  titleEl     = document.getElementById("sss-event-title");
  categoryEl  = document.getElementById("sss-category");
  subjectEl   = document.getElementById("sss-subject");
  contentEl   = document.getElementById("sss-content");
  startedAtEl = document.getElementById("sss-started-at");
  endedAtEl   = document.getElementById("sss-ended-at");

  cardNetTimeEl   = document.getElementById("sss-card-net-time");
  cardQuestionsEl = document.getElementById("sss-card-questions");
  cardReviewsEl   = document.getElementById("sss-card-reviews");
  cardStatusEl    = document.getElementById("sss-card-status");

  notesBlockEl = document.getElementById("sss-notes-block");
  notesEl      = document.getElementById("sss-notes");

  btnDashboard = document.getElementById("sss-btn-dashboard");
  btnHistory   = document.getElementById("sss-btn-history");

  modal = initModal(modalEl, _close);
}

function _bindEvents() {
  btnDashboard.addEventListener("click", () => { _close(); showPage("dashboard"); });
  btnHistory.addEventListener("click",   () => { _close(); showPage("history"); });
}

function _close() {
  modal.close();
}

function _formatClockTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatNetTime(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _fieldText(value, eventMeta) {
  if (value) return value;
  return eventMeta ? "—" : NO_EVENT_TEXT;
}

/**
 * Abre o resumo final da Sessão concluída.
 *
 * @param {object} data
 * @param {object|null} data.eventMeta   - { title, category, description } já resolvido por eventService.js (mesmo formato de _eventMeta em studySessionView.js), ou null para sessão avulsa.
 * @param {string} data.startedAt        - session.started_at (ISO), como devolvido por activitySessionService.
 * @param {string|Date} data.endedAt     - session.ended_at (ISO) devolvido por activitySessionService.finishSession(), ou o horário congelado no resumo de encerramento.
 * @param {number|null} data.netMinutes  - duration_minutes já calculado por activitySessionService.finishSession() (nenhum recálculo aqui).
 * @param {string} data.status           - session.status devolvido por finishSession() (ex.: "finished").
 * @param {number} data.questionsCount   - quantidade de questões registradas nesta sessão (já conhecida pelo fluxo de encerramento, F7.4).
 * @param {number} data.reviewsCount     - quantidade de revisões associadas/criadas nesta sessão (já conhecida pelo fluxo de encerramento, F7.5).
 * @param {string} [data.notes]          - observações digitadas no resumo de encerramento, se houver.
 */
export function openSessionSummary(data) {
  initSessionSummaryView();

  const eventMeta = data.eventMeta || null;

  titleEl.textContent    = eventMeta?.title || "Sessão avulsa";
  categoryEl.textContent = _fieldText(eventMeta?.category, eventMeta);
  subjectEl.textContent  = _fieldText(eventMeta?.category, eventMeta); // mesmo placeholder do resumo de encerramento — domínio ainda não tem campo próprio de matéria
  contentEl.textContent  = _fieldText(eventMeta?.description, eventMeta);

  startedAtEl.textContent = _formatClockTime(data.startedAt);
  endedAtEl.textContent   = _formatClockTime(data.endedAt);

  cardNetTimeEl.textContent   = _formatNetTime(data.netMinutes);
  cardQuestionsEl.textContent = String(data.questionsCount ?? 0);
  cardReviewsEl.textContent   = String(data.reviewsCount ?? 0);
  cardStatusEl.textContent    = STATUS_LABELS[data.status] || data.status || "—";

  const notes = (data.notes || "").trim();
  notesBlockEl.hidden = notes.length === 0;
  notesEl.textContent = notes;

  modal.open(btnDashboard);
}

export function initSessionSummaryView() {
  // ownerDocument muda em cenários de teste (cada teste recarrega o DOM sem
  // recarregar este módulo) — reconsultar os elementos quando o documento
  // muda evita referências obsoletas; em produção o documento nunca muda
  // durante o ciclo de vida do app, então isto continua sendo uma única
  // consulta/ligação de eventos, como qualquer outra view.
  if (!modalEl || modalEl.ownerDocument !== document) {
    _queryElements();
    _bindEvents();
  }
}
