'use client';

import { useTranslations } from 'next-intl';
import { useStoreData } from '@/components/store/useStoreData';
import { Link } from '@/i18n/navigation';
import type { LocalStore } from '@/lib/store';
import { localDate } from '@/lib/store/refs';
import { goalOn } from '@/lib/stats/stats';

const TABLES = ['readingDays', 'goals'] as const;
async function readToday(store: LocalStore) {
  const today = localDate(Date.now());
  const [day, goals] = await Promise.all([store.readingDays.get(today), store.goals.list()]);
  return { pages: day?.pagesRead.length ?? 0, goal: goalOn(goals, today) };
}

/** Home "Daily progress" (SPEC §7.1): pages read today against the goal, as a calm bar. */
export function DailyProgress() {
  const t = useTranslations('Home');
  const [state] = useStoreData(TABLES, readToday);
  const frame = 'flex min-h-28 flex-col justify-center gap-3 rounded-2xl border border-line bg-surface p-5';

  if (state.status !== 'ready') {
    return (
      <section aria-busy={state.status === 'loading'} aria-label={t('dailyProgress')} className={frame}>
        <span className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
        <span className="h-2 w-full animate-pulse rounded bg-surface-raised" />
      </section>
    );
  }

  const { pages, goal } = state.data;
  return (
    <section aria-labelledby="daily-progress" className={frame} data-testid="daily-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-progress" className="text-sm font-semibold text-accent">
          {t('dailyProgress')}
        </h2>
        <Link href="/stats" className="text-sm text-accent underline underline-offset-2">
          {t('statistics')}
        </Link>
      </div>
      {goal > 0 ? (
        <>
          <p className="text-lg font-semibold">{t('pagesOfGoal', { n: pages, goal })}</p>
          <div
            role="progressbar"
            aria-label={t('dailyProgress')}
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(pages, goal)}
            className="h-2 overflow-hidden rounded-full bg-surface-raised"
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, (pages / goal) * 100)}%` }} />
          </div>
          {pages >= goal && <p className="text-sm text-ink-muted">{t('goalReached')}</p>}
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">{t('pagesToday', { n: pages })}</p>
          <Link href="/stats#goal" className="self-start text-sm text-accent underline underline-offset-2">
            {t('setGoal')}
          </Link>
        </>
      )}
    </section>
  );
}
