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

test('settings window renders translated text and updates live on language change', async () => {
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('open-settings');
  });
  const settingsWindow = await electronApp.waitForEvent('window', (w) => w.url().includes('settings.html'));
  await settingsWindow.waitForLoadState('domcontentloaded');

  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('save-settings', {}, { settings: { language: 'de' } });
  });
  await expect(settingsWindow.locator('h1')).toHaveText('DeskyBuddy – Einstellungen');

  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('save-settings', {}, { settings: { language: 'en' } });
  });
  await expect(settingsWindow.locator('h1')).toHaveText('DeskyBuddy – Settings');
  await expect(settingsWindow.locator('#characterName')).toHaveText('Crab');
});

test('stats decay reduces happiness/fullness after the grace period and persists', async () => {
  await electronApp.close();

  // Seed non-default stats with a lastPetted/lastFed already outside a 50ms grace window, so
  // the very first fast decay tick (interval also sped up to 50ms) immediately applies.
  fs.writeFileSync(
    path.join(userDataDir, 'buddy-state.json'),
    JSON.stringify({ happiness: 80, fullness: 80, lastPetted: Date.now() - 1000, lastFed: Date.now() - 1000 })
  );

  electronApp = await electron.launch({
    args: [APP_ROOT, '--no-sandbox'],
    env: {
      ...process.env,
      BUDDY_USER_DATA_DIR: userDataDir,
      BUDDY_STATS_DECAY_GRACE_MS: '50',
      BUDDY_STATS_DECAY_INTERVAL_MS: '100',
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  await expect
    .poll(() => window.evaluate(() => window.buddyAPI.loadState()).then((s) => s.happiness), { timeout: 5000 })
    .toBeLessThan(80);

  const stateFile = path.join(userDataDir, 'buddy-state.json');
  await expect.poll(() => tryReadJsonField(stateFile, 'happiness')).toBeLessThan(80);
  await expect.poll(() => tryReadJsonField(stateFile, 'fullness')).toBeLessThan(80);
});

test('stats decay stays off when the statsDecay setting is disabled', async () => {
  await electronApp.close();

  fs.writeFileSync(
    path.join(userDataDir, 'buddy-state.json'),
    JSON.stringify({ happiness: 80, fullness: 80, lastPetted: Date.now() - 1000, lastFed: Date.now() - 1000 })
  );
  fs.writeFileSync(path.join(userDataDir, 'buddy-settings.json'), JSON.stringify({ onboardingCompleted: true, statsDecay: false }));

  electronApp = await electron.launch({
    args: [APP_ROOT, '--no-sandbox'],
    env: {
      ...process.env,
      BUDDY_USER_DATA_DIR: userDataDir,
      BUDDY_STATS_DECAY_GRACE_MS: '50',
      BUDDY_STATS_DECAY_INTERVAL_MS: '100',
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Give the (disabled) decay timer several chances to fire, then confirm nothing moved.
  await window.waitForTimeout(600);
  const happiness = await window.evaluate(() => window.buddyAPI.loadState()).then((s) => s.happiness);
  expect(happiness).toBe(80);
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
