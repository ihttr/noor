import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarView } from '@/components/calendar/CalendarView';
import { placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('calendar');

export default async function CalendarPage() {
  const [tp, locale] = await Promise.all([getTranslations('Pages'), getLocale()]);
  // "Previous" points to the reading start: right in Arabic, left in English.
  const [prev, next] = locale === 'ar' ? [ChevronRight, ChevronLeft] : [ChevronLeft, ChevronRight];
  const Prev = prev;
  const Next = next;
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('calendar.title')}</h1>
        <p className="text-ink-muted">{tp('calendar.description')}</p>
      </header>
      <CalendarView
        icons={{
          previous: <Prev aria-hidden="true" className="size-5" />,
          next: <Next aria-hidden="true" className="size-5" />,
        }}
      />
    </article>
  );
}
