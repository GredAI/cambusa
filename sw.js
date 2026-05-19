/* =====================================================
   CAMBUSA — Service Worker
   Strategia:
   • HTML       → network-first (sempre aggiornato)
   • JS / CSS   → network-first (aggiornamenti codice)
   • Immagini   → cache-first (stabili)
   • Fallback   → cache se network non disponibile
   ===================================================== */

const CACHE_NAME = 'cambusa-v111';

const PRECACHE = [
  '/cambusa/',
  '/cambusa/index.html',
  '/cambusa/manifest.json',
  '/cambusa/css/app.css',
];

// ── Message: SKIP_WAITING ────────────────────────────────
// Ricevuto da app.js per attivare subito il nuovo SW
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installato —', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: rimuove cache vecchie ──────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Attivato —', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => { console.log('[SW] Cache rimossa:', key); return caches.delete(key); })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo richieste same-origin
  if (url.origin !== location.origin) return;

  const isJS   = url.pathname.endsWith('.js');
  const isCSS  = url.pathname.endsWith('.css');
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';
  const isImg  = /\.(png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

  if (isImg) {
    // Cache-first per immagini (cambiano raramente)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  if (isJS || isCSS || isHTML) {
    // Network-first per JS/CSS/HTML — garantisce aggiornamenti del codice
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Aggiorna la cache con la versione più recente
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => {
          // Offline fallback: serve dalla cache se disponibile
          return caches.match(event.request);
        })
    );
    return;
  }

  // Default: network con fallback cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
