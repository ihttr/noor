import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const theme of ['light', 'dark', 'sepia', 'black'] as const) {
  for (const path of ['/', '/en', '/settings', '/en/more', '/quran', '/quran/al-faatiha', '/en/quran/yaseen', '/mushaf/page/2', '/about', '/saved', '/adhkar', '/tasbih', '/prayer', '/qibla', '/calendar', '/search', '/memorize', '/en/stats', '/auth/sign-up', '/privacy', '/offline', '/quran/al-baqara/255', '/juz/30', '/adhkar/morning']) {
    test(`axe: ${path} in ${theme} theme has no WCAG A/AA violations`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('noor:theme', t), theme);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}

// WCAG 1.4.10 reflow (320 CSS px) and 1.4.4 text resize (200 %): no horizontal page scrolling.
const REFLOW_PATHS = ['/', '/en', '/quran', '/quran/al-baqara', '/mushaf/page/50', '/quran/al-baqara/255', '/adhkar/morning', '/prayer', '/qibla', '/calendar', '/tasbih', '/saved', '/search', '/memorize', '/en/stats', '/settings', '/en/settings', '/about', '/privacy', '/auth/sign-in'];

test.describe('reflow and text size (SPEC §10)', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone widths only');

  test('320 px wide: no horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of REFLOW_PATHS) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('text at 200 %: no horizontal scrolling', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = '200%';
      });
    });
    for (const path of REFLOW_PATHS) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.style.fontSize)).toBe('200%');
      // Measured once the page has settled (hydration, loaded fonts).
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: path, timeout: 5000 })
        .toBeLessThanOrEqual(0);
    }
  });
});
