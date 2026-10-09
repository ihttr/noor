'use client';

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

// The persistent mini player lives in the root layout, so it survives navigation. Until audio
// is started nothing is loaded: the player code arrives with the first "Play".
const MiniPlayer = lazy(() => import('./MiniPlayer'));

export interface PlayerIcons {
  play: ReactNode;
  pause: ReactNode;
  /** Arrows by screen direction: previous is right in Arabic (RTL), left in English. */
  left: ReactNode;
  right: ReactNode;
  expand: ReactNode;
  close: ReactNode;
}

export function AudioMount({ icons }: { icons: PlayerIcons }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setActive((e as CustomEvent<{ active: boolean }>).detail.active);
    window.addEventListener('noor:audio', on);
    return () => window.removeEventListener('noor:audio', on);
  }, []);
  return active ? (
    <Suspense fallback={null}>
      <MiniPlayer icons={icons} />
    </Suspense>
  ) : null;
}
