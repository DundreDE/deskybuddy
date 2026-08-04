# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DeskyBuddy (product/display name; internal code identifiers like `window.BuddyStateMachine`, `window.buddyAPI`, and file names were kept as `Buddy`/`buddy` when the product was renamed — only user-facing strings and packaging metadata changed, see Packaging) is an Electron desktop pet: a chibi creature (crab/avocado/citrus/bee) that sits on the taskbar/dock, roams, reacts to mouse/keyboard/media/fullscreen activity, and can be dragged/thrown/petted/fed. Originally Windows-only, now packaged for Windows/Linux/macOS (see Packaging below) — Windows still has the fullest feature set (media detection). No build step, no bundler, no app tests — plain Node/Electron with `<script>`-tag-loaded renderer files (no ES modules, no npm renderer deps).

## Commands

- `npm start` — launch the app (`electron .`)
- `BUDDY_FORCE_NIGHT=1 npm start` (or set the env var before launching on Windows: `set BUDDY_FORCE_NIGHT=1 && npm start`) — force night palette/behavior for testing without waiting for real local time
- `npm run icon` — regenerate `build/icon.png` (procedural pixel-art crab, see Packaging) from `scripts/generate-icon.js`. Re-run after changing the crab's day palette in `renderer/dragon.js` so the icon stays in sync.
- `npm run dist:win` / `dist:mac` / `dist:linux` — build an installer for that OS via electron-builder (see Packaging — mac/linux targets require running on that OS).
- There is no lint, test, or build script configured for app logic. Verify changes by running the app and observing behavior directly.

## Packaging

`electron-builder` config lives in `package.json`'s `"build"` key (`appId: com.deskybuddy.app`, `productName: DeskyBuddy` — matches `app.setAppUserModelId()` in `main.js`, keep these two in sync). Windows target is NSIS one-click (`oneClick: true, perMachine: false` — no admin prompt, no install-path picker), producing `DeskyBuddy-Setup-<version>.exe`; Linux targets AppImage + deb; macOS targets dmg + zip (universal via `x64`+`arm64` arch list, unsigned/unnotarized — Gatekeeper will warn until this gets an Apple Developer cert wired into `mac.identity`/notarization).

**Native modules (`uiohook-napi`, `active-win`) cannot be cross-compiled from Windows.** `electron-builder`'s AppImage/deb targets themselves also require Linux-native tooling (`mksquashfs`, `dpkg-deb`) that doesn't exist on Windows at all — `npm run dist:linux`/`dist:mac` will fail outright if run from a Windows dev machine. Build each platform's installer on that platform (or via the `.github/workflows/build.yml` CI matrix, which runs `windows-latest`/`macos-latest`/`ubuntu-latest` runners and uploads all three as artifacts on `v*` tags or manual dispatch). `npm run dist:win` works fine locally on Windows today.

`build/icon.png` (1024×1024) is the single master icon; electron-builder auto-generates `.ico`/`.icns`/Linux icon sets from it — don't hand-author platform icon files.

### Platform-specific behavior in main.js

- `startMediaWatch()` is a no-op off `win32` — the media-detection helper shells out to `powershell.exe` (Windows SMTC), which doesn't exist elsewhere.
- On `darwin`, `app.dock.hide()` is called at startup so DeskyBuddy doesn't show a Dock icon/app-switcher entry (it's a tray-only overlay, same intent as `skipTaskbar` on Windows).
- `app.setLoginItemSettings` (autostart) is unsupported on Linux by Electron itself — already a silent no-op inside `applyAutostart()`'s try/catch, no special-casing needed.
- `getAnchorGeometry()`'s taskbar-edge-Y logic is already OS-agnostic (`display.workArea` bottom), so it anchors correctly above Windows taskbar, macOS Dock, and Linux panel without platform branching — don't add platform checks there.

## Architecture

### Process split

- **`main.js`** — the entire main-process brain. Owns the window (frameless, transparent, `alwaysOnTop`, `skipTaskbar`, click-through except over the sprite via `setIgnoreMouseEvents`), all OS-level polling (cursor position, global keyboard/mouse hook via `uiohook-napi`, fullscreen detection via `active-win`, media playback via a PowerShell helper script, multi-monitor tracking), state/settings persistence to `app.getPath('userData')`, the tray menu, and the settings window. It pushes context to the renderer over one-way IPC channels; the renderer never computes physics or polls the OS itself.
- **`preload.js`** / **`preload-settings.js`** — contextBridge APIs (`window.buddyAPI`, `window.settingsAPI`) for the main window and the settings window respectively. `contextIsolation: true`, `nodeIntegration: false` throughout — all main↔renderer communication goes through these two bridges.
- **`renderer/*.js`** — plain scripts loaded in sequence by `index.html` (no bundler, no modules). Load order matters because later scripts reference globals attached to `window` by earlier ones.

### Native modules degrade, never crash

`uiohook-napi` (global input hook) and `active-win` (fullscreen/foreground-window detection) are wrapped in `try/require` in `main.js` — if either native binary fails to load (ABI mismatch, missing build), the corresponding feature (typing/AFK detection, fullscreen hiding) silently disables instead of crashing the app. Preserve this pattern for any new native dependency.

