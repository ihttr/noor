import { describe, expect, it } from 'vitest';
import { canonicalQuranPath } from '@/lib/quran/canonical-path';

describe('canonical Quran URLs (SPEC §9: 308 to slug URLs)', () => {
  it('redirects numbers, Arabic-Indic digits and padded ayahs; leaves canonical and unknown paths alone', () => {
    expect(canonicalQuranPath('/quran/2')).toBe('/quran/al-baqara');
    expect(canonicalQuranPath('/quran/2/255')).toBe('/quran/al-baqara/255');
    expect(canonicalQuranPath('/en/quran/36/1')).toBe('/en/quran/yaseen/1');
    expect(canonicalQuranPath('/quran/al-baqara/0255')).toBe('/quran/al-baqara/255');
    expect(canonicalQuranPath(`/quran/${encodeURIComponent('٢')}/${encodeURIComponent('٢٥٥')}`)).toBe('/quran/al-baqara/255');
    expect(canonicalQuranPath('/quran/al-baqara/')).toBeNull();
    expect(canonicalQuranPath('/quran/al-baqara')).toBeNull();
    expect(canonicalQuranPath('/quran/al-baqara/255')).toBeNull();
    expect(canonicalQuranPath('/quran/115')).toBeNull();
    expect(canonicalQuranPath('/quran/al-baqara/abc')).toBeNull();
    expect(canonicalQuranPath('/quran/%E0%A4%A')).toBeNull();
    expect(canonicalQuranPath('/mushaf/page/2')).toBeNull();
  });
});
