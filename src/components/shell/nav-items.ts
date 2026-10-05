import {
  BookHeart,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChartColumn,
  CircleDot,
  Clock,
  Compass,
  Ellipsis,
  House,
  Settings,
  type LucideIcon,
} from 'lucide-react';

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
  | 'more';

export type NavItem = {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar (max 5 items, thumb reach). */
  bottomBar: boolean;
  /** Shown in the desktop side navigation. */
  sidebar: boolean;
  /** Listed on the mobile "More" page. */
  inMore: boolean;
  /** SPEC §16 phase that builds the page; undefined for pure navigation pages. */
  phase?: number;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/', icon: House, bottomBar: true, sidebar: true, inMore: false, phase: 4 },
  { key: 'quran', href: '/quran', icon: BookOpen, bottomBar: true, sidebar: true, inMore: false, phase: 3 },
  { key: 'adhkar', href: '/adhkar', icon: BookHeart, bottomBar: true, sidebar: true, inMore: false, phase: 7 },
  { key: 'prayer', href: '/prayer', icon: Clock, bottomBar: true, sidebar: true, inMore: false, phase: 8 },
  { key: 'tasbih', href: '/tasbih', icon: CircleDot, bottomBar: false, sidebar: true, inMore: true, phase: 7 },
  { key: 'qibla', href: '/qibla', icon: Compass, bottomBar: false, sidebar: true, inMore: true, phase: 8 },
  { key: 'calendar', href: '/calendar', icon: CalendarDays, bottomBar: false, sidebar: true, inMore: true, phase: 8 },
  { key: 'saved', href: '/saved', icon: Bookmark, bottomBar: false, sidebar: true, inMore: true, phase: 4 },
  { key: 'stats', href: '/stats', icon: ChartColumn, bottomBar: false, sidebar: true, inMore: true, phase: 10 },
  { key: 'settings', href: '/settings', icon: Settings, bottomBar: false, sidebar: true, inMore: true, phase: 4 },
  { key: 'more', href: '/more', icon: Ellipsis, bottomBar: true, sidebar: false, inMore: false },
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
