import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('stats', { noindex: true });

export default function StatsPage() {
  return <PlaceholderPage pageKey="stats" />;
}
