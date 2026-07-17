// ── studyJournalView.js — Linha do Tempo da Aprendizagem (F8.1–F8.4) ───────
// Tela majoritariamente de consulta, foco narrativo: cada Sessão concluída
// vira um registro cronológico da jornada de estudo. Reutiliza
// exclusivamente activitySessionService.listSessions() (mesmo contrato
// paginado do Histórico, F1.8), eventService.getEvents() (metadados do
// compromisso), sessionQuestionsService.listQuestionsBySessions() e
// reviewSessionService.listBySessions() (F8.1) — nenhum acesso direto ao
// banco para esses dados, nenhum SQL novo, nenhum evento novo —
// sessionEventBus.js não é tocado, só assinado (mesmo padrão de
// activityHistoryView.js/F6.3).
//
// AUD-002 — carregamento em lote: questões, revisões e reflexão de todas as
// sessões de uma página são buscadas em três consultas (uma por domínio,
// via `in (session_id...)`), nunca uma consulta por sessão — ver
// _fetchPageExtras(). Isso elimina o N+1 que existia aqui (uma chamada a
// listQuestions()/listBySession()/getBySession() por sessão, cada uma delas
// ainda validando a existência da sessão de novo, apesar de já ter acabado
// de vir de listSessions() na mesma página).
//
// A única escrita desta tela é a Reflexão (F8.2), via
// studyReflectionService.js — um domínio próprio, separado de Observações
// (activity_sessions.notes): Observações representam o estudo, Reflexão
// representa a aprendizagem. Nenhum outro domínio (Dashboard, Insights, IA,
// Conquistas, Progresso, Estatísticas) é lido ou alterado por essa escrita.
//
// F8.3 — agrupamento por dia: puramente uma reorganização visual das mesmas
// sessões retornadas por listSessions() (já ordenadas started_at desc, ver
// activitySessionService.js). Nenhum dado novo é buscado ou persistido; data,
// contagem de sessões e tempo líquido do cabeçalho diário são derivados em
// memória das sessões já carregadas na página atual.
//
// F8.4 — filtros e navegação: período, categoria e busca textual (o filtro
// de matéria foi removido na auditoria UX #05 — era sempre idêntico ao de
// categoria, pois o domínio não tem campo próprio de matéria)
// operam inteiramente sobre `_allEntries`, o acumulado em memória das
// sessões (+ metadados do compromisso + questões/revisões/reflexão) já
// carregadas via "Carregar mais" — trocar um filtro nunca dispara uma nova
// chamada a listSessions()/getEvents()/listQuestionsBySessions()/
// listBySessions(); apenas re-renderiza o mesmo array já resolvido. As opções
// de categoria do <select> são derivadas do próprio conjunto
// carregado (nenhuma consulta a subjectProgressService/categoryService).
//
// F8.5 — Linha do Tempo da Evolução: cartões de resumo diário/semanal e
// indicadores de evolução entre grupos de dia. Toda a agregação vive em
// studyTimelineService.js (função pura, sem I/O) e é recalculada a cada
// _render() a partir de `filtered` — o mesmo array já filtrado pelo F8.4 —
// então os resumos automaticamente só consideram as sessões atualmente
// visíveis, sem nenhuma consulta nova a studyStreakService/
// subjectProgressService/questionService/activitySessionService (ver
// cabeçalho de studyTimelineService.js). Os cartões são elementos novos
// inseridos entre/dentro dos grupos existentes — nunca substituem
// `.sj-day-group`/`.sj-entry`, nunca alteram o HTML já renderizado por eles.
//
// F8.6 — Síntese Periódica de Aprendizado: acrescenta ao cartão de resumo
// semanal (F8.5) um texto narrativo totalmente derivado das mesmas entradas
// visíveis daquela semana, produzido por buildWeeklySummary()
// (studySummaryService.js — função pura, sem I/O, sem IA). Nenhuma consulta
// nova, nenhuma persistência, nenhum outro domínio tocado.
//
// F8.7 — Marcos da Evolução: timeline somente-leitura com os acontecimentos
// importantes da jornada (primeira sessão, limiares de tempo/questões/
// matérias, recordes, constância), produzida por buildMilestones()
// (studyMilestoneService.js — função pura, sem I/O, sem IA) sobre `filtered`
// — o mesmo array já filtrado pelo F8.4. Recalculado a cada _render(), então
// os marcos também só consideram as sessões atualmente visíveis; nenhuma
// consulta nova, nenhum dado persistido, nenhum outro domínio (Dashboard,
// Insights, Conquistas) tocado.
//
// F10 #3.2 — Movido para fora da lista de sessões: antes era o primeiro
// <li> de #sj-list, competindo visualmente com a própria timeline de
// sessões logo abaixo dele. Agora vive em #sj-milestones-panel, um
// <details> recolhido por padrão (mesmo padrão do F10 #1.4 — sj-week-
// narrative), separado da lista e sem concorrer pela atenção do usuário ao
// abrir o Diário. buildMilestones() e os dados considerados não mudaram.
//
// F8.8 — Busca Avançada e Linha do Tempo Inteligente: substitui a busca
// textual simples do F8.4 (só compromisso/conteúdo/observações/reflexão,
// `String.includes` puro) e acrescenta os novos filtros combináveis
// (reflexão/observações/revisões/questões/duração/tipo/status/dificuldade)
// via studySearchService.js (função pura, sem I/O). A View permanece
// responsável só por capturar os filtros, montar/reaproveitar o índice
// (buildSearchIndex — reconstruído apenas quando `_allEntries` muda, nunca
// a cada troca de filtro) e renderizar `searchEntries()` — nenhuma lógica
// de busca vive aqui. período/categoria continuam sendo aplicados
// pela própria View (F8.4, inalterado) antes de studySearchService, na
// mesma passada — todos os filtros são combinados juntos, sem prioridade
// entre eles.

