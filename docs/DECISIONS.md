# Noor — Decisions Log

Each entry: **status**, context, decision, consequences. Statuses:
- **Accepted** — from SPEC defaults (§4, §19) or implemented and agreed; the owner may still override.
- **Proposed** — recommended by the agent, waiting for the owner's approval.
- **Needs decision** — the owner must choose (candidates in [SOURCES.md](SOURCES.md)).

Dates are absolute. Phase 0 = 2026-10-04.

---

## Phase 0 review — open issues (most important first)

1. Quran font and text encoding must be chosen as a pair; the KFGQPC font license forbids modification → D-011.
2. License obligations missing from the SPEC (Tanzil notice in derived files, non-commercial terms, QuranEnc versioning/update duties) and the app's commercial status → D-012, D-020, D-023.
3. No adhkar dataset meets SPEC 2.7 with a clear license; Quran passages inside adhkar are in non-Uthmani spelling → D-019.
4. Audio: only Islamic Network publishes clear permission; Quran Foundation needs OAuth and limits caching to 1 week → D-021.
5. Search highlighting: 363 of 6,236 ayahs have different word counts in Simple Clean vs Uthmani → D-013.
6. JS virtualization of long surahs would break the DOM rendering-integrity test, Ctrl+F and SEO → D-014.
7. Mushaf mode on phones: a 15-line Madani page does not fit at a readable size; a better long-term path than QCF exists → D-025.
8. Tanzil metadata names/transliterations are not display-ready (e.g. `ابراهيم`, `Al-Baqara`) → D-024.
9. Sync: last-write-wins on device clocks is fragile → D-016.
10. JS budget 150 KB gz and PWA on Next 16 (Turbopack default) → D-017.

---

## D-001 — Application stack
**Status:** Accepted (SPEC §4). Versions pinned in Phase 1.

Next.js (App Router, TypeScript strict), Tailwind CSS with CSS-variable tokens, next-intl, PostgreSQL (Neon) + Prisma for user data only, Better Auth + Resend, Dexie (IndexedDB), Serwist, Vitest + Playwright + axe-core, Vercel + Neon.

Pinned in Phase 1 (exact versions, `save-exact=true`), following the official `create-next-app@16.3.8` template where it differs from npm `latest`:

| Package | Version | Note |
|---|---|---|
| next / eslint-config-next | 16.3.8 | Turbopack default; `proxy.ts` replaces middleware; `next lint` removed |
| react / react-dom | 19.2.8 | as in the template (19.3.0 exists; not adopted yet) |
| next-intl | 4.14.9 | uses `next/root-params` (Next ≥ 16.3) |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | |
| typescript | 5.9.3 | TS 7.0 (native) exists; Next's type-checking uses the TS 5 API |
| eslint | 9.39.5 | as in the template; npm marks 9.x as no longer supported — move to 10 once `eslint-config-next` is verified with it |
| prisma | 7.10.0 | latest stable; the npm `latest` tag pointed at 8.0.0-rc.19 |
| vitest | 5.0.3 | |
| @playwright/test / @axe-core/playwright | 1.63.0 / 4.13.0 | |
| @electric-sql/pglite | 0.5.8 | migration tests without a database server |
| lucide-react | 1.51.0 | icons (ISC) |

Added later when their phase starts: better-auth, dexie, adhan, @serwist/turbopack, @prisma/client + driver adapter.

## D-002 — Quran content is static, not in Postgres
**Status:** Accepted (SPEC §4). Import scripts generate versioned JSON chunks in `content/` (committed), served statically/SSG. Postgres holds user data only.

## D-003 — Standalone project
**Status:** Accepted (SPEC §19). New web project, separate from the Flutter app `quran-athkar-app`. Nothing is reused from it without provenance (its `athkar.json` is untrusted).

## D-004 — Mushaf mode = Madani page boundaries, approximate line layout
**Status:** Accepted (SPEC §19). Page boundaries from Tanzil `quran-data.xml` (604 pages). The UI and docs say: "page boundaries follow the Madani Mushaf; line layout is approximate."

## D-005 — Hosting: Vercel + Neon
**Status:** Accepted (SPEC §19).

## D-006 — Auth: Better Auth + Resend
**Status:** Accepted (SPEC §19).

## D-007 — Tafsir al-Muyassar first; English translation after license review
**Status:** Accepted (SPEC §19). Distribution and translation choices are D-020.

