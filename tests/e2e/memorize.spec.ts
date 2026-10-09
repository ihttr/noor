import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { SurahFile } from '../../src/lib/quran/types';

// Phase 10: memorization (SPEC §7.12), goals, consistency and statistics (§7.13), Home daily
// progress and quick access (§7.1).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ayahText = (s: number, a: number) =>
  (JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${s}.json`), 'utf8')) as SurahFile).ayahs[a - 1]!.text;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local date `n` days before today (the browser runs on this machine's time zone). */
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
let seq = 0;
const base = () => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null });
/** Matches a number in either Western or Arabic-Indic digits (the UI digit style is D-039). */
const num = (n: number) =>
  String(n)
    .split('')
    .map((d) => `[${d}${'٠١٢٣٤٥٦٧٨٩'[Number(d)]}]`)
    .join('');

/** Writes records straight into the app's IndexedDB (after the app created it), then reloads. */
async function seed(page: Page, table: string, records: unknown[]) {
  await page.evaluate(
    ({ table, records }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('noor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(table, 'readwrite');
          for (const r of records) tx.objectStore(table).put(r);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { table, records }
  );
  await page.reload();
}

const ayahP = (page: Page) => page.locator('[data-ayah-text]');

test.describe('memorization (SPEC §7.12)', () => {
  test('add a range, practice with every mask (text untouched), reveal, grade through a session', async ({ page }) => {
    await page.goto('/en/memorize');
    await expect(page.getByText('No ayahs in memorization yet.')).toBeVisible();
    await page.getByLabel('Surah', { exact: true }).selectOption('1');
    await expect(page.getByLabel('To ayah')).toHaveValue('7');
    await page.getByLabel('From ayah').fill('1');
    await page.getByLabel('To ayah').fill('3');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Added 3 ayahs of Al-Faatiha.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('These ayahs are already in memorization.');
    await expect(page.getByText('3 ayahs are due for review.')).toBeVisible();
    await expect(page.getByText('Al-Faatiha — memorized 0/7 ayahs (0%)')).toBeVisible();

    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByRole('heading', { name: 'Al-Faatiha · Ayah 1' })).toBeVisible();
    for (const mode of ['Show all', 'Hide all', 'First letter', 'Every other word']) {
      await page.getByLabel(mode).check();
      // The mask is display only: the DOM text equals the stored ayah exactly (SPEC §2.6).
      expect((await ayahP(page).textContent()) === ayahText(1, 1)).toBe(true);
    }
    await page.getByLabel('Hide all').check();
    const words = page.getByRole('button', { name: /^Reveal word/ });
    await expect(words).toHaveCount(4);
    await words.first().click();
    await expect(words).toHaveCount(3);
    await words.first().focus();
    await page.keyboard.press('Enter');
    await expect(words).toHaveCount(2);
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(words).toHaveCount(0);
    expect((await ayahP(page).textContent()) === ayahText(1, 1)).toBe(true);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    await page.getByRole('button', { name: 'Knew it' }).click();
    await expect(page.getByRole('heading', { name: 'Al-Faatiha · Ayah 2' })).toBeVisible();
    // The chosen mask is kept for the next ayah.
    await expect(page.getByLabel('Hide all')).toBeChecked();
    await page.getByRole('button', { name: 'Hesitant' }).click();
    await page.getByRole('button', { name: 'Didn’t know' }).click();
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('You reviewed 3 ayahs.');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Nothing is due today.')).toBeVisible();

    // The mask choice persists across reloads.
    await page.reload();
    await page.getByRole('button', { name: 'Practice' }).click();
    await expect(page.getByLabel('Hide all')).toBeChecked();
  });

  test('an ayah becomes memorized on its third successful review (interval ≥ 7 days); progress shows it', async ({ page }) => {
    await page.goto('/memorize');
    await expect(page.getByText('لم تُضف آيات للحفظ بعد.', { exact: false })).toBeVisible();
    const day = 86_400_000;
    await seed(page, 'memorizationItems', [
      { ...base(), surah: 112, ayah: 1, status: 'REVIEWING', ease: 2.5, intervalDays: 6, repetitions: 2, dueAt: Date.now() - day, lastReviewedAt: Date.now() - 6 * day },
      { ...base(), surah: 112, ayah: 2, status: 'NEW', ease: 2.5, intervalDays: 0, repetitions: 0, dueAt: Date.now() + 3 * day, lastReviewedAt: null },
    ]);
    await expect(page.getByText(new RegExp(`حُفظت ${num(0)} من ${num(4)} آية`))).toBeVisible();
    await page.getByRole('button', { name: 'ابدأ المراجعة' }).click();
    await expect(ayahP(page)).toHaveAttribute('data-ayah-text', '112:1');
    await page.getByRole('button', { name: 'عرفتها' }).click();
    // A new ayah is always due; "hesitant" counts as a success too.
    await page.getByRole('button', { name: 'تردّدت' }).click();
    await page.getByRole('button', { name: 'رجوع' }).click();
    await expect(page.getByText(new RegExp(`حُفظت ${num(1)} من ${num(4)} آية \\(${num(25)}`))).toBeVisible();
    await expect(page.getByRole('progressbar', { name: /المحفوظ من سورة/ })).toHaveAttribute('aria-valuenow', '1');

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'إزالة' }).click();
    await expect(page.getByRole('status')).toContainText('أُزيلت');
    await expect(page.getByText('لم تُضف آيات للحفظ بعد.', { exact: false })).toBeVisible();
  });
});

test.describe('goals, consistency and statistics (SPEC §7.13)', () => {
  test('daily goal, progress, streak (hideable), weekly chart, heatmap and totals; Home shows daily progress', async ({ page }) => {
    await page.goto('/en/stats');
    await expect(page.getByLabel('No goal')).toBeChecked();
    await seed(page, 'readingDays', [
      { ...base(), date: ago(0), pagesRead: [1, 2], secondsRead: 600 },
      { ...base(), date: ago(1), pagesRead: [3, 4, 5], secondsRead: 900 },
      { ...base(), date: ago(2), pagesRead: [6], secondsRead: 120 },
      { ...base(), date: ago(4), pagesRead: [7, 8], secondsRead: 300 },
    ]);
    await expect(page.getByTestId('streak')).toHaveText('Days in a row: 3');
    await expect(page.locator('[data-period="today"]')).toContainText('2 pages');
    await expect(page.locator('[data-stat="pagesRead"] dd')).toHaveText('8');
    await expect(page.locator('[data-stat="readingTime"] dd')).toHaveText('0 h 32 min');
    await expect(page.locator('[data-stat="surahsCompleted"] dd')).toHaveText('1'); // Al-Faatiha = page 1
    await expect(page.getByRole('list', { name: 'Last 7 days' }).getByRole('listitem')).toHaveCount(7);
    await expect(page.getByRole('img', { name: /Read on 4 days in the last 26 weeks/ })).toBeVisible();

    await page.getByLabel('5 pages').check();
    await expect(page.getByText('Your goal: 5 pages a day')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: /Today/ })).toHaveAttribute('aria-valuenow', '2');
    await page.getByLabel('Other number of pages').fill('12');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('Your goal: 12 pages a day')).toBeVisible();

    await page.getByLabel('Show days in a row').uncheck();
    await expect(page.getByTestId('streak')).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Show days in a row')).not.toBeChecked();
    await expect(page.getByTestId('streak')).toHaveCount(0);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    await page.goto('/en');
    const progress = page.getByTestId('daily-progress');
    await expect(progress).toContainText('2 of 12 pages');
    await expect(progress.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '12');
  });

  test('Home without a goal invites to set one; quick access links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('daily-progress')).toContainText('لم تقرأ اليوم بعد');
    await expect(page.getByRole('link', { name: 'حدّد هدفًا يوميًا' })).toHaveAttribute('href', '/stats#goal');
    const quick = page.getByRole('region', { name: 'وصول سريع' });
    for (const [name, href] of [
      ['القرآن', '/quran'],
      ['الأذكار', '/adhkar'],
      ['البحث', '/search'],
      ['المحفوظات', '/saved'],
      ['آخر قراءة', '/quran'],
    ] as const) {
      await expect(quick.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    await expect(quick.getByRole('button', { name: 'استماع' })).toBeVisible();
  });
});
