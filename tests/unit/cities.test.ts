import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldLatin, nearestCity, searchCities, toPlace } from '@/lib/cities/search';
import type { CityList } from '@/lib/cities/types';

const list = JSON.parse(readFileSync(path.join(process.cwd(), 'content/cities/cities.json'), 'utf8')) as CityList;

describe('bundled city search (SPEC §7.16, D-057)', () => {
  it('has the GeoNames cities15000 list with attribution', () => {
    expect(list.cities.length).toBeGreaterThan(30_000);
    expect(list.source.attribution).toContain('GeoNames');
    expect(list.source.license).toBe('CC BY 4.0');
  });

  it('finds Latin names without accents, largest first', () => {
    const r = searchCities(list, 'riyadh');
    expect(r[0]?.[0]).toBe('Riyadh');
    expect(r[0]?.[1]).toBe('SA');
    expect(foldLatin('Kraków')).toBe('krakow');
    expect(searchCities(list, 'krakow')[0]?.[0]).toBe('Kraków');
  });

  it('finds Arabic queries through the search-only Arabic names', () => {
    expect(searchCities(list, 'الرياض')[0]?.[0]).toBe('Riyadh');
    expect(searchCities(list, 'القاهره')[0]?.[0]).toBe('Cairo');
    expect(searchCities(list, 'ا')).toEqual([]);
  });

  it('builds a place with its time zone; finds the nearest city', () => {
    const riyadh = searchCities(list, 'riyadh')[0]!;
    expect(toPlace(list, riyadh)).toMatchObject({ name: 'Riyadh', country: 'SA', timeZone: 'Asia/Riyadh' });
    expect(nearestCity(list, 21.42, 39.83)?.[1]).toBe('SA');
  });
});