## D-008 — Phase 0 tooling and provenance lock
**Status:** Accepted (implemented 2026-10-04).
- Zero-dependency Node ESM scripts in `scripts/sources/` (Node ≥ 22; tested on Node 26.0.0 / Windows 11 / PowerShell). Their own ZIP reader (`zlib.inflateRawSync` + CRC-32 check) and sfnt reader avoid external tools.
- `data/sources/sources.manifest.json` declares candidates; `fetch-sources.mjs` downloads them and writes `SOURCES.lock.json` (URL, options, license quote, evidence file, SHA-256 per file, archive + member hashes).
- Terms web pages are stored as text excerpts (not whole pages) with the full page's SHA-256.
- Phase 2 import scripts will be TypeScript and will read only files listed in the lock with matching SHA-256.

## D-009 — Quran display text: Tanzil Uthmani, XML format
**Status:** Accepted by the owner on 2026-10-04 (Phase 2), including the verbatim per-surah Basmala.
- Format XML: the Basmala of surahs 2–114 is in a `bismillah` attribute, so ayah 1 needs **no stripping** (verified for all 112 surahs).
- Options: pause marks on, sajdah signs on, rub-el-hizb signs off (hizb quarters come from metadata and are rendered as UI outside the ayah text), superscript alef on.
- Display the surah-header Basmala from each surah's own attribute, verbatim. Surahs 95 and 97 carry a shadda on the first letter (Madani Mushaf); a fixed 1:1 string would be wrong there.
- The Tanzil header year changes annually (`Copyright (C) 2007-2026`), so the file hash changes on re-download even when the text does not; the import compares the ayah strings, not just the file hash.

