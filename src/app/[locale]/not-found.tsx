import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <article className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-ink-muted">{t('body')}</p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
      >
        {t('backHome')}
      </Link>
    </article>
  );
}
