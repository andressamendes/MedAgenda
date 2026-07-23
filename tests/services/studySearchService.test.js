/**
 * Tests for studySearchService.js — Busca Avançada e Linha do Tempo
 * Inteligente (F8.8). Módulo puro, sem I/O: nenhum mock necessário — mesmo
 * padrão de studyTimelineService.test.js/studyMilestoneService.test.js.
 */
import { test } from "node:test";
import assert from "node:assert";
import {
  buildSearchIndex,
  searchEntries,
  highlightMatches,
  searchStats,
} from "../../studySearchService.js";

let _id = 0;
function entry({
  startedAt = "2026-01-01T08:00:00.000Z",
  minutes = 30,
  notes = null,
  title = null,
  category = null,
  subject = null,
  content = null,
  questions = [],
  reviews = [],
  reflection = null,
} = {}) {
  _id += 1;
  return {
    session: { id: `s${_id}`, started_at: startedAt, duration_minutes: minutes, notes },
    meta: { title, category, subject, content },
    extras: { questions, reviews, reflection },
  };
}

function question({ type = "multiple_choice", status = "pending", difficulty = "medium", subject = null, topic = null } = {}) {
  return { question_type: type, status, difficulty, subject, topic };
}

// ── Busca textual simples/parcial/sem acento ─────────────────────────────

test("busca simples localiza pelo texto exato do campo", () => {
  const entries = [entry({ subject: "Processo Penal" })];
  const result = searchEntries(entries, { search: "Penal" });
  assert.strictEqual(result.length, 1);
});

test("busca parcial localiza palavras incompletas (constit -> Constitucionalidade)", () => {
  const entries = [entry({ subject: "Controle de Constitucionalidade" })];
  assert.strictEqual(searchEntries(entries, { search: "constit" }).length, 1);
});

test("busca ignora acentos (constituicao localiza Constituição)", () => {
  const entries = [entry({ content: "Constituição Federal" })];
  assert.strictEqual(searchEntries(entries, { search: "constituicao" }).length, 1);
  assert.strictEqual(searchEntries(entries, { search: "Constituição" }).length, 1);
});

test("busca é case insensitive", () => {
  const entries = [entry({ subject: "Direito Penal" })];
  assert.strictEqual(searchEntries(entries, { search: "DIREITO penal" }).length, 1);
});

test("busca ignora múltiplos espaços entre termos", () => {
  const entries = [entry({ subject: "Processo Penal" })];
  assert.strictEqual(searchEntries(entries, { search: "processo    penal" }).length, 1);
});

// ── Busca composta (múltiplos termos) ────────────────────────────────────

test("busca com múltiplos termos só encontra quando todos existem (em qualquer campo)", () => {
  const entries = [
    entry({ subject: "Direito Processo Penal", content: "Prazos recursais" }),
    entry({ subject: "Direito Civil" }),
  ];
  const result = searchEntries(entries, { search: "processo penal" });
  assert.strictEqual(result.length, 1);
});

test("busca com múltiplos termos não encontra quando falta um termo", () => {
  const entries = [entry({ subject: "Direito Civil", content: "Contratos" })];
  assert.strictEqual(searchEntries(entries, { search: "processo penal" }).length, 0);
});

// ── Campos pesquisáveis ───────────────────────────────────────────────────

test("busca em compromisso (meta.title)", () => {
  const entries = [entry({ title: "Aula de Cardiologia" })];
  assert.strictEqual(searchEntries(entries, { search: "cardiologia" }).length, 1);
});

test("busca em conteúdo (meta.content)", () => {
  const entries = [entry({ content: "Insuficiência cardíaca" })];
  assert.strictEqual(searchEntries(entries, { search: "insuficiencia" }).length, 1);
});

test("busca em reflexão (extras.reflection.content)", () => {
  const entries = [entry({ reflection: { content: "Entendi bem o mecanismo fisiopatológico" } })];
  assert.strictEqual(searchEntries(entries, { search: "fisiopatologico" }).length, 1);
});

