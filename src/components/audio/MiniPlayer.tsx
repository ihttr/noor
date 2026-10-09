'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, useSyncExternalStore } from 'react';
import { Link } from '@/i18n/navigation';
import { REPEAT_AYAH_CHOICES, REPEAT_MODES, SPEEDS } from '@/lib/audio/queue';
import { formatNumber } from '@/lib/reader/ayah-share';
import type { PlayerIcons } from './AudioMount';
import {
  getNav,
  getPlayerState,
  getReciters,
  goAyah,
  setAutoScroll,
  setReciter,
  setRepeat,
  setRepeatAyah,
  setSpeed,
  stop,
  subscribePlayer,
  togglePlay,
} from './engine';

/** Persistent mini player (SPEC §7.11): now playing, play/pause, previous/next ayah, and options. */
export default function MiniPlayer({ icons }: { icons: PlayerIcons }) {
  const t = useTranslations('Audio');
  const locale = useLocale();
  const id = useId();
  const s = useSyncExternalStore(subscribePlayer, getPlayerState, getPlayerState);
  const [open, setOpen] = useState(false);
  const nav = getNav();
  const list = getReciters();
  const surah = nav?.surahs[s.surah - 1];
  const reciter = list?.reciters.find((r) => r.id === s.reciter);
  const ar = locale === 'ar';
  const n = (x: number) => formatNumber(x, ar);
  const playing = s.status === 'playing' || s.status === 'loading';

  if (s.status === 'idle') return null;

  return (
    <section aria-label={t('player')} className="mini-player">
      <div className="flex items-center gap-1">
        <button type="button" className="icon-button" aria-label={t('previousAyah')} onClick={() => goAyah(-1)} disabled={s.ayah <= 1}>
          {ar ? icons.right : icons.left}
        </button>
        <button type="button" className="icon-button mini-player-main" aria-label={playing ? t('pause') : t('play')} onClick={togglePlay}>
          {playing ? icons.pause : icons.play}
        </button>
        <button type="button" className="icon-button" aria-label={t('nextAyah')} onClick={() => goAyah(1)} disabled={s.ayah >= s.ayahCount}>
          {ar ? icons.left : icons.right}
        </button>
        <div className="min-w-0 flex-1 px-2">
          {surah ? (
            <Link href={`/quran/${surah.slug}#ayah-${s.surah}-${s.ayah}`} className="block truncate text-sm font-semibold hover:underline" data-testid="now-playing">
              {t('nowPlaying', { surah: ar ? surah.name : surah.transliteration, ayah: n(s.ayah) })}
            </Link>
          ) : null}
          <p className="truncate text-xs text-ink-muted">
            {s.status === 'loading' ? t('loading') : s.status === 'error' ? t('error') : s.status === 'ended' ? t('ended') : reciter ? (ar ? reciter.name.ar : reciter.name.en) : ''}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t('options')}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          onClick={() => setOpen(!open)}
        >
          {icons.expand}
        </button>
        <button type="button" className="icon-button" aria-label={t('stop')} onClick={stop}>
          {icons.close}
        </button>
      </div>

      {open && (
        <div id={`${id}-options`} className="mt-2 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('reciter')}
            <select className="text-field font-normal" value={s.reciter} onChange={(e) => setReciter(e.target.value)}>
              {list?.reciters.map((r) => (
                <option key={r.id} value={r.id}>
                  {ar ? r.name.ar : r.name.en}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('speed')}
            <select className="text-field font-normal" value={s.speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((v) => (
                <option key={v} value={v}>
                  {t('speedValue', { speed: v })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('repeatAyah')}
            <select
              className="text-field font-normal"
              value={Number.isFinite(s.repeatAyah) ? s.repeatAyah : 'inf'}
              onChange={(e) => setRepeatAyah(e.target.value === 'inf' ? Number.POSITIVE_INFINITY : Number(e.target.value))}
            >
              {REPEAT_AYAH_CHOICES.map((v) => (
                <option key={v} value={Number.isFinite(v) ? v : 'inf'}>
                  {Number.isFinite(v) ? t('times', { count: v }) : t('forever')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            {t('repeat')}
            <select className="text-field font-normal" value={s.repeat} onChange={(e) => setRepeat(e.target.value as (typeof REPEAT_MODES)[number])}>
              {REPEAT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`repeatModes.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {s.repeat === 'range' && s.range && (
            <fieldset className="flex items-end gap-2 sm:col-span-2">
              <legend className="mb-1 text-xs font-semibold">{t('range')}</legend>
              <label className="flex flex-1 flex-col gap-1 text-xs">
                {t('from')}
                <input
                  type="number"
                  className="text-field"
                  min={1}
                  max={s.ayahCount}
                  value={s.range.from}
                  onChange={(e) => setRepeat('range', { from: Number(e.target.value), to: s.range!.to })}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs">
                {t('to')}
                <input
                  type="number"
                  className="text-field"
                  min={1}
                  max={s.ayahCount}
                  value={s.range.to}
                  onChange={(e) => setRepeat('range', { from: s.range!.from, to: Number(e.target.value) })}
                />
              </label>
            </fieldset>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={s.autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            {t('autoScroll')}
          </label>
          {list && (
            <p className="text-xs text-ink-muted sm:col-span-2">
              {t('source', { name: list.source.name })}{' '}
              <a href={list.source.terms} className="underline underline-offset-2" rel="noopener" target="_blank">
                {t('terms')}
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
