// "Page read" rules (SPEC §7.7, D-047). Pure bookkeeping; the reader feeds it what is on screen.
//
// - Mushaf mode: a Madani page counts once it has been on screen for a cumulative 15 s.
// - Reading mode: a page counts once at least half of its ayahs have each been visible for a
//   cumulative 15 s (an ayah partly on screen is visible). The page's ayah total is the full
//   Madani page, so a page shared by two surahs needs reading in both views.
// - A page counts once per local day; accumulated time starts again the next day.

export interface PageReadRules {
  mushafPageMs: number;
  ayahMs: number;
  /** Share of the page's ayahs (0–1). */
  ayahShare: number;
}

export const PAGE_READ_RULES: PageReadRules = { mushafPageMs: 15_000, ayahMs: 15_000, ayahShare: 0.5 };

export interface VisibleNow {
  /** Ayahs at least partly on screen, with their page. */
  ayahs: readonly { key: string; page: number }[];
  /** Pages at least partly on screen. */
  pages: readonly number[];
}

export class PageReadCounter {
  private date = '';
  private readonly pageMs = new Map<number, number>();
  private readonly ayahMs = new Map<number, Map<string, number>>();
  private readonly counted = new Set<number>();
  private readonly pageAyahCount: (page: number) => number | undefined;
  private readonly rules: PageReadRules;

  constructor(pageAyahCount: (page: number) => number | undefined, rules: PageReadRules = PAGE_READ_RULES) {
    this.pageAyahCount = pageAyahCount;
    this.rules = rules;
  }

  /** Adds `elapsedMs` of screen time to what is visible; returns the pages that just became read. */
  tick(date: string, mode: 'reading' | 'mushaf', visible: VisibleNow, elapsedMs: number): number[] {
    if (date !== this.date) {
      this.date = date;
      this.pageMs.clear();
      this.ayahMs.clear();
      this.counted.clear();
    }
    if (!(elapsedMs > 0)) return [];
    const read: number[] = [];

    if (mode === 'mushaf') {
      for (const page of new Set(visible.pages)) {
        if (this.counted.has(page)) continue;
        const ms = (this.pageMs.get(page) ?? 0) + elapsedMs;
        this.pageMs.set(page, ms);
        if (ms >= this.rules.mushafPageMs) read.push(page);
      }
    } else {
      const touched = new Set<number>();
      for (const { key, page } of visible.ayahs) {
        if (this.counted.has(page)) continue;
        let perAyah = this.ayahMs.get(page);
        if (!perAyah) this.ayahMs.set(page, (perAyah = new Map()));
        perAyah.set(key, (perAyah.get(key) ?? 0) + elapsedMs);
        touched.add(page);
      }
      for (const page of touched) {
        const total = this.pageAyahCount(page);
        if (!total) continue;
        let done = 0;
        for (const ms of this.ayahMs.get(page)!.values()) if (ms >= this.rules.ayahMs) done++;
        if (done >= total * this.rules.ayahShare) read.push(page);
      }
    }

    for (const page of read) this.counted.add(page);
    return read.sort((a, b) => a - b);
  }
}
