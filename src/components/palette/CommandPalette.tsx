'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setThemePreference } from '@/components/theme/theme-store';
import { usePathname, useRouter } from '@/i18n/navigation';
import { paletteItems, type PaletteGroup, type PaletteItem, type PaletteSection } from '@/lib/palette/items';
import { loadNav } from '@/lib/quran/client';
import type { NavData } from '@/lib/quran/nav';
import { getStore } from '@/lib/store';
import type { NoteRecord, SavedItemRecord } from '@/lib/store/types';

const GROUP_ORDER: readonly PaletteGroup[] = ['go', 'surahs', 'saved', 'sections', 'settings', 'search'];

/**
 * Command palette (Ctrl/Cmd + K, SPEC §7.8): a combobox over surahs, ayah references, pages,
 * juz, sections, saved items and notes, settings, and a full Quran search.
 */
export default function CommandPalette({ sections, onClose }: { sections: readonly PaletteSection[]; onClose: () => void }) {
  const t = useTranslations('Palette');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [nav, setNav] = useState<NavData | null>(null);
  const [mine, setMine] = useState<{ saved: SavedItemRecord[]; notes: NoteRecord[] }>({ saved: [], notes: [] });

  useLayoutEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let stopped = false;
    loadNav().then((n) => !stopped && setNav(n), () => undefined);
    getStore()
      .then(async (store) => {
        const [saved, notes] = await Promise.all([store.saved.list(), store.notes.list()]);
        if (!stopped) setMine({ saved, notes });
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, []);

  const items = useMemo(
    () => paletteItems(query, { locale, nav, sections, saved: mine.saved, notes: mine.notes, t: (k, v) => t(k as never, v as never) }),
    [query, locale, nav, sections, mine, t]
  );
  const ordered = useMemo(() => GROUP_ORDER.flatMap((g) => items.filter((i) => i.group === g)), [items]);
  const current = Math.min(active, Math.max(ordered.length - 1, 0));

  function run(item: PaletteItem | undefined) {
    if (!item) return;
    const a = item.action;
    if (a.kind === 'theme') setThemePreference(a.value);
    dialogRef.current?.close();
    if (a.kind === 'href') router.push(a.href);
    if (a.kind === 'locale') router.replace(pathname, { locale: a.value });
  }

  const optionId = (i: number) => `${id}-opt-${i}`;
  let index = -1;

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label={t('title')}
      onClose={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
      }}
    >
      <input
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={ordered.length ? optionId(current) : undefined}
        aria-autocomplete="list"
        aria-label={t('label')}
        placeholder={t('placeholder')}
        className="palette-input"
        value={query}
        autoFocus
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((current + 1) % Math.max(ordered.length, 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((current - 1 + ordered.length) % Math.max(ordered.length, 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(ordered[current]);
          }
        }}
      />
      <div id={`${id}-list`} role="listbox" aria-label={t('results')} className="palette-list">
        {GROUP_ORDER.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group} role="group" aria-labelledby={`${id}-${group}`}>
              <p id={`${id}-${group}`} className="palette-group" role="presentation">
                {t(`groups.${group}`)}
              </p>
              {groupItems.map((item) => {
                index++;
                const i = index;
                return (
                  <div
                    key={item.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    className="palette-option"
                    onMouseMove={() => i !== current && setActive(i)}
                    onClick={() => run(item)}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.detail && <span className="truncate text-xs text-ink-muted">{item.detail}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!ordered.length && <p className="px-3 py-6 text-center text-sm text-ink-muted">{t('empty')}</p>}
      </div>
      <p className="palette-hint" aria-hidden="true">
        {t('hint')}
      </p>
    </dialog>
  );
}
