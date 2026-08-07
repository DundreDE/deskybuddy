const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// uiohook-napi / active-win are native modules — wrap the require so a failed/ABI-mismatched
// native binary degrades the relevant feature instead of crashing the whole app.
let uIOhook = null;
try {
  ({ uIOhook } = require('uiohook-napi'));
} catch (err) {
  console.error('Buddy: uiohook-napi failed to load, typing detection disabled', err);
}
let activeWin = null;
try {
  activeWin = require('active-win');
} catch (err) {
  console.error('Buddy: active-win failed to load, fullscreen detection disabled', err);
}

// A stable, unique AppUserModelID. Without this, Windows registers the login-item entry
// under the generic name of whatever electron.exe is running us (shows up as "Electron" in
// Windows Settings > Apps > Startup, and — worse — collides with the *same* registry value
// used by any other unpackaged Electron app on this machine that also didn't set one, so
// whichever one calls setLoginItemSettings last silently overwrites the other's autostart).
app.setAppUserModelId('com.deskybuddy.app');

const GITHUB_REPO = 'DundreDE/deskybuddy'; // used by the startup update check against GitHub Releases

const WINDOW_WIDTH = 200; // wider than the sprite so speech bubbles have room to pop up off to a side
const WINDOW_HEIGHT = 200; // sprite area + speech-bubble headroom
const FOOT_OVERLAP = 20; // px the dangling feet sink into the taskbar so buddy looks like it's sitting on the edge

const TICK_MS = 16;
const ROAM_MIN_PAUSE_MS = 15000;
const ROAM_MAX_PAUSE_MS = 45000;
const WALK_SPEED_DAY = 55; // px/s
const WALK_SPEED_NIGHT = 33; // px/s
const FALL_DURATION_MS = 500;
const REALIGN_INTERVAL_MS = 120000; // periodic setAlwaysOnTop self-heal

const VELOCITY_SAMPLE_WINDOW_MS = 120; // how far back we look at drag samples to estimate throw velocity
const THROW_MIN_SPEED = 250; // px/s — releases slower than this just drop straight down (fallToTaskbar)
const MAX_THROW_SPEED = 1100; // px/s per axis — clamp so a laggy tick spike can't fling buddy off-screen
const THROW_VELOCITY_SCALE = 0.35; // flicks feel much faster than they should visually translate to — tone them down
const GRAVITY = 4200; // px/s^2 — high gravity keeps the arc short and snappy instead of a long floaty sail
const WALL_BOUNCE_DAMPING = 0.45; // velocity retained (and reversed) after bouncing off a screen edge

const CURSOR_POLL_MS = 120;
const TYPING_EVAL_MS = 3000;
const TYPING_THRESHOLD = 8; // keydown events per eval window to count as "typing a lot"
const AFK_EVAL_MS = 15000;
const AFK_THRESHOLD_MS = 4 * 60 * 1000; // no keyboard/mouse activity for this long -> afk overlay
const FULLSCREEN_POLL_MS = 2000;
const MEDIA_POLL_MS = 6000;
// Packaged builds ship native/ inside app.asar, but powershell.exe reads real files, not the
// virtual asar filesystem — asarUnpack (package.json) extracts native/ next to app.asar as
// app.asar.unpacked, so redirect the path there when running packaged.
const MEDIA_SCRIPT_PATH = app.isPackaged
  ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'native', 'get-media-status.ps1')
  : path.join(__dirname, 'native', 'get-media-status.ps1');
const MULTI_MONITOR_POLL_MS = 2000;

const FORCE_NIGHT = process.env.BUDDY_FORCE_NIGHT === '1';

// Test-only override so the Playwright/Electron suite (tests/) never touches a real user's
// settings/state files — same spirit as BUDDY_FORCE_NIGHT above. Unset in normal use.
if (process.env.BUDDY_USER_DATA_DIR) app.setPath('userData', process.env.BUDDY_USER_DATA_DIR);

const STATE_PATH = path.join(app.getPath('userData'), 'buddy-state.json');
const DEFAULT_STATE = { happiness: 50, fullness: 50, lastPetted: null, lastFed: null };
let state = { ...DEFAULT_STATE };

const SETTINGS_PATH = path.join(app.getPath('userData'), 'buddy-settings.json');
const DEFAULT_SETTINGS = {
  autostart: true,
  mouseLook: true,
  typingDetection: true,
  musicDetection: true,
  hideFullscreen: true,
  afkDetection: true,
  multiMonitorFollow: true,
  character: 'crab',
  beeCollarColor: '#8fd6ff',
  alwaysDay: false,
  idleIntervalSec: 30, // average seconds between idle-pool animations (renderer picks within +/-50%)
  onboardingCompleted: false,
};
let settings = { ...DEFAULT_SETTINGS };

