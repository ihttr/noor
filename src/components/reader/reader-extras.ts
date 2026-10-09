'use client';

// Reader features that need the local store. This module (and Dexie with it) is loaded once the
// reader is idle, so none of it counts against the first paint (D-048).

import { PageReadCounter } from '@/lib/activity/page-read';
import { ReadingTimer } from '@/lib/activity/reading-time';
import { loadTranslationSurah } from '@/lib/quran/client';
import { getStore } from '@/lib/store';
import { localDate } from '@/lib/store/refs';
import type { ItemType } from '@/lib/store/types';
import { getReaderSettings, subscribeReaderSettings } from './settings-store';

export type TrackingMode = 'reading' | 'mushaf';

const POSITION_DEBOUNCE_MS = 1000;
const FLUSH_EVERY_MS = 15_000;
const TICK_MS = 1000;

/** Bottom edge of the visible chrome above the text (0 when the chrome is hidden). */
function chromeBottom(): number {
  return document.querySelector('.reader-toolbar')?.getBoundingClientRect().bottom ?? 0;
}

// Page sizes and accumulated screen time survive client-side navigation between reader views,
// so a page shared by two surahs can be completed across both (D-047).
const pageAyahs = new Map<number, number>();
const pageCounter = new PageReadCounter((page) => pageAyahs.get(page));
const timers = new Set<ReadingTimer>();

/** For the audio player (Phase 6): playback counts as reading time. */
export function setAudioPlaying(playing: boolean): void {
  for (const timer of timers) timer.setAudio(playing, Date.now());
}

const warn = (error: unknown) => console.warn('Local store unavailable', error);

/**
 * Tracks the reading position (topmost visible ayah, saved after 1 s without scrolling), pages
 * read and reading time (SPEC §7.7). Returns a function that stops tracking and saves what is
 * pending.
 */
