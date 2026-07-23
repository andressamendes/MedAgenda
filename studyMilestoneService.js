/**
 * studyMilestoneService.js — Marcos da Evolução (F8.7).
 *
 * Camada de agregação puramente em memória sobre as entradas já carregadas
 * pelo Diário de Estudos (studyJournalView.js/F8.1-F8.5): cada entrada é
 * `{ session, meta, extras }`, o mesmo formato já resolvido para os cartões
 * de sessão e consumido por studyTimelineService.js (F8.5). Nenhuma função
 * aqui faz I/O, consulta serviço algum ou usa IA — mesma filosofia da F6.1:
 * Sessão/Questão/Revisão/
 * Reflexão são fatos, "Marco" é interpretação derivada, nunca persistida.
 * Toda vez que buildMilestones() é chamado, os marcos são recalculados do
 * zero a partir das entradas recebidas — não existe tabela "milestones",
 * não existe cache, não existe evento publicado.
 *
 * "Dia estudado"/"sequência consecutiva" reaproveita exatamente o mesmo
 * conceito de studyStreakService.js (F6.11) — dia civil local de
 * started_at, consecutivo = diferença de exatamente 1 dia — só que
 * recalculado sobre o subconjunto de entradas já em memória (mesma razão de
 * studyTimelineService.js/_longestConsecutiveStreak: nenhuma consulta nova a
 * activitySessionService).
 *
 * Marcos de "recorde" (maior sessão, maior quantidade de questões em uma
 * sessão, maior tempo estudado em um dia) não são metas fixas — são
 * comparações: cada entrada só gera um marco quando supera o maior valor já
 * visto até então, nunca quando apenas iguala ou fica abaixo. A primeira
 * entrada nunca gera marco de recorde (não há o que superar ainda).
 */

import { pad } from "./utils.js";

// ── Marco: construção do objeto de retorno ─────────────────────────────────

function _makeMilestone(id, type, date, title, description, icon, severity, relatedSessionId) {
  return { id, type, date, title, description, icon, severity, relatedSessionId };
}

// ── Ordenação cronológica ────────────────────────────────────────────────
// Marcos são derivados na ordem em que aconteceram (started_at asc) — o
// mesmo critério de desempate por id usado em outros pontos do domínio
// (ex.: subjectProgressService/_sortSubjects) garante determinismo quando
// duas sessões têm o mesmo started_at.

function _sortEntriesAsc(entries) {
  return [...entries].sort((a, b) => {
    const diff = new Date(a.session.started_at) - new Date(b.session.started_at);
    if (diff !== 0) return diff;
    return String(a.session.id || "").localeCompare(String(b.session.id || ""));
  });
}

// ── Dia civil local (mesmo conceito de studyStreakService.js/_dayKey) ──────