let win = null;
let tray = null;
let settingsWin = null;

let roamTimeout = null;
let walkInterval = null;
let dragInterval = null;
let fallInterval = null;
let dragPositions = [];
let realignInterval = null;
let isDragging = false;
let roamPausedBySleep = false;
let roamPausedByTyping = false;
let roamPausedByPowerSave = false;
// Power-save is a transient runtime toggle (tray menu / settings window), not persisted to
// disk — it's meant to be flipped on/off during a session (e.g. before a game) without
// surviving into the next launch, and without needing to restart the app to undo it.
let powerSaveMode = false;

// --- single instance ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      win.show();
    }
  });
}

// --- helpers ---

function isNightTime() {
  if (FORCE_NIGHT) return true;
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

// Which display buddy currently "lives" on — starts out null and is set to the primary
// display in createWindow() (the screen module isn't usable before app.whenReady()).
// Every geometry-dependent function below (roaming, dragging, falling/throwing, the anchor
// itself) reads through this, so once multi-monitor following moves buddy to a different
// display, roam bounds and the taskbar anchor automatically follow along too.
let currentDisplay = null;

function getAnchorGeometryFor(display) {
  const { workArea } = display;
  const taskbarTop = workArea.y + workArea.height;
  const y = taskbarTop + FOOT_OVERLAP - WINDOW_HEIGHT;
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - WINDOW_WIDTH;
  return { y, minX, maxX };
}

function getAnchorGeometry() {
  return getAnchorGeometryFor(currentDisplay || screen.getPrimaryDisplay());
}

// --- state persistence ---

async function loadStateFromDisk() {
  try {
    const raw = await fs.promises.readFile(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    state = { ...DEFAULT_STATE, ...parsed };
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

async function saveStateToDisk() {
  try {
    await fs.promises.writeFile(STATE_PATH, JSON.stringify(state));
  } catch (err) {
    console.error('Buddy: failed to save state', err);
  }
}

function updateStats(action) {
  const now = Date.now();
  if (action === 'pet') {
    state.happiness = Math.min(100, state.happiness + 5);
    state.lastPetted = now;
  } else if (action === 'feed') {
    state.fullness = Math.min(100, state.fullness + 15);
    state.lastFed = now;
  }
  saveStateToDisk();
}

// --- settings persistence ---

async function loadSettingsFromDisk() {
  try {
    const raw = await fs.promises.readFile(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    settings = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

async function saveSettingsToDisk() {
  try {
    await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(settings));
  } catch (err) {
    console.error('Buddy: failed to save settings', err);
  }
}

// --- roaming ---

function clearRoamTimers() {
  if (roamTimeout) {
    clearTimeout(roamTimeout);
    roamTimeout = null;
  }
  if (walkInterval) {
    clearInterval(walkInterval);
    walkInterval = null;
  }
}

function scheduleNextRoam() {
  clearRoamTimers();
  if (isDragging) return;
  const pause = ROAM_MIN_PAUSE_MS + Math.random() * (ROAM_MAX_PAUSE_MS - ROAM_MIN_PAUSE_MS);
  roamTimeout = setTimeout(startRoam, pause);
}

// Roaming can be paused for more than one independent reason (asleep, typing a lot) —
// route every "maybe resume roaming" call through here instead of scheduleNextRoam directly.
function maybeScheduleRoam() {
  if (roamPausedBySleep || roamPausedByTyping || roamPausedByPowerSave || isDragging) {
    clearRoamTimers();
    return;
  }
  scheduleNextRoam();
}

function startRoam() {
  if (!win || win.isDestroyed() || isDragging) return;
  const { minX, maxX } = getAnchorGeometry();
  const targetX = Math.round(minX + Math.random() * (maxX - minX));
  walkTo(targetX);
}

function walkTo(targetX) {
  const bounds = win.getBounds();
  const startX = bounds.x;
  const distance = targetX - startX;
  if (Math.abs(distance) < 8) {
    maybeScheduleRoam();
    return;
  }
  const direction = distance >= 0 ? 'right' : 'left';
  const speed = isNightTime() ? WALK_SPEED_NIGHT : WALK_SPEED_DAY;
  const duration = Math.max(700, (Math.abs(distance) / speed) * 1000);
  win.webContents.send('walk-command', { direction, duration });

  const startTime = Date.now();
  const { y } = getAnchorGeometry();
  if (walkInterval) clearInterval(walkInterval);
  walkInterval = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(walkInterval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    const x = Math.round(startX + distance * easeInOutQuad(t));
    win.setPosition(x, y);
    if (t >= 1) {
      clearInterval(walkInterval);
      walkInterval = null;
      maybeScheduleRoam();
    }
  }, TICK_MS);
}

// --- drag follow ---

function startDragFollow(offsetX, offsetY) {
  isDragging = true;
  clearRoamTimers();
  if (fallInterval) {
    clearInterval(fallInterval);
    fallInterval = null;
  }
  dragPositions = [];
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const b = display.bounds;
    let x = point.x - offsetX;
    let y = point.y - offsetY;
    x = Math.max(b.x - WINDOW_WIDTH * 0.5, Math.min(x, b.x + b.width - WINDOW_WIDTH * 0.5));
    y = Math.max(b.y - WINDOW_HEIGHT * 0.5, Math.min(y, b.y + b.height - WINDOW_HEIGHT * 0.5));
    win.setPosition(Math.round(x), Math.round(y));

    const now = Date.now();
    dragPositions.push({ x, y, t: now });
    while (dragPositions.length > 1 && now - dragPositions[0].t > VELOCITY_SAMPLE_WINDOW_MS) {
      dragPositions.shift();
    }
  }, TICK_MS);
}

// Estimates release velocity (px/s) from the recent drag samples, so a fast flick can be
// told apart from a slow, deliberate placement.
function computeThrowVelocity() {
  if (dragPositions.length < 2) return null;
  const oldest = dragPositions[0];
  const newest = dragPositions[dragPositions.length - 1];
  const dt = (newest.t - oldest.t) / 1000;
  if (dt <= 0) return null;
  const clamp = (v) => Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, v));
  return {
    vx: clamp(((newest.x - oldest.x) / dt) * THROW_VELOCITY_SCALE),
    vy: clamp(((newest.y - oldest.y) / dt) * THROW_VELOCITY_SCALE),
  };
}

function endDragFollow() {
  isDragging = false;
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
  }
  const velocity = computeThrowVelocity();
  dragPositions = [];
  if (velocity && Math.hypot(velocity.vx, velocity.vy) > THROW_MIN_SPEED) {
    throwFly(velocity.vx, velocity.vy);
  } else {
    fallToTaskbar();
  }
}