test("busca em observações (session.notes)", () => {
  const entries = [entry({ notes: "Revisar antes da prova" })];
  assert.strictEqual(searchEntries(entries, { search: "revisar" }).length, 1);
});

test("busca em questões (tipo, status, dificuldade, matéria, tópico)", () => {
  const entries = [entry({ questions: [question({ type: "open", subject: "Farmacologia", topic: "Anti-hipertensivos" })] })];
  assert.strictEqual(searchEntries(entries, { search: "dissertativa" }).length, 1);
  assert.strictEqual(searchEntries(entries, { search: "farmacologia" }).length, 1);
  assert.strictEqual(searchEntries(entries, { search: "anti-hipertensivos" }).length, 1);
});

test("busca em revisões — quando revisão possui título", () => {
  const entries = [entry({ reviews: [{ title: "Revisão de Sepse" }] })];
  assert.strictEqual(searchEntries(entries, { search: "sepse" }).length, 1);
});

test("busca não encontra termo ausente em nenhum campo", () => {
  const entries = [entry({ subject: "Direito Civil" })];
  assert.strictEqual(searchEntries(entries, { search: "penal" }).length, 0);
});

// ── Filtros de reflexão/observação/revisões/questões ─────────────────────

test("filtro onlyWithReflection retorna apenas sessões com reflexão", () => {
  const entries = [
    entry({ reflection: { content: "algo" } }),
    entry({ reflection: null }),
  ];
  const result = searchEntries(entries, { onlyWithReflection: true });
  assert.strictEqual(result.length, 1);
});

test("filtro onlyWithNotes retorna apenas sessões com observações", () => {
  const entries = [
    entry({ notes: "observação" }),
    entry({ notes: null }),
    entry({ notes: "   " }),
  ];
  const result = searchEntries(entries, { onlyWithNotes: true });
  assert.strictEqual(result.length, 1);
});

test("filtro onlyWithReviews retorna apenas sessões com revisões vinculadas", () => {
  const entries = [
    entry({ reviews: [{ status: "pending" }] }),
    entry({ reviews: [] }),
  ];
  assert.strictEqual(searchEntries(entries, { onlyWithReviews: true }).length, 1);
});

test("filtro onlyWithQuestions/onlyWithoutQuestions são mutuamente informativos", () => {
  const entries = [
    entry({ questions: [question()] }),
    entry({ questions: [] }),
  ];
  assert.strictEqual(searchEntries(entries, { onlyWithQuestions: true }).length, 1);
  assert.strictEqual(searchEntries(entries, { onlyWithoutQuestions: true }).length, 1);
});

test("filtros de questões (tipo/status/dificuldade) filtram por valor de qualquer questão da sessão", () => {
  const entries = [
    entry({ questions: [question({ type: "open", status: "answered", difficulty: "hard" })] }),
    entry({ questions: [question({ type: "flashcard", status: "pending", difficulty: "easy" })] }),
  ];
  assert.strictEqual(searchEntries(entries, { questionType: "open" }).length, 1);
  assert.strictEqual(searchEntries(entries, { questionStatus: "answered" }).length, 1);
  assert.strictEqual(searchEntries(entries, { questionDifficulty: "hard" }).length, 1);
  assert.strictEqual(searchEntries(entries, { questionType: "flashcard", questionStatus: "pending" }).length, 1);
});

// ── Filtros de duração ────────────────────────────────────────────────────

test("filtro onlyLong retorna apenas sessões >= 120 minutos", () => {
  const entries = [entry({ minutes: 119 }), entry({ minutes: 120 }), entry({ minutes: 200 })];
  assert.strictEqual(searchEntries(entries, { onlyLong: true }).length, 2);
});

test("filtro onlyShort retorna apenas sessões <= 30 minutos", () => {
  const entries = [entry({ minutes: 15 }), entry({ minutes: 30 }), entry({ minutes: 31 })];
  assert.strictEqual(searchEntries(entries, { onlyShort: true }).length, 2);
});

