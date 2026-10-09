'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cacheAvailable, downloadQuran, offlineQuranInfo, removeOfflineQuran, type OfflineQuranInfo } from './offline-quran';

type Download = { state: 'idle' } | { state: 'running'; done: number; total: number; bytes: number } | { state: 'error' };

/** Settings → Offline (SPEC §7.20): what works offline, and the explicit Quran download. */
export function OfflinePanel() {
  const t = useTranslations('Offline');
  const format = useFormatter();
  const locale = useLocale();
  const [worker, setWorker] = useState<boolean | null>(null);
  const [info, setInfo] = useState<OfflineQuranInfo | null | undefined>(undefined);
  const [download, setDownload] = useState<Download>({ state: 'idle' });
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let stopped = false;
    void offlineQuranInfo().then((i) => !stopped && setInfo(i), () => !stopped && setInfo(null));
    void navigator.storage
      ?.estimate?.()
      .then((e) => !stopped && setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((r) => !stopped && setWorker(Boolean(r?.active)));
    } else {
      setTimeout(() => !stopped && setWorker(false));
    }
    return () => {
      stopped = true;
      abort.current?.abort();
    };
  }, []);

  const mb = (bytes: number) => format.number(bytes / 1_000_000, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });

  async function start() {
    const controller = new AbortController();
    abort.current = controller;
    setDownload({ state: 'running', done: 0, total: 114, bytes: 0 });
    try {
      const result = await downloadQuran(locale, (done, total, bytes) => setDownload({ state: 'running', done, total, bytes }), controller.signal);
      setInfo(result);
      setDownload({ state: 'idle' });
    } catch {
      setDownload(controller.signal.aborted ? { state: 'idle' } : { state: 'error' });
    }
    const e = await navigator.storage?.estimate?.().catch(() => null);
    if (e) setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
  }

  async function remove() {
    await removeOfflineQuran();
    setInfo(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="offline-worker" className="text-sm">
        {worker === null ? t('checking') : worker ? t('workerActive') : t('workerInactive')}
      </p>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{t('availableTitle')}</h3>
        <ul className="list-disc ps-5 text-sm text-ink-muted">
          {(['pages', 'device', 'recent', 'adhkar'] as const).map((k) => (
            <li key={k}>{t(`available.${k}`)}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <h3 className="font-semibold">{t('quranTitle')}</h3>
        <p className="text-sm text-ink-muted">{t('quranBody', { size: mb(4_500_000), stored: mb(22_000_000) })}</p>
        <p role="status" className="text-sm font-semibold" data-testid="offline-quran-status">
          {download.state === 'running'
            ? t('downloading', { done: download.done, total: download.total, size: mb(download.bytes) })
            : download.state === 'error'
              ? t('downloadFailed')
              : info
                ? t('downloaded', { n: info.surahs, size: mb(info.bytes), date: new Date(info.at) })
                : info === null
                  ? t('notDownloaded')
                  : ''}
        </p>
        {download.state === 'running' && (
          <progress className="w-full accent-[var(--color-accent)]" max={download.total} value={download.done} aria-label={t('quranTitle')} />
        )}
        <div className="flex flex-wrap gap-2">
          {download.state === 'running' ? (
            <button type="button" className="secondary-button" onClick={() => abort.current?.abort()}>
              {t('cancel')}
            </button>
          ) : (
            <button type="button" className="primary-button" disabled={!cacheAvailable() || info === undefined} onClick={() => void start()}>
              {info ? t('update') : t('download')}
            </button>
          )}
          {info && download.state !== 'running' && (
            <button type="button" className="secondary-button" onClick={() => void remove()}>
              {t('remove')}
            </button>
          )}
        </div>
        {storage && storage.quota > 0 && <p className="text-xs text-ink-muted">{t('storage', { used: mb(storage.usage), quota: mb(storage.quota) })}</p>}
        <p className="text-xs text-ink-muted">{t('iosNote')}</p>
      </div>
    </div>
  );
}