function fallToTaskbar() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const { y: targetY, minX, maxX } = getAnchorGeometry();
  const targetX = Math.max(minX, Math.min(bounds.x, maxX));
  const startX = bounds.x;
  const startY = bounds.y;
  const distanceX = targetX - startX;
  const distanceY = targetY - startY;
  const startTime = Date.now();
  if (fallInterval) clearInterval(fallInterval);
  win.webContents.send('walk-command', { direction: distanceX >= 0 ? 'right' : 'left', duration: FALL_DURATION_MS, falling: true });
  fallInterval = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(fallInterval);
      return;
    }
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / FALL_DURATION_MS);
    const x = Math.round(startX + distanceX * t);
    const y = Math.round(startY + distanceY * easeOutBounce(t));
    win.setPosition(x, y);
    if (t >= 1) {
      clearInterval(fallInterval);
      fallInterval = null;
      win.webContents.send('landing', {});
      maybeScheduleRoam();
    }
  }, TICK_MS);
}

// A thrown-not-just-dropped release: simulate a real projectile arc (gravity + initial
// velocity from the drag flick) instead of the straight-down fallToTaskbar interpolation,
// so a fast flick sends buddy sailing in a curve rather than dropping like a rock.
function throwFly(vx, vy) {
  if (!win || win.isDestroyed()) return;
  if (fallInterval) clearInterval(fallInterval);

  const bounds = win.getBounds();
  let x = bounds.x;
  let y = bounds.y;
  let velX = vx;
  let velY = vy;
  const { y: groundY, minX, maxX } = getAnchorGeometry();
  let lastFacing = velX >= 0 ? 'right' : 'left';
  win.webContents.send('walk-command', { direction: lastFacing, duration: 0, falling: true });

  let lastTick = Date.now();
  fallInterval = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(fallInterval);
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.05, (now - lastTick) / 1000); // cap dt so a hiccup can't launch buddy through a wall
    lastTick = now;

    velY += GRAVITY * dt;
    x += velX * dt;
    y += velY * dt;

    if (x < minX) {
      x = minX;
      velX = -velX * WALL_BOUNCE_DAMPING;
    } else if (x > maxX) {
      x = maxX;
      velX = -velX * WALL_BOUNCE_DAMPING;
    }
    const facing = velX >= 0 ? 'right' : 'left';
    if (facing !== lastFacing) {
      lastFacing = facing;
      win.webContents.send('walk-command', { direction: facing, duration: 0, falling: true });
    }

    if (y >= groundY) {
      y = groundY;
      win.setPosition(Math.round(x), Math.round(y));
      clearInterval(fallInterval);
      fallInterval = null;
      win.webContents.send('landing', {});
      maybeScheduleRoam();
      return;
    }

    win.setPosition(Math.round(x), Math.round(y));
  }, TICK_MS);
}

