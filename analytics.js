/**
 * analytics.js — Statistics and upcoming event calculations for MedAgenda.
 * Pure computation: no DOM, no Supabase calls.
 * Input: array of base event objects (from getEvents()).
 * Output: stats object for display in the assistant dashboard.
 */
import { expandEvents } from './recurrence.js';
import { isoDate } from './utils.js';

/**
 * Computes statistics for the current month and the next 7 days.
 * @param {object[]} allBaseEvents - raw events from getEvents()
 * @returns {object} stats
 */
export function computeStats(allBaseEvents) {
  if (!allBaseEvents?.length) return emptyStats();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);

  const y = today.getFullYear();
  const m = today.getMonth();
  const monthStart = isoDate(new Date(y, m, 1));
  const monthEnd   = isoDate(new Date(y, m + 1, 0));

  const week7 = new Date(today);
  week7.setDate(today.getDate() + 7);
  const week7Str = isoDate(week7);

  // Expand events over the month + 7-day window
  const expanded = expandEvents(allBaseEvents, monthStart, week7Str);

  const thisMonth = expanded.filter(e => e.event_date >= monthStart && e.event_date <= monthEnd);
  const upcoming  = expanded
    .filter(e => e.event_date >= todayStr && e.event_date <= week7Str)
    .sort((a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.start_time || '').localeCompare(b.start_time || '')
    )
    .slice(0, 5);

  // Aggregate hours and event count by category for this month
  const hoursByCategory  = {};
  const countByCategory  = {};
  let totalHours = 0;

  for (const ev of thisMonth) {
    const cat = ev.category || 'Outros';
    hoursByCategory[cat]  = (hoursByCategory[cat]  || 0) + (ev.duration_minutes || 0) / 60;
    countByCategory[cat]  = (countByCategory[cat]  || 0) + 1;
    totalHours += (ev.duration_minutes || 0) / 60;
  }

  // Sort categories by total hours descending
  const topCategories = Object.entries(hoursByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10, count: countByCategory[name] }));

  return {
    totalThisMonth: thisMonth.length,
    totalHours: Math.round(totalHours * 10) / 10,
    topCategories,
    countByCategory,
    upcoming,
  };
}

function emptyStats() {
  return {
    totalThisMonth: 0,
    totalHours: 0,
    topCategories: [],
    countByCategory: {},
    upcoming: [],
  };
}
