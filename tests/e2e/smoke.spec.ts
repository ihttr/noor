import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('Arabic is the default at / (RTL), even for an English browser', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: 'نور' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
  });

  test('English lives at /en (LTR)', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1, name: 'Noor' })).toBeVisible();
  });

  test('navigation keeps the locale and marks the current page', async ({ page }) => {
    await page.goto('/en');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Quran' }).click();
    await expect(page).toHaveURL(/\/en\/quran$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Quran' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Quran' })).toHaveAttribute('aria-current', 'page');
  });

  test('language switch goes to the same page in the other language', async ({ page }) => {
    await page.goto('/quran');
    await page.getByRole('link', { name: 'التبديل إلى الإنجليزية' }).first().click();
    await expect(page).toHaveURL(/\/en\/quran$/);
    await page.getByRole('link', { name: 'Switch to Arabic' }).first().click();
    await expect(page).toHaveURL(/\/quran$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('theme choice applies before paint and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'سيبيا (للقراءة)' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    await expect(page.getByRole('radio', { name: 'سيبيا (للقراءة)' })).toBeChecked();
  });

  test('unknown pages show the localized not-found page inside the shell', async ({ page }) => {
    const response = await page.goto('/en/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });

  test('private pages are not indexed', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
