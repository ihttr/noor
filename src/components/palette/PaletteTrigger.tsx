'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import type { PaletteSection } from '@/lib/palette/items';

// The palette itself is loaded on first use; this listener is all that every page carries.
const CommandPalette = lazy(() => import('./CommandPalette'));

/** Opens the command palette on Ctrl/Cmd + K and on clicks on `[data-open-palette]` links. */
export function PaletteTrigger({ sections }: { sections: readonly PaletteSection[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    // The header search links go to /search without JavaScript; with it they open the palette.
    // Capture phase: runs before the link's own navigation handler.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!(e.target as Element).closest('[data-open-palette]')) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return open ? (
    <Suspense fallback={null}>
      <CommandPalette sections={sections} onClose={() => setOpen(false)} />
    </Suspense>
  ) : null;
}
