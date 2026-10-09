'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth/client';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

/** Sign in, sign up, forgot and reset password (SPEC §7.19). Accounts are optional. */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const t = useTranslations('Account');
  const locale = useLocale();
  const id = useId();
  const router = useRouter();
  const params = useSearchParams();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let stopped = false;
    fetch('/api/auth/get-session').then(
      (r) => !stopped && setEnabled(r.status !== 503),
      () => !stopped && setEnabled(false)
    );
    return () => {
      stopped = true;
    };
  }, []);

  async function afterSignIn() {
    const session = await authClient.getSession();
    const user = session.data?.user;
    if (!user) throw new Error('no session');
    const runner = await import('./sync-runner');
    await runner.adoptAccount({ id: user.id, email: user.email });
    await runner.syncNow();
    router.push('/settings');
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sign-in') {
        const r = await authClient.signIn.email({ email, password });
        if (r.error) throw new Error(r.error.status === 401 ? t('errors.credentials') : t('errors.generic'));
        await afterSignIn();
      } else if (mode === 'sign-up') {
        if (password !== String(form.get('confirm') ?? '')) throw new Error(t('errors.mismatch'));
        const r = await authClient.signUp.email({ email, password, name: '' });
        if (r.error) throw new Error(r.error.code === 'USER_ALREADY_EXISTS' || r.error.status === 422 ? t('errors.exists') : t('errors.generic'));
        await afterSignIn();
      } else if (mode === 'forgot-password') {
        const prefix = locale === 'ar' ? '' : `/${locale}`;
        const r = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}${prefix}/auth/reset-password` });
        if (r.error) throw new Error(t('errors.generic'));
        setDone(true);
      } else {
        const token = params.get('token');
        if (!token) throw new Error(t('errors.token'));
        if (password !== String(form.get('confirm') ?? '')) throw new Error(t('errors.mismatch'));
        const r = await authClient.resetPassword({ newPassword: password, token });
        if (r.error) throw new Error(t('errors.token'));
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) return <p className="rounded-2xl border border-dashed border-line bg-surface p-5 text-ink-muted">{t('disabled')}</p>;

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5">
        <p>{mode === 'forgot-password' ? t('resetSent') : t('resetDone')}</p>
        {mode === 'reset-password' && (
          <Link href="/auth/sign-in" className="primary-button inline-flex items-center">
            {t('signIn')}
          </Link>
        )}
      </div>
    );
  }

  const field = (name: string, label: string, type: string, autoComplete: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${name}`} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        minLength={type === 'password' ? 8 : undefined}
        maxLength={type === 'password' ? 128 : 254}
        dir="ltr"
        className="text-field"
        aria-describedby={`${id}-error`}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5" aria-busy={busy || enabled === null}>
      {mode !== 'reset-password' && field('email', t('email'), 'email', 'email')}
      {mode !== 'forgot-password' &&
        field('password', mode === 'reset-password' ? t('newPassword') : t('password'), 'password', mode === 'sign-in' ? 'current-password' : 'new-password')}
      {(mode === 'sign-up' || mode === 'reset-password') && field('confirm', t('confirmPassword'), 'password', 'new-password')}
      {(mode === 'sign-up' || mode === 'reset-password') && <p className="text-xs text-ink-muted">{t('passwordHint')}</p>}
      <p id={`${id}-error`} role="alert" className="min-h-5 text-sm font-semibold text-accent">
        {error}
      </p>
      <button type="submit" className="primary-button" disabled={busy || !enabled}>
        {t(`submit.${mode}`)}
      </button>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {mode !== 'sign-in' && (
          <Link href="/auth/sign-in" className="text-accent underline underline-offset-2">
            {t('haveAccount')}
          </Link>
        )}
        {mode !== 'sign-up' && (
          <Link href="/auth/sign-up" className="text-accent underline underline-offset-2">
            {t('noAccount')}
          </Link>
        )}
        {mode === 'sign-in' && (
          <Link href="/auth/forgot-password" className="text-accent underline underline-offset-2">
            {t('forgot')}
          </Link>
        )}
      </div>
      <p className="text-xs text-ink-muted">{t('optional')}</p>
    </form>
  );
}
