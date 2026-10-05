import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('saved', { noindex: true });

export default function SavedPage() {
  return <PlaceholderPage pageKey="saved" />;
}