// --- mouse-look ---

let cursorInterval = null;
function startCursorLook() {
  if (cursorInterval) return;
  cursorInterval = setInterval(() => {
    if (!win || win.isDestroyed() || isDragging) return;
    const point = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const lookX = Math.abs(dx) < 40 ? 0 : dx > 0 ? 1 : -1;
    const lookY = Math.abs(dy) < 60 ? 0 : dy > 0 ? 1 : -1;
    win.webContents.send('cursor-update', { lookX, lookY });
  }, CURSOR_POLL_MS);
}
function stopCursorLook() {
  if (cursorInterval) {
    clearInterval(cursorInterval);
    cursorInterval = null;
  }
  if (win && !win.isDestroyed()) win.webContents.send('cursor-update', { lookX: 0, lookY: 0 });
}

// --- global input hook (uiohook-napi) — shared by typing/afk detection below.
// Only activity *counts* are ever read (keydown counts, mousemove timestamps) — no key or
// mouse position is ever recorded or sent anywhere. Typing/afk each own an independent eval
// interval and can be toggled separately in settings; whichever of them is enabled decides
// whether the underlying native hook actually needs to be running.

let uiohookRunning = false;
let uiohookListenersAdded = false;

let recentKeyCount = 0;
let lastActivityAt = Date.now();

function onKeyDown() {
  recentKeyCount++;
  lastActivityAt = Date.now();
}
function onMouseMove() {
  lastActivityAt = Date.now();
}

function addUiohookListeners() {
  if (!uIOhook || uiohookListenersAdded) return;
  uIOhook.on('keydown', onKeyDown);
  uIOhook.on('mousemove', onMouseMove);
  uiohookListenersAdded = true;
}

function ensureUiohookRunning() {
  if (!uIOhook || uiohookRunning) return;
  addUiohookListeners();
  try {
    uIOhook.start();
    uiohookRunning = true;
  } catch (err) {
    console.error('Buddy: failed to start global input hook', err);
  }
}

function ensureUiohookStopped() {
  if (!uiohookRunning) return;
  try {
    uIOhook.stop();
  } catch {
    // already stopped
  }
  uiohookRunning = false;
}

// Called once at the end of applySettings(): the native hook stays running as long as *any*
// of typing/afk detection is enabled, and stops the moment none of them need it.
function refreshUiohookLifecycle() {
  const active = !powerSaveMode;
  const needed = active && (settings.typingDetection || settings.afkDetection);
  if (needed) ensureUiohookRunning(); else ensureUiohookStopped();
}

// --- typing detection ---

let typingEvalInterval = null;
let isTyping = false;

function setTyping(value) {
  if (isTyping === value) return;
  isTyping = value;
  if (win && !win.isDestroyed()) win.webContents.send('context-update', { typing: isTyping });
  roamPausedByTyping = isTyping;
  maybeScheduleRoam();
}

function startTypingEval() {
  if (typingEvalInterval) return;
  recentKeyCount = 0;
  typingEvalInterval = setInterval(() => {
    const heavy = recentKeyCount >= TYPING_THRESHOLD;
    recentKeyCount = 0;
    setTyping(heavy);
  }, TYPING_EVAL_MS);
}

function stopTypingEval() {
  if (typingEvalInterval) {
    clearInterval(typingEvalInterval);
    typingEvalInterval = null;
  }
  recentKeyCount = 0;
  setTyping(false);
}

// --- afk detection — a sleepy overlay after a few minutes of no input, independent of the
// existing night-only auto-sleep in renderer.js. Never sets `sleeping` and never touches
// currentState, so idle-pool animations keep playing right through it. ---

let afkEvalInterval = null;
let isAfk = false;

