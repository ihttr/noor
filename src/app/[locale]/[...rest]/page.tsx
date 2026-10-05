import { notFound } from 'next/navigation';

// Unknown paths inside a locale render the localized not-found page within the app shell.
export default function CatchAllPage() {
  notFound();
}
