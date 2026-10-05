# Noor — Content Sources

Human-readable companion to [`data/sources/SOURCES.lock.json`](../data/sources/SOURCES.lock.json) (machine-readable: URL, download date, options, license quote, SHA-256 of every file). The app's future "About & Sources" page is generated from this document.

**Status (2026-10-04, Phase 2):** approved and imported — the Tanzil Uthmani text (tatweel=true), the Tanzil Simple Clean text (search index only) and Tanzil `quran-data.xml`. Everything else is still a _candidate_. Approvals are recorded per file in `sources.manifest.json` and `SOURCES.lock.json` (`approval` field, DECISIONS D-032); import scripts read only approved files and verify their SHA-256 first.

## How the files are obtained

All files under `data/sources/` are downloaded by script, never edited by hand:

```powershell
node scripts/sources/fetch-sources.mjs          # download everything in data/sources/sources.manifest.json, write the lock
node scripts/sources/fetch-sources.mjs --relock # no download: re-check local hashes, refresh approvals in the lock
node scripts/import-quran.ts                    # approved Tanzil files → content/quran + content/search
node scripts/verify-content.ts                  # SPEC §2.6 integrity checks on content/
node scripts/sources/fetch-sources.mjs --only tanzil-quran-text   # one source
node scripts/sources/check-sources.mjs          # sanity checks (counts, Basmala, code points)
node scripts/sources/font-report.mjs            # font versions, embedded licenses, cmap coverage
node scripts/sources/build-font-test.mjs        # regenerate data/sources/font-test/index.html
node scripts/sources/serve.mjs                  # http://localhost:4173/font-test/
```

- Bytes are stored exactly as received. Archives are read in memory; only the needed members are written, and the lock records both the archive SHA-256 and the member SHA-256.
- License/terms web pages are not stored whole: a text excerpt of the terms section is stored (`TERMS*.txt`), and the lock records the SHA-256 of the full page it came from.
- `downloadedAt` in the lock is the first download of that exact content; `verifiedAt` is the last re-download.
- Requires Node ≥ 22 (tested with Node 26.0.0 on Windows 11). No dependencies, no Docker.

---

## 1. Quran text (display) — Tanzil Uthmani — **APPROVED** (tatweel=true, 2026-10-04)

| | |
|---|---|
| Source | Tanzil Project — <https://tanzil.net/download/> |
| Version | Uthmani, Version 1.1 (February 2021) — from the file header |
| Files | `data/sources/quran/tanzil/quran-uthmani.xml` (tatweel=true), `quran-uthmani.no-tatweel.xml` (tatweel=false) |
| Options | `quranType=uthmani`, `outType=xml`, pause marks **on**, sajdah signs (۩) **on**, rub-el-hizb signs (۞) **off**, superscript alef on, tatweel on/off (two candidates), me_quran-only options off |
| Downloading | requires `agree=true` = acceptance of the Tanzil Terms of Use (approved by the owner with the Phase 0 plan) |
| License | Terms of Use (download page) + "License: Creative Commons Attribution 3.0" (file header) |
| Required attribution | Name the source (Tanzil Project), link to tanzil.net, and reproduce the copyright notice in derived files |

Terms (quoted from the file header):

> Permission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT ALLOWED. This Quran text can be used in any website or application, provided that its source (Tanzil Project) is clearly indicated, and a link is made to tanzil.net to enable users to keep track of changes. This copyright notice shall be included in all verbatim copies of the text, and shall be reproduced appropriately in all files derived from or containing substantial portion of this text.

Verified properties (`check-sources.mjs`):
- 114 surahs, 6,236 ayahs; every surah's ayah count matches `quran-data.xml`.
- 69 distinct code points (including 7 pause marks U+06D6–U+06DC, small letters U+06DF–U+06ED, U+0670, U+06E9).
- 2,640 ayahs contain a pause mark that directly follows a space (Tanzil writes pause marks as separate space-delimited tokens). Memorization masks and word splitting must treat these tokens as non-words (SPEC 7.12).
- `tatweel=true` vs `false`: 3,423 ayahs differ; U+0640 occurs 6,736 vs 812 times. Which one renders better depends on the font (see the font test).

### Basmala handling (SPEC 2.5)

- **The XML format excludes the Basmala from ayah 1** of surahs 2–114 and stores it in a separate `bismillah` attribute on that ayah (112 surahs: all except 1 and 9). No ayah 1 of surahs 2–114 starts with the Basmala, so **no stripping script is needed**.
- The `txt-2` format (downloaded only as `quran-uthmani.txt` for documentation) **prefixes** the Basmala + a space to ayah 1 of surahs 2–114 (except 9).
- **Finding:** in surahs **95 and 97** the `bismillah` attribute is *not* identical to ayah 1:1 — it has U+0651 SHADDA after the first letter (ب). Surahs 94 and 96 end with ب, and the Madani Mushaf writes the following Basmala with a shadda. A script that strips a fixed 1:1 string (as SPEC 2.5 describes for other formats) would fail on these two surahs; using the XML attribute avoids that.
- **Approved display rule (2026-10-04):** the surah header Basmala is that surah's own `bismillah` attribute, verbatim (stored in `content/quran/surah/{n}.json` → `bismillah`; `null` for 1 and 9).

