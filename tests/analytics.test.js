/**
 * Tests for analytics.js — statistics computation.
 */
import { strictEqual, ok } from "node:assert";
import { describe, it } from "node:test";
import { computeStats } from "../analytics.js";

function ev(overrides = {}) {
  const today = new Date();
  const dateStr = overrides.event_date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
  return {
    id: overrides.id || 'uuid-1',
    title: overrides.title || 'Evento',
    event_date: dateStr,
    start_time: overrides.start_time ?? '08:00',
    duration_minutes: overrides.duration_minutes ?? 60,
    category: overrides.category ?? null,
    color: overrides.color ?? '#3b82f6',
    recurrence_type: overrides.recurrence_type ?? 'none',
    recurrence_until: null,
    recurrence_interval: null,
    recurrence_days_of_week: null,
  };
}

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const THIS_MONTH = `${y}-${m}-`;

describe('computeStats()', () => {
  it('returns empty stats for empty input', () => {
    const stats = computeStats([]);
    strictEqual(stats.totalThisMonth, 0);
    strictEqual(stats.totalHours, 0);
    ok(Array.isArray(stats.topCategories));
    ok(Array.isArray(stats.upcoming));
  });

  it('returns empty stats for null input', () => {
    const stats = computeStats(null);
    strictEqual(stats.totalThisMonth, 0);
  });

  it('counts events this month correctly', () => {
    const events = [
      ev({ id: '1', event_date: `${THIS_MONTH}10` }),
      ev({ id: '2', event_date: `${THIS_MONTH}15` }),
      ev({ id: '3', event_date: `${THIS_MONTH}20` }),
    ];
    const stats = computeStats(events);
    strictEqual(stats.totalThisMonth, 3);
  });

  it('computes total hours from duration_minutes', () => {
    const events = [
      ev({ id: '1', event_date: `${THIS_MONTH}10`, duration_minutes: 120 }),
      ev({ id: '2', event_date: `${THIS_MONTH}15`, duration_minutes: 60 }),
    ];
    const stats = computeStats(events);
    strictEqual(stats.totalHours, 3);
  });

  it('groups hours by category', () => {
    const events = [
      ev({ id: '1', event_date: `${THIS_MONTH}10`, category: 'Plantão', duration_minutes: 480 }),
      ev({ id: '2', event_date: `${THIS_MONTH}11`, category: 'Aula',    duration_minutes: 120 }),
      ev({ id: '3', event_date: `${THIS_MONTH}12`, category: 'Plantão', duration_minutes: 240 }),
    ];
    const stats = computeStats(events);
    const plantao = stats.topCategories.find(c => c.name === 'Plantão');
    ok(plantao, 'should have Plantão category');
    strictEqual(plantao.hours, 12); // (480+240)/60
    strictEqual(plantao.count, 2);
  });

  it('sorts topCategories by hours descending', () => {
    const events = [
      ev({ id: '1', event_date: `${THIS_MONTH}10`, category: 'Aula',    duration_minutes: 60 }),
      ev({ id: '2', event_date: `${THIS_MONTH}11`, category: 'Plantão', duration_minutes: 480 }),
    ];
    const stats = computeStats(events);
    if (stats.topCategories.length >= 2) {
      ok(stats.topCategories[0].hours >= stats.topCategories[1].hours, 'should be sorted desc');
    }
  });

  it('returns upcoming array', () => {
    const stats = computeStats([ev()]);
    ok(Array.isArray(stats.upcoming));
  });
});
