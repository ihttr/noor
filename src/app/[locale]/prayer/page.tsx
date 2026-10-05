import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('prayer');

export default function PrayerPage() {
  return <PlaceholderPage pageKey="prayer" />;
}
