import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitch } from './LanguageSwitch';
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

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow"
      >
        {tShell('skipToContent')}
      </a>

      {/* Desktop / tablet: side navigation on the inline-start edge (right in RTL). */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-e border-line bg-surface px-4 py-6 md:flex">
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl px-2">
          <BrandMark />
          <span className="text-lg font-semibold">{tShell('brand')}</span>
        </Link>
        <nav aria-label={tShell('primaryNav')} className="flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.filter((i) => i.sidebar).map((item) => (
              <li key={item.key}>
                <NavLink navKey={item.key} label={tNav(item.key)} variant="side" />
              </li>
            ))}
          </ul>
        </nav>
        <LanguageSwitch />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: compact top bar. */}
        <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl">
              <BrandMark />
              <span className="text-base font-semibold">{tShell('brand')}</span>
            </Link>
            <LanguageSwitch className="-me-2" />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="w-full max-w-3xl flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none md:px-10 md:py-10"
        >
          {children}
        </main>
      </div>

      {/* Mobile: bottom navigation within thumb reach (SPEC §6). */}
      <nav
        aria-label={tShell('primaryNav')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch px-1 py-1">
          {NAV_ITEMS.filter((i) => i.bottomBar).map((item) => (
            <li key={item.key} className="flex flex-1">
              <NavLink
                navKey={item.key}
                label={tNav(item.key)}
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
