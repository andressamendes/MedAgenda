const CACHE_VERSION = 'v1';
const CACHE_NAME = `medagenda-shell-${CACHE_VERSION}`;

// App Shell: all static assets that make the application functional offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/auth.js',
  '/supabase.js',
  '/eventService.js',
  '/categoryService.js',
  '/calendar.js',
  '/weekView.js',
  '/notificationService.js',
  '/recurrence.js',
  '/quickAdd.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
];

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
              return caches.match('/index.html');
            }
          });
      })
  );
});

// ── Message handler: allow pwa.js to trigger skipWaiting on waiting SW ──────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push Notifications (infrastructure only — no subscriptions yet) ─────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title || 'MedAgenda', {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        data: payload.data || {},
      })
    );
  } catch {
    // Non-JSON push — ignore
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.startsWith(self.location.origin));
        if (existing) return existing.focus();
        return clients.openWindow('/');
      })
  );
});
