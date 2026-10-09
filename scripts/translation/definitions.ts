// Translation candidates from Phase 0 (docs/SOURCES.md §6). A definition only says how to read
// a file; importing still needs the owner's approval in the lock (use `translation:<id>`).
import type { TafsirRow } from '../tafsir/build.ts';
import { parseQuranEncXml, parseTanzilTranslation, quranEncVersion } from './parse.ts';

export interface TranslationDefinition {
  id: string;
  /** File name inside the source's files (the lock entry). */
  file: string;
  language: string;
  direction: 'rtl' | 'ltr';
  translator: string;
  name: string;
  distribution: string;
  url: string;
  parse: (xml: string, what: string) => TafsirRow[];
  version: (xml: string) => string | null;
  /** The translator named inside the file, when the format has one (checked by the import). */
  translatorInFile?: (xml: string) => string | null;
}

const quranEnc = (key: string, translator: string): TranslationDefinition => ({
  id: `quranenc-${key}`,
  file: `${key}.xml`,
  language: 'en',
  direction: 'ltr',
  translator,
  name: translator,
  distribution: 'QuranEnc.com',
  url: `https://quranenc.com/en/browse/${key}`,
  parse: parseQuranEncXml,
  version: quranEncVersion,
});

const tanzil = (key: string, translator: string, lastUpdate: string): TranslationDefinition => ({
  id: `tanzil-${key}`,
  file: `${key}.xml`,
  language: 'en',
  direction: 'ltr',
  translator,
  name: translator,
  distribution: 'Tanzil.net',
  url: 'https://tanzil.net/trans/',
  parse: parseTanzilTranslation,
  version: () => `Last Update ${lastUpdate}`,
  translatorInFile: (xml) => /#\s*Translator:\s*(.+)/u.exec(xml)?.[1]?.trim() ?? null,
});

export const TRANSLATIONS: Record<string, TranslationDefinition> = Object.fromEntries(
  [
    quranEnc('english_saheeh', 'Saheeh International (Noor International Center)'),
    quranEnc('english_rwwad', 'Rowwad Translation Center'),
    quranEnc('english_hilali_khan', 'Hilali and Khan'),
    tanzil('en.sahih', 'Saheeh International', '2011-04-24'),
    tanzil('en.pickthall', 'Mohammed Marmaduke William Pickthall', '2010-09-04'),
    tanzil('en.yusufali', 'Abdullah Yusuf Ali', '2013-05-10'),
    tanzil('en.hilali', 'Muhammad Taqi-ud-Din al-Hilali and Muhammad Muhsin Khan', '2010-12-13'),
    tanzil('en.itani', 'Talal Itani', '2013-07-19'),
  ].map((d) => [d.id, d])
);
