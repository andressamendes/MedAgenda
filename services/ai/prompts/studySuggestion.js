/**
 * studySuggestion.js — Prepares data to find free study slots.
 * Sends the next 14 days of events so the AI can spot gaps.
 */
import { isoDate } from '../../../utils.js';
import { expandEvents } from '../../../recurrence.js';

/**
 * @param {object[]} allBaseEvents - Raw events from getEvents()
 * @returns {{ type: string, events: object[], rangeStart: string, rangeEnd: string }}
 */
export function prepareStudySuggestion(allBaseEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(today.getDate() + 14);

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

  return { type: 'study_suggestion', events, rangeStart, rangeEnd };
}
