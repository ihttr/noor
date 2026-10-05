// Navigation data only (no icons: see nav-icons.tsx, rendered on the server).

export type NavKey =
  | 'home'
  | 'quran'
  | 'adhkar'
  | 'tasbih'
  | 'prayer'
  | 'qibla'
  | 'calendar'
  | 'saved'
  | 'stats'
  | 'settings'
  | 'about'
  | 'more';

export type NavItem = {
  key: NavKey;
  href: string;
  /** Shown in the mobile bottom bar (max 5 items, thumb reach). */
  bottomBar: boolean;
  /** Shown in the desktop side navigation. */
  sidebar: boolean;
  /** Listed on the mobile "More" page. */
  inMore: boolean;
  /** SPEC §16 phase that builds the page; undefined for pure navigation pages. */
  phase?: number;
  /** Other path prefixes that belong to this section (e.g. the Mushaf view belongs to Quran). */
  activeFor?: readonly string[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/', bottomBar: true, sidebar: true, inMore: false, phase: 4 },
  { key: 'quran', href: '/quran', bottomBar: true, sidebar: true, inMore: false, phase: 3, activeFor: ['/mushaf', '/juz'] },
  { key: 'adhkar', href: '/adhkar', bottomBar: true, sidebar: true, inMore: false, phase: 7 },
  { key: 'prayer', href: '/prayer', bottomBar: true, sidebar: true, inMore: false, phase: 8 },
  { key: 'tasbih', href: '/tasbih', bottomBar: false, sidebar: true, inMore: true, phase: 7 },
  { key: 'qibla', href: '/qibla', bottomBar: false, sidebar: true, inMore: true, phase: 8 },
  { key: 'calendar', href: '/calendar', bottomBar: false, sidebar: true, inMore: true, phase: 8 },
  { key: 'saved', href: '/saved', bottomBar: false, sidebar: true, inMore: true, phase: 4 },
  { key: 'stats', href: '/stats', bottomBar: false, sidebar: true, inMore: true, phase: 10 },
  { key: 'settings', href: '/settings', bottomBar: false, sidebar: true, inMore: true, phase: 4 },
  { key: 'about', href: '/about', bottomBar: false, sidebar: true, inMore: true },
  { key: 'more', href: '/more', bottomBar: true, sidebar: false, inMore: false },
];

export function navItem(key: NavKey): NavItem {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown nav item: ${key}`);
  return item;
}

/** Whether `pathname` (locale-free, as returned by next-intl's usePathname) belongs to `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
