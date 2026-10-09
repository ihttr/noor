'use client';

import { useEffect } from 'react';
import { whenIdle } from '@/lib/store';

function register() {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => registration.active?.postMessage('maintenance'))
    .catch(() => undefined);
}

/**
 * Registers the service worker (SPEC §7.20, D-068) — production builds only, so development
 * never serves stale files — and asks it to tidy its caches after updates. It waits until the
 * page has loaded and gone idle, so precaching never competes with the first paint.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let cancel: (() => void) | undefined;
    const start = () => {
      cancel = whenIdle(register, 5000);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      cancel?.();
    };
  }, []);
  return null;
}
