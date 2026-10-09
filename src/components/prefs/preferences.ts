'use client';

import { getStore } from '@/lib/store';
import type { PreferencesData } from '@/lib/store/types';

// Preferences live in the local store (IndexedDB), the source of truth that Phase 9 syncs.
// localStorage keeps only a boot copy of the values that must apply before first paint (theme,
// reading settings), so there is no flash (SPEC §4, D-044).
//
// Store writes are asynchronous and debounced, so a change made just before the page unloads
// could miss the store. The not-yet-saved values are therefore also kept synchronously under
// PENDING_KEY until the store has them; the next start writes them first (they are the newest).

export const PENDING_KEY = 'noor:prefs-pending';

let pending: Partial<PreferencesData> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function writeMarker(value: Partial<PreferencesData> | null): void {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage unavailable: nothing to protect.
  }
}

/** Values changed on this device that may not have reached the store yet (from any tab). */
export function readPendingMarker(): Partial<PreferencesData> | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? (value as Partial<PreferencesData>) : null;
  } catch {
    return null;
  }
}

export function clearPendingMarker(): void {
  if (!pending) writeMarker(null);
}

async function flush(): Promise<void> {
  clearTimeout(timer);
  const patch = pending;
  if (!patch) return;
  try {
    await (await getStore()).preferences.update(patch);
    // Only forget what was saved; newer changes made meanwhile stay pending.
    if (pending === patch) {
      pending = null;
      writeMarker(null);
    }
  } catch (error) {
    // The boot copy and the marker keep the value; it reaches the store on the next start.
    console.warn('Could not save preferences', error);
  }
}

/** Saves preference changes to the store (debounced, so a slider does not write on every step). */
export function persistPreferences(patch: Partial<PreferencesData>): void {
  pending = { ...readPendingMarker(), ...pending, ...patch };
  writeMarker(pending);
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 400);
}

export const hasPendingPreferences = () => pending !== null;

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush());
}

/**
 * The current preferences: the stored ones plus changes not saved yet (in this tab, or left by a
 * page that unloaded within the debounce). Use this instead of reading the store directly.
 */
export async function loadPreferences(): Promise<PreferencesData> {
  let stored: PreferencesData = {};
  try {
    stored = (await (await getStore()).preferences.get()) ?? {};
  } catch {
    // No local store: only the pending values.
  }
  return { ...stored, ...readPendingMarker(), ...pending };
}
