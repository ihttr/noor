import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };
import type { SurahFile } from '../../src/lib/quran/types';

// Phase 4: local-first store (SPEC §5), Continue Reading (§7.1), ayah menu (§7.5), Saved (§7.6),
// reading position and activity (§7.7).

const slug = (n: number) => slugs.surahs[n - 1]!.slug;
const surahFile = (n: number): SurahFile =>
  JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${n}.json`), 'utf8')) as SurahFile;
const ayahText = (s: number, a: number) => surahFile(s).ayahs[a - 1]!.text;
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** All rows of a table of the app's IndexedDB database (empty when it does not exist yet). */
function readTable<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    async (name) => {
      if (!(await indexedDB.databases()).some((d) => d.name === 'noor')) return [];
      return new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('noor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(name)) {
            db.close();
            return resolve([]);
          }
          const req = db.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => {
            resolve(req.result as T[]);
            db.close();
          };
          req.onerror = () => reject(req.error);
        };
      });
    },
    table
  );
}

test.describe('ayah menu (SPEC §7.5)', () => {
  test('the ayah number opens it (popover on desktop, sheet on phones); Escape returns focus', async ({ page, isMobile }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.locator('#ayah-1-2 .ayah-end').click();
    const menu = page.getByRole('dialog', { name: /الآية/ });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(isMobile ? /ayah-sheet/ : /ayah-popover/);
    await expect(menu.getByRole('button', { name: 'نسخ' })).toBeFocused();
    await expect(page.locator('#ayah-1-2')).toHaveAttribute('data-selected', '');
    // Opening the menu does not toggle the chrome.
    await expect(page.locator('html')).not.toHaveAttribute('data-chrome', 'hidden');
    for (const soon of ['الترجمة']) {
      await expect(menu.getByRole('button', { name: new RegExp(soon) })).toBeDisabled();
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await focusedId(page)).toBe('ayah-1-2');

    // Keyboard: Enter on the focused ayah opens the menu of that ayah.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /الآية/ })).toBeVisible();
    await expect(page.locator('#ayah-1-3')).toHaveAttribute('data-selected', '');
  });

  test('copy puts the exact ayah text and its reference on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/quran/${slug(2)}#ayah-2-255`);
    await page.locator('#ayah-2-255 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'نسخ' }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('نُسخت الآية مع مرجعها.');
    // The system clipboard may store the line break as CRLF (Windows); the text itself is exact.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    const expected = `${ayahText(2, 255)}\n[البقرة: ٢٥٥]`;
    if (copied !== expected) console.log(JSON.stringify({ copied: [...copied].length, expected: [...expected].length, tail: copied.slice(-24) }));
    expect(copied === expected).toBe(true);
  });

  test('share sends the text with a stable ayah link', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shared?: ShareData };
      Object.defineProperty(navigator, 'share', { value: async (data: ShareData) => void (w.shared = data), configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    });
    await page.goto(`/en/quran/${slug(112)}`);
    await page.locator('#ayah-112-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Share' }).click();
    const shared = await page.evaluate(() => (window as unknown as { shared?: ShareData }).shared);
    expect(shared?.url).toMatch(new RegExp(`/en/quran/${slug(112)}/1$`));
    expect(shared?.text === `${ayahText(112, 1)}\n[Al-Ikhlaas 112:1]`).toBe(true);
  });

  test('axe: the open menu has no WCAG A/AA violations', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.locator('#ayah-1-1 .ayah-end').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('saved items, collections and notes (SPEC §7.6)', () => {
  test('save an ayah with a collection and a note, then find, filter, remove and undo on the Saved page', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto(`/quran/${slug(2)}#ayah-2-255`);
    await page.locator('#ayah-2-255 .ayah-end').click();
    const menu = page.getByRole('dialog', { name: /الآية/ });
    await menu.getByRole('button', { name: 'حفظ' }).click();
    await expect(menu.getByRole('button', { name: 'محفوظة' })).toHaveAttribute('aria-pressed', 'true');

    await menu.getByLabel('المجموعة', { exact: true }).selectOption({ label: '+ مجموعة جديدة…' });
    await menu.getByPlaceholder('اسم المجموعة الجديدة').fill('مهم');
    await menu.getByRole('button', { name: 'إضافة' }).click();
    await expect(menu.getByLabel('المجموعة', { exact: true })).toHaveValue(/.+/);

    await menu.getByRole('button', { name: 'ملاحظة' }).click();
    await menu.getByLabel('ملاحظة خاصة').fill('آية الكرسي — للمراجعة');
    await menu.getByRole('button', { name: 'حفظ الملاحظة' }).click();
    await expect(menu.getByRole('status')).toHaveText('حُفظت الملاحظة.');
    await expect(menu).toContainText('آية الكرسي — للمراجعة');
    await page.keyboard.press('Escape');
    await expect(page.locator('#ayah-2-255')).toHaveAttribute('data-saved', '');
    await expect(page.locator('#ayah-2-255')).toHaveAttribute('data-noted', '');

    // A note without saving (SPEC §7.6).
    await page.locator('#ayah-2-256 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'ملاحظة' }).click();
    await page.getByRole('dialog').getByLabel('ملاحظة خاصة').fill('Note only');
    await page.getByRole('dialog').getByRole('button', { name: 'حفظ الملاحظة' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#ayah-2-256')).not.toHaveAttribute('data-saved', '');

    await page.goto('/saved');
    const list = page.getByRole('list', { name: 'العناصر المحفوظة' });
    const card = list.getByRole('article').filter({ hasText: 'آية الكرسي' });
    await expect(card).toContainText('مهم');
    // The ayah text on the Saved page equals the source (SPEC §2.6).
    expect((await card.locator('[data-ayah-text="2:255"]').textContent()) === ayahText(2, 255)).toBe(true);
    await expect(list.getByRole('article')).toHaveCount(2);

    await page.locator('label.choice-chip', { hasText: 'بملاحظة' }).click();
    await expect(list.getByRole('article')).toHaveCount(2);
    await page.getByLabel('تصفية بالمجموعة').selectOption({ label: 'مهم' });
    await expect(list.getByRole('article')).toHaveCount(1);
    await page.getByLabel('تصفية بالمجموعة').selectOption({ label: 'كل المجموعات' });
    await page.getByRole('searchbox').fill('كرسي');
    await expect(list.getByRole('article')).toHaveCount(1);
    await page.getByRole('searchbox').fill('البقره ٢٥٦');
    await expect(list.getByRole('article')).toHaveCount(1);
    await expect(list.getByRole('article')).toContainText('Note only');
    await page.getByRole('searchbox').fill('لا يوجد شيء كهذا');
    await page.getByRole('button', { name: 'مسح التصفية' }).click();
    await expect(list.getByRole('article')).toHaveCount(2);

    await card.getByRole('button', { name: 'إزالة من المحفوظات' }).click();
    await expect(page.getByRole('status').first()).toContainText('أُزيل');
    // The note stays when the item is removed (D-046).
    await expect(card).toContainText('ملاحظة فقط');
    await page.getByRole('button', { name: 'تراجع' }).click();
    await expect(card).toContainText('مهم');

    // Collections: rename and delete (items stay saved without a collection).
    await page.getByRole('button', { name: 'إدارة المجموعات' }).click();
    const dialog = page.getByRole('dialog', { name: 'المجموعات' });
    await dialog.getByRole('button', { name: 'حذف مجموعة «مهم»' }).click();
    await expect(dialog).toContainText('لا توجد مجموعات بعد');
    await dialog.getByRole('button', { name: 'إغلاق' }).click();
    await expect(card).toContainText('بدون مجموعة');
  });

  test('toolbar bookmark saves the Mushaf page; English UI lists it', async ({ page }) => {
    await page.goto('/en/mushaf/page/50');
    const bookmark = page.getByRole('button', { name: 'Save page 50' });
    await expect(bookmark).toBeEnabled();
    await bookmark.click();
    await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/en/saved');
    await expect(page.getByRole('list', { name: 'Saved items' }).getByRole('link', { name: /^Page 50 · / })).toHaveAttribute(
      'href',
      '/en/mushaf/page/50'
    );
  });

  test('empty state and axe on the Saved page', async ({ page }) => {
    await page.goto('/saved');
    await expect(page.getByText('لا توجد محفوظات بعد.')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe('reading position and Continue Reading (SPEC §7.1, §7.7, §15 step 3)', () => {
  test('Continue Reading lands on the same ayah in a fresh context with the same storage', async ({ page, browser }) => {
    await page.goto('/');
    await expect(page.getByText('لا يوجد موضع قراءة محفوظ')).toBeVisible();

    await page.goto(`/quran/${slug(18)}`);
    await page.locator('#ayah-18-30').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.mouse.wheel(0, 40);
    // The position (the ayah being read at the top) is saved about 1 s after scrolling stops.
    type Position = { surah: number; ayah: number; mode: string };
    await expect
      .poll(async () => (await readTable<Position>(page, 'readingPositions'))[0], { timeout: 10_000 })
      .toMatchObject({ surah: 18, mode: 'READING' });
    const [stored] = await readTable<Position>(page, 'readingPositions');
    expect([29, 30]).toContain(stored!.ayah);
    const id = `ayah-18-${stored!.ayah}`;

    const state = await page.context().storageState({ indexedDB: true });
    const { baseURL, viewport, isMobile, hasTouch } = test.info().project.use;
    const fresh = await browser.newContext({ storageState: state, baseURL, viewport, isMobile, hasTouch });
    const again = await fresh.newPage();
    await again.goto('/');
    const card = again.getByTestId('continue-reading');
    await expect(card).toContainText('سورة الكهف');
    await card.click();
    await expect(again).toHaveURL(new RegExp(`/quran/${slug(18)}#${id}$`));
    await expect.poll(() => focusedId(again)).toBe(id);
    // Reopening a position does not move it: once the reader settles, the same ayah is saved.
    await again.waitForTimeout(2500);
    expect((await readTable<Position>(again, 'readingPositions'))[0]).toMatchObject({ surah: 18, ayah: stored!.ayah });
    await fresh.close();
  });

  test('Mushaf position: Continue Reading reopens the same page in Mushaf mode', async ({ page }) => {
    await page.goto('/mushaf/page/300');
    await expect.poll(async () => (await readTable<{ page: number; mode: string }>(page, 'readingPositions'))[0]).toMatchObject({
      page: 300,
      mode: 'MUSHAF',
    });
    await page.goto('/');
    await page.getByTestId('continue-reading').click();
    await expect(page).toHaveURL(/\/mushaf\/page\/300#ayah-\d+-\d+$/);
  });
});

test.describe('reading settings in the local store (D-044)', () => {
  test('settings come back from IndexedDB when the boot copy is lost', async ({ page }) => {
    await page.goto(`/quran/${slug(1)}`);
    await page.getByRole('button', { name: 'إعدادات القراءة' }).click();
    await page.getByText('شهرزاد الجديد').click();
    await expect
      .poll(async () => ((await readTable<{ data: { reader?: { font: string } } }>(page, 'preferences'))[0]?.data.reader?.font))
      .toBe('scheherazade');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-quran-font', 'scheherazade');
    expect(await page.evaluate(() => localStorage.getItem('noor:reader'))).toContain('scheherazade');
  });
});

test.describe('page read and reading time (SPEC §7.7)', () => {
  type Day = { date: string; pagesRead: number[]; secondsRead: number };

  test('a Mushaf page counts after 15 s on screen; time counts only with recent activity', async ({ page }) => {
    await page.clock.install();
    await page.goto('/mushaf/page/3');
    // The tracker starts when the page is idle; let fake time pass in small steps until it runs.
    await expect
      .poll(async () => {
        await page.clock.runFor(1000);
        return (await readTable<Day>(page, 'readingDays'))[0]?.pagesRead;
      }, { timeout: 30_000 })
      .toEqual([3]);

    // 3 minutes without any input: only the first 60 s (activity window) count.
    await page.clock.runFor(180_000);
    await expect.poll(async () => (await readTable<Day>(page, 'readingDays'))[0]?.secondsRead).toBeGreaterThanOrEqual(45);
    const idle = (await readTable<Day>(page, 'readingDays'))[0]!.secondsRead;
    expect(idle).toBeLessThanOrEqual(65);

    // Activity: the next 46 s count (saved every 15 s).
    await page.mouse.wheel(0, 10);
    await page.clock.runFor(46_000);
    await expect.poll(async () => (await readTable<Day>(page, 'readingDays'))[0]?.secondsRead).toBeGreaterThanOrEqual(idle + 30);
    expect((await readTable<Day>(page, 'readingDays'))[0]!.secondsRead).toBeLessThanOrEqual(idle + 47);
  });

  test('reading mode: a page counts when half of its ayahs were visible for 15 s', async ({ page }) => {
    await page.clock.install();
    await page.goto(`/quran/${slug(1)}`);
    await expect
      .poll(async () => {
        await page.clock.runFor(1000);
        return (await readTable<Day>(page, 'readingDays'))[0]?.pagesRead;
      }, { timeout: 30_000 })
      .toEqual([1]);
  });
});
