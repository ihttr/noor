'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useStoreData } from '@/components/store/useStoreData';
import { Link } from '@/i18n/navigation';
import type { LocalStore } from '@/lib/store';

const TABLES = ['readingPositions'] as const;
const readPosition = (store: LocalStore) => store.position.get();

export interface SurahLink {
  name: string;
  slug: string;
}

/**
 * "Continue Reading" (SPEC §7.1): the last reading position (topmost visible ayah, SPEC §7.7),
 * one tap back to that exact ayah in the mode it was read in.
 */
export function ContinueReading({ surahs, icon }: { surahs: readonly SurahLink[]; icon: ReactNode }) {
  const t = useTranslations('Home');
  const [state, retry] = useStoreData(TABLES, readPosition);

  const frame = 'min-h-32 rounded-2xl border border-line bg-surface';

  if (state.status === 'loading') {
    return (
      <section aria-busy="true" aria-label={t('continueReading')} className={`${frame} flex flex-col justify-center gap-3 p-5`}>
        <span className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
        <span className="h-6 w-44 animate-pulse rounded bg-surface-raised" />
        <span className="h-4 w-36 animate-pulse rounded bg-surface-raised" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="continue-title" className={`${frame} flex flex-col items-start justify-center gap-3 p-5`}>
        <h2 id="continue-title" className="text-sm font-semibold text-accent">
          {t('continueReading')}
        </h2>
        <p className="text-sm text-ink-muted">{t('storeError')}</p>
        <button type="button" className="secondary-button" onClick={retry}>
          {t('retry')}
        </button>
      </section>
    );
  }

  const position = state.data;
  const surah = position && surahs[position.surah - 1];
  if (!position || !surah) {
    return (
      <section aria-labelledby="continue-title" className={`${frame} flex flex-col items-start justify-center gap-3 p-5`}>
        <h2 id="continue-title" className="text-sm font-semibold text-accent">
          {t('startReading')}
        </h2>
        <p className="text-sm text-ink-muted">{t('noPosition')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/quran/${surahs[0]?.slug ?? ''}`} className="primary-button inline-flex items-center">
            {t('startWithFatiha')}
          </Link>
          <Link href="/quran" className="secondary-button inline-flex items-center">
            {t('surahIndex')}
          </Link>
        </div>
      </section>
    );
  }

  const anchor = `#ayah-${position.surah}-${position.ayah}`;
  const href = position.mode === 'MUSHAF' ? `/mushaf/page/${position.page}${anchor}` : `/quran/${surah.slug}${anchor}`;

  return (
    <section aria-labelledby="continue-title" className={frame}>
      <Link
        href={href}
        className="flex min-h-32 items-center gap-4 rounded-2xl p-5 transition-colors hover:bg-surface-raised"
        data-testid="continue-reading"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="continue-title" className="text-sm font-semibold text-accent">
            {t('continueReading')}
          </h2>
          <span className="text-xl font-semibold">{t('surahTitle', { name: surah.name })}</span>
          <span className="text-sm text-ink-muted">
            {t('position', { ayah: position.ayah, page: position.page })} ·{' '}
            {position.mode === 'MUSHAF' ? t('mushafMode') : t('readingMode')}
          </span>
        </div>
        {icon}
      </Link>
    </section>
  );
}