export function startTracking(container: HTMLElement, mode: TrackingMode): () => void {
  const sections = Array.from(container.querySelectorAll<HTMLElement>('.quran-page'));
  for (const s of sections) {
    const count = Number(s.dataset.pageAyahs);
    if (count > 0) pageAyahs.set(Number(s.dataset.page), count);
  }

  const onScreenSections = new Set<HTMLElement>();
  const visibleAyahs = new Set<HTMLElement>();
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const set = e.target.classList.contains('quran-page') ? onScreenSections : visibleAyahs;
      if (e.isIntersecting) set.add(e.target as HTMLElement);
      else set.delete(e.target as HTMLElement);
    }
  });
  sections.forEach((s) => observer.observe(s));
  if (mode === 'reading') container.querySelectorAll<HTMLElement>('.ayah').forEach((a) => observer.observe(a));

  // --- position --------------------------------------------------------------------------
  /**
   * The ayah being read at the top of the text (D-047). Ayahs flow inline, so the top line often
   * holds the end of one ayah and the start of the next: the ayah that starts there wins, unless
   * the one above still fills more than ~1.5 lines below the edge. The edge is where a jump puts
   * an ayah (its scroll margin, below the chrome), so reopening a position finds the same ayah.
   */
  function topmostAyah(): HTMLElement | undefined {
    const first = container.querySelector<HTMLElement>('.ayah');
    if (!first) return undefined;
    const style = getComputedStyle(first);
    const edge = Math.max(chromeBottom(), parseFloat(style.scrollMarginTop) || 0);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 2 || 64;
    for (const section of sections) {
      if (!onScreenSections.has(section)) continue;
      for (const ayah of section.querySelectorAll<HTMLElement>('.ayah')) {
        const r = ayah.getBoundingClientRect();
        if (r.bottom <= edge + 4) continue;
        if (r.top >= edge - 4 || r.bottom - edge > 1.5 * line) return ayah;
        // Only the tail of this ayah is left on the edge line: the reader is at the next one.
        return nextAyah(ayah) ?? ayah;
      }
    }
    return undefined;
  }

  function nextAyah(ayah: HTMLElement): HTMLElement | undefined {
    const all = container.querySelectorAll<HTMLElement>('.ayah');
    const i = Array.prototype.indexOf.call(all, ayah) as number;
    return i >= 0 ? all[i + 1] : undefined;
  }

  let positionTimer: ReturnType<typeof setTimeout> | undefined;
  async function savePosition(): Promise<void> {
    clearTimeout(positionTimer);
    positionTimer = undefined;
    const ayah = topmostAyah();
    const [surah, number] = (ayah?.dataset.ayah ?? '').split(':').map(Number);
    const page = Number(ayah?.dataset.page);
    if (!surah || !number || !page) return;
    try {
      await (await getStore()).position.set({ surah, ayah: number, page, mode: mode === 'mushaf' ? 'MUSHAF' : 'READING' });
    } catch (error) {
      warn(error);
    }
  }
  const schedulePosition = () => {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => void savePosition(), POSITION_DEBOUNCE_MS);
  };

  // --- reading time and pages read ---------------------------------------------------------
  const timer = new ReadingTimer(Date.now(), document.visibilityState === 'visible');
  timers.add(timer);
  let lastTick = Date.now();
  let lastFlush = lastTick;

  async function record(date: string, activity: { pages?: number[]; seconds?: number }) {
    try {
      await (await getStore()).readingDays.record(date, activity);
    } catch (error) {
      warn(error);
    }
  }

  function flushTime(now: number) {
    lastFlush = now;
    for (const { date, seconds } of timer.take(now)) void record(date, { seconds });
  }

  const tick = () => {
    const now = Date.now();
    const elapsed = Math.min(now - lastTick, 2 * TICK_MS);
    lastTick = now;
    if (document.visibilityState !== 'visible') return;
    const visible = {
      ayahs: Array.from(visibleAyahs, (a) => ({ key: a.dataset.ayah ?? '', page: Number(a.dataset.page) })),
      pages: Array.from(onScreenSections, (s) => Number(s.dataset.page)),
    };
    const read = pageCounter.tick(localDate(now), mode, visible, elapsed);
    if (read.length) void record(localDate(now), { pages: read });
    if (now - lastFlush >= FLUSH_EVERY_MS) flushTime(now);
  };
  const interval = setInterval(tick, TICK_MS);

  const onActivity = () => timer.activity(Date.now());
  const onScroll = () => {
    onActivity();
    schedulePosition();
  };
  const onVisibility = () => {
    const now = Date.now();
    lastTick = now;
    timer.setVisible(document.visibilityState === 'visible', now);
    if (document.visibilityState === 'hidden') {
      flushTime(now);
      if (positionTimer) void savePosition();
    }
  };
  const onPageHide = () => {
    flushTime(Date.now());
    if (positionTimer) void savePosition();
  };

  const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  activityEvents.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', schedulePosition, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  schedulePosition();

  return () => {
    activityEvents.forEach((e) => window.removeEventListener(e, onActivity));
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', schedulePosition);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    clearInterval(interval);
    observer.disconnect();
    flushTime(Date.now());
    timers.delete(timer);
    if (positionTimer) void savePosition();
  };
}

/** Marks saved ayahs and ayahs with a note (`data-saved`, `data-noted`) and keeps the marks current. */
export function decorateAyahs(container: HTMLElement): () => void {
  let stopped = false;
  let off: (() => void) | undefined;
  const ayahs = new Map(Array.from(container.querySelectorAll<HTMLElement>('.ayah'), (a) => [a.dataset.ayah ?? '', a]));

  async function refresh() {
    const store = await getStore();
    const [saved, notes] = await Promise.all([store.saved.list(), store.notes.list()]);
    if (stopped) return;
    const savedRefs = new Set(saved.filter((s) => s.type === 'AYAH').map((s) => s.ref));
    const notedRefs = new Set(notes.filter((n) => n.targetType === 'AYAH').map((n) => n.targetRef));
    for (const [key, el] of ayahs) {
      el.toggleAttribute('data-saved', savedRefs.has(key));
      el.toggleAttribute('data-noted', notedRefs.has(key));
    }
  }

  getStore()
    .then((store) => {
      if (stopped) return;
      off = store.subscribe(['savedItems', 'notes'], () => void refresh().catch(warn));
      return refresh();
    })
    .catch(warn);

  return () => {
    stopped = true;
    off?.();
  };
}