// ── Combinação de filtros ─────────────────────────────────────────────────

test("combina busca textual + filtros estruturados + período (aplicado pelo chamador)", () => {
  const entries = [
    entry({ subject: "Direito Penal", minutes: 150, reflection: { content: "boa aula" } }),
    entry({ subject: "Direito Penal", minutes: 20, reflection: null }),
    entry({ subject: "Direito Civil", minutes: 150, reflection: { content: "boa aula" } }),
  ];
  const result = searchEntries(entries, { search: "penal", onlyLong: true, onlyWithReflection: true });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].meta.subject, "Direito Penal");
});

test("nenhum filtro retorna todas as entradas, sem alterar a ordem recebida", () => {
  const entries = [entry({ title: "A" }), entry({ title: "B" }), entry({ title: "C" })];
  const result = searchEntries(entries, {});
  assert.deepStrictEqual(result.map(e => e.meta.title), ["A", "B", "C"]);
});

// ── Highlight ──────────────────────────────────────────────────────────────

test("highlightMatches marca o trecho encontrado sem alterar o texto original", () => {
  const html = highlightMatches("Controle de Constitucionalidade", "constit");
  assert.match(html, /<mark class="sj-search-mark">Constit<\/mark>ucionalidade/);
});

test("highlightMatches preserva acentuação original mesmo buscando sem acento", () => {
  const html = highlightMatches("Constituição Federal", "constituicao");
  assert.match(html, /<mark class="sj-search-mark">Constituição<\/mark> Federal/);
});

test("highlightMatches marca múltiplos termos", () => {
  const html = highlightMatches("Processo Penal e Civil", "processo civil");
  assert.match(html, /<mark class="sj-search-mark">Processo<\/mark>/);
  assert.match(html, /<mark class="sj-search-mark">Civil<\/mark>/);
});

test("highlightMatches escapa HTML do texto original", () => {
  const html = highlightMatches("<script>alert(1)</script> penal", "penal");
  assert.ok(!html.includes("<script>alert"));
  assert.match(html, /&lt;script&gt;/);
});

test("highlightMatches sem query retorna o texto escapado, sem marcação", () => {
  const html = highlightMatches("Texto qualquer", "");
  assert.strictEqual(html, "Texto qualquer");
  assert.ok(!html.includes("<mark"));
});

// ── matches (qual campo gerou o resultado) ────────────────────────────────

test("searchEntries anexa matches com o campo que gerou o resultado da busca textual", () => {
  const entries = [entry({ subject: "Constitucional", reflection: { content: "Sobre controle de constitucionalidade" } })];
  const result = searchEntries(entries, { search: "constitu" });
  const fields = result[0].matches.map(m => m.field).sort();
  assert.deepStrictEqual(fields, ["reflection", "subject"]);
});

test("searchEntries retorna matches vazio quando o resultado vem só de filtros estruturados", () => {
  const entries = [entry({ reflection: { content: "algo" } })];
  const result = searchEntries(entries, { onlyWithReflection: true });
  assert.deepStrictEqual(result[0].matches, []);
});

test("searchEntries não muta as entradas originais", () => {
  const original = entry({ subject: "Direito Penal" });
  const snapshot = JSON.parse(JSON.stringify(original));
  searchEntries([original], { search: "penal" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(original)), snapshot);
});

// ── Estatísticas ───────────────────────────────────────────────────────────

test("searchStats deriva estatísticas apenas do resultado filtrado", () => {
  const entries = [
    entry({ subject: "A", minutes: 60, questions: [question(), question()], reviews: [{}] }),
    entry({ subject: "B", minutes: 90, questions: [question()], reviews: [] }),
  ];
  const filtered = searchEntries(entries, {});
  const stats = searchStats(filtered);
  assert.strictEqual(stats.sessionsCount, 2);
  assert.strictEqual(stats.totalMinutes, 150);
  assert.strictEqual(stats.questionsCount, 3);
  assert.strictEqual(stats.reviewsCount, 1);
  assert.strictEqual(stats.subjectsCount, 2);
});

