'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { ReaderMode } from '@/lib/quran/nav';
import { mushafKeyTurn, mushafSwipe } from '@/lib/reader/swipe';
import { whenIdle } from '@/lib/store';
import type { AyahMenuIcons, AyahTarget } from './AyahMenu';
import type { TranslationChoice } from './reader-extras';
import type { TafsirChoice } from './TafsirPanel';
import { quranFontVariables } from './fonts';

// Loaded when the reader is idle (or on first use), never as part of the first paint (D-048).
const loadAyahMenu = () => import('./AyahMenu');
const AyahMenu = lazy(loadAyahMenu);
const loadTafsirPanel = () => import('./TafsirPanel');
const TafsirPanel = lazy(loadTafsirPanel);
const loadSettingsDialog = () => import('./ReaderSettingsDialog').then((m) => ({ default: m.ReaderSettingsDialog }));
const ReaderSettingsDialog = lazy(loadSettingsDialog);
const loadJumpDialog = () => import('./JumpDialog').then((m) => ({ default: m.JumpDialog }));
const JumpDialog = lazy(loadJumpDialog);
let extrasModule: Promise<typeof import('./reader-extras')> | undefined;
const loadExtras = () => (extrasModule ??= import('./reader-extras'));

export interface ReaderIcons extends AyahMenuIcons {
  list: ReactNode;
  reading: ReactNode;
  mushaf: ReactNode;
  jump: ReactNode;
  settings: ReactNode;
  close: ReactNode;
  minus: ReactNode;
  plus: ReactNode;
  previous: ReactNode;
  next: ReactNode;
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
  /** Imported tafsirs (registry), for the ayah menu. */
  tafsirs: readonly TafsirChoice[];
  /** Imported translations (registry), for the settings and reading mode. */
  translations: readonly TranslationChoice[];
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

type DialogName = 'settings' | 'jump';
interface DialogSlots {
  settings: HTMLDialogElement | null;
  jump: HTMLDialogElement | null;
  pending: DialogName | null;
}

/** Callback-ref body: remembers a lazily mounted dialog and opens it if it was requested. */
function attachDialog(slots: DialogSlots, which: DialogName, el: HTMLDialogElement | null): void {
  slots[which] = el;
  if (el && slots.pending === which) {
    slots.pending = null;
    el.showModal();
  }
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
export function ReaderShell({ mode, title, initialInfo, surahNames, surahSlugs, pageTurn, icons, tafsirs, translations, children }: Props) {
  const t = useTranslations('Reader');
  const tq = useTranslations('Quran');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // The settings and jump dialogs are loaded on first use; a callback ref opens them once mounted.
  const dialogs = useRef<DialogSlots>({
    settings: null,
    jump: null,
    pending: null,
  });
  const [mounted, setMounted] = useState({ settings: false, jump: false });
  const settingsRef = useCallback((el: HTMLDialogElement | null) => attachDialog(dialogs.current, 'settings', el), []);
  const jumpRef = useCallback((el: HTMLDialogElement | null) => attachDialog(dialogs.current, 'jump', el), []);
  function openDialog(which: DialogName) {
    const el = dialogs.current[which];
    if (el) return el.showModal();
    dialogs.current.pending = which;
    setMounted((m) => ({ ...m, [which]: true }));
  }
  const [tafsir, setTafsir] = useState<AyahTarget | null>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);
  const [info, setInfo] = useState<PositionInfo>(initialInfo);
  const [menu, setMenu] = useState<AyahTarget | null>(null);
  const [bookmarked, setBookmarked] = useState<boolean | null>(null);
  const bookmark = mode === 'mushaf' ? { type: 'PAGE' as const, ref: String(info.page) } : { type: 'SURAH' as const, ref: String(info.surah) };

  /** Opens the ayah menu (SPEC §7.5) for an ayah, anchored at its number. */
  function openMenu(ayah: HTMLElement) {
    const [surah, number] = (ayah.dataset.ayah ?? '').split(':').map(Number);
    const end = ayah.querySelector('.ayah-end') ?? ayah;
    if (surah && number) setMenu({ element: ayah, key: `${surah}:${number}`, surah, ayah: number, anchor: end.getBoundingClientRect() });
  }

  function closeMenu() {
    const container = containerRef.current;
    if (container && menu && container.contains(menu.element)) focusAyah(container, menu.element, false);
    setMenu(null);
  }

  // Reading position, pages read, reading time and saved/note marks start once the reader is idle.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void loadAyahMenu();
      void loadSettingsDialog();
      void loadJumpDialog();
      void loadExtras().then((m) => {
        if (cancelled) return;
        const stops = [
          m.startTracking(container, mode),
          m.decorateAyahs(container),
          m.startTranslations(container, mode, translations),
          m.followAudio(container),
        ];
        stop = () => stops.forEach((s) => s());
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      stop?.();
    };
  }, [mode, translations]);

