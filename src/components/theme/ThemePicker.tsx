'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { THEME_PREFERENCES } from '@/lib/theme';
import {
  getServerThemePreference,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from './theme-store';

export function ThemePicker() {
  const t = useTranslations('Settings');
  const current = useSyncExternalStore(subscribeThemePreference, getThemePreference, getServerThemePreference);

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{t('theme')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {THEME_PREFERENCES.map((value) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => setThemePreference(value)}
              className="size-4 accent-[var(--accent)]"
            />
            <span>{t(`themes.${value}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
