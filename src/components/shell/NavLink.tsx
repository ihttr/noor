'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { isActivePath, navItem, type NavKey } from './nav-items';

type Props = {
  navKey: NavKey;
  label: string;
  variant: 'bottom' | 'side';
  /** Paths that should also mark this link active (e.g. "More" for its sub-pages). */
  alsoActiveFor?: readonly string[];
};

// Icons are looked up here (client side) because components cannot be passed as props from
// Server Components.
export function NavLink({ navKey, label, variant, alsoActiveFor = [] }: Props) {
  const { href, icon: Icon } = navItem(navKey);
  const pathname = usePathname();
  const active = isActivePath(pathname, href) || alsoActiveFor.some((p) => isActivePath(pathname, p));

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
          <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.25 : 1.75} />
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
      <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
      <span>{label}</span>
    </Link>
  );
}