## 2. Quran text (search only) — Tanzil Simple Clean — **APPROVED** (2026-10-04)

| | |
|---|---|
| File | `data/sources/quran/tanzil/quran-simple-clean.xml` |
| Options | `quranType=simple-clean`, `outType=xml`, **no** pause marks, **no** sajdah signs |
| Use | input of the normalized search index only; never displayed as Quran |
| License | same Tanzil Terms (header: "Simple Clean, Version 1.1") |

Note: requesting Simple Clean with `marks=true` inserts pause marks (U+06D6–U+06DC) and ۩ into the "clean" text, so the candidate is downloaded without them.

**Word alignment finding (SPEC 7.8 highlighting):** after ignoring mark-only tokens, **363 of 6,236 ayahs (5.8%)** have a different number of words in Simple Clean and in Uthmani (e.g. 2:21, 2:33, 2:35), because Uthmani writes some word pairs joined (e.g. the vocative). Mapping highlight positions by word index therefore needs an alignment table or an ayah-level fallback.

## 3. Structure metadata — Tanzil `quran-data.xml` — **APPROVED** (2026-10-04)

| | |
|---|---|
| File | `data/sources/quran/tanzil/quran-data.xml` (version 1.0) |
| License | `copyright="(C) 2008-2009 Tanzil.info" license="cc-by"` (root element) |
| Verified | 114 surahs (name, transliteration, English name, Meccan/Medinan, revelation order), 30 juz, 240 hizb quarters, 7 manzils, 556 rukus, **604 pages**, **15 sajdas** (4 marked obligatory: 32:15, 41:38, 53:62, 96:19) |

Caveat: the names are Tanzil's (e.g. `ابراهيم` without hamza; transliterations like `Al-Baqara`). Display names and URL slugs need a reviewed data file (SPEC 9).

## 4. Quran font candidates (needs owner approval)

Compare them on the font test page: `node scripts/sources/serve.mjs` → <http://localhost:4173/font-test/>. Coverage = code points mapped in the font's cmap (it does not prove correct mark placement).

