import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000, // Line2 + 122 attractors is slow in headless Chromium WebGL
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4365',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node scripts/serve.js docs 4365',
    url: 'http://localhost:4365',
    reuseExistingServer: false,
    timeout: 10000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
