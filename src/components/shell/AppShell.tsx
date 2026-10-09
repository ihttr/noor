import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronLeft, ChevronRight, ChevronUp, Languages, Pause, Play, Search, X } from 'lucide-react';
import { AudioMount } from '@/components/audio/AudioMount';
import { PaletteTrigger } from '@/components/palette/PaletteTrigger';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { getAdhkarIndex } from '@/lib/adhkar/content';
import { LanguageSwitch } from './LanguageSwitch';
import { NavIcon } from './nav-icons';
import { NavLink } from './NavLink';
import { NAV_ITEMS } from './nav-items';

const MORE_SECTION_PATHS = NAV_ITEMS.filter((i) => i.inMore).map((i) => i.href);

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 shrink-0">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="var(--on-accent)" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="var(--on-accent)" />
    </svg>
  );
}

export async function AppShell({ children }: { children: ReactNode }) {
  const tShell = await getTranslations('Shell');
  const tNav = await getTranslations('Nav');
  const tAdhkar = await getTranslations('Adhkar');
  const { categories } = await getAdhkarIndex();
  const sections = [
    { key: 'search', href: '/search', label: tNav('search') },
    ...NAV_ITEMS.filter((i) => i.key !== 'more' && i.key !== 'search').map((i) => ({ key: i.key, href: i.href, label: tNav(i.key) })),
    ...categories.filter((c) => c.count > 0).map((c) => ({ key: `adhkar-${c.id}`, href: `/adhkar/${c.id}`, label: tAdhkar(`categories.${c.id}`) })),
  ];

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow"
      >
        {tShell('skipToContent')}
      </a>

      {/* Desktop / tablet: side navigation on the inline-start edge (right in RTL). */}
      <aside
        data-chrome-part
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-e border-line bg-surface px-4 py-6 md:flex"
      >
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl px-2">
          <BrandMark />
          <span className="text-lg font-semibold">{tShell('brand')}</span>
        </Link>
        <Link
          href="/search"
          data-open-palette
          className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <Search aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">{tShell('search')}</span>
          <kbd className="rounded border border-line px-1.5 text-xs" dir="ltr" aria-hidden="true">
            Ctrl K
          </kbd>
        </Link>
        <nav aria-label={tShell('primaryNav')} className="flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.filter((i) => i.sidebar).map((item) => (
              <li key={item.key}>
                <NavLink navKey={item.key} label={tNav(item.key)} icon={<NavIcon navKey={item.key} />} variant="side" />
              </li>
            ))}
          </ul>
        </nav>
        <LanguageSwitch icon={<Languages aria-hidden="true" className="size-5" strokeWidth={1.75} />} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: compact top bar. */}
        <header
          data-chrome-part
          className="sticky top-0 z-20 border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden"
        >
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-2 px-4">
            <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl">
              <BrandMark />
              <span className="text-base font-semibold">{tShell('brand')}</span>
            </Link>
            <div className="-me-2 flex items-center">
              <Link href="/search" data-open-palette className="icon-button" aria-label={tShell('search')}>
                <Search aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </Link>
              <LanguageSwitch icon={<Languages aria-hidden="true" className="size-5" strokeWidth={1.75} />} />
            </div>
          </div>
        </header>

        <OfflineBanner />
        <main
          id="main"
          tabIndex={-1}
          className="w-full min-w-0 flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none md:px-10 md:py-10"
        >
          {children}
        </main>
      </div>

      <PaletteTrigger sections={sections} />
      <AudioMount
        icons={{
          play: <Play aria-hidden="true" className="size-5" fill="currentColor" strokeWidth={1.5} />,
          pause: <Pause aria-hidden="true" className="size-5" fill="currentColor" strokeWidth={1.5} />,
          left: <ChevronLeft aria-hidden="true" className="size-5" />,
          right: <ChevronRight aria-hidden="true" className="size-5" />,
          expand: <ChevronUp aria-hidden="true" className="size-5" />,
          close: <X aria-hidden="true" className="size-5" />,
        }}
      />

      {/* Mobile: bottom navigation within thumb reach (SPEC §6). */}
      <nav
        data-chrome-part
        aria-label={tShell('primaryNav')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch px-1 py-1">
          {NAV_ITEMS.filter((i) => i.bottomBar).map((item) => (
            <li key={item.key} className="flex min-w-0 flex-1">
              <NavLink
                navKey={item.key}
                label={tNav(item.key)}
                icon={<NavIcon navKey={item.key} />}
                variant="bottom"
                alsoActiveFor={item.key === 'more' ? MORE_SECTION_PATHS : undefined}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
