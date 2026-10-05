'use client';

import { Link, usePathname } from '@/i18n/navigation';
import type { ReactNode } from 'react';
import { isActivePath, navItem, type NavKey } from './nav-items';

type Props = {
  navKey: NavKey;
  label: string;
  /** Server-rendered icon element (no icon code in the client bundle). */
  icon: ReactNode;
  variant: 'bottom' | 'side';
  /** Paths that should also mark this link active (e.g. "More" for its sub-pages). */
  alsoActiveFor?: readonly string[];
};

export function NavLink({ navKey, label, icon, variant, alsoActiveFor = [] }: Props) {
  const { href, activeFor = [] } = navItem(navKey);
  const pathname = usePathname();
  const active = [href, ...activeFor, ...alsoActiveFor].some((p) => isActivePath(pathname, p));

  if (variant === 'bottom') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs transition-colors ${
          active ? 'font-semibold text-accent' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <span
          className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
            active ? 'bg-accent-soft' : ''
          }`}
        >
          {icon}
        </span>
        <span className="leading-none">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
        active ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
