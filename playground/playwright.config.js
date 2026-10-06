import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

const withoutKeys = (env, keys) => Object.fromEntries(Object.entries(env).filter(([k]) => !keys.includes(k)));

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // Snap-packaged VS Code sets GIO_MODULE_DIR, which crashes WebKit.
        launchOptions: { env: withoutKeys(process.env, ['GIO_MODULE_DIR']) },
      },
    },
  ],
  // Serve the repository root, as GitHub Pages does.
  webServer: {
    command: `yarn http-server .. -p ${PORT} -c-1 --silent`,
    url: `http://localhost:${PORT}/playground/`,
    reuseExistingServer: !process.env.CI,
  },
});
