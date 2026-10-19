// Service worker: caches the app shell on first visit so the page works in airplane mode.
// It only ever serves files from this site's own cache. It never sends anything anywhere.
// VERSION and FILES are filled in by build/build-single-file.mjs.
//
// Pages (navigations): network first, so visitors always get the latest page; cache only when offline.
// Fingerprinted assets (JS, CSS, fonts): cache first, they never change under the same name.

const VERSION = '__VERSION__';
const CACHE = `asli-munafa-${VERSION}`;
const FILES = __FILES__;

// Store a clean copy: browsers refuse to show a cached redirect for a page load.
const clean = (res) => (res.redirected
  ? res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }))
  : res);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async (url) => {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      await cache.put(url, await clean(res));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('asli-munafa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The address a page is cached under: "/privacy.html" and "/privacy" are the same page.
function pageKey(url) {
  const path = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return new URL(path, url.origin).href;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(pageKey(url), copy)).catch(() => {}));
        }
        return res;
      } catch (offline) {
        const cache = await caches.open(CACHE);
        return (await cache.match(pageKey(url))) || (await cache.match(new URL('./', self.location).href)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
