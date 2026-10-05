#!/usr/bin/env node
// Generates data/sources/font-test/index.html: a standalone page that renders tricky ayahs in every
// candidate Quran font. All Quran text is read from the downloaded source files (never typed):
//   - Tanzil Uthmani XML (tatweel=true and tatweel=false downloads)
//   - Tanzil quran-data.xml (surah names, sajdahs, hizb quarters)
//   - QuranEnc arabic_text (KFGQPC encoding) for the optional, clearly labelled reference row
// Text strings are embedded as JSON and assigned with textContent; the page then verifies that
// every rendered element's textContent equals its source string.
//
// Usage: node scripts/sources/build-font-test.mjs   (run font-report.mjs first)
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuranData, parseQuranXml, toText } from './lib/tanzil-xml.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const S = (p) => path.join(ROOT, 'data', 'sources', p);
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

// Unicode character names for the non-letter code points that occur in the candidate texts.
const NAMES = {
  0x00a0: 'NO-BREAK SPACE',
  0x0640: 'ARABIC TATWEEL',
  0x064b: 'ARABIC FATHATAN',
  0x064c: 'ARABIC DAMMATAN',
  0x064d: 'ARABIC KASRATAN',
  0x064e: 'ARABIC FATHA',
  0x064f: 'ARABIC DAMMA',
  0x0650: 'ARABIC KASRA',
  0x0651: 'ARABIC SHADDA',
  0x0652: 'ARABIC SUKUN',
  0x0653: 'ARABIC MADDAH ABOVE',
  0x0654: 'ARABIC HAMZA ABOVE',
  0x0655: 'ARABIC HAMZA BELOW',
  0x0656: 'ARABIC SUBSCRIPT ALEF',
  0x0657: 'ARABIC INVERTED DAMMA',
  0x065e: 'ARABIC FATHA WITH TWO DOTS',
  0x0670: 'ARABIC LETTER SUPERSCRIPT ALEF',
  0x0671: 'ARABIC LETTER ALEF WASLA',
  0x06d6: 'ARABIC SMALL HIGH LIGATURE SAD WITH LAM WITH ALEF MAKSURA',
  0x06d7: 'ARABIC SMALL HIGH LIGATURE QAF WITH LAM WITH ALEF MAKSURA',
  0x06d8: 'ARABIC SMALL HIGH MEEM INITIAL FORM',
  0x06d9: 'ARABIC SMALL HIGH LAM ALEF',
  0x06da: 'ARABIC SMALL HIGH JEEM',
  0x06db: 'ARABIC SMALL HIGH THREE DOTS',
  0x06dc: 'ARABIC SMALL HIGH SEEN',
  0x06de: 'ARABIC START OF RUB EL HIZB',
  0x06df: 'ARABIC SMALL HIGH ROUNDED ZERO',
  0x06e0: 'ARABIC SMALL HIGH UPRIGHT RECTANGULAR ZERO',
  0x06e1: 'ARABIC SMALL HIGH DOTLESS HEAD OF KHAH',
  0x06e2: 'ARABIC SMALL HIGH MEEM ISOLATED FORM',
  0x06e3: 'ARABIC SMALL LOW SEEN',
  0x06e4: 'ARABIC SMALL HIGH MADDA',
  0x06e5: 'ARABIC SMALL WAW',
  0x06e6: 'ARABIC SMALL YEH',
  0x06e7: 'ARABIC SMALL HIGH YEH',
  0x06e8: 'ARABIC SMALL HIGH NOON',
  0x06e9: 'ARABIC PLACE OF SAJDAH',
  0x06ea: 'ARABIC EMPTY CENTRE LOW STOP',
  0x06eb: 'ARABIC EMPTY CENTRE HIGH STOP',
  0x06ec: 'ARABIC ROUNDED HIGH STOP WITH FILLED CENTRE',
  0x06ed: 'ARABIC SMALL LOW MEEM',
};
// Code points that are "special" for font testing: everything except plain letters and space.
const isSpecial = (cp) => cp !== 0x20 && !(cp >= 0x0621 && cp <= 0x063a) && !(cp >= 0x0641 && cp <= 0x064a);

const meta = parseQuranData(toText(await readFile(S('quran/tanzil/quran-data.xml'))));
const variants = {
  tatweel: parseQuranXml(toText(await readFile(S('quran/tanzil/quran-uthmani.xml')))),
  noTatweel: parseQuranXml(toText(await readFile(S('quran/tanzil/quran-uthmani.no-tatweel.xml')))),
};
const kfgqpc = new Map();
for (const f of await readdir(S('quran/quranenc-kfgqpc/sura'))) {
  for (const r of JSON.parse(await readFile(S(`quran/quranenc-kfgqpc/sura/${f}`), 'utf8')).result) {
    kfgqpc.set(`${Number(r.sura)}:${Number(r.aya)}`, r.arabic_text);
  }
}
const fontReport = JSON.parse(await readFile(S('fonts/FONT-REPORT.json'), 'utf8'));

const allAyas = variants.tatweel.flatMap((s) => s.ayas.map((a) => ({ sura: s.index, aya: a.index, text: a.text })));
const byKey = new Map(allAyas.map((a) => [`${a.sura}:${a.aya}`, a]));
const picks = new Map(); // key -> Set(reasons)
const add = (key, reason) => {
  if (!byKey.has(key)) throw new Error(`no such ayah ${key}`);
  if (!picks.has(key)) picks.set(key, new Set());
  picks.get(key).add(reason);
};

