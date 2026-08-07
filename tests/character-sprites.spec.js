const { test, expect } = require('@playwright/test');
const path = require('path');

// Loads every character sprite module (renderer/*.js) in a real browser tab via
// character-base.js + a static harness page, exercising every setter each character exposes.
// Regression test for the character-base.js refactor: every character must still mount, accept
// every state-setter call without throwing, and paint a non-trivial number of pixels.
test('every character sprite mounts and renders without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));

  const fixturePath = path.join(__dirname, 'fixtures', 'character-sprite-harness.html');
  await page.goto('file://' + fixturePath);

  const results = await page.evaluate(() => window.__TEST_RESULTS__);

  expect(errors).toEqual([]);
  expect(Object.keys(results).sort()).toEqual(
    ['avocado', 'bee', 'citrus', 'crab', 'croissant', 'kaktus', 'monkey', 'pilz', 'toast', 'wolke']
  );
  for (const [name, result] of Object.entries(results)) {
    expect(result.ok, `${name}: ${result.error}`).toBe(true);
    expect(result.paintedPixels, `${name} painted no pixels`).toBeGreaterThan(50);
  }
});
