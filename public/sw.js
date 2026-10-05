// PWA shell for v0.1.
//
// Enough of a service worker to make the app installable and to start fast on a
// repeat visit. Full offline support is deliberately deferred — once Spotify
// playback lands, the caching story changes anyway.
//
// The strategy is split by what the request is for, and that split matters more
// than it looks. This was cache-first for everything under a fixed cache name,
// which meant the first HTML a phone ever saw was the HTML it kept: every
// deploy after that would have been invisible on the device, with no way out
// but clearing site data. Since Vite fingerprints its assets, the two halves
// want opposite policies.
//
//   documents  network first. The document is what names the current build, so
//              a stale one pins you to a dead version. Cache is the fallback
//              for actually being offline, not the default answer.
//   assets     cache first. The filename carries a content hash, so a hit is
//              always correct and a new build simply asks for new names.

const VERSION = 'v3';
const CACHE = `road-trip-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  // World files keep their names when the map is rebuilt.
  const worldPath = new URL('./world/', self.location.href).pathname;
  const isWorld = url.pathname.startsWith(worldPath);
  event.respondWith(isDocument || isWorld ? networkFirst(request, isDocument) : cacheFirst(request));
});

/** Fresh whenever the network can be reached; cached only when it cannot. */
async function networkFirst(request, isDocument = false) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) || (isDocument && (await caches.match('./index.html')));
    if (cached) return cached;
    throw error;
  }
}

/** Safe for fingerprinted files: the name changes whenever the contents do. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
  }
  return response;
}
