'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { matchesSurah } from '@/lib/quran/filter';

export interface IndexSurah {
  number: number;
  name: string;
  transliteration: string;
  englishName: string;
  ayahCount: number;
  revelationType: 'Meccan' | 'Medinan';
  firstPage: number;
  href: string;
}

export interface IndexStart {
  number: number;
  href: string;
  surahName: string;
  ayah: number;
}

export interface IndexHizb {
  number: number;
  quarters: (IndexStart & { quarterInHizb: number })[];
}

const TABS = ['surah', 'juz', 'hizb', 'page'] as const;
type Tab = (typeof TABS)[number];

const row = 'flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 transition-colors hover:bg-surface-raised';

/** Surah list with instant filter, plus Juz / Hizb / Page tabs (SPEC §7.2). */
export function SurahIndex({
  surahs,
  juz,
  hizbs,
  pageCount,
}: {
  surahs: IndexSurah[];
  juz: IndexStart[];
  hizbs: IndexHizb[];
  pageCount: number;
}) {
  const t = useTranslations('Quran');
  const locale = useLocale();
  const id = useId();
  const [tab, setTab] = useState<Tab>('surah');
  const [query, setQuery] = useState('');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const filtered = useMemo(() => surahs.filter((s) => matchesSurah(query, s)), [surahs, query]);
  const num = new Intl.NumberFormat(locale);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    const delta = e.key === 'ArrowRight' ? dir : e.key === 'ArrowLeft' ? -dir : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + delta + TABS.length) % TABS.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-1 rounded-2xl bg-surface-raised p-1">
        {TABS.map((k) => (
          <button
            key={k}
            ref={(el) => {
              tabRefs.current[k] = el;
            }}
            role="tab"
            id={`${id}-tab-${k}`}
            aria-controls={`${id}-panel-${k}`}
            aria-selected={tab === k}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
            onKeyDown={onTabKey}
            className={`min-h-11 flex-1 rounded-xl text-sm transition-colors ${
              tab === k ? 'bg-surface font-semibold text-accent shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel-surah`} aria-labelledby={`${id}-tab-surah`} hidden={tab !== 'surah'}>
        <label htmlFor={`${id}-filter`} className="sr-only">
          {t('filterLabel')}
        </label>
        <div className="relative mb-4">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            id={`${id}-filter`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filterPlaceholder')}
            autoComplete="off"
            className="text-field w-full ps-10"
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {filtered.length === 0 ? t('noMatches') : num.format(filtered.length)}
        </p>
        {filtered.length === 0 ? (
          <p className="text-ink-muted">{t('noMatches')}</p>
        ) : (
          <ol className="grid gap-2 lg:grid-cols-2">
            {filtered.map((s) => (
              <li key={s.number}>
                <Link href={s.href} className={row} data-surah={s.number}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent tabular-nums">
                    {num.format(s.number)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {locale === 'ar' ? (
                      <span className="font-semibold">{s.name}</span>
                    ) : (
                      <span className="font-semibold">
                        {s.transliteration} <span className="font-normal text-ink-muted">· {s.englishName}</span>
                      </span>
                    )}
                    <span className="text-xs text-ink-muted">
                      {t(`revelation.${s.revelationType}`)} · {t('ayahCount', { count: s.ayahCount })} ·{' '}
                      {t('page', { n: s.firstPage })}
                    </span>
                  </span>
                  {locale !== 'ar' && (
                    <span lang="ar" dir="rtl" className="text-lg">
                      {s.name}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div role="tabpanel" id={`${id}-panel-juz`} aria-labelledby={`${id}-tab-juz`} hidden={tab !== 'juz'}>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {juz.map((j) => (
            <li key={j.number}>
              <Link href={j.href} className={row}>
                <span className="flex flex-col">
                  <span className="font-semibold">{t('juz', { n: j.number })}</span>
                  <span className="text-xs text-ink-muted">{t('startsAt', { surah: j.surahName, ayah: j.ayah })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <div role="tabpanel" id={`${id}-panel-hizb`} aria-labelledby={`${id}-tab-hizb`} hidden={tab !== 'hizb'}>
        <ol className="grid gap-3 lg:grid-cols-2">
          {hizbs.map((h) => (
            <li key={h.number} className="rounded-2xl border border-line bg-surface p-3">
              <h2 className="mb-2 px-1 text-sm font-semibold">{t('hizb', { n: h.number })}</h2>
              <ol className="grid grid-cols-2 gap-2">
                {h.quarters.map((q) => (
                  <li key={q.number}>
                    <Link
                      href={q.href}
                      className="flex min-h-11 flex-col justify-center rounded-xl px-3 py-1 text-xs transition-colors hover:bg-surface-raised"
                    >
                      <span className="font-semibold">{t('quarter', { n: q.quarterInHizb })}</span>
                      <span className="text-ink-muted">{t('startsAt', { surah: q.surahName, ayah: q.ayah })}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>

      <div role="tabpanel" id={`${id}-panel-page`} aria-labelledby={`${id}-tab-page`} hidden={tab !== 'page'}>
        <p className="mb-3 text-sm text-ink-muted">{t('pageCount', { count: pageCount })}</p>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <li key={p}>
              <Link
                href={`/mushaf/page/${p}`}
                aria-label={t('page', { n: p })}
                className="flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface text-sm tabular-nums transition-colors hover:bg-surface-raised"
              >
                {num.format(p)}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
