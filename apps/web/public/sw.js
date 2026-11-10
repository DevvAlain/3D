/* eslint-disable no-restricted-globals */
// Church Lucky Draw Display Service Worker
// Caches /display HTML (network-first) and immutable static/font/audio/WASM assets.
// STRICT SECURITY INVARIANT: NEVER caches /api/* responses, auth routes, non-GET requests, or cross-origin requests.

const CACHE_ASSETS = 'church-display-assets-v1';
const CACHE_DOC = 'church-display-doc-v1';

const PRECACHE_SOUNDS = [
  '/sounds/unlock-chime.wav',
  '/sounds/draw-spin-start.wav',
  '/sounds/ambient-shimmer.wav',
  '/sounds/drum-roll.wav',
  '/sounds/tick.wav',
  '/sounds/ting.wav',
  '/sounds/fanfare.wav',
];

function isBypassPath(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/webpack-hmr') ||
    pathname.startsWith('/__nextjs')
  );
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/sounds/') ||
    /\.(wasm|woff2|woff|wav|mp3|png|webp|svg|ico)$/i.test(pathname)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ASSETS)
      .then((cache) =>
        Promise.allSettled(PRECACHE_SOUNDS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([CACHE_ASSETS, CACHE_DOC]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!validCaches.has(key)) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_DOC_CACHE') {
    event.waitUntil(caches.delete(CACHE_DOC));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // NEVER cache /api/* responses or auth/dev routes
  if (isBypassPath(url.pathname)) {
    return;
  }

  // Network-First with offline fallback for /display document so F5 reloads reliably
  if (url.pathname === '/display') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (
            response &&
            response.ok &&
            response.status === 200 &&
            !response.redirected &&
            (response.headers.get('content-type') || '').includes('text/html')
          ) {
            const copy = response.clone();
            void caches.open(CACHE_DOC).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const docCache = await caches.open(CACHE_DOC);
          const cached =
            (await docCache.match(request, { ignoreVary: true })) ||
            (await docCache.match('/display', { ignoreVary: true }));
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="vi"><meta charset="utf-8"><body style="background:#0B1230;color:#FFF6E0;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;"><div><h1>Mất kết nối tạm thời</h1><p>Vui lòng kiểm tra Wi-Fi/LAN và tải lại trang.</p></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Cache-First + Stale-While-Revalidate for immutable chunks, fonts, WASM, and local sounds
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.status === 200) {
              void cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }

        const live = await networkPromise;
        return live || new Response('', { status: 504 });
      })
    );
  }
});
