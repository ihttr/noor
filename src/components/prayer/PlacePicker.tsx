'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { nearestCity, searchCities, toPlace } from '@/lib/cities/search';
import type { CityList, CityRow, Place } from '@/lib/cities/types';
import { loadCities } from './place';

/**
 * Choose a place (SPEC §7.16): search the bundled city list, or use the device location only
 * after an explicit tap. Never asks for the location on its own.
 */
export function PlacePicker({ onPick, autoFocus = false }: { onPick: (place: Place) => void; autoFocus?: boolean }) {
  const t = useTranslations('Place');
  const locale = useLocale();
  const id = useId();
  const [query, setQuery] = useState('');
  const [list, setList] = useState<CityList | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'locating' | 'denied'>('idle');
  const [results, setResults] = useState<CityRow[]>([]);
  const regionName = new Intl.DisplayNames([locale], { type: 'region' });

  function ensureList() {
    if (list || status === 'loading') return;
    setStatus('loading');
    loadCities().then(
      (l) => {
        setList(l);
        setStatus('idle');
      },
      () => setStatus('error')
    );
  }

  useEffect(() => {
    if (!list) return;
    const timer = setTimeout(() => setResults(searchCities(list, query)), 120);
    return () => clearTimeout(timer);
  }, [list, query]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) return setStatus('denied');
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let country: string | null = null;
        try {
          const l = list ?? (await loadCities());
          country = nearestCity(l, latitude, longitude)?.[1] ?? null;
        } catch {
          // Without the list the method default falls back to Muslim World League.
        }
        setStatus('idle');
        onPick({
          id: null,
          name: t('myLocation'),
          country,
          region: null,
          latitude: Math.round(latitude * 1e3) / 1e3,
          longitude: Math.round(longitude * 1e3) / 1e3,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-q`} className="text-sm font-semibold">
          {t('search')}
        </label>
        <input
          id={`${id}-q`}
          type="search"
          className="text-field"
          placeholder={t('placeholder')}
          value={query}
          autoComplete="off"
          autoFocus={autoFocus}
          onFocus={ensureList}
          onChange={(e) => {
            ensureList();
            setQuery(e.target.value);
          }}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {status === 'loading' ? t('loadingCities') : status === 'error' ? t('citiesError') : t('privacy')}
        </p>
      </div>
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line" aria-label={t('results')}>
          {results.map((row) => (
            <li key={`${row[0]}|${row[3]}|${row[4]}`}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-start hover:bg-surface-raised"
                onClick={() => list && onPick(toPlace(list, row))}
              >
                <span className="font-semibold" lang="en" dir="ltr">
                  {row[0]}
                </span>
                <span className="text-xs text-ink-muted">
                  {[row[2] >= 0 ? list?.regions[row[2]] : null, regionName.of(row[1])].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="secondary-button" onClick={useMyLocation} disabled={status === 'locating'}>
          {status === 'locating' ? t('locating') : t('useMyLocation')}
        </button>
        {status === 'denied' && <p className="text-sm text-ink-muted">{t('denied')}</p>}
      </div>
    </div>
  );
}
