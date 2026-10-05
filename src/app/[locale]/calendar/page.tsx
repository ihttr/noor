import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('calendar');

export default function CalendarPage() {
  return <PlaceholderPage pageKey="calendar" />;
}
