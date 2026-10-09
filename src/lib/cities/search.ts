// Private city search over the bundled list (SPEC §7.16): nothing leaves the device.
// Latin names are matched without accents; Arabic queries use the Arabic-script names with the
// same character normalization as the Quran search (search only, never displayed).

import { normalizeArabic, toAsciiDigits } from '../quran/normalize.ts';
import type { CityList, CityRow, Place } from './types.ts';

const ARABIC = /[؀-ۿ]/u;

export const foldLatin = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const foldArabic = (s: string) => normalizeArabic(toAsciiDigits(s)).replace(/^ال/u, '').replace(/\s+/gu, ' ').trim();

/** Best matches first: exact, then prefix, then contains; larger cities first within each rank. */
export function searchCities(list: CityList, query: string, limit = 12): CityRow[] {
  const arabic = ARABIC.test(query);
  const q = arabic ? foldArabic(query) : foldLatin(query);
  if (q.length < 2) return [];
  const ranked: { row: CityRow; rank: number; i: number }[] = [];
  list.cities.forEach((row, i) => {
    const names = arabic ? row[6].split('|').filter(Boolean).map(foldArabic) : [foldLatin(row[0])];
    let rank = 3;
    for (const n of names) {
      if (n === q) rank = Math.min(rank, 0);
      else if (n.startsWith(q)) rank = Math.min(rank, 1);
      else if (n.includes(q)) rank = Math.min(rank, 2);
    }
    if (rank < 3) ranked.push({ row, rank, i });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.row);
}

export function toPlace(list: CityList, row: CityRow): Place {
  return {
    id: null,
    name: row[0],
    country: row[1],
    region: row[2] >= 0 ? (list.regions[row[2]] ?? null) : null,
    latitude: row[3],
    longitude: row[4],
    timeZone: list.timeZones[row[5]]!,
  };
}

/** The nearest bundled city (for the country of a GPS position). */
export function nearestCity(list: CityList, latitude: number, longitude: number): CityRow | undefined {
  let best: CityRow | undefined;
  let bestD = Infinity;
  const cos = Math.cos((latitude * Math.PI) / 180);
  for (const row of list.cities) {
    const d = (row[3] - latitude) ** 2 + ((row[4] - longitude) * cos) ** 2;
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return best;
}
