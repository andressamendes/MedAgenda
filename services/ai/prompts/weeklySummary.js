/**
 * weeklySummary.js — Prepares event data for weekly summary analysis.
 * Extracts only the current week's events, stripped of sensitive fields.
 */
import { isoDate, mondayOf } from '../../../utils.js';
import { expandEvents } from '../../../recurrence.js';

/**
 * @param {object[]} allBaseEvents - Raw events from getEvents()
 * @returns {{ type: string, events: object[], weekStart: string, weekEnd: string }}
 */
export function prepareWeeklySummary(allBaseEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monday = mondayOf(today);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = isoDate(monday);
  const weekEnd   = isoDate(sunday);

  const expanded = expandEvents(allBaseEvents, weekStart, weekEnd);

  const events = expanded.map(ev => ({
    title:            ev.title,
    date:             ev.event_date,
    start_time:       ev.start_time ?? null,
    duration_minutes: ev.duration_minutes ?? null,
    category:         ev.category ?? null,
    location:         ev.location ?? null,
  }));

  return { type: 'weekly_summary', events, weekStart, weekEnd };
}
