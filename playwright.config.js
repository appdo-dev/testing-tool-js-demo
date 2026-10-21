const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 30_000,
  testDir: './examples/single/playwright/test',
  testMatch: /.*\.spec\.js/,
  use: {
    baseURL: 'https://www.saucedemo.com',
    screenshot: 'off',
    video: 'off',
  },
  reporter: [
    ['list'],
    [
      '@ai-testing-tool/forge-playwright',
      {
        // Defaults to mode=off (no credentials). Override with AI_TESTING_TOOL_MODE.
        // mode: 'off' | 'file' | 'ingest',
        // projectKey: 'AUTH',
      },
    ],
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
