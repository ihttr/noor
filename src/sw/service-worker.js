// @ts-check
/// <reference lib="webworker" />

// Noor service worker (SPEC §7.20, DECISIONS D-068). Served by src/app/sw.js/route.ts, which
// stamps BUILD with the build id so every deployment installs a new version.
//
// Caches:
// - noor-shell-<build>   precached at install: app shell pages (both languages), the offline
//                        page, Quran structure, adhkar data, the search index, and the static
//                        files (JS, CSS, fonts) those pages use.
// - noor-static          /_next/static/* (hashed, immutable): cache first.
// - noor-pages           pages visited online (network first, cache fallback), last 60.
// - noor-data            content API responses (stale-while-revalidate), last 250.
// - noor-offline-quran   written by the page (Settings → "Download Quran text for offline"):
//                        the 114 surah chunks and reader pages. Never trimmed here.
// Never cached: auth, sync and account requests, React Server Component payloads (offline they
// fail and Next.js falls back to a full navigation, which this worker answers from the cache),
// and other origins (audio streams from the CDN).

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const BUILD = '__NOOR_BUILD__';
const SHELL = `noor-shell-${BUILD}`;
const STATIC = 'noor-static';
const PAGES = 'noor-pages';
const DATA = 'noor-data';
const QURAN = 'noor-offline-quran';
const META = 'noor-meta';
const PAGE_LIMIT = 60;
const DATA_LIMIT = 250;
const NETWORK_TIMEOUT = 6000;

const SHELL_PAGES = ['/', '/quran', '/adhkar', '/adhkar/morning', '/adhkar/evening', '/saved', '/search', '/memorize', '/settings', '/offline'].flatMap(
  (p) => [p, p === '/' ? '/en' : `/en${p}`]
);
const SHELL_DATA = ['/api/quran/nav', '/api/quran/search-index', '/api/adhkar/morning', '/api/adhkar/evening', '/manifest.webmanifest', '/icon.svg'];
const NEVER = ['/api/auth', '/api/sync', '/api/account'];

/** Same-origin static file URLs referenced by an HTML page or a stylesheet. */
function assetsIn(text) {
  return new Set(text.match(/\/_next\/static\/[^"'\s)\\?#]+/g) ?? []);
}

/** Responses that followed a redirect cannot answer a navigation: store a clean copy. */
async function storable(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function trim(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

/** Caches static files (and the fonts of stylesheets) that are not cached yet. */
async function cacheAssets(urls) {
  const cache = await caches.open(STATIC);
  for (const url of urls) {
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      await cache.put(url, response.clone());
      if (url.endsWith('.css')) await cacheAssets(assetsIn(await response.text()));
    } catch {
      // Best effort: a missing file is fetched again when it is used online.
    }
  }
}

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const assets = new Set();
      for (const url of SHELL_PAGES) {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
        await cache.put(url, await storable(response.clone()));
        for (const a of assetsIn(await response.text())) assets.add(a);
      }
      for (const url of SHELL_DATA) {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) await cache.put(url, response);
      }
      await cacheAssets(assets);
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('noor-shell-') && key !== SHELL) await caches.delete(key);
      }
      await sw.registration.navigationPreload?.enable();
      await sw.clients.claim();
    })()
  );
});

/**
 * After an update (the page asks once it is idle): refresh the pages cached by an older build
 * and the downloaded Quran copy, then drop static files no cached page uses any more. Offline
 * or on any failure nothing is removed and it runs again later.
 */
async function maintenance() {
  const meta = await caches.open(META);
  const done = await meta.match('/__noor/maintenance');
  if (done && (await done.text()) === BUILD) return;
  if (!navigator.onLine) return;
  const used = new Set();
  for (const name of [SHELL, PAGES, QURAN]) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      let response = await cache.match(request);
      if (name !== SHELL) {
        const fresh = await fetch(request.url, { cache: 'no-cache' }); // offline: throws, nothing is pruned
        if (fresh.status === 404 || fresh.status === 410) {
          await cache.delete(request);
          continue;
        }
        if (!fresh.ok) return;
        await cache.put(request, await storable(fresh.clone()));
        response = fresh;
      }
      if (response && (response.headers.get('content-type') ?? '').includes('text/html')) {
        for (const a of assetsIn(await response.text())) used.add(a);
      }
    }
  }
  await cacheAssets(used);
  const statics = await caches.open(STATIC);
  const css = new Set();
  for (const request of await statics.keys()) {
    const path = new URL(request.url).pathname;
    if (path.endsWith('.css') && used.has(path)) for (const a of assetsIn(await (await statics.match(request)).text())) css.add(a);
  }
  for (const request of await statics.keys()) {
    const path = new URL(request.url).pathname;
    if (!used.has(path) && !css.has(path)) await statics.delete(request);
  }
  await meta.put('/__noor/maintenance', new Response(BUILD));
}

sw.addEventListener('message', (event) => {
  if (event.data === 'maintenance') event.waitUntil(maintenance().catch(() => undefined));
});

/** The offline page of the request's language. */
const offlinePage = (url) => (url.pathname === '/en' || url.pathname.startsWith('/en/') ? '/en/offline' : '/offline');

async function navigate(event) {
  const request = event.request;
  const url = new URL(request.url);
  const network = (async () => {
    const preload = await event.preloadResponse;
    const response = preload ?? (await fetch(request));
    if (response.ok && !url.pathname.includes('/auth/')) {
      const cache = await caches.open(PAGES);
      await cache.delete(url.pathname);
      await cache.put(url.pathname, await storable(response.clone()));
      await trim(cache, PAGE_LIMIT);
    }
    return response;
  })();
  const fallback = async () =>
    (await caches.match(url.pathname, { ignoreSearch: true })) ?? (await caches.match(offlinePage(url))) ?? Response.error();
  // A slow network ("lie-fi") falls back to the cached copy after a few seconds.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await caches.match(url.pathname, { ignoreSearch: true });
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return await network;
  } catch {
    return fallback();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const hit = await caches.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(DATA);
      await cache.put(request, response.clone());
      await trim(cache, DATA_LIMIT);
    }
    return response;
  });
  if (hit) {
    event.waitUntil(network.catch(() => undefined));
    return hit;
  }
  return network;
}

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (NEVER.some((p) => url.pathname.startsWith(p)) || url.pathname === '/sw.js') return;
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return;
  if (request.mode === 'navigate') return event.respondWith(navigate(event));
  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(request));
  if (url.pathname.startsWith('/_next/')) return;
  event.respondWith(staleWhileRevalidate(event));
});
