'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { unlockAudio } from '@/components/audio/audio-element';
import { useStoreData } from '@/components/store/useStoreData';
import { Link } from '@/i18n/navigation';
import type { LocalStore } from '@/lib/store';

const TABLES = ['readingPositions'] as const;
const readPosition = (store: LocalStore) => store.position.get();

export type QuickKey = 'quran' | 'adhkar' | 'search' | 'saved' | 'lastRead' | 'listen';

/** Home "Quick access" (SPEC §7.1): Quran, Adhkar, Search, Saved, Last read, Listen. */
export function QuickAccess({ slugs, icons }: { slugs: readonly string[]; icons: Record<QuickKey, ReactNode> }) {
  const t = useTranslations('Home');
  const [state] = useStoreData(TABLES, readPosition);
  const position = state.status === 'ready' ? state.data : undefined;
  const lastRead = position
    ? position.mode === 'MUSHAF'
      ? `/mushaf/page/${position.page}#ayah-${position.surah}-${position.ayah}`
      : `/quran/${slugs[position.surah - 1]}#ayah-${position.surah}-${position.ayah}`
    : '/quran';
  const tile = 'flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm font-semibold transition-colors hover:bg-surface-raised';
  const links: [QuickKey, string][] = [
    ['quran', '/quran'],
    ['adhkar', '/adhkar'],
    ['search', '/search'],
    ['saved', '/saved'],
    ['lastRead', lastRead],
  ];

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {links.map(([key, href]) => (
        <li key={key}>
          <Link href={href} className={tile}>
            {icons[key]}
            {t(`quick.${key}`)}
          </Link>
        </li>
      ))}
      <li>
        <button
          type="button"
          className={`${tile} w-full`}
          onClick={() => {
            // Listen from the last reading position, or from the beginning of the Quran.
            unlockAudio();
            void import('@/components/audio/engine').then((m) => m.playFrom(position?.surah ?? 1, position?.ayah ?? 1));
          }}
        >
          {icons.listen}
          {t('quick.listen')}
        </button>
      </li>
    </ul>
  );
}
