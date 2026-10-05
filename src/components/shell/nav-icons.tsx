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
  Info,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { NavKey } from './nav-items';

// Icons are rendered on the server and handed to client links as ready-made SVG elements, so no
// icon code is shipped to the browser for the navigation (SPEC §11 JS budget).
const ICONS: Record<NavKey, LucideIcon> = {
  home: House,
  quran: BookOpen,
  adhkar: BookHeart,
  prayer: Clock,
  tasbih: CircleDot,
  qibla: Compass,
  calendar: CalendarDays,
  saved: Bookmark,
  stats: ChartColumn,
  settings: Settings,
  about: Info,
  more: Ellipsis,
};

export function NavIcon({ navKey, className = 'size-5 shrink-0' }: { navKey: NavKey; className?: string }) {
  const Icon = ICONS[navKey];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.75} />;
}
