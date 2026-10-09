import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 5434);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // The service worker precaches the app shell in every new context; only the offline tests
    // (offline.spec.ts) need it, so it is blocked elsewhere to keep the suite fast and isolated.
    serviceWorkers: 'block',
  },
  // All tests run at 390×844 and 1440×900; the SPEC §15 journey also at 820×1180 and 412×915.
  projects: [
    {
      name: 'mobile-390x844',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop-1440x900',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // SPEC §15: the user journey also runs at a tablet and a large-phone size.
    {
      name: 'journey-820x1180',
      testMatch: /journey\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'journey-412x915',
      testMatch: /journey\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
    {
      // Frame timing needs an otherwise idle machine: runs after the other projects.
      name: 'perf-mobile-390x844',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['mobile-390x844', 'desktop-1440x900', 'journey-820x1180', 'journey-412x915'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  // Tests run against a production build with accounts enabled: a throw-away PGlite database
  // (scripts/dev-db.ts, no Docker) and account emails written to .cache/mail-outbox.jsonl.
  // Works in PowerShell, cmd and bash.
  webServer: [
    {
      command: `node scripts/dev-db.ts --memory --port ${DB_PORT}`,
      port: DB_PORT,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !isCI,
      timeout: 300_000,
      env: {
        DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`,
        BETTER_AUTH_SECRET: 'noor-e2e-only-secret-never-used-in-production',
        BETTER_AUTH_URL: `http://localhost:${PORT}`,
        DATABASE_POOL_MAX: '1',
        NOOR_DEV_MAIL_OUTBOX: '1',
      },
    },
  ],
});
