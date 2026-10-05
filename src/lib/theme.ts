// Theme preference handling. The preference is a tiny boot-time setting, so it lives in
// localStorage (SPEC §4) and is applied by an inline script before first paint.

export const THEME_PREFERENCES = ['system', 'light', 'dark', 'sepia', 'black'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'noor:theme';

const DARK_THEMES: ReadonlySet<ResolvedTheme> = new Set(['dark', 'black']);

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference !== 'system') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

export function colorSchemeOf(theme: ResolvedTheme): 'light' | 'dark' {
  return DARK_THEMES.has(theme) ? 'dark' : 'light';
}

/** Applies a resolved theme to <html>; shared by the boot script and the theme picker. */
export function applyTheme(root: HTMLElement, preference: ThemePreference, theme: ResolvedTheme): void {
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = colorSchemeOf(theme);
}

/**
 * Inline script for <head>: runs before paint so the stored theme never flashes.
 * Kept dependency-free and defensive (storage can throw in private modes).
 */
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=null;try{p=localStorage.getItem(k)}catch(e){}var ok=${JSON.stringify(THEME_PREFERENCES)};if(ok.indexOf(p)<0)p='system';var t=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;var r=document.documentElement;r.dataset.theme=t;r.dataset.themePreference=p;r.style.colorScheme=(t==='dark'||t==='black')?'dark':'light'}catch(e){}})();`;
