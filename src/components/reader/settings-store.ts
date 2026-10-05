'use client';

import {
  DEFAULT_READER_SETTINGS,
  READER_STORAGE_KEY,
  applyReaderSettings,
  parseReaderSettings,
  type ReaderSettings,
} from '@/lib/reader/settings';

// External store over localStorage; the boot script already applied the stored values to <html>
// before paint, so components only need it to show and change the current values.

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

export const getServerReaderSettings = (): ReaderSettings => DEFAULT_READER_SETTINGS;

export function subscribeReaderSettings(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function updateReaderSettings(patch: Partial<ReaderSettings>): void {
  const next = parseReaderSettings({ ...getReaderSettings(), ...patch });
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
