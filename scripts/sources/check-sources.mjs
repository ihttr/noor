#!/usr/bin/env node
// Phase 0 sanity checks on the downloaded candidate sources (read-only).
// Not the Phase 2 integrity suite: it only confirms the candidates are complete and documents
// properties needed for the decisions (Basmala handling, code points, counts).
//
// Usage: node scripts/sources/check-sources.mjs
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { checkStructure, comments, elements, parseQuranData, parseQuranXml, toText } from './lib/tanzil-xml.mjs';
import { listZip, readZipEntry } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const S = (p) => path.join(ROOT, 'data', 'sources', p);
const read = async (p) => toText(await readFile(S(p)));
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

let failures = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const info = (label, detail) => console.log(`INFO  ${label}: ${detail}`);

// ---------- Quran metadata ----------
const meta = parseQuranData(await read('quran/tanzil/quran-data.xml'));
ok(meta.suras.length === 114, 'quran-data: 114 suras');
ok(meta.suras.reduce((n, s) => n + s.ayas, 0) === 6236, 'quran-data: 6236 ayas');
ok(meta.juzs.length === 30, 'quran-data: 30 juz');
ok(meta.quarters.length === 240, 'quran-data: 240 hizb quarters');
ok(meta.pages.length === 604, 'quran-data: 604 pages');
ok(meta.sajdas.length === 15, 'quran-data: 15 sajdas', meta.sajdas.map((s) => `${s.sura}:${s.aya}(${s.type})`).join(' '));
info('quran-data: manzils / rukus', `${meta.manzils.length} / ${meta.rukus.length}`);

// ---------- Quran text ----------
const texts = {};
for (const file of ['quran-uthmani.xml', 'quran-uthmani.no-tatweel.xml', 'quran-simple-clean.xml']) {
  const xml = await read(`quran/tanzil/${file}`);
  const suras = parseQuranXml(xml); // entities: 'reject' — no decoding of Quran text
  texts[file] = suras;
  const { total, problems } = checkStructure(suras, meta);
  ok(problems.length === 0, `${file}: 114 suras / ${total} ayas / per-sura counts match metadata`, problems.join('; '));

  const notice = comments(xml).join('\n');
  const version = notice.match(/Tanzil Quran Text \(([^)]+)\)/)?.[1];
  info(`${file}: notice`, `${version}; ${notice.match(/License: [^\n]+/)?.[0]}`);

  const fatiha1 = suras[0].ayas[0].text;
  const withBismillah = suras.flatMap((s) => s.ayas.filter((a) => a.bismillah !== undefined).map(() => s.index));
  ok(
    withBismillah.length === 112 && !withBismillah.includes(1) && !withBismillah.includes(9),
    `${file}: 'bismillah' attribute on ayah 1 of 112 suras (not 1, not 9)`
  );
  // Suras 94 and 96 end with ب, so the Madani Mushaf writes the following Basmala (95, 97) with a
  // shadda on its first letter. Expect exactly that variant there and the plain 1:1 string elsewhere.
  const shaddaVariant = [...fatiha1][0] + 'ّ' + [...fatiha1].slice(1).join('');
  const mismatch = suras.flatMap((s) =>
    s.ayas
      .filter((a) => a.bismillah !== undefined)
      .filter((a) => {
        const expected = [95, 97].includes(s.index) && file.startsWith('quran-uthmani') ? shaddaVariant : fatiha1;
        return a.bismillah !== expected;
      })
      .map((a) => `${s.index}:${a.index}`)
  );
  ok(
    mismatch.length === 0,
    `${file}: 'bismillah' equals 1:1 exactly${file.startsWith('quran-uthmani') ? ', except 95 & 97 = 1:1 with U+0651 after the first letter' : ''}`,
    mismatch.join(' ')
  );
  const prefixed = suras.slice(1).filter((s) => s.ayas[0].text.startsWith(fatiha1));
  ok(prefixed.length === 0, `${file}: no ayah 1 of suras 2-114 starts with the Basmala`, prefixed.map((s) => s.index).join(' '));
}

// tatweel option: what exactly differs between the two Uthmani downloads
{
  const a = texts['quran-uthmani.xml'].flatMap((s) => s.ayas);
  const b = texts['quran-uthmani.no-tatweel.xml'].flatMap((s) => s.ayas);
  const count = (arr, cp) => arr.reduce((n, x) => n + [...x.text].filter((c) => c.codePointAt(0) === cp).length, 0);
  const differing = a.filter((x, i) => x.text !== b[i].text).length;
  info('tatweel option', `${differing} ayas differ; U+0640 TATWEEL count ${count(a, 0x640)} (tatweel=true) vs ${count(b, 0x640)} (tatweel=false)`);
}

