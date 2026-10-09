import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Phase 9: optional accounts and sync (SPEC §5, §7.19). The e2e web server runs with a
// throw-away PGlite database and writes account emails to .cache/mail-outbox.jsonl.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PASSWORD = 'correct horse battery';

let counter = 0;
const uniqueEmail = () => `e2e-${Date.now().toString(36)}-${process.pid}-${++counter}@example.com`;
/** Each browser gets its own client address, like separate people (Better Auth rate-limits per IP). */
const newDevice = (browser: Browser, viewport = { width: 1440, height: 900 }): Promise<BrowserContext> =>
  browser.newContext({
    viewport,
    extraHTTPHeaders: { 'x-forwarded-for': `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 1}` },
  });

async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/en/auth/sign-up');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/settings$/, { timeout: 20_000 });
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.locator('[data-sync-state]')).toContainText('Last synced', { timeout: 15_000 });
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/en/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/en\/settings$/, { timeout: 20_000 });
  await expect(page.locator('[data-sync-state]')).toContainText('Last synced', { timeout: 15_000 });
}

async function syncNow(page: Page) {
  await page.goto('/en/settings');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.locator('[data-sync-state]')).toHaveAttribute('data-sync-state', 'ok', { timeout: 15_000 });
}

async function savePage(page: Page, n: number) {
  await page.goto(`/en/mushaf/page/${n}`);
  const bookmark = page.getByRole('button', { name: `Save page ${n}` });
  await expect(bookmark).toBeEnabled();
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
}

/** The account section's status line on Settings (the offline panel has its own). */
const accountStatus = (page: Page) => page.getByRole('region', { name: 'Account & sync' }).getByRole('status');
/** The form's error line (Next's route announcer is also role=alert). */
const formError = (page: Page) => page.locator('form [role="alert"]');
const savedList = (page: Page) => page.getByRole('list', { name: 'Saved items' });

