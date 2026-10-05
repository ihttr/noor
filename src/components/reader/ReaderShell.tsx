'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { ReaderMode } from '@/lib/quran/nav';
import { mushafKeyTurn, mushafSwipe } from '@/lib/reader/swipe';
import { JumpDialog } from './JumpDialog';
import { ReaderSettingsDialog } from './ReaderSettingsDialog';
import { quranFontVariables } from './fonts';

export interface ReaderIcons {
  list: ReactNode;
  reading: ReactNode;
  mushaf: ReactNode;
  jump: ReactNode;
  settings: ReactNode;
  close: ReactNode;
  minus: ReactNode;
  plus: ReactNode;
}

export interface PositionInfo {
  surah: number;
  page: number;
  juz: number;
  hizb: number;
}

interface Props {
  mode: ReaderMode;
  title: string;
  initialInfo: PositionInfo;
  /** Names of the surahs shown in this view (for the position line). */
  surahNames: Readonly<Record<number, string>>;
  /** Slugs of the surahs shown in this view (Mushaf → reading switch). */
  surahSlugs: Readonly<Record<number, string>>;
  /** Mushaf only: previous/next page hrefs (swipe, PageUp/PageDown). */
  pageTurn?: { prev?: string; next?: string };
  /** Server-rendered icons (see Reader.tsx). */
  icons: ReaderIcons;
  children: ReactNode;
}

function ayahsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.ayah'));
}

/** Bottom edge of the visible chrome above the text (0 when the chrome is hidden). */
function chromeBottom(): number {
  return document.querySelector('.reader-toolbar')?.getBoundingClientRect().bottom ?? 0;
}

const isOnScreen = (el: HTMLElement, top: number) => {
  const r = el.getBoundingClientRect();
  return r.bottom > top && r.top < window.innerHeight;
};

/**
 * The reader's current ayah: the focused one; else the last focused one (the roving tab stop) if
 * it is still on screen — so pressing a toolbar button does not lose it; else the first ayah that
 * starts below the toolbar.
 */
function currentAyah(container: HTMLElement): HTMLElement | undefined {
  const focused = document.activeElement?.closest<HTMLElement>('.ayah');
  if (focused && container.contains(focused)) return focused;
  const top = chromeBottom();
  const roving = container.querySelector<HTMLElement>('.ayah[tabindex="0"]');
  if (roving && isOnScreen(roving, top)) return roving;
  const ayahs = ayahsIn(container);
  return ayahs.find((a) => a.getBoundingClientRect().top >= top - 2) ?? ayahs.find((a) => isOnScreen(a, top));
}

/** Roving tabindex: exactly one ayah is in the tab order — the current one. */
function focusAyah(container: HTMLElement, ayah: HTMLElement, scroll: boolean): void {
  container.querySelectorAll<HTMLElement>('.ayah[tabindex="0"]').forEach((a) => (a.tabIndex = -1));
  ayah.tabIndex = 0;
  ayah.focus({ preventScroll: !scroll });
  if (scroll) ayah.scrollIntoView({ block: 'nearest' });
}

const nextFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Keeps a target ayah at the top while the layout settles. With `content-visibility: auto`,
 * pages above the target are first laid out at their placeholder size and the Quran font may
 * still be loading, so a single scroll can land in the wrong place. Stops as soon as the reader
 * scrolls, taps or types.
 */
async function settleOn(el: HTMLElement): Promise<void> {
  let interrupted = false;
  const stop = () => (interrupted = true);
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  events.forEach((e) => window.addEventListener(e, stop, { once: true, passive: true }));
  try {
    await document.fonts.ready;
    for (let i = 0; i < 8 && !interrupted; i++) {
      el.scrollIntoView({ block: 'start' });
      await nextFrames();
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (Math.abs(el.getBoundingClientRect().top - margin) < 4) break;
    }
  } finally {
    events.forEach((e) => window.removeEventListener(e, stop));
  }
}

/** Scrolls to an ayah on this page, highlights and focuses it (jumps within the same view). */
function showAyah(container: HTMLElement, id: string): void {
  const el = document.getElementById(id);
  if (!el?.classList.contains('ayah') || !container.contains(el)) return;
  container.querySelectorAll('[data-highlight]').forEach((n) => n.removeAttribute('data-highlight'));
  el.setAttribute('data-highlight', '');
  focusAyah(container, el, false);
  void settleOn(el);
}

function readInfo(section: HTMLElement): PositionInfo {
  const n = (k: string) => Number(section.dataset[k]);
  return { surah: n('surah'), page: n('page'), juz: n('juz'), hizb: n('hizb') };
}

/**
 * Client behaviour for the reader (SPEC §6, §7.3, §10): toolbar with mode switch, jump and
 * settings; tap to toggle chrome; arrow keys move by ayah (RTL: ← next), PageUp/PageDown by page;
 * swipe right/left turns Mushaf pages; position line (surah · juz · hizb · page).
 * The Quran text itself is server-rendered and never touched here.
 */
