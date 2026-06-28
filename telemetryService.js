export const EVENTS = {
  LOGIN:                 'login',
  LOGOUT:                'logout',
  APPOINTMENT_CREATED:   'appointment_created',
  APPOINTMENT_EDITED:    'appointment_edited',
  APPOINTMENT_DELETED:   'appointment_deleted',
  PUSH_SUBSCRIBED:       'push_subscribed',
  PUSH_UNSUBSCRIBED:     'push_unsubscribed',
  SYNC_FAILURE:          'sync_failure',
  NOTIFICATION_FAILURE:  'notification_failure',
  ERROR:                 'error',
};

const _buffer = [];
const MAX_BUFFER = 200;
let _devMode = false;

export function initTelemetry(devMode = false) {
  _devMode = devMode;
}

export function setTelemetryDevMode(enabled) {
  _devMode = enabled;
}

export function track(event, data = {}) {
  const entry = {
    event,
    data,
    ts: new Date().toISOString(),
  };

  if (_buffer.length >= MAX_BUFFER) _buffer.shift();
  _buffer.push(entry);

  if (_devMode) {
    console.groupCollapsed(`%c[Telemetria] ${event}`, 'color:#6366f1;font-weight:bold');
    console.table(data);
    console.log('timestamp:', entry.ts);
    console.groupEnd();
  }

  // Future: forward to analytics provider
  // e.g.: window.gtag?.('event', event, data);
}

export function getEventLog() {
  return [..._buffer];
}
