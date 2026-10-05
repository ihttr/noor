// Loads the owner-approved source files listed in data/sources/SOURCES.lock.json and verifies
// their SHA-256 before anything reads them. Nothing else in data/sources may be imported.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const ROOT = process.cwd();
export const LOCK_PATH = 'data/sources/SOURCES.lock.json';

export type ApprovedUse = 'quran-display' | 'quran-search' | 'quran-metadata';

export interface LockApproval {
  use: string;
  approvedAt: string;
  approvedBy: string;
  decisions: string[];
  note?: string;
}

export interface LockFileEntry {
  path: string;
  url: string;
  sha256: string;
  bytes: number;
  approval?: LockApproval;
}

export interface LockSource {
  id: string;
  name: string;
  publisher: string;
  homepage: string;
  version: string;
  status: string;
  license: { name: string; url: string; quote: string | null };
  files: LockFileEntry[];
}

export interface ApprovedFile {
  use: ApprovedUse;
  path: string;
  sha256: string;
  bytes: Buffer;
  source: LockSource;
  entry: LockFileEntry;
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function readLock(): Promise<{ sources: LockSource[] }> {
  return JSON.parse(await readFile(path.join(ROOT, LOCK_PATH), 'utf8')) as { sources: LockSource[] };
}

export async function loadApproved(use: ApprovedUse): Promise<ApprovedFile> {
  const lock = await readLock();
  const matches = lock.sources.flatMap((source) =>
    source.files.filter((entry) => entry.approval?.use === use).map((entry) => ({ source, entry }))
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one approved file for "${use}" in ${LOCK_PATH}, found ${matches.length}.`);
  }
  const { source, entry } = matches[0]!;
  const bytes = await readFile(path.join(ROOT, entry.path));
  const actual = sha256(bytes);
  if (actual !== entry.sha256) {
    throw new Error(`SHA-256 mismatch for ${entry.path}: lock ${entry.sha256}, file ${actual}. Re-fetch or re-approve.`);
  }
  return { use, path: entry.path, sha256: entry.sha256, bytes, source, entry };
}

export async function loadAllApproved(): Promise<Record<ApprovedUse, ApprovedFile>> {
  return {
    'quran-display': await loadApproved('quran-display'),
    'quran-search': await loadApproved('quran-search'),
    'quran-metadata': await loadApproved('quran-metadata'),
  };
}
