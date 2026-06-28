/**
 * Tests for smartAssistant.js — rule-based analysis engine.
 */
import { strictEqual, ok } from "node:assert";
import { describe, it } from "node:test";
import { analyzeEvents } from "../smartAssistant.js";

// Helper: an ISO date string N days from today
function futureDate(daysFromNow) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// Helper: create a minimal event object
function ev(overrides = {}) {
  return {
    id: overrides.id || 'uuid-1',
    title: overrides.title || 'Evento Teste',
    event_date: overrides.event_date || futureDate(5),
    start_time: overrides.start_time ?? '08:00',
    duration_minutes: overrides.duration_minutes ?? 60,
    category: overrides.category ?? null,
    color: overrides.color ?? '#3b82f6',
    recurrence_type: overrides.recurrence_type ?? 'none',
    recurrence_until: overrides.recurrence_until ?? null,
    recurrence_interval: overrides.recurrence_interval ?? null,
    recurrence_days_of_week: overrides.recurrence_days_of_week ?? null,
  };
}

describe('analyzeEvents()', () => {
  it('returns empty results for empty input', () => {
    const result = analyzeEvents([]);
    ok(Array.isArray(result.alerts));
    ok(Array.isArray(result.suggestions));
  });

  it('returns empty results for null input', () => {
    const result = analyzeEvents(null);
    ok(Array.isArray(result.alerts));
    ok(Array.isArray(result.suggestions));
  });

  it('returns object with alerts and suggestions arrays', () => {
    const result = analyzeEvents([ev()]);
    ok(Array.isArray(result.alerts), 'alerts should be array');
    ok(Array.isArray(result.suggestions), 'suggestions should be array');
  });
});

describe('Conflict detection', () => {
  it('detects overlapping events on same day', () => {
    const date = futureDate(3);
    const events = [
      ev({ id: '1', title: 'Evento A', event_date: date, start_time: '08:00', duration_minutes: 120 }),
      ev({ id: '2', title: 'Evento B', event_date: date, start_time: '09:00', duration_minutes: 60 }),
    ];
    const { alerts } = analyzeEvents(events);
    const conflicts = alerts.filter(a => a.type === 'conflict');
    ok(conflicts.length > 0, 'should detect overlap');
    ok(conflicts[0].severity === 'error');
  });

  it('does not flag non-overlapping events', () => {
    const date = futureDate(4);
    const events = [
      ev({ id: '1', title: 'Evento A', event_date: date, start_time: '08:00', duration_minutes: 60 }),
      ev({ id: '2', title: 'Evento B', event_date: date, start_time: '10:00', duration_minutes: 60 }),
    ];
    const { alerts } = analyzeEvents(events);
    const conflicts = alerts.filter(a => a.type === 'conflict');
    strictEqual(conflicts.length, 0);
  });

  it('does not flag events on different days', () => {
    const events = [
      ev({ id: '1', event_date: futureDate(5), start_time: '08:00', duration_minutes: 120 }),
      ev({ id: '2', event_date: futureDate(6), start_time: '09:00', duration_minutes: 60 }),
    ];
    const { alerts } = analyzeEvents(events);
    const conflicts = alerts.filter(a => a.type === 'conflict');
    strictEqual(conflicts.length, 0);
  });
});

