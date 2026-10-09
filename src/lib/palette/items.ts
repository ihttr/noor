// Command palette entries (SPEC §7.8): surahs, ayah references, pages, juz, sections, saved
// items and notes, settings, and "search the Quran for …". Pure, unit-tested.

import { matchesSurah } from '../quran/filter.ts';
import { readerHref, type NavData } from '../quran/nav.ts';
import { toAsciiDigits } from '../quran/normalize.ts';
import { parseAyahRef } from '../quran/refs.ts';
import { foldForSearch } from '../saved/entries.ts';
import type { NoteRecord, SavedItemRecord } from '../store/types.ts';
import { THEME_PREFERENCES, type ThemePreference } from '../theme.ts';

export type PaletteGroup = 'go' | 'surahs' | 'sections' | 'saved' | 'settings' | 'search';

export type PaletteAction = { kind: 'href'; href: string } | { kind: 'theme'; value: ThemePreference } | { kind: 'locale'; value: 'ar' | 'en' };

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  detail?: string;
  action: PaletteAction;
}

export interface PaletteSection {
  key: string;
  href: string;
  label: string;
}

export interface PaletteContext {
  locale: 'ar' | 'en';
  nav: NavData | null;
  sections: readonly PaletteSection[];
  saved: readonly SavedItemRecord[];
  notes: readonly NoteRecord[];
  /** Translator: message key → text. */
  t: (key: string, values?: Record<string, string | number>) => string;
}

const MAX_PER_GROUP = 6;

const surahName = (ctx: PaletteContext, n: number) => {
  const s = ctx.nav?.surahs[n - 1];
  return s ? (ctx.locale === 'ar' ? s.name : s.transliteration) : String(n);
};

function targetHref(ctx: PaletteContext, type: string, ref: string): string | null {
  const nav = ctx.nav;
  if (!nav) return null;
  if (type === 'AYAH' || type === 'TAFSIR') {
    const parts = ref.split(':').map(Number);
    const [s, a] = type === 'TAFSIR' ? parts.slice(1) : parts;
    return s && a ? readerHref(nav, { surah: s, ayah: a }, 'reading') : null;
  }
  if (type === 'PAGE') return `/mushaf/page/${ref}`;
  if (type === 'SURAH') return nav.surahs[Number(ref) - 1] ? `/quran/${nav.surahs[Number(ref) - 1]!.slug}` : null;
  return null;
}

function targetLabel(ctx: PaletteContext, type: string, ref: string): string {
  if (type === 'AYAH') {
    const [s = 0, a = 0] = ref.split(':').map(Number);
    return ctx.t('ayah', { surah: surahName(ctx, s), ayah: a });
  }
  if (type === 'TAFSIR') {
    const [, s = 0, a = 0] = ref.split(':').map(Number);
    return ctx.t('tafsir', { surah: surahName(ctx, s), ayah: a });
  }
  if (type === 'PAGE') return ctx.t('page', { n: Number(ref) });
  if (type === 'SURAH') return ctx.t('surah', { name: surahName(ctx, Number(ref)) });
  return ref;
}

export function paletteItems(rawQuery: string, ctx: PaletteContext): PaletteItem[] {
  const query = rawQuery.trim();
  const folded = foldForSearch(query);
  const digits = toAsciiDigits(query);
  const items: PaletteItem[] = [];
  const nav = ctx.nav;

  // Direct jumps: ayah references, pages, juz.
  if (query && nav) {
    const ref = parseAyahRef(query, nav.surahs);
    if (ref?.ayah !== undefined) {
      const target = { surah: ref.surah, ayah: ref.ayah };
      items.push({
        id: `ayah:${ref.surah}:${ref.ayah}`,
        group: 'go',
        label: ctx.t('ayah', { surah: surahName(ctx, ref.surah), ayah: ref.ayah }),
        action: { kind: 'href', href: readerHref(nav, target, 'reading') },
      });
    }
    const page = /^(?:صفحة|الصفحة|ص|page|p)\s*(\d{1,3})$/iu.exec(digits);
    if (page && Number(page[1]) >= 1 && Number(page[1]) <= 604) {
      items.push({ id: `page:${page[1]}`, group: 'go', label: ctx.t('page', { n: Number(page[1]) }), action: { kind: 'href', href: `/mushaf/page/${Number(page[1])}` } });
    }
    const juz = /^(?:جزء|الجزء|juz|j)\s*(\d{1,2})$/iu.exec(digits);
    if (juz && Number(juz[1]) >= 1 && Number(juz[1]) <= 30) {
      items.push({ id: `juz:${juz[1]}`, group: 'go', label: ctx.t('juz', { n: Number(juz[1]) }), action: { kind: 'href', href: `/juz/${Number(juz[1])}` } });
    }
  }

  // Surahs (normalized Arabic, transliteration, English name or number).
  if (query && nav) {
    for (const s of nav.surahs.filter((s) => matchesSurah(query, s)).slice(0, MAX_PER_GROUP)) {
      items.push({
        id: `surah:${s.number}`,
        group: 'surahs',
        label: ctx.t('surah', { name: surahName(ctx, s.number) }),
        detail: String(s.number),
        action: { kind: 'href', href: `/quran/${s.slug}` },
      });
    }
  }

  // Sections of the app.
  for (const section of ctx.sections) {
    if (!folded || foldForSearch(section.label).includes(folded)) {
      items.push({ id: `section:${section.key}`, group: 'sections', label: section.label, action: { kind: 'href', href: section.href } });
    }
  }

  // Saved items and notes.
  if (query) {
    const noteByTarget = new Map(ctx.notes.map((n) => [`${n.targetType}|${n.targetRef}`, n]));
    const seen = new Set<string>();
    const add = (type: string, ref: string, note?: NoteRecord) => {
      const key = `${type}|${ref}`;
      if (seen.has(key)) return;
      const href = targetHref(ctx, type, ref);
      const label = targetLabel(ctx, type, ref);
      const text = foldForSearch(`${label} ${ref} ${note?.body ?? ''}`);
      if (!href || !folded.split(' ').every((w) => text.includes(w))) return;
      seen.add(key);
      items.push({ id: `saved:${key}`, group: 'saved', label, detail: note?.body.slice(0, 80), action: { kind: 'href', href } });
    };
    for (const s of ctx.saved) add(s.type, s.ref, noteByTarget.get(`${s.type}|${s.ref}`));
    for (const n of ctx.notes) add(n.targetType, n.targetRef, n);
  }

  // Settings: theme and language.
  for (const value of THEME_PREFERENCES) {
    const label = ctx.t('theme', { name: ctx.t(`themes.${value}`) });
    if (!folded || foldForSearch(label).includes(folded)) items.push({ id: `theme:${value}`, group: 'settings', label, action: { kind: 'theme', value } });
  }
  const other = ctx.locale === 'ar' ? 'en' : 'ar';
  const language = ctx.t('language', { name: ctx.t(`languages.${other}`) });
  if (!folded || foldForSearch(language).includes(folded)) items.push({ id: `locale:${other}`, group: 'settings', label: language, action: { kind: 'locale', value: other } });

  // Always offer a full Quran search for the query.
  if (query) {
    items.push({ id: 'search', group: 'search', label: ctx.t('searchQuran', { query }), action: { kind: 'href', href: `/search?q=${encodeURIComponent(query)}` } });
  }

  const perGroup = new Map<PaletteGroup, number>();
  return items.filter((i) => {
    const n = (perGroup.get(i.group) ?? 0) + 1;
    perGroup.set(i.group, n);
    return n <= MAX_PER_GROUP || i.group === 'sections';
  });
}
