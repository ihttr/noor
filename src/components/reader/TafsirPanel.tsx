'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { loadSurahFile, loadTafsirSurah } from '@/lib/quran/client';
import { formatNumber, usesArabicDigits } from '@/lib/reader/ayah-share';
import { getStore } from '@/lib/store';
import type { SurahFile } from '@/lib/quran/types';
import type { TafsirSurahFile } from '@/lib/tafsir/types';
import type { AyahTarget } from './AyahMenu';
import { getReaderSettings } from './settings-store';

export interface TafsirChoice {
  id: string;
  /** Display name in the UI language. */
  name: string;
  language: string;
  direction: 'rtl' | 'ltr';
}

interface Icons {
  close: ReactNode;
  save: ReactNode;
  saved: ReactNode;
  previous: ReactNode;
  next: ReactNode;
}

type Loaded = { status: 'loading' } | { status: 'error' } | { status: 'ready'; tafsir: TafsirSurahFile; quran: SurahFile };

const LAST_KEY = 'noor:tafsir';

/**
 * Tafsir for an ayah (SPEC §7.10): a side panel on wide screens, a sheet on phones. The text is
 * shown exactly as imported, always with the tafsir's name, author and distribution (SPEC §2.8).
 */
export default function TafsirPanel({
  target,
  surahName,
  tafsirs,
  icons,
  onClose,
}: {
  target: AyahTarget;
  surahName: string;
  tafsirs: readonly TafsirChoice[];
  icons: Icons;
  onClose: () => void;
}) {
  const t = useTranslations('Tafsir');
  const locale = useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState(() => {
    try {
      const last = localStorage.getItem(LAST_KEY);
      if (last && tafsirs.some((x) => x.id === last)) return last;
    } catch {
      // ignore
    }
    return tafsirs[0]!.id;
  });
  const [ayah, setAyah] = useState(target.ayah);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Loaded>({ status: 'loading' });
  const [saved, setSaved] = useState<boolean | null>(null);
  const ref = `${id}:${target.surah}:${ayah}`;
  const digits = usesArabicDigits(getReaderSettings().numerals, locale);

  useLayoutEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let stopped = false;
    Promise.all([loadTafsirSurah(id, target.surah), loadSurahFile(target.surah)]).then(
      ([tafsir, quran]) => !stopped && setData({ status: 'ready', tafsir, quran }),
      () => !stopped && setData({ status: 'error' })
    );
    return () => {
      stopped = true;
    };
  }, [id, target.surah, attempt]);

  useEffect(() => {
    let stopped = false;
    let off: (() => void) | undefined;
    getStore()
      .then(async (store) => {
        const check = async () => {
          const item = await store.saved.find('TAFSIR', ref);
          if (!stopped) setSaved(!!item);
        };
        off = store.subscribe(['savedItems'], () => void check());
        await check();
      })
      .catch(() => !stopped && setSaved(null));
    return () => {
      stopped = true;
      off?.();
    };
  }, [ref]);

  async function toggleSave() {
    const store = await getStore();
    const item = await store.saved.find('TAFSIR', ref);
    if (item) await store.saved.remove(item.id);
    else await store.saved.save('TAFSIR', ref);
  }

  function choose(next: string) {
    setId(next);
    setData({ status: 'loading' });
    try {
      localStorage.setItem(LAST_KEY, next);
    } catch {
      // ignore
    }
  }

  const ready = data.status === 'ready' ? data : undefined;
  const entry = ready?.tafsir.entries.find((e) => e.ayah === ayah);
  const ayahText = ready?.quran.ayahs.find((a) => a.number === ayah)?.text;
  const count = ready?.quran.ayahs.length ?? target.ayah;
  const source = ready?.tafsir.source;
  const choice = tafsirs.find((x) => x.id === id);
  const n = (x: number) => formatNumber(x, digits);

  return (
    <dialog
      ref={dialogRef}
      className="tafsir-panel"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {t('title', { surah: surahName, ayah: n(ayah) })}
        </h2>
        <button type="button" className="icon-button" aria-label={t('close')} onClick={() => dialogRef.current?.close()}>
          {icons.close}
        </button>
      </div>

      {tafsirs.length > 1 && (
        <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
          {t('choose')}
          <select className="text-field font-normal" value={id} onChange={(e) => choose(e.target.value)}>
            {tafsirs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {data.status === 'loading' && (
        <div aria-busy="true" className="mt-4 flex flex-col gap-3">
          <span className="h-16 animate-pulse rounded-xl bg-surface-raised" />
          <span className="h-40 animate-pulse rounded-xl bg-surface-raised" />
        </div>
      )}

      {data.status === 'error' && (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">{t('loadError')}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setData({ status: 'loading' });
              setAttempt((a) => a + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}

      {ready && entry && source && (
        <>
          {ayahText && (
            <p lang="ar" dir="rtl" className="tafsir-ayah mt-4">
              <span data-ayah-text={`${target.surah}:${ayah}`}>{ayahText}</span>
            </p>
          )}
          <section aria-labelledby={`${titleId}-source`} className="mt-4">
            <h3 id={`${titleId}-source`} className="text-sm font-semibold text-accent">
              {locale === 'ar' ? source.name.ar : source.name.en}
            </h3>
            <p lang={choice?.language} dir={choice?.direction} className="tafsir-text mt-2" data-tafsir-text={ref}>
              {entry.text}
            </p>
            {entry.footnotes && (
              <p lang={choice?.language} dir={choice?.direction} className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">
                {entry.footnotes}
              </p>
            )}
            <p className="mt-4 text-xs text-ink-muted">
              {t('attribution', {
                name: locale === 'ar' ? source.name.ar : source.name.en,
                author: locale === 'ar' ? source.author.ar : source.author.en,
              })}{' '}
              ·{' '}
              <a href={source.distribution.url} className="underline underline-offset-2" rel="noopener" target="_blank">
                {source.distribution.name}
              </a>{' '}
              · {source.version ? t('version', { version: source.version }) : t('downloaded', { date: new Date(`${source.downloadedAt}T12:00:00Z`) })}
            </p>
          </section>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="secondary-button inline-flex items-center gap-1" disabled={ayah <= 1} onClick={() => setAyah(ayah - 1)}>
          {locale === 'ar' ? icons.previous : icons.next}
          {t('previousAyah')}
        </button>
        <button type="button" className="secondary-button inline-flex items-center gap-1" disabled={ayah >= count} onClick={() => setAyah(ayah + 1)}>
          {t('nextAyah')}
          {locale === 'ar' ? icons.next : icons.previous}
        </button>
        <button
          type="button"
          className="secondary-button ms-auto inline-flex items-center gap-2"
          aria-pressed={saved === true}
          disabled={saved === null}
          onClick={() => void toggleSave()}
        >
          {saved ? icons.saved : icons.save}
          {saved ? t('saved') : t('save')}
        </button>
      </div>
    </dialog>
  );
}