| Font | Version (in font) | License | Size | cmap gaps for Tanzil text | Notes |
|---|---|---|---|---|---|
| Amiri Quran | 1.003 | SIL OFL 1.1 (no Reserved Font Name) | 134 KB | none | Small file. A colored variant (Amiri Quran Colored) is also kept. |
| Scheherazade New | 4.500 | SIL OFL 1.1, RFN "Scheherazade", "SIL" | 324 KB | none | Also covers the KFGQPC encoding fully. RFN: a subset build must be renamed. |
| KFGQPC Hafs | 3.0 (latest on the KFGQPC site) | KFGQPC EULA — free use/copy/distribute, **no modification** | 294 KB | none | Built for the KFGQPC text encoding. With Tanzil text: U+0652 (Tanzil's sukun) is drawn as a round circle and U+06DF is drawn as a broken mark with a dotted circle (seen in 20:28). |
| KFGQPC Uthmanic Hafs | 2.2 (legacy, widely used) | same EULA | 291 KB | none | Same encoding caveat. The zip has two TTF builds; both are kept. |
| DigitalKhatt Madina | "Version 0.1" (release v1.0.0) | SIL OFL 1.1 (LICENSE file) | 2.5 MB (OTF) | U+06EA, U+06EB | Designed for its own text/justification; with Tanzil text the word spaces collapse in the browser. Interesting for a future line-exact Mushaf, not as a drop-in font. |
| Noto Naskh Arabic | 2.021 | SIL OFL 1.1 | 285 KB | none | Baseline only (not a Mushaf style). |

KFGQPC license (embedded in the font, quoted): *"Permission is hereby granted, Free of Cost, to any person obtaining a copy of this Font accompanying this license, the rights to Use, Copy, Distribute, subject to the following conditions: 1. The Font Software cannot be Sold, Modified, Altered, Translated, Reverse Engineered, Decompiled, Disassembled, Reproduced or Attempted to discover the Source Code of this Font in no means."* — so no subsetting and no WOFF2 conversion without written approval. Suggest keeping KFGQPC font files out of git until decided.

Encoding comparison (Tanzil Uthmani vs the KFGQPC-encoded text served by QuranEnc, see §12): KFGQPC-only code points U+00A0, U+0655, U+0656, U+0657, U+065E, U+06DE, U+06E1, U+06E4; Tanzil-only U+06D9, U+06DF, U+06E3, U+06EB. The two encodings are not interchangeable, and the Quran text must not be transformed (CLAUDE.md), so the font and the text source are one decision.

## 5. UI font — IBM Plex Sans Arabic

`data/sources/fonts/ibm-plex-sans-arabic/` (Regular, Medium, SemiBold, Bold; v1.1.0 release, font version 1.005). SIL OFL 1.1 with Reserved Font Name "Plex": SPEC 11 asks for a subset UI font, and a subset is a Modified Version under the OFL, so the subset must be renamed internally (or pick a UI font without RFN).

## 6. Translations (needs owner approval)

| ID | Translator | Distribution | Version | License / terms | Notes |
|---|---|---|---|---|---|
| `quranenc:english_saheeh` | Saheeh International (Noor International Center) | QuranEnc XML | 1.1.2 (2025-06-24) | QuranEnc re-publishing terms (below) | Footnotes included; "no modification" means footnote markers stay. |
| `quranenc:english_rwwad` | Rowwad Translation Center | QuranEnc XML | 1.0.19 (2026-03-12) | QuranEnc terms | Actively maintained; footnotes. |
| `quranenc:english_hilali_khan` | al-Hilali & Khan | QuranEnc XML | 1.1.2 (2025-09-04) | QuranEnc terms | Many bracketed interpolations. |
| `tanzil:en.sahih` | Saheeh International | Tanzil XML | Last Update 2011-04-24 | Tanzil: **non-commercial only** | Older than the QuranEnc edition. |
| `tanzil:en.pickthall` | M. M. Pickthall | Tanzil XML | 2010-09-04 | Tanzil: non-commercial only | Underlying 1930 translation: translator died 1936, so public domain in life+70 countries and in the US since 2026 (our reading, not legal advice); Tanzil's digitization terms still apply to this file. |
| `tanzil:en.yusufali` | A. Yusuf Ali | Tanzil XML | 2013-05-10 | Tanzil: non-commercial only | Edition used by Tanzil not stated; copyright status of revised editions differs. |
| `tanzil:en.hilali` | al-Hilali & Khan | Tanzil XML | 2010-12-13 | Tanzil: non-commercial only | |
| `tanzil:en.itani` | Talal Itani | Tanzil XML | 2013-07-19 | Tanzil: non-commercial only | Rights holder's own terms not found. |

QuranEnc terms (quoted, `translations/quranenc/TERMS.txt`):

> Contents of the translations can be downloaded and re-published, with the following terms and conditions: 1. No modification, addition, or deletion of the content. 2. Clearly referring to the publisher and the source (QuranEnc.com). 3. Mentioning the version number when re-publishing the translation. 4. Keeping the transcript information inside the document. 5. Notifying the source (QuranEnc.com) of any note on the translation. 6. Updating the translation according to the latest version issued from the source (QuranEnc.com). 7. Inappropriate advertisements must not be included when displaying translations of the meanings of the Noble Quran.

Tanzil translation terms (quoted, `translations/tanzil/TERMS.trans.txt`):

> The translations provided at this page are for non-commercial purposes only. If used otherwise, you need to obtain necessary permission from the translator or the publisher. If you are using more than three of the following translations in a website or application, we require you to put a link back to this page to make sure that subsequent users have access to the latest updates.

All 8 files contain 6,236 ayahs (verified).

## 7. Tafsir — Tafsir al-Muyassar (King Fahd Complex)

| Distribution | File | Version | Terms |
|---|---|---|---|
| QuranEnc `arabic_moyassar` | `tafsir/quranenc/arabic_moyassar.sqlite` (table `translations`: sura, aya, translation, footnotes; 6,236 rows) | **not published** by QuranEnc (identify by download date + SHA-256) | QuranEnc re-publishing terms (above) |
| Tanzil `ar.muyassar` | `tafsir/tanzil/ar.muyassar.xml` (6,236 ayahs) | Last Update 2011-01-07 | Tanzil: non-commercial only |

Always display as: «التفسير الميسر — مجمع الملك فهد لطباعة المصحف الشريف» + the distribution. QuranEnc term 3 (version number) cannot be met literally for this item because no version is published; record the download date instead.

## 8. Audio (needs owner approval) — metadata and terms only, no audio downloaded

| Source | What | Terms found (quoted) | Notes |
|---|---|---|---|
| Islamic Network (alquran.cloud) CDN | Per-ayah MP3, `https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{globalAyahNumber}.mp3`; edition list in `audio/islamic-network/editions.versebyverse.json` | "Recitations are licensed to us by the reciters or their estates for free, non-commercial redistribution at the bitrates we publish. You may stream, embed and download them for personal and educational use. You may bundle them into a commercial product, but please note that copyrights lie with the reciters and they may ask you to remove the conent." | Clearest written permission. Terms "Last updated: 14 June 2026". No CORS header observed (fine for `<audio>`). |
| EveryAyah.com | Per-ayah MP3 `https://everyayah.com/data/{folder}/{SSSAAA}.mp3`; `recitations.js` | No site-wide terms found. Timing files only: "(C) VerseByVerseQuran.com You must link back to our site from your product and web-site to use these timings." | Sends `Access-Control-Allow-Origin: *`. Support links point to Quran.com's help desk. |
| mp3quran.net API v3 | Surah-level MP3 + ayah timings for some reciters | None found on the API page | Per-ayah playback would need timing-based seeking. |
| Quran Foundation (Quran.com) API | Chapter/verse audio via OAuth2 API | Developer Terms: e.g. not to "Cache or store QF Content longer than 1 week unless … Content Sync APIs"; selling/redistributing content needs a signed commercial license | Requires a developer account + client credentials; only an excerpt of the terms is stored. |

## 9. Adhkar — Hisn al-Muslim (needs owner approval)

SPEC 2.7 requires, per dhikr: text, count, reference (book + number) and grading if available. **No candidate meets this fully with a clear license.**

| Candidate | Coverage | Text | Count | Reference / grading | License / provenance |
|---|---|---|---|---|---|
| Seen-Arabic `Morning-And-Evening-Adhkar-DB` (commit 29d7623) | Morning/Evening only (34 items) | yes (ar + en) | yes | yes — `source` field, free text (e.g. book, number, al-Albani's grading) | MIT for the compilation; credits hisnmuslim.com, sunnah.com and the book |
| hisnmuslim.com API | whole book: 132 chapters, 267 items (ar), English translation | yes | yes (`REPEAT`) | **no** | No published terms; robots.txt has no directives. English chapter 126 is not valid JSON upstream (kept byte-for-byte, flagged in the lock). |
| rn0x/hisn_almuslim_json (commit 0405ee1) | whole book: 134 sections, 298 text entries | yes | inside the text | footnotes (315) present but **not linked** to entries | No license file; digitization source not stated |
| Book PDF (Risala platform, General Presidency for the Affairs of the Two Holy Mosques) | whole book with footnotes | — | — | yes (as printed) | Reference copy for verification, not an import source. The author's printing/distribution statement inside it is **not yet verified** (the PDF could not be rendered in this environment). |

Observed in all digital datasets: Quranic passages inside adhkar (e.g. Ayat al-Kursi, al-Ikhlas, al-Falaq, an-Nas) are typed in simplified, non-Uthmani spelling. The user's older `athkar.json` was not used (provenance unknown).

## 10. Prayer times, Qibla, Hijri

- Prayer times + Qibla bearing: `adhan` (adhan-js) npm package, MIT — a code dependency, installed in a later phase, no data file. Spot-check against an official published timetable in tests (SPEC 15).
- Hijri date: `Intl.DateTimeFormat` with the `islamic-umalqura` calendar — no data file. Dates of Ramadan/Eids are labelled "expected — depends on moon sighting".
- (Later phase, optional) magnetic declination for the compass: NOAA World Magnetic Model coefficients (public domain) — not downloaded.

## 11. Cities / time zones — GeoNames

| | |
|---|---|
| Files | `cities/geonames/cities15000.zip` (34,152 cities, 19 columns), `countryInfo.txt`, `admin1CodesASCII.txt`, `timeZones.txt`, `readme.txt` |
| License | "This work is licensed under a Creative Commons Attribution 4.0 License, see https://creativecommons.org/licenses/by/4.0/" |
| Attribution | "City data © GeoNames (geonames.org), CC BY 4.0" |
| Notes | Dumps are regenerated daily, so hashes change between downloads. 12,359 cities have at least one Arabic-script name in `alternatenames`, but that column has no language tags. Language-tagged Arabic names are in `alternateNamesV2.zip` (~205 MB) — **not downloaded**, pending decision. |

## 12. Reference-only data (not import candidates)

- `quran/quranenc-kfgqpc/sura/{1..114}.json` — QuranEnc API responses whose `arabic_text` field is the Quran in the KFGQPC Hafs encoding (6,236 ayahs; each response also contains the Muyassar text). Used only for the labelled reference row in the font test and for the encoding comparison. ~11 MB; can be deleted after the font decision.
- `quran/tanzil/quran-uthmani.txt` — documents the txt-2 Basmala behaviour.

## Draft attribution block (for the future About & Sources page)

- Quran text: Tanzil Project — tanzil.net (Uthmani, Version 1.1), copied verbatim.
- Quran metadata: Tanzil Project (CC BY).
- Font, translation, tafsir, audio, adhkar: after approval — translator/author and distribution with version.
- City data © GeoNames, CC BY 4.0.
