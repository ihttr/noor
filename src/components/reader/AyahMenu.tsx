'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { unlockAudio } from '@/components/audio/audio-element';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { CollectionSelect } from '@/components/saved/CollectionSelect';
import { loadSurahFile } from '@/lib/quran/client';
import { ayahCopyText, ayahReference, ayahShareUrl, formatNumber, usesArabicDigits } from '@/lib/reader/ayah-share';
import { getStore, type LocalStore } from '@/lib/store';
import type { CollectionRecord, NoteRecord, SavedItemRecord } from '@/lib/store/types';
import { getReaderSettings } from './settings-store';

export interface AyahTarget {
  element: HTMLElement;
  key: string;
  surah: number;
  ayah: number;
  /** Where the menu was opened from (the ayah number), for the desktop popover. */
  anchor: DOMRect;
}

export interface AyahMenuIcons {
  close: ReactNode;
  copy: ReactNode;
  share: ReactNode;
  save: ReactNode;
  saved: ReactNode;
  note: ReactNode;
  play: ReactNode;
  translation: ReactNode;
  tafsir: ReactNode;
}

interface StoreState {
  status: 'loading' | 'ready' | 'error';
  saved?: SavedItemRecord;
  note?: NoteRecord;
  collections: CollectionRecord[];
}

/** Popovers on wide screens, bottom sheets on phones (SPEC §7.5). */
const POPOVER_QUERY = '(min-width: 48rem)';

async function writeClipboard(text: string, host: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No async clipboard (plain http, older browsers): copy from a temporary field inside the
    // dialog (the rest of the page is inert while it is open).
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    host.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}

function ActionButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  soon,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  soon?: string;
}) {
  return (
    <button type="button" className="ayah-action" onClick={onClick} aria-pressed={pressed} disabled={disabled || !!soon}>
      {icon}
      <span>
        {label}
        {soon && <span className="ayah-action-soon">{soon}</span>}
      </span>
    </button>
  );
}

/**
 * Ayah actions (SPEC §7.5): copy with reference, share, save (with collection), private note;
 * play, translation and tafsir arrive in later phases and are shown disabled.
 */
