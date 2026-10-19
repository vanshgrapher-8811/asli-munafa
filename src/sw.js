// Service worker: caches the app shell on first visit so the page works in airplane mode.
// It only ever serves files from this site's own cache. It never sends anything anywhere.
// __VERSION__ and __FILES__ are filled in by build/build-single-file.mjs.

const VERSION = '__VERSION__';
const CACHE = `asli-munafa-${VERSION}`;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('asli-munafa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html').then((page) => page || fetch(req));
      return fetch(req);
    }),
  );
});
