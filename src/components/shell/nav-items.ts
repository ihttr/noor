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
  | 'memorize'
  | 'search'
  | 'stats'
  | 'settings'
  | 'about'
  | 'privacy'
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
  { key: 'home', href: '/', bottomBar: true, sidebar: true, inMore: false },
  { key: 'quran', href: '/quran', bottomBar: true, sidebar: true, inMore: false, activeFor: ['/mushaf', '/juz'] },
  { key: 'adhkar', href: '/adhkar', bottomBar: true, sidebar: true, inMore: false },
  { key: 'prayer', href: '/prayer', bottomBar: true, sidebar: true, inMore: false },
  { key: 'tasbih', href: '/tasbih', bottomBar: false, sidebar: true, inMore: true },
  { key: 'qibla', href: '/qibla', bottomBar: false, sidebar: true, inMore: true },
  { key: 'calendar', href: '/calendar', bottomBar: false, sidebar: true, inMore: true },
  { key: 'saved', href: '/saved', bottomBar: false, sidebar: true, inMore: true },
  { key: 'memorize', href: '/memorize', bottomBar: false, sidebar: true, inMore: true },
  // The sidebar and the mobile header have their own search button (it opens the palette).
  { key: 'search', href: '/search', bottomBar: false, sidebar: false, inMore: true },
  { key: 'stats', href: '/stats', bottomBar: false, sidebar: true, inMore: true },
  { key: 'settings', href: '/settings', bottomBar: false, sidebar: true, inMore: true },
  { key: 'about', href: '/about', bottomBar: false, sidebar: true, inMore: true },
  { key: 'privacy', href: '/privacy', bottomBar: false, sidebar: false, inMore: true },
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
