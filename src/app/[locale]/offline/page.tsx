import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pageMetadata } from '@/lib/seo';
import { ReloadButton } from '@/components/pwa/ReloadButton';
import { Link } from '@/i18n/navigation';

// Shown by the service worker for pages that are not saved on this device (SPEC §7.20).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Offline');
  return pageMetadata({ title: t('pageTitle'), path: '/offline', locale: await getLocale(), noindex: true });
}

export default async function OfflinePage() {
  const t = await getTranslations('Offline');
  const links = [
    ['/', t('links.home')],
    ['/saved', t('links.saved')],
    ['/quran', t('links.quran')],
    ['/adhkar', t('links.adhkar')],
  ] as const;
  return (
    <article className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <h1 className="text-2xl font-semibold md:text-3xl">{t('pageTitle')}</h1>
      <p className="text-ink-muted">{t('pageBody')}</p>
      <ul className="grid grid-cols-2 gap-3">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center justify-center rounded-2xl border border-line bg-surface p-3 font-semibold hover:bg-surface-raised">
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <ReloadButton label={t('retry')} />
      </div>
    </article>
  );
}
