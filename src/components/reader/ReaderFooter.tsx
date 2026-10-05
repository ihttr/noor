import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export interface StepLink {
  href: string;
  label: string;
  detail?: string;
}

/**
 * Previous/next links. `bookOrder` lays them out like a right-to-left book (next on the left) —
 * used for Mushaf pages in every UI language; otherwise they follow the UI direction.
 */
export function StepNav({ prev, next, label, bookOrder = false }: { prev?: StepLink; next?: StepLink; label: string; bookOrder?: boolean }) {
  const item = (link: StepLink | undefined, kind: 'prev' | 'next') => {
    if (!link) return <span className="flex-1" />;
    // In a right-to-left flow "previous" points right and "next" points left.
    const Icon = kind === 'next' ? ChevronLeft : ChevronRight;
    return (
      <Link
        href={link.href}
        rel={kind}
        className={`flex min-h-14 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-4 transition-colors hover:bg-surface-raised ${
          kind === 'next' ? 'justify-end text-end' : ''
        }`}
      >
        {kind === 'prev' && <Icon aria-hidden="true" className={`size-5 shrink-0 text-accent ${bookOrder ? '' : 'ltr:rotate-180'}`} />}
        <span className="flex flex-col">
          <span className="text-xs text-ink-muted">{link.label}</span>
          {link.detail && <span className="font-semibold">{link.detail}</span>}
        </span>
        {kind === 'next' && <Icon aria-hidden="true" className={`size-5 shrink-0 text-accent ${bookOrder ? '' : 'ltr:rotate-180'}`} />}
      </Link>
    );
  };
  return (
    <nav aria-label={label} className="mt-10 flex gap-3" dir={bookOrder ? 'rtl' : undefined}>
      {item(prev, 'prev')}
      {item(next, 'next')}
    </nav>
  );
}

/** Attribution required by the Tanzil terms, shown wherever Quran text is displayed. */
export async function SourceNote({ mushaf = false }: { mushaf?: boolean }) {
  const t = await getTranslations('Reader');
  const tNav = await getTranslations('Nav');
  return (
    <p className="mt-8 text-center text-xs text-ink-muted">
      <a href="https://tanzil.net" className="underline underline-offset-2" rel="noopener">
        {t('source')} (tanzil.net)
      </a>
      {' · '}
      <Link href="/about" className="underline underline-offset-2">
        {tNav('about')}
      </Link>
      {mushaf && (
        <>
          <br />
          {t('approxNote')}
        </>
      )}
    </p>
  );
}