test("searchStats de resultado vazio retorna zeros", () => {
  const stats = searchStats([]);
  assert.deepStrictEqual(stats, {
    sessionsCount: 0, totalMinutes: 0, questionsCount: 0, reviewsCount: 0, subjectsCount: 0,
  });
});

// ── Índice reconstruído / reutilizado ─────────────────────────────────────

test("buildSearchIndex retorna um registro por entrada, na mesma ordem recebida", () => {
  const entries = [entry({ title: "A" }), entry({ title: "B" })];
  const index = buildSearchIndex(entries);
  assert.strictEqual(index.length, 2);
  assert.strictEqual(index[0].entry.meta.title, "A");
  assert.strictEqual(index[1].entry.meta.title, "B");
});

test("searchEntries aceita um índice pré-construído (evita reconstruir a cada filtro)", () => {
  const entries = [entry({ subject: "Direito Penal" }), entry({ subject: "Direito Civil" })];
  const index = buildSearchIndex(entries);
  assert.strictEqual(searchEntries(index, { search: "penal" }).length, 1);
  assert.strictEqual(searchEntries(index, { onlyLong: true }).length, 0);
});

test("searchEntries sobre entries brutas e sobre o índice já construído produz o mesmo resultado", () => {
  const entries = [entry({ subject: "Direito Penal", minutes: 150 }), entry({ subject: "Direito Civil", minutes: 10 })];
  const index = buildSearchIndex(entries);
  const fromEntries = searchEntries(entries, { search: "direito" }).map(e => e.session.id);
  const fromIndex = searchEntries(index, { search: "direito" }).map(e => e.session.id);
  assert.deepStrictEqual(fromEntries, fromIndex);
});

test("índice reflete o estado das entradas no momento em que é construído (sem cache implícito no módulo)", () => {
  const target = entry({ reflection: null });
  const entries = [target];
  assert.strictEqual(searchEntries(buildSearchIndex(entries), { onlyWithReflection: true }).length, 0);

  target.extras.reflection = { content: "agora tem reflexão" };
  assert.strictEqual(searchEntries(buildSearchIndex(entries), { onlyWithReflection: true }).length, 1);
});

// ── Sem consulta externa ───────────────────────────────────────────────────

test("nenhuma função do módulo depende de fetch/rede/globalThis para operar", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("studySearchService não deveria chamar fetch"); };
  try {
    const entries = [entry({ subject: "Direito Penal", questions: [question()], reviews: [{}] })];
    const index = buildSearchIndex(entries);
    const result = searchEntries(index, { search: "penal" });
    searchStats(result);
    highlightMatches("Direito Penal", "penal");
    assert.strictEqual(result.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Estabilidade com milhares de entradas ──────────────────────────────────

test("mantém-se estável e correto com milhares de entradas", () => {
  const entries = Array.from({ length: 5000 }, (_, i) => entry({
    startedAt: new Date(2026, 0, 1, 0, i).toISOString(),
    minutes: (i % 200) + 5,
    subject: i % 7 === 0 ? "Processo Penal" : "Direito Civil",
    reflection: i % 3 === 0 ? { content: "reflexão de teste" } : null,
  }));

  const index = buildSearchIndex(entries);
  assert.strictEqual(index.length, 5000);

  const bySubject = searchEntries(index, { search: "processo penal" });
  assert.strictEqual(bySubject.length, entries.filter(e => e.meta.subject === "Processo Penal").length);

  const combined = searchEntries(index, { search: "processo penal", onlyWithReflection: true, onlyLong: true });
  const expected = entries.filter(e =>
    e.meta.subject === "Processo Penal" &&
    Boolean(e.extras.reflection) &&
    e.session.duration_minutes >= 120
  ).length;
  assert.strictEqual(combined.length, expected);

  const stats = searchStats(bySubject);
  assert.strictEqual(stats.sessionsCount, bySubject.length);
});
