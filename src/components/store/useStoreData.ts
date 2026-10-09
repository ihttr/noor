'use client';

import { useCallback, useEffect, useState } from 'react';
import { getStore, type LocalStore } from '@/lib/store';
import type { TableName } from '@/lib/store/types';

export type StoreData<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' };

/**
 * Reads from the local store and re-reads after changes to `tables` (in this tab or another).
 * `tables` and `query` must be stable (module-level constants). Returns the state and a retry.
 */
export function useStoreData<T>(
  tables: readonly (TableName | 'device')[],
  query: (store: LocalStore) => Promise<T>
): [StoreData<T>, () => void] {
  const [state, setState] = useState<StoreData<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let off: (() => void) | undefined;
    const fail = () => !stopped && setState({ status: 'error' });
    getStore()
      .then((store) => {
        if (stopped) return;
        const run = () =>
          query(store).then((data) => {
            if (!stopped) setState({ status: 'ready', data });
          }, fail);
        off = store.subscribe(tables, () => void run());
        return run();
      })
      .catch(fail);
    return () => {
      stopped = true;
      off?.();
    };
  }, [attempt, query, tables]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  return [state, retry];
}
