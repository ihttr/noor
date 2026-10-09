import { Minus, RotateCcw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { TasbihView } from '@/components/tasbih/TasbihView';
import { getTasbihPresets } from '@/lib/tasbih/presets';

export const generateMetadata = () => placeholderMetadata('tasbih');

export default async function TasbihPage() {
  const [tp, presets] = await Promise.all([getTranslations('Pages'), getTasbihPresets()]);
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('tasbih.title')}</h1>
        <p className="text-ink-muted">{tp('tasbih.description')}</p>
      </header>
      <TasbihView
        presets={presets}
        icons={{
          minus: <Minus aria-hidden="true" className="size-6" />,
          reset: <RotateCcw aria-hidden="true" className="size-6" strokeWidth={1.75} />,
        }}
      />
    </article>
  );
}