describe('Long shift detection', () => {
  it('flags Plantão events longer than 12h', () => {
    const events = [
      ev({ id: '1', title: 'Plantão UPA', event_date: futureDate(7), category: 'Plantão', duration_minutes: 780 }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'long_shift');
    ok(found.length > 0, 'should detect long shift');
  });

  it('does not flag short Plantão', () => {
    const events = [
      ev({ id: '1', category: 'Plantão', event_date: futureDate(8), duration_minutes: 360 }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'long_shift');
    strictEqual(found.length, 0);
  });

  it('does not flag non-Plantão long events', () => {
    const events = [
      ev({ id: '1', category: 'Aula', event_date: futureDate(9), duration_minutes: 800 }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'long_shift');
    strictEqual(found.length, 0);
  });
});

describe('Consecutive shifts detection', () => {
  it('detects consecutive Plantão events on adjacent days', () => {
    const events = [
      ev({ id: '1', category: 'Plantão', event_date: futureDate(10) }),
      ev({ id: '2', category: 'Plantão', event_date: futureDate(11) }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'consecutive_shifts');
    ok(found.length > 0);
  });

  it('does not flag Plantão events 2+ days apart', () => {
    const events = [
      ev({ id: '1', category: 'Plantão', event_date: futureDate(12) }),
      ev({ id: '2', category: 'Plantão', event_date: futureDate(15) }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'consecutive_shifts');
    strictEqual(found.length, 0);
  });
});

describe('Duplicate event detection', () => {
  it('detects duplicate events (same title, date, time)', () => {
    const date = futureDate(13);
    const events = [
      ev({ id: '1', title: 'Plantão', event_date: date, start_time: '07:00', category: 'Plantão' }),
      ev({ id: '2', title: 'Plantão', event_date: date, start_time: '07:00', category: 'Plantão' }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'duplicate');
    ok(found.length > 0);
  });

  it('does not flag same title on different dates', () => {
    const events = [
      ev({ id: '1', title: 'Plantão', event_date: futureDate(14), start_time: '07:00' }),
      ev({ id: '2', title: 'Plantão', event_date: futureDate(15), start_time: '07:00' }),
    ];
    const { alerts } = analyzeEvents(events);
    const found = alerts.filter(a => a.type === 'duplicate');
    strictEqual(found.length, 0);
  });
});

describe('Busy day detection', () => {
  it('flags days with 4+ events', () => {
    const date = futureDate(16);
    const events = [
      ev({ id: '1', event_date: date, start_time: '08:00' }),
      ev({ id: '2', event_date: date, start_time: '10:00' }),
      ev({ id: '3', event_date: date, start_time: '12:00' }),
      ev({ id: '4', event_date: date, start_time: '14:00' }),
    ];
    const { suggestions } = analyzeEvents(events);
    const found = suggestions.filter(s => s.type === 'busy_day');
    ok(found.length > 0, 'should detect busy day');
  });

  it('does not flag days with fewer than 4 events', () => {
    const date = futureDate(17);
    const events = [
      ev({ id: '1', event_date: date, start_time: '08:00' }),
      ev({ id: '2', event_date: date, start_time: '10:00' }),
    ];
    const { suggestions } = analyzeEvents(events);
    const found = suggestions.filter(s => s.type === 'busy_day');
    strictEqual(found.length, 0);
  });
});

describe('No break detection', () => {
  it('flags events with less than 15 min gap', () => {
    const date = futureDate(18);
    const events = [
      ev({ id: '1', event_date: date, start_time: '08:00', duration_minutes: 55 }),
      ev({ id: '2', event_date: date, start_time: '09:00', duration_minutes: 60 }),
    ];
    const { suggestions } = analyzeEvents(events);
    const found = suggestions.filter(s => s.type === 'no_break');
    ok(found.length > 0, 'should detect missing break (5min gap)');
  });

  it('does not flag events with sufficient gap', () => {
    const date = futureDate(19);
    const events = [
      ev({ id: '1', event_date: date, start_time: '08:00', duration_minutes: 60 }),
      ev({ id: '2', event_date: date, start_time: '10:00', duration_minutes: 60 }),
    ];
    const { suggestions } = analyzeEvents(events);
    const found = suggestions.filter(s => s.type === 'no_break');
    strictEqual(found.length, 0);
  });
});

describe('Concentrated exams detection', () => {
  it('flags 2+ Prova events in the same week', () => {
    // Use days 21 and 22 (within same week as long as not straddling Sun/Mon boundary)
    const d1 = futureDate(21);
    const d1Date = new Date(d1);
    // Find a Monday 3 weeks from now and put two provas on Mon+Tue
    const dayOfWeek = d1Date.getDay();
    // Get to the next Monday
    const daysToMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const monOffset = 21 + (daysToMon % 7 || 7);
    const events = [
      ev({ id: '1', category: 'Prova', event_date: futureDate(monOffset) }),
      ev({ id: '2', category: 'Prova', event_date: futureDate(monOffset + 1) }),
    ];
    const { suggestions } = analyzeEvents(events);
    const found = suggestions.filter(s => s.type === 'concentrated_exams');
    ok(found.length > 0, 'should detect concentrated exams');
  });
});
