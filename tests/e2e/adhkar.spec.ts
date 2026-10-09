import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { AdhkarCategoryFile } from '../../src/lib/adhkar/types';
import type { SurahFile } from '../../src/lib/quran/types';

// Phase 7: adhkar (SPEC §7.14) and tasbih (§7.15); SPEC §15 journey steps 6–7.

const json = <T,>(p: string) => JSON.parse(readFileSync(path.join(process.cwd(), p), 'utf8')) as T;
const morning = json<AdhkarCategoryFile>('content/adhkar/morning.json');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('adhkar (SPEC §7.14)', () => {
  test('texts are shown as imported; Ayat al-Kursi comes from the Mushaf text', async ({ page }) => {
    await page.goto('/adhkar/morning');
    await expect(page.locator('.dhikr-card')).toHaveCount(morning.items.length);
    const first = morning.items[0]!;
    const firstText = first.parts[0]!.kind === 'text' ? first.parts[0]!.text : '';
    expect((await page.locator(`[data-dhikr-text="${first.id}"]`).first().textContent()) === firstText).toBe(true);
    const kursi = json<SurahFile>('content/quran/surah/2.json').ayahs[254]!.text;
    expect((await page.locator('#dhikr-morning-2 [data-ayah-text="2:255"]').textContent()) === kursi).toBe(true);
    await expect(page.locator('#dhikr-morning-1')).toContainText('المرجع');
  });

  test('the counter counts taps on the whole card, persists across reloads, and −1 / reset work', async ({ page }) => {
    await page.goto('/adhkar/morning');
    const item = morning.items.find((d) => d.count === 3)!;
    const card = page.locator(`#dhikr-${item.id.replace(':', '-')}`);
    const counter = card.getByRole('button', { name: /^عدّ/ });
    // Counting starts once today's saved counts are loaded.
    await expect(counter).toBeEnabled();
    await card.locator('.dhikr-text').click();
    await counter.click();
    await expect(counter).toHaveAccessibleName(/٢ \/ ٣/);
    await page.reload();
    await expect(card.getByRole('button', { name: /^عدّ/ })).toHaveAccessibleName(/٢ \/ ٣/);
    await card.getByRole('button', { name: 'إنقاص واحد' }).click();
    await expect(card.getByRole('button', { name: /^عدّ/ })).toHaveAccessibleName(/١ \/ ٣/);
    await card.getByRole('button', { name: /^عدّ/ }).click();
    await card.getByRole('button', { name: /^عدّ/ }).click();
    await expect(card).toHaveAttribute('data-done', 'true');
    await expect(card.getByRole('button', { name: /^عدّ/ })).toHaveAccessibleName(/تمّ/);
    await card.getByRole('button', { name: 'إعادة العدّ' }).click();
    await expect(card.getByRole('button', { name: /^عدّ/ })).toHaveAccessibleName(/٠ \/ ٣/);
  });

  test('today’s state on the home page; categories without a source say so', async ({ page }) => {
    await page.goto('/adhkar/morning');
    const one = morning.items.find((d) => d.count === 1)!;
    await page.locator(`#dhikr-${one.id.replace(':', '-')}`).getByRole('button', { name: /^عدّ/ }).click();
    await page.goto('/');
    await expect(page.locator('[data-category="morning"]')).toContainText(`١ من ${(morning.items.length).toLocaleString('ar-u-nu-arab')}`);
    await expect(page.locator('[data-category="after-prayer"]')).toContainText('لا يوجد مصدر معتمد بعد');
    await page.goto('/adhkar/travel');
    await expect(page.getByText('لا توجد بعدُ مجموعة أذكار معتمدة')).toBeVisible();
  });

  test('English shows the dataset translation and reference', async ({ page }) => {
    await page.goto('/en/adhkar/evening');
    await expect(page.locator('.dhikr-translation').first()).toBeVisible();
    await expect(page.locator('.dhikr-reference').first()).toContainText('Reference');
  });

  test('axe: morning adhkar', async ({ page }) => {
    await page.goto('/adhkar/morning');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('tasbih (SPEC §7.15)', () => {
  test('counts toward a target, persists across reloads, −1 and reset with confirmation', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/tasbih');
    const plus = page.getByRole('button', { name: /^زيادة واحد/ });
    await plus.click();
    await plus.click();
    await plus.click();
    await expect(plus).toHaveAccessibleName(/٣ \/ ٣٣/);
    await page.reload();
    await expect(page.getByRole('button', { name: /^زيادة واحد/ })).toHaveAccessibleName(/٣ \/ ٣٣/);
    await page.getByRole('button', { name: 'إنقاص واحد' }).click();
    await expect(page.getByRole('button', { name: /^زيادة واحد/ })).toHaveAccessibleName(/٢ \/ ٣٣/);

    await page.locator('label.choice-chip', { hasText: '١٠٠' }).click();
    await expect(page.getByRole('button', { name: /^زيادة واحد/ })).toHaveAccessibleName(/٢ \/ ١٠٠/);
    await page.getByRole('button', { name: 'إعادة العدّ' }).click();
    await expect(page.getByRole('button', { name: /^زيادة واحد/ })).toHaveAccessibleName(/٠ \/ ١٠٠/);
    await expect(page.getByRole('heading', { name: 'آخر الجلسات' })).toBeVisible();
    await expect(page.locator('li', { hasText: '٢ / ١٠٠' })).toBeVisible();
  });

  test('axe: tasbih', async ({ page }) => {
    await page.goto('/en/tasbih');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
