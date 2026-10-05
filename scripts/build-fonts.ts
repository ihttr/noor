// Builds the web font files of the approved Quran fonts into assets/fonts/ and records their
// provenance in assets/fonts/fonts.lock.json.
//
// Usage (PowerShell or any shell):  node scripts/build-fonts.ts [--check]
//
// - Amiri Quran: approved TTF → WOFF2 (wawoff2 = Google's woff2 encoder in WASM). Amiri has no
//   Reserved Font Name, so the converted copy may keep its name under the OFL. The conversion is
//   verified by decompressing it again and comparing cmap coverage and the version string.
// - Scheherazade New is served from SIL's own unmodified WOFF2 in data/sources (not rebuilt).
// --check: rebuild in memory and fail if assets/fonts differs (used in CI).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import wawoff2 from 'wawoff2';
import { inspectFont } from './sources/lib/sfnt.mjs';
import { ROOT, loadApproved, sha256 } from './quran/sources.ts';

const OUT_DIR = 'assets/fonts';
const check = process.argv.includes('--check');

const source = await loadApproved('quran-font-amiri', 'AmiriQuran.ttf');
const woff2 = Buffer.from(await wawoff2.compress(source.bytes));

// Round trip: the decompressed font must map exactly the same code points and keep its version.
const original = inspectFont(source.bytes);
const roundTrip = inspectFont(Buffer.from(await wawoff2.decompress(woff2)));
const sameCmap =
  original.cmap.size === roundTrip.cmap.size && [...original.cmap].every((cp: number) => roundTrip.cmap.has(cp));
if (!sameCmap || original.names[5] !== roundTrip.names[5]) {
  throw new Error('WOFF2 round trip changed the font (cmap or version differs)');
}

const output = path.posix.join(OUT_DIR, 'AmiriQuran.woff2');
const lock = {
  schemaVersion: 1,
  generatedBy: 'scripts/build-fonts.ts',
  note: 'Derived web fonts. Only approved sources (SOURCES.lock.json) are used; outputs are verified by a WOFF2 round trip.',
  files: [
    {
      path: output,
      sha256: sha256(woff2),
      bytes: woff2.length,
      from: { path: source.path, sha256: source.sha256, version: original.names[5] },
      tool: 'wawoff2@2.0.1 (Google woff2, WASM)',
      license: 'SIL Open Font License 1.1 (see data/sources/fonts/amiri-quran/OFL.txt)',
    },
  ],
};

if (check) {
  const current = await readFile(path.join(ROOT, output)).catch(() => null);
  if (!current || sha256(current) !== lock.files[0]!.sha256) {
    console.error(`${output} is missing or stale — run: node scripts/build-fonts.ts`);
    process.exit(1);
  }
  console.log(`✓ ${output} is up to date (${(woff2.length / 1024).toFixed(0)} KB)`);
} else {
  await mkdir(path.join(ROOT, OUT_DIR), { recursive: true });
  await writeFile(path.join(ROOT, output), woff2);
  await writeFile(path.join(ROOT, OUT_DIR, 'fonts.lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  console.log(
    `✓ ${output}: ${(source.bytes.length / 1024).toFixed(0)} KB TTF → ${(woff2.length / 1024).toFixed(0)} KB WOFF2 ` +
      `(${original.cmap.size} code points, ${original.names[5]}; round trip verified)`
  );
}
