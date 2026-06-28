/**
 * smartAssistant.js — Rule-based analysis engine for MedAgenda.
 * Pure logic: no DOM, no Supabase calls.
 * Input: array of base event objects (from getEvents()).
 * Output: { alerts, suggestions }
 */
import { expandEvents } from './recurrence.js';
import { isoDate, localDate } from './utils.js';

const LOOK_BACK_DAYS        = 14;
const LOOK_FORWARD_DAYS     = 60;
const BUSY_DAY_THRESHOLD    = 4;    // events in one day
const LONG_SHIFT_MINUTES    = 720;  // 12 hours
const NO_BREAK_MIN          = 15;   // minutes
const NO_STUDY_DAYS         = 12;   // days without study before alerting
const MAX_FREE_DAYS_SHOWN   = 2;
const MAX_BUSY_DAYS_SHOWN   = 3;

/**
 * Main entry point.
 * @param {object[]} allBaseEvents - raw events from getEvents()
 * @returns {{ alerts: object[], suggestions: object[] }}
 */
export function analyzeEvents(allBaseEvents) {
  if (!allBaseEvents?.length) return { alerts: [], suggestions: [] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);

  const winStart = new Date(today);
  winStart.setDate(today.getDate() - LOOK_BACK_DAYS);
  const winEnd = new Date(today);
  winEnd.setDate(today.getDate() + LOOK_FORWARD_DAYS);

  const expanded = expandEvents(allBaseEvents, isoDate(winStart), isoDate(winEnd));
  const upcoming = expanded.filter(e => e.event_date >= todayStr);

  return {
    alerts: [
      ...findConflicts(upcoming),
      ...findLongShifts(upcoming),
      ...findShiftThenEarlyClass(upcoming),
      ...findConsecutiveShifts(upcoming),
      ...findDuplicates(upcoming),
    ],
    suggestions: [
      ...findBusyDays(upcoming),
      ...findNoBreak(upcoming),
      ...findConcentratedExams(upcoming),
      ...findNoStudyStreak(expanded, todayStr),
      ...findFreeDays(upcoming, todayStr),
    ],
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function groupByDate(events) {
  const map = {};
  for (const ev of events) {
    if (!map[ev.event_date]) map[ev.event_date] = [];
    map[ev.event_date].push(ev);
  }
  return map;
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function addMinutesToTime(timeStr, minutes) {
  const base = toMinutes(timeStr);
  if (base === null) return null;
  const total = base + minutes;
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function endTime(ev) {
  if (!ev.start_time || !ev.duration_minutes) return null;
  return addMinutesToTime(ev.start_time, ev.duration_minutes);
}

function isCategory(ev, ...names) {
  if (!ev.category) return false;
  const cat = ev.category.toLowerCase();
  return names.some(n => cat.includes(n.toLowerCase()));
}

function fmtDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function getWeekMonday(dateStr) {
  const d = localDate(dateStr);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoDate(d);
}

// ── Alert detectors ─────────────────────────────────────────────────────────

function findConflicts(events) {
  const byDate = groupByDate(events);
  const results = [];

  for (const [date, dayEvs] of Object.entries(byDate)) {
    const timed = dayEvs
      .filter(e => e.start_time && e.duration_minutes)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    const reported = new Set();
    for (let i = 0; i < timed.length - 1; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        const a = timed[i];
        const b = timed[j];
        const aEnd = endTime(a);
        if (aEnd && b.start_time < aEnd) {
          const key = `${date}|${i}|${j}`;
          if (!reported.has(key)) {
            reported.add(key);
            results.push({
              type: 'conflict',
              severity: 'error',
              icon: '⚠',
              title: 'Horários sobrepostos',
              message: `${fmtDate(date)}: "${a.title}" e "${b.title}" se sobrepõem.`,
              date,
            });
          }
          break;
        }
      }
    }
  }
  return results;
}

function findLongShifts(events) {
  return events
    .filter(e => isCategory(e, 'Plantão') && e.duration_minutes > LONG_SHIFT_MINUTES)
    .map(e => ({
      type: 'long_shift',
      severity: 'warning',
      icon: '⚠',
      title: 'Plantão muito longo',
      message: `${fmtDate(e.event_date)}: "${e.title}" dura ${Math.round(e.duration_minutes / 60)}h.`,
      date: e.event_date,
    }));
}

function findShiftThenEarlyClass(events) {
  const byDate = groupByDate(events);
  const dates = Object.keys(byDate).sort();
  const results = [];

  for (let i = 0; i < dates.length - 1; i++) {
    const dateA = dates[i];
    const dateB = dates[i + 1];

    const dA = localDate(dateA);
    const dB = localDate(dateB);
    if ((dB - dA) / 86400000 !== 1) continue;

    const lateShifts = byDate[dateA].filter(e => {
      if (!isCategory(e, 'Plantão') || !e.start_time) return false;
      const end = endTime(e);
      return end && end >= '22:00';
    });

    const earlyClasses = byDate[dateB].filter(e =>
      isCategory(e, 'Aula') && e.start_time && e.start_time <= '08:00'
    );

    if (lateShifts.length > 0 && earlyClasses.length > 0) {
      results.push({
        type: 'shift_before_class',
        severity: 'warning',
        icon: '⚠',
        title: 'Plantão seguido de aula cedo',
        message: `Plantão até tarde em ${fmtDate(dateA)} e aula às ${earlyClasses[0].start_time.slice(0, 5)} em ${fmtDate(dateB)}.`,
        date: dateA,
      });
    }
  }
  return results;
}

function findConsecutiveShifts(events) {
  const shifts = events
    .filter(e => isCategory(e, 'Plantão'))
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const results = [];
  let i = 0;
  while (i < shifts.length - 1) {
    const a = shifts[i];
    const b = shifts[i + 1];
    const diff = (localDate(b.event_date) - localDate(a.event_date)) / 86400000;
    if (diff <= 1) {
      results.push({
        type: 'consecutive_shifts',
        severity: 'warning',
        icon: '⚠',
        title: 'Plantões consecutivos',
        message: `Plantão em ${fmtDate(a.event_date)} seguido de outro em ${fmtDate(b.event_date)}.`,
        date: a.event_date,
      });
      i += 2;
    } else {
      i++;
    }
  }
  return results;
}

function findDuplicates(events) {
  const seen = new Map();
  const results = [];

  for (const ev of events) {
    const key = `${(ev.title || '').toLowerCase()}|${ev.event_date}|${ev.start_time || ''}`;
    if (seen.has(key)) {
      results.push({
        type: 'duplicate',
        severity: 'warning',
        icon: '⚠',
        title: 'Evento duplicado',
        message: `"${ev.title}" aparece mais de uma vez em ${fmtDate(ev.event_date)}.`,
        date: ev.event_date,
      });
    } else {
      seen.set(key, ev);
    }
  }
  return results;
}

// ── Suggestion detectors ────────────────────────────────────────────────────

function findBusyDays(events) {
  const byDate = groupByDate(events);
  return Object.entries(byDate)
    .filter(([, evs]) => evs.length >= BUSY_DAY_THRESHOLD)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_BUSY_DAYS_SHOWN)
    .map(([date, evs]) => ({
      type: 'busy_day',
      severity: 'info',
      icon: '💡',
      title: 'Dia muito cheio',
      message: `${fmtDate(date)}: ${evs.length} compromissos agendados.`,
      date,
    }));
}

function findNoBreak(events) {
  const byDate = groupByDate(events);
  const results = [];

  for (const [date, dayEvs] of Object.entries(byDate)) {
    const timed = dayEvs
      .filter(e => e.start_time && e.duration_minutes)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));

    for (let i = 0; i < timed.length - 1; i++) {
      const a = timed[i];
      const b = timed[i + 1];
      const aEnd = endTime(a);
      if (!aEnd) continue;
      const gap = toMinutes(b.start_time) - toMinutes(aEnd);
      if (gap >= 0 && gap < NO_BREAK_MIN) {
        results.push({
          type: 'no_break',
          severity: 'info',
          icon: '💡',
          title: 'Sem intervalo',
          message: `${fmtDate(date)}: menos de ${NO_BREAK_MIN} min entre "${a.title}" e "${b.title}".`,
          date,
        });
        break;
      }
    }
  }
  return results;
}