// txt-2 Basmala behaviour (documented in SOURCES.md)
{
  const lines = (await read('quran/tanzil/quran-uthmani.txt')).split('\n').filter((l) => /^\d+\|\d+\|/.test(l));
  const fatiha1 = lines[0].split('|')[2].replace(/\r$/, '');
  const firsts = lines.filter((l) => l.split('|')[1] === '1' && l.split('|')[0] !== '1');
  const prefixed = firsts.filter((l) => l.split('|')[2].startsWith(fatiha1 + ' '));
  info('quran-uthmani.txt (txt-2)', `${lines.length} lines; ayah 1 of ${prefixed.length}/${firsts.length} suras 2-114 is prefixed with the Basmala + space`);
}

// Code point inventory of the Uthmani text (input for the font comparison)
{
  const freq = new Map();
  for (const s of texts['quran-uthmani.xml']) for (const a of s.ayas) for (const ch of a.text) {
    const cp = ch.codePointAt(0);
    freq.set(cp, (freq.get(cp) ?? 0) + 1);
  }
  const list = [...freq.entries()].sort((x, y) => x[0] - y[0]);
  info('Uthmani code points', `${list.length} distinct: ${list.map(([cp]) => hex(cp)).join(' ')}`);
  const pauseAfterSpace = texts['quran-uthmani.xml'].flatMap((s) => s.ayas).filter((a) => / [ۖ-ۜ]/u.test(a.text)).length;
  info('pause marks', `${pauseAfterSpace} ayas contain a pause mark (U+06D6..U+06DC) that directly follows a space`);
}

// Search-index input: Simple Clean must contain no marks; word alignment with Uthmani
{
  const clean = texts['quran-simple-clean.xml'].flatMap((s) => s.ayas);
  const marked = clean.filter((a) => /[ۖ-ۭ]/u.test(a.text)).length;
  ok(marked === 0, 'quran-simple-clean.xml: no pause/sajdah marks (U+06D6..U+06ED)', `${marked} ayas contain marks`);
  const uth = texts['quran-uthmani.xml'].flatMap((s) => s.ayas);
  const markOnly = /^[ۖ-ۭ]+$/u;
  const words = (t) => t.split(' ').filter((w) => !markOnly.test(w));
  const mismatched = uth.filter((a, i) => words(a.text).length !== words(clean[i].text).length).length;
  const markTokens = uth.reduce((n, a) => n + a.text.split(' ').filter((w) => markOnly.test(w)).length, 0);
  info('word alignment', `${mismatched} of ${uth.length} ayas have different word counts (Uthmani vs Simple Clean, mark-only tokens ignored); Uthmani has ${markTokens} mark-only tokens`);
}

// ---------- KFGQPC-encoded reference text (QuranEnc API) ----------
{
  const dir = S('quran/quranenc-kfgqpc/sura');
  let n = 0;
  const cps = new Set();
  for (const f of await readdir(dir)) {
    const rows = JSON.parse(await readFile(path.join(dir, f), 'utf8')).result;
    n += rows.length;
    for (const r of rows) for (const ch of r.arabic_text) cps.add(ch.codePointAt(0));
  }
  ok(n === 6236, 'QuranEnc arabic_text (KFGQPC encoding): 6236 ayas');
  const tanzil = new Set(texts['quran-uthmani.xml'].flatMap((s) => s.ayas).flatMap((a) => [...a.text].map((c) => c.codePointAt(0))));
  info('KFGQPC-only code points', [...cps].filter((c) => !tanzil.has(c)).sort((a, b) => a - b).map(hex).join(' ') || 'none');
  info('Tanzil-only code points', [...tanzil].filter((c) => !cps.has(c)).sort((a, b) => a - b).map(hex).join(' ') || 'none');
}