import { listSessions } from "./activitySessionService.js";
import { getEvents } from "./eventService.js";
import { listQuestionsBySessions } from "./sessionQuestionsService.js";
import { listBySessions as listReviewsBySessions } from "./reviewSessionService.js";
import { listBySessions as listReflectionsBySessions, saveReflection } from "./studyReflectionService.js";
import { handleError } from "./errorService.js";
import { errorToState, renderStateBlock, clearStateBlock } from "./stateView.js";
import { skeletonRowsMarkup } from "./skeletonView.js";
import { toast } from "./toastService.js";
import { pad, localDate, escapeHtml } from "./utils.js";
import { SESSION_EVENTS, subscribe } from "./sessionEventBus.js";
import {
  summarizeDayEntries,
  compareDailySummaries,
  weekKeyOf,
  weekLabel,
  summarizeWeekGroups,
} from "./studyTimelineService.js";
import { buildWeeklySummary } from "./studySummaryService.js";
import { buildMilestones } from "./studyMilestoneService.js";
import { iconClipboard, iconClock, iconBarChart, iconSparkle, iconLayers } from "./icons.js";
import { buildSearchIndex, searchEntries, highlightMatches, searchStats } from "./studySearchService.js";

const PAGE_SIZE = 10;

// Rótulos de exibição — mesmos valores já usados em studySessionView.js
// (F7.4/F7.5) e permitidos pelos CHECK constraints de sql/15_questions.sql/
// sql/13_reviews.sql, nenhum valor novo.
const QUESTION_TYPE_LABELS = {
  multiple_choice: "Múltipla escolha",
  true_false:      "Verdadeiro/Falso",
  open:             "Dissertativa",
  flashcard:        "Flashcard",
};
const QUESTION_STATUS_LABELS = {
  pending:  "Pendente",
  answered: "Respondida",
  skipped:  "Pulada",
};
const REVIEW_STATUS_LABELS = {
  pending:   "Pendente",
  completed: "Concluída",
  skipped:   "Pulada",
};

let listEl, emptyEl, loadMoreBtn, statsEl, partialNoticeEl;
let milestonesPanelEl, milestonesListEl;
let periodSelect, categorySelect, searchInput;
let questionTypeSelect, questionStatusSelect, questionDifficultySelect;
let reflectionCheck, notesCheck, reviewsCheck, questionsCheck, noQuestionsCheck, longCheck, shortCheck;
let advancedToggleBtn, advancedFiltersEl, advancedCountEl;
let moreFlagsToggleBtn, moreFlagsEl;

let _offset  = 0;
let _loading = false;
let _hasMore = false; // ainda existem sessões no servidor além das carregadas (auditoria UX #02)

// Resolvido uma única vez por página carregada (não por cartão) — mesma
// otimização N+1 de activityHistoryView.js/_loadLookups().
let _eventsById = new Map();

let _unsubscribers = [];
let _reloadTimer   = null;

// Acumulado em memória de tudo que já foi carregado (todas as páginas até
// agora), na mesma ordem started_at desc devolvida por listSessions() — a
// base sobre a qual os filtros (F8.4/F8.8) operam sem nenhuma consulta nova.
// Cada item: { session, meta, extras }.
let _allEntries = [];

// Índice de busca (F8.8/studySearchService.js) — reconstruído apenas
// quando `_allEntries` muda (_loadEntriesData), nunca a cada troca de
// filtro; searchEntries() consulta este índice já pronto em _render().
let _searchIndex = [];

const _DEFAULT_FILTERS = {
  period: "all", category: "", search: "",
  onlyWithReflection: false, onlyWithNotes: false, onlyWithReviews: false,
  onlyWithQuestions: false, onlyWithoutQuestions: false,
  onlyLong: false, onlyShort: false,
  questionType: "", questionStatus: "", questionDifficulty: "",
};

// Estado dos filtros (F8.4/F8.8) — puramente client-side, nenhum valor novo
// persistido. `search` já normalizado (trim) ao ser lido do input —
// studySearchService.js normaliza caixa/acentos/espaços internamente.
let _filters = { ..._DEFAULT_FILTERS };

// Filtros que vivem atrás de "Filtros avançados" (auditoria UX #21) — todos
// exceto período/busca, que continuam sempre visíveis na toolbar principal.
const ADVANCED_FILTER_KEYS = Object.keys(_DEFAULT_FILTERS).filter(k => k !== "period" && k !== "search");

function _scheduleReload() {
  if (_reloadTimer) return;
  _reloadTimer = setTimeout(() => {
    _reloadTimer = null;
    _loadPage(true);
  }, 0);
}

function _subscribeToEventBus() {
  if (_unsubscribers.length > 0) return; // já assinado — initStudyJournalView pode rodar mais de uma vez
  _unsubscribers = [
    subscribe(SESSION_EVENTS.FINISHED, _scheduleReload),
    subscribe(SESSION_EVENTS.CANCELLED, _scheduleReload),
    subscribe(SESSION_EVENTS.UPDATED, _scheduleReload),
  ];
}

async function _loadEventsLookup() {
  try {
    const events = await getEvents();
    _eventsById = new Map(events.map(e => [e.id, e]));
  } catch (err) {
    handleError(err, { context: "studyJournalView.loadEventsLookup", silent: true });
    _eventsById = new Map();
  }
}

// `subject` reaproveita a mesma categoria do compromisso — o domínio ainda
// não tem um campo próprio de matéria (ver subjectProgressService.js). A UI
// não exibe mais um rótulo "Matéria" separado (auditoria UX #05), mas os
// serviços puros de resumo/busca (studySummaryService/studySearchService)
// continuam lendo meta.subject — o campo permanece no meta para preservar
// esses contratos.
function _resolveMeta(session) {
  const event = session.event_id ? _eventsById.get(session.event_id) : null;
  if (session.event_id && !event) {
    return { title: "Compromisso removido", category: null, subject: null, content: null };
  }
  return {
    title:   event?.title || "Sessão sem compromisso",
    category: event?.category || null,
    subject:  event?.category || null,
    content:  event?.description || null,
  };
}

