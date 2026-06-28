/**
 * scheduleAnalysis.js — Prepares event data for conflict and workload analysis.
 * Sends the next 30 days so the AI can surface patterns.
 */
import { isoDate } from '../../../utils.js';
import { expandEvents } from '../../../recurrence.js';

/**
 * @param {object[]} allBaseEvents - Raw events from getEvents()
 * @returns {{ type: string, events: object[], rangeStart: string, rangeEnd: string }}
 */
export function prepareScheduleAnalysis(allBaseEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(today.getDate() + 30);

  const rangeStart = isoDate(today);
  const rangeEnd   = isoDate(end);

  const expanded = expandEvents(allBaseEvents, rangeStart, rangeEnd);

  const events = expanded.map(ev => ({
    title:            ev.title,
    date:             ev.event_date,
    start_time:       ev.start_time ?? null,
    duration_minutes: ev.duration_minutes ?? null,
    category:         ev.category ?? null,
  }));

  return { type: 'schedule_analysis', events, rangeStart, rangeEnd };
}
