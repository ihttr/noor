import { expect, test, type Page } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };

// Phase 6: audio (SPEC §7.11) with the network mocked (SPEC §15 step 5). Every request to the
// audio CDN gets a short silent WAV, so playback runs through ayahs quickly and offline.

const slug = (n: number) => slugs.surahs[n - 1]!.slug;

function silentWav(seconds = 0.25): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(rate * seconds), 0x80);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function mockCdn(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route('https://cdn.islamic.network/**', async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() });
  });
  return requested;
}

test.describe('audio player (SPEC §7.11)', () => {
  test('plays from an ayah, moves on, highlights the ayah and survives navigation', async ({ page }) => {
    const requested = await mockCdn(page);
    await page.goto(`/quran/${slug(1)}`);
    await page.locator('#ayah-1-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'تشغيل من هنا' }).click();

    const player = page.getByRole('region', { name: 'مشغّل التلاوة' });
    await expect(player).toBeVisible();
    await expect(player.getByTestId('now-playing')).toContainText('الفاتحة');
    // The 0.25 s files end quickly: playback advances through the surah.
    await expect(player.getByTestId('now-playing')).toContainText(/الآية [٢-٧]/, { timeout: 10_000 });
    expect(requested[0]).toBe('https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3');
    expect(requested.some((u) => u.endsWith('/2.mp3'))).toBe(true);
    await expect(page.locator('.ayah[data-playing]')).toHaveCount(1);

    // Media Session metadata for the lock screen.
    const title = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? '');
    expect(title).toContain('الفاتحة');

    // The player is in the root layout: it stays across client-side navigation.
    await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).first().getByRole('link', { name: 'الرئيسية' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(player).toBeVisible();
  });

  test('pausing while an ayah is still loading really pauses', async ({ page }) => {
    await page.route('https://cdn.islamic.network/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(2) });
    });
    await page.goto(`/en/quran/${slug(1)}`);
    await page.locator('#ayah-1-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Play from here' }).click();
    const player = page.getByRole('region', { name: 'Recitation player' });
    await expect(player).toContainText('Loading');
    await player.getByRole('button', { name: 'Pause' }).click();
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(player).not.toContainText('Loading');
  });

  test('pause, speed, repeat ayah and stop', async ({ page }) => {
    await mockCdn(page);
    await page.goto(`/en/quran/${slug(112)}`);
    await page.locator('#ayah-112-1 .ayah-end').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Play from here' }).click();
    const player = page.getByRole('region', { name: 'Recitation player' });
    await expect(player).toBeVisible();

    await player.getByRole('button', { name: 'Recitation options' }).click();
    await player.getByLabel('Repeat each ayah').selectOption({ label: 'Until stopped' });
    await player.getByLabel('Speed').selectOption({ label: '1.5×' });
    await expect(player.getByLabel('Speed')).toHaveValue('1.5');
    // With "repeat until stopped", the ayah no longer changes.
    const current = await player.getByTestId('now-playing').textContent();
    await page.waitForTimeout(1500);
    await expect(player.getByTestId('now-playing')).toHaveText(current ?? '');

    await player.getByRole('button', { name: 'Pause' }).click();
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const before = Number(/Ayah (\d+)$/.exec(current ?? '')?.[1]);
    await player.getByRole('button', { name: 'Next ayah' }).click();
    await expect(player.getByTestId('now-playing')).toHaveText(new RegExp(`Ayah ${Math.min(before + 1, 4)}$`));
    await player.getByRole('button', { name: 'Stop and close the player' }).click();
    await expect(player).toBeHidden();
  });
});
