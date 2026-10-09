// Prayer times and qibla (SPEC §7.16–7.17) with adhan-js (MIT). Settings map to adhan's
// calculation parameters; the method defaults by country and can be changed by the user.

import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes, Qibla, type CalculationParameters } from 'adhan';

export const METHODS = [
  'MuslimWorldLeague',
  'UmmAlQura',
  'Egyptian',
  'Karachi',
  'Dubai',
  'Kuwait',
  'Qatar',
  'Singapore',
  'Turkey',
  'Tehran',
  'NorthAmerica',
  'MoonsightingCommittee',
] as const;
export type MethodKey = (typeof METHODS)[number];

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerKey = (typeof PRAYERS)[number];

export interface PrayerSettings {
  /** 'auto' = the default for the place's country. */
  method: MethodKey | 'auto';
  madhab: 'shafi' | 'hanafi';
  highLatitude: 'auto' | 'middle' | 'seventh' | 'twilight';
  /** Minutes added to each time (may be negative). */
  adjustments: Record<PrayerKey, number>;
}

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  method: 'auto',
  madhab: 'shafi',
  highLatitude: 'auto',
  adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
};

/** Default method per country (ISO 3166-1 alpha-2), D-058. Everything else: Muslim World League. */
const COUNTRY_METHODS: Record<string, MethodKey> = {
  SA: 'UmmAlQura',
  EG: 'Egyptian',
  SD: 'Egyptian',
  LY: 'Egyptian',
  PK: 'Karachi',
  IN: 'Karachi',
  BD: 'Karachi',
  AF: 'Karachi',
  AE: 'Dubai',
  KW: 'Kuwait',
  QA: 'Qatar',
  SG: 'Singapore',
  MY: 'Singapore',
  ID: 'Singapore',
  BN: 'Singapore',
  TR: 'Turkey',
  IR: 'Tehran',
  US: 'NorthAmerica',
  CA: 'NorthAmerica',
  GB: 'MoonsightingCommittee',
};

export function defaultMethod(country: string | null): MethodKey {
  return (country && COUNTRY_METHODS[country]) || 'MuslimWorldLeague';
}

export function resolvedMethod(settings: PrayerSettings, country: string | null): MethodKey {
  return settings.method === 'auto' ? defaultMethod(country) : settings.method;
}

/** Maps the user's settings to adhan's calculation parameters. */
export function toParameters(settings: PrayerSettings, place: { latitude: number; longitude: number; country: string | null }): CalculationParameters {
  const params = CalculationMethod[resolvedMethod(settings, place.country)]();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule =
    settings.highLatitude === 'middle'
      ? HighLatitudeRule.MiddleOfTheNight
      : settings.highLatitude === 'seventh'
        ? HighLatitudeRule.SeventhOfTheNight
        : settings.highLatitude === 'twilight'
          ? HighLatitudeRule.TwilightAngle
          : HighLatitudeRule.recommended(new Coordinates(place.latitude, place.longitude));
  // The user's minutes; adhan adds the method's own adjustments (methodAdjustments) separately.
  for (const p of PRAYERS) params.adjustments[p] = settings.adjustments[p] ?? 0;
  return params;
}

/** The calendar date (y, m, d) of an instant in a time zone. */
export function dateIn(timeZone: string, instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export type DayTimes = Record<PrayerKey, Date>;

/** Prayer times of a calendar day at a place (adhan only reads the date's y/m/d). */
export function prayerTimes(
  place: { latitude: number; longitude: number; country: string | null },
  day: { year: number; month: number; day: number },
  settings: PrayerSettings
): DayTimes {
  const t = new PrayerTimes(new Coordinates(place.latitude, place.longitude), new Date(day.year, day.month - 1, day.day), toParameters(settings, place));
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

/** The next prayer after `now` (sunrise is not a prayer): today's, or tomorrow's Fajr. */
export function nextPrayer(
  place: { latitude: number; longitude: number; country: string | null; timeZone: string },
  now: Date,
  settings: PrayerSettings
): { prayer: Exclude<PrayerKey, 'sunrise'>; time: Date } {
  const today = dateIn(place.timeZone, now);
  const times = prayerTimes(place, today, settings);
  for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
    if (times[p] > now) return { prayer: p, time: times[p] };
  }
  const tomorrow = dateIn(place.timeZone, new Date(times.isha.getTime() + 12 * 3600_000));
  return { prayer: 'fajr', time: prayerTimes(place, tomorrow, settings).fajr };
}

const KAABA = { latitude: 21.422487, longitude: 39.826206 };

/** Qibla bearing in degrees clockwise from true north (adhan-js). */
export function qiblaBearing(latitude: number, longitude: number): number {
  return Qibla(new Coordinates(latitude, longitude));
}

/** Great-circle distance to the Kaaba in kilometres. */
export function distanceToKaaba(latitude: number, longitude: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(KAABA.latitude - latitude);
  const dLon = rad(KAABA.longitude - longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latitude)) * Math.cos(rad(KAABA.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
