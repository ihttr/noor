'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { useStoreData } from '@/components/store/useStoreData';
import { getStore, type LocalStore } from '@/lib/store';
import { localDate } from '@/lib/store/refs';
import {
  addDays,
  firstDayOfWeek,
  GOAL_PRESETS,
  goalOn,
  heatmap,
  indexDays,
  monthStart,
  PAGES_PER_JUZ,
  pagesOn,
  period,
  streak,
  surahsCompleted,
  weekStart,
  type Period,
} from '@/lib/stats/stats';
import { GOAL_MAX_PAGES } from '@/lib/store/types';

const TABLES = ['readingDays', 'goals', 'savedItems', 'adhkarDays', 'memorizationItems'] as const;
async function readAll(store: LocalStore) {
  const [days, goals, saved, adhkar, memorization] = await Promise.all([
    store.readingDays.list(),
    store.goals.list(),
    store.saved.list(),
    store.adhkar.list(),
    store.memorization.list(),
  ]);
  return {
    days,
    goals,
    saved: saved.length,
    adhkarCompleted: adhkar.filter((d) => d.completed).length,
    memorized: memorization.filter((m) => m.status === 'MEMORIZED').length,
  };
}

const HEAT_WEEKS = 26;

/** Goals, consistency and statistics (SPEC §7.13). For self-improvement only. */
export function StatsView({ surahPages }: { surahPages: readonly (readonly [number, number])[] }) {
  const t = useTranslations('Stats');
  const format = useFormatter();
  const locale = useLocale();
  const id = useId();
  const [state, retry] = useStoreData(TABLES, readAll);
  const [showStreak, setShowStreak] = useState(true);
  const [custom, setCustom] = useState('');
  const [today] = useState(() => localDate(Date.now()));
  // The chosen goal shows at once; the store's value takes over when it changes.
  const [pending, setPending] = useState<{ amount: number; from: number } | null>(null);

  useEffect(() => {
    let stopped = false;
    void loadPreferences().then((p) => {
      if (!stopped && p.stats) setShowStreak(p.stats.showStreak);
    });
    return () => {
      stopped = true;
    };
  }, []);

  if (state.status === 'loading') return <div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" aria-busy="true" />;
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

  const { days: list, goals, saved, adhkarCompleted, memorized } = state.data;
  const days = indexDays(list);
  const firstDay = firstDayOfWeek(locale);
  const stored = goalOn(goals, today);
  const goal = pending && pending.from === stored ? pending.amount : stored;
  const periods: ['today' | 'week' | 'month', Period][] = [
    ['today', period(days, goals, today, today)],
    ['week', period(days, goals, weekStart(today, firstDay), today)],
    ['month', period(days, goals, monthStart(today), today)],
  ];
  const all = list.length ? period(days, goals, list[0]!.date, today) : null;
  const current = streak(days, today);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const maxBar = Math.max(1, goal, ...last7.map((d) => pagesOn(days, d)));
  const grid = heatmap(days, goals, today, HEAT_WEEKS, firstDay);
  const heatDays = grid.flat().filter((c) => c.pages > 0).length;
  const dayLabel = (date: string, style: 'short' | 'long' = 'short') =>
    format.dateTime(new Date(`${date}T12:00:00`), style === 'short' ? { weekday: 'short' } : { dateStyle: 'full' });
  const hours = Math.floor((all?.seconds ?? 0) / 3600);
  const minutes = Math.round(((all?.seconds ?? 0) % 3600) / 60);

  const setGoal = async (amount: number) => {
    setPending({ amount, from: stored });
    await (await getStore()).goals.set(amount, today);
  };
  const toggleStreak = (on: boolean) => {
    setShowStreak(on);
    persistPreferences({ stats: { showStreak: on } });
  };

  return (
    <div className="flex flex-col gap-6">
      <section id="goal" aria-labelledby={`${id}-goal`} className="flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-goal`} className="text-lg font-semibold">
          {t('goalTitle')}
        </h2>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">{t('goalTitle')}</legend>
          <div className="flex flex-wrap gap-2">
            <label className="choice-chip">
              <input type="radio" name="goal" checked={goal === 0} onChange={() => void setGoal(0)} className="accent-[var(--color-accent)]" />
              {t('noGoal')}
            </label>
            {GOAL_PRESETS.map((n) => (
              <label key={n} className="choice-chip">
                <input type="radio" name="goal" checked={goal === n} onChange={() => void setGoal(n)} className="accent-[var(--color-accent)]" />
                {t('pages', { n })}
              </label>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(custom);
              if (Number.isInteger(n) && n >= 1 && n <= GOAL_MAX_PAGES) void setGoal(n).then(() => setCustom(''));
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-custom`} className="text-sm font-semibold">
                {t('customGoal')}
              </label>
              <input
                id={`${id}-custom`}
                type="number"
                inputMode="numeric"
                min={1}
                max={GOAL_MAX_PAGES}
                className="text-field w-32"
                value={custom}
                placeholder={goal && !(GOAL_PRESETS as readonly number[]).includes(goal) ? String(goal) : ''}
                onChange={(e) => setCustom(e.currentTarget.value)}
              />
            </div>
            <button type="submit" className="secondary-button">
              {t('setGoal')}
            </button>
          </form>
        </fieldset>
        <p className="text-sm text-ink-muted">
          {goal ? t('goalNow', { n: goal }) : t('goalNone')} · {t('juzHint', { n: PAGES_PER_JUZ })}
        </p>
      </section>

      <section aria-labelledby={`${id}-progress`} className="flex flex-col gap-3">
        <h2 id={`${id}-progress`} className="text-lg font-semibold">
          {t('progressTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {periods.map(([key, p]) => (
            <li key={key} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4" data-period={key}>
              <span className="text-sm font-semibold text-accent">{t(`periods.${key}`)}</span>
              <span className="text-2xl font-semibold">{t('pages', { n: p.pages })}</span>
              {p.goal > 0 && (
                <>
                  <div
                    role="progressbar"
                    aria-label={t('goalProgress', { period: t(`periods.${key}`) })}
                    aria-valuemin={0}
                    aria-valuemax={p.goal}
                    aria-valuenow={Math.min(p.pages, p.goal)}
                    className="h-2 overflow-hidden rounded-full bg-surface-raised"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (p.pages / p.goal) * 100)}%` }} />
                  </div>
                  <span className="text-sm text-ink-muted">{t('ofGoal', { n: p.goal })}</span>
                </>
              )}
              {key !== 'today' && <span className="text-sm text-ink-muted">{t('daysRead', { n: p.daysRead, total: p.days })}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${id}-consistency`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-consistency`} className="text-lg font-semibold">
          {t('consistencyTitle')}
        </h2>
        {showStreak && (
          <p className="text-xl font-semibold" data-testid="streak">
            {current ? t('streak', { n: current }) : t('streakStart')}
          </p>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={showStreak} onChange={(e) => toggleStreak(e.currentTarget.checked)} className="size-5 accent-[var(--color-accent)]" />
          {t('showStreak')}
        </label>
      </section>

      <section aria-labelledby={`${id}-week`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-week`} className="text-lg font-semibold">
          {t('weekTitle')}
        </h2>
        <ol className="grid h-44 grid-cols-7 items-end gap-2" aria-label={t('weekTitle')}>
          {last7.map((d) => {
            const n = pagesOn(days, d);
            return (
              <li key={d} className="flex h-full flex-col items-center justify-end gap-1" aria-label={`${dayLabel(d, 'long')}: ${t('pages', { n })}`}>
                <span className="text-xs font-semibold" aria-hidden="true">
                  {format.number(n)}
                </span>
                <span
                  aria-hidden="true"
                  className={`w-full rounded-t-md ${d === today ? 'bg-accent' : 'bg-accent/60'}`}
                  style={{ height: `${Math.max(n ? 6 : 2, (n / maxBar) * 100)}%`, opacity: n ? 1 : 0.35 }}
                />
                <span className="text-xs text-ink-muted" aria-hidden="true">
                  {dayLabel(d)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby={`${id}-heat`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-heat`} className="text-lg font-semibold">
          {t('heatTitle')}
        </h2>
        <div
          role="img"
          aria-label={t('heatSummary', { n: heatDays, weeks: HEAT_WEEKS })}
          className="heatmap"
          style={{ gridTemplateColumns: `repeat(${HEAT_WEEKS}, minmax(0, 1fr))` }}
        >
          {grid.map((week, w) =>
            week.map((c, i) => (
              <span
                key={c.date}
                className="heat-cell"
                data-level={c.future ? undefined : c.level}
                title={c.future ? undefined : `${dayLabel(c.date, 'long')}: ${t('pages', { n: c.pages })}`}
                style={{ gridColumn: w + 1, gridRow: i + 1 }}
              />
            ))
          )}
        </div>
        <p className="flex items-center gap-1 text-xs text-ink-muted" aria-hidden="true">
          {t('less')}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="heat-cell inline-block size-3" data-level={l} />
          ))}
          {t('more')}
        </p>
      </section>

      <section aria-labelledby={`${id}-totals`} className="flex flex-col gap-3">
        <h2 id={`${id}-totals`} className="text-lg font-semibold">
          {t('totalsTitle')}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ['pagesRead', format.number(all?.pages ?? 0)],
              ['readingTime', t('duration', { h: hours, m: minutes })],
              ['surahsCompleted', format.number(surahsCompleted(list, surahPages))],
              ['itemsSaved', format.number(saved)],
              ['adhkarCompleted', format.number(adhkarCompleted)],
              ['ayahsMemorized', format.number(memorized)],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex flex-col-reverse gap-1 rounded-2xl border border-line bg-surface p-4" data-stat={key}>
              <dt className="text-sm text-ink-muted">{t(`totals.${key}`)}</dt>
              <dd className="text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-ink-muted">{t('private')}</p>
      </section>
    </div>
  );
}
