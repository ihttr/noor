'use client';

// "Download Quran text for offline" (SPEC §7.20, D-068): the 114 surah chunks (used by Saved,
// search results, memorization, tafsir) and the 114 reader pages of the current language, so any
// surah opens offline in the same server-rendered reader. Stored in the Cache API, where the
// service worker finds them; the static files the reader needs go to the worker's static cache.

import type { NavData } from '@/lib/quran/nav';

const CACHE = 'noor-offline-quran';
const STATIC = 'noor-static';
const MANIFEST = '/__noor/offline-quran.json';
const PARALLEL = 4;

export interface OfflineQuranInfo {
  locale: string;
  surahs: number;
  bytes: number;
  at: number;
}

export const cacheAvailable = (): boolean => typeof caches !== 'undefined';

export async function offlineQuranInfo(): Promise<OfflineQuranInfo | null> {
  if (!cacheAvailable()) return null;
  const hit = await (await caches.open(CACHE)).match(MANIFEST);
  return hit ? ((await hit.json()) as OfflineQuranInfo) : null;
}

const assetsIn = (html: string) => new Set(html.match(/\/_next\/static\/[^"'\s)\\?#]+/g) ?? []);

async function cacheAssets(urls: Iterable<string>) {
  const cache = await caches.open(STATIC);
  for (const url of urls) {
    if (await cache.match(url)) continue;
    const response = await fetch(url);
    if (!response.ok) continue;
    await cache.put(url, response.clone());
    if (url.endsWith('.css')) await cacheAssets(assetsIn(await response.text()));
  }
}

/** Downloads everything; reports progress after each surah. Throws on failure or abort. */
export async function downloadQuran(
  locale: string,
  onProgress: (done: number, total: number, bytes: number) => void,
  signal: AbortSignal
): Promise<OfflineQuranInfo> {
  // Survive storage pressure where the browser allows it (Chromium; Safari keeps data of
  // installed apps).
  await navigator.storage?.persist?.().catch(() => false);
  const nav = (await (await fetch('/api/quran/nav', { signal })).json()) as NavData;
  const prefix = locale === 'ar' ? '' : `/${locale}`;
  const cache = await caches.open(CACHE);
  const total = nav.surahs.length;
  let done = 0;
  let bytes = 0;
  let assets: Set<string> | null = null;

  const one = async (surah: (typeof nav.surahs)[number]) => {
    for (const url of [`/api/quran/surah/${surah.number}`, `${prefix}/quran/${surah.slug}`]) {
      const response = await fetch(url, { signal, cache: 'no-cache' });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const blob = await response.blob();
      bytes += blob.size;
      if (!assets && url.includes('/quran/')) assets = assetsIn(await blob.text());
      await cache.put(url, new Response(blob, { status: response.status, headers: response.headers }));
    }
    onProgress(++done, total, bytes);
  };

  const queue = [...nav.surahs];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await one(s);
      }
    })
  );
  if (assets) await cacheAssets(assets);
  const info: OfflineQuranInfo = { locale, surahs: total, bytes, at: Date.now() };
  await cache.put(MANIFEST, new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } }));
  return info;
}

export async function removeOfflineQuran(): Promise<void> {
  if (cacheAvailable()) await caches.delete(CACHE);
}
