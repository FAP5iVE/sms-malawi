import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir:        './e2e',
  fullyParallel:  true,
  forbidOnly:     !!process.env.CI,
  retries:        process.env.CI ? 2 : 0,
  workers:        process.env.CI ? 2 : undefined,
  timeout:        30_000,
  expect:         { timeout: 8_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],

  use: {
    baseURL:            BASE_URL,
    trace:              'on-first-retry',
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    actionTimeout:      8_000,
    navigationTimeout:  15_000,
  },

  projects: [
    // ── Desktop ──────────────────────────────────────────────────────────────
    {
      name:  'chromium-desktop',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'firefox-desktop',
      use:   { ...devices['Desktop Firefox'] },
    },
    // ── Mobile ───────────────────────────────────────────────────────────────
    {
      name:  'mobile-chrome',
      use:   { ...devices['Pixel 5'] },
    },
    {
      name:  'mobile-safari',
      use:   { ...devices['iPhone 13'] },
    },
  ],

  // Start local dev server when running locally (not in CI)
  webServer: process.env.CI ? undefined : {
    command:           'pnpm --filter web dev',
    url:               'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout:           60_000,
    stdout:            'ignore',
    stderr:            'pipe',
  },
})