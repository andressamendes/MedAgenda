/**
 * Tests for studyMilestoneService.js — Marcos da Evolução (F8.7).
 * Módulo puro, sem I/O: nenhum mock necessário — mesmo padrão de
 * studyTimelineService.test.js, que também testa a agregação isoladamente
 * da busca de dados.
 */
import { test } from "node:test";
import assert from "node:assert";
import { buildMilestones } from "../../studyMilestoneService.js";

let _id = 0;
function entry({
  startedAt,
  minutes = 30,
  questions = [],
  reviews = [],
  reflection = null,
  subject = null,
} = {}) {
  _id += 1;
  return {
    session: { id: `s${_id}`, started_at: startedAt, duration_minutes: minutes },
    meta: { subject },
    extras: { questions, reviews, reflection },
  };
}

function iso(day, hour = 8) {
  return `2026-01-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function byType(milestones, type) {
  return milestones.filter(m => m.type === type);
}

// ── Ausência de dados ────────────────────────────────────────────────────

test("buildMilestones retorna vazio quando não há entradas", () => {
  assert.deepStrictEqual(buildMilestones([]), []);
  assert.deepStrictEqual(buildMilestones(undefined), []);
});

// ── Estrutura do marco ───────────────────────────────────────────────────

test("cada marco possui id, type, date, title, description, icon, severity e relatedSessionId", () => {
  const milestones = buildMilestones([entry({ startedAt: iso(1) })]);
  const first = milestones.find(m => m.type === "first_session");
  assert.ok(first);
  assert.deepStrictEqual(Object.keys(first).sort(), [
    "date", "description", "icon", "id", "relatedSessionId", "severity", "title", "type",
  ].sort());
  assert.ok(["info", "success", "warning"].includes(first.severity));
});

// ── Primeira sessão / marcos de sessões ──────────────────────────────────

test("primeira sessão gera o marco first_session na primeira entrada cronológica", () => {
  const entries = [entry({ startedAt: iso(2) }), entry({ startedAt: iso(1) })];
  const milestones = buildMilestones(entries);
  const first = byType(milestones, "first_session");
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].date, iso(1));
  assert.strictEqual(first[0].title, "Primeira sessão");
});

test("marcos de contagem de sessões disparam ao atingir 10/25/50/100 sessões", () => {
  const entries = Array.from({ length: 25 }, (_, i) => entry({ startedAt: iso(i + 1) }));
  const milestones = buildMilestones(entries);

  assert.strictEqual(byType(milestones, "sessions_10").length, 1);
  assert.strictEqual(byType(milestones, "sessions_10")[0].date, iso(10));
  assert.strictEqual(byType(milestones, "sessions_25").length, 1);
  assert.strictEqual(byType(milestones, "sessions_25")[0].date, iso(25));
  assert.strictEqual(byType(milestones, "sessions_50").length, 0);
});

// ── Marcos de horas ──────────────────────────────────────────────────────

test("marcos de tempo disparam ao ultrapassar 60/600 minutos acumulados", () => {
  const entries = [
    entry({ startedAt: iso(1), minutes: 40 }),
    entry({ startedAt: iso(2), minutes: 40 }), // acumulado 80 -> cruza 60
  ];
  const milestones = buildMilestones(entries);
  const firstHour = byType(milestones, "first_hour");
  assert.strictEqual(firstHour.length, 1);
  assert.strictEqual(firstHour[0].date, iso(2));
  assert.strictEqual(firstHour[0].title, "Primeira hora estudada");
});

test("marco de 10 horas dispara ao acumular 600 minutos", () => {
  const entries = Array.from({ length: 10 }, (_, i) => entry({ startedAt: iso(i + 1), minutes: 60 }));
  const milestones = buildMilestones(entries);
  const tenHours = byType(milestones, "hours_10");
  assert.strictEqual(tenHours.length, 1);
  assert.strictEqual(tenHours[0].date, iso(10));
});

// ── Marcos de questões ───────────────────────────────────────────────────

test("marco de 100 questões dispara ao acumular 100 questões resolvidas", () => {
  const entries = [
    entry({ startedAt: iso(1), questions: Array(60).fill({}) }),
    entry({ startedAt: iso(2), questions: Array(50).fill({}) }), // acumulado 110 -> cruza 100
  ];
  const milestones = buildMilestones(entries);
  const q100 = byType(milestones, "questions_100");
  assert.strictEqual(q100.length, 1);
  assert.strictEqual(q100[0].date, iso(2));
});

// ── Primeira reflexão ─────────────────────────────────────────────────────

test("first_reflection aparece na primeira entrada cronológica com reflexão registrada", () => {
  const entries = [
    entry({ startedAt: iso(1) }),
    entry({ startedAt: iso(2), reflection: { content: "aprendi X" } }),
    entry({ startedAt: iso(3), reflection: { content: "aprendi Y" } }),
  ];
  const milestones = buildMilestones(entries);
  const reflection = byType(milestones, "first_reflection");
  assert.strictEqual(reflection.length, 1);
  assert.strictEqual(reflection[0].date, iso(2));
});

test("sem nenhuma reflexão registrada, nenhum marco first_reflection é gerado", () => {
  const milestones = buildMilestones([entry({ startedAt: iso(1) })]);
  assert.strictEqual(byType(milestones, "first_reflection").length, 0);
});

// ── Primeira revisão ─────────────────────────────────────────────────────

test("first_review aparece na primeira entrada cronológica com revisão vinculada", () => {
  const entries = [
    entry({ startedAt: iso(1) }),
    entry({ startedAt: iso(2), reviews: [{ id: "r1" }] }),
  ];
  const milestones = buildMilestones(entries);
  const review = byType(milestones, "first_review");
  assert.strictEqual(review.length, 1);
  assert.strictEqual(review[0].date, iso(2));
});

// ── Matérias ─────────────────────────────────────────────────────────────

test("first_subject e limiares de 5/10 matérias distintas seguem a ordem de primeira aparição", () => {
  const subjects = ["Cardio", "Farmaco", "Ética", "Anatomia", "Pediatria"];
  const entries = subjects.map((subject, i) => entry({ startedAt: iso(i + 1), subject }));
  const milestones = buildMilestones(entries);

  const first = byType(milestones, "first_subject");
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].date, iso(1));
  assert.match(first[0].description, /Cardio/);

  const five = byType(milestones, "subjects_5");
  assert.strictEqual(five.length, 1);
  assert.strictEqual(five[0].date, iso(5));
});

test("matérias repetidas não contam duas vezes para os limiares", () => {
  const entries = [
    entry({ startedAt: iso(1), subject: "Cardio" }),
    entry({ startedAt: iso(2), subject: "Cardio" }),
    entry({ startedAt: iso(3), subject: "Cardio" }),
  ];
  const milestones = buildMilestones(entries);
  assert.strictEqual(byType(milestones, "first_subject").length, 1);
  assert.strictEqual(byType(milestones, "subjects_5").length, 0);
});

// ── Recorde de sessão (duração) ──────────────────────────────────────────

test("recorde de sessão só dispara quando a duração supera o maior valor visto até então", () => {
  const entries = [
    entry({ startedAt: iso(1), minutes: 40 }), // baseline, sem marco
    entry({ startedAt: iso(2), minutes: 80 }), // supera -> marco
    entry({ startedAt: iso(3), minutes: 30 }), // não supera -> nada
    entry({ startedAt: iso(4), minutes: 120 }), // supera -> novo marco
  ];
  const milestones = buildMilestones(entries);
  const records = byType(milestones, "record_session_duration");
  assert.strictEqual(records.length, 2);
  assert.deepStrictEqual(records.map(r => r.date).sort(), [iso(2), iso(4)].sort());
});

// ── Recorde de questões em uma sessão ────────────────────────────────────

test("recorde de questões por sessão segue a mesma lógica de comparação", () => {
  const entries = [
    entry({ startedAt: iso(1), questions: Array(5).fill({}) }),
    entry({ startedAt: iso(2), questions: Array(3).fill({}) }), // não supera
    entry({ startedAt: iso(3), questions: Array(10).fill({}) }), // supera -> marco
  ];
  const milestones = buildMilestones(entries);
  const records = byType(milestones, "record_session_questions");
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].date, iso(3));
});

// ── Recorde diário ───────────────────────────────────────────────────────

test("recorde diário agrega minutos por dia antes de comparar", () => {
  const entries = [
    entry({ startedAt: iso(1, 8), minutes: 30 }),
    entry({ startedAt: iso(1, 20), minutes: 30 }), // dia 1 total: 60min (baseline)
    entry({ startedAt: iso(2, 8), minutes: 20 }),
    entry({ startedAt: iso(2, 20), minutes: 20 }), // dia 2 total: 40min, não supera
    entry({ startedAt: iso(3, 8), minutes: 80 }), // dia 3 total: 80min, supera -> marco
  ];
  const milestones = buildMilestones(entries);
  const records = byType(milestones, "record_daily_minutes");
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].date, iso(3, 8));
});

// ── Constância ───────────────────────────────────────────────────────────

test("marcos de constância reaproveitam o conceito de dias consecutivos e disparam nos limiares certos", () => {
  const entries = Array.from({ length: 7 }, (_, i) => entry({ startedAt: iso(i + 1) }));
  const milestones = buildMilestones(entries);

  const first = byType(milestones, "streak_2");
  assert.strictEqual(first.length, 1);
  assert.strictEqual(first[0].date, iso(2));

  const seven = byType(milestones, "streak_7");
  assert.strictEqual(seven.length, 1);
  assert.strictEqual(seven[0].date, iso(7));

  assert.strictEqual(byType(milestones, "streak_15").length, 0);
});

test("sequência quebrada e reiniciada não repete um marco de constância já emitido", () => {
  // 3 dias seguidos (streak_2 emitido), quebra, depois mais 2 dias seguidos.
  const entries = [
    entry({ startedAt: iso(1) }),
    entry({ startedAt: iso(2) }),
    entry({ startedAt: iso(3) }),
    entry({ startedAt: iso(10) }),
    entry({ startedAt: iso(11) }),
  ];
  const milestones = buildMilestones(entries);
  assert.strictEqual(byType(milestones, "streak_2").length, 1);
});

// ── Ordenação cronológica / ausência de duplicação ───────────────────────

test("buildMilestones retorna os marcos em ordem cronológica decrescente (mais recente primeiro)", () => {
  const entries = Array.from({ length: 12 }, (_, i) => entry({ startedAt: iso(i + 1) }));
  const milestones = buildMilestones(entries);
  for (let i = 1; i < milestones.length; i++) {
    assert.ok(new Date(milestones[i - 1].date) >= new Date(milestones[i].date));
  }
});

test("cada tipo de marco de limiar aparece no máximo uma vez (sem duplicação)", () => {
  const entries = Array.from({ length: 30 }, (_, i) => entry({ startedAt: iso(i % 28 + 1), minutes: 50 }));
  const milestones = buildMilestones(entries);
  const typeCounts = new Map();
  milestones.forEach(m => {
    if (m.type.startsWith("record_")) return; // recordes podem repetir por natureza
    typeCounts.set(m.type, (typeCounts.get(m.type) || 0) + 1);
  });
  for (const [type, count] of typeCounts) {
    assert.strictEqual(count, 1, `tipo ${type} apareceu ${count} vezes`);
  }
});

// ── Estabilidade com filtros ─────────────────────────────────────────────

test("aplicar os mesmos filtros do Diário sobre as mesmas entradas produz os mesmos marcos", () => {
  const entries = [
    entry({ startedAt: iso(1), subject: "Cardio" }),
    entry({ startedAt: iso(2), subject: "Farmaco" }),
    entry({ startedAt: iso(3), subject: "Cardio" }),
  ];
  const filtered = entries.filter(e => e.meta.subject === "Cardio");

  const a = buildMilestones(filtered);
  const b = buildMilestones(filtered.slice()); // mesma composição, array diferente

  assert.deepStrictEqual(a, b);
});

test("buildMilestones é puro: chamadas repetidas com a mesma entrada retornam o mesmo resultado", () => {
  const entries = [entry({ startedAt: iso(1) }), entry({ startedAt: iso(2), minutes: 90 })];
  assert.deepStrictEqual(buildMilestones(entries), buildMilestones(entries));
});

// ── Nenhuma consulta externa ─────────────────────────────────────────────
// Módulo não importa nenhum serviço de I/O (activitySessionService,
// questionService, reviewSessionService, studyReflectionService,
// Supabase) — buildMilestones funciona inteiramente offline, sem stubs.

test("buildMilestones funciona sem qualquer mock de rede/banco (nenhuma consulta externa)", () => {
  const entries = [entry({ startedAt: iso(1) })];
  assert.doesNotThrow(() => buildMilestones(entries));
});
