import { BookHeart, BookOpen, Bookmark, ChevronLeft, Headphones, History, Search } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { AdhkarToday } from '@/components/adhkar/AdhkarToday';
import { ContinueReading } from '@/components/home/ContinueReading';
import { JsonLd } from '@/components/JsonLd';
import { websiteJsonLd } from '@/lib/seo';
import { DailyProgress } from '@/components/home/DailyProgress';
import { QuickAccess } from '@/components/home/QuickAccess';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { adhkarTargets } from '@/lib/adhkar/targets';
import { getMeta } from '@/lib/quran/content';
import { slugOf } from '@/lib/quran/slugs';
import { surahDisplayName } from '@/lib/quran/view';

export const generateMetadata = () => placeholderMetadata('home');

export default async function HomePage() {
  const [t, tp, ta, locale, meta, adhkar] = await Promise.all([
    getTranslations('Home'),
    getTranslations('Pages'),
    getTranslations('Adhkar'),
    getLocale(),
    getMeta(),
    adhkarTargets(['morning', 'evening', 'after-prayer', 'before-sleep']),
  ]);
  const surahs = meta.surahs.map((s) => ({ name: surahDisplayName(meta, s.number, locale), slug: slugOf(s.number) }));
  const quickIcon = 'size-6 text-accent';

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <JsonLd data={websiteJsonLd(tp('home.title'), locale)} />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('home.title')}</h1>
        <p className="text-ink-muted">{tp('home.description')}</p>
      </header>
      <ContinueReading
        surahs={surahs}
        icon={<ChevronLeft aria-hidden="true" className="size-6 shrink-0 text-accent ltr:rotate-180" />}
      />
      <DailyProgress />
      <section aria-labelledby="today-adhkar" className="flex flex-col gap-3">
        <h2 id="today-adhkar" className="text-lg font-semibold">
          {ta('today')}
        </h2>
        <AdhkarToday categories={adhkar} followPrayerTimes />
      </section>
      <section aria-labelledby="quick-access" className="flex flex-col gap-3">
        <h2 id="quick-access" className="text-lg font-semibold">
          {t('quickAccess')}
        </h2>
        <QuickAccess
          slugs={surahs.map((s) => s.slug)}
          icons={{
            quran: <BookOpen aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
            adhkar: <BookHeart aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
            search: <Search aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
            saved: <Bookmark aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
            lastRead: <History aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
            listen: <Headphones aria-hidden="true" className={quickIcon} strokeWidth={1.75} />,
          }}
        />
      </section>
    </article>
  );
}
