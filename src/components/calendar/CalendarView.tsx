'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import { addDays, civilDay, hijriMonthDays, nextMonth, toHijri, today as civilToday, upcomingEvents } from '@/lib/hijri/calendar';

/**
 * Hijri calendar (SPEC §7.18): today in both calendars, a month grid with both, the user's ±2-day
 * adjustment, and the important dates — always labelled as expected (moon sighting).
 */
export function CalendarView({ icons }: { icons: { previous: ReactNode; next: ReactNode } }) {
  const t = useTranslations('Calendar');
  const locale = useLocale();
  const id = useId();
  const [adjust, setAdjust] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [shown, setShown] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    let stopped = false;
    void loadPreferences().then((p) => {
        if (stopped) return;
        const a = Number(p?.hijriAdjust ?? 0);
        const d = civilToday();
        setAdjust(a);
        setNow(d);
        const h = toHijri(d, a);
        setShown({ year: h.year, month: h.month });
      });
    return () => {
      stopped = true;
    };
  }, []);

  if (!now || !shown) return <div aria-busy="true" className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />;

  const digits = (n: number) => n.toLocaleString(locale === 'ar' ? 'ar-u-nu-arab' : 'en', { useGrouping: false });
  const hijriFmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, { ...opts, timeZone: 'UTC' }).format(addDays(d, adjust));
  const gregFmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(d);
  const todayHijri = toHijri(now, adjust);
  const days = hijriMonthDays(shown.year, shown.month, adjust, now);
  const first = days[0];
  // Week starts on Saturday in the Arabic UI, Sunday in English.
  const weekStart = locale === 'ar' ? 6 : 0;
  const lead = first ? (first.civil.getUTCDay() - weekStart + 7) % 7 : 0;
  const weekdays = Array.from({ length: 7 }, (_, i) => gregFmt(civilDay(2026, 1, 4 + ((weekStart + i) % 7)), { weekday: 'short' }));
  const events = upcomingEvents(now, adjust);

  function changeAdjust(value: number) {
    setAdjust(value);
    persistPreferences({ hijriAdjust: value });
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={`${id}-today`} className="rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-today`} className="text-sm font-semibold text-accent">
          {t('today')}
        </h2>
        <p className="mt-1 text-2xl font-semibold" data-testid="hijri-today">
          {hijriFmt(now, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <p className="text-ink-muted">{gregFmt(now, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </section>

      <section aria-labelledby={`${id}-month`} className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" className="icon-button" aria-label={t('previousMonth')} onClick={() => setShown(nextMonth(shown.year, shown.month, -1))}>
            {icons.previous}
          </button>
          <h2 id={`${id}-month`} className="text-center font-semibold" aria-live="polite">
            {first ? hijriFmt(first.civil, { month: 'long', year: 'numeric' }) : ''}
            {first && (
              <span className="block text-xs font-normal text-ink-muted">
                {gregFmt(first.civil, { month: 'short', year: 'numeric' })} – {gregFmt(days.at(-1)!.civil, { month: 'short', year: 'numeric' })}
              </span>
            )}
          </h2>
          <button type="button" className="icon-button" aria-label={t('nextMonth')} onClick={() => setShown(nextMonth(shown.year, shown.month, 1))}>
            {icons.next}
          </button>
        </div>
        <table className="w-full table-fixed text-center">
          <caption className="sr-only">{t('gridCaption')}</caption>
          <thead>
            <tr>
              {weekdays.map((w) => (
                <th key={w} scope="col" className="pb-2 text-xs font-semibold text-ink-muted">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil((lead + days.length) / 7) }, (_, week) => (
              <tr key={week}>
                {Array.from({ length: 7 }, (_, col) => {
                  const d = days[week * 7 + col - lead];
                  if (!d) return <td key={col} />;
                  const isToday = d.hijri.day === todayHijri.day && d.hijri.month === todayHijri.month && d.hijri.year === todayHijri.year;
                  return (
                    <td key={col} className="p-0.5">
                      <div
                        className={`flex min-h-12 flex-col items-center justify-center rounded-lg ${isToday ? 'bg-accent text-on-accent' : ''}`}
                        aria-current={isToday ? 'date' : undefined}
                      >
                        <span className="sr-only">{`${hijriFmt(d.civil, { day: 'numeric', month: 'long' })} — ${gregFmt(d.civil, { day: 'numeric', month: 'long' })}`}</span>
                        <span className="font-semibold" aria-hidden="true">
                          {digits(d.hijri.day)}
                        </span>
                        <span className={`text-[0.65rem] ${isToday ? '' : 'text-ink-muted'}`} aria-hidden="true">
                          {gregFmt(d.civil, { day: 'numeric' })}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby={`${id}-events`} className="flex flex-col gap-2">
        <h2 id={`${id}-events`} className="text-lg font-semibold">
          {t('events')}
        </h2>
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3" data-event={e.id}>
              <span className="font-semibold">{t(`eventNames.${e.id}`)}</span>
              <span className="text-sm">
                {hijriFmt(e.civil, { day: 'numeric', month: 'long', year: 'numeric' })} · {gregFmt(e.civil, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="w-full text-xs text-ink-muted">{t('expected')}</span>
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="rounded-2xl border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">{t('adjustment')}</legend>
        <div className="flex flex-wrap gap-2">
          {[-2, -1, 0, 1, 2].map((v) => (
            <label key={v} className="choice-chip">
              <input type="radio" name="hijri-adjust" className="sr-only" checked={adjust === v} onChange={() => changeAdjust(v)} />
              <span dir="ltr">{v > 0 ? `+${digits(v)}` : v < 0 ? `−${digits(-v)}` : digits(0)}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">{t('adjustmentHint')}</p>
      </fieldset>
    </div>
  );
}
