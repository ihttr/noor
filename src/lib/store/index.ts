// Entry point of the local-first store. Importing this module is cheap: the IndexedDB
// implementation (Dexie) is a separate chunk, loaded the first time a feature asks for the store.

import type { LocalStore } from './repository.ts';

export type { LocalStore } from './repository.ts';

let opening: Promise<LocalStore> | undefined;

/** The store of this browser profile. Rejects when IndexedDB is unavailable (callers show an error state with retry). */
export function getStore(): Promise<LocalStore> {
  opening ??= import('./dexie.ts').then((m) => m.openLocalStore()).catch((error: unknown) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

/** Runs `task` once the browser is idle (or after `timeout` ms), so storage work never competes with first paint. */
export function whenIdle(task: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 200);
  return () => window.clearTimeout(id);
}