/** Calls `onChange` with whether a target is saved, now and after every change. */
export function watchSaved(type: ItemType, ref: string, onChange: (saved: boolean) => void): () => void {
  let stopped = false;
  let off: (() => void) | undefined;
  getStore()
    .then(async (store) => {
      const check = async () => {
        const saved = !!(await store.saved.find(type, ref));
        if (!stopped) onChange(saved);
      };
      if (stopped) return;
      off = store.subscribe(['savedItems'], () => void check().catch(warn));
      await check();
    })
    .catch(warn);
  return () => {
    stopped = true;
    off?.();
  };
}

export async function toggleSaved(type: ItemType, ref: string): Promise<boolean> {
  const store = await getStore();
  const existing = await store.saved.find(type, ref);
  if (existing) {
    await store.saved.remove(existing.id);
    return false;
  }
  await store.saved.save(type, ref);
  return true;
}

export interface TranslationChoice {
  id: string;
  name: string;
  language: string;
  direction: 'rtl' | 'ltr';
  /** Translator and source, shown with the text (SPEC §2.8). */
  credit: string;
}

/**
 * Shows the chosen translation under each ayah in reading mode (SPEC §7.3, §7.9) and follows
 * changes of the setting. The Quran text elements are not touched; translations are added as
 * separate elements after them.
 */
export function startTranslations(container: HTMLElement, mode: TrackingMode, choices: readonly TranslationChoice[]): () => void {
  if (mode !== 'reading' || !choices.length) return () => undefined;
  let shown: string | null = null;
  let added: HTMLElement[] = [];
  let version = 0;

  const clear = () => {
    added.forEach((el) => el.remove());
    added = [];
    delete container.dataset.translation;
  };

  const apply = async () => {
    const choice = choices.find((c) => c.id === getReaderSettings().translation) ?? null;
    if ((choice?.id ?? null) === shown) return;
    const run = ++version;
    clear();
    shown = choice?.id ?? null;
    if (!choice) return;
    const ayahs = Array.from(container.querySelectorAll<HTMLElement>('.ayah'));
    const surahs = [...new Set(ayahs.map((a) => Number((a.dataset.ayah ?? '').split(':')[0])))];
    try {
      const files = await Promise.all(surahs.map((s) => loadTranslationSurah(choice.id, s)));
      if (run !== version) return;
      const text = new Map<string, string>(files.flatMap((f) => f.entries.map((e) => [`${f.surah}:${e.ayah}`, e.text] as const)));
      for (const ayah of ayahs) {
        const value = text.get(ayah.dataset.ayah ?? '');
        if (value === undefined) continue;
        const el = document.createElement('span');
        el.className = 'ayah-translation';
        el.lang = choice.language;
        el.dir = choice.direction;
        el.textContent = value;
        ayah.append(el);
        added.push(el);
      }
      const credit = document.createElement('p');
      credit.className = 'translation-credit';
      credit.textContent = choice.credit;
      container.prepend(credit);
      added.push(credit);
      container.dataset.translation = choice.id;
    } catch (error) {
      warn(error);
      shown = null;
    }
  };

  const off = subscribeReaderSettings(() => void apply());
  void apply();
  return () => {
    version++;
    off();
    clear();
  };
}

/**
 * Follows the audio player (SPEC §7.11): marks the ayah being recited (`data-playing`), scrolls
 * it into view when auto-scroll is on, and counts listening as reading time (SPEC §7.7).
 */
export function followAudio(container: HTMLElement): () => void {
  let marked: HTMLElement | null = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ surah: number; ayah: number; playing: boolean; active: boolean; autoScroll: boolean }>).detail;
    setAudioPlaying(d.playing);
    const el = d.active ? container.querySelector<HTMLElement>(`#ayah-${d.surah}-${d.ayah}`) : null;
    if (el !== marked) {
      marked?.removeAttribute('data-playing');
      el?.setAttribute('data-playing', '');
      if (el && d.autoScroll && d.playing) el.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      marked = el;
    }
  };
  window.addEventListener('noor:audio', on);
  window.dispatchEvent(new Event('noor:audio-query'));
  return () => {
    window.removeEventListener('noor:audio', on);
    marked?.removeAttribute('data-playing');
  };
}
