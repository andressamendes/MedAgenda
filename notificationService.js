import { expandEvent } from "./recurrence.js";
import { isoDate } from "./utils.js";

const WINDOW_DAYS  = 7;
const PREF_PREFIX  = "medagenda_notif_";
const RESCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — mantém a janela de 7 dias em dia

let _userId    = null;
let _scheduled = new Map(); // key → timeoutId
let _lastEvents      = [];
let _rescheduleTimer = null;

// ── Public API ─────────────────────────────────────────────────────────────

export function initNotifications(userId) {
  _userId = userId;
}

export function isSupported() {
  return "Notification" in window;
}

export function permissionStatus() {
  return isSupported() ? Notification.permission : "unsupported";
}

export function isEnabled() {
  if (!isSupported()) return false;
  const pref = _userId ? localStorage.getItem(PREF_PREFIX + _userId) : null;
  if (pref === "disabled") return false;
  return true; // enabled by default (permission still required)
}

export function setEnabled(enabled) {
  if (!_userId) return;
  localStorage.setItem(PREF_PREFIX + _userId, enabled ? "enabled" : "disabled");
}

export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Clears all pending reminders and re-schedules from the given event list.
 * Called after login, after any CRUD operation, and periodically (see
 * _startPeriodicReschedule) so events sliding into the 7-day window over
 * several days of an open tab still get scheduled.
 */
export function scheduleReminders(events) {
  _lastEvents = events;
  clearAll();

  if (!isSupported() || !isEnabled() || Notification.permission !== "granted") {
    _stopPeriodicReschedule();
    return;
  }

  const now       = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

  const rangeStart = isoDate(now);
  const rangeEnd   = isoDate(windowEnd);

  for (const ev of events) {
    if (ev.reminder_minutes === null || ev.reminder_minutes === undefined) continue;
    const occurrences = expandEvent(ev, rangeStart, rangeEnd);
    for (const occ of occurrences) {
      _scheduleOne(occ);
    }
  }

  _startPeriodicReschedule();
}

// ── Internal ───────────────────────────────────────────────────────────────

// Re-runs scheduleReminders() with the last known event list on a fixed
// interval, so the 7-day scheduling window keeps sliding forward even if the
// app is left open for several days without a reload or CRUD operation.
function _startPeriodicReschedule() {
  if (_rescheduleTimer) return; // já em execução — evita timers duplicados
  _rescheduleTimer = setInterval(() => scheduleReminders(_lastEvents), RESCHEDULE_INTERVAL_MS);
  _rescheduleTimer.unref?.(); // Node (testes): não impede o processo de encerrar
}

function _stopPeriodicReschedule() {
  if (_rescheduleTimer) { clearInterval(_rescheduleTimer); _rescheduleTimer = null; }
}

function _scheduleOne(ev) {
  if (!ev.event_date || !ev.start_time) return;

  const [h, m]    = ev.start_time.split(":").map(Number);
  const [y, mo, d] = ev.event_date.split("-").map(Number);
  const eventMs   = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
  const fireMs    = eventMs - (ev.reminder_minutes ?? 0) * 60_000;
  const delay     = fireMs - Date.now();

  if (delay < -60_000) return;                         // more than 1 min overdue
  if (delay > WINDOW_DAYS * 86_400_000) return;        // beyond schedule window

  const key = `${ev._baseEventId ?? ev.id}_${ev.event_date}`;
  if (_scheduled.has(key)) clearTimeout(_scheduled.get(key));

  const tid = setTimeout(() => {
    _fire(ev);
    _scheduled.delete(key);
  }, Math.max(0, delay));

  _scheduled.set(key, tid);
}

function _fire(ev) {
  if (!isSupported() || Notification.permission !== "granted") return;
  if (!isEnabled()) return;

  const body = [ev.start_time?.slice(0, 5), ev.location]
    .filter(Boolean)
    .join("\n");

  new Notification(ev.title ?? "Compromisso", {
    body,
    tag: `medagenda_${ev._baseEventId ?? ev.id}_${ev.event_date}`,
  });
}

function clearAll() {
  for (const tid of _scheduled.values()) clearTimeout(tid);
  _scheduled.clear();
}

/**
 * Cancels all pending reminders and the periodic reschedule timer, and
 * forgets the last known event list and user. Call on sign-out — otherwise
 * the periodic reschedule (see _startPeriodicReschedule) keeps re-arming
 * reminders from the signed-out user's stale event list indefinitely, since
 * this is an SPA transition (no page reload) and nothing else stops it.
 */
export function resetNotifications() {
  clearAll();
  _stopPeriodicReschedule();
  _lastEvents = [];
  _userId     = null;
}

