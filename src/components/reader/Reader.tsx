import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  BookOpenText,
  Bookmark,
  BookmarkCheck,
  Copy,
  Hash,
  Languages,
  List,
  Minus,
  NotebookPen,
  Play,
  Plus,
  ScrollText,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ComponentProps } from 'react';
import { getTafsirRegistry } from '@/lib/tafsir/content';
import { getTranslationRegistry } from '@/lib/translations/content';
import { ReaderShell, type ReaderIcons } from './ReaderShell';

const icon = 'size-5 shrink-0';

// Icons are rendered here, on the server, and passed to the client shell as SVG elements, so the
// reader ships no icon code (SPEC §11: ≤ 150 KB of JS on the reader route).
const ICONS: ReaderIcons = {
  list: <List aria-hidden="true" className={icon} strokeWidth={1.75} />,
  reading: <ScrollText aria-hidden="true" className={icon} strokeWidth={1.75} />,
  mushaf: <BookOpen aria-hidden="true" className={icon} strokeWidth={1.75} />,
  jump: <Hash aria-hidden="true" className={icon} strokeWidth={1.75} />,
  settings: <SlidersHorizontal aria-hidden="true" className={icon} strokeWidth={1.75} />,
  close: <X aria-hidden="true" className={icon} />,
  minus: <Minus aria-hidden="true" className={icon} />,
  plus: <Plus aria-hidden="true" className={icon} />,
  copy: <Copy aria-hidden="true" className={icon} strokeWidth={1.75} />,
  share: <Share2 aria-hidden="true" className={icon} strokeWidth={1.75} />,
  save: <Bookmark aria-hidden="true" className={icon} strokeWidth={1.75} />,
  saved: <BookmarkCheck aria-hidden="true" className={`${icon} text-accent`} strokeWidth={2} />,
  note: <NotebookPen aria-hidden="true" className={icon} strokeWidth={1.75} />,
  play: <Play aria-hidden="true" className={icon} strokeWidth={1.75} />,
  translation: <Languages aria-hidden="true" className={icon} strokeWidth={1.75} />,
  tafsir: <BookOpenText aria-hidden="true" className={icon} strokeWidth={1.75} />,
  // "Previous" points right and "next" left in a right-to-left flow (tafsir panel is Arabic).
  previous: <ChevronRight aria-hidden="true" className={icon} />,
  next: <ChevronLeft aria-hidden="true" className={icon} />,
};

export async function Reader(props: Omit<ComponentProps<typeof ReaderShell>, 'icons' | 'tafsirs' | 'translations'>) {
  const [{ tafsirs }, { translations }, locale, t] = await Promise.all([
    getTafsirRegistry(),
    getTranslationRegistry(),
    getLocale(),
    getTranslations('Reader'),
  ]);
  const translationChoices = translations.map((x) => ({
    id: x.id,
    name: x.name,
    language: x.language,
    direction: x.direction,
    credit: t('translationCredit', {
      translator: x.translator,
      source: [x.source.name, x.source.version ?? x.source.downloadedAt].filter(Boolean).join(' '),
    }),
  }));
  const choices = tafsirs.map((t) => ({
    id: t.id,
    name: locale === 'ar' ? t.source.name.ar : t.source.name.en,
    language: t.language,
    direction: t.direction,
  }));
  return <ReaderShell {...props} icons={ICONS} tafsirs={choices} translations={translationChoices} />;
}
