'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { COLLECTION_NAME_MAX_LENGTH, type CollectionRecord } from '@/lib/store/types';

const NEW = '__new__';

/** Chooses the collection of a saved item, with an inline "new collection" field. */
export function CollectionSelect({
  collections,
  value,
  onChange,
  onCreate,
  label,
}: {
  collections: readonly CollectionRecord[];
  value: string | null;
  onChange: (collectionId: string | null) => Promise<void> | void;
  onCreate: (name: string) => Promise<string>;
  label?: string;
}) {
  const t = useTranslations('Saved');
  const id = useId();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const newId = await onCreate(name);
      await onChange(newId);
      setCreating(false);
      setName('');
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-select`} className="text-sm font-semibold">
        {label ?? t('collection')}
      </label>
      <select
        id={`${id}-select`}
        className="text-field"
        value={creating ? NEW : (value ?? '')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW) return setCreating(true);
          setCreating(false);
          void onChange(v || null);
        }}
      >
        <option value="">{t('noCollection')}</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW}>{t('newCollectionOption')}</option>
      </select>
      {creating && (
        <form onSubmit={create} className="flex gap-2">
          <label htmlFor={`${id}-name`} className="sr-only">
            {t('newCollectionName')}
          </label>
          <input
            id={`${id}-name`}
            className="text-field min-w-0 flex-1"
            value={name}
            maxLength={COLLECTION_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('newCollectionName')}
            autoFocus
            aria-invalid={error || undefined}
          />
          <button type="submit" className="primary-button">
            {t('add')}
          </button>
        </form>
      )}
    </div>
  );
}
