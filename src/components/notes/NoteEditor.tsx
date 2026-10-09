'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { NOTE_MAX_LENGTH } from '@/lib/store/types';

/** Private note on an ayah, page, surah… (SPEC §7.6). Notes are never public. */
export function NoteEditor({
  initial,
  onSave,
  onDelete,
  onCancel,
  autoFocus = true,
}: {
  initial: string;
  onSave: (body: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations('Notes');
  const id = useId();
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void> | void) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => onSave(body));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={`${id}-body`} className="text-sm font-semibold">
        {t('label')}
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        rows={5}
        autoFocus={autoFocus}
        aria-describedby={`${id}-hint ${id}-error`}
        className="text-field min-h-32 resize-y py-2 leading-relaxed"
      />
      <p id={`${id}-hint`} className="text-xs text-ink-muted">
        {t('privateHint')}
      </p>
      <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-accent empty:hidden">
        {error}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="primary-button" disabled={busy}>
          {t('save')}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          {t('cancel')}
        </button>
        {onDelete && initial && (
          <button type="button" className="secondary-button ms-auto" onClick={() => void run(onDelete)} disabled={busy}>
            {t('delete')}
          </button>
        )}
      </div>
    </form>
  );
}
