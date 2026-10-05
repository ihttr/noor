import { expect, test } from '@playwright/test';
import slugs from '../../data/curated/surah-slugs.json' with { type: 'json' };

// Al-Baqarah scrolling with a 4× CPU slowdown (Chromium emulation of a mid-range phone; NOT a
// real device). Records frame times and long tasks while scrolling through the whole surah.
// The assertion is deliberately lenient (catches regressions, not micro-variance); the numbers are
// attached to the report.
test('Al-Baqarah scrolls smoothly under 4× CPU throttling', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'Chromium mobile project only');
  test.setTimeout(120_000);
  await page.goto(`/quran/${slugs.surahs[1]!.slug}`);
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const result = await page.evaluate(async () => {
    const longTasks: number[] = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ type: 'longtask' });
    const frames: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (t: number) => {
      frames.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const end = document.documentElement.scrollHeight - innerHeight;
    // ~1.2 screens per 100 ms: a brisk reading-speed fling through 286 ayahs.
    while (scrollY < end - 10) {
      scrollBy(0, innerHeight * 1.2);
      await new Promise((r) => setTimeout(r, 100));
    }
    running = false;
    frames.sort((a, b) => a - b);
    const pct = (p: number) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))]!;
    return {
      frames: frames.length,
      medianMs: Math.round(pct(0.5)),
      p95Ms: Math.round(pct(0.95)),
      over50ms: frames.filter((f) => f > 50).length,
      longTasks: longTasks.length,
      longestTaskMs: Math.round(Math.max(0, ...longTasks)),
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  test.info().annotations.push({ type: 'al-baqarah-scroll', description: JSON.stringify(result) });
  console.log('Al-Baqarah scroll (4× CPU):', JSON.stringify(result));
  expect(result.longestTaskMs).toBeLessThan(500);
});
