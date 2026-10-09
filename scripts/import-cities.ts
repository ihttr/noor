// Generates content/cities/cities.json from the approved GeoNames files (SPEC §3, D-057).
//
// Usage (PowerShell or any shell):  node scripts/import-cities.ts
//
// Display names are GeoNames' main names (Latin script). The untagged Arabic-script alternate
// names are kept for search only: they mix Arabic, Persian and Urdu spellings and are not
// reliable for display (D-022).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listZip, readZipEntry } from './sources/lib/zip.mjs';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadApproved } from './quran/sources.ts';
import type { CityList, CityRow } from '../src/lib/cities/types.ts';

const ARABIC_SCRIPT = /[؀-ۿ]/u;
const NON_ARABIC_LETTERS = /[پچژگکیۀےڈٹںھہۃەێۆڕڵڤڒۇۈۋۅۉݢݪڻڳڱ]/u;

async function main(): Promise<void> {
  const zip = await loadApproved('cities-geonames');
  const admin1 = await loadApproved('cities-geonames-admin1');
  console.log(`✓ ${zip.path}, ${admin1.path} (SHA-256 verified)`);

  const entries = listZip(zip.bytes) as { name: string }[];
  const entry = entries.find((e) => e.name === 'cities15000.txt');
  if (!entry) throw new SourceSurprise('cities15000.txt missing from the archive');
  const text = (readZipEntry(zip.bytes, entry) as Buffer).toString('utf8');

  const regionNames = new Map<string, string>();
  for (const line of admin1.bytes.toString('utf8').split('\n')) {
    const [code, , ascii] = line.split('\t');
    if (code && ascii) regionNames.set(code, ascii);
  }

  const timeZones: string[] = [];
  const regions: string[] = [];
  const tzIndex = new Map<string, number>();
  const regionIndex = new Map<string, number>();
  const index = <T>(map: Map<T, number>, list: T[], value: T) => {
    let i = map.get(value);
    if (i === undefined) map.set(value, (i = list.push(value) - 1));
    return i;
  };

  const rows: { row: CityRow; population: number; id: number }[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length !== 19) throw new SourceSurprise(`Expected 19 columns, got ${c.length}: ${line.slice(0, 60)}`);
    const [id, name, , alternates, lat, lon, , , country, , admin1Code, , , , population, , , tz] = c;
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!name || !country || !tz || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new SourceSurprise(`Incomplete city row ${id ?? ''}`);
    }
    // Search aid only: Arabic-script names without letters specific to Persian, Urdu, Kurdish…
    const arabic = [...new Set((alternates ?? '').split(',').filter((n) => ARABIC_SCRIPT.test(n) && !NON_ARABIC_LETTERS.test(n)))]
      .slice(0, 3)
      .join('|');
    const region = regionNames.get(`${country}.${admin1Code}`);
    rows.push({
      id: Number(id),
      population: Number(population) || 0,
      row: [
        name,
        country,
        region ? index(regionIndex, regions, region) : -1,
        // Three decimals ≈ 100 m: far below what changes a prayer time.
        Math.round(latitude * 1e3) / 1e3,
        Math.round(longitude * 1e3) / 1e3,
        index(tzIndex, timeZones, tz),
        arabic,
      ],
    });
  }
  // Larger cities first: the search shows the likely match on top.
  rows.sort((a, b) => b.population - a.population || a.id - b.id);
  const cities = rows.map((r) => r.row);

  const list: CityList = {
    schemaVersion: 1,
    source: {
      name: 'GeoNames cities15000',
      url: 'https://www.geonames.org',
      license: 'CC BY 4.0',
      attribution: 'City data © GeoNames (geonames.org), CC BY 4.0',
      files: [zip, admin1].map((f) => ({ path: f.path, sha256: f.sha256 })),
    },
    timeZones,
    regions,
    cities,
  };
  const out = path.join(ROOT, 'content/cities/cities.json');
  await mkdir(path.dirname(out), { recursive: true });
  const body = `${JSON.stringify(list)}\n`;
  await writeFile(out, body, 'utf8');
  console.log(`Wrote content/cities/cities.json: ${cities.length} cities, ${timeZones.length} time zones (${(body.length / 1024).toFixed(0)} KB).`);
}

main().catch((err: unknown) => {
  const prefix = err instanceof SourceSurprise ? 'STOPPED — the source data contains something unexpected:' : 'FAILED:';
  console.error(`\n${prefix}\n  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
