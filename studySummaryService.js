/**
 * studySummaryService.js — Síntese Periódica de Aprendizado (F8.6).
 *
 * Camada de agregação puramente em memória sobre as entradas já carregadas
 * pelo Diário de Estudos (studyJournalView.js/F8.1-F8.5): cada entrada é
 * `{ session, meta, extras }`, o mesmo formato já resolvido para os cartões
 * de sessão e consumido por studyTimelineService.js (F8.5). Nenhuma função
 * aqui faz I/O — mesma filosofia de computeDashboardIndicators() em
 * activityDashboardService.js (F2.1) e de studyTimelineService.js: separar
 * o cálculo puro do ponto onde os dados são buscados.
 *
 * Não usa IA, não grava nada, não altera nenhum domínio existente. O texto
 * gerado é inteiramente derivado das entradas recebidas — nenhum template
 * externo, nenhuma chamada a serviço algum. Por receber apenas as entradas
 * já filtradas por studyJournalView (F8.4) e já agrupadas por dia/semana
 * (F8.3/F8.5), a síntese automaticamente só considera as sessões
 * atualmente visíveis — nenhuma consulta nova a activitySessionService/
 * sessionQuestionsService/reviewSessionService/studyReflectionService.
 */

import { pad } from "./utils.js";

// ── Formatação ────────────────────────────────────────────────────────────

