import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };

const slug = (n: number) => slugs.surahs[n - 1]!.slug;
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

test.describe('surah index (SPEC §7.2)', () => {
  test('filters instantly in Arabic and English', async ({ page }) => {
    await page.goto('/quran');
    await page.getByRole('searchbox').fill('كهف');
    await expect(page.locator('[data-surah]')).toHaveCount(1);
    await expect(page.locator('[data-surah="18"]')).toBeVisible();

    await page.goto('/en/quran');
    await page.getByRole('searchbox').fill('kahf');
    await expect(page.locator('[data-surah]')).toHaveCount(1);
    await page.getByRole('searchbox').fill('18');
    await expect(page.locator('[data-surah="18"]')).toBeVisible();
  });

  test('Juz, Hizb and Page tabs', async ({ page }) => {
    await page.goto('/en/quran');
    await page.getByRole('tab', { name: 'Juz' }).click();
    await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(30);
    await page.getByRole('tab', { name: 'Hizb' }).click();
    await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(240);
    await page.getByRole('tab', { name: 'Page' }).click();
    await expect(page.getByRole('tabpanel').getByRole('link')).toHaveCount(604);
    await page.getByRole('link', { name: 'Page 50', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/mushaf\/page\/50$/);
  });
});

test.describe('reader navigation', () => {
  test('numeric URLs redirect (308) to the slug URLs; ayah URLs are their own pages (Phase 12)', async ({ request }) => {
    const surah = await request.get('/quran/2', { maxRedirects: 0 });
    expect(surah.status()).toBe(308);
    expect(surah.headers().location).toMatch(new RegExp(`/quran/${slug(2)}$`));
    const ayah = await request.get('/en/quran/2/255', { maxRedirects: 0 });
    expect(ayah.status()).toBe(308);
    expect(ayah.headers().location).toMatch(new RegExp(`/en/quran/${slug(2)}/255$`));
    expect((await request.get(`/en/quran/${slug(2)}/255`, { maxRedirects: 0 })).status()).toBe(200);
  });

  test('arrow keys move by ayah (RTL: ← forward), PageDown by page', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.locator('#ayah-1-1').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('ayah-1-2');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('ayah-1-3');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('ayah-1-2');

    await page.goto(`/quran/${slug(2)}`);
    await page.locator('#ayah-2-1').focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.page)).toBe('3');
  });

  test('Mushaf: PageDown/PageUp and swipes turn pages like a right-to-left book', async ({ page }) => {
    await page.goto('/mushaf/page/5');
    // Interactive once hydrated: the toolbar bookmark is enabled by an effect.
    await expect(page.getByRole('button', { name: /^حفظ صفحة (5|٥)$/ })).toBeEnabled();
    await page.keyboard.press('PageDown');
    await expect(page).toHaveURL(/\/mushaf\/page\/6$/);
    await page.keyboard.press('PageUp');
    await expect(page).toHaveURL(/\/mushaf\/page\/5$/);

    const swipe = (dx: number) =>
      page.locator('.reader-body').evaluate((el, dx) => {
        const base = { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 7 };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: 150, clientY: 400 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: 150 + dx, clientY: 405 }));
      }, dx);
    await swipe(160); // swipe right → next page
    await expect(page).toHaveURL(/\/mushaf\/page\/6$/);
    await swipe(-160); // swipe left → previous page
    await expect(page).toHaveURL(/\/mushaf\/page\/5$/);
  });

  test('mode switch keeps the position', async ({ page }) => {
    await page.goto(`/quran/${slug(2)}#ayah-2-255`);
    await expect.poll(() => focusedId(page)).toBe('ayah-2-255');
    await page.getByRole('button', { name: 'وضع المصحف' }).click();
    await expect(page).toHaveURL(/\/mushaf\/page\/42#ayah-2-255$/);
    await expect.poll(() => focusedId(page)).toBe('ayah-2-255');
    await page.getByRole('button', { name: 'وضع القراءة' }).click();
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(2)}#ayah-2-255$`));
  });

  test('jump dialog: reference, page and juz', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.getByRole('button', { name: 'انتقال سريع' }).click();
    await page.getByLabel('سورة وآية').fill('الكهف ١٠');
    await page.getByLabel('سورة وآية').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(18)}#ayah-18-10$`));
    await expect.poll(() => focusedId(page)).toBe('ayah-18-10');

    await page.getByRole('button', { name: 'انتقال سريع' }).click();
    await page.getByLabel('سورة وآية').fill('not a surah');
    await page.getByLabel('سورة وآية').press('Enter');
    await expect(page.locator('#jump-error')).toHaveText('لم أتعرّف على هذا المرجع.');
    await page.locator('#jump-juz').fill('30');
    await page.locator('#jump-juz').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(78)}#ayah-78-1$`));
  });
});

