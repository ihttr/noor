import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clampRange, nextStep, stepAyah, type QueueState } from '@/lib/audio/queue';
import { ayahAudioUrl, type ReciterList } from '@/lib/audio/types';

const base: QueueState = { ayah: 1, ayahCount: 7, played: 1, repeatAyah: 1, repeat: 'off', range: null };

describe('playback queue (SPEC §7.11)', () => {
  it('plays a surah ayah by ayah and stops at its end', () => {
    expect(nextStep({ ...base, ayah: 3 })).toEqual({ ayah: 4, played: 1 });
    expect(nextStep({ ...base, ayah: 7 })).toBeNull();
  });

  it('repeats each ayah N times, or until changed', () => {
    expect(nextStep({ ...base, repeatAyah: 3, played: 1 })).toEqual({ ayah: 1, played: 2 });
    expect(nextStep({ ...base, repeatAyah: 3, played: 3 })).toEqual({ ayah: 2, played: 1 });
    expect(nextStep({ ...base, repeatAyah: Number.POSITIVE_INFINITY, played: 99 })).toEqual({ ayah: 1, played: 100 });
  });

  it('repeats the surah or a range', () => {
    expect(nextStep({ ...base, ayah: 7, repeat: 'surah' })).toEqual({ ayah: 1, played: 1 });
    const range = { ...base, repeat: 'range' as const, range: { from: 2, to: 4 } };
    expect(nextStep({ ...range, ayah: 4 })).toEqual({ ayah: 2, played: 1 });
    expect(nextStep({ ...range, ayah: 3 })).toEqual({ ayah: 4, played: 1 });
  });

  it('manual steps stay inside the surah or range', () => {
    expect(stepAyah({ ...base, ayah: 1 }, -1)).toBe(1);
    expect(stepAyah({ ...base, ayah: 7 }, 1)).toBe(7);
    expect(stepAyah({ ...base, ayah: 4, repeat: 'range', range: { from: 2, to: 4 } }, 1)).toBe(4);
  });

  it('clamps and orders ranges', () => {
    expect(clampRange(5, 2, 7)).toEqual({ from: 2, to: 5 });
    expect(clampRange(0, 99, 7)).toEqual({ from: 1, to: 7 });
    expect(clampRange(Number.NaN, 2, 7)).toBeNull();
  });
});

describe('approved reciter list (D-054)', () => {
  const list = JSON.parse(readFileSync(path.join(process.cwd(), 'content/audio/reciters.json'), 'utf8')) as ReciterList;

  it('lists Arabic recitations from the Islamic Network CDN with a probed bitrate', () => {
    expect(list.reciters.length).toBeGreaterThan(10);
    expect(list.reciters.every((r) => r.id.startsWith('ar.') && !/-\d+$/.test(r.id))).toBe(true);
    expect(list.reciters.find((r) => r.id === list.defaultReciter)?.bitrate).toBe(128);
  });

  it('builds per-ayah URLs with the global ayah number', () => {
    const alafasy = list.reciters.find((r) => r.id === 'ar.alafasy')!;
    expect(ayahAudioUrl(list, alafasy, 262)).toBe('https://cdn.islamic.network/quran/audio/128/ar.alafasy/262.mp3');
  });
});
