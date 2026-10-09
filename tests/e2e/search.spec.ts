import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };
import type { SurahFile } from '../../src/lib/quran/types';
import type { TafsirSurahFile } from '../../src/lib/tafsir/types';

// Phase 5: Quran search (SPEC §7.8), command palette, tafsir (§7.10), translations (§7.9).

const slug = (n: number) => slugs.surahs[n - 1]!.slug;
const read = <T,>(p: string) => JSON.parse(readFileSync(path.join(process.cwd(), 'content', p), 'utf8')) as T;
const ayahText = (s: number, a: number) => read<SurahFile>(`quran/surah/${s}.json`).ayahs[a - 1]!.text;
const tafsirText = (s: number, a: number) => read<TafsirSurahFile>(`tafsir/muyassar/surah/${s}.json`).entries[a - 1]!.text;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('Quran search (SPEC §7.8)', () => {
  test('phrase search highlights the words without changing the Uthmani text', async ({ page }) => {
    await page.goto('/search?q=الحي القيوم');
    await expect(page.getByRole('status').filter({ hasText: /نتيج/ })).toContainText('نتيجتان');
    const results = page.getByRole('list', { name: 'نتائج البحث' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    const first = page.locator('[data-search-text="2:255"]');
    await expect(first.locator('mark')).toHaveCount(1);
    expect((await first.textContent()) === ayahText(2, 255)).toBe(true);
    await results.first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(2)}#ayah-2-255$`));
  });

  test('normalization, modes and filters', async ({ page }) => {
    await page.goto('/search');
    const box = page.getByRole('searchbox', { name: 'كلمة أو عبارة' });
    await box.fill('الكهْف');
    await expect(page.locator('[data-search-text="18:9"]')).toBeVisible();
    await box.fill('حي القيوم');
    await expect(page.getByText('لا توجد آيات مطابقة', { exact: false })).toBeVisible();
    await page.locator('label.choice-chip', { hasText: 'أجزاء الكلمات' }).click();
    await expect(page.locator('[data-search-text="20:111"]')).toBeVisible();
    await page.getByLabel('السورة').selectOption({ value: '3' });
    await expect(page.getByRole('list', { name: 'نتائج البحث' }).getByRole('listitem')).toHaveCount(1);
    await expect(page).toHaveURL(/surah=3/);
  });

  test('axe: search page with results', async ({ page }) => {
    await page.goto('/en/search?q=الكهف');
    await expect(page.getByRole('list', { name: 'Search results' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('command palette (Ctrl/Cmd + K)', () => {
  test('jumps to an ayah, a page and a surah; runs settings; Escape closes', async ({ page }) => {
    await page.goto('/');
    // The shortcut works once the page is hydrated (the daily-progress card renders after that).
    await expect(page.getByTestId('daily-progress')).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'لوحة الأوامر' });
    const input = palette.getByRole('combobox');
    await expect(input).toBeFocused();
    await input.fill('٢:٢٥٥');
    await expect(palette.getByRole('option').first()).toContainText('البقرة');
    await input.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(2)}#ayah-2-255$`));

    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('صفحة 50');
    await page.getByRole('combobox').press('Enter');
    await expect(page).toHaveURL(/\/mushaf\/page\/50$/);

    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('كهف');
    await expect(page.getByRole('option', { name: 'سورة الكهف' })).toBeVisible();
    await page.getByRole('combobox').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/quran/${slug(18)}$`));

    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('سيبيا');
    await page.getByRole('combobox').press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'لوحة الأوامر' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'لوحة الأوامر' })).toBeHidden();
  });

  test('the header search button opens it; a query offers a full Quran search', async ({ page }) => {
    await page.goto('/en/quran');
    // Hydrated (React has attached to the page), so the click opens the palette instead of navigating.
    await page.waitForFunction(() => Object.keys(document.body).some((k) => k.startsWith('__react')));
    await page.getByRole('link', { name: /^Search/ }).filter({ visible: true }).first().click();
    const input = page.getByRole('dialog', { name: 'Command palette' }).getByRole('combobox');
    await input.fill('mercy');
    await page.getByRole('option', { name: /Search the Quran for/ }).click();
    await expect(page).toHaveURL(/\/en\/search\?q=mercy$/);
  });

  test('axe: open palette', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('daily-progress')).toBeVisible(); // hydrated: the shortcut is active
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('الفاتحة');
    await expect(page.getByRole('option').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('tafsir (SPEC §7.10) and translations (§7.9)', () => {
  test('the ayah menu opens al-Muyassar, verbatim and with its source; it can be saved', async ({ page }) => {
    await page.goto(`/quran/${slug(112)}`);
    await page.locator('#ayah-112-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'التفسير' }).click();
    const panel = page.getByRole('dialog', { name: /تفسير الإخلاص/ });
    await expect(panel).toBeVisible();
    const text = panel.locator('[data-tafsir-text="muyassar:112:1"]');
    await expect(text).toBeVisible();
    expect((await text.textContent()) === tafsirText(112, 1)).toBe(true);
    await expect(panel).toContainText('التفسير الميسر — مجمع الملك فهد لطباعة المصحف الشريف');
    await expect(panel.getByRole('link', { name: 'QuranEnc.com' })).toBeVisible();
    expect((await panel.locator('[data-ayah-text="112:1"]').textContent()) === ayahText(112, 1)).toBe(true);

    await panel.getByRole('button', { name: 'الآية التالية' }).click();
    await expect(panel.locator('[data-tafsir-text="muyassar:112:2"]')).toBeVisible();
    await panel.getByRole('button', { name: 'حفظ التفسير' }).click();
    await expect(panel.getByRole('button', { name: 'محفوظ' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    await page.goto('/saved');
    await expect(page.getByRole('list', { name: 'العناصر المحفوظة' })).toContainText(/تفسير الإخلاص · الآية/);
  });

  test('axe: tafsir panel', async ({ page }) => {
    await page.goto(`/en/quran/${slug(1)}`);
    await page.locator('#ayah-1-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tafsir' }).click();
    await expect(page.locator('[data-tafsir-text="muyassar:1:1"]')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('reading settings say honestly that no translation is approved yet', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.getByRole('button', { name: 'إعدادات القراءة' }).click();
    await expect(page.getByText('لا توجد ترجمة معتمدة بعد.', { exact: false })).toBeVisible();
  });
});
