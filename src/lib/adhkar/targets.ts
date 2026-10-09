// Per-category targets for the "today" views (server side): dhikr id → count.
import { getAdhkarCategory, getAdhkarIndex } from './content.ts';
import type { AdhkarCategory } from './types.ts';

export async function adhkarTargets(only?: readonly AdhkarCategory[]): Promise<{ id: AdhkarCategory; targets: Record<string, number> }[]> {
  const { categories } = await getAdhkarIndex();
  const list = only ? categories.filter((c) => only.includes(c.id)) : categories;
  return Promise.all(
    list.map(async (c) => {
      const file = c.count ? await getAdhkarCategory(c.id) : null;
      return { id: c.id, targets: Object.fromEntries((file?.items ?? []).map((d) => [d.id, d.count])) };
    })
  );
}
