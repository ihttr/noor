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
**Status:** Accepted on 2026-10-05: Amiri Quran (default) + Scheherazade New (selectable) — see D-036. Recommendation: an OFL font that renders the Tanzil encoding correctly (Amiri Quran or Scheherazade New), self-hosted.
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
**Status:** Accepted on 2026-10-05 (content-visibility); implemented in Phase 3.
- Use CSS `content-visibility: auto` (+ `contain-intrinsic-size`) instead of JS virtualization: all ayahs stay in the DOM, so the rendering-integrity test, browser find, SEO and screen readers keep working.
- Any span wrapping (search highlight, audio highlight, memorization) wraps whole whitespace-delimited tokens only, never part of a word. Mark-only tokens (Tanzil writes pause marks and ۩ as separate space-delimited tokens: 4,379 such tokens; 2,640 ayahs have a pause mark after a space) stay outside "word" logic.

## D-015 — Font licensing constraints
**Status:** Proposed.
- IBM Plex Sans Arabic (UI) and Scheherazade New have Reserved Font Names; a subset is a Modified Version under the OFL and must be renamed internally. Amiri and Noto have no RFN.
- KFGQPC fonts: no modification at all (see D-011).

## D-016 — Sync cursor and conflict clock
**Status:** Accepted — implemented (clock in Phase 4, cursor in Phase 9, see D-061). The sync cursor is a server-assigned monotonic sequence (`serverSeq`), not a timestamp. Last-write-wins compares a hybrid timestamp: `updatedAt = max(deviceNow, lastSeenUpdatedAt + 1)`, so a device with a slow clock cannot lose edits it makes after seeing newer data. Tombstones are kept at least 90 days.

## D-017 — PWA on Next 16
**Status:** Superseded by D-068 (hand-written service worker; the JS budget part was done in Phases 3–8). Next 16 builds with Turbopack by default; use `@serwist/turbopack` (instead of `@serwist/next`, which needs webpack). Measure the reader's JS in Phase 3 and lazy-load Dexie, audio and the search worker to stay under 150 KB gzipped.

## D-018 — Repository contents for `data/sources/`
**Status:** Proposed — partly done in Phase 1: `git init` (no commit yet) and the KFGQPC TTF files are git-ignored. Commit `data/sources/` (≈ 43 MB incl. reference data) except: KFGQPC font files (EULA, until permission) and, after the font decision, the ~11 MB `quran/quranenc-kfgqpc/` reference responses.

## D-019 — Adhkar dataset and Quranic passages inside adhkar
**Status:** Accepted by the owner on 2026-10-09 for the dataset: Seen-Arabic morning/evening only (other categories empty until a source is approved). Rendering: see D-055.
- Rendering: a dhikr that quotes the Quran (Ayat al-Kursi, al-Ikhlas, al-Falaq, an-Nas, …) stores ayah references and renders that part from the approved Quran text, with its own reference; the dataset's simplified spelling is not shown as Quran.
- Dataset: options in SOURCES.md §9 — none has text + count + reference + grading + clear license for the whole book.

## D-020 — English translation
**Status:** Needs decision — the owner chose "no translation for now" on 2026-10-09; the pipeline is ready (D-052). Recommendation: QuranEnc distribution (explicit re-publishing permission, versioned, maintained) — Saheeh International (`english_saheeh` 1.1.2) as default, Rowwad (`english_rwwad` 1.0.19) as an alternative. Consequences: no modification (footnotes shown as provided), version shown on screen, a script that checks QuranEnc for newer versions.

## D-021 — Audio source
**Status:** Accepted by the owner on 2026-10-09 (Islamic Network CDN). Implementation: D-054. Recommendation: Islamic Network CDN (per-ayah MP3, written permission for streaming in personal/educational use; reciters keep copyright). Stream only; no offline download in v1. Attribution: reciter + Islamic Network.

## D-022 — Arabic city names
**Status:** Needs decision. `cities15000` has untagged Arabic-script alternate names for 12,359 of 34,152 cities. Options: (a) use those (cheap, imprecise), (b) download `alternateNamesV2.zip` (~205 MB, not committed) and commit only a derived subset of `ar` names for the bundled cities, with the upstream hash in the lock.

## D-023 — Commercial status of Noor
**Status:** Needs decision. Tanzil translations, Islamic Network audio and Hisn al-Muslim's distribution terms are tied to non-commercial use. Proposed: Noor is free, without ads or paid features; donations would need a fresh license review.