export default function AyahMenu({
  target,
  surahName,
  slug,
  icons,
  tafsirAvailable,
  onTafsir,
  onClose,
}: {
  target: AyahTarget;
  surahName: string;
  slug: string;
  icons: AyahMenuIcons;
  /** Whether an approved tafsir is imported (otherwise the action is "coming soon"). */
  tafsirAvailable: boolean;
  /** Closes the menu and opens the tafsir panel for this ayah. */
  onTafsir: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('AyahMenu');
  const locale = useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [popover] = useState(() => window.matchMedia(POPOVER_QUERY).matches);
  const [view, setView] = useState<'actions' | 'note'>('actions');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<StoreState>({ status: 'loading', collections: [] });

  const arabicDigits = usesArabicDigits(getReaderSettings().numerals, locale);
  const title = t('title', { surah: surahName, ayah: formatNumber(target.ayah, arabicDigits) });

  // Open as a modal dialog (focus trap, Escape, inert page); place the popover next to the number.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('.ayah-action')?.focus();
    if (popover) {
      const a = target.anchor;
      const { width, height } = dialog.getBoundingClientRect();
      const gap = 8;
      let top = a.bottom + gap;
      if (top + height > window.innerHeight - gap) top = Math.max(gap, a.top - height - gap);
      const rtl = document.documentElement.dir === 'rtl';
      const left = Math.min(Math.max(gap, rtl ? a.right - width : a.left), window.innerWidth - width - gap);
      dialog.style.top = `${top}px`;
      dialog.style.left = `${left}px`;
    }
    target.element.setAttribute('data-selected', '');
    return () => target.element.removeAttribute('data-selected');
  }, [popover, target]);

  // The surah's text chunk, so the Saved page can show this ayah offline too (SPEC §7.20); the
  // service worker keeps the response.
  useEffect(() => {
    loadSurahFile(target.surah).catch(() => undefined);
  }, [target.surah]);

  // Saved state, note and collections from the local store, kept current.
  useEffect(() => {
    let stopped = false;
    let off: (() => void) | undefined;
    const load = async () => {
      const store = await getStore();
      const [saved, note, collections] = await Promise.all([
        store.saved.find('AYAH', target.key),
        store.notes.get('AYAH', target.key),
        store.collections.list(),
      ]);
      if (!stopped) setState({ status: 'ready', saved, note, collections });
    };
    getStore()
      .then((store) => {
        if (stopped) return;
        off = store.subscribe(['savedItems', 'notes', 'collections'], () => void load().catch(() => undefined));
        return load();
      })
      .catch(() => !stopped && setState({ status: 'error', collections: [] }));
    return () => {
      stopped = true;
      off?.();
    };
  }, [target.key]);

  const text = () => target.element.querySelector('[data-ayah-text]')?.textContent ?? '';
  const copyText = () => ayahCopyText(text(), ayahReference({ surahName, surah: target.surah, ayah: target.ayah }, locale, arabicDigits));

  async function copy() {
    const ok = await writeClipboard(copyText(), dialogRef.current!);
    setMessage(ok ? t('copied') : t('copyFailed'));
  }

  async function share() {
    const url = ayahShareUrl(window.location.origin, locale, slug, target.ayah);
    const data = { title, text: copyText(), url };
    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }
    const ok = await writeClipboard(`${data.text}\n${url}`, dialogRef.current!);
    setMessage(ok ? t('linkCopied') : t('copyFailed'));
  }

  async function withStore(action: (store: LocalStore) => Promise<unknown>, done: string) {
    try {
      await action(await getStore());
      setMessage(done);
    } catch {
      setMessage(t('storeError'));
    }
  }

  // Reads the current state from the store, so a tap before the menu has loaded still works.
  async function toggleSave() {
    try {
      const store = await getStore();
      const existing = await store.saved.find('AYAH', target.key);
      if (existing) await store.saved.remove(existing.id);
      else await store.saved.save('AYAH', target.key);
      setMessage(existing ? t('removed') : t('savedMessage'));
    } catch {
      setMessage(t('storeError'));
    }
  }

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className={`ayah-menu ${popover ? 'ayah-popover' : 'ayah-sheet'}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop targets the dialog itself, outside its box.
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label={t('close')} onClick={close}>
          {icons.close}
        </button>
      </div>

      {view === 'actions' ? (
        <>
          <div role="group" aria-label={t('actions')} className="ayah-actions">
            <ActionButton icon={icons.copy} label={t('copy')} onClick={() => void copy()} />
            <ActionButton icon={icons.share} label={t('share')} onClick={() => void share()} />
            <ActionButton
              icon={state.saved ? icons.saved : icons.save}
              label={state.saved ? t('saved') : t('save')}
              pressed={!!state.saved}
              disabled={state.status === 'error'}
              onClick={() => void toggleSave()}
            />
            {/* The note editor needs the stored note first, so it waits for the store. */}
            <ActionButton
              icon={icons.note}
              label={state.note ? t('editNote') : t('addNote')}
              disabled={state.status !== 'ready'}
              onClick={() => setView('note')}
            />
            <ActionButton
              icon={icons.play}
              label={t('play')}
              onClick={() => {
                // Unlock audio inside the tap (mobile autoplay rules), then load the player.
                unlockAudio();
                void import('@/components/audio/engine').then((m) => m.playFrom(target.surah, target.ayah));
                close();
              }}
            />
            <ActionButton icon={icons.translation} label={t('translation')} soon={t('soon')} />
            {tafsirAvailable ? (
              <ActionButton icon={icons.tafsir} label={t('tafsir')} onClick={onTafsir} />
            ) : (
              <ActionButton icon={icons.tafsir} label={t('tafsir')} soon={t('soon')} />
            )}
          </div>

          {state.saved && (
            <div className="mt-4">
              <CollectionSelect
                collections={state.collections}
                value={state.saved.collectionId}
                onChange={(id) => withStore((s) => s.saved.setCollection(state.saved!.id, id), t('collectionChanged'))}
                onCreate={async (name) => (await (await getStore()).collections.create(name)).id}
              />
            </div>
          )}
          {state.note && (
            <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-surface-raised p-3 text-sm">
              <span className="sr-only">{t('noteLabel')}: </span>
              {state.note.body}
            </p>
          )}
          {state.status === 'error' && <p className="mt-4 text-sm text-ink-muted">{t('storeError')}</p>}
        </>
      ) : (
        <div className="mt-3">
          <NoteEditor
            initial={state.note?.body ?? ''}
            onCancel={() => setView('actions')}
            onSave={async (body) => {
              await (await getStore()).notes.set('AYAH', target.key, body);
              setView('actions');
              setMessage(body.trim() ? t('noteSaved') : t('noteDeleted'));
            }}
            onDelete={async () => {
              if (state.note) await (await getStore()).notes.remove(state.note.id);
              setView('actions');
              setMessage(t('noteDeleted'));
            }}
          />
        </div>
      )}

      <p role="status" className="mt-3 min-h-5 text-sm font-semibold text-accent">
        {message}
      </p>
    </dialog>
  );
}
