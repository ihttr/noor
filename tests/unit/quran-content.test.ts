import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyContent } from '../../scripts/quran/verify.ts';
import { getAyah, getHizbQuarter, getJuz, getMeta, getPage, getSurah } from '@/lib/quran/content';
import type { SurahFile } from '@/lib/quran/types';

// SPEC §2.6 content integrity (CI-blocking). The DOM rendering test follows in Phase 3.
const checks = await verifyContent();

describe('content integrity (SPEC §2.6)', () => {
  it.each(checks.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.ok, c.detail).toBe(true);
  });
});

describe('the verifier catches tampering', () => {
  let dir = '';
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('fails exact-text and integrity-hash when one code point of an ayah changes in a copy', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'noor-content-'));
    await cp(path.join(process.cwd(), 'content'), dir, { recursive: true });
    const file = path.join(dir, 'quran/surah/112.json');
    const surah = JSON.parse(await readFile(file, 'utf8')) as SurahFile;
    // Drop the last code point of 112:1 in the temporary copy only.
    surah.ayahs[0]!.text = [...surah.ayahs[0]!.text].slice(0, -1).join('');
    await writeFile(file, JSON.stringify(surah), 'utf8');

    const failed = (await verifyContent({ contentDir: dir })).filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(['exact-text', 'integrity-hash']));
  });
});

describe('lib/quran accessors', () => {
  it('reads surahs with the ayah count from the metadata', async () => {
    const meta = await getMeta();
    const baqarah = await getSurah(2);
    expect(baqarah.ayahs).toHaveLength(meta.surahs[1]!.ayahCount);
    await expect(getSurah(115)).rejects.toThrow(RangeError);
  });

  it('returns Madani pages, the first and the last', async () => {
    const first = await getPage(1);
    expect(first.ayahs.map((a) => a.key)).toEqual(['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    const last = await getPage(604);
    expect(last.start).toEqual({ surah: 112, ayah: 1 });
    expect(last.end).toEqual({ surah: 114, ayah: 6 });
    expect(last.ayahs.every((a) => a.page === 604)).toBe(true);
  });

  it('covers every ayah exactly once across the 604 pages', async () => {
    let total = 0;
    for (let page = 1; page <= 604; page++) {
      const p = await getPage(page);
      expect(p.ayahs.length).toBeGreaterThan(0);
      total += p.ayahs.length;
    }
    expect(total).toBe(6236);
  });

  it('returns juz and hizb quarters whose ayahs carry the same numbers', async () => {
    const juz30 = await getJuz(30);
    expect(juz30.start).toEqual({ surah: 78, ayah: 1 });
    expect(juz30.end).toEqual({ surah: 114, ayah: 6 });
    expect(juz30.ayahs.every((a) => a.juz === 30)).toBe(true);

    const quarter = await getHizbQuarter(2);
    const meta = await getMeta();
    expect(quarter.start).toEqual(meta.hizbQuarters[1]!.start);
    expect(quarter.ayahs.every((a) => a.hizbQuarter === 2 && a.hizb === 1)).toBe(true);
    await expect(getHizbQuarter(241)).rejects.toThrow(RangeError);
  });

  it('marks the 15 sajdah ayahs', async () => {
    const meta = await getMeta();
    for (const s of meta.sajdahs) {
      expect((await getAyah(s.surah, s.ayah))?.sajdah).toBe(s.type);
    }
  });
});