## D-024 — Surah names and URL slugs
**Status:** Slugs: generated, awaiting owner review (D-037). Display names: Tanzil's, until a curated names file is approved. Create `data/curated/surah-names.json` (Arabic display name, English name, slug) reviewed by the owner; Tanzil metadata stays the structural source. Curated names are UI labels, not Quran text.

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
**Status:** Accepted (implements SPEC §5). User-data tables use client-generated UUIDs, a client-supplied `updatedAt` (not Prisma's `@updatedAt`, which would overwrite it with server time) and a `deletedAt` tombstone; all cascade on user deletion. `MemorizationItem.repetitions` was added for the SPEC §7.12 "3 successful reviews" rule. Phase 9 added the server-side cursor of D-016: a `serverSeq` column on every user-data table, from one global sequence, bumped by a trigger on every update (migration `20261009120000_sync`, D-061).

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

---

## Phase 3 — Quran reader (2026-10-05)

## D-036 — Quran fonts in the reader
**Status:** Accepted by the owner on 2026-10-05. Amiri Quran is the default, Scheherazade New is selectable in the reading settings. Both are self-hosted WOFF2 through `next/font/local`, loaded only by reader routes, and only Amiri is preloaded.
- Amiri Quran: the approved TTF (1.003) converted by `scripts/build-fonts.ts` with wawoff2 (Google's woff2 in WASM) into `assets/fonts/AmiriQuran.woff2` (134 KB → 61 KB). The conversion is verified by a round trip (same cmap, same version) and recorded in `assets/fonts/fonts.lock.json`; CI checks it is up to date. Amiri has no Reserved Font Name.
- Scheherazade New: SIL's own unmodified WOFF2 from the approved 4.500 release (RFN respected).

## D-037 — Surah URL slugs
**Status:** Accepted on 2026-10-05 (slugs from Tanzil transliterations); the file awaits the owner's review. `data/curated/surah-slugs.json` was generated once by `scripts/init-surah-slugs.ts` (e.g. `al-baqara`, `aal-i-imraan`) and is now hand-curated (the script never overwrites it). Surah pages live at `/quran/{slug}`; `/quran/{n}` redirects with 308. `/quran/{slug}/{ayah}` redirects temporarily (307) to `/quran/{slug}#ayah-{s}-{a}` until indexable ayah pages are built (SPEC §9, Phase 12).

## D-038 — Reader rendering
**Status:** Accepted (implemented).
- Server-rendered text: each ayah string is placed verbatim in `[data-ayah-text]`. Ayah numbers come from a CSS counter after U+06DD (so digits follow the numeral setting without touching the DOM text). Hizb-quarter marks (۞) and the sajdah label are separate elements. The DOM integrity test (SPEC §2.6) runs on surahs 1, 2, 9, 18, 36, 112–114 and Mushaf pages 1, 2 and 604.
- Ayahs are grouped by Madani page into sections with `content-visibility: auto` (D-014). Jumps re-scroll after the font loads until the target ayah settles, and stop when the reader interacts.
- All 114 surahs (×2 locales), the 604 Mushaf pages and the 30 juz are prerendered (about 2,800 pages, roughly 10,800 build files). Vercel documents no limit on build output files.
- The sajdah type in the Tanzil metadata (recommended/obligatory) is kept in the data but **not shown**, because it is a fiqh ruling the app should not assert. Only "سجدة" is shown.
- The Mushaf is a right-to-left book in every UI language: a swipe to the right or PageDown goes to the next page, and the next-page link sits on the left. Arrow keys move by ayah (← and ↓ forward), PageUp/PageDown by page.

## D-039 — Reading settings storage
**Status:** Accepted for Phase 3 (Phase 4 moves user data to IndexedDB). Font, size (20–56 px), line spacing, width and numerals are kept in `localStorage` (`noor:reader`) and applied by the inline boot script before paint. "Numerals: automatic" means Arabic-Indic ayah numbers in the Arabic UI and Western in the English UI. UI numbers (page, juz, counts) follow the locale's default CLDR digits (Western for `ar` today); the numeral setting changes ayah numbers only — **decision needed** whether it should also cover all UI numbers.

## D-040 — Precompiled messages (next-intl, experimental)
**Status:** Accepted (implemented). `experimental.messages.precompile` compiles ICU messages at build time, so the ICU parser/formatter (~17 KB gzipped) is not shipped to the browser. Without it the reader route exceeded the 150 KB JS budget. Risk: the option is experimental in next-intl 4.14; `t.raw` is not available.

## D-041 — No next-intl runtime in the browser
**Status:** Proposed. The reader route ships 147.8 KiB of gzipped JS (gzip level 9), under 150 KiB but only ~2 KiB to spare; strictly in decimal kB it is 151.3 kB. React DOM and the Next.js runtime alone are ~134 KiB. Replacing next-intl's client APIs (`useTranslations`, `Link`, `useRouter`, `usePathname`, `NextIntlClientProvider`) with server-prepared labels and plain `next/link` + a small locale-prefix helper would save about 9 KiB, leaving room for the ayah menu (Phase 4) and the mini player (Phase 6). Server-side next-intl stays.

---

## Phase 4 — Local-first store, position, saved items and notes (2026-10-06)

## D-042 — Local store: Dexie behind a repository interface
**Status:** Accepted (implemented).
- `src/lib/store/repository.ts` is the interface features use (`LocalStore`: preferences, position, readingDays, saved, collections, notes, sync, subscribe). `src/lib/store/dexie.ts` implements it on IndexedDB with Dexie 4.4.6 (Apache-2.0); `getStore()` loads it as a separate chunk.
- Record shape follows `prisma/schema.prisma`: client UUID (`crypto.randomUUID`, with a `getRandomValues` fallback for plain-http LAN testing), `createdAt`, `updatedAt`, `deletedAt` tombstone. Timestamps are epoch milliseconds from a hybrid clock (D-016: `max(now, last + 1)`, persisted); the Phase 9 transport converts them to `DateTime`.
- Every write runs in one transaction that also puts the record into `outbox` (the upload queue). `sync.pending()` / `acknowledge()` / `applyRemote()` / cursor are the transport's whole interface. Change notifications: listeners in the tab after commit, other tabs via `BroadcastChannel`.
- Input is validated before writing (item references, note ≤ 5,000 characters, collection names ≤ 60).

## D-043 — Merge rules for sync
**Status:** Accepted (implemented and unit-tested in Phase 4; used by Phase 9). Last write wins per record by `updatedAt`, ties broken by content so every device agrees. Tables the server keeps unique per user adopt the server's record id: preferences and reading position (one row), reading days (one row per date, merged by union of pages and max of seconds, SPEC §5). Saved items (type + ref) and notes (target) created on two devices fold into the record with the smallest id; the other becomes a tombstone. Two different note texts on the same target are both kept, oldest first.

## D-044 — Preferences: IndexedDB is the source of truth, localStorage a boot copy
**Status:** Accepted (implemented). Reading settings and theme are saved to the store (debounced 400 ms); `noor:reader` and `noor:theme` in localStorage stay as a boot copy that the inline script applies before paint (no flash). When the page is idle the stored values win and refresh the boot copy; values that exist only in the boot copy (from Phase 3) are moved into the store. Other tabs follow through the store's change notifications.

## D-045 — Ayah menu: opened from the ayah number
**Status:** Accepted by the owner on 2026-10-06. Tapping the ayah number (end-of-ayah marker, ≥ 44 px touch target at the default size, `role="button"`, `aria-haspopup="dialog"`) opens the menu on every device; tapping the text still toggles the chrome (SPEC §6) and text selection keeps working. Keyboard: Enter, Space, the context-menu key or Shift+F10 on the focused ayah. The menu is a modal `<dialog>` (focus trap, Escape, focus returns to the ayah): a popover next to the number from 48 rem (768 px) wide, a bottom sheet below. Copy = the ayah text exactly as rendered + a new line + `[البقرة: ٢٥٥]` / `[Al-Baqara 2:255]` (digits follow the numeral setting). Share uses the Web Share API with the stable URL `/quran/{slug}/{ayah}`, otherwise copies text + link. Play, translation and tafsir are shown disabled ("coming soon") until their phases. A toolbar bookmark saves the current page (Mushaf mode) or surah (reading mode).

## D-046 — One note per target
**Status:** Accepted by the owner on 2026-10-06. Notes live only in the `Note` entity, one per target (ayah, page, surah, dhikr, tafsir), shown with the saved item when the target is saved; a note works without saving, and removing a saved item keeps its note. `SavedItem.note` was dropped by the Phase 9 sync migration.

## D-047 — Reading position and activity definitions
**Status:** Accepted (implemented).
- Position = the ayah being read at the top of the text, saved 1 s after scrolling stops (and on page hide), with its page and mode. Ayahs flow inline, so the top line often holds the end of one ayah and the start of the next: the ayah that starts there wins unless the previous one still fills more than ~1.5 lines below the edge. The edge is where a jump puts an ayah (its scroll margin below the chrome), so reopening a position finds the same ayah (verified by an e2e test).
- Page read (SPEC §7.7): Mushaf mode — the page on screen for a cumulative 15 s; reading mode — at least half of the page's ayahs (the whole Madani page) each visible for a cumulative 15 s. Screen time is kept across client-side navigation, so a page shared by two surahs can be completed in both. Counted once per local day. Constants in `src/lib/activity/page-read.ts`.
- Reading time: only on reader routes, while the tab is visible and there was input (pointer, key, wheel, touch, scroll) in the last 60 s, or while audio plays; split at local midnight; saved every 15 s and on hide.

## D-048 — JS budget with lazily loaded features
**Status:** Accepted by the owner on 2026-10-06 (as proposed in D-017). The 150 KB limit applies to the scripts a reader route loads for its first paint (measured from its HTML, gzip level 9). The store (Dexie), tracking, preferences sync and the ayah menu load when the page is idle or on first use and are reported separately by the budget test. Phase 4: 149.6 KiB first paint (+1.8 KiB), 51.5 KiB loaded later. D-041 is still open and becomes necessary before more first-paint code is added.

---

## Phase 5 — Search, command palette, translations, tafsir (2026-10-09)

Owner decisions on 2026-10-09 (chat, before continuing with Phases 5–12): tafsir = Tafsir al-Muyassar from QuranEnc; audio = Islamic Network CDN (D-021); adhkar = Seen-Arabic morning/evening (D-019); **no translation for now** (D-020 stays open). Approvals are recorded per file in the manifest and lock (D-032).

## D-049 — Tafsir al-Muyassar (QuranEnc distribution)
**Status:** Accepted by the owner on 2026-10-09. `scripts/import-tafsir.ts` reads only the approved SQLite file (SHA-256 verified, read with Node's built-in `node:sqlite`, no dependency) and writes `content/tafsir/muyassar/surah/{n}.json` + `content/tafsir/registry.json`. Texts are verbatim (no trimming or normalization); the import stops on gaps, duplicates or empty texts. `verify-content` re-reads the source and compares every entry code point for code point, plus a canonical SHA-256. The panel always shows «التفسير الميسر — مجمع الملك فهد لطباعة المصحف الشريف», a link to QuranEnc.com and the copy date (QuranEnc publishes no version for this item, so the download date and hash identify it). The panel is a side panel from 48 rem and a bottom sheet below, opened from the ayah menu; a tafsir entry can be saved (type `TAFSIR`, ref `muyassar:2:255`).

## D-050 — Quran search
**Status:** Accepted (implements SPEC §7.8 and D-013). The normalized Simple Clean index (~200 KB gzipped) is served once by `/api/quran/search-index` with each ayah's juz, and searched in a Web Worker. Modes: whole-word phrase (default), parts of words, all words in any order; filters by surah and juz; 20 results per page. Highlighting maps matched Simple Clean word positions to the Uthmani words; the Uthmani string is only cut into consecutive pieces at spaces (they always join back to the source — tested on all 6,236 ayahs). Tokens of only marks are not words. 5,873 ayahs map word for word; for the 363 whose word counts differ, the whole ayah is highlighted. Search result pages are `noindex, follow`.

## D-051 — Command palette
**Status:** Accepted (implemented). Ctrl/Cmd + K, or the search button in the sidebar / mobile header (a link to `/search` without JavaScript). Entries: ayah references (`2:255`, `البقرة ٢٥٥`), pages (`صفحة 50`), juz (`جزء 30`), surahs (same matching as the surah index), sections, saved items and notes (from the local store), theme and language, and "search the Quran for …". ARIA combobox + listbox, arrows / Enter / Escape. The palette is loaded on first use; every page only carries the key listener.

## D-052 — Translations: pipeline ready, nothing imported
**Status:** Accepted (implements SPEC §7.9 without content, per the owner's choice). `content/translations/registry.json` is empty. `scripts/import-translation.ts <id>` reads a file only if it is approved for the use `translation:<id>` (it refuses today), parses the QuranEnc XML (CDATA, verbatim) or Tanzil XML (attribute values entity-decoded only) formats, checks the translator named in the file and full coverage, and writes per-surah chunks with translator, source, version and hash. All 8 candidate files parse completely in a unit test (nothing written). The reading settings show "no translation approved yet"; once one is imported it can be chosen there and appears under each ayah in reading mode with a credit line — **that display path cannot be tested until a translation is approved**.

## D-053 — Reader dialogs load on first use
**Status:** Accepted (implemented). The jump and reading-settings dialogs are lazy chunks (preloaded when the reader is idle) and mount on first open. The reader's first-paint JS went from 149.7 KiB to 146.6 KiB (gzip -9), which leaves room for the mini player (Phase 6) without D-041.

---

## Phase 6 — Audio (2026-10-09)

## D-054 — Audio player (Islamic Network CDN, streaming only)
**Status:** Accepted (implements SPEC §7.11 with D-021).
- `scripts/import-audio.ts` builds `content/audio/reciters.json` from the approved edition list: Arabic recitations only (spoken translations are not recitations), without the "-2" editions that repeat a reciter under the same name — 17 reciters, default Mishary Alafasy. The list has no bitrates, so the available ones were probed with HTTP HEAD requests (no audio downloaded) and recorded in `data/curated/audio-bitrates.json`: 128 kbps when available, else 64, else what exists (e.g. Ibrahim Akhdar 32).
- Per-ayah files `https://cdn.islamic.network/quran/audio/{bitrate}/{reciter}/{globalAyah}.mp3`; a surah plays by sequencing them, preloading only the next ayah; it stops at the end of the surah unless the surah or an ayah range repeats. Repeat each ayah 1/2/3/5/10/∞ times, speed 0.75–2×, reciter, and auto-scroll are in the player's options (reciter, speed and auto-scroll are saved as preferences).
- One module-level `<audio>` element, so playback survives client-side navigation; the mini player is mounted in the root layout and loaded only after the first "Play" (no first-paint cost). It sits above the bottom navigation on phones and moves down when the reader hides its chrome.
- The reciting ayah is marked in the reader (`data-playing`) and scrolled into view (smooth unless reduced motion). Listening counts as reading time (SPEC §7.7).
- Media Session: title "{surah} · الآية n", reciter as artist; play, pause, previous/next ayah and stop actions.
- Mobile autoplay rules: the tap on "Play from here" unlocks the audio element synchronously (a tiny silent WAV) before the player code loads.
- No offline audio (SPEC §7.11, terms). The player and About page credit Islamic Network and link its terms; copyright stays with the reciters.
- Not testable here: background playback and lock-screen controls on real phones (manual checklist, SPEC §15).

---

## Phase 7 — Adhkar and tasbih (2026-10-09)

## D-055 — Adhkar from the Seen-Arabic dataset
**Status:** Accepted (implements SPEC §7.14 with D-019).
- `scripts/import-adhkar.ts` reads only the approved `ar.json`/`en.json` (SHA-256 verified), checks every entry (unique order, text, count ≥ 1, a reference, same entry in both files) and writes `content/adhkar/index.json` + `morning.json` (26) + `evening.json` (24) — type 0 belongs to both. Texts and references are verbatim; `verify-content` rebuilds from the sources and requires exact equality.
- Reference = the dataset's `source` field as given (book, number and, where present, the grading — e.g. al-Albani's). The dataset has no separate grading field, so grading is not extracted.
- Quranic passages (Ayat al-Kursi, al-Baqarah 285–286, al-Ikhlas, al-Falaq, an-Nas) are spelled non-Uthmani in the dataset (with added commas); they are replaced by ayah references (`data/curated/adhkar-quran.json`, awaiting owner review) and rendered from the approved Tanzil text with their own reference. The import checks each mapping (≥ 75 % of the passage's normalized words in the referenced ayahs) and stops otherwise; the text around the passage (e.g. the isti'adha) stays verbatim.
- Not shown: `fadl` (virtue) — it has no reference of its own (SPEC §2.7); `hadith_text`, vocabulary notes, transliteration and the dataset's audio links.
- English UI: the dataset's English translation and English reference. The other ten categories of SPEC §7.14 exist in the UI and say honestly that no approved source covers them yet.
- Counts: saved on every tap in `AdhkarDay` (local date + category; merge = max per dhikr, completed stays completed), survive reloads, start again at local midnight (checked every minute and on return to the tab). The whole card counts a tap; −1, reset, a subtle completion state, optional auto-advance (off by default). A dhikr can be saved (type DHIKR) and get a private note. The home page shows today's state for morning, evening, after prayer and before sleep.

## D-056 — Tasbih and the shared counter
**Status:** Accepted (implements SPEC §7.15). The four preset phrases are read at build time from SPEC §7.15 itself (no dhikr text typed in code); a custom phrase (≤ 120 characters) is possible. Targets 33/99/100/custom/none with a progress ring; +1 (a large target), −1, reset with confirmation (the session stays in the history). Sessions live in `TasbihSession` (one running session; the last 30 are listed, empty ones hidden). Vibration where `navigator.vibrate` exists (the toggle is hidden otherwise, e.g. iOS Safari); a soft tone (Web Audio) is optional and off by default. Counting is enabled only after the saved count has loaded, and the latest count is kept synchronously, so quick taps are never lost (a bug found by the e2e test and fixed).

---

## Phase 8 — Prayer times, qibla, Hijri calendar (2026-10-09)

## D-057 — Bundled city list (GeoNames cities15000)
**Status:** Accepted (SPEC §3 default). `scripts/import-cities.ts` builds `content/cities/cities.json` (34,152 cities, ~740 KB gzipped), fetched only when the user searches; the search runs on the device. Display names are GeoNames' Latin main names; country names come from `Intl.DisplayNames`. The untagged Arabic-script alternates (Persian/Urdu spellings filtered out) are used for **search only** — D-022 (Arabic display names) is still open.

## D-058 — Prayer times
**Status:** Accepted. adhan-js 4.4.6 (MIT). Method defaults by country (SA Umm al-Qura, EG/SD/LY Egyptian, PK/IN/BD/AF Karachi, AE Dubai, KW Kuwait, QA Qatar, SG/MY/ID/BN Singapore, TR Diyanet, IR Tehran, US/CA ISNA, GB Moonsighting Committee, otherwise Muslim World League), changeable; Asr madhab, high-latitude rule, ±30 min per prayer. Unit test against the official Diyanet timetable for Istanbul (9 Oct 2026): all six times within 2 minutes. The place stays on the device (local-only store values, never synced); settings are synced preferences. Location is asked only after "Use my location" (e2e verified). Home highlights morning adhkar before Dhuhr and evening after Asr when a place is set.

## D-059 — Qibla
**Status:** Accepted. Bearing from true north (adhan `Qibla`, cross-checked with a great-circle formula) and distance to Makkah; live compass only after a tap (iOS permission + `webkitCompassHeading`, Android `deviceorientationabsolute`), fallback static dial. Both live headings are magnetic; declination is **not corrected** and the page says so. Real-device compass behaviour is untested here.

## D-060 — Hijri calendar
**Status:** Accepted. `Intl` `islamic-umalqura` (matches Diyanet's date for 9 Oct 2026), ±2-day adjustment, month grid with both calendars, six important dates, each labelled "expected — depends on moon sighting". Preferences are read with `loadPreferences()` (stored + not-yet-saved values) — a reload within the 400 ms save debounce lost a change before (found by e2e, fixed).

---

## Phase 9 — Accounts and sync (2026-10-09)

## D-061 — Sync protocol
**Status:** Accepted (implements SPEC §5, D-016, D-043).
- `POST /api/sync` `{ cursor, changes[≤500] }` → `{ changes, cursor, more }`. Records travel in the local store's shape; every field is validated with Zod (UUIDs, refs, ranges, sizes; body ≤ 2 MB). Session cookie required (401), same-origin `Origin` required (403, CSRF), 60 requests/min per user (429, per server instance).
- Server: one transaction per request holding `pg_advisory_xact_lock(hashtext(userId))`, so one user's syncs never interleave. Each pushed change is merged with the same rules as the client (`planMerge`/`newer`, merge.ts): last-write-wins by the hybrid `updatedAt`; reading days union pages and max seconds; adhkar days max counts; preferences, reading position, reading days and adhkar days are one row per natural key (the server keeps its row id; the client adopts it). A change whose id belongs to another user is ignored. The canonical rows of the pushed changes are echoed back.
- Cursor: every user-data row has `serverSeq` from one global Postgres sequence, set on insert and on every update by a trigger; a pull returns rows with `serverSeq > cursor` in order (≤ 500, `more` for the rest). The per-user lock makes the sequence commit-ordered per user.
- Client (`src/lib/sync/client.ts`): push the outbox in batches, apply the echo and the pull with `applyRemote`, acknowledge, store the cursor, repeat while `more`. Triggers: page load (when signed in), `online`, tab visible, and 3 s after local edits. Only loaded when an account is signed in (no cost for guests).

## D-062 — Local PostgreSQL without Docker: PGlite
**Status:** Accepted. `npm run db:dev` (`scripts/dev-db.ts`) runs PGlite (Postgres in WebAssembly) behind a Postgres wire-protocol socket (`@electric-sql/pglite-socket`) and applies the migrations with `prisma migrate deploy`; the port opens only after migrating. The e2e tests start it in memory on port 5434 (Playwright `webServer`). PGlite has a single backend shared by all socket connections, and statements of concurrent connections interleave badly ("portal does not exist"), so the app is run with `DATABASE_POOL_MAX=1` against it. Production uses Neon (pooled `DATABASE_URL`, direct `DIRECT_URL` for migrations). A unit test applies the migrations to PGlite and checks with `prisma migrate diff --exit-code` that they equal the schema exactly.

## D-063 — Accounts: sign-in, sign-out and deletion on a device
**Status:** Accepted (SPEC §5, §7.19). Better Auth 1.7 (email + password, scrypt, httpOnly cookies prefixed `noor`, built-in rate limits per IP; email verification is optional and off by default). Without `DATABASE_URL` the auth and sync routes answer 503 and the UI says accounts are unavailable — the rest of the app is unaffected.
- **Sign-up / sign-in:** the device's guest data is uploaded and merged into the account. If the device last synced with a *different* account, that account's local copy is removed first (it is already on the server).
- **Sign-out:** a final sync, then the data stays on the device by default; "also remove from this device" (shared devices) erases it.
- **Delete my account:** password + "I understand" confirmation; the server deletes the user and every row (cascade). The device's data then becomes guest data again (all live records re-queued, tombstones dropped) or is erased if the user ticks the box. Exports are offered: server export (`GET /api/account/export`, JSON of everything stored for the user) and a device export (works for guests too).
- **Password reset:** Better Auth tokens (one hour, single use) sent by Resend; without `RESEND_API_KEY` mails go to `.cache/mail-outbox.jsonl` in development and tests (production refuses unless `NOOR_DEV_MAIL_OUTBOX` is set). Auth pages are `noindex`.

## D-064 — Prayer location sync is opt-in
**Status:** Accepted (SPEC §5 "location privacy"). The place stays in local-only device storage. Settings → Account has "Sync the prayer-times location"; when on, the place is also stored in the synced preferences (`prayerPlace`) and that copy wins on every device; turning it off (or removing the place) clears it from the account.

---

## Phase 10 — Memorization, goals, statistics (2026-10-09)

## D-065 — Spaced repetition for memorization
**Status:** Accepted (SPEC §7.12). SM-2 with three grades: "Didn't know" = quality 1, "Hesitant" = 3, "Knew it" = 5. Successful reviews give intervals of 1 day, 6 days, then the previous interval × the ease before the review; ease changes by SM-2's formula, minimum 1.3; a failure resets the run and schedules the ayah for tomorrow. Due dates are local calendar days. **Reviewing before the due date** records the review but does not move the schedule (a failure still counts), so repeated practice cannot inflate progress. **Memorized** = 3 consecutive successful (due) reviews and an interval of at least 7 days — with these intervals that is the third successful review; a later failure removes the status. One record per ayah (unique surah + ayah, synced like the other natural-key tables, D-061). Progress: "Al-Mulk — memorized 12/30 ayahs (40%)", where 30 is the surah's ayah count.

## D-066 — Practice masks are display-only
**Status:** Accepted (SPEC §7.12, CLAUDE.md integrity rules). The ayah is split at its U+0020 spaces into tokens; joining them with single spaces gives back the stored text (unit test over all 6,236 ayahs and every mode). A token is a word when it contains a letter (`\p{L}`); tokens of pause/annotation marks only are never hidden or counted. "First letter" shows the first grapheme cluster (`Intl.Segmenter`). Hidden parts stay in the DOM as inline elements drawn transparent over a soft block (so Arabic letters keep joining across the boundary), are `aria-hidden`, and sit in a keyboard-operable "Reveal word n" control; the DOM text of the ayah always equals the source (e2e check in every mode). Modes: show all, hide all, first letter, every other word; the choice is a synced preference.

## D-067 — Goals and statistics definitions
**Status:** Accepted (SPEC §7.13).
- Goal: pages per day (presets 2/5/10/20, custom 1–604, or none), valid from the day it is set (one goal record per start date), so past days keep the goal they had. Week and month progress compare with the sum of the daily goals of the days so far.
- A day counts as read when at least one page was read (page tracking of SPEC §7.7). The streak counts consecutive read days up to today, or up to yesterday while today is still empty, so it never drops during a day; wording is never loss-framed and the streak can be hidden (synced preference).
- Weeks start on the locale's first day (CLDR via `Intl.Locale#getWeekInfo`: Saturday for Arabic, Sunday for English).
- Pages read = sum of pages per day (a page read on two days counts twice). A surah counts as completed when every Mushaf page it is on was read at least once (page-level tracking; ayah-level completion is not tracked). Reading time = sum of tracked seconds. Adhkar sessions completed = completed adhkar days per category.
- Charts: last 7 days (a labelled list of bars) and a 26-week heatmap (`role="img"` with a summary; levels relative to the goal, or 1–2/3–5/6–10/11+ pages without one). Statistics are computed on the device; there are no leaderboards.

---

## Phase 11 — PWA and offline (2026-10-09)

## D-068 — Hand-written service worker instead of Serwist
**Status:** Accepted by the agent — **owner confirmation requested** (D-017 proposed `@serwist/turbopack`). The needs are four caching rules and one page-driven download; Serwist on Turbopack adds a compile route (esbuild) and a precache manifest of every route's chunks. `src/sw/service-worker.js` (~250 lines, no dependencies) is served by the static route `/sw.js`, stamped with a per-build id (`NOOR_BUILD_ID`, set in next.config.ts), registered only in production builds when the page is idle.
- **Precache (install):** the shell pages in both languages (home, surah index, adhkar index, morning/evening adhkar, saved, search, memorization, settings, offline page), the JS/CSS/fonts they reference (found in their HTML and CSS), `/api/quran/nav`, the search index, morning/evening adhkar data, the manifest. Old shell caches are deleted on activation; the new worker takes over at once (`skipWaiting` + `clients.claim`).
- **Runtime:** navigations network-first (6 s timeout, then the cached copy), the last 60 pages kept; `/_next/static` cache-first; content APIs (surah chunks, tafsir, translations, cities…) stale-while-revalidate, last 250. Never cached: auth, sync, account, React Server Component payloads (offline they fail and Next.js does a full navigation, which the worker answers), other origins (audio CDN). Pages not available offline get `/offline` (or `/en/offline`).
- **"Download Quran text for offline"** (Settings): the 114 surah chunks *and* the 114 reading-mode pages of the current language, so every surah opens offline in the same server-rendered reader (no second renderer, DOM integrity unchanged). Measured on this build: about 4.5 MB to download, about 22 MB stored (the HTML pages are most of it). Progress, size, cancel, update and remove are shown; `navigator.storage.persist()` is requested. After an update the worker refreshes cached pages and the downloaded copy when online, then removes static files no cached page uses.
- The ayah menu fetches its surah's chunk, so saved ayahs show on the Saved page offline.
- Offline banner (exact SPEC text) and the account sync queue (outbox, flushed on `online`) cover the rest of SPEC §7.20.
- Tests run the real worker only in `offline.spec.ts` (`serviceWorkers: 'allow'`); other e2e files block it so each context does not precache. Offline = Chromium network emulation, not a real device.

---

## Phase 12 — Hardening and release (2026-10-09)

## D-069 — Security headers and the CSP
**Status:** Accepted, with one **owner decision** open. Production responses carry `Content-Security-Policy` (`default-src 'self'`; scripts, styles, fonts, workers and the manifest from this origin only; audio and connections also to `https://cdn.islamic.network`; `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, HSTS and a `Permissions-Policy` (geolocation and motion sensors for this origin only; camera, microphone, payment, USB, Bluetooth off). No `X-Powered-By`. An e2e test checks the headers and that key pages raise no CSP violation.
- **Not "strict" in Google's sense:** `script-src` includes `'unsafe-inline'`. Statically generated Next.js pages contain inline data scripts (and the theme boot script); a nonce-based CSP requires rendering every page per request, which conflicts with SPEC §9 (statically generated surah pages) and would slow every page. Options for the owner: (a) keep this CSP (recommended — no third-party scripts are allowed at all), (b) nonces with dynamic rendering, (c) wait for hash support for static pages in Next.js.
- CSRF: Better Auth's own checks for `/api/auth/*`; `/api/sync` requires a same-origin `Origin` header. Rate limits: Better Auth per IP (sign-in/up 3 per 10 s), sync 60/min per user.

## D-070 — Performance measurements and fonts
**Status:** Measured; **owner decision** on fonts. Lighthouse 12, mobile preset (simulated slow 4G, 4× CPU), production build on this machine:

| Page | Performance | Accessibility | Best practices | SEO | LCP |
|---|---|---|---|---|---|
| `/` | 94 | 100 | 100 | 100 | 2.9 s |
| `/quran/al-baqara` | 89 | 100 | 100 | 100 | 3.3 s |
| `/quran/al-faatiha` | 92 | 100 | 100 | 100 | 3.0 s |
| `/en/quran/yaseen` | 90 | 100 | 100 | 100 | 3.5 s |
| `/quran/al-baqara/255` | 90 | 100 | 100 | 100 | 3.3 s |
| `/adhkar/morning` | 85 | 100 | 100 | 100 | 3.8 s |
| `/mushaf/page/50` | 89 | 100 | 100 | 100 | 3.1 s |
| `/prayer` | 92 | 100 | 100 | 100 | 3.1 s |

Repeated runs vary by a few points (the rows for `/`, `/en/quran/yaseen` and `/adhkar/morning` were re-measured after the last changes; an earlier run of `/` gave 87, of `/adhkar/morning` 80). SEO on `/en/...` pages was 92 until the English "More" link text was renamed "Menu".
Reader route JS 147.7 KiB gzipped (budget 150), Al-Baqarah scrolling without long tasks under 4× CPU throttling. TBT 50–220 ms, CLS ≤ 0.044.
- **Targets not met in this lab setting:** Performance ≥ 90 on every page and LCP < 2.5 s. The largest remaining cost is font bytes on the critical path (UI font 2 × ~75 KB, Amiri Quran 63 KB, Scheherazade New 126 KB on adhkar pages). Changes made: the UI font is no longer preloaded (size-adjusted fallback, then swap), the service worker registers after `load` + idle. Further options need the owner: subsetting IBM Plex Sans Arabic and Scheherazade New (OFL Reserved Font Names → the subset must be renamed), showing adhkar text in the already-loaded Amiri instead of Scheherazade (D-055 typography), or `font-display: optional` (first visits may show the system font). Real mid-range Android over 4G was not measured.

## D-071 — SEO implementation
**Status:** Accepted (SPEC §9).
- Every page: canonical URL, hreflang `ar` / `en` / `x-default`, Open Graph and Twitter card from one helper (`src/lib/seo.ts`). The site URL comes from `NEXT_PUBLIC_SITE_URL`, else Vercel's production domain.
- Ayah pages `/quran/{slug}/{n}` are real pages now (on-demand, cached; no build-time params): the ayah verbatim in `[data-ayah-text]`, page/juz, Tafsir al-Muyassar with name, author and source, previous/next ayah, links to the surah and the Mushaf page, `BreadcrumbList` JSON-LD. Share links (D-045) land here.
- `/quran/2`, `/quran/2/255`, Arabic-Indic digits and zero-padded ayahs redirect (308) in the proxy before rendering — the page-level redirect of on-demand pages sent the `Location` header twice.
- `sitemap.xml`: main pages, 114 surahs, 30 juz, adhkar categories that have content — Arabic and English with alternates (ayah and Mushaf pages are reachable by links; listing 12,472 ayah URLs is left to the owner). `robots.txt` disallows only `/api/`.
- `noindex`: saved, stats, settings, memorize, auth, offline, the menu page, empty adhkar categories; search is `noindex, follow`.
- JSON-LD: `WebSite` + `SearchAction` (`/search?q=`) on the home page, `BreadcrumbList` on surah and ayah pages.
- Open Graph images with `next/og`: a default image and one per surah (Arabic name, transliteration, meaning, revelation, ayah count). Satori joins Arabic letters correctly but lays words out left to right, so Arabic lines are drawn word by word in a reversed row; only UI strings and surah names are drawn, never Quran text.

## D-072 — Privacy page, reflow and wording
**Status:** Accepted. `/privacy` (Arabic and English, linked from About and the menu) explains in plain language what is stored on the device, what an account stores and syncs, location handling, outside services (audio CDN, Resend, Vercel, Neon) and the user's controls. No contact address is given yet (owner decision). Accessibility additions: no horizontal scrolling at 320 px and at 200 % text size on 20 key pages (e2e), long words wrap, form fields shrink, the bottom navigation and reader toolbar wrap. The English bottom-bar label "More" is now "Menu".
