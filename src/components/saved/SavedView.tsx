'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { useStoreData } from '@/components/store/useStoreData';
import { Link } from '@/i18n/navigation';
import type { SurahFile } from '@/lib/quran/types';
import {
  buildEntries,
  countByType,
  filterEntries,
  NO_FILTER,
  type SavedEntry,
  type SavedFilter,
  type TypeFilter,
} from '@/lib/saved/entries';
import { getStore, type LocalStore } from '@/lib/store';
import type { CollectionRecord } from '@/lib/store/types';
import { ADHKAR_CATEGORIES, type AdhkarCategory } from '@/lib/adhkar/types';

const isAdhkarCategory = (v: string): v is AdhkarCategory => (ADHKAR_CATEGORIES as readonly string[]).includes(v);
import { CollectionSelect } from './CollectionSelect';
import { CollectionsDialog, type CollectionIcons } from './CollectionsDialog';

const TABLES = ['savedItems', 'notes', 'collections'] as const;
const readAll = async (store: LocalStore) => {
  const [saved, notes, collections] = await Promise.all([store.saved.list(), store.notes.list(), store.collections.list()]);
  return { entries: buildEntries(saved, notes), collections };
};

const TYPE_FILTERS: readonly TypeFilter[] = ['ALL', 'AYAH', 'PAGE', 'SURAH', 'DHIKR', 'TAFSIR', 'NOTES'];

// Saved ayahs are shown from the surah chunks in content/ (verbatim), fetched once per surah.
const surahFiles = new Map<number, Promise<SurahFile>>();
function loadSurah(n: number): Promise<SurahFile> {
  let file = surahFiles.get(n);
  if (!file) {
    file = fetch(`/api/quran/surah/${n}`).then((r) => {
      if (!r.ok) throw new Error(`surah ${n}: ${r.status}`);
      return r.json() as Promise<SurahFile>;
    });
    file.catch(() => surahFiles.delete(n));
    surahFiles.set(n, file);
  }
  return file;
}

/** Ayah texts by `s:a` key: undefined while loading, null when unavailable (offline). */
function useAyahTexts(keys: readonly string[]): ReadonlyMap<string, string | null> {
  const [texts, setTexts] = useState<ReadonlyMap<string, string | null>>(new Map());
  const wanted = [...new Set(keys)].sort().join(',');
  useEffect(() => {
    let stopped = false;
    const bySurah = new Map<number, string[]>();
    for (const key of wanted ? wanted.split(',') : []) {
      const surah = Number(key.split(':')[0]);
      bySurah.set(surah, [...(bySurah.get(surah) ?? []), key]);
    }
    for (const [surah, list] of bySurah) {
      loadSurah(surah).then(
        (file) => {
          if (stopped) return;
          setTexts((prev) => {
            const next = new Map(prev);
            for (const key of list) next.set(key, file.ayahs.find((a) => a.number === Number(key.split(':')[1]))?.text ?? null);
            return next;
          });
        },
        () => {
          if (stopped) return;
          setTexts((prev) => new Map([...prev, ...list.filter((k) => !prev.has(k)).map((k) => [k, null] as const)]));
        }
      );
    }
    return () => {
      stopped = true;
    };
  }, [wanted]);
  return texts;
}

export interface SavedSurah {
  name: string;
  /** Arabic name, transliteration and English name, for search. */
  search: string;
  slug: string;
}

interface EntryInfo {
  title: string;
  href?: string;
  search: string;
}

