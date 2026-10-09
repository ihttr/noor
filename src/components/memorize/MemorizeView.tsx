'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { useStoreData } from '@/components/store/useStoreData';
import type { MaskMode } from '@/lib/memorize/mask';
import { isDue, type Grade } from '@/lib/memorize/srs';
import { getStore, type LocalStore } from '@/lib/store';
import type { MemorizationItemRecord } from '@/lib/store/types';
import { PracticeSession, type PracticeItem } from './PracticeSession';

export interface MemorizeSurah {
  name: string;
  ayahCount: number;
}

const TABLES = ['memorizationItems'] as const;
const readItems = (store: LocalStore) => store.memorization.list();
const now = () => Date.now();

/** Consecutive ayah ranges, e.g. [1, 2, 3, 7] → "1–3, 7". */
function ranges(ayahs: readonly number[], fmt: (n: number) => string): string {
  const out: string[] = [];
  for (let i = 0; i < ayahs.length; i++) {
    const start = ayahs[i]!;
    while (i + 1 < ayahs.length && ayahs[i + 1] === ayahs[i]! + 1) i++;
    out.push(start === ayahs[i] ? fmt(start) : `${fmt(start)}–${fmt(ayahs[i]!)}`);
  }
  return out.join('، ');
}

/** Memorization (SPEC §7.12): choose ayahs, practice with masks, review what is due. */
export function MemorizeView({ surahs }: { surahs: readonly MemorizeSurah[] }) {
  const t = useTranslations('Memorize');
  const format = useFormatter();
  const id = useId();
  const [state, retry] = useStoreData(TABLES, readItems);
  const [mode, setMode] = useState<MaskMode>('first');
  const [session, setSession] = useState<{ items: PracticeItem[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [surah, setSurah] = useState(67);
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 1, to: surahs[66]?.ayahCount ?? 1 });

  useEffect(() => {
    let stopped = false;
    void loadPreferences().then((p) => {
      if (!stopped && p?.memorize?.mask) setMode(p.memorize.mask);
    });
    return () => {
      stopped = true;
    };
  }, []);

  const changeMode = (m: MaskMode) => {
    setMode(m);
    persistPreferences({ memorize: { mask: m } });
  };

  const names = surahs.map((s) => s.name);
  const fmt = (n: number) => format.number(n);

  if (state.status === 'loading') return <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" aria-busy="true" />;
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5">
        <p className="text-ink-muted">{t('storeError')}</p>
        <button type="button" className="secondary-button" onClick={retry}>
          {t('retry')}
        </button>
      </div>
    );
  }

  const items = state.data;
  if (session) {
    return (
      <PracticeSession
        items={session.items}
        surahNames={names}
        mode={mode}
        onMode={changeMode}
        onGrade={async (item: PracticeItem, grade: Grade) => {
          await (await getStore()).memorization.review(item.surah, item.ayah, grade);
        }}
        onEnd={() => setSession(null)}
      />
    );
  }

  const time = now();
  const due = items.filter((i) => isDue(i, time));
  const bySurah = new Map<number, MemorizationItemRecord[]>();
  for (const item of items) bySurah.set(item.surah, [...(bySurah.get(item.surah) ?? []), item]);
  const toPractice = (list: readonly MemorizationItemRecord[]) => list.map(({ surah: s, ayah }) => ({ surah: s, ayah }));
  const max = surahs[surah - 1]?.ayahCount ?? 1;

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const from = Math.max(1, Math.min(range.from, max));
    const to = Math.max(from, Math.min(range.to, max));
    const added = await (await getStore()).memorization.add(
      surah,
      Array.from({ length: to - from + 1 }, (_, i) => from + i)
    );
    setMessage(added ? t('added', { n: added, surah: names[surah - 1] ?? '' }) : t('alreadyAdded'));
  }

  async function remove(s: number) {
    if (!window.confirm(t('removeConfirm', { surah: names[s - 1] ?? '' }))) return;
    await (await getStore()).memorization.remove(s);
    setMessage(t('removed', { surah: names[s - 1] ?? '' }));
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="due-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id="due-title" className="text-lg font-semibold">
          {t('dueTitle')}
        </h2>
        {due.length ? (
          <>
            <p>{t('dueCount', { n: due.length })}</p>
            <ul className="flex flex-col gap-1 text-sm text-ink-muted">
              {[...new Set(due.map((d) => d.surah))].map((s) => (
                <li key={s}>
                  {names[s - 1]}: {ranges(due.filter((d) => d.surah === s).map((d) => d.ayah), fmt)}
                </li>
              ))}
            </ul>
            <button type="button" className="primary-button self-start" onClick={() => setSession({ items: toPractice(due) })}>
              {t('startReview')}
            </button>
          </>
        ) : (
          <p className="text-ink-muted">{items.length ? t('nothingDue') : t('empty')}</p>
        )}
      </section>

      <section aria-labelledby="add-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id="add-title" className="text-lg font-semibold">
          {t('addTitle')}
        </h2>
        <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-surah`} className="text-sm font-semibold">
              {t('surah')}
            </label>
            <select
              id={`${id}-surah`}
              className="text-field w-full min-w-0"
              value={surah}
              onChange={(e) => {
                const s = Number(e.currentTarget.value);
                setSurah(s);
                setRange({ from: 1, to: surahs[s - 1]?.ayahCount ?? 1 });
              }}
            >
              {surahs.map((s, i) => (
                <option key={i} value={i + 1}>
                  {fmt(i + 1)}. {s.name}
                </option>
              ))}
            </select>
          </div>
          {(['from', 'to'] as const).map((k) => (
            <div key={k} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${id}-${k}`} className="text-sm font-semibold">
                {t(k)}
              </label>
              <input
                id={`${id}-${k}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                required
                className="text-field w-full min-w-0"
                value={range[k]}
                onChange={(e) => {
                  const value = Number(e.currentTarget.value);
                  setRange((r) => ({ ...r, [k]: value }));
                }}
              />
            </div>
          ))}
          <button type="submit" className="primary-button">
            {t('add')}
          </button>
        </form>
        <p className="text-xs text-ink-muted">{t('ayahCount', { n: max })}</p>
        <p role="status" className="min-h-5 text-sm font-semibold text-accent">
          {message}
        </p>
      </section>

      {bySurah.size > 0 && (
        <section aria-labelledby="progress-title" className="flex flex-col gap-3">
          <h2 id="progress-title" className="text-lg font-semibold">
            {t('progressTitle')}
          </h2>
          <ul className="flex flex-col gap-3">
            {[...bySurah].map(([s, list]) => {
              const total = surahs[s - 1]?.ayahCount ?? list.length;
              const memorized = list.filter((x) => x.status === 'MEMORIZED').length;
              const dueHere = list.filter((x) => isDue(x, time)).length;
              return (
                <li key={s} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                  <p className="font-semibold">
                    {t('surahProgress', { surah: names[s - 1] ?? '', done: memorized, total, percent: memorized / total })}
                  </p>
                  <div
                    role="progressbar"
                    aria-label={t('memorizedOf', { surah: names[s - 1] ?? '' })}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={memorized}
                    className="h-2 overflow-hidden rounded-full bg-surface-raised"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(memorized / total) * 100}%` }} />
                  </div>
                  <p className="text-sm text-ink-muted">
                    {t('inPractice', { ayahs: ranges(list.map((x) => x.ayah), fmt), n: list.length })}
                    {dueHere > 0 && ` · ${t('dueHere', { n: dueHere })}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-button" onClick={() => setSession({ items: toPractice(list) })}>
                      {t('practice')}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void remove(s)}>
                      {t('remove')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-xs text-ink-muted">{t('rule')}</p>
    </div>
  );
}
