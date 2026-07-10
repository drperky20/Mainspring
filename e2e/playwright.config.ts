import { defineConfig, devices } from '@playwright/test'

const consoleUrl = process.env.MAINSPRING_E2E_CONSOLE_URL ?? 'http://127.0.0.1:5173'
const gatewayUrl = process.env.MAINSPRING_E2E_GATEWAY_URL ?? 'http://127.0.0.1:8787'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: process.env.MAINSPRING_E2E_ARTIFACTS_DIR ?? 'test-results',
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: consoleUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  metadata: { gatewayUrl },
})