## D-010 — Tatweel option (tatweel=true vs false)
**Status:** Accepted on 2026-10-04: **tatweel=true** (Tanzil's default, `quran-uthmani.xml`). 3,423 ayahs differ from the tatweel=false download; switching later is a re-approval plus a re-import.

## D-011 — Quran font + text pairing
**Status:** Needs decision. Recommendation: an OFL font that renders the Tanzil encoding correctly (Amiri Quran or Scheherazade New), self-hosted.
- KFGQPC Hafs fonts are designed for the KFGQPC encoding. With Tanzil text, Tanzil's sukun (U+0652) is drawn as a round circle and U+06DF renders as a broken mark with a dotted circle (seen in the font test, 20:28). Their EULA allows free use and distribution but forbids modification (no subsetting, no WOFF2 conversion) without written approval.
- Choosing the KFGQPC look therefore means switching the **text source** to a KFGQPC-encoded text from an approved source (never converting Tanzil text — CLAUDE.md forbids transformation), plus written permission for any font modification.
- DigitalKhatt Madina is OFL but expects its own text/justification; with Tanzil text, word spaces collapse. Not a drop-in candidate (see D-025).

## D-012 — Source notice travels with generated content
**Status:** Accepted on 2026-10-04; implemented in Phase 2 for the Quran files. Tanzil's notice requires reproduction "in all files derived from or containing substantial portion of this text". Every generated Quran chunk (`content/quran/surah/*.json`, `meta.json`, search index) gets a `source` object (name, url, version, notice) and the app links to tanzil.net. Translations/tafsir chunks carry translator, distributor and version (QuranEnc requires the version number).

## D-013 — Search index and match highlighting
**Status:** Partly accepted on 2026-10-04: the Simple Clean (no marks) input is approved and the index is built (Phase 2). The highlight alignment is still Proposed (Phase 5).
- Index built from Tanzil Simple Clean downloaded **without** pause/sajdah marks (otherwise Tanzil inserts them).
- Word counts differ in 363 of 6,236 ayahs (5.8%) between Simple Clean and Uthmani (mark-only tokens ignored). The import builds a per-ayah alignment and records the mismatches; where words cannot be aligned 1:1, the result highlights the whole ayah instead of guessing.

## D-014 — Long surahs and text spans
**Status:** Proposed.
- Use CSS `content-visibility: auto` (+ `contain-intrinsic-size`) instead of JS virtualization: all ayahs stay in the DOM, so the rendering-integrity test, browser find, SEO and screen readers keep working.
- Any span wrapping (search highlight, audio highlight, memorization) wraps whole whitespace-delimited tokens only, never part of a word. Mark-only tokens (Tanzil writes pause marks and ۩ as separate space-delimited tokens: 4,379 such tokens; 2,640 ayahs have a pause mark after a space) stay outside "word" logic.

## D-015 — Font licensing constraints
**Status:** Proposed.
- IBM Plex Sans Arabic (UI) and Scheherazade New have Reserved Font Names; a subset is a Modified Version under the OFL and must be renamed internally. Amiri and Noto have no RFN.
- KFGQPC fonts: no modification at all (see D-011).

## D-016 — Sync cursor and conflict clock
**Status:** Proposed (implementation in Phase 4/9). The sync cursor is a server-assigned monotonic sequence (`serverSeq`), not a timestamp. Last-write-wins compares a hybrid timestamp: `updatedAt = max(deviceNow, lastSeenUpdatedAt + 1)`, so a device with a slow clock cannot lose edits it makes after seeing newer data. Tombstones are kept at least 90 days.

## D-017 — PWA on Next 16
**Status:** Proposed. Next 16 builds with Turbopack by default; use `@serwist/turbopack` (instead of `@serwist/next`, which needs webpack). Measure the reader's JS in Phase 3 and lazy-load Dexie, audio and the search worker to stay under 150 KB gzipped.

## D-018 — Repository contents for `data/sources/`
**Status:** Proposed — partly done in Phase 1: `git init` (no commit yet) and the KFGQPC TTF files are git-ignored. Commit `data/sources/` (≈ 43 MB incl. reference data) except: KFGQPC font files (EULA, until permission) and, after the font decision, the ~11 MB `quran/quranenc-kfgqpc/` reference responses.

## D-019 — Adhkar dataset and Quranic passages inside adhkar
**Status:** Needs decision (dataset) + Proposed (rendering).
- Rendering: a dhikr that quotes the Quran (Ayat al-Kursi, al-Ikhlas, al-Falaq, an-Nas, …) stores ayah references and renders that part from the approved Quran text, with its own reference; the dataset's simplified spelling is not shown as Quran.
- Dataset: options in SOURCES.md §9 — none has text + count + reference + grading + clear license for the whole book.

## D-020 — English translation
**Status:** Needs decision. Recommendation: QuranEnc distribution (explicit re-publishing permission, versioned, maintained) — Saheeh International (`english_saheeh` 1.1.2) as default, Rowwad (`english_rwwad` 1.0.19) as an alternative. Consequences: no modification (footnotes shown as provided), version shown on screen, a script that checks QuranEnc for newer versions.

## D-021 — Audio source
**Status:** Needs decision. Recommendation: Islamic Network CDN (per-ayah MP3, written permission for streaming in personal/educational use; reciters keep copyright). Stream only; no offline download in v1. Attribution: reciter + Islamic Network.

## D-022 — Arabic city names
**Status:** Needs decision. `cities15000` has untagged Arabic-script alternate names for 12,359 of 34,152 cities. Options: (a) use those (cheap, imprecise), (b) download `alternateNamesV2.zip` (~205 MB, not committed) and commit only a derived subset of `ar` names for the bundled cities, with the upstream hash in the lock.

## D-023 — Commercial status of Noor
**Status:** Needs decision. Tanzil translations, Islamic Network audio and Hisn al-Muslim's distribution terms are tied to non-commercial use. Proposed: Noor is free, without ads or paid features; donations would need a fresh license review.

## D-024 — Surah names and URL slugs
**Status:** Proposed. Create `data/curated/surah-names.json` (Arabic display name, English name, slug) reviewed by the owner; Tanzil metadata stays the structural source. Curated names are UI labels, not Quran text.

## D-025 — Future line-exact Mushaf
**Status:** Proposed (out of scope for v1). Prefer evaluating DigitalKhatt (OFL, Madina-style justification, sponsored by Tarteel) with its own matching text over QCF per-page fonts (604 fonts under the KFGQPC license).

---

## Phase 1 — project setup (2026-10-04)

## D-026 — Locale routing details
**Status:** Accepted (implements SPEC §8); the owner may override.
next-intl with `localePrefix: 'as-needed'` (Arabic at `/`, English at `/en`), `localeDetection: false` and `localeCookie: false`: the URL alone decides the language, so `/` is Arabic even for an English browser and no cookie is set. The language switch links to the same page in the other locale. `<html lang dir>` is set per locale.

## D-027 — UI font files
**Status:** Accepted (implements SPEC §3/§11 within D-015); the owner may override.
IBM Plex Sans Arabic is served from IBM's own unmodified WOFF2 files (`fonts/complete/woff2` of the v1.1.0 release, recorded in `SOURCES.lock.json`) via `next/font/local`, weights 400 and 600 (~72 KB + ~76 KB). This is not a self-made subset: subsetting would create a Modified Version that may not carry the Reserved Font Name "Plex". The Quran font slot (`--font-quran`) stays a fallback until D-011 is decided.

## D-028 — Migrations without a local database
**Status:** Accepted (implemented).
No PostgreSQL exists on the development machine and Docker is not required. The initial migration was generated with `prisma migrate diff --from-empty --to-schema` and is verified by `npm test`: it is applied to PGlite (Postgres in WebAssembly), constraints are exercised, and the SQL must equal a fresh diff of the schema (valid while there is one migration; later phases add a shadow-database check). Deployments use `prisma migrate deploy` against Neon.

## D-029 — Sync-ready columns in the schema
**Status:** Accepted (implements SPEC §5). User-data tables use client-generated UUIDs, a client-supplied `updatedAt` (not Prisma's `@updatedAt`, which would overwrite it with server time) and a `deletedAt` tombstone; all cascade on user deletion. `MemorizationItem.repetitions` was added for the SPEC §7.12 "3 successful reviews" rule. The server-side sync cursor of D-016 is **not** in the schema yet (D-016 is still Proposed).

## D-030 — `@swc/core` native cache on Windows
**Status:** Accepted (implemented). The next-intl plugin loads `@swc/core` 1.16, whose native addon refuses its default cache folder `%LOCALAPPDATA%\swc` when that folder's ACL lets another principal replace files. On the development machine `%LOCALAPPDATA%` inherits full access for an AppContainer SID (`S-1-15-3-3557520199-…`), so `tooling/swc-native-cache.ts` (imported first by `next.config.ts`) points `SWC_NATIVE_BINDING_CACHE` to `.cache/swc` in the project unless it is already set.

## D-031 — Theme and language controls in Settings
**Status:** Accepted (Phase 1 shell). The Settings placeholder already contains the theme picker (Automatic, Light, Dark, Sepia, Black) and the language choice, because the themes must be checkable from Phase 1 on. Reading settings arrive with the reader.

---

## Phase 2 — Quran content pipeline (2026-10-04)

## D-032 — Owner approvals are recorded per file
**Status:** Accepted (implemented). An approved source file carries an `approval` object ({ use, approvedAt, approvedBy, decisions, note }) in `data/sources/sources.manifest.json`; `fetch-sources.mjs` copies it into `SOURCES.lock.json` (`--relock` does this offline after re-checking every local SHA-256). Import scripts load files **only** by approved use (`quran-display`, `quran-search`, `quran-metadata`), require exactly one file per use and verify its SHA-256 against the lock before parsing. Approved on 2026-10-04: `quran-uthmani.xml`, `quran-simple-clean.xml`, `quran-data.xml`.

## D-033 — Content file format
**Status:** Accepted (implemented).
- `content/quran/meta.json`: provenance (`text`, `metadata`), counts, integrity hashes, 114 surahs (Tanzil fields verbatim + first/last page), 30 juz, 240 hizb quarters, 604 pages, 15 sajdahs.
- `content/quran/surah/{n}.json`: provenance with Tanzil's notice, `bismillah` (verbatim attribute or `null` for 1 and 9) and the ayahs with page, juz, hizb, hizb quarter and sajdah type.
- `content/search/index.json`: `[key, normalized Simple Clean text]` + the normalization rules and version; marked "never display as Quran".
- Integrity: SHA-256 over `${surah}|${ayah}|${text}
` for all ayahs in Mushaf order, plus a hash of the 112 header Basmalas; both recorded in `meta.json`.
- JSON is written with one array element per line so content changes are small, reviewable diffs; no timestamps, so re-imports of the same sources are byte-identical.

## D-034 — Scripts in TypeScript run by Node directly
**Status:** Accepted (implemented). `scripts/import-quran.ts` and `scripts/verify-content.ts` run with plain `node` (type stripping; Node ≥ 22.18, so `engines` was raised). `package.json` is now `"type": "module"`; `tsconfig` enables `allowImportingTsExtensions`, `erasableSyntaxOnly` and `verbatimModuleSyntax` so the same modules (`src/lib/quran/*`) work in Node, Vitest and Next.js. No `tsx`/`ts-node` dependency.

## D-035 — "Stop and ask" in the import
**Status:** Accepted (implemented). The import throws `SourceSurprise` instead of adapting when: a file hash differs from the lock; counts or per-surah ayah counts differ from the metadata; metadata divisions are missing, out of order or point to invalid ayahs; a Quran string contains `&`/an entity; the notice comment is missing; a Basmala attribute is missing, unexpected (1, 9) or differs from 1:1 other than the approved 95/97 shadda variant; an ayah 1 starts with the Basmala; or the search text contains marks. None of these occurred on 2026-10-04.
