'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { PlacePicker } from '@/components/prayer/PlacePicker';
import { loadPlace, savePlace } from '@/components/prayer/place';
import type { Place } from '@/lib/cities/types';
import { distanceToKaaba, qiblaBearing } from '@/lib/prayer/times';

type CompassState = 'off' | 'starting' | 'live' | 'unavailable' | 'denied';

interface OrientationWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

/**
 * Qibla (SPEC §7.17): the bearing from true north (adhan-js) and the distance to Makkah; a live
 * compass only after a tap — iOS: `webkitCompassHeading` after the permission prompt; Android:
 * `deviceorientationabsolute`. Both headings are magnetic, so the live dial can be off by the local
 * magnetic declination; this is stated on the page.
 */
export function QiblaView() {
  const t = useTranslations('Qibla');
  const locale = useLocale();
  const id = useId();
  const [place, setPlace] = useState<Place | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  const [compass, setCompass] = useState<CompassState>('off');
  const [heading, setHeading] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let stopped = false;
    void loadPlace().then((p) => !stopped && setPlace(p));
    return () => {
      stopped = true;
      stopRef.current?.();
    };
  }, []);

  async function startCompass() {
    setCompass('starting');
    const Orientation = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined;
    if (!Orientation) return setCompass('unavailable');
    if (typeof Orientation.requestPermission === 'function') {
      try {
        if ((await Orientation.requestPermission()) !== 'granted') return setCompass('denied');
      } catch {
        return setCompass('denied');
      }
    }
    let received = false;
    const onIos = (e: Event) => {
      const h = (e as OrientationWithCompass).webkitCompassHeading;
      if (typeof h === 'number' && Number.isFinite(h)) {
        received = true;
        setHeading(h);
        setCompass('live');
      }
    };
    const onAbsolute = (e: Event) => {
      const alpha = (e as DeviceOrientationEvent).alpha;
      if (typeof alpha === 'number' && Number.isFinite(alpha)) {
        received = true;
        setHeading((360 - alpha) % 360);
        setCompass('live');
      }
    };
    window.addEventListener('deviceorientation', onIos);
    window.addEventListener('deviceorientationabsolute', onAbsolute);
    stopRef.current = () => {
      window.removeEventListener('deviceorientation', onIos);
      window.removeEventListener('deviceorientationabsolute', onAbsolute);
    };
    setTimeout(() => {
      if (!received) {
        stopRef.current?.();
        setCompass('unavailable');
      }
    }, 3000);
  }

  if (place === undefined) return <div aria-busy="true" className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />;

  if (!place || changing) {
    return (
      <section aria-labelledby={`${id}-choose`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 id={`${id}-choose`} className="text-lg font-semibold">
          {t('choosePlace')}
        </h2>
        <PlacePicker
          autoFocus={changing}
          onPick={(p) => {
            setPlace(p);
            setChanging(false);
            void savePlace(p).catch(() => undefined);
          }}
        />
      </section>
    );
  }

  const bearing = qiblaBearing(place.latitude, place.longitude);
  const km = distanceToKaaba(place.latitude, place.longitude);
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const rotation = compass === 'live' && heading !== null ? bearing - heading : bearing;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby={`${id}-place`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <h2 id={`${id}-place`} className="text-lg font-semibold">
          {place.name}
        </h2>
        <button type="button" className="secondary-button" onClick={() => setChanging(true)}>
          {t('changePlace')}
        </button>
      </section>

      <section aria-labelledby={`${id}-bearing`} className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id={`${id}-bearing`} className="sr-only">
          {t('bearingTitle')}
        </h2>
        <p className="text-3xl font-semibold tabular-nums" data-testid="qibla-bearing">
          {t('bearing', { degrees: num.format(Math.round(bearing * 10) / 10) })}
        </p>
        <p className="text-sm text-ink-muted">{t('distance', { km: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(km) })}</p>
        <svg viewBox="0 0 200 200" className="qibla-dial" role="img" aria-label={compass === 'live' ? t('dialLive') : t('dialStatic', { degrees: Math.round(bearing) })}>
          <circle cx="100" cy="100" r="92" className="qibla-ring" />
          <g transform={compass === 'live' && heading !== null ? `rotate(${-heading} 100 100)` : undefined}>
            <text x="100" y="24" textAnchor="middle" className="qibla-north">
              N
            </text>
          </g>
          <g transform={`rotate(${rotation} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="22" className="qibla-arrow" />
            <polygon points="100,12 92,30 108,30" className="qibla-arrow-head" />
          </g>
          <circle cx="100" cy="100" r="5" className="qibla-center" />
        </svg>
        <p className="text-sm text-ink-muted">{compass === 'live' ? t('liveHint') : t('staticHint')}</p>
        {compass !== 'live' && (
          <button type="button" className="primary-button" onClick={() => void startCompass()} disabled={compass === 'starting'}>
            {t('startCompass')}
          </button>
        )}
        {compass === 'unavailable' && <p className="text-sm">{t('unavailable')}</p>}
        {compass === 'denied' && <p className="text-sm">{t('denied')}</p>}
      </section>

      <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-muted">
        <li>{t('trueNorth')}</li>
        <li>{t('declination')}</li>
        <li>{t('calibrate')}</li>
        <li>{t('accuracy')}</li>
      </ul>
    </div>
  );
}
