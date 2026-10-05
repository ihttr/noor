import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };
import type { SurahFile } from '../../src/lib/quran/types';

// SPEC §2.6 rendering test: the DOM textContent of every rendered ayah text element (ayah numbers
// and marks are separate elements) must equal the source string exactly, code point for code
// point. Expected strings come from content/, which `npm run content:verify` proves equal to the
// approved Tanzil source.

const surahFile = (n: number): SurahFile =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${n}.json`), 'utf8')) as SurahFile;
const slug = (n: number) => slugs.surahs[n - 1]!.slug;

async function renderedAyahs(page: Page) {
  return page.locator('[data-ayah-text]').evaluateAll((els) =>
    els.map((el) => ({ key: (el as HTMLElement).dataset.ayahText, text: el.textContent, children: el.childElementCount }))
  );
}

const SURAHS = [1, 2, 9, 18, 36, 112, 113, 114];

test.describe('DOM rendering integrity (SPEC §2.6)', () => {
  for (const n of SURAHS) {
    test(`surah ${n}: rendered ayah text equals the source`, async ({ page }) => {
      await page.goto(`/quran/${slug(n)}`);
      const file = surahFile(n);
      const rendered = await renderedAyahs(page);
      expect(rendered.map((r) => r.key)).toEqual(file.ayahs.map((a) => `${n}:${a.number}`));
      rendered.forEach((r, i) => {
        expect(r.children, `${r.key} must contain only text`).toBe(0);
        expect(r.text === file.ayahs[i]!.text, `${r.key} differs from the source`).toBe(true);
      });
      const basmala = await page.locator('[data-basmala]').allTextContents();
      expect(basmala).toEqual(file.bismillah === null ? [] : [file.bismillah]);
    });
  }

  test('English UI renders the same Quran text (surah 36)', async ({ page }) => {
    await page.goto(`/en/quran/${slug(36)}`);
    const rendered = await renderedAyahs(page);
    expect(rendered.map((r) => r.text)).toEqual(surahFile(36).ayahs.map((a) => a.text));
    await expect(page.locator('.quran-flow')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('.quran-flow')).toHaveAttribute('dir', 'rtl');
  });

  for (const pageNumber of [1, 2, 604]) {
    test(`Mushaf page ${pageNumber}: rendered ayah text equals the source`, async ({ page }) => {
      await page.goto(`/mushaf/page/${pageNumber}`);
      const expected = Array.from({ length: 114 }, (_, i) => i + 1).flatMap((n) =>
        surahFile(n)
          .ayahs.filter((a) => a.page === pageNumber)
          .map((a) => ({ key: `${n}:${a.number}`, text: a.text }))
      );
      const rendered = await renderedAyahs(page);
      expect(rendered.map((r) => ({ key: r.key, text: r.text }))).toEqual(expected);
    });
  }
});
