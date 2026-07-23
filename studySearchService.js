/**
 * studySearchService.js — Busca Avançada e Linha do Tempo Inteligente (F8.8).
 *
 * Camada de consulta puramente em memória sobre as entradas já carregadas
 * pelo Diário de Estudos (studyJournalView.js/F8.1-F8.7): cada entrada é
 * `{ session, meta, extras }`, o mesmo formato já resolvido para os cartões
 * de sessão e consumido por studyTimelineService.js/studyMilestoneService.js.
 * Nenhuma função aqui faz I/O, consulta serviço algum, publica evento ou usa
 * IA — mesma filosofia dos módulos irmãos: separar o cálculo puro do ponto
 * onde os dados são buscados.
 *
 * Módulo inteiramente stateless: nenhuma variável de módulo é mantida entre
 * chamadas, então não há "cache" a invalidar nem referência antiga a uma
 * entrada que o Diário já mutou (ex.: studyJournalView.js grava
 * entry.extras.reflection ao salvar uma reflexão — F8.2). Cada chamada
 * deriva tudo de novo a partir do que recebe; "reconstruir o índice apenas
 * quando entries mudar" é responsabilidade de quem chama (studyJournalView):
 * chamar buildSearchIndex(entries) uma vez por mudança em `_allEntries` e
 * reutilizar o valor retornado em chamadas subsequentes de searchEntries()
 * a cada troca de filtro — sem nenhuma consulta nova a
 * activitySessionService/sessionQuestionsService/reviewSessionService/
 * studyReflectionService.
 */

// ── Normalização de texto ────────────────────────────────────────────────
// Case-insensitive, ignora acentos, ignora espaços múltiplos — mesma
// definição em todo o módulo, tanto para montar o índice quanto para ler a
// consulta digitada pelo usuário.

