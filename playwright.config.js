const { defineConfig } = require('@playwright/test');

// Electron specs (tests/app.spec.js) launch their own Electron process via _electron.launch()
// and never touch the `page`/`browser` fixtures, so they don't need a browser project at all.
// tests/character-sprites.spec.js does use `page` to load a static harness page in a real
// Chromium tab (Playwright's pre-installed browser, not Electron's).
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  reporter: 'list',
  use: {
    launchOptions: {
      // running as root in CI/sandboxed containers requires this for Chromium/Electron
      args: ['--no-sandbox'],
      // Use whatever Chromium build is actually on disk instead of the exact revision this
      // Playwright version expects — avoids requiring a browser download in sandboxed/offline
      // environments. Harmless to drop once CI always runs `npx playwright install`.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
});
