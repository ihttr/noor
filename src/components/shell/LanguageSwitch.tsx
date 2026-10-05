'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Links to the same page in the other language. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const t = useTranslations('Shell');
  const locale = useLocale();
  const pathname = usePathname();
  const target = locale === 'ar' ? 'en' : 'ar';

  return (
    <Link
      href={pathname}
      locale={target}
      hrefLang={target}
      aria-label={t('switchLanguageLabel')}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink ${className}`}
    >
      <Languages aria-hidden="true" className="size-5" strokeWidth={1.75} />
      <span lang={target}>{t('otherLanguageName')}</span>
    </Link>
  );
}
