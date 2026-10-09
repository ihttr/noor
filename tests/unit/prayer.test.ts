import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRAYER_SETTINGS,
  dateIn,
  defaultMethod,
  distanceToKaaba,
  nextPrayer,
  prayerTimes,
  qiblaBearing,
  toParameters,
  type PrayerKey,
} from '@/lib/prayer/times';

const hm = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

describe('prayer settings → adhan parameters (SPEC §7.16, §15)', () => {
  it('defaults the method by country', () => {
    expect(defaultMethod('SA')).toBe('UmmAlQura');
    expect(defaultMethod('EG')).toBe('Egyptian');
    expect(defaultMethod('TR')).toBe('Turkey');
    expect(defaultMethod('FR')).toBe('MuslimWorldLeague');
    expect(defaultMethod(null)).toBe('MuslimWorldLeague');
  });

  it('maps madhab, high-latitude rule and the user’s minutes', () => {
    const p = toParameters(
      { ...DEFAULT_PRAYER_SETTINGS, method: 'Egyptian', madhab: 'hanafi', highLatitude: 'seventh', adjustments: { ...DEFAULT_PRAYER_SETTINGS.adjustments, isha: 3 } },
      { latitude: 30, longitude: 31, country: 'EG' }
    );
    expect(p.method).toBe('Egyptian');
    expect(p.fajrAngle).toBe(19.5);
    expect(p.madhab).toBe('hanafi');
    expect(p.highLatitudeRule).toBe('seventhofthenight');
    expect(p.adjustments.isha).toBe(3);
  });

  // Official reference: Diyanet İşleri Başkanlığı (Presidency of Religious Affairs, Türkiye),
  // https://namazvakitleri.diyanet.gov.tr/en-US/9541/prayer-time-for-istanbul — İstanbul,
  // 9 October 2026, read on 2026-10-09: İmsak 05:37, Güneş 07:02, Öğle 12:57, İkindi 16:07,
  // Akşam 18:41, Yatsı 20:00. Coordinates: GeoNames "Istanbul" (41.014, 28.950).
  it('matches the official Diyanet timetable for Istanbul within 2 minutes', () => {
    const official: Record<PrayerKey, string> = { fajr: '05:37', sunrise: '07:02', dhuhr: '12:57', asr: '16:07', maghrib: '18:41', isha: '20:00' };
    const times = prayerTimes({ latitude: 41.014, longitude: 28.95, country: 'TR' }, { year: 2026, month: 10, day: 9 }, DEFAULT_PRAYER_SETTINGS);
    for (const p of Object.keys(official) as PrayerKey[]) {
      const diff = Math.abs(minutes(hm(times[p], 'Europe/Istanbul')) - minutes(official[p]));
      expect(diff, `${p}: computed ${hm(times[p], 'Europe/Istanbul')}, official ${official[p]}`).toBeLessThanOrEqual(2);
    }
  });

  it('finds the next prayer, including tomorrow’s Fajr after Isha', () => {
    const place = { latitude: 21.4225, longitude: 39.8262, country: 'SA', timeZone: 'Asia/Riyadh' };
    const noon = new Date('2026-10-09T09:00:00Z'); // 12:00 in Makkah
    expect(nextPrayer(place, noon, DEFAULT_PRAYER_SETTINGS).prayer).toBe('dhuhr');
    const night = new Date('2026-10-09T21:00:00Z'); // 00:00 in Makkah, after Isha
    const next = nextPrayer(place, night, DEFAULT_PRAYER_SETTINGS);
    expect(next.prayer).toBe('fajr');
    expect(dateIn('Asia/Riyadh', next.time)).toEqual({ year: 2026, month: 10, day: 10 });
  });
});

describe('qibla (SPEC §7.17)', () => {
  // Independent check: initial great-circle bearing computed here, compared with adhan's Qibla.
  const bearing = (lat: number, lon: number) => {
    const r = (d: number) => (d * Math.PI) / 180;
    const [φ1, φ2, Δλ] = [r(lat), r(21.422487), r(39.826206 - lon)];
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };

  it('bearing relative to true north agrees with the great-circle formula', () => {
    for (const [lat, lon] of [
      [41.014, 28.95],
      [51.509, -0.126],
      [40.714, -74.006],
      [-6.211, 106.845],
    ] as const) {
      expect(Math.abs(qiblaBearing(lat, lon) - bearing(lat, lon))).toBeLessThan(0.5);
    }
  });

  it('distance to Makkah', () => {
    expect(distanceToKaaba(21.4225, 39.8262)).toBeLessThan(1);
    // Riyadh is about 790 km from Makkah.
    expect(distanceToKaaba(24.688, 46.722)).toBeGreaterThan(760);
    expect(distanceToKaaba(24.688, 46.722)).toBeLessThan(820);
  });
});
