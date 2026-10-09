// The tasbih preset phrases (SPEC §7.15) are taken verbatim from the owner's specification at
// build time, so no dhikr text is typed in code (CLAUDE.md).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let presets: Promise<string[]> | undefined;

export function getTasbihPresets(): Promise<string[]> {
  presets ??= readFile(path.join(process.cwd(), 'docs/SPEC.md'), 'utf8').then((spec) => {
    const line = /\*\*Phrases:\*\* presets \(([^)]+)\)/u.exec(spec)?.[1];
    const list = line?.split('،').map((p) => p.trim()).filter(Boolean) ?? [];
    if (list.length !== 4) throw new Error('docs/SPEC.md §7.15: expected four preset phrases');
    return list;
  });
  return presets;
}
