// Strict parsers for translation sources (SPEC §7.9). Texts are taken verbatim: CDATA content is
// copied as is; XML attribute values are only entity-decoded (that is how XML encodes them).
// Anything unexpected throws SourceSurprise instead of being "fixed".
import { SourceSurprise } from '../quran/parse.ts';
import type { TafsirRow } from '../tafsir/build.ts';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, name: string) => {
    if (name[0] === '#') return String.fromCodePoint(name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    const ch = ENTITIES[name];
    if (ch === undefined) throw new SourceSurprise(`Unknown XML entity ${whole}`);
    return ch;
  });
}

/** Tanzil translation XML: <sura index><aya index text="…"/></sura>. */
export function parseTanzilTranslation(xml: string, what: string): TafsirRow[] {
  const rows: TafsirRow[] = [];
  for (const s of xml.matchAll(/<sura\b[^>]*\bindex="(\d+)"[^>]*>([\s\S]*?)<\/sura>/gu)) {
    for (const a of s[2]!.matchAll(/<aya\b[^>]*\bindex="(\d+)"[^>]*\btext="([^"]*)"[^>]*\/>/gu)) {
      rows.push({ surah: Number(s[1]), ayah: Number(a[1]), text: decodeXmlAttribute(a[2]!), footnotes: '' });
    }
  }
  if (!rows.length) throw new SourceSurprise(`${what}: no <aya> elements found`);
  return rows;
}

const TRANSLATION = /<translation>(?:<!\[CDATA\[([\s\S]*?)\]\]>)?<\/translation>/u;
const FOOTNOTES = /<footnotes>(?:<!\[CDATA\[([\s\S]*?)\]\]>)?<\/footnotes>/u;

/** QuranEnc XML: <sura number><aya number><translation><![CDATA[…]]></translation><footnotes>…</footnotes></aya>. */
export function parseQuranEncXml(xml: string, what: string): TafsirRow[] {
  const rows: TafsirRow[] = [];
  for (const s of xml.matchAll(/<sura number="(\d+)">([\s\S]*?)<\/sura>/gu)) {
    for (const a of s[2]!.matchAll(/<aya number="(\d+)">([\s\S]*?)<\/aya>/gu)) {
      const body = a[2]!;
      const text = TRANSLATION.exec(body)?.[1];
      if (!text) throw new SourceSurprise(`${what}: missing, empty or non-CDATA translation for ${s[1]}:${a[1]}`);
      const footnotes = body.includes('<footnotes>') ? FOOTNOTES.exec(body) : null;
      if (body.includes('<footnotes>') && !footnotes) throw new SourceSurprise(`${what}: non-CDATA footnotes for ${s[1]}:${a[1]}`);
      rows.push({ surah: Number(s[1]), ayah: Number(a[1]), text, footnotes: footnotes?.[1] ?? '' });
    }
  }
  if (!rows.length) throw new SourceSurprise(`${what}: no <aya> elements found`);
  return rows;
}

/** QuranEnc's own version stamp, e.g. "v1.1.2-xml.1" from <updated_at>. */
export function quranEncVersion(xml: string): string | null {
  return /<updated_at>[^<(]*\(([^)]+)\)<\/updated_at>/u.exec(xml)?.[1] ?? null;
}
