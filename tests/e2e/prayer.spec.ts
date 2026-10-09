import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Phase 8: prayer times (SPEC §7.16), qibla (§7.17), Hijri calendar (§7.18); SPEC §15 step 8.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Counts geolocation requests; the app must never ask on load. */
async function watchGeolocation(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { geoCalls: number };
    w.geoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) => {
          w.geoCalls++;
          ok({ coords: { latitude: 21.4225, longitude: 39.8262, accuracy: 50 } } as GeolocationPosition);
        },
        watchPosition: () => {
          w.geoCalls++;
          return 0;
        },
        clearWatch: () => undefined,
      },
    });
  });
}
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls);

test.describe('prayer times (SPEC §7.16)', () => {
  test('set a city: times render with a next-prayer countdown; nothing asks for the location on load', async ({ page }) => {
    await watchGeolocation(page);
    await page.goto('/prayer');
    await page.getByLabel('ابحث عن مدينة').fill('Riyadh');
    await page.getByRole('list', { name: 'المدن المطابقة' }).getByRole('button').first().click();
    const next = page.getByTestId('next-prayer');
    await expect(next).toContainText('الصلاة القادمة');
    await expect(next).toContainText(/الفجر|الظهر|العصر|المغرب|العشاء/);
    const first = await page.getByTestId('countdown').textContent();
    await expect.poll(async () => page.getByTestId('countdown').textContent(), { timeout: 4000 }).not.toBe(first);
    for (const p of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) await expect(page.locator(`[data-prayer="${p}"]`)).toHaveText(/\d/);
    await expect(page.getByText('Asia/Riyadh')).toBeVisible();

    // The place stays on the device: after a reload it is still chosen.
    await page.reload();
    await expect(page.getByTestId('next-prayer')).toBeVisible();
    expect(await geoCalls(page)).toBe(0);

    // Method follows the country (Saudi Arabia → Umm al-Qura) and can be changed.
    await page.getByText('طريقة الحساب').click();
    await expect(page.getByLabel('الطريقة')).toHaveValue('auto');
    await expect(page.getByLabel('الطريقة').locator('option[value="auto"]')).toContainText('أم القرى');
  });

  test('“Use my location” asks only after the tap', async ({ page }) => {
    await watchGeolocation(page);
    await page.goto('/en/prayer');
    expect(await geoCalls(page)).toBe(0);
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.getByTestId('next-prayer')).toBeVisible();
    expect(await geoCalls(page)).toBe(1);
  });

  test('axe: prayer times', async ({ page }) => {
    await page.goto('/prayer');
    await page.getByLabel('ابحث عن مدينة').fill('Cairo');
    await page.getByRole('list', { name: 'المدن المطابقة' }).getByRole('button').first().click();
    await expect(page.getByTestId('next-prayer')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('qibla (SPEC §7.17) and Hijri calendar (§7.18)', () => {
  test('qibla shows the bearing from true north and the distance; no sensor prompt on load', async ({ page }) => {
    await watchGeolocation(page);
    await page.goto('/en/qibla');
    await page.getByLabel('Search for a city').fill('London');
    await page.getByRole('list', { name: 'Matching cities' }).getByRole('button', { name: /^London England/ }).click();
    await expect(page.getByTestId('qibla-bearing')).toHaveText(/^1[12]\d(\.\d)?° from true north$/);
    await expect(page.getByText(/Distance to Makkah: [\d,]+ km/)).toBeVisible();
    await expect(page.getByText('magnetic declination', { exact: false })).toBeVisible();
    expect(await geoCalls(page)).toBe(0);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('calendar: today in both calendars, a month grid, expected dates, adjustment', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-09T10:00:00'));
    await page.goto('/calendar');
    await expect(page.getByTestId('hijri-today')).toContainText('ربيع الآخر');
    await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
    await expect(page.locator('[data-event]')).toHaveCount(6);
    await expect(page.locator('[data-event="ramadan"]')).toContainText('تاريخ متوقّع — يعتمد على رؤية الهلال');
    const before = await page.getByTestId('hijri-today').textContent();
    await page.locator('label.choice-chip', { hasText: '+١' }).click();
    await expect(page.getByTestId('hijri-today')).not.toHaveText(before ?? '');
    await page.reload();
    await expect(page.getByTestId('hijri-today')).not.toHaveText(before ?? '');
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
