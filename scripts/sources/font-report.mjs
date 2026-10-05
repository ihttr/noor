#!/usr/bin/env node
// Inspects every candidate font: version and license (from the font's own `name` table),
// OpenType layout support, and cmap coverage of the code points used by the candidate texts.
// Writes data/sources/fonts/FONT-REPORT.json (consumed by build-font-test.mjs).
//
// Usage: node scripts/sources/font-report.mjs
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectFont } from './lib/sfnt.mjs';
import { parseQuranXml, toText } from './lib/tanzil-xml.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const S = (p) => path.join(ROOT, 'data', 'sources', p);
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

export const FONTS = [
  { id: 'amiri-quran', sourceId: 'font-amiri-quran', label: 'Amiri Quran', file: 'fonts/amiri-quran/AmiriQuran.ttf', role: 'quran' },
  { id: 'amiri-quran-colored', sourceId: 'font-amiri-quran', label: 'Amiri Quran Colored', file: 'fonts/amiri-quran/AmiriQuranColored.ttf', role: 'quran-variant' },
  { id: 'scheherazade-new', sourceId: 'font-scheherazade-new', label: 'Scheherazade New', file: 'fonts/scheherazade-new/ScheherazadeNew-Regular.ttf', role: 'quran' },
  { id: 'kfgqpc-hafs-v30', sourceId: 'font-kfgqpc-hafs-v30', label: 'KFGQPC Hafs v3.0', file: 'fonts/kfgqpc-hafs-v30/KFGQPC-Hafs-V30.ttf', role: 'quran' },
  { id: 'kfgqpc-hafs-v22', sourceId: 'font-kfgqpc-hafs-v22', label: 'KFGQPC Uthmanic Hafs v2.2', file: 'fonts/kfgqpc-hafs-v22/UthmanicHafs_V22.ttf', role: 'quran' },
  { id: 'kfgqpc-hafs-v22-alt', sourceId: 'font-kfgqpc-hafs-v22', label: 'KFGQPC Uthmanic Hafs v2.2 (2nd build)', file: 'fonts/kfgqpc-hafs-v22/uthmanic_hafs_v22.ttf', role: 'quran-variant' },
  { id: 'digitalkhatt-madina', sourceId: 'font-digitalkhatt-madina', label: 'DigitalKhatt Madina', file: 'fonts/digitalkhatt-madina/madina.otf', role: 'quran' },
  { id: 'noto-naskh-arabic', sourceId: 'font-noto-naskh-arabic', label: 'Noto Naskh Arabic (baseline)', file: 'fonts/noto-naskh-arabic/NotoNaskhArabic-Regular.ttf', role: 'quran' },
  { id: 'ibm-plex-sans-arabic', sourceId: 'font-ibm-plex-sans-arabic', label: 'IBM Plex Sans Arabic (UI)', file: 'fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-Regular.ttf', role: 'ui' },
];

async function codePoints() {
  const tanzil = new Set();
  const suras = parseQuranXml(toText(await readFile(S('quran/tanzil/quran-uthmani.xml'))));
  for (const s of suras) for (const a of s.ayas) {
    for (const ch of a.text) tanzil.add(ch.codePointAt(0));
    if (a.bismillah) for (const ch of a.bismillah) tanzil.add(ch.codePointAt(0));
  }
  const kfgqpc = new Set();
  const dir = S('quran/quranenc-kfgqpc/sura');
  for (const f of await readdir(dir)) {
    for (const r of JSON.parse(await readFile(path.join(dir, f), 'utf8')).result) {
      for (const ch of r.arabic_text) kfgqpc.add(ch.codePointAt(0));
    }
  }
  return { tanzil, kfgqpc };
}

const sets = await codePoints();
const report = { generatedAt: new Date().toISOString(), texts: {}, fonts: [] };
for (const [k, set] of Object.entries(sets)) report.texts[k] = [...set].sort((a, b) => a - b).map(hex);

for (const font of FONTS) {
  const buf = await readFile(S(font.file));
  const f = inspectFont(buf);
  const missing = (set) => [...set].filter((cp) => cp !== 0x20 && !f.cmap.has(cp)).sort((a, b) => a - b).map(hex);
  report.fonts.push({
    ...font,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    flavor: f.flavor,
    family: f.names[16] ?? f.names[1],
    version: f.names[5],
    copyright: f.names[0] ?? null,
    license: f.names[13] ?? null,
    licenseUrl: f.names[14] ?? null,
    glyphMappedCodePoints: f.cmap.size,
    gsub: f.gsub,
    gpos: f.gpos,
    hasMarkPositioning: f.gpos.features.includes('mark') && f.gpos.features.includes('mkmk'),
    missingForTanzilUthmani: missing(sets.tanzil),
    missingForKfgqpcText: missing(sets.kfgqpc),
  });
}

await writeFile(S('fonts/FONT-REPORT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

for (const r of report.fonts) {
  console.log(`\n${r.label}  [${r.file}]`);
  console.log(`  version: ${r.version}  |  ${r.flavor}  |  ${(r.bytes / 1024).toFixed(0)} KB  |  mark+mkmk: ${r.hasMarkPositioning}`);
  console.log(`  license (nameID 13): ${(r.license ?? '—').replace(/\s+/g, ' ').slice(0, 220)}`);
  console.log(`  missing for Tanzil Uthmani (${r.missingForTanzilUthmani.length}): ${r.missingForTanzilUthmani.join(' ') || 'none'}`);
  console.log(`  missing for KFGQPC text (${r.missingForKfgqpcText.length}): ${r.missingForKfgqpcText.join(' ') || 'none'}`);
}
console.log(`\nWrote data/sources/fonts/FONT-REPORT.json`);
