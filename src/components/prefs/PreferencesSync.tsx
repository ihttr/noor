'use client';

import { useEffect } from 'react';
import { watchSystemScheme } from '@/components/theme/theme-store';
import { whenIdle } from '@/lib/store';

/**
 * Root-layout helper: follows the OS color scheme for the "system" theme and, once the page is
 * idle, loads the preferences sync (boot copy ↔ local store, D-044).
 */
export function PreferencesSync() {
  useEffect(() => watchSystemScheme(), []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void import('./preferences-sync').then((m) => {
        if (!cancelled) stop = m.startPreferencesSync();
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      stop?.();
    };
  }, []);

  return null;
}