### Physics and positioning live entirely in main.js

Walking, dragging, falling, and throwing are all driven by `setInterval` loops in `main.js` that call `win.setPosition()` directly — the renderer only receives `walk-command` / `landing` / `cursor-update` events and reacts visually (facing, leg animation, particles). `getAnchorGeometry()` (anchored to `currentDisplay`, which multi-monitor-follow updates) is the single source of truth for taskbar-edge Y and roam X bounds; any new movement feature should read through it rather than recomputing screen geometry.

Throw physics (`throwFly`) estimates release velocity from a rolling window of drag samples (`dragPositions`, pruned to `VELOCITY_SAMPLE_WINDOW_MS`) and only kicks in above `THROW_MIN_SPEED`; slower releases fall straight down via `fallToTaskbar`. Both converge on `getAnchorGeometry().y` as the landing line and fire `landing` on impact so the renderer can sync a thud sound/hop to variable-length flights.

### Two independent state layers in the renderer

1. **Action states** (`renderer.js`, `currentState`: `IDLE` / `WALKING` / `DRAGGING` / `FALLING` / `PETTED` / `EATING` / `SLEEPING`) — pre-empt everything, driven by direct user interaction and main-process movement events.
2. **Typing / Listening / Idle state machine** (`state-machine.js`, `window.BuddyStateMachine`) — tracks ambient context signals (`typing`, `listening`/music, `afk`) pushed from `main.js` via `context-update`. Only `typing` blocks the idle-animation layer (`idleBlocked`); `listening` and `afk` are non-blocking overlays that layer on top of whatever's already showing (headphones sprite, occasional zzz particles) without touching `currentState`.

Keep these separate: don't route ambient context signals through `setState`, and don't make idle-pool animations pre-emptable by anything except an actual action state or typing.

### Idle animations: pool + director

- **`renderer/idle-pool.js`** (`window.BuddyIdlePool`) — declarative library of idle animations as frame arrays (`pose`, `core`, `prop`/`propPos`, `mouthOpen`, `blinking`, `particle`, `speech`, `holdMs`, `transform`), optionally scoped to specific characters via `appliesTo`.
- **`renderer/idle-director.js`** (`window.BuddyIdleDirector`) — picks a random applicable animation at randomized intervals (average gap configurable in settings, ±50% jitter) and steps through its frames via `setTimeout` chains, calling back into the mounted sprite's `setPose`/`setCore`/`setMouthOpen`/`setBlinking` and `props.js` for prop overlays. Only runs when `canPlay()` is true (idle, awake, not typing-blocked). `interrupt()` must be called by any code path that pre-empts IDLE, or the next `scheduleNext()` never fires.
- **`renderer/props.js`** (`window.BuddyProps`) — small accessory sprites (e.g. items held during idle animations) mounted/unmounted by the director, positioned via CSS classes (`prop-pos-*`).

### Sprite modules share one contract

`renderer/dragon.js`, `avocado.js`, `citrus.js`, `bee.js` each expose `window.Pixel<Name> = { create, ... }`. `create()` procedurally paints a low-res pixel grid onto a `<canvas>` (nearest-neighbor scaled via CSS `image-rendering: pixelated`) and returns an object with the shared mutator contract renderer.js and idle-director.js call against: `setBlinking`, `setMouthOpen`, `setLegPhase`, `setStanding`, `setPalette('day'|'night')`, `setLook(x,y)`, `setHeadphones`, `setPose(name)`, plus optional per-character extras (e.g. bee's `setCollarColor`). `renderer.js`'s `SPRITE_MODULES` map selects among them by the `character` setting; `mountCharacter()` swaps the canvas element live. When adding a new character, implement this full contract even if some methods are no-ops, or callers relying on it will throw.

Sprites are original procedural pixel art (grid of named color categories → outline pass computed from silhouette adjacency) — no external art assets, not reproductions of existing IP.

### Settings and state persistence

Two independent JSON files under `app.getPath('userData')`: `buddy-state.json` (happiness/fullness/pet-feed timestamps, mutated via `updateStats`) and `buddy-settings.json` (user-configurable toggles, merged over `DEFAULT_SETTINGS` on load so new keys get defaults for existing installs). `applySettings()` in `main.js` is the single place that starts/stops every background poller based on current settings + `powerSaveMode`; call it after any settings mutation rather than toggling pollers individually. `powerSaveMode` itself is intentionally session-only (not persisted) — it's meant to suspend everything for the current run without surviving relaunch.

### IPC channel additions

When adding a new push channel from main → renderer, wire it in three places: `main.js` (`win.webContents.send(...)`), `preload.js` (`onX` subscriber wrapper), and the `renderer.js` `wireEvents()` handler. Renderer → main is the same pattern in reverse (`ipcMain.on`/`.handle` in `main.js`, an invoker in `preload.js`).

## Locale note

User-facing strings (tray menu, speech bubbles, warnings) are in German — match this when adding new UI text.

updaze die claude.md immer