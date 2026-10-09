# Noor (نور)

A Quran-first web app: a digital Mushaf, a daily adhkar companion, a reading tracker, a memorization assistant and prayer utilities. Arabic-first, mobile-first, calm. Works fully without an account and offline.

- Specification: [docs/SPEC.md](docs/SPEC.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md) · Content sources: [docs/SOURCES.md](docs/SOURCES.md)
- Project rules (including the religious-content integrity rules): [CLAUDE.md](CLAUDE.md)

**Status: all SPEC phases (0–12) built.** Reader (reading and Mushaf modes), ayah pages, search and command palette, Tafsir al-Muyassar, audio, morning/evening adhkar, tasbih, prayer times, Qibla, Hijri calendar, saved items and notes, memorization, goals and statistics, optional accounts with sync, PWA and offline. Not yet deployed with a database; open owner decisions are listed in [docs/DECISIONS.md](docs/DECISIONS.md).

## 1. Setup

Requirements: Node.js **22.18+** (TypeScript scripts run directly with `node`; developed on Node 26, CI uses Node 24) and npm. **No Docker.** Git with LF line endings for `data/sources/` and `content/` (enforced by `.gitattributes`).

Windows (PowerShell):

```powershell
npm ci
Copy-Item .env.example .env.local   # optional: only needed for accounts/sync
npm run dev
```

macOS / Linux (bash, zsh):

```bash
npm ci
cp .env.example .env.local   # optional
npm run dev
```

Open <http://localhost:3000> (Arabic, RTL) and <http://localhost:3000/en> (English, LTR). `npm ci` also generates the Prisma client (`postinstall`).

## 2. Environment variables