function findConcentratedExams(events) {
  const byWeek = {};
  for (const ev of events) {
    if (!isCategory(ev, 'Prova')) continue;
    const wk = getWeekMonday(ev.event_date);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(ev);
  }

  return Object.entries(byWeek)
    .filter(([, evs]) => evs.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, evs]) => ({
      type: 'concentrated_exams',
      severity: 'info',
      icon: '💡',
      title: 'Provas concentradas',
      message: `Semana de ${fmtDate(week)}: ${evs.length} provas agendadas.`,
      date: week,
    }));
}

function findNoStudyStreak(events, todayStr) {
  const studyPast = events
    .filter(e => isCategory(e, 'Estudo') && e.event_date <= todayStr)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  if (studyPast.length === 0) {
    return [{
      type: 'no_study',
      severity: 'info',
      icon: '💡',
      title: 'Sem tempo para estudo',
      message: 'Nenhum horário de estudo registrado nos últimos 14 dias.',
    }];
  }

  const lastStudy = localDate(studyPast[0].event_date);
  const today = localDate(todayStr);
  const daysSince = Math.floor((today - lastStudy) / 86400000);

  if (daysSince >= NO_STUDY_DAYS) {
    return [{
      type: 'no_study',
      severity: 'info',
      icon: '💡',
      title: 'Sem tempo para estudo',
      message: `Você está há ${daysSince} dias sem registrar nenhum horário de estudo.`,
    }];
  }
  return [];
}

function findFreeDays(events, todayStr) {
  const occupiedDates = new Set(events.map(e => e.event_date));
  const results = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const dateStr = isoDate(d);
    if (!occupiedDates.has(dateStr)) {
      results.push({
        type: 'free_day',
        severity: 'success',
        icon: '📅',
        title: 'Dia livre disponível',
        message: `${fmtDate(dateStr)} está livre — boa oportunidade para estudos!`,
        date: dateStr,
      });
    }
  }
  return results.slice(0, MAX_FREE_DAYS_SHOWN);
}
