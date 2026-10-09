import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyTafsir } from '../../scripts/tafsir/verify.ts';
import type { TafsirSurahFile } from '@/lib/tafsir/types';

// Tafsir integrity (SPEC §2.4, §2.8): verbatim copy of the approved source, shown with its source.
const checks = await verifyTafsir();

describe('tafsir integrity', () => {
  it.each(checks.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.ok, c.detail).toBe(true);
  });

  it('every file names the tafsir, its author and distribution', async () => {
    const file = JSON.parse(await readFile(path.join(process.cwd(), 'content/tafsir/muyassar/surah/2.json'), 'utf8')) as TafsirSurahFile;
    expect(file.source.name.ar).toBe('التفسير الميسر');
    expect(file.source.author.ar).toBe('مجمع الملك فهد لطباعة المصحف الشريف');
    expect(file.source.distribution.name).toBe('QuranEnc.com');
    expect(file.entries).toHaveLength(286);
  });
});

describe('the tafsir verifier catches tampering', () => {
  let dir = '';
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('fails when one code point changes in a copy', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'noor-tafsir-'));
    await cp(path.join(process.cwd(), 'content'), dir, { recursive: true });
    const file = path.join(dir, 'tafsir/muyassar/surah/112.json');
    const data = JSON.parse(await readFile(file, 'utf8')) as TafsirSurahFile;
    data.entries[0]!.text = [...data.entries[0]!.text].slice(0, -1).join('');
    await writeFile(file, JSON.stringify(data), 'utf8');
    const failed = (await verifyTafsir({ contentDir: dir })).filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(['tafsir-muyassar-text', 'tafsir-muyassar-hash']));
  });
});
