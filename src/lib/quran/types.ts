// Shapes of the generated, committed Quran content in content/ (SPEC §4).
// All Quran strings in these files are copied verbatim from the approved Tanzil source.

export type AyahKey = `${number}:${number}`;

export interface AyahRef {
  surah: number;
  ayah: number;
}

export type SajdahType = 'recommended' | 'obligatory';

/** Provenance block that travels with every generated file (DECISIONS D-012). */
export interface ContentSource {
  name: string;
  url: string;
  version: string;
  license: string;
  /** Tanzil's copyright notice, verbatim from the source file. */
  notice: string;
  files: { path: string; sha256: string }[];
}

export interface SurahMeta {
  number: number;
  ayahCount: number;
  /** 0-based global index of the surah's first ayah (Tanzil `start`). */
  startIndex: number;
  /** Tanzil metadata fields, verbatim (curated display names come later, D-024). */
  name: string;
  transliteration: string;
  englishName: string;
  revelationType: 'Meccan' | 'Medinan';
  revelationOrder: number;
  rukus: number;
  /** Whether the surah has an unnumbered Basmala header line (all except 1 and 9). */
  hasBismillah: boolean;
  firstPage: number;
  lastPage: number;
}

export interface JuzMeta {
  number: number;
  start: AyahRef;
}

export interface HizbQuarterMeta {
  /** 1–240 */
  number: number;
  /** 1–60 */
  hizb: number;
  /** 1–4 within the hizb */
  quarter: number;
  start: AyahRef;
}

export interface PageMeta {
  number: number;
  start: AyahRef;
}

export interface SajdahMeta {
  number: number;
  surah: number;
  ayah: number;
  type: SajdahType;
}

export interface QuranMeta {
  schemaVersion: 1;
  text: ContentSource;
  metadata: ContentSource;
  counts: {
    surahs: number;
    ayahs: number;
    pages: number;
    juz: number;
    hizbs: number;
    hizbQuarters: number;
    sajdahs: number;
  };
  integrity: {
    algorithm: 'sha256';
    canonicalForm: string;
    ayahs: string;
    bismillah: string;
  };
  surahs: SurahMeta[];
  juz: JuzMeta[];
  hizbQuarters: HizbQuarterMeta[];
  pages: PageMeta[];
  sajdahs: SajdahMeta[];
}

export interface Ayah {
  number: number;
  /** Verbatim Quran text. Never transform it (CLAUDE.md). */
  text: string;
  page: number;
  juz: number;
  /** 1–60 */
  hizb: number;
  /** 1–240 */
  hizbQuarter: number;
  sajdah?: SajdahType;
}

export interface SurahFile {
  schemaVersion: 1;
  surah: number;
  source: ContentSource;
  /** Header Basmala, verbatim from the source (`null` for surahs 1 and 9). */
  bismillah: string | null;
  ayahs: Ayah[];
}

export interface SearchIndexFile {
  schemaVersion: 1;
  /** Normalized text for searching only — never displayed as Quran. */
  purpose: string;
  source: ContentSource;
  normalization: { version: number; rules: string[] };
  /** [ayah key, normalized text] in Mushaf order. */
  entries: [AyahKey, string][];
}

export interface AyahWithRef extends Ayah {
  surah: number;
  key: AyahKey;
}
