import { beforeAll, describe, expect, it } from 'vitest';
import { getMeta } from '@/lib/quran/content';
import { parseAyahRef } from '@/lib/quran/refs';
import { ayahIndex, hizbRange, pageRange, refAtIndex } from '@/lib/quran/structure';
import type { QuranMeta } from '@/lib/quran/types';

let meta: QuranMeta;
beforeAll(async () => {
  meta = await getMeta();
});

describe('ayah reference parsing (SPEC §15)', () => {
  it.each([
    ['2:255', { surah: 2, ayah: 255 }],
    ['2 : 255', { surah: 2, ayah: 255 }],
    ['٢:٢٥٥', { surah: 2, ayah: 255 }],
    ['2/255', { surah: 2, ayah: 255 }],
    ['البقرة ٢٥٥', { surah: 2, ayah: 255 }],
    ['البقرة 255', { surah: 2, ayah: 255 }],
    ['سورة البقرة 255', { surah: 2, ayah: 255 }],
    ['البقرة:255', { surah: 2, ayah: 255 }],
    ['الكهف', { surah: 18 }],
    ['كهف ١٠', { surah: 18, ayah: 10 }],
    ['إبراهيم 7', { surah: 14, ayah: 7 }],
    ['آل عمران 5', { surah: 3, ayah: 5 }],
    ['Al-Kahf 10', { surah: 18, ayah: 10 }],
    ['kahf', { surah: 18 }],
    ['al-baqarah 255', { surah: 2, ayah: 255 }],
    ['18', { surah: 18 }],
  ])('%s', (input, expected) => {
    expect(parseAyahRef(input, meta.surahs)).toEqual(expected);
  });

  it.each(['', '0:1', '115', '115:1', '2:287', '1:0', 'not a surah 3', '٢:'])('rejects %j', (input) => {
    expect(parseAyahRef(input, meta.surahs)).toBeNull();
  });
});

describe('structure lookups', () => {
  it('maps references to positions and back', () => {
    expect(ayahIndex(meta, { surah: 1, ayah: 1 })).toBe(0);
    expect(ayahIndex(meta, { surah: 114, ayah: 6 })).toBe(6235);
    for (const i of [0, 7, 293, 3000, 6235]) expect(ayahIndex(meta, refAtIndex(meta, i))).toBe(i);
    expect(() => ayahIndex(meta, { surah: 2, ayah: 287 })).toThrow(RangeError);
  });

  it('computes page and hizb ranges', () => {
    expect(pageRange(meta, 1)).toEqual({ start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 7 } });
    expect(pageRange(meta, 2).start).toEqual({ surah: 2, ayah: 1 });
    expect(hizbRange(meta, 1).start).toEqual({ surah: 1, ayah: 1 });
    expect(hizbRange(meta, 60).end).toEqual({ surah: 114, ayah: 6 });
    expect(() => pageRange(meta, 605)).toThrow(RangeError);
  });
});