function _dayKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _daysBetween(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// ── Marcos por limiar cumulativo ────────────────────────────────────────
// Padrão comum a Sessões/Tempo/Questões: soma um valor por entrada, em
// ordem cronológica, e gera um marco na primeira entrada em que o total
// acumulado atinge (ou ultrapassa) cada limiar — cada limiar dispara uma
// única vez, mesmo que o incremento de uma entrada pule vários limiares de
// uma vez.

function _cumulativeThresholdMilestones(sortedEntries, thresholds, getValue, buildFor) {
  const emitted = new Set();
  const milestones = [];
  let cumulative = 0;
  for (const entry of sortedEntries) {
    cumulative += getValue(entry);
    for (const threshold of thresholds) {
      if (!emitted.has(threshold) && cumulative >= threshold) {
        emitted.add(threshold);
        milestones.push(buildFor(threshold, entry));
      }
    }
  }
  return milestones;
}

// ── Sessões ──────────────────────────────────────────────────────────────

function _sessionMilestones(sortedEntries) {
  return _cumulativeThresholdMilestones(
    sortedEntries,
    [1, 10, 25, 50, 100],
    () => 1,
    (threshold, entry) => {
      const type = threshold === 1 ? "first_session" : `sessions_${threshold}`;
      const title = threshold === 1 ? "Primeira sessão" : `${threshold} sessões concluídas`;
      const description = threshold === 1
        ? "Você concluiu sua primeira sessão de estudo."
        : `Você concluiu ${threshold} sessões de estudo.`;
      return _makeMilestone(type, type, entry.session.started_at, title, description, "check-circle", "success", entry.session.id);
    }
  );
}

// ── Tempo ────────────────────────────────────────────────────────────────

const _HOURS_BY_MINUTES = { 60: 1, 600: 10, 1500: 25, 3000: 50, 6000: 100 };

function _timeMilestones(sortedEntries) {
  return _cumulativeThresholdMilestones(
    sortedEntries,
    [60, 600, 1500, 3000, 6000],
    (entry) => entry.session.duration_minutes || 0,
    (threshold, entry) => {
      const hours = _HOURS_BY_MINUTES[threshold];
      const type = hours === 1 ? "first_hour" : `hours_${hours}`;
      const title = hours === 1 ? "Primeira hora estudada" : `${hours} horas estudadas`;
      const description = hours === 1
        ? "Você atingiu 1 hora de estudo acumulada."
        : `Você acumulou ${hours} horas de estudo.`;
      return _makeMilestone(type, type, entry.session.started_at, title, description, "clock", "success", entry.session.id);
    }
  );
}

// ── Questões ─────────────────────────────────────────────────────────────

function _questionMilestones(sortedEntries) {
  return _cumulativeThresholdMilestones(
    sortedEntries,
    [100, 500, 1000],
    (entry) => entry.extras?.questions?.length || 0,
    (threshold, entry) => {
      const type = `questions_${threshold}`;
      return _makeMilestone(
        type, type, entry.session.started_at,
        `${threshold} questões resolvidas`,
        `Você resolveu ${threshold} questões acumuladas.`,
        "target", "success", entry.session.id
      );
    }
  );
}

// ── Reflexões / Revisões ─────────────────────────────────────────────────

function _firstReflectionMilestone(sortedEntries) {
  const entry = sortedEntries.find(e => Boolean(e.extras?.reflection));
  if (!entry) return [];
  return [_makeMilestone(
    "first_reflection", "first_reflection", entry.session.started_at,
    "Primeira reflexão registrada",
    "Você registrou sua primeira reflexão pessoal.",
    "book", "info", entry.session.id
  )];
}

function _firstReviewMilestone(sortedEntries) {
  const entry = sortedEntries.find(e => (e.extras?.reviews?.length || 0) > 0);
  if (!entry) return [];
  return [_makeMilestone(
    "first_review", "first_review", entry.session.started_at,
    "Primeira revisão vinculada",
    "Você vinculou sua primeira revisão espaçada a uma sessão.",
    "check-circle", "info", entry.session.id
  )];
}

// ── Matérias ─────────────────────────────────────────────────────────────
// "Distintas" conta pela ordem de primeira aparição cronológica de cada
// matéria (meta.subject) — não por ordem alfabética, que é só apresentação
// (ver subjectProgressService.js/_sortSubjects).

function _subjectMilestones(sortedEntries) {
  const seen = new Set();
  const milestones = [];
  const countThresholds = new Set([5, 10]);

  for (const entry of sortedEntries) {
    const subject = entry.meta?.subject;
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);

    if (seen.size === 1) {
      milestones.push(_makeMilestone(
        "first_subject", "first_subject", entry.session.started_at,
        "Primeira matéria estudada",
        `Você começou a estudar ${subject}.`,
        "book", "success", entry.session.id
      ));
    }

    if (countThresholds.has(seen.size)) {
      const type = `subjects_${seen.size}`;
      milestones.push(_makeMilestone(
        type, type, entry.session.started_at,
        `${seen.size} matérias diferentes`,
        `Você já estudou ${seen.size} matérias diferentes.`,
        "book", "success", entry.session.id
      ));
    }
  }

  return milestones;
}

// ── Recordes ─────────────────────────────────────────────────────────────
// Comparação, não meta: a primeira entrada só define a base (nenhum marco);
// cada entrada seguinte só gera marco quando supera estritamente o maior
// valor visto até então.

function _recordMilestones(sortedEntries) {
  const milestones = [];
  let maxDuration = null;
  let maxQuestions = null;

  sortedEntries.forEach((entry) => {
    const duration = entry.session.duration_minutes || 0;
    if (maxDuration !== null && duration > maxDuration) {
      milestones.push(_makeMilestone(
        `record_session_duration-${entry.session.id}`, "record_session_duration", entry.session.started_at,
        "Maior sessão até agora",
        `Sua sessão mais longa até agora: ${duration} minuto(s).`,
        "clock", "warning", entry.session.id
      ));
    }
    if (maxDuration === null || duration > maxDuration) maxDuration = duration;

    const questionsCount = entry.extras?.questions?.length || 0;
    if (maxQuestions !== null && questionsCount > maxQuestions) {
      milestones.push(_makeMilestone(
        `record_session_questions-${entry.session.id}`, "record_session_questions", entry.session.started_at,
        "Maior quantidade de questões em uma sessão",
        `Você resolveu ${questionsCount} questão(ões) em uma única sessão — novo recorde.`,
        "target", "warning", entry.session.id
      ));
    }
    if (maxQuestions === null || questionsCount > maxQuestions) maxQuestions = questionsCount;
  });

  return milestones;
}