  // Toolbar bookmark: the page in Mushaf mode, the surah in reading mode.
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void loadExtras().then((m) => {
        if (!cancelled) off = m.watchSaved(bookmark.type, bookmark.ref, setBookmarked);
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      off?.();
    };
  }, [bookmark.type, bookmark.ref]);

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
      if (!container || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as Element).closest('input, textarea, select, [contenteditable="true"], dialog')) return;

      // Enter, Space, the context-menu key or Shift+F10 on an ayah open its menu.
      const ayah = (e.target as Element).closest<HTMLElement>('.ayah');
      const menuKey = (!e.shiftKey && (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu')) || (e.shiftKey && e.key === 'F10');
      if (ayah && container.contains(ayah) && menuKey) {
        e.preventDefault();
        openMenu(ayah);
        return;
      }
      if (e.shiftKey) return;

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
    const end = (e.target as Element).closest('.ayah-end');
    const ayah = end?.closest<HTMLElement>('.ayah');
    if (ayah) return openMenu(ayah);
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
        className="reader-toolbar sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 mb-4 flex items-center gap-1 border-b border-line bg-canvas/95 px-2 py-1 backdrop-blur md:top-0 md:-mx-10 md:px-6 flex-wrap"
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
        <button
          type="button"
          className="icon-button"
          aria-label={mode === 'mushaf' ? t('savePage', { n: info.page }) : t('saveSurah', { name: surahNames[info.surah] ?? '' })}
          aria-pressed={bookmarked === true}
          disabled={bookmarked === null}
          onClick={() => void loadExtras().then((m) => m.toggleSaved(bookmark.type, bookmark.ref))}
        >
          {bookmarked ? icons.saved : icons.save}
        </button>
        <button type="button" className="icon-button" aria-label={t('jump')} onClick={() => openDialog('jump')}>
          {icons.jump}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('settings')}
          onClick={() => openDialog('settings')}
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

      {menu && (
        <Suspense fallback={null}>
          <AyahMenu
            key={menu.key}
            target={menu}
            surahName={surahNames[menu.surah] ?? ''}
            slug={surahSlugs[menu.surah] ?? ''}
            icons={icons}
            tafsirAvailable={tafsirs.length > 0}
            onTafsir={() => {
              const target = menu;
              setMenu(null);
              setTafsir(target);
            }}
            onClose={closeMenu}
          />
        </Suspense>
      )}
      {tafsir && (
        <Suspense fallback={null}>
          <TafsirPanel
            key={tafsir.key}
            target={tafsir}
            surahName={surahNames[tafsir.surah] ?? ''}
            tafsirs={tafsirs}
            icons={icons}
            onClose={() => {
              const container = containerRef.current;
              if (container && container.contains(tafsir.element)) focusAyah(container, tafsir.element, false);
              setTafsir(null);
            }}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        {mounted.settings && <ReaderSettingsDialog ref={settingsRef} icons={icons} translations={translations} />}
        {mounted.jump && (
          <JumpDialog
            ref={jumpRef}
            mode={mode}
            closeIcon={icons.close}
            onSamePage={(id) => containerRef.current && showAyah(containerRef.current, id)}
          />
        )}
      </Suspense>
    </div>
  );
}
