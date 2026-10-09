// Client side of sync (SPEC §5): push the local changes, apply the server's (merge rules of
// merge.ts), move the cursor; repeat until nothing is left. The transport is a parameter, so the
// same loop runs against /api/sync in the browser and against the server code in tests.

import type { LocalStore } from '../store/repository.ts';
import type { Change } from '../store/types.ts';
import { SYNC_BATCH, type SyncRequest, type SyncResponse } from './protocol.ts';

export type Transport = (request: SyncRequest) => Promise<SyncResponse>;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export async function syncStore(store: LocalStore, send: Transport, maxRounds = 50): Promise<SyncResult> {
  let pushed = 0;
  let pulled = 0;
  for (let round = 0; round < maxRounds; round++) {
    const pending = await store.sync.pending();
    // Collections first, so saved items can point at them on the server.
    const batch: Change[] = pending.sort((a, b) => (a.table === 'collections' ? -1 : 0) - (b.table === 'collections' ? -1 : 0)).slice(0, SYNC_BATCH);
    const response = await send({ cursor: await store.sync.getCursor(), changes: batch });
    await store.sync.applyRemote(response.changes);
    await store.sync.acknowledge(batch);
    await store.sync.setCursor(response.cursor);
    pushed += batch.length;
    pulled += response.changes.length;
    if (!response.more && pending.length <= batch.length) {
      // Merges during applyRemote may have queued new versions; one more round sends them.
      if ((await store.sync.pending()).length === 0) return { pushed, pulled };
    }
  }
  return { pushed, pulled };
}

/** The browser transport: POST /api/sync with the session cookie. */
export const httpTransport: Transport = async (request) => {
  const r = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    credentials: 'same-origin',
  });
  if (r.status === 401) throw new SyncError('signed-out');
  if (!r.ok) throw new SyncError(`http-${r.status}`);
  return (await r.json()) as SyncResponse;
};

export class SyncError extends Error {
  override name = 'SyncError';
}
