'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { ACCOUNT_EVENT, getAccount, type AccountHint } from './account-state';

type SyncState = 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
type Panel = { kind: 'loading' } | { kind: 'disabled' } | { kind: 'guest' } | { kind: 'signed-in'; account: AccountHint };

const loadRunner = () => import('./sync-runner');
const loadAuth = () => import('@/lib/auth/client').then((m) => m.authClient);

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Settings → Account (SPEC §7.19): optional account, sync status, export and deletion. */
export function AccountPanel() {
  const t = useTranslations('Account');
  const format = useFormatter();
  const id = useId();
  const [panel, setPanel] = useState<Panel>({ kind: 'loading' });
  const [sync, setSync] = useState<{ state: SyncState; at: number | null }>({ state: 'idle', at: null });
  const [shared, setShared] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Who is signed in: the server session decides; the local hint follows it.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      const r = await fetch('/api/auth/get-session', { cache: 'no-store' }).catch(() => null);
      if (stopped) return;
      if (!r) {
        // Offline: trust the hint so the status stays visible.
        const hint = getAccount();
        setPanel(hint ? { kind: 'signed-in', account: hint } : { kind: 'guest' });
        return;
      }
      if (r.status === 503) return setPanel({ kind: 'disabled' });
      const body = (await r.json().catch(() => null)) as { user?: { id: string; email: string } } | null;
      if (stopped) return;
      const runner = await loadRunner();
      if (body?.user) {
        const account = { id: body.user.id, email: body.user.email };
        if (getAccount()?.id !== account.id) await runner.adoptAccount(account);
        setPanel({ kind: 'signed-in', account });
      } else {
        if (getAccount()) await runner.forgetAccount({ wipe: false });
        setPanel({ kind: 'guest' });
      }
    };
    void check();
    const onAccount = () => {
      const hint = getAccount();
      setPanel((p) => (p.kind === 'disabled' || p.kind === 'loading' ? p : hint ? { kind: 'signed-in', account: hint } : { kind: 'guest' }));
    };
    window.addEventListener(ACCOUNT_EVENT, onAccount);
    return () => {
      stopped = true;
      window.removeEventListener(ACCOUNT_EVENT, onAccount);
    };
  }, []);

  const signedIn = panel.kind === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    let off: (() => void) | undefined;
    void loadRunner().then(async (runner) => {
      const at = await runner.lastSyncAt();
      if (stopped) return;
      setSync({ state: runner.getSyncStatus().state, at });
      const onSync = (e: Event) => setSync((e as CustomEvent<{ state: SyncState; at: number | null }>).detail);
      window.addEventListener(runner.SYNC_EVENT, onSync);
      off = () => window.removeEventListener(runner.SYNC_EVENT, onSync);
    });
    void import('@/components/prayer/place').then((m) => m.isPlaceShared()).then((v) => !stopped && setShared(v));
    return () => {
      stopped = true;
      off?.();
    };
  }, [signedIn]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  const exportDevice = () =>
    run(async () => download(await (await loadRunner()).localExport(), `noor-device-${today()}.json`));

  const exportAccount = () =>
    run(async () => {
      await (await loadRunner()).syncNow();
      const r = await fetch('/api/account/export', { cache: 'no-store' });
      if (!r.ok) throw new Error(t('errors.generic'));
      download(await r.blob(), `noor-export-${today()}.json`);
    });

  const signOut = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const wipe = new FormData(e.currentTarget).get('wipe') === 'on';
    return run(async () => {
      const runner = await loadRunner();
      await runner.syncNow();
      await (await loadAuth()).signOut();
      await runner.forgetAccount({ wipe });
      setMessage(t('signedOut'));
    });
  };

  const deleteAccount = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const wipe = form.get('wipe') === 'on';
    return run(async () => {
      const r = await (await loadAuth()).deleteUser({ password });
      if (r.error) throw new Error(r.error.code === 'INVALID_PASSWORD' ? t('errors.password') : t('errors.generic'));
      await (await loadRunner()).afterAccountDeleted({ wipe });
      setMessage(t('deleted'));
    });
  };

  const toggleShared = (on: boolean) =>
    run(async () => {
      const ok = await (await import('@/components/prayer/place')).setPlaceShared(on);
      if (!ok) throw new Error(t('placeMissing'));
      setShared(on);
    });

  const status = (
    <p role="status" className="min-h-5 text-sm font-semibold text-accent">
      {message}
    </p>
  );

  const deviceExport = (
    <button type="button" className="secondary-button self-start" onClick={exportDevice} disabled={busy}>
      {t('exportDevice')}
    </button>
  );

  if (panel.kind === 'loading') return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" aria-busy="true" />;

  if (panel.kind === 'disabled' || panel.kind === 'guest') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-muted">{panel.kind === 'disabled' ? t('disabled') : t('guest')}</p>
        {panel.kind === 'guest' && (
          <div className="flex flex-wrap gap-3">
            <Link href="/auth/sign-in" className="primary-button inline-flex items-center">
              {t('signIn')}
            </Link>
            <Link href="/auth/sign-up" className="secondary-button inline-flex items-center">
              {t('signUp')}
            </Link>
          </div>
        )}
        {deviceExport}
        {status}
      </div>
    );
  }

  const stateText =
    sync.state === 'syncing'
      ? t('sync.syncing')
      : sync.state === 'error'
        ? t('sync.error')
        : sync.state === 'offline'
          ? t('sync.offline')
          : sync.at
            ? t('sync.last', { when: format.dateTime(sync.at, { dateStyle: 'medium', timeStyle: 'short' }) })
            : t('sync.never');

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-ink-muted">{t('signedInAs')}</dt>
        <dd className="font-semibold break-all">
          <bdi dir="ltr">{panel.account.email}</bdi>
        </dd>
        <dt className="text-sm text-ink-muted">{t('sync.title')}</dt>
        <dd data-sync-state={sync.state} aria-live="polite">
          {stateText}
          {sync.at && sync.state !== 'ok' && sync.state !== 'idle' ? ` · ${format.relativeTime(sync.at)}` : ''}
        </dd>
      </dl>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="primary-button" onClick={() => run(async () => (await loadRunner()).syncNow())} disabled={busy || sync.state === 'syncing'}>
          {t('sync.now')}
        </button>
        <button type="button" className="secondary-button" onClick={exportAccount} disabled={busy}>
          {t('exportAccount')}
        </button>
        {deviceExport}
      </div>
      {status}

      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-[var(--color-accent)]"
          checked={shared ?? false}
          disabled={busy || shared === null}
          onChange={(e) => void toggleShared(e.currentTarget.checked)}
        />
        <span className="flex flex-col">
          <span className="font-semibold">{t('placeShare')}</span>
          <span className="text-sm text-ink-muted">{t('placeShareHint')}</span>
        </span>
      </label>

      <form onSubmit={signOut} className="flex flex-col gap-3 border-t border-line pt-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="wipe" className="size-5 accent-[var(--color-accent)]" />
          {t('signOutWipe')}
        </label>
        <button type="submit" className="secondary-button self-start" disabled={busy}>
          {t('signOut')}
        </button>
      </form>

      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-semibold">{t('delete.title')}</summary>
        <form onSubmit={deleteAccount} className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-ink-muted">{t('delete.body')}</p>
          <label htmlFor={`${id}-delete-password`} className="text-sm font-semibold">
            {t('password')}
          </label>
          <input id={`${id}-delete-password`} name="password" type="password" required autoComplete="current-password" dir="ltr" className="text-field" />
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="wipe" className="size-5 accent-[var(--color-accent)]" />
            {t('delete.wipe')}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="confirm" required className="size-5 accent-[var(--color-accent)]" />
            {t('delete.confirm')}
          </label>
          <button type="submit" className="danger-button self-start" disabled={busy}>
            {t('delete.submit')}
          </button>
        </form>
      </details>
    </div>
  );
}
