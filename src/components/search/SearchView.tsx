'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { loadSurahFile } from '@/lib/quran/client';
import { highlightPieces } from '@/lib/search/highlight';
import { SEARCH_MODES, type SearchHit, type SearchMode } from '@/lib/search/quran-search';
import { searchInWorker } from './search-client';

const PAGE = 20;

export interface SearchSurah {
  name: string;
  slug: string;
}

type Result =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; total: number; hits: SearchHit[]; query: string };

const toInt = (v: string | null, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
};

/** Uthmani text of a hit with the matched words marked; the text itself is never changed. */
function HitText({ hit }: { hit: SearchHit }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let stopped = false;
    loadSurahFile(hit.surah).then(
      (file) => !stopped && setText(file.ayahs.find((a) => a.number === hit.ayah)?.text ?? null),
      () => !stopped && setText(null)
    );
    return () => {
      stopped = true;
    };
  }, [hit.surah, hit.ayah]);
  if (text === undefined) return <span aria-hidden="true" className="block h-12 animate-pulse rounded-xl bg-surface-raised" />;
  if (text === null) return null;
  const { pieces } = highlightPieces(text, hit.words, hit.wordCount);
  return (
    <p lang="ar" dir="rtl" className="search-ayah">
      <span data-search-text={hit.key}>
        {pieces.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : p.text))}
      </span>
    </p>
  );
}

/** Quran search page (SPEC §7.8): normalized query, three modes, surah and juz filters. */
export function SearchView({ surahs }: { surahs: readonly SearchSurah[] }) {
  const t = useTranslations('Search');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState<SearchMode>(() => {
    const m = params.get('mode');
    return (SEARCH_MODES as readonly string[]).includes(m ?? '') ? (m as SearchMode) : 'phrase';
  });
  const [surah, setSurah] = useState(toInt(params.get('surah'), 114));
  const [juz, setJuz] = useState(toInt(params.get('juz'), 30));
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<Result>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  // Search (debounced) and keep the URL shareable.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => {
      const next = new URLSearchParams();
      if (q) next.set('q', q);
      if (mode !== 'phrase') next.set('mode', mode);
      if (surah) next.set('surah', String(surah));
      if (juz) next.set('juz', String(juz));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      if (!q) return setResult({ status: 'idle' });
      setResult((r) => (r.status === 'ready' ? r : { status: 'loading' }));
      void searchInWorker({ query: q, mode, surah, juz, limit }).then((r) =>
        setResult(r.ok ? { status: 'ready', total: r.total, hits: r.hits, query: r.query } : { status: 'error' })
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [query, mode, surah, juz, limit, attempt, router, pathname]);

  const juzOptions = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);

  return (
    <div className="flex flex-col gap-4">
      <form role="search" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-1">
          <label htmlFor="quran-search" className="text-sm font-semibold">
            {t('label')}
          </label>
          <input
            id="quran-search"
            type="search"
            className="text-field text-lg"
            placeholder={t('placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            autoComplete="off"
            autoFocus
            aria-describedby="search-hint"
          />
          <p id="search-hint" className="text-xs text-ink-muted">
            {t('hint')}
          </p>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('mode')}</legend>
          <div className="flex flex-wrap gap-2">
            {SEARCH_MODES.map((m) => (
              <label key={m} className="choice-chip">
                <input
                  type="radio"
                  name="search-mode"
                  className="sr-only"
                  checked={mode === m}
                  onChange={() => {
                    setMode(m);
                    setLimit(PAGE);
                  }}
                />
                {t(`modes.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="search-surah" className="text-sm font-semibold">
              {t('surahFilter')}
            </label>
            <select
              id="search-surah"
              className="text-field"
              value={surah ?? ''}
              onChange={(e) => {
                setSurah(toInt(e.target.value, 114));
                setLimit(PAGE);
              }}
            >
              <option value="">{t('allSurahs')}</option>
              {surahs.map((s, i) => (
                <option key={s.slug} value={i + 1}>
                  {i + 1}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="search-juz" className="text-sm font-semibold">
              {t('juzFilter')}
            </label>
            <select
              id="search-juz"
              className="text-field"
              value={juz ?? ''}
              onChange={(e) => {
                setJuz(toInt(e.target.value, 30));
                setLimit(PAGE);
              }}
            >
              <option value="">{t('allJuz')}</option>
              {juzOptions.map((n) => (
                <option key={n} value={n}>
                  {t('juz', { n })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      <div role="status" aria-live="polite" className="min-h-6 text-sm text-ink-muted">
        {result.status === 'loading' && t('loading')}
        {result.status === 'ready' && t('count', { count: result.total })}
      </div>

      {result.status === 'error' && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-muted">{t('error')}</p>
          <button type="button" className="secondary-button" onClick={() => setAttempt((a) => a + 1)}>
            {t('retry')}
          </button>
        </div>
      )}

      {result.status === 'idle' && <p className="rounded-2xl border border-dashed border-line bg-surface p-5 text-sm text-ink-muted">{t('idle')}</p>}

      {result.status === 'ready' && result.total === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-5 text-sm text-ink-muted">{t('none')}</p>
      )}

      {result.status === 'ready' && result.hits.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label={t('results')}>
          {result.hits.map((hit) => {
            const s = surahs[hit.surah - 1];
            return (
              <li key={hit.key} className="rounded-2xl border border-line bg-surface p-4">
                <Link href={`/quran/${s?.slug ?? ''}#ayah-${hit.surah}-${hit.ayah}`} className="font-semibold underline-offset-4 hover:underline">
                  {t('hitTitle', { surah: s?.name ?? hit.surah, ayah: hit.ayah })}
                </Link>
                <HitText hit={hit} />
              </li>
            );
          })}
        </ol>
      )}

      {result.status === 'ready' && result.hits.length < result.total && (
        <button type="button" className="secondary-button self-center" onClick={() => setLimit((l) => l + PAGE)}>
          {t('more', { shown: result.hits.length, total: result.total })}
        </button>
      )}
    </div>
  );
}
