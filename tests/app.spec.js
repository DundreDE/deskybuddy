const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_ROOT = path.join(__dirname, '..');

let electronApp;
let userDataDir;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// saveSettingsToDisk()/saveStateToDisk() write asynchronously and non-atomically, so a poll can
// catch the file mid-write (empty or truncated) — swallow parse errors and keep polling instead
// of letting expect.poll abort on the first throw.
function tryReadJsonField(file, field) {
  try {
    return readJson(file)[field];
  } catch {
    return undefined;
  }
}

test.beforeEach(async () => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskybuddy-test-'));
  // Skip the first-launch onboarding tour — it isn't what any of these tests exercise, and
  // leaving it on would race the tour's overlay against our canvas clicks/assertions.
  fs.writeFileSync(path.join(userDataDir, 'buddy-settings.json'), JSON.stringify({ onboardingCompleted: true }));

  electronApp = await electron.launch({
    args: [APP_ROOT, '--no-sandbox'],
    env: { ...process.env, BUDDY_USER_DATA_DIR: userDataDir },
  });
});

test.afterEach(async () => {
  await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('petting the sprite increases happiness and persists to buddy-state.json', async () => {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const before = await window.evaluate(() => window.buddyAPI.loadState());
  await window.evaluate(() => window.buddyAPI.reportStatEvent('pet'));

  const expectedHappiness = Math.min(100, before.happiness + 5);
  await expect
    .poll(() => window.evaluate(() => window.buddyAPI.loadState()).then((s) => s.happiness))
    .toBe(expectedHappiness);

  const stateFile = path.join(userDataDir, 'buddy-state.json');
  await expect.poll(() => tryReadJsonField(stateFile, 'happiness')).toBe(expectedHappiness);
  expect(tryReadJsonField(stateFile, 'lastPetted')).not.toBeNull();
});

test('a settings change persists to buddy-settings.json', async () => {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('save-settings', {}, { settings: { mouseLook: false } });
  });

  const settingsFile = path.join(userDataDir, 'buddy-settings.json');
  await expect.poll(() => tryReadJsonField(settingsFile, 'mouseLook')).toBe(false);
});

test('switching character persists and remounts the new sprite', async () => {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // default character is 'crab' (GRID_W=24); avocado's GRID_W is 22 — a different canvas
  // width is enough to prove the new sprite module actually mounted, not just that settings
  // changed on disk.
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('save-settings', {}, { settings: { character: 'avocado' } });
  });

  const settingsFile = path.join(userDataDir, 'buddy-settings.json');
  await expect.poll(() => tryReadJsonField(settingsFile, 'character')).toBe('avocado');

  await expect
    .poll(() => window.evaluate(() => document.querySelector('#dragon-mount canvas')?.width ?? null))
    .toBe(22);
});

test('dragging the sprite past the threshold enters the DRAGGING state', async () => {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  const canvas = window.locator('#dragon-canvas');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(startX, startY + 20, { steps: 5 });

  await expect(window.locator('#stage')).toHaveClass(/state-dragging/);

  await window.mouse.up();
});
