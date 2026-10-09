import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Open Graph images (SPEC §9) with next/og. Satori joins Arabic letters but lays words out left
// to right, so Arabic lines are drawn word by word in a reversed row. Only UI strings and surah
// names are drawn — never Quran text.

export const OG_SIZE = { width: 1200, height: 630 };
export const COLORS = { canvas: '#f8f6f1', ink: '#1a1c19', muted: '#565b54', accent: '#1e6b52', soft: '#e3efe9' };

const FONT_DIR = path.join(process.cwd(), 'data', 'sources', 'fonts', 'ibm-plex-sans-arabic');

export async function ogFonts() {
  const [regular, semibold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'IBMPlexSansArabic-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'IBMPlexSansArabic-SemiBold.ttf')),
  ]);
  return [
    { name: 'Plex', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Plex', data: semibold, weight: 600 as const, style: 'normal' as const },
  ];
}

/** A line of text; right-to-left lines keep their word order. */
export function Line({ text, rtl, style }: { text: string; rtl: boolean; style: Record<string, string | number> }) {
  return (
    <div style={{ display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: '0 0.28em', ...style }}>
      {text.split(' ').map((word, i) => (
        <span key={i}>{word}</span>
      ))}
    </div>
  );
}

export function BrandMark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: size * 0.28, background: COLORS.accent, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', width: size * 0.42, height: size * 0.42, borderRadius: size, border: `${size * 0.06}px solid white`, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: size * 0.13, height: size * 0.13, borderRadius: size, background: 'white' }} />
      </div>
    </div>
  );
}
