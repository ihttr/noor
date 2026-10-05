'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { ThemePicker } from '@/components/theme/ThemePicker';
import { CONTENT_WIDTHS, LINE_HEIGHT, NUMERAL_STYLES, QURAN_FONTS, SIZE } from '@/lib/reader/settings';
import {
  getReaderSettings,
  getServerReaderSettings,
  subscribeReaderSettings,
  updateReaderSettings,
} from './settings-store';

const segment =
  'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-line px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]';

/** Reading settings (SPEC §7.4); every change is applied and saved immediately. */
export function ReaderSettingsDialog({
  ref,
  icons,
}: {
  ref?: Ref<HTMLDialogElement>;
  icons: { close: ReactNode; minus: ReactNode; plus: ReactNode };
}) {
  const t = useTranslations('Reader');
  const s = useSyncExternalStore(subscribeReaderSettings, getReaderSettings, getServerReaderSettings);
  const close = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.closest('dialog')?.close();

  return (
    <dialog ref={ref} className="reader-dialog" aria-labelledby="reader-settings-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="reader-settings-title" className="text-lg font-semibold">
          {t('settings')}
        </h2>
        <button type="button" onClick={close} className="icon-button" aria-label={t('close')}>
          {icons.close}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('font')}</legend>
          <div className="flex gap-2">
            {QURAN_FONTS.map((f) => (
              <label key={f} className={segment}>
                <input
                  type="radio"
                  name="quran-font"
                  className="sr-only"
                  checked={s.font === f}
                  onChange={() => updateReaderSettings({ font: f })}
                />
                {t(`fonts.${f}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p id="font-size-label" className="mb-2 text-sm font-semibold">
            {t('fontSize')}
          </p>
          <div className="flex items-center gap-3" role="group" aria-labelledby="font-size-label">
            <button
              type="button"
              className="icon-button border border-line"
              aria-label={t('decrease')}
              disabled={s.size <= SIZE.min}
              onClick={() => updateReaderSettings({ size: s.size - SIZE.step })}
            >
              {icons.minus}
            </button>
            <output className="min-w-16 text-center font-semibold tabular-nums" aria-live="polite" dir="ltr">
              {s.size}px
            </output>
            <button
              type="button"
              className="icon-button border border-line"
              aria-label={t('increase')}
              disabled={s.size >= SIZE.max}
              onClick={() => updateReaderSettings({ size: s.size + SIZE.step })}
            >
              {icons.plus}
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          <span>
            {t('lineHeight')} <span className="font-normal text-ink-muted tabular-nums">({s.lineHeight.toFixed(1)})</span>
          </span>
          <input
            type="range"
            min={LINE_HEIGHT.min}
            max={LINE_HEIGHT.max}
            step={LINE_HEIGHT.step}
            value={s.lineHeight}
            onChange={(e) => updateReaderSettings({ lineHeight: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('width')}</legend>
          <div className="flex gap-2">
            {CONTENT_WIDTHS.map((w) => (
              <label key={w} className={segment}>
                <input
                  type="radio"
                  name="quran-width"
                  className="sr-only"
                  checked={s.width === w}
                  onChange={() => updateReaderSettings({ width: w })}
                />
                {t(`widths.${w}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('numerals')}</legend>
          <div className="flex gap-2">
            {NUMERAL_STYLES.map((n) => (
              <label key={n} className={segment}>
                <input
                  type="radio"
                  name="numerals"
                  className="sr-only"
                  checked={s.numerals === n}
                  onChange={() => updateReaderSettings({ numerals: n })}
                />
                {t(`numeralStyles.${n}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <h3 className="sr-only">{t('theme')}</h3>
          <ThemePicker />
        </div>
      </div>
    </dialog>
  );
}
