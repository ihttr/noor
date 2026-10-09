// Builds the PWA icons (SPEC §7.20) from src/app/icon.svg: public/icons/*.png and
// src/app/apple-icon.png.
// Usage: node scripts/build-icons.ts        (rewrite)
//        node scripts/build-icons.ts --check (CI: fail if an icon is out of date)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const svg = readFileSync('src/app/icon.svg', 'utf8');
// Full-bleed variant for maskable and Apple icons: the motif inside the 80% safe zone.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" fill="#1e6b52"/>
  <circle cx="20" cy="20" r="6.5" fill="none" stroke="#ffffff" stroke-width="2"/>
  <circle cx="20" cy="20" r="2" fill="#ffffff"/>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', source: svg, size: 192 },
  { file: 'icon-512.png', source: svg, size: 512 },
  { file: 'maskable-512.png', source: fullBleed, size: 512 },
  { file: 'apple-touch-icon.png', source: fullBleed, size: 180 },
];
// Next.js file convention: <link rel="apple-touch-icon"> on every page.
const APPLE_ICON = path.join('src', 'app', 'apple-icon.png');

const dir = path.join('public', 'icons');
mkdirSync(dir, { recursive: true });
const check = process.argv.includes('--check');
let stale = 0;
for (const icon of ICONS) {
  const png = await sharp(Buffer.from(icon.source), { density: 72 * (icon.size / 32) })
    .resize(icon.size, icon.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const file = path.join(dir, icon.file);
  if (check) {
    if (!existsSync(file)) stale++;
    console.log(`${existsSync(file) ? 'ok' : 'MISSING'} ${file}`);
    continue;
  }
  writeFileSync(file, png);
  if (icon.file === 'apple-touch-icon.png') writeFileSync(APPLE_ICON, png);
  console.log(`${file} ${png.length} bytes`);
}
if (stale) process.exit(1);