function setAfk(value) {
  if (isAfk === value) return;
  isAfk = value;
  if (win && !win.isDestroyed()) win.webContents.send('context-update', { afk: isAfk });
}

function startAfkEval() {
  if (afkEvalInterval) return;
  lastActivityAt = Date.now();
  afkEvalInterval = setInterval(() => {
    setAfk(Date.now() - lastActivityAt >= AFK_THRESHOLD_MS);
  }, AFK_EVAL_MS);
}

function stopAfkEval() {
  if (afkEvalInterval) {
    clearInterval(afkEvalInterval);
    afkEvalInterval = null;
  }
  setAfk(false);
}

// --- fullscreen / game detection ---

let fullscreenInterval = null;
let hiddenForFullscreen = false;

async function checkFullscreen() {
  if (!activeWin || !win || win.isDestroyed()) return;
  try {
    const active = await activeWin();
    let isFullscreen = false;
    if (active && active.bounds) {
      const display = screen.getDisplayMatching(active.bounds) || screen.getPrimaryDisplay();
      const b = active.bounds;
      const db = display.bounds;
      isFullscreen = Math.abs(b.x - db.x) <= 2 && Math.abs(b.y - db.y) <= 2
        && Math.abs(b.width - db.width) <= 2 && Math.abs(b.height - db.height) <= 2;
    }
    if (isFullscreen && !hiddenForFullscreen) {
      hiddenForFullscreen = true;
      win.hide();
    } else if (!isFullscreen && hiddenForFullscreen) {
      hiddenForFullscreen = false;
      win.showInactive();
    }
    // Windows can silently drop our TOPMOST z-order relative to the taskbar when the
    // foreground app changes (alt-tab, launching/closing windows) — re-assert on every
    // poll tick instead of relying solely on the slow REALIGN_INTERVAL_MS self-heal,
    // otherwise buddy stays sunk behind the taskbar until that timer fires.
    if (!hiddenForFullscreen) win.setAlwaysOnTop(true, 'screen-saver');
  } catch {
    // transient failures (permissions, no active window) — fail open, stay visible
  }
}

function startFullscreenWatch() {
  if (!activeWin || fullscreenInterval) return;
  fullscreenInterval = setInterval(checkFullscreen, FULLSCREEN_POLL_MS);
}

function stopFullscreenWatch() {
  if (fullscreenInterval) {
    clearInterval(fullscreenInterval);
    fullscreenInterval = null;
  }
  if (hiddenForFullscreen && win && !win.isDestroyed()) {
    hiddenForFullscreen = false;
    win.showInactive();
  }
}

// --- multi-monitor following ---
// Moves buddy to whichever display currently has the user's attention (active window, falling
// back to the cursor's display), keeping its relative position along the taskbar so it doesn't
// jump to a corner. This only ever repositions the window — it never touches currentState,
// sleeping or the Typing/Listening/Idle state machine, so idle-pool animations already playing
// keep running straight through the move.

let multiMonitorInterval = null;
let multiMonitorCheckInFlight = false;

function moveToDisplay(display) {
  const oldGeo = getAnchorGeometry();
  const bounds = win.getBounds();
  const oldSpan = Math.max(1, oldGeo.maxX - oldGeo.minX);
  const fraction = (bounds.x - oldGeo.minX) / oldSpan;

  currentDisplay = display;
  const newGeo = getAnchorGeometry();
  const targetX = Math.round(newGeo.minX + fraction * (newGeo.maxX - newGeo.minX));
  const x = Math.max(newGeo.minX, Math.min(targetX, newGeo.maxX));
  win.setPosition(x, newGeo.y);

  clearRoamTimers();
  maybeScheduleRoam();
  win.webContents.send('display-changed', {});
}

async function checkMultiMonitor() {
  if (!win || win.isDestroyed() || isDragging || multiMonitorCheckInFlight) return;
  if (screen.getAllDisplays().length < 2) return; // nothing to follow on a single-monitor setup
  multiMonitorCheckInFlight = true;
  try {
    let targetDisplay = null;
    if (activeWin) {
      try {
        const active = await activeWin();
        if (active && active.bounds) targetDisplay = screen.getDisplayMatching(active.bounds);
      } catch {
        // fall through to the cursor-based fallback below
      }
    }
    if (!targetDisplay) targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const active = currentDisplay || screen.getPrimaryDisplay();
    if (targetDisplay && targetDisplay.id !== active.id) moveToDisplay(targetDisplay);
  } finally {
    multiMonitorCheckInFlight = false;
  }
}

