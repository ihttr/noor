'use client';

import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/theme';

// A tiny external store over <html data-theme-preference>, which the boot script sets before
// hydration. Components read it with useSyncExternalStore, so there is no hydration mismatch.

const CHANGE_EVENT = 'noor:themechange';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getThemePreference(): ThemePreference {
  const value = document.documentElement.dataset.themePreference;
  return isThemePreference(value) ? value : 'system';
}

export function getServerThemePreference(): ThemePreference {
  return 'system';
}

export function subscribeThemePreference(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this page view.
  }
  applyTheme(document.documentElement, preference, resolveTheme(preference, systemPrefersDark()));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Re-applies the "system" preference when the OS color scheme changes. */
export function watchSystemScheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePreference() === 'system') {
      applyTheme(document.documentElement, 'system', resolveTheme('system', query.matches));
    }
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
