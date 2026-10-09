'use client';

// Runs sync for a signed-in browser (SPEC §5): on load, on reconnect, when the tab becomes
// visible, and a few seconds after local changes. Loaded only when an account is signed in.

import { getStore } from '@/lib/store';
import { localDate } from '@/lib/store/refs';
import { TABLE_NAMES } from '@/lib/store/types';
import { SyncError, httpTransport, syncStore } from '@/lib/sync/client';
import { getAccount, setAccount, type AccountHint } from './account-state';

export const SYNC_EVENT = 'noor:sync';
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
  at: number | null;
  error?: string;
}

let status: SyncStatus = { state: 'idle', at: null };
let running: Promise<void> | null = null;
let again = false;

const LAST_SYNC_KEY = 'sync-last';
const OWNER_KEY = 'sync-user';

export const getSyncStatus = () => status;

/** Time of the last successful sync on this device (kept across reloads). */
export async function lastSyncAt(): Promise<number | null> {
  return status.at ?? (await (await getStore()).device.get<number>(LAST_SYNC_KEY)) ?? null;
}

function publish(next: SyncStatus): void {
  status = next;
  window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_EVENT, { detail: next }));
}

/**
 * Before the first sync of an account on this device: local data of a *different* account is
 * removed (it is already in that account); guest data, or data of the same account, is kept and
 * merged into the account (SPEC §5: guest data is uploaded on sign-up or login).
 */
export async function adoptAccount(account: AccountHint): Promise<void> {
  const store = await getStore();
  const owner = await store.device.get<string>(OWNER_KEY);
  if (owner && owner !== account.id) await store.sync.reset();
  await store.device.set(OWNER_KEY, account.id);
  setAccount(account);
}

/** One sync now (queued if one is running). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (!getAccount()) return;
      if (!navigator.onLine) {
        publish({ state: 'offline', at: status.at });
        return;
      }
      publish({ ...status, state: 'syncing' });
      try {
        const store = await getStore();
        await syncStore(store, httpTransport);
        const at = Date.now();
        await store.device.set(LAST_SYNC_KEY, at);
        publish({ state: 'ok', at });
      } catch (error) {
        if (error instanceof SyncError && error.message === 'signed-out') {
          setAccount(null);
          publish({ state: 'idle', at: status.at });
          return;
        }
        publish({ state: 'error', at: status.at, error: error instanceof Error ? error.message : String(error) });
      }
    } while (again);
  })().finally(() => (running = null));
  return running;
}

/**
 * After signing out. By default the data stays on this device (it is also in the account);
 * `wipe` removes it, for shared devices.
 */
export async function forgetAccount({ wipe }: { wipe: boolean }): Promise<void> {
  setAccount(null);
  const store = await getStore();
  if (wipe) {
    await store.sync.reset();
    await store.device.remove(OWNER_KEY);
  }
  await store.device.remove(LAST_SYNC_KEY);
  publish({ state: 'idle', at: null });
}

/**
 * After the account was deleted on the server. The data on this device either becomes guest
 * data again (uploaded if the person makes a new account later) or is erased.
 */
export async function afterAccountDeleted({ wipe }: { wipe: boolean }): Promise<void> {
  setAccount(null);
  const store = await getStore();
  if (wipe) await store.sync.reset();
  else await store.sync.detach();
  await store.device.remove(OWNER_KEY);
  await store.device.remove(LAST_SYNC_KEY);
  publish({ state: 'idle', at: null });
}

/** Starts the automatic triggers; returns a stop function. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let off: (() => void) | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 3000);
  };
  const onVisible = () => document.visibilityState === 'visible' && void syncNow();
  const onOnline = () => void syncNow();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  void getStore().then((store) => {
    off = store.subscribe(TABLE_NAMES, soon);
  });
  void syncNow();
  return () => {
    clearTimeout(timer);
    off?.();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** For the settings page: a JSON file of everything on this device (guests and accounts). */
export async function localExport(): Promise<Blob> {
  const store = await getStore();
  const body = { exportedAt: new Date().toISOString(), device: true, date: localDate(Date.now()), data: await store.dump() };
  return new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
}