function startMultiMonitorWatch() {
  if (multiMonitorInterval) return;
  multiMonitorInterval = setInterval(checkMultiMonitor, MULTI_MONITOR_POLL_MS);
}

function stopMultiMonitorWatch() {
  if (multiMonitorInterval) {
    clearInterval(multiMonitorInterval);
    multiMonitorInterval = null;
  }
}

// --- music / media detection (Windows SMTC, via a small PowerShell helper) ---

let mediaInterval = null;
let isMusicPlaying = false;
let mediaCheckInFlight = false;

function checkMedia() {
  // Without this guard, a slow SMTC query (easy to trigger right after switching apps,
  // since that changes which media session Windows has to enumerate) would still be
  // running when the next 6s tick fires — piling up overlapping powershell.exe processes
  // that starve the event loop and make every other timer (idle animations included)
  // fall further and further behind the longer the app runs.
  if (mediaCheckInFlight) return;
  mediaCheckInFlight = true;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', MEDIA_SCRIPT_PATH], { timeout: 8000 }, (err, stdout) => {
    mediaCheckInFlight = false;
    if (err) return;
    const playing = (stdout || '').trim() === 'PLAYING';
    if (playing !== isMusicPlaying) {
      isMusicPlaying = playing;
      if (win && !win.isDestroyed()) win.webContents.send('context-update', { music: isMusicPlaying });
    }
  });
}

function startMediaWatch() {
  if (mediaInterval) return;
  // The helper script shells out to powershell.exe (Windows SMTC) — nothing to poll elsewhere.
  if (process.platform !== 'win32') return;
  mediaInterval = setInterval(checkMedia, MEDIA_POLL_MS);
  checkMedia();
}

function stopMediaWatch() {
  if (mediaInterval) {
    clearInterval(mediaInterval);
    mediaInterval = null;
  }
  if (isMusicPlaying) {
    isMusicPlaying = false;
    if (win && !win.isDestroyed()) win.webContents.send('context-update', { music: false });
  }
}

// --- apply settings (called at startup and whenever the settings window saves) ---

// Reflects whether Windows itself is actually going to honor the autostart entry — separate
// from `settings.autostart`, which is just what the user asked for. The two can disagree if
// the user (or some cleanup tool) disabled the entry via Windows Settings > Apps > Startup,
// which leaves our registry entry in place but flagged inactive.
let autostartBlockedByOS = false;

function applyAutostart() {
  try {
    // Packaged builds are a single self-contained exe and shouldn't get an app-path arg
    // (that arg is only meaningful when launching the generic electron.exe against this
    // project folder in dev — a packaged exe already knows what to load).
    const loginItemSettings = { openAtLogin: settings.autostart, path: process.execPath };
    if (!app.isPackaged) loginItemSettings.args = [app.getAppPath()];
    app.setLoginItemSettings(loginItemSettings);

    autostartBlockedByOS = false;
    if (settings.autostart && process.platform === 'win32') {
      const current = app.getLoginItemSettings();
      // Windows-only field: false means Task Manager/Settings > Startup has this switched off,
      // so the registry entry exists but won't actually run at login.
      if (current.executableWillLaunchAtLogin === false) {
        autostartBlockedByOS = true;
        console.warn('Buddy: Autostart ist in den Windows-Einstellungen (Apps > Autostart) deaktiviert.');
      }
    }
  } catch (err) {
    console.error('Buddy: failed to update autostart setting', err);
  }
}

function applySettings() {
  applyAutostart();

  // Power-save suspends every background poller/hook regardless of what the user's
  // individual toggles say — those toggles resume exactly where they left off once
  // power-save is switched back off, no restart needed.
  const active = !powerSaveMode;
  if (settings.hideFullscreen && active) startFullscreenWatch(); else stopFullscreenWatch();
  if (settings.musicDetection && active) startMediaWatch(); else stopMediaWatch();
  if (settings.mouseLook && active) startCursorLook(); else stopCursorLook();
  if (settings.multiMonitorFollow && active) startMultiMonitorWatch(); else stopMultiMonitorWatch();
  if (settings.typingDetection && active) startTypingEval(); else stopTypingEval();
  if (settings.afkDetection && active) startAfkEval(); else stopAfkEval();
  refreshUiohookLifecycle();
}