function AyahText({ refKey, text }: { refKey: string; text: string | null | undefined }) {
  const t = useTranslations('Saved');
  const [expanded, setExpanded] = useState(false);
  if (text === undefined) return <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-surface-raised" />;
  if (text === null) return <p className="text-sm text-ink-muted">{t('textUnavailable')}</p>;
  const long = text.length > 240;
  return (
    <div className="flex flex-col items-start gap-1">
      <p lang="ar" dir="rtl" className={`saved-ayah ${long && !expanded ? 'is-clamped' : ''}`}>
        <span data-ayah-text={refKey}>{text}</span>
      </p>
      {long && (
        <button type="button" className="text-sm text-accent underline underline-offset-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  info,
  text,
  collections,
  collectionName,
  onNotice,
}: {
  entry: SavedEntry;
  info: EntryInfo;
  text: string | null | undefined;
  collections: readonly CollectionRecord[];
  collectionName?: string;
  onNotice: (text: string, undo?: () => Promise<unknown>) => void;
}) {
  const t = useTranslations('Saved');
  const id = useId();
  const [editing, setEditing] = useState(false);

  async function act(action: (store: LocalStore) => Promise<unknown>, done?: string) {
    try {
      await action(await getStore());
      if (done) onNotice(done);
    } catch {
      onNotice(t('storeError'));
    }
  }

  async function remove() {
    const saved = entry.saved;
    if (!saved) return;
    try {
      await (await getStore()).saved.remove(saved.id);
    } catch {
      return onNotice(t('storeError'));
    }
    onNotice(t('removed', { title: info.title }), async () => {
      const store = await getStore();
      // The collection may have been deleted in the meantime.
      await store.saved.save(entry.type, entry.ref, saved.collectionId).catch(() => store.saved.save(entry.type, entry.ref, null));
    });
  }

  const status = entry.saved ? (collectionName ?? t('noCollection')) : t('notSaved');

  return (
    <li>
      <article aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id={`${id}-title`} className="text-base font-semibold">
            {info.href ? (
              <Link href={info.href} className="underline-offset-4 hover:underline">
                {info.title}
              </Link>
            ) : (
              info.title
            )}
          </h2>
          <p className="text-xs text-ink-muted">
            {t(`types.${entry.type}`)} · {status}
          </p>
        </header>

        {entry.type === 'AYAH' && <AyahText refKey={entry.ref} text={text} />}

        {editing ? (
          <NoteEditor
            initial={entry.note?.body ?? ''}
            onCancel={() => setEditing(false)}
            onSave={async (body) => {
              await (await getStore()).notes.set(entry.type, entry.ref, body);
              setEditing(false);
              onNotice(body.trim() ? t('noteSaved') : t('noteDeleted'));
            }}
            onDelete={async () => {
              if (entry.note) await (await getStore()).notes.remove(entry.note.id);
              setEditing(false);
              onNotice(t('noteDeleted'));
            }}
          />
        ) : (
          <>
            {entry.note && (
              <p className="whitespace-pre-wrap break-words rounded-xl bg-surface-raised p-3 text-sm leading-relaxed">
                <span className="sr-only">{t('noteLabel')}: </span>
                {entry.note.body}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className="secondary-button" onClick={() => setEditing(true)}>
                {entry.note ? t('editNote') : t('addNote')}
              </button>
              {entry.saved ? (
                <button type="button" className="secondary-button" onClick={() => void remove()}>
                  {t('remove')}
                </button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => void act((s) => s.saved.save(entry.type, entry.ref), t('savedMessage'))}>
                  {t('save')}
                </button>
              )}
              {entry.saved && (
                <div className="min-w-44 flex-1">
                  <CollectionSelect
                    collections={collections}
                    value={entry.saved.collectionId}
                    onChange={(cid) => act((s) => s.saved.setCollection(entry.saved!.id, cid), t('collectionChanged'))}
                    onCreate={async (name) => (await (await getStore()).collections.create(name)).id}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </article>
    </li>
  );
}

/** The Saved page (SPEC §7.6): saved ayahs, pages and surahs with notes, collections, filters and search. */
export function SavedView({
  surahs,
  pageSurahs,
  icons,
}: {
  surahs: readonly SavedSurah[];
  /** Surah of the first ayah of each page (1-based pages). */
  pageSurahs: readonly number[];
  icons: CollectionIcons & { collections: React.ReactNode };
}) {
  const t = useTranslations('Saved');
  const ta = useTranslations('Adhkar');
  const [state, retry] = useStoreData(TABLES, readAll);
  const [filter, setFilter] = useState<SavedFilter>(NO_FILTER);
  const [notice, setNotice] = useState<{ text: string; undo?: () => Promise<unknown> } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const data = state.status === 'ready' ? state.data : undefined;
  const collections = useMemo(() => data?.collections ?? [], [data]);
  const names = useMemo(() => new Map(collections.map((c) => [c.id, c.name])), [collections]);
  const collection = filter.collection === 'ALL' || filter.collection === 'NONE' || names.has(filter.collection) ? filter.collection : 'ALL';

  const describe = (e: SavedEntry): EntryInfo => {
    if (e.type === 'AYAH') {
      const [s = 0, a = 0] = e.ref.split(':').map(Number);
      const surah = surahs[s - 1];
      return { title: t('ayahTitle', { surah: surah?.name ?? s, ayah: a }), href: surah && `/quran/${surah.slug}#ayah-${s}-${a}`, search: `${surah?.search ?? ''} ${e.ref}` };
    }
    if (e.type === 'PAGE') {
      const n = Number(e.ref);
      const surah = surahs[(pageSurahs[n - 1] ?? 0) - 1];
      return { title: t('pageTitle', { n, surah: surah?.name ?? '' }), href: `/mushaf/page/${n}`, search: surah?.search ?? '' };
    }
    if (e.type === 'SURAH') {
      const surah = surahs[Number(e.ref) - 1];
      return { title: t('surahTitle', { name: surah?.name ?? e.ref }), href: surah && `/quran/${surah.slug}`, search: surah?.search ?? '' };
    }
    if (e.type === 'DHIKR') {
      const [category = '', order = 0] = e.ref.split(':');
      const name = isAdhkarCategory(category) ? ta(`categories.${category}`) : category;
      return { title: t('dhikrTitle', { category: name, n: Number(order) }), href: `/adhkar/${category}#dhikr-${category}-${order}`, search: name };
    }
    if (e.type === 'TAFSIR') {
      const [, s = 0, a = 0] = e.ref.split(':').map(Number);
      const surah = surahs[s - 1];
      return { title: t('tafsirTitle', { surah: surah?.name ?? s, ayah: a }), href: surah && `/quran/${surah.slug}#ayah-${s}-${a}`, search: surah?.search ?? '' };
    }
    return { title: e.ref, search: '' };
  };

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const counts = countByType(entries);
  const visible = filterEntries(entries, { ...filter, collection }, (e) => {
    const info = describe(e);
    return [info.title, info.search, e.note?.body ?? '', e.saved?.collectionId ? (names.get(e.saved.collectionId) ?? '') : ''].join(' ');
  });
  const texts = useAyahTexts(visible.filter((e) => e.type === 'AYAH').map((e) => e.ref));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="saved-search" className="text-sm font-semibold">
            {t('searchLabel')}
          </label>
          <input
            id="saved-search"
            type="search"
            className="text-field"
            placeholder={t('searchPlaceholder')}
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            autoComplete="off"
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('typeFilter')}</legend>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.filter((f) => f === 'ALL' || counts[f] > 0 || filter.type === f).map((f) => (
              <label key={f} className="choice-chip">
                <input
                  type="radio"
                  name="saved-type"
                  className="sr-only"
                  checked={filter.type === f}
                  onChange={() => setFilter({ ...filter, type: f })}
                />
                {t(`filters.${f}`)}
                <span className="text-ink-muted tabular-nums">{counts[f]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[min(12rem,100%)] flex-1 flex-col gap-1">
            <label htmlFor="saved-collection" className="text-sm font-semibold">
              {t('collectionFilter')}
            </label>
            <select
              id="saved-collection"
              className="text-field w-full min-w-0"
              value={collection}
              onChange={(e) => setFilter({ ...filter, collection: e.target.value })}
            >
              <option value="ALL">{t('allCollections')}</option>
              <option value="NONE">{t('noCollection')}</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="secondary-button inline-flex items-center gap-2"
            onClick={() => dialogRef.current?.showModal()}
          >
            {icons.collections}
            {t('manageCollections')}
          </button>
        </div>
      </div>

      <div role="status" className="flex min-h-6 flex-wrap items-center gap-3 text-sm font-semibold text-accent">
        {notice?.text}
        {notice?.undo && (
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              const undo = notice.undo!;
              setNotice(null);
              void undo().then(() => setNotice({ text: t('restored') }), () => setNotice({ text: t('storeError') }));
            }}
          >
            {t('undo')}
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <ul aria-busy="true" aria-label={t('loading')} className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-36 animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
        </ul>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-muted">{t('storeError')}</p>
          <button type="button" className="secondary-button" onClick={retry}>
            {t('retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && entries.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line bg-surface p-5">
          <p className="font-semibold">{t('empty')}</p>
          <p className="text-sm text-ink-muted">{t('emptyHint')}</p>
          <Link href="/quran" className="primary-button inline-flex items-center">
            {t('openQuran')}
          </Link>
        </div>
      )}

      {state.status === 'ready' && entries.length > 0 && visible.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line bg-surface p-5">
          <p className="text-sm text-ink-muted">{t('noMatches')}</p>
          <button type="button" className="secondary-button" onClick={() => setFilter(NO_FILTER)}>
            {t('clearFilters')}
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={t('listLabel')}>
          {visible.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              info={describe(e)}
              text={e.type === 'AYAH' ? texts.get(e.ref) : undefined}
              collections={collections}
              collectionName={e.saved?.collectionId ? names.get(e.saved.collectionId) : undefined}
              onNotice={(text, undo) => setNotice({ text, undo })}
            />
          ))}
        </ul>
      )}

      <CollectionsDialog ref={dialogRef} collections={collections} icons={icons} />
    </div>
  );
}