// ---------- Translations & tafsir ----------
for (const id of ['en.sahih', 'en.pickthall', 'en.yusufali', 'en.hilali', 'en.itani']) {
  const xml = await read(`translations/tanzil/${id}.xml`);
  const suras = parseQuranXml(xml, { entities: 'decode' });
  const { total, problems } = checkStructure(suras, meta);
  const header = comments(xml).join('\n');
  ok(problems.length === 0, `Tanzil ${id}: ${total} ayas`, problems.join('; '));
  info(`Tanzil ${id}`, `${header.match(/Translator: [^\n]+/)?.[0]}; ${header.match(/Last Update: [^\n]+/)?.[0]}`);
}
for (const key of ['english_saheeh', 'english_rwwad', 'english_hilali_khan']) {
  const xml = await read(`translations/quranenc/${key}.xml`);
  const ayas = elements(xml, 'aya').length;
  ok(ayas === 6236, `QuranEnc ${key}: ${ayas} ayas`);
  info(`QuranEnc ${key}`, `updated_at ${xml.match(/<updated_at>([^<]+)</)?.[1]}`);
}
{
  const xml = await read('tafsir/tanzil/ar.muyassar.xml');
  const { total, problems } = checkStructure(parseQuranXml(xml, { entities: 'decode' }), meta);
  ok(problems.length === 0, `Tanzil ar.muyassar: ${total} ayas`, problems.join('; '));
  info('Tanzil ar.muyassar', comments(xml).join('\n').match(/Last Update: [^\n]+/)?.[0]);
  const db = new DatabaseSync(S('tafsir/quranenc/arabic_moyassar.sqlite'), { readOnly: true });
  const rows = db.prepare('SELECT count(*) AS c, count(DISTINCT sura) AS s FROM translations').get();
  ok(rows.c === 6236 && rows.s === 114, `QuranEnc arabic_moyassar.sqlite: ${rows.c} rows, ${rows.s} suras`);
  db.close();
}

// Candidates with unclear licenses are kept out of the public repository (.gitignore), so a
// fresh checkout may not have them; their checks are skipped there.
const present = async (p) => access(S(p)).then(() => true, () => false);
const LOCAL_ONLY = 'not in this checkout (kept local only: unclear license, see .gitignore)';

// ---------- Adhkar ----------
{
  const seen = JSON.parse(await read('adhkar/seen-arabic/ar.json'));
  const withSource = seen.filter((x) => (x.source ?? '').trim()).length;
  info('Seen-Arabic ar.json', `${seen.length} items; ${withSource} with a non-empty 'source' (reference/grading text); fields: ${Object.keys(seen[0]).join(', ')}`);

  for (const lang of (await present('adhkar/hisnmuslim-com')) ? ['ar', 'en'] : []) {
    const dir = S(`adhkar/hisnmuslim-com/${lang}`);
    const files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f));
    let items = 0;
    const broken = [];
    for (const f of files) {
      try {
        items += Object.values(JSON.parse(toText(await readFile(path.join(dir, f)))))[0].length;
      } catch {
        broken.push(f);
      }
    }
    info(`hisnmuslim.com ${lang}`, `${files.length} chapters, ${items} items in strictly valid files; not strictly valid JSON upstream: ${broken.join(', ') || 'none'}`);
  }

  if (!(await present('adhkar/hisnmuslim-com'))) info('hisnmuslim.com', LOCAL_ONLY);
  if (await present('adhkar/rn0x-hisn-almuslim/hisn_almuslim.json')) {
    const rn0x = JSON.parse(await read('adhkar/rn0x-hisn-almuslim/hisn_almuslim.json'));
    const chapters = Object.values(rn0x);
    info('rn0x hisn_almuslim.json', `${chapters.length} sections; ${chapters.reduce((n, c) => n + (c.text?.length ?? 0), 0)} text entries; ${chapters.reduce((n, c) => n + (c.footnote?.length ?? 0), 0)} footnotes (not linked to entries)`);
  } else {
    info('rn0x hisn_almuslim.json', LOCAL_ONLY);
  }
}

// ---------- Cities ----------
{
  const zip = await readFile(S('cities/geonames/cities15000.zip'));
  const entries = listZip(zip);
  const txt = readZipEntry(zip, entries.find((e) => e.name === 'cities15000.txt')).toString('utf8');
  const rows = txt.split('\n').filter(Boolean).map((l) => l.split('\t'));
  ok(rows.every((r) => r.length === 19), `GeoNames cities15000.txt: ${rows.length} rows, 19 columns each`);
  const arabicAlt = rows.filter((r) => /[؀-ۿ]/u.test(r[3])).length;
  info('GeoNames Arabic-script alternate names', `${arabicAlt} of ${rows.length} cities have at least one Arabic-script entry in 'alternatenames' (untagged by language)`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
