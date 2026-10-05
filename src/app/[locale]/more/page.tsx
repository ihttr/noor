import { getTranslations } from 'next-intl/server';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';
import { NAV_ITEMS } from '@/components/shell/nav-items';
import { Link } from '@/i18n/navigation';

export const generateMetadata = () => placeholderMetadata('more');

/** Mobile hub for the sections that do not fit in the bottom bar. */
export default async function MorePage() {
  const tNav = await getTranslations('Nav');

  return (
    <PlaceholderPage pageKey="more">
      <ul className="grid gap-2 sm:grid-cols-2">
        {NAV_ITEMS.filter((i) => i.inMore).map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 transition-colors hover:bg-surface-raised"
            >
              <Icon aria-hidden="true" className="size-5 text-accent" strokeWidth={1.75} />
              <span>{tNav(key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PlaceholderPage>
  );
}
