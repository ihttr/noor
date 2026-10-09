import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import type { ReactNode } from 'react';
import { navItem, type NavKey } from './shell/nav-items';

type PageKey = Exclude<NavKey, 'home'> | 'home';

/** Title, description, canonical URL, hreflang and Open Graph of a top-level page (SPEC §9). */
export async function placeholderMetadata(key: PageKey, { noindex = false } = {}): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('Pages'), getLocale()]);
  return pageMetadata({
    title: t(`${key}.title`),
    description: t(`${key}.description`),
    path: navItem(key).href,
    locale,
    noindex,
    absoluteTitle: key === 'home',
  });
}

/** Phase 1 placeholder: title, purpose and the phase that will build the page. No content. */
export async function PlaceholderPage({ pageKey, children }: { pageKey: PageKey; children?: ReactNode }) {
  const t = await getTranslations('Pages');
  const tp = await getTranslations('Placeholder');
  const phase = navItem(pageKey).phase;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold md:text-3xl">{t(`${pageKey}.title`)}</h1>
          {phase !== undefined && (
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              {tp('phase', { phase })}
            </span>
          )}
        </div>
        <p className="text-ink-muted">{t(`${pageKey}.description`)}</p>
      </header>
      {phase !== undefined && (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-5 text-sm text-ink-muted">
          {tp('body', { phase })}
        </p>
      )}
      {children}
    </article>
  );
}