test.describe('reader chrome and settings', () => {
  test('tapping the text hides and shows the chrome', async ({ page, isMobile }) => {
    await page.goto(`/quran/${slug(1)}`);
    const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' });
    await expect(nav).toBeVisible();
    await page.locator('[data-ayah-text="1:2"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-chrome', 'hidden');
    await expect(nav).toBeHidden();
    await expect(page.getByRole('toolbar')).toBeHidden();
    await page.locator('[data-ayah-text="1:3"]').click();
    await expect(nav).toBeVisible();
    if (isMobile) await expect(page.getByRole('toolbar')).toBeVisible();
  });

  test('settings apply immediately and survive a reload', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.getByRole('button', { name: 'إعدادات القراءة' }).click();
    await page.getByRole('button', { name: 'تكبير الخط' }).click();
    await page.getByText('شهرزاد الجديد').click();
    await page.getByText('123', { exact: true }).click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-quran-font', 'scheherazade');
    await expect(html).toHaveAttribute('data-numerals', 'western');
    await expect(html).toHaveAttribute('style', /--quran-size:\s*34px/);

    await page.reload();
    await expect(html).toHaveAttribute('data-quran-font', 'scheherazade');
    await expect(html).toHaveAttribute('data-numerals', 'western');
    await expect(html).toHaveAttribute('style', /--quran-size:\s*34px/);
    const size = await page.locator('.quran-flow').evaluate((el) => getComputedStyle(el).fontSize);
    expect(size).toBe('34px');
  });
});

test.describe('performance budget (SPEC §11)', () => {
  // Measures the scripts the route itself loads (those in its HTML, not chunks prefetched for links
  // to other routes), gzip-compressed with zlib level 9 — a deterministic definition of
  // "150 KB gzipped". The server's on-the-fly compression varies with streaming and is reported
  // alongside for information.
  test('reader route ships ≤ 150 KB of gzipped JavaScript', async ({ page }) => {
    const response = await page.goto(`/quran/${slug(2)}`);
    await page.waitForLoadState('networkidle');
    // The route's own scripts are the ones its HTML references (prefetches insert more later).
    const html = (await response!.text()).replace(/<script[^>]*noModule[^>]*><\/script>/gi, '');
    const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1]!, page.url()).href);
    const served = await page.evaluate(
      (own) =>
        performance
          .getEntriesByType('resource')
          .filter((e) => own.includes(e.name))
          .reduce((n, e) => n + (e as PerformanceResourceTiming).encodedBodySize, 0),
      urls
    );
    let gzipped = 0;
    for (const url of urls) gzipped += gzipSync(await (await page.request.get(url)).body(), { level: 9 }).length;
    test.info().annotations.push({ type: 'reader-js', description: `gzip-9: ${gzipped} B, as served by next start: ${served} B` });
    console.log(`reader JS: gzip-9 ${gzipped} B (${(gzipped / 1024).toFixed(1)} KiB); served ${served} B`);
    expect(gzipped).toBeLessThanOrEqual(150 * 1024);

    // Reported, not limited (D-048): chunks loaded after first paint — the local store (Dexie),
    // tracking and the ayah menu load when the reader is idle.
    await page.locator('#ayah-2-1 .ayah-end').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'noor'))).toBe(true);
    const lazy = await page.evaluate(
      (own) =>
        performance
          .getEntriesByType('resource')
          .filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script' && e.name.endsWith('.js') && !own.includes(e.name))
          .map((e) => e.name),
      urls
    );
    let lazyGzipped = 0;
    for (const url of new Set(lazy)) lazyGzipped += gzipSync(await (await page.request.get(url)).body(), { level: 9 }).length;
    test.info().annotations.push({ type: 'reader-js-lazy', description: `gzip-9: ${lazyGzipped} B in ${new Set(lazy).size} chunks` });
    console.log(`reader JS loaded later: gzip-9 ${lazyGzipped} B (${(lazyGzipped / 1024).toFixed(1)} KiB) in ${new Set(lazy).size} chunks`);
  });
});
