import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  timeout: 60000, // 60s timeout for PIN entry on Yubikey
  expect: {
    timeout: 10000,
  },
  fullyParallel: false, // Run tests sequentially - extension needs single context
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker for extension tests
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    actionTimeout: 10000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Chrome extension tests need special handling - we use launchPersistentContext in tests
  projects: [
    {
      name: 'chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Extensions don't work in headless mode
        headless: false,
      },
    },
  ],
});
