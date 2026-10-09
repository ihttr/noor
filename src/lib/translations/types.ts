// Translation registry and chunks (SPEC §7.9). Adding a translation = running
// scripts/import-translation.ts on an approved source file; no component changes.

export interface TranslationRegistryEntry {
  id: string;
  language: string;
  direction: 'rtl' | 'ltr';
  /** Always shown with the text (SPEC §2.8). */
  translator: string;
  name: string;
  source: { name: string; url: string; version: string | null; downloadedAt: string };
  license: { name: string; url: string };
  files: { path: string; sha256: string }[];
  integrity: string;
}

export interface TranslationRegistry {
  schemaVersion: 1;
  translations: TranslationRegistryEntry[];
}

export interface TranslationSurahFile {
  schemaVersion: 1;
  id: string;
  surah: number;
  translator: string;
  source: TranslationRegistryEntry['source'];
  entries: { ayah: number; text: string; footnotes?: string }[];
}
