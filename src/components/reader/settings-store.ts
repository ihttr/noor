'use client';

import { persistPreferences } from '@/components/prefs/preferences';
import {
  DEFAULT_READER_SETTINGS,
  READER_STORAGE_KEY,
  applyReaderSettings,
  parseReaderSettings,
  type ReaderSettings,
} from '@/lib/reader/settings';

// External store over the boot copy in localStorage; the boot script already applied it to
// <html> before paint. Changes are also saved to the local store (IndexedDB, D-044), which wins
// when the two differ (see PreferencesSync).

const CHANGE_EVENT = 'noor:readerchange';
let cachedRaw: string | null | undefined;
let cached: ReaderSettings = DEFAULT_READER_SETTINGS;

function readRaw(): string | null {
  try {
    return localStorage.getItem(READER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getReaderSettings(): ReaderSettings {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = parseReaderSettings(raw ? JSON.parse(raw) : null);
    } catch {
      cached = DEFAULT_READER_SETTINGS;
    }
  }
  return cached;
}

/** Whether reading settings were ever chosen on this device (a boot copy exists). */
export const hasReaderSettings = () => readRaw() !== null;

export const getServerReaderSettings = (): ReaderSettings => DEFAULT_READER_SETTINGS;

export function subscribeReaderSettings(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Applies settings and refreshes the boot copy, without saving them to the store. */
export function applyStoredReaderSettings(value: unknown): void {
  const next = parseReaderSettings(value);
  if (JSON.stringify(next) === JSON.stringify(getReaderSettings()) && hasReaderSettings()) return;
  try {
    localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: settings apply for this page view only.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  applyReaderSettings(document.documentElement, next);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function updateReaderSettings(patch: Partial<ReaderSettings>): void {
  const next = parseReaderSettings({ ...getReaderSettings(), ...patch });
  applyStoredReaderSettings(next);
  persistPreferences({ reader: next });
}
