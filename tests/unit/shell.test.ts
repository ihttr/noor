import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import { isActivePath, NAV_ITEMS } from '@/components/shell/nav-items';
import { directions, routing } from '@/i18n/routing';
import { resolveTheme, themeBootScript, THEME_STORAGE_KEY } from '@/lib/theme';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

function leafValues(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [value];
  return Object.values(value).flatMap(leafValues);
}

describe('i18n', () => {
  it('serves Arabic by default at / and English under /en, from the URL only', () => {
    expect(routing.locales).toEqual(['ar', 'en']);
    expect(routing.defaultLocale).toBe('ar');
    expect(routing.localeDetection).toBe(false);
    expect(directions).toEqual({ ar: 'rtl', en: 'ltr' });
  });

  it('has the same message keys in Arabic and English, none empty', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(ar).sort());
    for (const v of [...leafValues(ar), ...leafValues(en)]) {
      expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
    }
  });

  it('has a label for every navigation item', () => {
    for (const item of NAV_ITEMS) {
      expect(ar.Nav[item.key]).toBeTruthy();
      expect(en.Nav[item.key]).toBeTruthy();
    }
  });
});

describe('navigation', () => {
  it('fits the mobile bottom bar in five items', () => {
    expect(NAV_ITEMS.filter((i) => i.bottomBar)).toHaveLength(5);
  });

  it('matches active paths without false prefixes', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/quran', '/')).toBe(false);
    expect(isActivePath('/quran/al-baqarah', '/quran')).toBe(true);
    expect(isActivePath('/quranic', '/quran')).toBe(false);
  });
});

describe('theme', () => {
  it('resolves the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('sepia', true)).toBe('sepia');
  });

  it('boot script applies a stored theme and ignores invalid values', () => {
    const run = (stored: string | null, prefersDark: boolean) => {
      const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
      const env = {
        localStorage: { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) },
        window: { matchMedia: () => ({ matches: prefersDark }) },
        document: { documentElement: root },
      };
      new Function('localStorage', 'window', 'document', themeBootScript)(env.localStorage, env.window, env.document);
      return root;
    };
    expect(run('sepia', true).dataset).toEqual({ theme: 'sepia', themePreference: 'sepia' });
    expect(run('black', false).style.colorScheme).toBe('dark');
    expect(run('bogus', true).dataset).toEqual({ theme: 'dark', themePreference: 'system' });
    expect(run(null, false).dataset.theme).toBe('light');
  });
});
