# Noor (نور)

A Quran-first web app: a digital Mushaf, a daily adhkar companion, a reading tracker, a memorization assistant and prayer utilities. Arabic-first, mobile-first, calm.

- Specification: [docs/SPEC.md](docs/SPEC.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) · Content sources: [docs/SOURCES.md](docs/SOURCES.md)
- Project rules (including the religious-content integrity rules): [CLAUDE.md](CLAUDE.md)

**Status: Phase 3 — Quran reader.** Surah index (filter; Surah / Juz / Hizb / Page), reading mode, Mushaf mode (Madani page boundaries; line layout approximate), jumps, keyboard navigation, reading settings. Other sections are still placeholders. No translation, tafsir or adhkar content yet.

## Requirements

- Node.js **22.18+** (TypeScript scripts run directly with `node`; developed on Node 26 on Windows 11; CI uses Node 24) and npm.
- Windows (PowerShell), macOS or Linux. **No Docker** and **no database** are needed for Phase 1.

## Getting started (PowerShell)

```powershell
npm ci
Copy-Item .env.example .env.local   # optional in Phase 1; needed once accounts/sync exist
npm run dev
```

Open <http://localhost:3000> (Arabic, RTL) and <http://localhost:3000/en> (English, LTR).

The same commands work in bash/zsh (`cp .env.example .env.local` instead of `Copy-Item`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build (after `build`) |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck` | Generate Next.js route types, then `tsc --noEmit` (strict) |
| `npm test` | Unit tests (Vitest), including the database-migration check |
| `npm run test:e2e` | End-to-end + accessibility tests (Playwright + axe) at 390×844 and 1440×900; builds and starts the app on port 3100 |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:migrate:dev` | Create/apply migrations against your development database |
| `npm run db:migrate` | Apply committed migrations (deployments) |
| `npm run sources:fetch` | Re-download the candidate content sources and rewrite `data/sources/SOURCES.lock.json` |
| `npm run sources:check` | Sanity checks on the downloaded sources |
| `npm run content:import` | Regenerate `content/` from the **approved** source files (SHA-256 checked first) |
| `npm run content:verify` | Quran content integrity checks (SPEC §2.6): counts, exact text, hash, Basmala, structure, notice, search index |
| `node scripts/build-fonts.ts` | Rebuild the Quran web font (Amiri Quran WOFF2) from the approved TTF; `--check` verifies it (CI) |

First-time setup for the end-to-end tests (downloads Chromium once):

```powershell
npx playwright install chromium
```

To view a single report after a run: `npx playwright show-report`.

## Database

PostgreSQL holds **user data only** (SPEC §5); Quran content is static JSON. The schema is in [`prisma/schema.prisma`](prisma/schema.prisma) and the initial migration in [`prisma/migrations/`](prisma/migrations/).

- Phase 1 needs no database. `npm test` applies the migrations to [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly, in-process) and checks that the committed migration matches the schema, so this works on Windows and in CI without a server.
- When a real database is needed: create a Neon project (or a Neon dev branch), put the pooled URL in `DATABASE_URL` and the direct URL in `DIRECT_URL` in `.env.local`, then run `npm run db:migrate`. A local PostgreSQL install or `npx prisma dev` also work.
- The Prisma client is generated into `src/generated/prisma` (git-ignored) when the app starts using it (Phase 4/9).

## Project structure

```
src/app/[locale]/       routes (ar at /, en at /en) — placeholder pages for now
src/components/shell/   app shell: side navigation (desktop), bottom bar (mobile)
src/components/reader/  Quran reader: server-rendered QuranFlow, client ReaderShell (toolbar, keys, swipe, settings, jump)
src/components/quran/   surah index
assets/fonts/           web fonts built from approved sources (+ fonts.lock.json)
data/curated/           hand-curated data (surah URL slugs)
src/components/theme/   theme picker + system-theme sync
src/i18n/               next-intl routing, navigation and request config
src/lib/                fonts, theme helpers
src/proxy.ts            locale routing (Next.js 16 "proxy", formerly middleware)
messages/               ar.json, en.json — all UI strings
prisma/                 schema + migrations (user data only)
tests/unit/             Vitest
tests/e2e/              Playwright + axe
data/sources/           raw content sources + SOURCES.lock.json (with owner approvals)
content/                generated Quran content (committed, byte-exact): quran/meta.json, quran/surah/{1..114}.json, search/index.json
src/lib/quran/          typed accessors (getSurah, getPage, getJuz, getHizbQuarter, getAyah), reference parsing, search normalization
scripts/import-quran.ts, scripts/verify-content.ts, scripts/quran/   the content pipeline
scripts/sources/        source download/check scripts and the font test page
tooling/                build-tool workarounds (see below)
docs/                   SPEC, DECISIONS, SOURCES
```

## Notes

- **Locales.** Arabic is the default at `/`, English at `/en/...`. The URL alone decides the language (no `Accept-Language` redirect, no locale cookie), so links are stable.
- **Themes.** Light, Dark, Sepia and Black (OLED), plus "Automatic" (follows the device). Tokens are CSS variables in `src/app/globals.css`; an inline script applies the stored choice before first paint.
- **Fonts.** UI font: IBM Plex Sans Arabic, IBM's own unmodified WOFF2 files, self-hosted via `next/font/local` from `data/sources/`. The Quran font is not chosen yet (DECISIONS D-011).
- **`@swc/core` native cache (Windows).** The next-intl plugin loads `@swc/core`, which refuses its default cache folder under `%LOCALAPPDATA%\swc` if that folder's permissions let another principal replace files (the case on the development machine). `tooling/swc-native-cache.ts` therefore keeps the cache in `.cache/swc` inside the project unless `SWC_NATIVE_BINDING_CACHE` is set.
- **Line endings.** `.gitattributes` keeps `data/sources/` and `content/` byte-exact (no CRLF conversion), because their SHA-256 values are recorded and verified.
- **Font comparison page (Phase 0).** `node scripts/sources/serve.mjs` → <http://localhost:4173/font-test/>.
