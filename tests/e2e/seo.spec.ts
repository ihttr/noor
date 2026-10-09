import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { SurahFile } from '../../src/lib/quran/types';

// Phase 12: SEO (SPEC §9) and security headers (SPEC §12) of the production build.

test.skip(({ isMobile }) => isMobile, 'server output does not depend on the viewport');

const ayahText = (s: number, a: number) =>
  (JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${s}.json`), 'utf8')) as SurahFile).ayahs[a - 1]!.text;
const jsonLd = (page: Page) =>
  page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? '{}') as Record<string, unknown>));

test.describe('SEO (SPEC §9)', () => {
  test('canonical URLs and hreflang ar/en', async ({ page }) => {
    await page.goto('/quran/al-baqara');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/quran\/al-baqara$/);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/quran\/al-baqara$/);
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute('href', /[^n]\/quran\/al-baqara$/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', /[^n]\/quran\/al-baqara$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    const crumbs = (await jsonLd(page)).find((d) => d['@type'] === 'BreadcrumbList') as { itemListElement: unknown[] } | undefined;
    expect(crumbs?.itemListElement).toHaveLength(3);

    await page.goto('/en/quran/al-baqara');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/quran\/al-baqara$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('numeric URLs redirect (308) to slug URLs; ayah pages are real pages with the exact text and the tafsir source', async ({ page, request }) => {
    for (const [from, to] of [
      ['/quran/2', '/quran/al-baqara'],
      ['/quran/2/255', '/quran/al-baqara/255'],
      ['/en/quran/2/255', '/en/quran/al-baqara/255'],
      ['/quran/al-baqara/0255', '/quran/al-baqara/255'],
      [`/quran/${encodeURIComponent('٢')}/${encodeURIComponent('٢٥٥')}`, '/quran/al-baqara/255'],
    ]) {
      const res = await request.get(from!, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(res.headersArray().filter((h) => h.name.toLowerCase() === 'location'), from).toHaveLength(1);
      expect(new URL(res.headers().location!, 'http://x').pathname).toBe(to);
    }
    await page.goto('/quran/al-baqara/255');
    expect((await page.locator('[data-ayah-text="2:255"]').textContent()) === ayahText(2, 255)).toBe(true);
    await expect(page.locator('h1')).toContainText('الآية');
    await expect(page.getByText('التفسير الميسر').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /quranenc/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'اقرأها في السورة' })).toHaveAttribute('href', '/quran/al-baqara#ayah-2-255');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/quran\/al-baqara\/255$/);
    expect((await request.get('/quran/al-baqara/287')).status()).toBe(404);
  });

  test('home: WebSite JSON-LD with a SearchAction that works', async ({ page }) => {
    await page.goto('/');
    const site = (await jsonLd(page)).find((d) => d['@type'] === 'WebSite') as { potentialAction: { target: { urlTemplate: string } } };
    expect(site.potentialAction.target.urlTemplate).toMatch(/\/search\?q=\{search_term_string\}$/);
    await page.goto('/search?q=' + encodeURIComponent('الرحمن الرحيم'));
    await expect(page.getByRole('searchbox')).toHaveValue('الرحمن الرحيم');
  });

  test('sitemap.xml and robots.txt', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/quran/al-baqara</loc>');
    expect(sitemap).toContain('/en/quran/al-baqara</loc>');
    expect(sitemap).toContain('/juz/30</loc>');
    expect(sitemap).toContain('/adhkar/morning</loc>');
    expect(sitemap).not.toContain('/adhkar/travel<');
    expect(sitemap).not.toContain('/saved<');
    expect(sitemap).toContain('hreflang="en"');
    expect((sitemap.match(/<url>/g) ?? []).length).toBe(2 * (2 + 114 + 30 + 1 + 2 + 6));
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/api\//);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test('private and thin pages are noindex; public pages are indexable', async ({ page }) => {
    for (const p of ['/saved', '/stats', '/settings', '/memorize', '/auth/sign-in', '/offline', '/more', '/en/search', '/adhkar/travel']) {
      await page.goto(p);
      await expect(page.locator('meta[name="robots"]'), p).toHaveAttribute('content', /noindex/);
    }
    for (const p of ['/', '/quran', '/adhkar/morning', '/juz/1', '/mushaf/page/50', '/privacy', '/en/about']) {
      await page.goto(p);
      await expect(page.locator('meta[name="robots"]'), p).toHaveCount(0);
      await expect(page.locator('meta[name="description"]'), p).toHaveAttribute('content', /.{20,}/);
    }
  });

  test('Open Graph images are PNGs', async ({ request }) => {
    for (const p of ['/opengraph-image', '/quran/al-baqara/opengraph-image', '/en/quran/yaseen/opengraph-image']) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
    }
  });
});

test.describe('security headers (SPEC §12)', () => {
  test('headers are set and pages load without CSP violations', async ({ page, request }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('geolocation=(self)');
    expect(headers['x-powered-by']).toBeUndefined();

    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    for (const p of ['/', '/quran/al-faatiha', '/mushaf/page/2', '/search?q=%D8%A7%D9%84%D8%AD%D9%85%D8%AF', '/adhkar/morning', '/prayer', '/settings', '/en/stats', '/memorize']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
    }
    expect(violations).toEqual([]);
  });
});
