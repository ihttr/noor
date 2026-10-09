'use client';

// Loaded when the page is idle (PreferencesSync): keeps the boot copy of the preferences and the
// local store in step, then follows changes from other tabs (and, from Phase 9, from sync).

import { applyStoredReaderSettings, getReaderSettings, hasReaderSettings } from '@/components/reader/settings-store';
import { applyThemePreference, getThemePreference, hasThemePreference } from '@/components/theme/theme-store';
import { getStore, type LocalStore } from '@/lib/store';
import type { PreferencesData } from '@/lib/store/types';
import { isThemePreference } from '@/lib/theme';
import { clearPendingMarker, hasPendingPreferences, readPendingMarker } from './preferences';

export interface PreferencesBinding {
  /** Current values and whether each one was ever set on this device (boot copy present). */
  current(): { data: Required<Pick<PreferencesData, 'reader' | 'theme'>>; explicit: Partial<Record<keyof PreferencesData, boolean>> };
  /** Applies stored values (from this or another tab, or from sync) without saving them again. */
  apply(data: PreferencesData): void;
}

/**
 * Keeps the boot copy and the store in step: the stored values win; values that exist only in
 * the boot copy (set before Phase 4, or while storage was unavailable) are written to the store.
 */
export async function reconcilePreferences(store: LocalStore, binding: PreferencesBinding): Promise<void> {
  if (hasPendingPreferences()) return;
  // Changes that missed the store before the last unload are the newest values: save them first.
  const unsaved = readPendingMarker();
  if (unsaved) {
    await store.preferences.update(unsaved);
    clearPendingMarker();
  }
  const stored = (await store.preferences.get()) ?? {};
  const { data, explicit } = binding.current();
  const missing: Partial<PreferencesData> = {};
  if (stored.reader === undefined && explicit.reader) missing.reader = data.reader;
  if (stored.theme === undefined && explicit.theme) missing.theme = data.theme;
  if (Object.keys(missing).length) await store.preferences.update(missing);
  binding.apply(stored);
}

const binding: PreferencesBinding = {
  current: () => ({
    data: { reader: getReaderSettings(), theme: getThemePreference() },
    explicit: { reader: hasReaderSettings(), theme: hasThemePreference() },
  }),
  apply(data) {
    if (data.reader !== undefined) applyStoredReaderSettings(data.reader);
    if (isThemePreference(data.theme)) applyThemePreference(data.theme);
  },
};

/** Reconciles once, then on every preferences change. Returns a stop function. */
export function startPreferencesSync(): () => void {
  let off: (() => void) | undefined;
  let stopped = false;
  getStore()
    .then(async (store) => {
      if (stopped) return;
      await reconcilePreferences(store, binding);
      if (!stopped) off = store.subscribe(['preferences'], () => void reconcilePreferences(store, binding));
    })
    .catch((error: unknown) => {
      // IndexedDB unavailable: the boot copy keeps working for this device.
      console.warn('Local store unavailable', error);
    });
  return () => {
    stopped = true;
    off?.();
  };
}
