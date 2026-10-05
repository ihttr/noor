import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const theme of ['light', 'dark', 'sepia', 'black'] as const) {
  for (const path of ['/', '/en', '/settings', '/en/more', '/quran', '/quran/al-faatiha', '/en/quran/yaseen', '/mushaf/page/2', '/about']) {
    test(`axe: ${path} in ${theme} theme has no WCAG A/AA violations`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('noor:theme', t), theme);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