function setPowerSaveMode(enabled) {
  if (powerSaveMode === enabled) return;
  powerSaveMode = enabled;
  roamPausedByPowerSave = enabled;
  maybeScheduleRoam();
  applySettings();
  if (tray) tray.setContextMenu(buildMenu());
  if (win && !win.isDestroyed()) win.webContents.send('power-save-updated', { enabled });
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('power-save-updated', { enabled });
}

// --- auto update ---
// electron-updater reads its GitHub-provider config from package.json's build.publish (set at
// build time into app-update.yml). It no-ops quietly in dev (app.isPackaged === false) instead
// of hitting the network, unlike the old hand-rolled version of this that always called the
// GitHub API — see AppUpdater.isUpdaterActive() in electron-updater for that behavior.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Only the manual "Nach Updates suchen..." tray action shows "already up to date" / error
// dialogs — the silent startup check stays silent unless an update is actually found. Since
// this app only ever runs one check at a time, a single shared flag is enough to tell them apart.
let manualUpdateCheck = false;

autoUpdater.on('error', (err) => {
  console.error('Buddy: Update-Check fehlgeschlagen', err);
  if (manualUpdateCheck) {
    dialog.showMessageBox({
      type: 'error',
      title: 'DeskyBuddy',
      message: 'Update-Check fehlgeschlagen.',
      detail: String(err && err.message ? err.message : err),
    });
  }
  manualUpdateCheck = false;
});

autoUpdater.on('update-not-available', () => {
  if (manualUpdateCheck) {
    dialog.showMessageBox({ type: 'info', title: 'DeskyBuddy', message: 'Du hast bereits die neueste Version.' });
  }
  manualUpdateCheck = false;
});

autoUpdater.on('update-available', async (info) => {
  manualUpdateCheck = false;
  const currentVersion = app.getVersion();

  if (process.platform === 'win32') {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'DeskyBuddy Update',
      message: `Eine neue Version ist verfügbar: v${info.version} (installiert: v${currentVersion}).`,
      detail: 'Jetzt herunterladen und installieren?',
      buttons: ['Jetzt installieren', 'Später'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.downloadUpdate();
    return;
  }

  // macOS/Linux: unsigned builds can't self-install via electron-updater's silent updaters
  // (Squirrel.Mac validates code signatures; we don't sign — see README), so just offer the
  // GitHub releases page, same as before.
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'DeskyBuddy Update',
    message: `Eine neue Version ist verfügbar: v${info.version} (installiert: v${currentVersion}).`,
    detail: 'Die Download-Seite auf GitHub öffnen?',
    buttons: ['Seite öffnen', 'Später'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
});

// NSIS one-click installer: quitAndInstall() replaces the running install and relaunches the app.
autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());

function checkForUpdates(manual = false) {
  manualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch((err) => {
    // also surfaces via the 'error' event above; this catch only guards the returned promise
    // itself from becoming an unhandled rejection.
    console.error('Buddy: checkForUpdates() rejected', err);
  });
}

// --- menu / tray ---

function triggerAction(action) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('trigger-action', { action });
  if (action === 'pet' || action === 'feed') updateStats(action);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Streicheln', click: () => triggerAction('pet') },
    { label: 'Füttern', click: () => triggerAction('feed') },
    { label: 'Schlafen legen / Aufwecken', click: () => triggerAction('toggle-sleep') },
    { type: 'separator' },
    { label: 'Energiesparmodus', type: 'checkbox', checked: powerSaveMode, click: () => setPowerSaveMode(!powerSaveMode) },
    { type: 'separator' },
    { label: 'Einstellungen...', click: () => createSettingsWindow() },
    { label: 'Tutorial erneut anzeigen', click: () => { if (win && !win.isDestroyed()) win.webContents.send('show-onboarding'); } },
    { label: 'Nach Updates suchen...', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
}

function createTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= radius) {
        buffer[idx] = 111;
        buffer[idx + 1] = 191;
        buffer[idx + 2] = 115;
        buffer[idx + 3] = 255;
      } else if (dist <= radius + 1) {
        const alpha = Math.max(0, Math.min(255, 255 * (radius + 1 - dist)));
        buffer[idx] = 111;
        buffer[idx + 1] = 191;
        buffer[idx + 2] = 115;
        buffer[idx + 3] = alpha;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('DeskyBuddy');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => triggerAction('pet'));
}

// --- settings window ---

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 380,
    height: 500,
    resizable: false,
    title: 'DeskyBuddy – Einstellungen',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// --- window ---

