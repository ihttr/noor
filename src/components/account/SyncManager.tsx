'use client';

import { useEffect } from 'react';
import { whenIdle } from '@/lib/store';
import { ACCOUNT_EVENT, getAccount } from './account-state';

/** Root-layout helper: when an account is signed in, loads and starts sync once the page is idle. */
export function SyncManager() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelIdle: (() => void) | undefined;
    const update = () => {
      stop?.();
      stop = undefined;
      if (!getAccount()) return;
      cancelIdle = whenIdle(() => {
        void import('./sync-runner').then((m) => {
          if (getAccount()) stop = m.startAutoSync();
        });
      });
    };
    update();
    window.addEventListener(ACCOUNT_EVENT, update);
    return () => {
      cancelIdle?.();
      stop?.();
      window.removeEventListener(ACCOUNT_EVENT, update);
    };
  }, []);
  return null;
}
