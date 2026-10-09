import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AuthForm, type AuthMode } from '@/components/account/AuthForm';

const MODES: readonly AuthMode[] = ['sign-in', 'sign-up', 'forgot-password', 'reset-password'];
const isMode = (v: string): v is AuthMode => (MODES as readonly string[]).includes(v);

export function generateStaticParams() {
  return MODES.map((mode) => ({ mode }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/auth/[mode]'>): Promise<Metadata> {
  const { mode } = await params;
  const t = await getTranslations('Account');
  // Auth pages are never indexed (SPEC §9).
  return isMode(mode) ? pageMetadata({ title: t(`titles.${mode}`), path: `/auth/${mode}`, locale: await getLocale(), noindex: true }) : {};
}

export default async function AuthPage({ params }: PageProps<'/[locale]/auth/[mode]'>) {
  const { mode } = await params;
  if (!isMode(mode)) notFound();
  const t = await getTranslations('Account');
  return (
    <article className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t(`titles.${mode}`)}</h1>
        <p className="text-ink-muted">{t(`intros.${mode}`)}</p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />}>
        <AuthForm mode={mode} />
      </Suspense>
    </article>
  );
}