All optional — see [`.env.example`](.env.example) for comments. Without a database, accounts and sync are off and everything else works.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public base URL for canonical URLs, sitemap, Open Graph (on Vercel the production domain is used when unset) |
| `DATABASE_URL` | PostgreSQL for user data (Neon: the **pooled** URL) |
| `DIRECT_URL` | Direct (non-pooled) URL for migrations; falls back to `DATABASE_URL` |
| `DATABASE_POOL_MAX` | Set to `1` with the local PGlite database only |
| `BETTER_AUTH_SECRET` | Long random secret for sessions: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `BETTER_AUTH_URL` | The site URL as seen by the browser (e.g. `https://noor.example`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Password-reset emails through Resend; without a key, development writes them to `.cache/mail-outbox.jsonl` |

Secrets live only in environment variables; nothing secret is shipped to the browser.

## 3. Database setup

PostgreSQL holds **user data only** (SPEC §5); Quran content is static JSON. Schema: [`prisma/schema.prisma`](prisma/schema.prisma); migrations: [`prisma/migrations/`](prisma/migrations/).

- **Local, no Docker:** `npm run db:dev` in a second terminal starts [PGlite](https://pglite.dev) (Postgres in WebAssembly) on port 5433, data in `.cache/pglite-dev`, and applies the migrations. Then in `.env.local`:
  ```
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable"
  DATABASE_POOL_MAX="1"
  BETTER_AUTH_SECRET="<a long random string>"
  BETTER_AUTH_URL="http://localhost:3000"
  ```
- **Production:** Neon (see [Deployment](#9-deployment-vercel--neon)).
- A local PostgreSQL install also works: point `DATABASE_URL` at it and run `npm run db:migrate`.

## 4. Quran and content data

`content/` is generated from the approved, hash-locked files in `data/sources/` (`SOURCES.lock.json`) and committed byte-exact. Nothing is typed by hand (CLAUDE.md).

| Command | What it does |
|---|---|
| `npm run sources:fetch` | Re-download the content sources and rewrite `data/sources/SOURCES.lock.json` (`--only <id>` for one source) |
| `npm run sources:check` | Sanity checks on the downloaded sources |
| `npm run content:import` | Quran text, structure and search index → `content/quran`, `content/search` (SHA-256 checked first; stops on surprises) |
| `node scripts/import-tafsir.ts` | Tafsir al-Muyassar → `content/tafsir` |
| `node scripts/import-adhkar.ts` | Morning/evening adhkar → `content/adhkar` |
| `node scripts/import-audio.ts` | Reciter list → `content/audio` |
| `node scripts/import-cities.ts` | GeoNames cities → `content/cities` |
| `node scripts/import-translation.ts` | Translations (refuses unless a source is approved; none is yet) |
| `npm run content:verify` | Integrity checks (SPEC §2.6): 114 surahs, 6,236 ayahs, exact code points, hashes, Basmala, structure, notices, tafsir and adhkar checks |
| `node scripts/build-fonts.ts` | Quran web font (Amiri Quran WOFF2) from the approved TTF; `--check` in CI |
| `node scripts/build-icons.ts` | PWA icons from `src/app/icon.svg`; `--check` in CI |

Some candidate datasets with unclear licenses are kept local only (git-ignored); re-download them with `npm run sources:fetch -- --only <id>`.

## 5. Migrations

| Command | When |
|---|---|
| `npm run db:migrate` | Apply committed migrations (`prisma migrate deploy`) — production and local databases |
| `npm run db:migrate:dev` | Create a new migration while changing the schema (development database) |
| `npm run db:validate` | Validate the schema |
| `npm run db:generate` | Regenerate the Prisma client |

`npm test` checks that the committed migrations produce exactly the schema (`prisma migrate diff --exit-code` against PGlite).

## 6. Seed data

There is no seed: user data is created by using the app, and content comes from `content/`. For a local account, start `npm run db:dev`, run the app and sign up at `/auth/sign-up`.

## 7. Development

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) on port 3000 — no service worker, no CSP |
| `npm run db:dev` | Local database (optional) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route types + `tsc --noEmit` (strict) |

## 8. Production build

```powershell
npm run build
npm run start            # http://localhost:3000
```

The build prerenders the 114 surahs, 604 Mushaf pages, 30 juz and adhkar pages in both languages; ayah pages (`/quran/{slug}/{n}`) render on demand and are cached. The service worker, the CSP and the other security headers are active in production builds only.

## 9. Deployment (Vercel + Neon)

1. **Neon:** create a project (region close to the Vercel region). Copy the **pooled** connection string and the **direct** one.
2. **Vercel:** import the GitHub repository (framework: Next.js; the `vercel-build` script runs automatically).
3. **Environment variables** (Production, and Preview if wanted): `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`https://<your-domain>`), `NEXT_PUBLIC_SITE_URL` (`https://<your-domain>`), `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend).
4. **Deploy.** `vercel-build` applies the migrations when a database is configured, then builds. Without database variables the site deploys with accounts switched off.
5. **Check:** `/`, `/quran/al-baqara`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, sign-up and password reset, Settings → Offline.

## 10. Testing

| Command | What it covers |
|---|---|
| `npm test` | Unit tests (Vitest): normalization and search, references, structure lookups, SRS, statistics, sync merge rules and full sync against Postgres (PGlite), prayer times vs an official timetable, counters, masks over all 6,236 ayahs, migrations |
| `npm run content:verify` | Content integrity (blocks CI) |
| `npm run test:e2e` | Playwright + axe on the production build with a throw-away database: all pages at 390×844 and 1440×900; the SPEC §15 journey also at 820×1180 and 412×915 (Arabic + light, English + dark); offline with the real service worker; accounts, sync, export, delete, password reset; SEO and security headers; WCAG A/AA in four themes; reflow at 320 px and 200 % text; reader JS budget; Al-Baqarah scrolling under 4× CPU throttling |

First time: `npx playwright install chromium`. Report: `npx playwright show-report`. Viewport emulation is not a real device; the manual checklist (compass, vibration, background audio, install to home screen, iOS storage) is in SPEC §15.

## 11. Project structure

```
src/app/[locale]/        pages (Arabic at /, English at /en): reader, mushaf, juz, ayah pages, adhkar, tasbih,
                         prayer, qibla, calendar, saved, search, memorize, stats, settings, auth, about, privacy, offline
src/app/api/             static content routes, auth (Better Auth), sync, account export
src/app/sw.js/           the service worker route (source: src/sw/service-worker.js)
src/app/sitemap.ts, robots.ts, manifest.ts, opengraph-image.tsx
src/components/          UI by feature (reader, saved, search, audio, adhkar, prayer, memorize, stats, account, pwa…)
src/lib/                 domain logic: quran, store (Dexie, merge rules), sync, prayer, hijri, memorize (SRS, masks),
                         stats, seo, auth/server helpers
src/proxy.ts             locale routing and canonical Quran URL redirects
messages/                ar.json, en.json — every UI string
content/                 generated content (committed, byte-exact)
data/sources/            raw sources + SOURCES.lock.json (approvals, hashes); data/curated/ reviewed hand-made data
prisma/                  schema + migrations (user data only)
scripts/                 import, verify, sources, fonts, icons, dev database
tests/unit, tests/e2e    Vitest, Playwright + axe
docs/                    SPEC, DECISIONS, SOURCES
```

## 12. External services

| Service | Used for | When |
|---|---|---|
| Vercel | Hosting | Always (deployment) |
| Neon (PostgreSQL) | Accounts and sync | Only if configured |
| Resend | Password-reset emails | Only if configured |
| Islamic Network CDN (`cdn.islamic.network`) | Streaming verse-by-verse recitations | When the user plays audio |

No analytics, trackers or ads. Fonts and content are self-hosted. See the privacy page (`/privacy`).

## 13. Sources and licenses

Every file below is recorded in [`data/sources/SOURCES.lock.json`](data/sources/SOURCES.lock.json) with URL, date, options, license and SHA-256; details and attribution texts in [docs/SOURCES.md](docs/SOURCES.md). Shown in the app on the About page.

| Content | Source | License / terms | Lock id |
|---|---|---|---|
| Quran text (Uthmani; Simple Clean for search only) | Tanzil Project, tanzil.net, v1.1 | Tanzil terms: verbatim copies with attribution, no changes | `tanzil-quran-text` |
| Quran structure (pages, juz, hizb, sajdah, names) | Tanzil `quran-data.xml` | CC BY | `tanzil-quran-data` |
| Quran fonts | Amiri Quran 1.003; Scheherazade New 4.500 | SIL OFL 1.1 | `font-amiri-quran`, `font-scheherazade-new` |
| UI font | IBM Plex Sans Arabic 1.1.0 (unmodified WOFF2) | SIL OFL 1.1 | `font-ibm-plex-sans-arabic` |
| Tafsir | Tafsir al-Muyassar, QuranEnc distribution | QuranEnc re-publishing terms | `quranenc-tafsir-muyassar` |
| Audio | Islamic Network CDN (alquran.cloud), verse by verse | Al Quran Cloud terms (streaming) | `audio-islamic-network` |
| Adhkar (morning, evening) | Seen-Arabic, Morning-And-Evening-Adhkar-DB | MIT (compilation) | `adhkar-seen-arabic` |
| Cities | GeoNames cities15000, country info, admin1 codes | CC BY 4.0 | `geonames-cities15000` |
| Translations | none imported yet (owner decision D-020) | — | — |

## Notes

- **Locales.** The URL alone decides the language (no `Accept-Language` redirect, no locale cookie), so links are stable.
- **Themes.** Light, Dark, Sepia, Black (OLED) and Automatic; tokens in `src/app/globals.css`, applied before first paint.
- **Offline.** A hand-written service worker (D-068) precaches the app shell; Settings → Offline downloads the Quran text. Pending sync changes are queued and sent on reconnect.
- **`@swc/core` native cache (Windows).** `tooling/swc-native-cache.ts` keeps the cache in `.cache/swc` unless `SWC_NATIVE_BINDING_CACHE` is set (the default folder's permissions are rejected on the development machine).
- **Line endings.** `.gitattributes` keeps `data/sources/` and `content/` byte-exact, because their SHA-256 values are verified.
- **Font comparison page (Phase 0).** `node scripts/sources/serve.mjs` → <http://localhost:4173/font-test/>.
