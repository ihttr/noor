import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { SurahFile } from '../../src/lib/quran/types';

// SPEC §15: the full user journey, at four viewports (1440×900, 820×1180, 390×844, 412×915), in
// Arabic + light and English + dark. Viewport emulation in Chromium — not real devices. Audio is
// served by a mock; "offline" is Chromium's network emulation with the real service worker.

test.use({ serviceWorkers: 'allow' });
test.setTimeout(240_000);

const ayahText = (s: number, a: number) =>
  (JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${s}.json`), 'utf8')) as SurahFile).ayahs[a - 1]!.text;

function silentWav(seconds = 0.25): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(rate * seconds), 0x80);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const TEXT = {
  ar: {
    prefix: '',
    surahLink: /الكهف/,
    save: 'حفظ',
    saved: 'محفوظة',
    note: 'ملاحظة',
    noteLabel: 'ملاحظة خاصة',
    saveNote: 'حفظ الملاحظة',
    play: 'تشغيل من هنا',
    player: 'مشغّل التلاوة',
    stop: 'إيقاف وإغلاق المشغّل',
    searchBox: 'كلمة أو عبارة',
    results: 'نتائج البحث',
    counter: /^عدّ/,
    citySearch: 'ابحث عن مدينة',
    cities: 'المدن المطابقة',
    nextPrayer: 'الصلاة القادمة',
    switchLanguage: 'التبديل إلى الإنجليزية',
    themes: { light: 'فاتح', dark: 'داكن' },
    banner: 'لا يوجد اتصال بالإنترنت. المحفوظات والقراءة الأخيرة متاحة.',
  },
  en: {
    prefix: '/en',
    surahLink: /Al-Kahf/,
    save: 'Save',
    saved: 'Saved',
    note: 'Note',
    noteLabel: 'Private note',
    saveNote: 'Save note',
    play: 'Play from here',
    player: 'Recitation player',
    stop: 'Stop and close the player',
    searchBox: 'Word or phrase (Arabic)',
    results: 'Search results',
    counter: /^Count/,
    citySearch: 'Search for a city',
    cities: 'Matching cities',
    nextPrayer: 'Next prayer',
    switchLanguage: 'Switch to Arabic',
    themes: { light: 'Light', dark: 'Dark' },
    banner: 'No internet connection. Your saved items and recent reading are still available.',
  },
} as const;

async function chooseTheme(page: Page, prefix: string, label: string) {
  await page.goto(`${prefix}/settings`);
  await page.getByRole('radio', { name: label, exact: true }).check();
}

async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 90_000 });
}

for (const [locale, theme] of [
  ['ar', 'light'],
  ['en', 'dark'],
] as const) {
  test(`journey: ${locale} + ${theme} theme`, async ({ page, browser }) => {
    const T = TEXT[locale];
    const p = T.prefix;
    await chooseTheme(page, p, T.themes[theme]);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    // 1. Open the Quran, open a surah and read several ayahs.
    await page.goto(`${p}/quran`);
    await page.getByRole('link', { name: T.surahLink }).first().click();
    await expect(page).toHaveURL(new RegExp(`${p}/quran/al-kahf$`));
    await page.locator('#ayah-18-1').focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('#ayah-18-5')).toBeFocused();
    expect((await page.locator('[data-ayah-text="18:5"]').textContent()) === ayahText(18, 5)).toBe(true);

    // 2. Save an ayah with a note.
    await page.locator('#ayah-18-10 .ayah-end').click();
    const menu = page.getByRole('dialog').first();
    await menu.getByRole('button', { name: T.save, exact: true }).click();
    await expect(menu.getByRole('button', { name: T.saved, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await menu.getByRole('button', { name: T.note, exact: true }).click();
    await menu.getByLabel(T.noteLabel).fill('journey note');
    await menu.getByRole('button', { name: T.saveNote }).click();
    await expect(menu).toContainText('journey note');
    await page.keyboard.press('Escape');
    await expect(page.locator('#ayah-18-10')).toHaveAttribute('data-noted', '');
    await page.locator('#ayah-18-30').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800); // the reading position is saved about a second after scrolling stops

    // 3. A fresh context with the same storage: Continue Reading lands on the same ayah.
    const state = await page.context().storageState({ indexedDB: true });
    const { baseURL, viewport, isMobile, hasTouch } = test.info().project.use;
    const fresh: BrowserContext = await browser.newContext({ storageState: state, baseURL, viewport, isMobile, hasTouch });
    await page.context().close();
    const again = await fresh.newPage();
    await again.goto(`${p}/`);
    await expect(again.locator('html')).toHaveAttribute('data-theme', theme);
    await again.getByTestId('continue-reading').click();
    await expect(again).toHaveURL(new RegExp(`${p}/quran/al-kahf#ayah-18-\\d+$`));
    const anchor = new URL(again.url()).hash.slice(1);
    await expect.poll(() => again.evaluate(() => document.activeElement?.id)).toBe(anchor);

    // 4. Search for an ayah and open the result.
    await again.goto(`${p}/search`);
    await again.getByRole('searchbox', { name: T.searchBox }).fill('الحي القيوم');
    const results = again.getByRole('list', { name: T.results }).getByRole('listitem');
    await expect(results.first()).toBeVisible();
    await results.first().getByRole('link').first().click();
    await expect(again).toHaveURL(/\/quran\/[a-z-]+#ayah-\d+-\d+$/);

    // 5. Play audio (network mocked).
    await again.route('https://cdn.islamic.network/**', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }));
    await again.goto(`${p}/quran/al-faatiha`);
    await again.locator('#ayah-1-1 .ayah-end').click();
    await again.getByRole('dialog').first().getByRole('button', { name: T.play }).click();
    const player = again.getByRole('region', { name: T.player });
    await expect(player).toBeVisible();
    await expect(again.locator('.ayah[data-playing]')).toHaveCount(1, { timeout: 10_000 });
    await player.getByRole('button', { name: T.stop }).click();

    // 6–7. Morning adhkar: count, reload, the count persists.
    await again.goto(`${p}/adhkar/morning`);
    const counter = again.locator('.dhikr-card').first().getByRole('button', { name: T.counter });
    await expect(counter).toBeEnabled();
    await counter.click();
    const name = await counter.getAttribute('aria-label');
    await again.reload();
    await expect(again.locator('.dhikr-card').first().getByRole('button', { name: T.counter })).toHaveAttribute('aria-label', name!);

    // 8. Set a city: prayer times with a next-prayer countdown.
    await again.goto(`${p}/prayer`);
    await again.getByLabel(T.citySearch).fill('Riyadh');
    await again.getByRole('list', { name: T.cities }).getByRole('button').first().click();
    await expect(again.getByTestId('next-prayer')).toContainText(T.nextPrayer);
    const first = await again.getByTestId('countdown').textContent();
    await expect.poll(() => again.getByTestId('countdown').textContent(), { timeout: 4000 }).not.toBe(first);

    // 9. Switch Arabic ↔ English and dark ↔ light.
    await again.getByRole('link', { name: T.switchLanguage }).first().click();
    const other = locale === 'ar' ? 'en' : 'ar';
    await expect(again.locator('html')).toHaveAttribute('lang', other);
    await expect(again).toHaveURL(locale === 'ar' ? /\/en\/prayer$/ : /\/prayer$/);
    const otherTheme = theme === 'light' ? 'dark' : 'light';
    await chooseTheme(again, TEXT[other].prefix, TEXT[other].themes[otherTheme]);
    await expect(again.locator('html')).toHaveAttribute('data-theme', otherTheme);

    // 10. Offline: a cached surah and the saved items still work; the banner shows.
    await again.goto(`${p}/`);
    await controlled(again);
    await again.goto(`${p}/quran/al-kahf`); // opened online once with the worker in control
    await again.goto(`${p}/saved`);
    await expect(again.locator('[data-ayah-text="18:10"]')).toBeVisible();
    await fresh.setOffline(true);
    await again.goto(`${p}/quran/al-kahf`);
    await expect(again.getByTestId('offline-banner')).toHaveText(T.banner);
    expect((await again.locator('[data-ayah-text="18:10"]').textContent()) === ayahText(18, 10)).toBe(true);
    await expect(again.locator('#ayah-18-10')).toHaveAttribute('data-saved', '');
    await again.goto(`${p}/saved`);
    await expect(again.locator('[data-ayah-text="18:10"]')).toBeVisible();
    await expect(again.getByText('journey note')).toBeVisible();
    await fresh.setOffline(false);
    await fresh.close();
  });
}