export function ReaderShell({ mode, title, initialInfo, surahNames, surahSlugs, pageTurn, icons, children }: Props) {
  const t = useTranslations('Reader');
  const tq = useTranslations('Quran');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const jumpRef = useRef<HTMLDialogElement>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);
  const [info, setInfo] = useState<PositionInfo>(initialInfo);

  // Chrome is shown again when the reader is left.
  useEffect(() => () => void delete document.documentElement.dataset.chrome, []);

  // Position line: the page section crossing the upper part of the viewport.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const sections = Array.from(container.querySelectorAll<HTMLElement>('.quran-page'));
    const inView = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inView.add(e.target);
          else inView.delete(e.target);
        }
        const top = sections.find((s) => inView.has(s));
        if (top) setInfo(readInfo(top));
      },
      { rootMargin: '-25% 0px -65% 0px' }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // #ayah-… targets get keyboard focus and stay in view while the page settles.
  useEffect(() => {
    const focusHash = () => {
      const container = containerRef.current;
      const el = container && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (container && el?.classList.contains('ayah')) {
        focusAyah(container, el, false);
        void settleOn(el);
      }
    };
    focusHash();
    window.addEventListener('hashchange', focusHash);
    return () => window.removeEventListener('hashchange', focusHash);
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if ((e.target as Element).closest('input, textarea, select, [contenteditable="true"], dialog')) return;

      if (e.key === 'Escape') {
        delete document.documentElement.dataset.chrome;
        return;
      }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        if (mode === 'mushaf') {
          const href = mushafKeyTurn(e.key) === 'next' ? pageTurn?.next : pageTurn?.prev;
          if (href) router.push(href);
          return;
        }
        const sections = Array.from(container.querySelectorAll<HTMLElement>('.quran-page'));
        const at = currentAyah(container)?.closest<HTMLElement>('.quran-page');
        const target = sections[(at ? sections.indexOf(at) : 0) + (e.key === 'PageDown' ? 1 : -1)];
        const first = target?.querySelector<HTMLElement>('.ayah');
        if (first) {
          target!.scrollIntoView({ block: 'start' });
          focusAyah(container, first, false);
        }
        return;
      }
      // The Quran text is right-to-left: ← and ↓ go forward, → and ↑ go back.
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const ayahs = ayahsIn(container);
      const current = currentAyah(container);
      const index = current ? ayahs.indexOf(current) : -1;
      const next = current && document.activeElement === current ? ayahs[index + step] : current;
      if (next) focusAyah(container, next, true);
      else if (mode === 'mushaf') {
        const href = step > 0 ? pageTurn?.next : pageTurn?.prev;
        if (href) router.push(href);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, pageTurn, router]);

  function switchMode(to: ReaderMode) {
    const container = containerRef.current;
    const ayah = container && currentAyah(container);
    if (!ayah) return;
    const [surah] = (ayah.dataset.ayah ?? '').split(':').map(Number);
    if (to === 'mushaf') router.push(`/mushaf/page/${ayah.dataset.page}#${ayah.id}`);
    else if (surah && surahSlugs[surah]) router.push(`/quran/${surahSlugs[surah]}#${ayah.id}`);
  }

  function onTextClick(e: React.MouseEvent) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if ((e.target as Element).closest('a, button, input, label, dialog')) return;
    if (window.getSelection()?.toString()) return;
    const root = document.documentElement;
    if (root.dataset.chrome === 'hidden') delete root.dataset.chrome;
    else root.dataset.chrome = 'hidden';
  }

  const modeButton = (target: ReaderMode, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => target !== mode && switchMode(target)}
      aria-pressed={mode === target}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm transition-colors ${
        mode === target ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );

  return (
    <div className={`quran-root ${quranFontVariables}`}>
      <div
        role="toolbar"
        aria-label={t('toolbarLabel')}
        data-chrome-part
        className="reader-toolbar sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 mb-4 flex items-center gap-1 border-b border-line bg-canvas/95 px-2 py-1 backdrop-blur md:top-0 md:-mx-10 md:px-6"
      >
        <Link href="/quran" className="icon-button" aria-label={t('backToList')}>
          {icons.list}
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-ink-muted" aria-live="polite">
            {[
              surahNames[info.surah],
              tq('juz', { n: info.juz }),
              tq('hizb', { n: info.hizb }),
              tq('page', { n: info.page }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div role="group" aria-label={t('modeLabel')} className="flex">
          {modeButton('reading', t('readingMode'), icons.reading)}
          {modeButton('mushaf', t('mushafMode'), icons.mushaf)}
        </div>
        <button type="button" className="icon-button" aria-label={t('jump')} onClick={() => jumpRef.current?.showModal()}>
          {icons.jump}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('settings')}
          onClick={() => settingsRef.current?.showModal()}
        >
          {icons.settings}
        </button>
      </div>

      <div
        ref={containerRef}
        className={`reader-body ${mode === 'mushaf' ? 'mushaf-swipe' : ''}`}
        onClick={onTextClick}
        onPointerDown={(e) => {
          swipeStart.current = mode === 'mushaf' && e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
        }}
        onPointerCancel={() => (swipeStart.current = null)}
        onPointerUp={(e) => {
          const s = swipeStart.current;
          swipeStart.current = null;
          if (!s) return;
          const turn = mushafSwipe(e.clientX - s.x, e.clientY - s.y, e.timeStamp - s.t);
          const href = turn === 'next' ? pageTurn?.next : turn === 'previous' ? pageTurn?.prev : undefined;
          if (turn) suppressClick.current = true;
          if (href) router.push(href);
        }}
      >
        {children}
      </div>

      <ReaderSettingsDialog ref={settingsRef} icons={icons} />
      <JumpDialog
        ref={jumpRef}
        mode={mode}
        closeIcon={icons.close}
        onSamePage={(id) => containerRef.current && showAyah(containerRef.current, id)}
      />
    </div>
  );
}
