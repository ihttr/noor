import { BookOpen, Hash, List, Minus, Plus, ScrollText, SlidersHorizontal, X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ReaderShell, type ReaderIcons } from './ReaderShell';

const icon = 'size-5 shrink-0';

// Icons are rendered here, on the server, and passed to the client shell as SVG elements, so the
// reader ships no icon code (SPEC §11: ≤ 150 KB of JS on the reader route).
const ICONS: ReaderIcons = {
  list: <List aria-hidden="true" className={icon} strokeWidth={1.75} />,
  reading: <ScrollText aria-hidden="true" className={icon} strokeWidth={1.75} />,
  mushaf: <BookOpen aria-hidden="true" className={icon} strokeWidth={1.75} />,
  jump: <Hash aria-hidden="true" className={icon} strokeWidth={1.75} />,
  settings: <SlidersHorizontal aria-hidden="true" className={icon} strokeWidth={1.75} />,
  close: <X aria-hidden="true" className={icon} />,
  minus: <Minus aria-hidden="true" className={icon} />,
  plus: <Plus aria-hidden="true" className={icon} />,
};

export function Reader(props: Omit<ComponentProps<typeof ReaderShell>, 'icons'>) {
  return <ReaderShell {...props} icons={ICONS} />;
}