function _formatDate(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function _formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function _formatReviewDate(dateStr) {
  if (!dateStr) return "—";
  const d = localDate(dateStr);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Agrupamento diário (F8.3) ───────────────────────────────────────────
// Chave/rótulo derivados apenas de started_at (data local) — mesma sessão,
// nenhum campo novo. "Hoje"/"Ontem" comparam por ano/mês/dia local, sem
// round-trip por ISO/UTC (evita virar o dia perto da meia-noite em fusos
// negativos).
function _dayKeyFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _dayKey(iso) {
  return _dayKeyFromDate(new Date(iso));
}

function _dayLabel(iso) {
  const key = _dayKey(iso);
  const now = new Date();
  if (key === _dayKeyFromDate(now)) return "Hoje";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === _dayKeyFromDate(yesterday)) return "Ontem";
  return _formatDate(iso);
}

// ── Questões/Revisões/Reflexão da página (contagem no cartão + detalhamento,
// AUD-002) ──────────────────────────────────────────────────────────────
// O cartão precisa mostrar "quantidade de questões" e "quantidade de
// revisões" sem exigir que o usuário expanda o registro — por isso a busca
// acontece uma vez por página inteira (não por sessão): as três consultas em
// lote abaixo trazem questões/revisões/reflexões de todas as sessões da
// página de uma só vez, evitando o N+1 de uma chamada por sessão. O
// resultado é reutilizado tanto para a contagem quanto para o detalhamento
// expandido, sem refazer a busca ao expandir.
async function _fetchPageExtras(sessions) {
  const ids = sessions.map(s => s.id);
  try {
    const [questionsBySession, reviewsBySession, reflectionsBySession] = await Promise.all([
      listQuestionsBySessions(ids),
      listReviewsBySessions(ids),
      listReflectionsBySessions(ids),
    ]);
    return sessions.map(s => ({
      questions: questionsBySession[s.id] || [],
      reviews: reviewsBySession[s.id] || [],
      reflection: reflectionsBySession[s.id] || null,
    }));
  } catch (err) {
    handleError(err, { context: "studyJournalView.fetchPageExtras", silent: true });
    return sessions.map(() => ({ questions: [], reviews: [], reflection: null, loadError: true }));
  }
}

// ── Reflexão da sessão (F8.2) ────────────────────────────────────────────
// Bloco à parte de Observações: Observações vêm de activity_sessions.notes
// (o estudo em si), Reflexão vem de studyReflectionService.js (a
// aprendizagem) — nunca a mesma fonte, nunca o mesmo domínio.

function _renderReflectionView(sectionEl, entry, reflection, query = "") {
  sectionEl.innerHTML = `
    ${reflection
      ? `<p class="sj-reflection-text">${highlightMatches(reflection.content, query)}</p>`
      : `<p class="sj-detail-empty">Sem reflexão.</p>`}
    <button type="button" class="btn btn-ghost btn-sm sj-reflection-toggle">
      ${reflection ? "Editar reflexão" : "Adicionar reflexão"}
    </button>
  `;
  sectionEl.querySelector(".sj-reflection-toggle")
    .addEventListener("click", () => _renderReflectionForm(sectionEl, entry, reflection));
}

function _renderReflectionForm(sectionEl, entry, reflection) {
  sectionEl.innerHTML = `
    <textarea class="sj-reflection-input" rows="4">${reflection ? escapeHtml(reflection.content) : ""}</textarea>
    <p class="sj-reflection-error" hidden></p>
    <div class="sj-reflection-actions">
      <button type="button" class="btn btn-primary btn-sm sj-reflection-save">Salvar</button>
      <button type="button" class="btn btn-ghost btn-sm sj-reflection-cancel">Cancelar</button>
    </div>
  `;

  const textarea = sectionEl.querySelector(".sj-reflection-input");
  const errorEl  = sectionEl.querySelector(".sj-reflection-error");

  sectionEl.querySelector(".sj-reflection-cancel")
    .addEventListener("click", () => _renderReflectionView(sectionEl, entry, reflection, _filters.search));

  sectionEl.querySelector(".sj-reflection-save").addEventListener("click", async () => {
    errorEl.hidden = true;
    try {
      const saved = await saveReflection(entry.session.id, textarea.value);
      // Mantém _allEntries consistente (mesmo objeto usado pela busca do
      // F8.4/F8.8) sem refazer getBySession — a resposta de saveReflection
      // já é a reflexão salva. Reconstrói o índice de busca (F8.8) já que
      // `_allEntries` mudou — mesma regra de _loadEntriesData.
      entry.extras.reflection = saved;
      _searchIndex = buildSearchIndex(_allEntries);
      _renderReflectionView(sectionEl, entry, saved, _filters.search);
      // Auditoria UX #22: salvar reflexão só fazia o texto reaparecer
      // renderizado — sem toast, era a única escrita da tela sem confirmação.
      toast.success("Reflexão salva.");
    } catch (err) {
      const { friendly } = handleError(err, { context: "studyJournalView.saveReflection", silent: true });
      errorEl.textContent = friendly;
      errorEl.hidden = false;
    }
  });
}

function _renderDetail(detailEl, questions, reviews, notes, query = "") {
  const questionsHtml = questions.length
    ? `<ul class="sj-detail-items">${questions.map(q => `
        <li class="sj-detail-item">
          <span>${highlightMatches(QUESTION_TYPE_LABELS[q.question_type] || q.question_type, query)}</span>
          <span>${highlightMatches(QUESTION_STATUS_LABELS[q.status] || q.status, query)}</span>
          ${[q.subject, q.topic].filter(Boolean).map(t => highlightMatches(t, query)).join(" — ")}
        </li>`).join("")}</ul>`
    : `<p class="sj-detail-empty">Nenhuma questão registrada.</p>`;

  const reviewsHtml = reviews.length
    ? `<ul class="sj-detail-items">${reviews.map(r => `
        <li class="sj-detail-item">
          <span>${_formatReviewDate(r.scheduled_date)}</span>
          <span class="review-status review-status--${r.status}">${REVIEW_STATUS_LABELS[r.status] || r.status}</span>
        </li>`).join("")}</ul>`
    : `<p class="sj-detail-empty">Nenhuma revisão vinculada.</p>`;

  const notesHtml = notes
    ? `<p class="sj-detail-notes">${highlightMatches(notes, query)}</p>`
    : `<p class="sj-detail-empty">Nenhuma observação registrada.</p>`;

  detailEl.innerHTML = `
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Questões</h3>
      ${questionsHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Revisões</h3>
      ${reviewsHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Observações</h3>
      ${notesHtml}
    </div>
    <div class="sj-detail-section">
      <h3 class="sj-detail-title">Reflexão</h3>
      <div class="sj-reflection"></div>
    </div>
  `;
}

function _toggleEntry(toggleBtn, detailEl) {
  const expand = detailEl.hidden;
  detailEl.hidden = !expand;
  toggleBtn.setAttribute("aria-expanded", String(expand));
  toggleBtn.textContent = expand ? "Recolher" : "Detalhar";
}

// Cabeçalho do grupo diário: data, quantidade de sessões e tempo líquido —
// tudo somado a partir das sessões já anexadas ao grupo (nenhuma consulta
// extra; duration_minutes já vem de listSessions/ver F7.7 desconto de pausas).
function _updateGroupHeader(group) {
  const totalMinutes = group.sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  group.countEl.textContent = `${group.sessions.length} sessão(ões)`;
  group.durationEl.textContent = _formatDuration(totalMinutes);
}

function _createDayGroup(iso) {
  const li = document.createElement("li");
  li.className = "sj-day-group";
  li.innerHTML = `
    <div class="sj-day-header">
      <span class="sj-day-header-date">${escapeHtml(_dayLabel(iso))}</span>
      <span class="sj-day-header-count"></span>
      <span class="sj-day-header-duration"></span>
    </div>
    <ul class="sj-day-sessions"></ul>
  `;
  listEl.appendChild(li);

  return {
    key: _dayKey(iso),
    sessions: [],
    li,
    countEl: li.querySelector(".sj-day-header-count"),
    durationEl: li.querySelector(".sj-day-header-duration"),
    sessionsEl: li.querySelector(".sj-day-sessions"),
  };
}

// ── Marcos da Evolução (F8.7) ────────────────────────────────────────────
// Ícones SVG já usados na navegação (icons.js, auditoria UX #33)
// reaproveitados como "ícone" de cada marco — mesma fonte, sem duplicar
// desenhos novos por marco.
const MILESTONE_ICON_GLYPHS = {
  "check-circle": iconClipboard, // mesmo ícone do nav "Compromissos"
  clock:          iconClock,     // mesmo ícone do nav "Sessão de Estudo"
  target:         iconBarChart,  // mesmo ícone do nav "Dashboard"
  flame:          iconSparkle,   // mesmo ícone do nav "Assistente IA"
  book:           iconLayers,    // mesmo ícone do nav "Calendários Acadêmicos"
};

// Preenche o painel recolhível #sj-milestones-panel, separado de #sj-list —
// somente leitura, recalculado a cada _render() a partir de `filtered` (o
// mesmo array já filtrado pelo F8.4) via buildMilestones()
// (studyMilestoneService.js, função pura). Sem marcos, o painel fica oculto.
function _renderMilestonesPanel(filteredEntries) {
  if (!milestonesPanelEl || !milestonesListEl) return;
  const milestones = buildMilestones(filteredEntries);
  if (milestones.length === 0) {
    milestonesPanelEl.hidden = true;
    milestonesListEl.innerHTML = "";
    return;
  }

  milestonesPanelEl.hidden = false;
  milestonesListEl.innerHTML = milestones.map(m => `
    <li class="sj-milestone-item sj-milestone-item--${escapeHtml(m.severity)}">
      <span class="sj-milestone-icon" aria-hidden="true">${MILESTONE_ICON_GLYPHS[m.icon] || ""}</span>
      <div class="sj-milestone-body">
        <div class="sj-milestone-header">
          <span class="sj-milestone-item-title">${escapeHtml(m.title)}</span>
          <span class="sj-milestone-date">${_formatDate(m.date)}</span>
        </div>
        <p class="sj-milestone-description">${escapeHtml(m.description)}</p>
      </div>
    </li>
  `).join("");
}

// ── Resumo diário e indicadores de evolução (F8.5) ──────────────────────
// Cartão anexado ao final do próprio grupo de dia (dentro do mesmo <li
// class="sj-day-group">, depois de .sj-day-sessions) — nunca substitui as
// sessões já renderizadas, só acrescenta uma camada narrativa sobre elas.
function _comparisonBadge(delta, unitSingular, unitPlural) {
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "•";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const unit = abs === 1 ? unitSingular : unitPlural;
  return `<span class="sj-summary-badge">${arrow} ${sign}${abs} ${unit}</span>`;
}

function _appendDailySummary(dayGroup, summary, comparison) {
  const div = document.createElement("div");
  div.className = "sj-daily-summary";
  div.innerHTML = `
    <div class="sj-daily-summary-stats">
      <span>${_formatDuration(summary.totalMinutes)} estudados</span>
      <span>${summary.sessionsCount} sessão(ões)</span>
      <span>${summary.questionsCount} questão(ões) resolvida(s)</span>
      <span>${summary.reviewsCount} revisão(ões)</span>
      <span>${summary.subjects.length ? escapeHtml(summary.subjects.join(", ")) : "Sem matéria"}</span>
    </div>
    ${comparison ? `
      <div class="sj-daily-summary-comparison">
        <span class="sj-summary-comparison-label">Em relação ao dia anterior:</span>
        ${_comparisonBadge(comparison.sessionsDelta, "sessão", "sessões")}
        ${_comparisonBadge(comparison.minutesDelta, "minuto", "minutos")}
        ${_comparisonBadge(comparison.questionsDelta, "questão", "questões")}
      </div>
    ` : ""}
  `;
  dayGroup.li.appendChild(div);
}

// ── Resumo semanal (F8.5) ────────────────────────────────────────────────
// Inserido como um <li> próprio na lista, entre o último grupo de dia da
// semana concluída e o primeiro grupo da semana seguinte (mais antiga) —
// "quando um novo bloco semanal começa, mostra o resumo da semana anterior".
//
// F8.6 — Síntese Periódica: além dos números do cartão (já existentes desde
// F8.5), acrescenta o texto narrativo de buildWeeklySummary()
// (studySummaryService.js) sobre as mesmas `weekEntries` (as entradas já
// filtradas/visíveis dessa semana, o mesmo subconjunto que alimentou
// summarizeWeekGroups) — nenhuma consulta nova, nenhum dado além do que já
// está em `_allEntries`.
//
// F10 #1.4 — a narrativa vem dentro de um <details> nativo, recolhida por
// padrão: o texto corrido competia visualmente com os números do cartão
// (que já respondem "quanto"/"quantas vezes") em toda semana renderizada.
// <details>/<summary> foi escolhido em vez de um toggle próprio (como em
// #1.1/#1.3) por ser puramente apresentacional — sem estado para persistir
// entre buscas/filtros — e por manter o texto no DOM (querySelector nos
// testes continua funcionando independente de aberto/fechado).
function _appendWeekSummary(weekKey, weekDayGroups, weekEntries) {
  const summary = summarizeWeekGroups(weekDayGroups);
  const narrative = buildWeeklySummary(weekEntries);
  const li = document.createElement("li");
  li.className = "sj-week-summary";
  li.innerHTML = `
    <div class="sj-week-summary-title">${escapeHtml(weekLabel(weekKey))}</div>
    <div class="sj-week-summary-stats">
      <span>${_formatDuration(summary.totalMinutes)} estudadas</span>
      <span>${summary.sessionsCount} sessão(ões)</span>
      <span>${summary.questionsCount} questão(ões)</span>
      <span>${summary.subjectsCount} matéria(s)</span>
      <span>Maior sequência de estudos: ${summary.longestStreak} dia(s)</span>
    </div>
    <details class="sj-week-narrative">
      <summary class="sj-week-narrative-title">Resumo da Semana</summary>
      <p class="sj-week-narrative-text">${escapeHtml(narrative.text).replace(/\n\n/g, "</p><p class=\"sj-week-narrative-text\">")}</p>
    </details>
  `;
  listEl.appendChild(li);
}

// F8.8 — Linha do Tempo Inteligente: quando há busca textual ativa, marca
// visualmente (highlightMatches — studySearchService.js) os trechos
// encontrados em compromisso/matéria/conteúdo, e mostra abaixo do título
// quais campos geraram o resultado (entry.matches, anexado por
// searchEntries()) — nunca só a sessão, sempre o contexto do que casou com
// a busca.
const _MATCH_LABELS_IN_ENTRY = new Set(["commitment", "category", "subject", "content"]);

function _matchedFieldsBadge(matches) {
  const extra = matches.filter(m => !_MATCH_LABELS_IN_ENTRY.has(m.field));
  if (extra.length === 0) return "";
  const labels = [...new Set(extra.map(m => m.label))];
  return `<div class="sj-entry-matches">Encontrado em: ${escapeHtml(labels.join(", "))}</div>`;
}

function _buildEntryEl(entry) {
  const { session: s, meta, extras, matches = [] } = entry;
  const { questions, reviews, reflection } = extras;
  const query = _filters.search;

  const li = document.createElement("li");
  li.className = "sj-entry";
  li.innerHTML = `
    <div class="sj-entry-header">
      <div class="sj-entry-title-row">
        <span class="ah-item-title">${highlightMatches(meta.title, query)}</span>
        ${meta.category ? `<span class="ah-item-category">· ${highlightMatches(meta.category, query)}</span>` : ""}
      </div>
      <button type="button" class="btn btn-ghost btn-sm sj-toggle" aria-expanded="false">Detalhar</button>
    </div>
    <div class="session-history-row session-history-meta">
      <span class="session-history-date">${_formatDate(s.started_at)}</span>
      <span>${_formatTime(s.started_at)} – ${_formatTime(s.ended_at)}</span>
      <span>${_formatDuration(s.duration_minutes)}</span>
    </div>
    <div class="session-history-row session-history-meta">
      <span>Conteúdo: ${meta.content ? highlightMatches(meta.content, query) : "—"}</span>
    </div>
    <div class="session-history-row session-history-meta">
      <span>${questions.length} questão(ões)</span>
      <span>${reviews.length} revisão(ões)</span>
    </div>
    ${_matchedFieldsBadge(matches)}
    <div class="sj-entry-detail" hidden></div>
  `;

  const toggleBtn = li.querySelector(".sj-toggle");
  const detailEl  = li.querySelector(".sj-entry-detail");
  _renderDetail(detailEl, questions, reviews, s.notes, query);
  _renderReflectionView(detailEl.querySelector(".sj-reflection"), entry, reflection, query);
  toggleBtn.addEventListener("click", () => _toggleEntry(toggleBtn, detailEl));

  return li;
}

function _renderLoadError({ state, message }) {
  emptyEl.hidden = false;
  emptyEl.classList.add("list-error");
  renderStateBlock(emptyEl, { state, message, onRetry: () => _loadPage(true) });
}

// ── Filtros (F8.4) ───────────────────────────────────────────────────────
// Tudo abaixo opera exclusivamente sobre `_allEntries` (já em memória) —
// trocar um filtro nunca chama nenhum dos services novamente.

function _periodStart(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") return today;
  if (period === "7d")  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  if (period === "30d") return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return null; // "all"
}

// Período/categoria continuam sendo aplicados aqui (F8.4,
// inalterado) — busca textual composta e os demais filtros novos
// (reflexão/observações/revisões/questões/duração/tipo/status/dificuldade)
// vivem em studySearchService.js (F8.8) e são aplicados em _render() sobre
// o subconjunto já filtrado por esta função, sem prioridade entre eles.
function _matchesBaseFilters(entry) {
  const { session: s, meta } = entry;

  const periodStart = _periodStart(_filters.period);
  if (periodStart && new Date(s.started_at) < periodStart) return false;

  if (_filters.category && meta.category !== _filters.category) return false;

  return true;
}

// Opções de categoria derivadas do próprio conjunto já carregado —
// nenhuma consulta a categoryService/subjectProgressService.
function _collectFieldValues(field) {
  const values = new Set();
  _allEntries.forEach(entry => {
    if (entry.meta[field]) values.add(entry.meta[field]);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function _populateSelect(selectEl, values, allLabel) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${allLabel}</option>` +
    values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  selectEl.value = values.includes(current) ? current : "";
}

function _refreshFilterOptions() {
  _populateSelect(categorySelect, _collectFieldValues("category"), "Todas as categorias");
}

function _onFilterChange() {
  _filters = {
    period: periodSelect.value,
    category: categorySelect.value,
    search: searchInput.value.trim(),
    onlyWithReflection: Boolean(reflectionCheck?.checked),
    onlyWithNotes: Boolean(notesCheck?.checked),
    onlyWithReviews: Boolean(reviewsCheck?.checked),
    onlyWithQuestions: Boolean(questionsCheck?.checked),
    onlyWithoutQuestions: Boolean(noQuestionsCheck?.checked),
    onlyLong: Boolean(longCheck?.checked),
    onlyShort: Boolean(shortCheck?.checked),
    questionType: questionTypeSelect?.value || "",
    questionStatus: questionStatusSelect?.value || "",
    questionDifficulty: questionDifficultySelect?.value || "",
  };
  _updateAdvancedFiltersCount();
  _render();
}

// Contador em "Filtros avançados" (auditoria UX #21) — quantos dos filtros
// escondidos estão ativos, para que o usuário não precise abrir o painel só
// para conferir.
function _updateAdvancedFiltersCount() {
  if (!advancedCountEl) return;
  const active = ADVANCED_FILTER_KEYS.filter(key => _filters[key] !== _DEFAULT_FILTERS[key]).length;
  advancedCountEl.textContent = active > 0 ? ` (${active})` : "";
}

function _toggleAdvancedFilters() {
  const expand = advancedFiltersEl.hidden;
  advancedFiltersEl.hidden = !expand;
  advancedToggleBtn.setAttribute("aria-expanded", String(expand));
}

function _toggleMoreFlags() {
  const expand = moreFlagsEl.hidden;
  moreFlagsEl.hidden = !expand;
  moreFlagsToggleBtn.setAttribute("aria-expanded", String(expand));
}

function _bindFilters() {
  periodSelect?.addEventListener("change", _onFilterChange);
  categorySelect?.addEventListener("change", _onFilterChange);
  searchInput?.addEventListener("input", _onFilterChange);
  questionTypeSelect?.addEventListener("change", _onFilterChange);
  questionStatusSelect?.addEventListener("change", _onFilterChange);
  questionDifficultySelect?.addEventListener("change", _onFilterChange);
  [reflectionCheck, notesCheck, reviewsCheck, questionsCheck, noQuestionsCheck, longCheck, shortCheck]
    .forEach(el => el?.addEventListener("change", _onFilterChange));
  advancedToggleBtn?.addEventListener("click", _toggleAdvancedFilters);
  moreFlagsToggleBtn?.addEventListener("click", _toggleMoreFlags);
}

// ── Estatísticas da busca (F8.8) ─────────────────────────────────────────
// Cartão fixo acima da lista, derivado apenas do resultado já filtrado
// (searchStats() — studySearchService.js, função pura) — nenhuma consulta
// nova, mesmo padrão dos cartões de resumo do F8.5/F8.6.
function _renderSearchStats(filteredEntries) {
  if (!statsEl) return;
  const stats = searchStats(filteredEntries);
  statsEl.hidden = false;
  statsEl.innerHTML = `
    <span>${stats.sessionsCount} sessão(ões) encontrada(s)</span>
    <span>${_formatDuration(stats.totalMinutes)} estudados</span>
    <span>${stats.questionsCount} questão(ões)</span>
    <span>${stats.reviewsCount} revisão(ões)</span>
    <span>${stats.subjectsCount} matéria(s) diferente(s)</span>
  `;
}

// ── Aviso de filtragem parcial (auditoria UX #02) ────────────────────────
// Os filtros (F8.4/F8.8) operam exclusivamente sobre `_allEntries` — as
// sessões já carregadas via "Carregar mais". Com filtro ativo e páginas
// ainda não carregadas no servidor (_hasMore), as contagens exibidas (card
// de estatísticas, grupos, resumos) são parciais sem que nada indique isso.
// Este aviso torna a parcialidade explícita; nenhuma consulta nova é feita.
function _hasActiveFilters() {
  return Object.keys(_DEFAULT_FILTERS).some(key => _filters[key] !== _DEFAULT_FILTERS[key]);
}

function _updatePartialNotice() {
  if (!partialNoticeEl) return;
  const show = _hasMore && _hasActiveFilters();
  partialNoticeEl.hidden = !show;
  partialNoticeEl.textContent = show
    ? `Filtros aplicados somente às ${_allEntries.length} sessão(ões) já carregada(s) — os totais podem estar incompletos. Use "Carregar mais" para incluir sessões mais antigas.`
    : "";
}

// ── Renderização (F8.3 + F8.4 + F8.8) ────────────────────────────────────
// Reconstrói a lista inteira a partir de `_searchIndex` filtrado — mesma
// ordem started_at desc já devolvida por listSessions(), então o
// agrupamento por dia continua correto mesmo após um filtro remover
// sessões de um grupo (o grupo simplesmente não é recriado). Período/
// categoria (F8.4) são aplicados primeiro sobre o índice já pronto
// (_matchesBaseFilters); busca textual composta e os demais filtros novos
// (F8.8) são então aplicados de uma vez por searchEntries()
// (studySearchService.js) — todos combinados, sem prioridade entre eles,
// nenhuma consulta nova a nenhum service.
function _render() {
  listEl.innerHTML = "";
  _updatePartialNotice();
  const preFiltered = _searchIndex.filter(record => _matchesBaseFilters(record.entry));
  const filtered = searchEntries(preFiltered, _filters);

  if (filtered.length === 0) {
    if (statsEl) statsEl.hidden = true;
    _renderMilestonesPanel([]);
    emptyEl.hidden = false;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
    emptyEl.textContent = _allEntries.length === 0
      ? "Nenhuma sessão de estudo registrada ainda."
      : "Nenhuma sessão encontrada para esta pesquisa.";
    return;
  }

  emptyEl.hidden = true;
  _renderSearchStats(filtered);

  // F8.7 — Marcos da Evolução: painel recolhível separado da lista,
  // derivado das mesmas entradas filtradas (ver F10 #3.2 acima).
  _renderMilestonesPanel(filtered);

  // Primeiro passo: agrupa as entradas filtradas por dia, na mesma ordem
  // started_at desc já garantida por listSessions()/F8.3 — puramente em
  // memória, nenhuma sessão buscada de novo.
  const dayBuckets = [];
  filtered.forEach(entry => {
    const dayKey = _dayKey(entry.session.started_at);
    let bucket = dayBuckets[dayBuckets.length - 1];
    if (!bucket || bucket.key !== dayKey) {
      bucket = { key: dayKey, iso: entry.session.started_at, entries: [] };
      dayBuckets.push(bucket);
    }
    bucket.entries.push(entry);
  });
  const daySummaries = dayBuckets.map(bucket => summarizeDayEntries(bucket.entries));

  // Segundo passo: renderiza os grupos de dia (F8.3, inalterado) e intercala
  // os cartões novos do F8.5 — resumo semanal ao trocar de semana, resumo
  // diário + comparação com o dia anterior ao final de cada grupo.
  let currentWeekKey = null;
  let weekBuckets = [];
  let weekEntries = [];

  dayBuckets.forEach((bucket, index) => {
    const weekKey = weekKeyOf(bucket.iso);
    if (currentWeekKey !== null && weekKey !== currentWeekKey) {
      _appendWeekSummary(currentWeekKey, weekBuckets, weekEntries);
      weekBuckets = [];
      weekEntries = [];
    }
    currentWeekKey = weekKey;
    weekBuckets.push({ dayKey: bucket.key, summary: daySummaries[index] });
    weekEntries = weekEntries.concat(bucket.entries);

    const dayGroup = _createDayGroup(bucket.iso);
    bucket.entries.forEach(entry => {
      dayGroup.sessionsEl.appendChild(_buildEntryEl(entry));
      dayGroup.sessions.push(entry.session);
    });
    _updateGroupHeader(dayGroup);

    const previousSummary = index + 1 < dayBuckets.length ? daySummaries[index + 1] : null;
    _appendDailySummary(dayGroup, daySummaries[index], compareDailySummaries(daySummaries[index], previousSummary));
  });

  // Auditoria UX #32: o laço acima só fecha o resumo de uma semana quando a
  // semana seguinte (mais antiga) começa — a última semana visível nunca
  // disparava essa troca e ficava sem cartão até "Carregar mais" alcançar a
  // semana anterior. Fecha aqui também, fora do laço, para a última semana
  // visível sempre ganhar seu resumo.
  if (currentWeekKey !== null) {
    _appendWeekSummary(currentWeekKey, weekBuckets, weekEntries);
  }
}

async function _loadEntriesData(sessions) {
  const extrasList = await _fetchPageExtras(sessions);
  sessions.forEach((s, i) => {
    _allEntries.push({ session: s, meta: _resolveMeta(s), extras: extrasList[i] });
  });
  // F8.8 — índice reconstruído aqui (só quando `_allEntries` muda: nova
  // página carregada), nunca em _render()/_onFilterChange — reutilizado por
  // searchEntries() a cada troca de filtro sem reprocessar as entradas.
  _searchIndex = buildSearchIndex(_allEntries);
}

async function _loadPage(reset) {
  if (_loading) return;
  _loading = true;

  if (reset) {
    _offset = 0;
    _allEntries = [];
    _searchIndex = [];
    _hasMore = false;
    listEl.innerHTML = "";
    // Auditoria UX #20 — sem isto, a lista ficava em branco durante a
    // carga, diferente do Calendário (calendar.js/showLoading()).
    emptyEl.hidden = false;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
    emptyEl.innerHTML = skeletonRowsMarkup(4);
    loadMoreBtn.hidden = true;
    if (partialNoticeEl) partialNoticeEl.hidden = true;
    if (milestonesPanelEl) milestonesPanelEl.hidden = true;
  }

  try {
    const { sessions, hasMore } = await listSessions({ status: "finished", limit: PAGE_SIZE, offset: _offset });
    _offset += sessions.length;
    _hasMore = hasMore;

    if (reset && sessions.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Nenhuma sessão de estudo registrada ainda.";
    } else {
      await _loadEntriesData(sessions);
      _refreshFilterOptions();
      _render();
    }
    loadMoreBtn.hidden = !hasMore;
  } catch (err) {
    const errorState = errorToState(handleError(err, { context: "studyJournalView.load", silent: true }));
    if (reset) {
      _renderLoadError(errorState);
    } else {
      loadMoreBtn.hidden = false;
    }
  } finally {
    _loading = false;
  }
}

/**
 * Monta a tela (uma única vez) e carrega a primeira página do Diário.
 * Chamada a cada login (ver script.js/_initApp) — sempre recarrega do zero.
 */
export async function initStudyJournalView() {
  if (!listEl) {
    listEl      = document.getElementById("sj-list");
    emptyEl     = document.getElementById("sj-list-empty");
    loadMoreBtn = document.getElementById("sj-load-more");
    statsEl     = document.getElementById("sj-search-stats");
    partialNoticeEl = document.getElementById("sj-filter-partial-notice");
    milestonesPanelEl = document.getElementById("sj-milestones-panel");
    milestonesListEl  = document.getElementById("sj-milestones-list");

    periodSelect   = document.getElementById("sj-filter-period");
    categorySelect = document.getElementById("sj-filter-category");
    searchInput    = document.getElementById("sj-filter-search");

    questionTypeSelect       = document.getElementById("sj-filter-question-type");
    questionStatusSelect     = document.getElementById("sj-filter-question-status");
    questionDifficultySelect = document.getElementById("sj-filter-question-difficulty");

    reflectionCheck  = document.getElementById("sj-filter-reflection");
    notesCheck       = document.getElementById("sj-filter-notes");
    reviewsCheck     = document.getElementById("sj-filter-reviews");
    questionsCheck   = document.getElementById("sj-filter-questions");
    noQuestionsCheck = document.getElementById("sj-filter-no-questions");
    longCheck        = document.getElementById("sj-filter-long");
    shortCheck       = document.getElementById("sj-filter-short");

    advancedToggleBtn = document.getElementById("sj-advanced-filters-toggle");
    advancedFiltersEl = document.getElementById("sj-advanced-filters");
    advancedCountEl   = document.getElementById("sj-advanced-filters-count");

    moreFlagsToggleBtn = document.getElementById("sj-more-flags-toggle");
    moreFlagsEl        = document.getElementById("sj-more-flags");

    loadMoreBtn?.addEventListener("click", () => _loadPage(false));
    _bindFilters();
  }

  _subscribeToEventBus();
  await _loadEventsLookup();
  await _loadPage(true);
}

/**
 * Desfaz a assinatura do barramento de eventos e qualquer recarga pendente.
 * Chamada no logout/troca de usuário (ver script.js/onBeforeSignOut) — esta
 * é uma SPA sem reload de página entre sessões, então o cache acumulado em
 * memória (_allEntries/_searchIndex/_eventsById) e a lista já renderizada
 * têm que ser descartados aqui, não apenas na próxima _loadPage(true):
 * sem isso, os dados do usuário anterior (sessões, reflexões, observações)
 * ficam visíveis na tela e acessíveis em memória durante a janela assíncrona
 * entre o login do novo usuário e a resolução de _loadPage(true).
 */
export function resetStudyJournalView() {
  _unsubscribers.forEach(off => off());
  _unsubscribers = [];
  if (_reloadTimer) {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
  }

  _offset = 0;
  _allEntries = [];
  _searchIndex = [];
  _hasMore = false;
  _eventsById = new Map();

  if (listEl) listEl.innerHTML = "";
  if (emptyEl) {
    emptyEl.hidden = true;
    emptyEl.classList.remove("list-error");
    clearStateBlock(emptyEl);
  }
  if (statsEl) statsEl.hidden = true;
  if (loadMoreBtn) loadMoreBtn.hidden = true;
  if (partialNoticeEl) { partialNoticeEl.hidden = true; partialNoticeEl.textContent = ""; }
  if (milestonesPanelEl) milestonesPanelEl.hidden = true;
  if (milestonesListEl) milestonesListEl.innerHTML = "";

  // Filtros voltam ao padrão no próximo login — nenhum filtro fica preso
  // entre usuários diferentes na mesma sessão do navegador.
  _filters = { ..._DEFAULT_FILTERS };
  if (periodSelect)   periodSelect.value = "all";
  if (categorySelect) categorySelect.value = "";
  if (searchInput)    searchInput.value = "";
  if (questionTypeSelect)       questionTypeSelect.value = "";
  if (questionStatusSelect)     questionStatusSelect.value = "";
  if (questionDifficultySelect) questionDifficultySelect.value = "";
  [reflectionCheck, notesCheck, reviewsCheck, questionsCheck, noQuestionsCheck, longCheck, shortCheck]
    .forEach(el => { if (el) el.checked = false; });
  _updateAdvancedFiltersCount();
  if (advancedFiltersEl)  advancedFiltersEl.hidden = true;
  if (advancedToggleBtn)  advancedToggleBtn.setAttribute("aria-expanded", "false");
  if (moreFlagsEl)        moreFlagsEl.hidden = true;
  if (moreFlagsToggleBtn) moreFlagsToggleBtn.setAttribute("aria-expanded", "false");
}
