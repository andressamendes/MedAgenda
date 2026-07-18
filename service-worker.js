const CACHE_VERSION = 'v13';
const CACHE_NAME = `medagenda-shell-${CACHE_VERSION}`;

// Base URL of the service worker's own location (handles GitHub Pages subdirectories)
const BASE = new URL('./', self.location.href).href;

// App Shell: all static assets that make the application functional offline.
// The JS module list is auto-generated from the real import graph — run
// `npm run build:app-shell` after adding/removing/renaming a frontend module,
// or `npm run check:app-shell` to verify it's still in sync (enforced in CI).
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  // AUTO-GENERATED:BEGIN (scripts/generate-app-shell.js)
  './abandonedSessionDialog.js',
  './academicCalendarEventsView.js',
  './academicCalendarFilter.js',
  './academicCalendarICSView.js',
  './academicCalendarService.js',
  './academicCalendarView.js',
  './accountView.js',
  './achievementService.js',
  './activityDashboardService.js',
  './activityDashboardView.js',
  './activityHistoryView.js',
  './activitySessionService.js',
  './activitySessionStats.js',
  './aiContextService.js',
  './aiPanelView.js',
  './auth.js',
  './authError.js',
  './authView.js',
  './avatarService.js',
  './calendar.js',
  './categoryService.js',
  './categoryView.js',
  './config/ai.js',
  './confirmDialog.js',
  './decisionEngine.js',
  './diagnosticModal.js',
  './diagnosticService.js',
  './errorService.js',
  './eventFormView.js',
  './eventService.js',
  './healthService.js',
  './icons.js',
  './icsExporter.js',
  './icsImporter.js',
  './insightsService.js',
  './insightsView.js',
  './modalController.js',
  './navigationView.js',
  './notificationService.js',
  './planListView.js',
  './planningService.js',
  './profileService.js',
  './pushService.js',
  './pwa.js',
  './questionService.js',
  './quickAdd.js',
  './recommendationEngine.js',
  './recurrence.js',
  './reflectionService.js',
  './reviewService.js',
  './reviewSessionService.js',
  './schemaService.js',
  './script.js',
  './services/ai/aiService.js',
  './services/ai/parsers/responseParser.js',
  './services/ai/prompts/scheduleAnalysis.js',
  './services/ai/prompts/studySuggestion.js',
  './services/ai/prompts/weeklySummary.js',
  './services/ai/providers/geminiProvider.js',
  './sessionEventBus.js',
  './sessionQuestionsService.js',
  './settingsModal.js',
  './skeletonView.js',
  './smartCardView.js',
  './stateView.js',
  './studyJournalView.js',
  './studyMilestoneService.js',
  './studyReflectionService.js',
  './studySearchService.js',
  './studySessionView.js',
  './studyStreakService.js',
  './studySummaryService.js',
  './studyTimelineService.js',
  './subjectProgressService.js',
  './supabase.js',
  './telemetryService.js',
  './themeService.js',
  './timeGoals.js',
  './toastService.js',
  './transitionUtils.js',
  './userMemoryService.js',
  './utils.js',
  './weekView.js',
  // AUTO-GENERATED:END
  './manifest.webmanifest',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
].map(path => new URL(path, BASE).href);

// ── Installation: pre-cache the App Shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activation: delete stale caches from previous versions ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        const deletions = cacheNames
          .filter((name) => name.startsWith('medagenda-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name));
        return Promise.all(deletions);
      })
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first for App Shell, network-first for Supabase API ────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through non-GET requests (POST, PUT, DELETE) without caching
  if (request.method !== 'GET') return;

  // Pass through Supabase API calls — data should never be stale-served
  if (url.hostname.endsWith('.supabase.co')) return;

  // Pass through cross-origin requests (CDN, external resources)
  if (url.origin !== self.location.origin) return;

  // Cache-first strategy for same-origin assets
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;

        // Not in cache — try network, then store a copy
        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => {
            // Network unavailable and asset not cached — return fallback for HTML
            if (request.destination === 'document') {
              return caches.match(new URL('./index.html', BASE).href);
            }
          });
      })
  );
});

// ── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title || 'MedAgenda', {
        body:             payload.body  || '',
        icon:             new URL('./icons/icon-192.png', BASE).href,
        badge:            new URL('./icons/icon-96.png',  BASE).href,
        tag:              payload.tag   || 'medagenda',
        data:             payload.data  || {},
        requireInteraction: false,
        actions: [
          { action: 'open',    title: 'Abrir'     },
          { action: 'dismiss', title: 'Dispensar' },
        ],
      })
    );
  } catch {
    // Non-JSON push — ignore
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data    = event.notification.data || {};
  const eventId = data.eventId || null;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find(
          (c) => c.url.startsWith(self.location.origin) && 'focus' in c
        );
        if (existing) {
          existing.focus();
          if (eventId) existing.postMessage({ type: 'OPEN_EVENT', eventId });
          return;
        }
        return clients.openWindow(BASE);
      })
  );
});

self.addEventListener('notificationclose', () => {
  // Reserved for future analytics
});
