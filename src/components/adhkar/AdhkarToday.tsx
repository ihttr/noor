'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useStoreData } from '@/components/store/useStoreData';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/reader/ayah-share';
import type { LocalStore } from '@/lib/store';
import { loadPreferences } from '@/components/prefs/preferences';
import { localDate } from '@/lib/store/refs';
import type { AdhkarCategory } from '@/lib/adhkar/types';

const TABLES = ['adhkarDays'] as const;
const readToday = (store: LocalStore) => store.adhkar.list(localDate(Date.now()), localDate(Date.now()));

export interface CategoryInfo {
  id: string;
  /** dhikr id → target count; empty when no approved source covers the category. */
  targets: Record<string, number>;
}

/**
 * Categories with today's state (SPEC §7.1, §7.14). `highlight` marks a category the time of day
 * suggests (Phase 8: morning before Dhuhr, evening after Asr).
 */
export function AdhkarToday({ categories, followPrayerTimes = false }: { categories: readonly CategoryInfo[]; followPrayerTimes?: boolean }) {
  const t = useTranslations('Adhkar');
  const [highlight, setHighlight] = useState<string | null>(null);

  // SPEC §7.1: with prayer times configured, morning is highlighted before Dhuhr, evening after Asr.
  useEffect(() => {
    if (!followPrayerTimes) return;
    let stopped = false;
    void Promise.all([import('@/components/prayer/place'), import('@/lib/prayer/times')])
      .then(async ([placeModule, times]) => {
        const [place, prefs] = await Promise.all([placeModule.loadPlace(), loadPreferences()]);
        if (!place || stopped) return;
        const now = new Date();
        const settings = { ...times.DEFAULT_PRAYER_SETTINGS, ...prefs?.prayer };
        const day = times.prayerTimes(place, times.dateIn(place.timeZone, now), settings);
        setHighlight(now < day.dhuhr ? 'morning' : now >= day.asr ? 'evening' : null);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [followPrayerTimes]);
  const locale = useLocale();
  const n = (x: number) => formatNumber(x, locale === 'ar');
  const [state] = useStoreData(TABLES, readToday);
  const days = state.status === 'ready' ? state.data : [];

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {categories.map((c) => {
        const ids = Object.keys(c.targets);
        const record = days.find((d) => d.categoryId === c.id);
        const done = ids.filter((id) => (record?.counts[id] ?? 0) >= c.targets[id]!).length;
        const status = !ids.length
          ? t('noSourceShort')
          : record?.completed
            ? t('completedToday')
            : state.status === 'ready'
              ? t('progress', { done: n(done), total: n(ids.length) })
              : '…';
        const body = (
          <>
            <span className="font-semibold">{t(`categories.${c.id as AdhkarCategory}`)}</span>
            <span className="text-xs text-ink-muted">
              {status}
              {highlight === c.id && ` · ${t('suggestedNow')}`}
            </span>
          </>
        );
        const cls = `flex min-h-16 flex-col justify-center gap-1 rounded-2xl border px-4 py-2 ${
          highlight === c.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
        }`;
        return (
          <li key={c.id} data-category={c.id} data-completed={record?.completed || undefined}>
            {ids.length ? (
              <Link href={`/adhkar/${c.id}`} className={`${cls} transition-colors hover:bg-surface-raised`}>
                {body}
              </Link>
            ) : (
              <div className={`${cls} border-dashed`}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