function createWindow() {
  currentDisplay = screen.getPrimaryDisplay();
  const { y, minX, maxX } = getAnchorGeometry();
  const startX = Math.round((minX + maxX) / 2);

  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: startX,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    thickFrame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    const showOnboarding = !settings.onboardingCompleted;
    win.webContents.send('init-config', { forceNight: FORCE_NIGHT, character: settings.character, alwaysDay: settings.alwaysDay, idleIntervalSec: settings.idleIntervalSec, beeCollarColor: settings.beeCollarColor, showOnboarding });
    if (showOnboarding) {
      settings.onboardingCompleted = true;
      saveSettingsToDisk();
    }
  });

  win.on('closed', () => {
    win = null;
  });

  screen.on('display-metrics-changed', () => {
    if (!win || win.isDestroyed() || isDragging) return;
    const geo = getAnchorGeometry();
    const bounds = win.getBounds();
    const x = Math.max(geo.minX, Math.min(bounds.x, geo.maxX));
    win.setPosition(x, geo.y);
  });

  realignInterval = setInterval(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
  }, REALIGN_INTERVAL_MS);
}

// --- IPC ---

ipcMain.on('hit-test-changed', (_event, { overDragon }) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!overDragon, { forward: true });
});

ipcMain.on('drag-start', (_event, { offsetX, offsetY }) => startDragFollow(offsetX, offsetY));
ipcMain.on('drag-end', () => endDragFollow());

ipcMain.on('context-menu-request', (_event, { x, y }) => {
  if (!win || win.isDestroyed()) return;
  buildMenu().popup({ window: win, x: Math.round(x), y: Math.round(y) });
});

ipcMain.on('stat-event', (_event, { type }) => updateStats(type));
ipcMain.on('quit-app', () => app.quit());

ipcMain.handle('get-power-save', async () => powerSaveMode);
ipcMain.on('set-power-save', (_event, { enabled }) => setPowerSaveMode(!!enabled));

ipcMain.on('sleep-state-changed', (_event, { sleeping }) => {
  roamPausedBySleep = sleeping;
  maybeScheduleRoam();
});

ipcMain.handle('load-state', async () => state);

// autostartBlockedByOS is derived (re-checked on every applySettings()), not part of the
// persisted settings file — merged in here purely for the settings window to display.
function settingsPayload() {
  return { ...settings, autostartBlockedByOS };
}

ipcMain.handle('load-settings', async () => settingsPayload());
ipcMain.on('save-settings', (_event, { settings: newSettings }) => {
  const characterChanged = newSettings.character && newSettings.character !== settings.character;
  const collarChanged = newSettings.beeCollarColor && newSettings.beeCollarColor !== settings.beeCollarColor;
  settings = { ...settings, ...newSettings };
  saveSettingsToDisk();
  applySettings();
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings-updated', settingsPayload());
  if (win && !win.isDestroyed()) {
    win.webContents.send('day-mode-updated', { alwaysDay: settings.alwaysDay });
    if (characterChanged) win.webContents.send('character-updated', { character: settings.character });
    if (collarChanged) win.webContents.send('collar-color-updated', { beeCollarColor: settings.beeCollarColor });
    win.webContents.send('idle-config-updated', { idleIntervalSec: settings.idleIntervalSec });
  }
});
ipcMain.on('open-settings', () => createSettingsWindow());

// --- lifecycle ---

app.whenReady().then(async () => {
  // Buddy is a tray-only overlay pet, not a regular app window — on macOS that means no
  // Dock icon/app-switcher entry, matching how it already hides from the Windows taskbar
  // (skipTaskbar) and stays out of the Linux taskbar equivalent (all WMs we target honor it).
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  await loadStateFromDisk();
  await loadSettingsFromDisk();
  createWindow();
  createTray();
  maybeScheduleRoam();
  applySettings();

  // Fire-and-forget: silent unless an update is actually found (or the user checks manually
  // via the tray menu, which passes manual=true for explicit "you're up to date" feedback).
  checkForUpdates(false);
});

app.on('window-all-closed', () => {
  // Buddy lives in the tray; only "Beenden" (app.quit()) should actually end it.
});

app.on('before-quit', async () => {
  clearRoamTimers();
  if (dragInterval) clearInterval(dragInterval);
  if (fallInterval) clearInterval(fallInterval);
  if (realignInterval) clearInterval(realignInterval);
  stopTypingEval();
  stopAfkEval();
  ensureUiohookStopped();
  stopFullscreenWatch();
  stopMediaWatch();
  stopCursorLook();
  stopMultiMonitorWatch();
  await saveStateToDisk();
  await saveSettingsToDisk();
});