test.describe('accounts and sync (SPEC §5, §7.19)', () => {
  test.setTimeout(90_000);
  // One flow per test; the viewport projects do not matter here.
  test.skip(({ isMobile }) => isMobile, 'account flows run once (desktop project)');

  test('guest data is merged on sign-up and reaches a second device; edits sync both ways', async ({ browser }) => {
    const email = uniqueEmail();
    const a = await newDevice(browser);
    const pa = await a.newPage();
    await savePage(pa, 50);
    await signUp(pa, email);

    const b = await newDevice(browser, { width: 390, height: 844 });
    const pb = await b.newPage();
    await savePage(pb, 77); // guest data on the second device is merged too
    await signIn(pb, email);
    await pb.goto('/en/saved');
    await expect(savedList(pb).getByRole('link', { name: /^Page 50 · / })).toBeVisible();
    await expect(savedList(pb).getByRole('link', { name: /^Page 77 · / })).toBeVisible();

    // An edit on B appears on A after a sync; a removal on A reaches B (tombstone).
    await savePage(pb, 100);
    await syncNow(pb);
    await syncNow(pa);
    await pa.goto('/en/saved');
    await expect(savedList(pa).getByRole('link', { name: /^Page 100 · / })).toBeVisible();
    await expect(savedList(pa).getByRole('link', { name: /^Page 77 · / })).toBeVisible();
    await pa.goto('/en/mushaf/page/50');
    const bookmark = pa.getByRole('button', { name: 'Save page 50' });
    await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
    await bookmark.click();
    await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
    await syncNow(pa);
    await syncNow(pb);
    await pb.goto('/en/saved');
    await expect(savedList(pb).getByRole('link', { name: /^Page 100 · / })).toBeVisible();
    await expect(savedList(pb).getByRole('link', { name: /^Page 50 · / })).toHaveCount(0);

    await a.close();
    await b.close();
  });

  test('export my data, sign out (keep or wipe), then delete the account', async ({ browser }) => {
    const email = uniqueEmail();
    const ctx = await newDevice(browser);
    const page = await ctx.newPage();
    await savePage(page, 3);
    await signUp(page, email);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export account data (JSON)' }).click();
    const file = await (await download).path();
    const exported = JSON.parse(readFileSync(file, 'utf8')) as { account: { email: string }; data: { savedItems: { ref: string; type: string }[] } };
    expect(exported.account.email).toBe(email);
    expect(exported.data.savedItems.map((x) => `${x.type}:${x.ref}`)).toContain('PAGE:3');

    // Sign out keeps this device's data by default.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(accountStatus(page)).toHaveText('You are signed out.', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await page.goto('/en/saved');
    await expect(savedList(page).getByRole('link', { name: /^Page 3 · / })).toBeVisible();

    // Wrong password, then the account is deleted; the device keeps its data as guest data.
    await signIn(page, email);
    await page.getByText('Delete account').click();
    await page.getByLabel('Password').fill('wrong password!');
    await page.getByLabel('I understand that deletion is permanent').check();
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect(accountStatus(page)).toHaveText('Incorrect password.', { timeout: 15_000 });
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect(accountStatus(page)).toHaveText('The account and all its data were deleted from the server.', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
    await page.goto('/en/saved');
    await expect(savedList(page).getByRole('link', { name: /^Page 3 · / })).toBeVisible();

    // The account is gone: signing in fails.
    await page.goto('/en/auth/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(formError(page)).toHaveText('Incorrect email or password.', { timeout: 15_000 });
    await ctx.close();
  });

  test('signing out with "remove data" clears the device; another account never sees it', async ({ browser }) => {
    const ctx = await newDevice(browser);
    const page = await ctx.newPage();
    await signUp(page, uniqueEmail());
    await savePage(page, 9);
    await syncNow(page);
    await page.getByLabel('Also remove the account’s data from this device (shared device)').check();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(accountStatus(page)).toHaveText('You are signed out.', { timeout: 15_000 });
    await page.goto('/en/saved');
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
    await ctx.close();
  });

  test('password reset by email (mail outbox)', async ({ browser }) => {
    const email = uniqueEmail();
    const ctx = await newDevice(browser);
    const page = await ctx.newPage();
    await signUp(page, email);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(accountStatus(page)).toHaveText('You are signed out.', { timeout: 15_000 });

    await page.goto('/en/auth/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send link' }).click();
    await expect(page.getByRole('status')).toContainText('If this email is registered', { timeout: 15_000 });

    let link = '';
    await expect
      .poll(() => {
        const outbox = readFileSync(path.join(process.cwd(), '.cache', 'mail-outbox.jsonl'), 'utf8');
        const mail = outbox
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as { to: string; text: string })
          .findLast((m) => m.to === email);
        link = mail?.text.match(/https?:\/\/\S+/)?.[0] ?? '';
        return link;
      })
      .toMatch(/reset-password/);

    await page.goto(link);
    await expect(page).toHaveURL(/\/en\/auth\/reset-password\?token=/);
    await page.getByLabel('New password').fill('a brand new password');
    await page.getByLabel('Confirm password').fill('a brand new password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('status')).toContainText('Your password was changed', { timeout: 15_000 });
    // The link works once.
    await page.goto(link);
    await page.getByLabel('New password').fill('another new password');
    await page.getByLabel('Confirm password').fill('another new password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(formError(page)).toContainText('invalid or has expired', { timeout: 15_000 });

    await signIn(page, email, 'a brand new password');
    await ctx.close();
  });

  test('the sync endpoint refuses requests without a session or from another origin', async ({ request }) => {
    const res = await request.post('/api/sync', { data: { cursor: null, changes: [] }, headers: { origin: 'http://localhost:3100' } });
    expect(res.status()).toBe(401);
    const cross = await request.post('/api/sync', { data: { cursor: null, changes: [] }, headers: { origin: 'https://evil.example' } });
    expect(cross.status()).toBe(403);
    expect((await request.get('/api/account/export')).status()).toBe(401);
  });
});

test.describe('account pages', () => {
  test('sign-in page in Arabic: labels, links, noindex, axe', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.getByLabel('البريد الإلكتروني')).toHaveAttribute('autocomplete', 'email');
    await expect(page.getByRole('link', { name: 'نسيت كلمة المرور؟' })).toHaveAttribute('href', '/auth/forgot-password');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeEnabled();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('settings show the guest state; mismatched passwords are caught before sending', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('أنت تستخدم نور دون حساب')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تصدير بيانات هذا الجهاز (JSON)' })).toBeVisible();
    await page.goto('/auth/sign-up');
    await page.getByLabel('البريد الإلكتروني').fill(uniqueEmail());
    await page.getByLabel('كلمة المرور', { exact: true }).fill('password-one');
    await page.getByLabel('تأكيد كلمة المرور').fill('password-two');
    await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
    await expect(formError(page)).toHaveText('كلمتا المرور غير متطابقتين.', { timeout: 15_000 });
  });

  test('without a database, accounts are shown as unavailable and the app still works', async ({ page }) => {
    await page.route('**/api/auth/get-session', (route) => route.fulfill({ status: 503, json: { error: 'accounts-disabled' } }));
    await page.goto('/settings');
    await expect(page.getByText('الحسابات غير متاحة على هذا الخادم')).toBeVisible();
    await page.goto('/auth/sign-in');
    await expect(page.getByText('الحسابات غير متاحة على هذا الخادم')).toBeVisible();
  });

  test('the device export works for guests', async ({ page }) => {
    await page.goto('/en/mushaf/page/12');
    const bookmark = page.getByRole('button', { name: 'Save page 12' });
    await bookmark.click();
    await expect(bookmark).toHaveAttribute('aria-pressed', 'true'); // saved before leaving the page
    await page.goto('/en/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export this device’s data (JSON)' }).click();
    const data = JSON.parse(readFileSync(await (await download).path(), 'utf8')) as { data: { savedItems: { ref: string }[] } };
    expect(data.data.savedItems.map((x) => x.ref)).toContain('12');
  });
});