// "18h42" para >= 1h, "42min" abaixo disso — mesma convenção de duração já
// usada no Diário (_formatDuration em studyJournalView.js), só que sem o
// espaço/"min" ao lado das horas, para ficar legível em texto corrido.
function _formatHM(minutes) {
  const total = minutes || 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${pad(m)}` : `${m}min`;
}

function _plural(count, singular, plural) {
  return count === 1 ? singular : plural;
}

// Junta uma lista em português: "A", "A e B", "A, B e C".
function _joinList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

// ── Agregação central ────────────────────────────────────────────────────
// Único ponto de derivação, reaproveitado por buildWeeklySummary() e
// buildMonthlySummary() — a diferença entre "semana" e "mês" é apenas quais
// entradas o chamador já filtrou/agrupou antes de passar aqui e o rótulo do
// texto gerado, nunca a lógica de agregação.

function _aggregate(entries) {
  const list = entries || [];

  const totalMinutes = list.reduce((sum, e) => sum + (e.session.duration_minutes || 0), 0);
  const sessionsCount = list.length;
  const questionsCount = list.reduce((sum, e) => sum + (e.extras?.questions?.length || 0), 0);
  const reviewsCount = list.reduce((sum, e) => sum + (e.extras?.reviews?.length || 0), 0);
  const reflectionsCount = list.filter(e => e.extras?.reflection).length;
  const observationsCount = list.filter(e => (e.session.notes || "").trim()).length;

  const subjects = Array.from(new Set(list.map(e => e.meta?.subject).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  // Matéria de maior dedicação: soma de minutos por matéria, desempate
  // alfabético (pt-BR) para determinismo.
  const minutesBySubject = new Map();
  list.forEach(e => {
    const subject = e.meta?.subject;
    if (!subject) return;
    minutesBySubject.set(subject, (minutesBySubject.get(subject) || 0) + (e.session.duration_minutes || 0));
  });
  let topSubject = null;
  minutesBySubject.forEach((minutes, subject) => {
    if (!topSubject || minutes > topSubject.minutes ||
        (minutes === topSubject.minutes && subject.localeCompare(topSubject.subject, "pt-BR") < 0)) {
      topSubject = { subject, minutes };
    }
  });

  // Conteúdos mais frequentes: contagem de questions[].topic entre todas as
  // entradas — mesmo campo já usado no detalhamento do cartão de sessão
  // (studyJournalView.js/_renderDetail). Ordenado por frequência desc, com
  // desempate alfabético (pt-BR).
  const countByContent = new Map();
  list.forEach(e => {
    (e.extras?.questions || []).forEach(q => {
      if (!q.topic) return;
      countByContent.set(q.topic, (countByContent.get(q.topic) || 0) + 1);
    });
  });
  const topContents = Array.from(countByContent.entries())
    .map(([content, count]) => ({ content, count }))
    .sort((a, b) => b.count - a.count || a.content.localeCompare(b.content, "pt-BR"));

  // Maior/menor sessão por tempo líquido — sem sessões, ambos null.
  let biggestSession = null;
  let smallestSession = null;
  list.forEach(e => {
    const minutes = e.session.duration_minutes || 0;
    const candidate = { minutes, subject: e.meta?.subject || null, title: e.meta?.title || null };
    if (!biggestSession || minutes > biggestSession.minutes) biggestSession = candidate;
    if (!smallestSession || minutes < smallestSession.minutes) smallestSession = candidate;
  });

  const averageMinutes = sessionsCount > 0 ? Math.round(totalMinutes / sessionsCount) : 0;

  return {
    totalMinutes,
    sessionsCount,
    questionsCount,
    reviewsCount,
    subjects,
    topSubject: topSubject ? topSubject.subject : null,
    topContents,
    reflectionsCount,
    observationsCount,
    biggestSession,
    smallestSession,
    averageMinutes,
  };
}

// ── Texto derivado ───────────────────────────────────────────────────────
// `periodPhrase`: "Nesta semana" ou "Neste mês" — único ponto onde os dois
// resumos divergem em prosa (concordância de gênero do artigo/contração já
// resolvida pelo chamador). Cada parágrafo só aparece quando há dado que o
// sustente (ex.: sem sessões, sem matéria de destaque).

function _buildText(summary, periodPhrase) {
  if (summary.sessionsCount === 0) {
    return `${periodPhrase} você ainda não registrou nenhuma sessão de estudo.`;
  }

  const paragraphs = [];

  paragraphs.push(
    `${periodPhrase} você realizou ${summary.sessionsCount} ${_plural(summary.sessionsCount, "sessão", "sessões")}, ` +
    `estudou durante ${_formatHM(summary.totalMinutes)}, ` +
    `resolveu ${summary.questionsCount} ${_plural(summary.questionsCount, "questão", "questões")}, ` +
    `revisou ${summary.reviewsCount} ${_plural(summary.reviewsCount, "conteúdo", "conteúdos")} ` +
    `e estudou ${summary.subjects.length} ${_plural(summary.subjects.length, "matéria diferente", "matérias diferentes")}.`
  );

  if (summary.topSubject) {
    paragraphs.push(`Sua maior dedicação foi em ${summary.topSubject}.`);
  }

  if (summary.topContents.length > 0) {
    const names = summary.topContents.slice(0, 3).map(c => c.content);
    paragraphs.push(`Os conteúdos mais frequentes foram ${_joinList(names)}.`);
  }

  if (summary.biggestSession) {
    paragraphs.push(`A sessão mais longa teve ${_formatHM(summary.biggestSession.minutes)}.`);
  }

  paragraphs.push(
    `Foram registradas ${summary.reflectionsCount} ${_plural(summary.reflectionsCount, "reflexão pessoal", "reflexões pessoais")} ` +
    `e ${summary.observationsCount} ${_plural(summary.observationsCount, "observação", "observações")}.`
  );

  return paragraphs.join("\n\n");
}

// ── APIs públicas ─────────────────────────────────────────────────────────
// Recebem apenas as entradas já carregadas/filtradas pelo Diário (o mesmo
// formato `{ session, meta, extras }` de _allEntries em studyJournalView.js)
// — quem decide quais entradas pertencem a qual semana/mês é o chamador
// (ex.: os `weekBuckets`/agrupamentos por dia já existentes em F8.3/F8.5),
// nunca este serviço.

export function buildWeeklySummary(entries) {
  const summary = _aggregate(entries);
  return { ...summary, text: _buildText(summary, "Nesta semana") };
}

export function buildMonthlySummary(entries) {
  const summary = _aggregate(entries);
  return { ...summary, text: _buildText(summary, "Neste mês") };
}
