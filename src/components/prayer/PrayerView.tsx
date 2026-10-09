'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { loadPreferences, persistPreferences } from '@/components/prefs/preferences';
import type { Place } from '@/lib/cities/types';
import {
  DEFAULT_PRAYER_SETTINGS,
  METHODS,
  PRAYERS,
  dateIn,
  defaultMethod,
  nextPrayer,
  prayerTimes,
  type PrayerSettings,
} from '@/lib/prayer/times';
import { PlacePicker } from './PlacePicker';
import { loadPlace, savePlace } from './place';

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Prayer times (SPEC §7.16) for a chosen place, in the place's time zone, with a live countdown. */
export function PrayerView() {
  const t = useTranslations('Prayer');
  const locale = useLocale();
  const id = useId();
  const [place, setPlace] = useState<Place | null | undefined>(undefined);
  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_PRAYER_SETTINGS);
  const [changing, setChanging] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    let stopped = false;
    Promise.all([loadPlace(), loadPreferences()]).then(([p, prefs]) => {
      if (stopped) return;
      setPlace(p);
      if (prefs?.prayer) setSettings({ ...DEFAULT_PRAYER_SETTINGS, ...prefs.prayer });
    });
    return () => {
      stopped = true;
    };
  }, []);

  function update(next: PrayerSettings) {
    setSettings(next);
    persistPreferences({ prayer: next });
  }

  function pick(p: Place) {
    setPlace(p);
    setChanging(false);
    void savePlace(p).catch(() => undefined);
  }

  if (place === undefined) return <div aria-busy="true" className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />;

  if (!place || changing) {
    return (
      <section aria-labelledby={`${id}-choose`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 id={`${id}-choose`} className="text-lg font-semibold">
          {t('choosePlace')}
        </h2>
        <PlacePicker onPick={pick} autoFocus={changing} />
        {changing && (
          <button type="button" className="secondary-button self-start" onClick={() => setChanging(false)}>
            {t('cancel')}
          </button>
        )}
      </section>
    );
  }

  const day = dateIn(place.timeZone, now);
  const times = prayerTimes(place, day, settings);
  const next = nextPrayer(place, now, settings);
  const fmt = new Intl.DateTimeFormat(locale, { timeZone: place.timeZone, hour: 'numeric', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat(locale, { timeZone: place.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hijriFmt = new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const left = Math.max(0, Math.round((next.time.getTime() - now.getTime()) / 1000));
  const hms = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map((x) => String(x).padStart(2, '0')).join(':');
  const country = place.country ? new Intl.DisplayNames([locale], { type: 'region' }).of(place.country) : null;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={`${id}-place`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <h2 id={`${id}-place`} className="text-lg font-semibold">
            <span lang={place.id === null ? undefined : 'en'}>{place.name}</span>
          </h2>
          <p className="text-sm text-ink-muted">{[place.region, country, place.timeZone].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-ink-muted">
            {dateFmt.format(now)} · {hijriFmt.format(new Date(Date.UTC(day.year, day.month - 1, day.day, 12)))}
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setChanging(true)}>
          {t('changePlace')}
        </button>
      </section>

      <section aria-labelledby={`${id}-next`} className="rounded-2xl border border-accent bg-accent-soft p-5" data-testid="next-prayer">
        <h2 id={`${id}-next`} className="text-sm font-semibold text-accent">
          {t('nextPrayer')}
        </h2>
        <p className="mt-1 text-2xl font-semibold">
          {t(`names.${next.prayer}`)} · {fmt.format(next.time)}
        </p>
        <p className="mt-1 text-lg tabular-nums">
          <span className="sr-only">{t('remaining', { time: hms })}</span>
          <span aria-hidden="true" dir="ltr" data-testid="countdown">
            {hms}
          </span>
        </p>
      </section>

      <table className="w-full overflow-hidden rounded-2xl border border-line bg-surface text-start">
        <caption className="sr-only">{t('tableCaption', { place: place.name })}</caption>
        <tbody>
          {PRAYERS.map((p) => (
            <tr key={p} className="border-b border-line last:border-0" data-current={next.prayer === p || undefined}>
              <th scope="row" className="px-4 py-3 text-start font-semibold">
                {t(`names.${p}`)}
              </th>
              <td className="px-4 py-3 text-end tabular-nums" data-prayer={p}>
                {fmt.format(times[p])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">{t('settings')}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('method')}
            <select
              className="text-field font-normal"
              value={settings.method}
              onChange={(e) => update({ ...settings, method: e.target.value as PrayerSettings['method'] })}
            >
              <option value="auto">{t('methodAuto', { method: t(`methods.${defaultMethod(place.country)}`) })}</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 font-semibold">{t('madhab')}</legend>
            <div className="flex gap-2">
              {(['shafi', 'hanafi'] as const).map((m) => (
                <label key={m} className="choice-chip">
                  <input type="radio" name="madhab" className="sr-only" checked={settings.madhab === m} onChange={() => update({ ...settings, madhab: m })} />
                  {t(`madhabs.${m}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('highLatitude')}
            <select
              className="text-field font-normal"
              value={settings.highLatitude}
              onChange={(e) => update({ ...settings, highLatitude: e.target.value as PrayerSettings['highLatitude'] })}
            >
              {(['auto', 'middle', 'seventh', 'twilight'] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`highLatitudes.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm sm:col-span-2">
            <legend className="mb-1 font-semibold">{t('adjustments')}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRAYERS.map((p) => (
                <label key={p} className="flex items-center justify-between gap-2">
                  <span>{t(`names.${p}`)}</span>
                  <input
                    type="number"
                    min={-30}
                    max={30}
                    className="text-field w-20"
                    value={settings.adjustments[p]}
                    onChange={(e) => {
                      const v = Math.max(-30, Math.min(30, Math.round(Number(e.target.value) || 0)));
                      update({ ...settings, adjustments: { ...settings.adjustments, [p]: v } });
                    }}
                    aria-label={t('adjustmentFor', { prayer: t(`names.${p}`) })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <p className="mt-4 text-xs text-ink-muted">{t('methodNote')}</p>
      </details>

      <p className="text-xs text-ink-muted">{t('privacy')}</p>
    </div>
  );
}
