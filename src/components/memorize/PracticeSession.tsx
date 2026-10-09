'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { maskAyah, MASK_MODES, type MaskMode } from '@/lib/memorize/mask';
import { GRADES, type Grade } from '@/lib/memorize/srs';
import { loadSurahFile } from '@/lib/quran/client';

export interface PracticeItem {
  surah: number;
  ayah: number;
}

interface Props {
  items: readonly PracticeItem[];
  surahNames: readonly string[];
  mode: MaskMode;
  onMode: (mode: MaskMode) => void;
  onGrade: (item: PracticeItem, grade: Grade) => Promise<void>;
  onEnd: () => void;
}

type Text = { status: 'loading' } | { status: 'ready'; key: string; text: string } | { status: 'error'; key: string };

/**
 * One practice or review session (SPEC §7.12): an ayah at a time behind a display mask, reveal a
 * word or the whole ayah, then a self-assessment. The ayah text is rendered from the stored text
 * only; the mask decides which parts are visible (D-066).
 */
export function PracticeSession({ items, surahNames, mode, onMode, onGrade, onEnd }: Props) {
  const t = useTranslations('Memorize');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<ReadonlySet<number> | 'all'>(new Set());
  const [text, setText] = useState<Text>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [graded, setGraded] = useState(0);
  const item = items[index];
  const key = item ? `${item.surah}:${item.ayah}` : '';

  useEffect(() => {
    if (!item) return;
    let stopped = false;
    loadSurahFile(item.surah).then(
      (file) => !stopped && setText({ status: 'ready', key: `${item.surah}:${item.ayah}`, text: file.ayahs[item.ayah - 1]!.text }),
      () => !stopped && setText({ status: 'error', key: `${item.surah}:${item.ayah}` })
    );
    return () => {
      stopped = true;
    };
  }, [item]);

  if (!item) {
    return (
      <section aria-labelledby="session-done" className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-5">
        <h2 id="session-done" className="text-lg font-semibold">
          {t('sessionDone')}
        </h2>
        <p role="status">{t('sessionSummary', { n: graded })}</p>
        <button type="button" className="primary-button" onClick={onEnd}>
          {t('back')}
        </button>
      </section>
    );
  }

  const ready = text.status === 'ready' && text.key === key ? text.text : null;
  const isRevealed = (word: number) => revealed === 'all' || revealed.has(word);
  const reveal = (word: number) => setRevealed((r) => (r === 'all' ? r : new Set(r).add(word)));
  const onWordKey = (e: KeyboardEvent<HTMLElement>, word: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      reveal(word);
    }
  };

  async function grade(g: Grade) {
    setBusy(true);
    try {
      await onGrade(item!, g);
      setGraded((n) => n + 1);
      setRevealed(new Set());
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="session-title" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="session-title" className="text-lg font-semibold">
            {t('ayahOf', { surah: surahNames[item.surah - 1] ?? '', ayah: item.ayah })}
          </h2>
          <p className="text-sm text-ink-muted">{t('progress', { n: index + 1, total: items.length })}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onEnd}>
          {t('endSession')}
        </button>
      </header>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">{t('maskLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {MASK_MODES.map((m) => (
            <label key={m} className="choice-chip">
              <input type="radio" name="mask" value={m} checked={mode === m} onChange={() => onMode(m)} className="accent-[var(--color-accent)]" />
              {t(`masks.${m}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">{t('maskNote')}</p>
      </fieldset>

      <div className="min-h-40 rounded-2xl border border-line bg-surface p-5" aria-busy={!ready}>
        {ready ? (
          <p lang="ar" dir="rtl" className="memorize-ayah" data-ayah-text={key} data-mask={mode}>
            {maskAyah(ready, mode).map((token, i) => {
              const hidden = token.hidden && !isRevealed(token.word);
              return (
                <span key={i} className="contents">
                  {i > 0 && ' '}
                  {token.shown}
                  {token.hidden &&
                    (hidden ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="mask-word"
                        aria-label={t('revealWord', { n: token.word + 1 })}
                        onClick={() => reveal(token.word)}
                        onKeyDown={(e) => onWordKey(e, token.word)}
                      >
                        <span aria-hidden="true">{token.hidden}</span>
                      </span>
                    ) : (
                      <span className="mask-revealed">{token.hidden}</span>
                    ))}
                </span>
              );
            })}
          </p>
        ) : text.status === 'error' && text.key === key ? (
          <p className="text-ink-muted">{t('loadError')}</p>
        ) : (
          <span className="block h-24 animate-pulse rounded-xl bg-surface-raised" />
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="secondary-button" onClick={() => setRevealed('all')} disabled={!ready || revealed === 'all'}>
          {t('showAnswer')}
        </button>
      </div>

      <div role="group" aria-label={t('assess')} className="grid grid-cols-3 gap-2">
        {GRADES.map((g) => (
          <button key={g} type="button" className={g === 'good' ? 'primary-button' : 'secondary-button'} disabled={busy || !ready} onClick={() => void grade(g)}>
            {t(`grades.${g}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
