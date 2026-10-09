import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };
import type { SurahFile } from '../../src/lib/quran/types';

// Phase 11: PWA and offline (SPEC §7.20, §15 step 10). Runs with the real service worker against
// the production build; offline is Chromium's network emulation (context.setOffline), not a
// device without a connection.

test.use({ serviceWorkers: 'allow' });

const slug = (n: number) => slugs.surahs[n - 1]!.slug;
const ayahText = (s: number, a: number) =>
  (JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${s}.json`), 'utf8')) as SurahFile).ayahs[a - 1]!.text;

/** Waits until the service worker has installed (precache done) and controls the page. */
async function controlled(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 90_000 });
}

/** DOM text of every ayah of a surah equals the source (SPEC §2.6). */
async function expectSurahIntact(page: Page, surah: number) {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${surah}.json`), 'utf8')) as SurahFile;
  const texts = await page.locator(`[data-ayah-text^="${surah}:"]`).evaluateAll((els) => els.map((e) => e.textContent));
  expect(texts.length).toBe(file.ayahs.length);
  expect(texts.every((t, i) => t === file.ayahs[i]!.text)).toBe(true);
}

test.describe('offline (SPEC §7.20)', () => {
  test.setTimeout(180_000);

  test('the manifest and service worker are served', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'نور — القرآن والأذكار', short_name: 'نور', lang: 'ar', dir: 'rtl', start_url: '/', display: 'standalone' });
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    const sw = await request.get('/sw.js');
    expect(sw.headers()['content-type']).toContain('javascript');
    expect(await sw.text()).not.toContain('__NOOR_BUILD__');
  });

  test('a cached surah and saved items still work offline; the banner shows; unknown pages get the offline page', async ({ page, context }) => {
    await page.goto('/');
    await controlled(page);

    // Read a surah online and save an ayah with a note.
    await page.goto(`/quran/${slug(18)}`);
    await page.locator('#ayah-18-10 .ayah-end').click();
    const menu = page.getByRole('dialog', { name: /الآية/ });
    await menu.getByRole('button', { name: 'حفظ' }).click();
    await expect(menu.getByRole('button', { name: 'محفوظة' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.goto('/saved'); // online once, as a user would
    await expect(page.locator('[data-ayah-text="18:10"]')).toBeVisible();

    await context.setOffline(true);
    await page.goto(`/quran/${slug(18)}`);
    await expect(page.getByTestId('offline-banner')).toHaveText('لا يوجد اتصال بالإنترنت. المحفوظات والقراءة الأخيرة متاحة.');
    await expectSurahIntact(page, 18);
    await expect(page.locator('#ayah-18-10')).toHaveAttribute('data-saved', '');

    await page.goto('/saved');
    const saved = page.locator('[data-ayah-text="18:10"]');
    await expect(saved).toBeVisible();
    expect((await saved.textContent()) === ayahText(18, 10)).toBe(true);

    // Client-side navigation from Saved back to the surah while offline.
    await page.getByRole('link', { name: /الكهف/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(18)}`));
    await expect(page.locator('#ayah-18-10')).toBeVisible();

    // Precached pages: home, adhkar (with its data), English shell.
    await page.goto('/adhkar/morning');
    await expect(page.locator('h1')).toBeVisible();
    await page.goto('/en');
    await expect(page.getByTestId('offline-banner')).toHaveText('No internet connection. Your saved items and recent reading are still available.');

    // A page never opened: the offline page, in the right language.
    await page.goto('/en/qibla');
    await expect(page.getByRole('heading', { level: 1, name: 'You are offline' })).toBeVisible();
    await page.goto(`/quran/${slug(36)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'لا يوجد اتصال' })).toBeVisible();

    await context.setOffline(false);
    await page.goto('/');
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  });

  test('"Download Quran text for offline": progress and size, then any surah opens offline; the copy can be removed', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'one download is enough (desktop project)');
    await page.goto('/en/settings');
    await controlled(page);
    await page.reload();
    await expect(page.getByTestId('offline-worker')).toHaveText('Offline use is active in this browser.');
    const status = page.getByTestId('offline-quran-status');
    await expect(status).toHaveText('The Quran text is not downloaded yet.');
    await page.getByRole('button', { name: 'Download Quran text for offline' }).click();
    await expect(status).toContainText('Downloading…');
    await expect(status).toContainText(/Downloaded: 114 surahs · [\d.]+ MB/, { timeout: 150_000 });

    await context.setOffline(true);
    for (const surah of [36, 112]) {
      await page.goto(`/en/quran/${slug(surah)}`);
      await expectSurahIntact(page, surah);
    }
    await context.setOffline(false);

    await page.goto('/en/settings');
    await page.getByRole('button', { name: 'Remove the downloaded copy' }).click();
    await expect(status).toHaveText('The Quran text is not downloaded yet.');
  });
});
