// Builds content/adhkar/ from the approved Seen-Arabic dataset (D-019, D-055). Texts are copied
// verbatim. Quranic passages are replaced by ayah references (curated mapping, checked against
// the Quran text). Anything unexpected throws SourceSurprise.
import { normalizeArabic } from '../../src/lib/quran/normalize.ts';
import type { SearchIndexFile } from '../../src/lib/quran/types.ts';
import { ADHKAR_CATEGORIES, type AdhkarCategoryFile, type AdhkarIndex, type AdhkarSource, type Dhikr, type DhikrPart } from '../../src/lib/adhkar/types.ts';
import { SourceSurprise } from '../quran/parse.ts';
import type { ApprovedFile } from '../quran/sources.ts';

interface RawAr {
  order: number;
  content: string;
  count: number;
  source: string;
  type: number;
}
interface RawEn extends RawAr {
  translation: string;
}

export interface QuranMapping {
  items: Record<string, { split: 'brackets' | 'whole'; ayahs: { surah: number; from: number; to: number } }>;
}

const OPEN = '﴿';
const CLOSE = '﴾';

/** Normalized words without punctuation (for checking a mapping only; never displayed). */
function words(text: string): string[] {
  return normalizeArabic(text)
    .replace(/[^ء-ي\s]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

/** Share of the dataset passage's words found in the referenced ayahs (spelling may differ slightly). */
export function overlap(passage: string, ayahs: string): number {
  const target = new Set(words(ayahs));
  const list = words(passage);
  return list.length ? list.filter((w) => target.has(w)).length / list.length : 0;
}

function parts(raw: RawAr, mapping: QuranMapping, search: Map<string, string>): DhikrPart[] {
  const m = mapping.items[String(raw.order)];
  if (!m) {
    if (raw.content.includes(OPEN)) throw new SourceSurprise(`Dhikr ${raw.order} quotes the Quran (﴿…﴾) but has no mapping`);
    return [{ kind: 'text', text: raw.content }];
  }
  const { surah, from, to } = m.ayahs;
  const reference = Array.from({ length: to - from + 1 }, (_, i) => search.get(`${surah}:${from + i}`));
  if (reference.some((t) => t === undefined)) throw new SourceSurprise(`Dhikr ${raw.order}: invalid ayah range ${surah}:${from}-${to}`);
  let before = '';
  let passage = raw.content;
  let after = '';
  if (m.split === 'brackets') {
    const i = raw.content.indexOf(OPEN);
    const j = raw.content.indexOf(CLOSE);
    if (i < 0 || j < i) throw new SourceSurprise(`Dhikr ${raw.order}: expected ﴿…﴾ around the Quranic passage`);
    before = raw.content.slice(0, i);
    passage = raw.content.slice(i + 1, j);
    after = raw.content.slice(j + 1);
  }
  const score = overlap(passage, reference.join(' '));
  if (score < 0.75) throw new SourceSurprise(`Dhikr ${raw.order}: passage does not match ${surah}:${from}-${to} (word overlap ${score.toFixed(2)})`);
  const out: DhikrPart[] = [];
  if (before) out.push({ kind: 'text', text: before });
  out.push({ kind: 'quran', surah, from, to });
  if (after) out.push({ kind: 'text', text: after });
  return out;
}

export function buildAdhkar(
  ar: ApprovedFile,
  en: ApprovedFile,
  mapping: QuranMapping,
  searchIndex: SearchIndexFile
): { index: AdhkarIndex; categories: AdhkarCategoryFile[] } {
  const rawAr = JSON.parse(ar.bytes.toString('utf8')) as RawAr[];
  const rawEn = JSON.parse(en.bytes.toString('utf8')) as RawEn[];
  if (!Array.isArray(rawAr) || !Array.isArray(rawEn) || rawAr.length !== rawEn.length) {
    throw new SourceSurprise('The Arabic and English files must be arrays of the same length');
  }
  const search = new Map(searchIndex.entries.map(([k, t]) => [k, t]));
  const enByOrder = new Map(rawEn.map((e) => [e.order, e]));
  const seen = new Set<number>();
  for (const r of rawAr) {
    if (!Number.isInteger(r.order) || seen.has(r.order)) throw new SourceSurprise(`Duplicate or invalid order ${String(r.order)}`);
    seen.add(r.order);
    if (!r.content) throw new SourceSurprise(`Dhikr ${r.order} has no text`);
    if (!Number.isInteger(r.count) || r.count < 1) throw new SourceSurprise(`Dhikr ${r.order} has no valid count`);
    // SPEC §2.7: every dhikr needs a reference.
    if (!r.source || !enByOrder.get(r.order)?.source) throw new SourceSurprise(`Dhikr ${r.order} has no reference`);
    if (![0, 1, 2].includes(r.type)) throw new SourceSurprise(`Dhikr ${r.order} has unknown type ${r.type}`);
    const e = enByOrder.get(r.order)!;
    if (e.content !== r.content || e.count !== r.count || e.type !== r.type) throw new SourceSurprise(`Dhikr ${r.order}: Arabic and English entries differ`);
  }
  for (const key of Object.keys(mapping.items)) {
    if (!seen.has(Number(key))) throw new SourceSurprise(`Mapping for unknown dhikr ${key}`);
  }

  const source: AdhkarSource = {
    name: ar.source.name,
    url: ar.source.homepage,
    version: ar.source.version,
    license: ar.source.license.name,
    attribution: 'Seen-Arabic, Morning-And-Evening-Adhkar-DB (MIT)',
    files: [ar, en].map((f) => ({ path: f.path, sha256: f.sha256 })),
  };
  const build = (id: 'morning' | 'evening', types: number[]): AdhkarCategoryFile => ({
    schemaVersion: 1,
    id,
    source,
    items: rawAr
      .filter((r) => types.includes(r.type))
      .sort((a, b) => a.order - b.order)
      .map((r): Dhikr => {
        const e = enByOrder.get(r.order)!;
        return {
          id: `${id}:${r.order}`,
          order: r.order,
          parts: parts(r, mapping, search),
          count: r.count,
          reference: { ar: r.source, en: e.source },
          translation: e.translation,
        };
      }),
  });
  const categories = [build('morning', [0, 1]), build('evening', [0, 2])];
  return {
    index: {
      schemaVersion: 1,
      source,
      categories: ADHKAR_CATEGORIES.map((id) => ({ id, count: categories.find((c) => c.id === id)?.items.length ?? 0 })),
    },
    categories,
  };
}
