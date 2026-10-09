'use client';

import type { SearchRequest, SearchResponse } from './search.worker';

// One search worker per page session, created on first use.
let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<number, (r: SearchResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SearchResponse>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

export function searchInWorker(request: Omit<SearchRequest, 'id'>): Promise<SearchResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    getWorker().postMessage({ ...request, id } satisfies SearchRequest);
  });
}