// Recorde diário: agrega minutos por dia civil local antes de comparar —
// mesmo dia com múltiplas sessões conta como um único total (mesma unidade
// de "dia estudado" de studyStreakService.js/_studyDaySet).
function _dailyRecordMilestones(sortedEntries) {
  const dayTotals = new Map();
  for (const entry of sortedEntries) {
    const key = _dayKey(entry.session.started_at);
    const current = dayTotals.get(key) || { minutes: 0, lastEntry: entry };
    current.minutes += entry.session.duration_minutes || 0;
    current.lastEntry = entry;
    dayTotals.set(key, current);
  }

  const days = [...dayTotals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const milestones = [];
  let maxMinutes = null;

  days.forEach(([key, data]) => {
    if (maxMinutes !== null && data.minutes > maxMinutes) {
      milestones.push(_makeMilestone(
        `record_daily_minutes-${key}`, "record_daily_minutes", data.lastEntry.session.started_at,
        "Novo recorde diário",
        `Você estudou ${data.minutes} minuto(s) em um único dia — novo recorde.`,
        "clock", "warning", data.lastEntry.session.id
      ));
    }
    if (maxMinutes === null || data.minutes > maxMinutes) maxMinutes = data.minutes;
  });

  return milestones;
}

// ── Constância ───────────────────────────────────────────────────────────
// Mesmo conceito de dias consecutivos de studyStreakService.js/
// _longestStreak: cada marco de limiar (2/7/15/30 dias) só é emitido uma
// única vez, na primeira vez em que a maior sequência já vista atinge
// aquele tamanho — sequências quebradas e reiniciadas não repetem um marco
// já emitido.

function _streakMilestones(sortedEntries) {
  const dayKeys = [...new Set(sortedEntries.map(e => _dayKey(e.session.started_at)))].sort();
  if (dayKeys.length === 0) return [];

  const lastEntryByDay = new Map();
  for (const entry of sortedEntries) {
    lastEntryByDay.set(_dayKey(entry.session.started_at), entry);
  }

  const thresholds = [2, 7, 15, 30];
  const emitted = new Set();
  const milestones = [];

  let currentStreak = 1;
  let bestStreak = 1;

  for (let i = 1; i < dayKeys.length; i++) {
    currentStreak = _daysBetween(dayKeys[i - 1], dayKeys[i]) === 1 ? currentStreak + 1 : 1;
    if (currentStreak <= bestStreak) continue;

    const previousBest = bestStreak;
    bestStreak = currentStreak;

    for (const threshold of thresholds) {
      if (emitted.has(threshold) || threshold <= previousBest || threshold > bestStreak) continue;
      emitted.add(threshold);
      const entry = lastEntryByDay.get(dayKeys[i]);
      const title = threshold === 2 ? "Primeiro dia consecutivo" : `${threshold} dias consecutivos`;
      const description = threshold === 2
        ? "Você estudou em dois dias seguidos."
        : `Você manteve uma sequência de ${threshold} dias consecutivos estudando.`;
      const type = `streak_${threshold}`;
      milestones.push(_makeMilestone(type, type, entry.session.started_at, title, description, "flame", "success", entry.session.id));
    }
  }

  return milestones;
}

// ── API pública ──────────────────────────────────────────────────────────
// Recebe apenas as entradas já carregadas pelo Diário (mesmo formato
// `{ session, meta, extras }` de _allEntries em studyJournalView.js) —
// quem decide quais entradas estão visíveis (filtros do F8.4) é sempre o
// chamador; aplicar os mesmos filtros produz os mesmos marcos, sem nenhuma
// consulta adicional. Retorna em ordem cronológica decrescente (mais
// recente primeiro), pronta para exibição direta pela timeline (F8.7).
export function buildMilestones(entries) {
  const list = entries || [];
  if (list.length === 0) return [];

  const sorted = _sortEntriesAsc(list);

  const milestones = [
    ..._sessionMilestones(sorted),
    ..._timeMilestones(sorted),
    ..._questionMilestones(sorted),
    ..._firstReflectionMilestone(sorted),
    ..._firstReviewMilestone(sorted),
    ..._subjectMilestones(sorted),
    ..._recordMilestones(sorted),
    ..._dailyRecordMilestones(sorted),
    ..._streakMilestones(sorted),
  ];

  return milestones.sort((a, b) => new Date(b.date) - new Date(a.date));
}
