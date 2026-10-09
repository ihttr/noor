// Tafsir content in content/tafsir/ (SPEC §7.10). Every text is copied verbatim from an approved
// source by scripts/import-tafsir.ts and always shown with its name, author and distribution.

export interface TafsirSource {
  /** Shown with every text (SPEC §2.8). */
  name: { ar: string; en: string };
  author: { ar: string; en: string };
  /** Where the digital text comes from. */
  distribution: { name: string; url: string };
  /** Published version, or null when the distributor publishes none. */
  version: string | null;
  /** When the source file was downloaded (ISO date) — identifies the text when there is no version. */
  downloadedAt: string;
  license: { name: string; url: string };
  files: { path: string; sha256: string }[];
}

export interface TafsirRegistryEntry {
  id: string;
  language: 'ar' | 'en';
  direction: 'rtl' | 'ltr';
  source: TafsirSource;
  /** SHA-256 over `${surah}|${ayah}|${text}\n` for every entry in Mushaf order. */
  integrity: string;
  entries: number;
}

export interface TafsirRegistry {
  schemaVersion: 1;
  tafsirs: TafsirRegistryEntry[];
}

export interface TafsirEntry {
  ayah: number;
  text: string;
  /** Present only when the source has footnotes for the ayah. */
  footnotes?: string;
}

export interface TafsirSurahFile {
  schemaVersion: 1;
  id: string;
  surah: number;
  source: TafsirSource;
  entries: TafsirEntry[];
}
