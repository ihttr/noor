'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { getStore, type LocalStore } from '@/lib/store';
import { COLLECTION_NAME_MAX_LENGTH, type CollectionRecord } from '@/lib/store/types';

export interface CollectionIcons {
  close: ReactNode;
  up: ReactNode;
  down: ReactNode;
  remove: ReactNode;
}

/** Create, rename, reorder and delete collections (SPEC §7.6). Items of a deleted collection stay saved. */
export function CollectionsDialog({
  ref,
  collections,
  icons,
}: {
  ref?: Ref<HTMLDialogElement>;
  collections: readonly CollectionRecord[];
  icons: CollectionIcons;
}) {
  const t = useTranslations('Saved');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function act(action: (store: LocalStore) => Promise<unknown>) {
    try {
      await action(await getStore());
      setError(null);
    } catch {
      setError(t('storeError'));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await act((s) => s.collections.create(name));
    setName('');
  }

  return (
    <dialog ref={ref} className="reader-dialog" aria-labelledby="collections-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="collections-title" className="text-lg font-semibold">
          {t('collections')}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('close')}
          onClick={(e) => e.currentTarget.closest('dialog')?.close()}
        >
          {icons.close}
        </button>
      </div>

      {collections.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('noCollections')}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {collections.map((c, i) => (
            <li key={`${c.id}:${c.name}`} className="flex items-center gap-1">
              <label htmlFor={`collection-${c.id}`} className="sr-only">
                {t('renameCollection', { name: c.name })}
              </label>
              <input
                id={`collection-${c.id}`}
                className="text-field min-w-0 flex-1"
                defaultValue={c.name}
                maxLength={COLLECTION_NAME_MAX_LENGTH}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                onBlur={(e) => {
                  const value = e.currentTarget.value.trim();
                  if (value && value !== c.name) void act((s) => s.collections.rename(c.id, value));
                  else e.currentTarget.value = c.name;
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={t('moveUp', { name: c.name })}
                disabled={i === 0}
                onClick={() => void act((s) => s.collections.move(c.id, -1))}
              >
                {icons.up}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t('moveDown', { name: c.name })}
                disabled={i === collections.length - 1}
                onClick={() => void act((s) => s.collections.move(c.id, 1))}
              >
                {icons.down}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t('deleteCollection', { name: c.name })}
                onClick={() => {
                  if (window.confirm(t('deleteConfirm', { name: c.name }))) void act((s) => s.collections.remove(c.id));
                }}
              >
                {icons.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-4 flex gap-2" onSubmit={add}>
        <label htmlFor="new-collection" className="sr-only">
          {t('newCollectionName')}
        </label>
        <input
          id="new-collection"
          className="text-field min-w-0 flex-1"
          value={name}
          maxLength={COLLECTION_NAME_MAX_LENGTH}
          placeholder={t('newCollectionName')}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary-button">
          {t('add')}
        </button>
      </form>
      <p role="alert" className="mt-3 text-sm font-semibold text-accent empty:hidden">
        {error}
      </p>
    </dialog>
  );
}