// 1) Requested by the owner
for (const key of ['1:1', '2:1', '2:255', '9:1', '18:1', '36:1']) add(key, 'requested');
// 2) Data-driven extras
add(`${meta.quarters[1].sura}:${meta.quarters[1].aya}`, 'start of a hizb quarter (۞ only in the KFGQPC reference text)');
const longest = allAyas.reduce((m, a) => ([...a.text].length > [...m.text].length ? a : m));
add(`${longest.sura}:${longest.aya}`, 'longest ayah (line breaking)');
for (const s of meta.sajdas) add(`${s.sura}:${s.aya}`, `sajdah (${s.type})`);
for (const s of variants.tatweel) {
  const b = s.ayas[0].bismillah;
  if (b !== undefined && b !== variants.tatweel[0].ayas[0].text) add(`${s.index}:1`, 'Basmala variant (shadda on the first letter)');
}
// 3) Automatic coverage: shortest ayah containing each special code point
const shortestWith = (cp, pool, getText) => {
  let best = null;
  for (const a of pool) {
    const t = getText(a);
    if (t && [...t].some((c) => c.codePointAt(0) === cp) && (!best || [...t].length < [...getText(best)].length)) best = a;
  }
  return best;
};
const tanzilCps = new Set(allAyas.flatMap((a) => [...a.text].map((c) => c.codePointAt(0))));
for (const cp of [...tanzilCps].filter(isSpecial).sort((a, b) => a - b)) {
  const a = shortestWith(cp, allAyas, (x) => x.text);
  add(`${a.sura}:${a.aya}`, `${hex(cp)} ${NAMES[cp] ?? ''}`.trim());
}
const kfgqpcOnly = [...new Set([...kfgqpc.values()].flatMap((t) => [...t].map((c) => c.codePointAt(0))))]
  .filter((cp) => !tanzilCps.has(cp))
  .sort((a, b) => a - b);
for (const cp of kfgqpcOnly) {
  const a = shortestWith(cp, allAyas, (x) => kfgqpc.get(`${x.sura}:${x.aya}`));
  add(`${a.sura}:${a.aya}`, `KFGQPC text only: ${hex(cp)} ${NAMES[cp] ?? ''}`.trim());
}

// Build the item list in Mushaf order
const textOf = (suras, sura, aya) => suras[sura - 1].ayas[aya - 1];
const items = [...picks.entries()]
  .map(([key, reasons]) => {
    const [sura, aya] = key.split(':').map(Number);
    const t = textOf(variants.tatweel, sura, aya);
    const n = textOf(variants.noTatweel, sura, aya);
    return {
      key,
      sura,
      aya,
      suraName: meta.suras[sura - 1].name,
      reasons: [...reasons],
      text: { tatweel: t.text, noTatweel: n.text },
      bismillah: t.bismillah === undefined ? null : { tatweel: t.bismillah, noTatweel: n.bismillah },
      kfgqpc: kfgqpc.get(key) ?? null,
    };
  })
  .sort((a, b) => a.sura - b.sura || a.aya - b.aya);

// The page inserts strings with textContent, but guard the JSON-in-<script> embedding anyway.
for (const it of items) {
  for (const s of [it.text.tatweel, it.text.noTatweel, it.bismillah?.tatweel, it.bismillah?.noTatweel, it.kfgqpc]) {
    if (s && /[<&]/.test(s)) throw new Error(`unexpected markup character in ${it.key}`);
  }
}

const fonts = fontReport.fonts
  .filter((f) => f.role !== 'ui')
  .map((f) => ({
    id: f.id,
    label: f.label,
    url: `../${f.file}`,
    format: f.flavor === 'CFF' ? 'opentype' : 'truetype',
    version: f.version,
    kb: Math.round(f.bytes / 1024),
    license: /Open Font License/i.test(`${f.license} ${f.licenseUrl} ${f.copyright}`) || f.id.startsWith('digitalkhatt')
      ? 'SIL OFL 1.1'
      : f.id.startsWith('kfgqpc')
        ? 'KFGQPC EULA (no modification)'
        : 'see report',
    defaultOn: f.role === 'quran',
    missingTanzil: f.missingForTanzilUthmani,
    missingKfgqpc: f.missingForKfgqpcText,
  }));

const data = {
  generatedAt: new Date().toISOString(),
  textSource: 'Tanzil Quran Text (Uthmani, Version 1.1) — marks, sajdah signs, no rub-el-hizb signs; https://tanzil.net',
  referenceSource: 'QuranEnc.com API arabic_text (KFGQPC Hafs encoding) — reference only',
  names: Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [hex(Number(k)), v])),
  fonts,
  items,
};

const template = await readFile(path.join(HERE, 'font-test', 'template.html'), 'utf8');
if (!template.includes('/*__DATA__*/null')) throw new Error('template placeholder missing');
const html = template.replace('/*__DATA__*/null', () => JSON.stringify(data));
await mkdir(S('font-test'), { recursive: true });
await writeFile(S('font-test/index.html'), html, 'utf8');
console.log(`Wrote data/sources/font-test/index.html — ${items.length} ayahs × ${fonts.length} fonts`);
for (const it of items) console.log(`  ${it.key.padEnd(7)} ${it.reasons.join(' | ')}`);