function _stripAccents(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Usado para comparação (índice e termos de busca): também colapsa espaços
// múltiplos, já que aqui não importa preservar a posição de cada caractere.
function _normalize(text) {
  return _stripAccents(String(text ?? "").toLowerCase()).replace(/\s+/g, " ").trim();
}

// Usado só por highlightMatches(): dobra acentos/caixa mantendo o mesmo
// comprimento e o mesmo índice de caractere do texto original (nunca
// colapsa espaços), para que as posições encontradas no texto normalizado
// sejam válidas diretamente no texto original.
function _foldSameLength(text) {
  // NFD por caractere-base garante 1 combining mark removido por caractere
  // acentuado (á, ã, ç, é, ...) — comprimento resultante é sempre igual ao
  // do texto original, então os índices batem 1:1 com o texto original.
  let out = "";
  for (const ch of text) {
    out += _stripAccents(ch.toLowerCase());
  }
  return out;
}

function _splitTerms(query) {
  return _normalize(query).split(" ").filter(Boolean);
}

// ── Rótulos dos campos pesquisáveis ─────────────────────────────────────
// Usados tanto para montar o índice quanto para rotular "qual campo gerou o
// resultado" na Linha do Tempo Inteligente.

const FIELD_LABELS = {
  commitment:   "Compromisso",
  category:     "Categoria",
  subject:      "Matéria",
  content:      "Conteúdo",
  objective:    "Objetivo",
  notes:        "Observações",
  reflection:   "Reflexão",
  questionType:       "Tipo da questão",
  questionStatus:     "Status da questão",
  questionDifficulty: "Dificuldade da questão",
  questionSubject:    "Matéria da questão",
  questionTopic:      "Tópico da questão",
  reviewTitle:  "Revisão",
};

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
const QUESTION_DIFFICULTY_LABELS = {
  easy:   "Fácil",
  medium: "Médio",
  hard:   "Difícil",
};

// ── Duração ──────────────────────────────────────────────────────────────

const LONG_SESSION_MINUTES = 120;
const SHORT_SESSION_MINUTES = 30;

// ── Índice de busca ──────────────────────────────────────────────────────
// Uma entrada de índice por entrada do Diário: os mesmos `session`/`meta`/
// `extras` recebidos (referência preservada apenas para permitir devolver a
// entrada original em searchEntries — este módulo nunca escreve nesses
// objetos) mais estruturas derivadas (texto normalizado por campo,
// flags booleanas, conjuntos de valores de questões) usadas por toda
// consulta subsequente sem precisar reprocessar `entries`.

function _entryFields(entry) {
  const { session, meta, extras } = entry;
  const fields = [];

  const push = (field, text) => {
    if (text === null || text === undefined || text === "") return;
    fields.push({ field, label: FIELD_LABELS[field], text: String(text) });
  };

  push("commitment", meta?.title);
  push("category", meta?.category);
  push("subject", meta?.subject);
  push("content", meta?.content);
  // Sem campo de objetivo no domínio atual (ver studySessionView.js) —
  // pesquisado apenas se/quando existir em meta.objective, sem quebrar nada
  // enquanto não existir.
  push("objective", meta?.objective);
  push("notes", session?.notes);
  push("reflection", extras?.reflection?.content);

  (extras?.questions || []).forEach((q) => {
    push("questionType", QUESTION_TYPE_LABELS[q.question_type] || q.question_type);
    push("questionStatus", QUESTION_STATUS_LABELS[q.status] || q.status);
    push("questionDifficulty", QUESTION_DIFFICULTY_LABELS[q.difficulty] || q.difficulty);
    push("questionSubject", q.subject);
    push("questionTopic", q.topic);
  });

  (extras?.reviews || []).forEach((r) => {
    // Sem campo de título na revisão hoje (ver sql/13_reviews.sql) —
    // pesquisado apenas se/quando existir em r.title.
    push("reviewTitle", r.title);
  });

  return fields;
}

/**
 * Constrói o índice de busca a partir das entradas já carregadas pelo
 * Diário. Deve ser chamado uma única vez por mudança em `entries` — o
 * resultado é reutilizado por searchEntries() a cada troca de filtro, sem
 * reprocessar `entries` de novo (ver cabeçalho do módulo).
 */
export function buildSearchIndex(entries) {
  const list = entries || [];
  return list.map((entry) => {
    const fields = _entryFields(entry);
    const normalizedFields = fields.map((f) => ({ ...f, normalized: _normalize(f.text) }));
    const haystack = normalizedFields.map((f) => f.normalized).join(" ");

    const questions = entry.extras?.questions || [];
    const reviews = entry.extras?.reviews || [];
    const durationMinutes = entry.session?.duration_minutes || 0;

    return {
      entry,
      fields: normalizedFields,
      haystack,
      durationMinutes,
      hasReflection: Boolean(entry.extras?.reflection),
      hasNotes: Boolean((entry.session?.notes || "").trim()),
      hasReviews: reviews.length > 0,
      hasQuestions: questions.length > 0,
      questionTypes: new Set(questions.map((q) => q.question_type).filter(Boolean)),
      questionStatuses: new Set(questions.map((q) => q.status).filter(Boolean)),
      questionDifficulties: new Set(questions.map((q) => q.difficulty).filter(Boolean)),
    };
  });
}

function _isIndex(value) {
  return Array.isArray(value) && (value.length === 0 || (value[0] && "haystack" in value[0]));
}

// ── Filtros ──────────────────────────────────────────────────────────────

function _matchesTextSearch(record, terms) {
  if (terms.length === 0) return true;
  return terms.every((term) => record.haystack.includes(term));
}

function _matchesQuestionFilters(record, filters) {
  if (filters.questionType && !record.questionTypes.has(filters.questionType)) return false;
  if (filters.questionStatus && !record.questionStatuses.has(filters.questionStatus)) return false;
  if (filters.questionDifficulty && !record.questionDifficulties.has(filters.questionDifficulty)) return false;
  return true;
}

function _matchesFlagFilters(record, filters) {
  if (filters.onlyWithReflection && !record.hasReflection) return false;
  if (filters.onlyWithNotes && !record.hasNotes) return false;
  if (filters.onlyWithReviews && !record.hasReviews) return false;
  if (filters.onlyWithQuestions && !record.hasQuestions) return false;
  if (filters.onlyWithoutQuestions && record.hasQuestions) return false;
  if (filters.onlyLong && record.durationMinutes < LONG_SESSION_MINUTES) return false;
  if (filters.onlyShort && record.durationMinutes > SHORT_SESSION_MINUTES) return false;
  return true;
}

function _matchedFieldsFor(record, terms) {
  if (terms.length === 0) return [];
  const seen = new Set();
  const matches = [];
  record.fields.forEach((f) => {
    if (seen.has(f.field)) return;
    if (terms.every((term) => f.normalized.includes(term))) {
      seen.add(f.field);
      matches.push({ field: f.field, label: f.label, text: f.text });
    }
  });
  return matches;
}

/**
 * Filtra as entradas do Diário por busca textual composta (todos os termos
 * devem existir, em qualquer campo pesquisável) combinada com os filtros
 * estruturados (reflexão/observações/revisões/questões/duração/tipo/status/
 * dificuldade). Aceita tanto `entries` brutas quanto um índice já construído
 * por buildSearchIndex() — passar o índice evita reconstruí-lo a cada troca
 * de filtro (ver cabeçalho do módulo).
 *
 * Retorna as entradas filtradas na mesma ordem recebida, cada uma com um
 * campo adicional `matches` (array de `{ field, label, text }` — os campos
 * que geraram a busca textual; vazio quando não há busca textual ou quando
 * o resultado veio só de filtros estruturados) — os campos originais
 * `session`/`meta`/`extras` permanecem intactos e não são mutados.
 */
export function searchEntries(entries, filters = {}) {
  const index = _isIndex(entries) ? entries : buildSearchIndex(entries);
  const terms = _splitTerms(filters.search || "");

  const results = [];
  for (const record of index) {
    if (!_matchesTextSearch(record, terms)) continue;
    if (!_matchesQuestionFilters(record, filters)) continue;
    if (!_matchesFlagFilters(record, filters)) continue;
    results.push({ ...record.entry, matches: _matchedFieldsFor(record, terms) });
  }
  return results;
}

// ── Destaque ─────────────────────────────────────────────────────────────
// Marca visualmente (via <mark>) os trechos de `text` que casam com os
// termos de `query` — case insensitive, ignora acentos — sem alterar o
// texto original: apenas envolve os trechos encontrados, preservando
// exatamente a grafia/acentuação/caixa originais fora e dentro da marca.
// Retorna HTML já escapado (mesmo padrão de escapeHtml() em utils.js) —
// seguro para innerHTML.

function _escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightMatches(text, query) {
  const original = String(text ?? "");
  const terms = _splitTerms(query || "");
  if (terms.length === 0 || original === "") return _escapeHtml(original);

  const folded = _foldSameLength(original);
  const ranges = [];
  terms.forEach((term) => {
    if (!term) return;
    let from = 0;
    let at;
    while ((at = folded.indexOf(term, from)) !== -1) {
      ranges.push([at, at + term.length]);
      from = at + term.length;
    }
  });

  if (ranges.length === 0) return _escapeHtml(original);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const [start, end] = ranges[i];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  let out = "";
  let cursor = 0;
  merged.forEach(([start, end]) => {
    out += _escapeHtml(original.slice(cursor, start));
    out += `<mark class="sj-search-mark">${_escapeHtml(original.slice(start, end))}</mark>`;
    cursor = end;
  });
  out += _escapeHtml(original.slice(cursor));
  return out;
}

// ── Estatísticas da busca ───────────────────────────────────────────────
// Inteiramente derivadas do resultado já filtrado — nenhuma consulta nova,
// mesmo padrão de summarizeDayEntries()/summarizeWeekGroups()
// (studyTimelineService.js).

export function searchStats(filteredEntries) {
  const list = filteredEntries || [];

  const totalMinutes = list.reduce((sum, e) => sum + (e.session?.duration_minutes || 0), 0);
  const questionsCount = list.reduce((sum, e) => sum + (e.extras?.questions?.length || 0), 0);
  const reviewsCount = list.reduce((sum, e) => sum + (e.extras?.reviews?.length || 0), 0);
  const subjectsCount = new Set(list.map((e) => e.meta?.subject).filter(Boolean)).size;

  return {
    sessionsCount: list.length,
    totalMinutes,
    questionsCount,
    reviewsCount,
    subjectsCount,
  };
}
