import { getLocale, getTranslations } from 'next-intl/server';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { AccountPanel } from '@/components/account/AccountPanel';
import { OfflinePanel } from '@/components/pwa/OfflinePanel';
import { ThemePicker } from '@/components/theme/ThemePicker';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export const generateMetadata = () => placeholderMetadata('settings', { noindex: true });

export default async function SettingsPage() {
  const t = await getTranslations('Settings');
  const locale = await getLocale();

  return (
    <PlaceholderPage pageKey="settings">
      <section aria-labelledby="account" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <h2 id="account" className="text-lg font-semibold">
          {t('account')}
        </h2>
        <AccountPanel />
      </section>

      <section aria-labelledby="offline" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <h2 id="offline" className="text-lg font-semibold">
          {t('offline')}
        </h2>
        <OfflinePanel />
      </section>

      <section aria-labelledby="appearance" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <h2 id="appearance" className="text-lg font-semibold">
          {t('appearance')}
        </h2>
        <ThemePicker />
      </section>

      <section aria-labelledby="language" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id="language" className="text-lg font-semibold">
          {t('language')}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {routing.locales.map((l) => (
            <li key={l}>
              <Link
                href="/settings"
                locale={l}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? 'true' : undefined}
                className="flex min-h-11 items-center rounded-xl border border-line px-3 text-sm aria-[current=true]:border-accent aria-[current=true]:bg-accent-soft aria-[current=true]:font-semibold"
              >
                {t(`languages.${l}`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PlaceholderPage>
  );
}
