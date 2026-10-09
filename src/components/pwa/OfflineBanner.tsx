'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** SPEC §7.20: an honest banner while the device is offline. The live region is always present. */
export function OfflineBanner() {
  const t = useTranslations('Offline');
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
  return (
    <div role="status" data-chrome-part className="empty:hidden">
      {!online && (
        <p className="border-b border-line bg-accent-soft px-4 py-2 text-center text-sm font-semibold text-ink" data-testid="offline-banner">
          {t('banner')}
        </p>
      )}
    </div>
  );
}
