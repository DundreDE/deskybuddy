// Orchestrator: mounts the pixel dragon sprite, drives the state machine, wires up all interactions.
const DRAG_THRESHOLD_PX = 5;
const CLICK_CONFIRM_MS = 260;
const SLEEP_AUTO_MS = 5 * 60 * 1000; // fall asleep after 5 min of inactivity at night
const LEG_STEP_MS = 180;

const PHRASES = {
  idleDay: ['Hallo!', 'Schönen Tag!', '*schnüffelt neugierig*', 'Was machst du gerade?', 'Ich beobachte dich...'],
  idleNight: ['Zzz...', 'Bin müde...', '*gähnt*', 'Gute Nacht!', 'Sternenzeit...'],
  afterPet: ['Das kitzelt!', 'Mehr davon!', 'Ich mag dich!', 'Kraul mich weiter!'],
  afterFeed: ['Lecker!', 'Mmmh, danke!', '*schmatzt*', 'Mehr Snacks bitte!'],
};

const ONBOARDING_STEPS = [
  { text: 'Hallo! Ich bin dein DeskyBuddy 👋', duration: 3200 },
  { text: 'Zieh mich einfach mit der Maus herum!', duration: 3600 },
  { text: 'Ein Klick auf mich = Streicheln 🐾', duration: 3200 },
  { text: 'Rechtsklick öffnet mein Menü — dort kannst du mich füttern, schlafen legen und mehr', duration: 4400 },
  { text: 'Unter „Einstellungen“ kannst du mich ganz nach deinem Geschmack anpassen ⚙️', duration: 4400 },
  { text: 'Über mein Tray-Icon findest du dieses Tutorial jederzeit wieder. Viel Spaß mit mir! 💛', duration: 4400 },
];

const PARTICLE_SHAPES = {
  heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  sparkle: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'],
};
const PARTICLE_COLORS = { heart: '#ff6b8a', sparkle: '#ffd166' };
const PARTICLE_PIXEL = 3;

function createParticlePixelArt(kind) {
  const shape = PARTICLE_SHAPES[kind];
  const size = shape.length;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size * PARTICLE_PIXEL}px`;
  canvas.style.height = `${size * PARTICLE_PIXEL}px`;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PARTICLE_COLORS[kind];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (shape[y][x] === 'X') ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function pickPhrase(pool) {
  const list = PHRASES[pool];
  return list[Math.floor(Math.random() * list.length)];
}

// The laptop is its own overlay (not baked into the crab canvas) so it can slide in/out
// independently. It shows the matte back of the lid facing the viewer — the crab is
// holding it open facing itself, so we'd never actually see the glowing screen side.
const LAPTOP_W = 12;
const LAPTOP_H = 10;
const LAPTOP_COLORS = { lid: '#5a5a5a', base: '#7a7a7a', accent: '#8fd6ff', outline: '#2b2b2b' };

function createLaptopAccessory() {
  const canvas = document.createElement('canvas');
  canvas.id = 'laptop-accessory';
  canvas.width = LAPTOP_W;
  canvas.height = LAPTOP_H;
  const ctx = canvas.getContext('2d');
  const set = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  for (let y = 0; y <= 6; y++) {
    for (let x = 1; x <= 10; x++) {
      const border = y === 0 || y === 6 || x === 1 || x === 10;
      set(x, y, border ? LAPTOP_COLORS.outline : LAPTOP_COLORS.lid);
    }
  }
  set(5, 3, LAPTOP_COLORS.accent);
  set(6, 3, LAPTOP_COLORS.accent);

  for (let y = 7; y <= 9; y++) {
    for (let x = 0; x <= 11; x++) {
      const border = y === 7 || y === 9;
      set(x, y, border ? LAPTOP_COLORS.outline : LAPTOP_COLORS.base);
    }
  }

  return canvas;
}

const SPRITE_MODULES = {
  crab: window.PixelDragon,
  avocado: window.PixelAvocado,
  citrus: window.PixelCitrus,
  bee: window.PixelBee,
  monkey: window.PixelMonkey,
  toast: window.PixelToast,
  kaktus: window.PixelKaktus,
  wolke: window.PixelWolke,
  croissant: window.PixelCroissant,
  pilz: window.PixelPilz,
};

let stageEl, dragonSprite, laptopEl, propMountEl;
let isTypingFlag = false;
let currentCharacter = 'crab';
let beeCollarColor = window.PixelBee ? window.PixelBee.DEFAULT_COLLAR : '#8fd6ff';
let facingLeft = false;
let lastLookX = 0;
let lastLookY = 0;
// Renamed internally to match the spec's Listening state — main.js still calls the IPC
// field `music` (that's the detection mechanism), but conceptually this is "audio detected".
let listeningFlag = false;
let afkFlag = false;
let afkZzzTimer = null;
let alwaysDayFlag = false;
let idleIntervalSec = 30;
let powerSaveActive = false;

// Typing / Listening / Idle state machine (state-machine.js). Typing blocks the idle-animation
// pool below; Listening (headphones) does not. The existing pet/feed/sleep/drag/walk states in
// this file remain a separate, higher-priority layer exactly as before.
const buddyState = window.BuddyStateMachine.create();
let idleDirector = null;

function mountCharacter(character) {
  if (idleDirector) idleDirector.interrupt();
  const mod = SPRITE_MODULES[character] || SPRITE_MODULES.crab;
  const mount = document.getElementById('dragon-mount');
  if (dragonSprite) dragonSprite.canvas.remove();
  dragonSprite = mod.create();
  mount.insertBefore(dragonSprite.canvas, mount.firstChild);
  dragonSprite.setPalette(isNightTime() ? 'night' : 'day');
  dragonSprite.canvas.classList.toggle('facing-left', facingLeft);
  dragonSprite.setHeadphones(listeningFlag);
  if (character === 'bee' && dragonSprite.setCollarColor) dragonSprite.setCollarColor(beeCollarColor);
}

function updateLaptopVisibility() {
  const sittingLike = !['WALKING', 'DRAGGING', 'FALLING'].includes(currentState);
  laptopEl.classList.toggle('visible', isTypingFlag && sittingLike);
}

// Afk is a non-blocking overlay: it just spawns the same zzz particles used while
// SLEEPING, on its own slower clock, without ever setting `sleeping` or touching currentState —
// idle-pool animations keep playing right through it.
function scheduleAfkZzz() {
  const delay = 6000 + Math.random() * 6000;
  afkZzzTimer = setTimeout(() => {
    if (afkFlag) spawnParticles('zzz', 1);
    scheduleAfkZzz();
  }, delay);
}
function startAfkZzz() {
  if (afkZzzTimer) return;
  scheduleAfkZzz();
}
function stopAfkZzz() {
  if (afkZzzTimer) {
    clearTimeout(afkZzzTimer);
    afkZzzTimer = null;
  }
}
let currentState = 'IDLE';
let sleeping = false;
let forceNight = false;
let petState = null;
let lastInteractionAt = Date.now();

let dragCandidate = null;
let returnTimer = null;
let walkReturnTimer = null;
let legSwingPhase = 0;
let legSwingTick = 0;
let chompInterval = null;
let blinkTimer = null;
let speechTimer = null;
let bubbleHideTimer = null;
let zzzTimer = null;
let onboardingActive = false;
let onboardingTimer = null;

function isNightTime() {
  if (alwaysDayFlag) return false;
  if (forceNight) return true;
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

function setState(next) {
  if (currentState === next) return;
  stageEl.classList.remove(`state-${currentState.toLowerCase()}`);
  currentState = next;
  stageEl.classList.add(`state-${currentState.toLowerCase()}`);
  if (next === 'DRAGGING' && returnTimer) {
    clearTimeout(returnTimer);
    returnTimer = null;
  }
  if (next !== 'IDLE' && idleDirector) idleDirector.interrupt();
  updateLaptopVisibility();
}

function setFacing(direction) {
  facingLeft = direction === 'left';
  dragonSprite.canvas.classList.toggle('facing-left', facingLeft);
  // Re-apply the last known look immediately (mirror-corrected) instead of waiting up to
  // one cursor-poll tick for the eyes to catch up with the flipped facing direction.
  dragonSprite.setLook(facingLeft ? -lastLookX : lastLookX, lastLookY);
}

function setWalkingVisual(active) {
  dragonSprite.canvas.classList.toggle('walking', active);
}

function queueSpeech(text, duration = 3200) {
  const bubble = document.getElementById('speech-bubble');
  const textEl = document.getElementById('speech-text');
  textEl.textContent = text;
  bubble.classList.remove('visible');
  // restart the pop-in animation even if a bubble is already showing
  void bubble.offsetWidth;
  const sideJitter = (Math.random() - 0.5) * 44; // occasionally pop up off to a side, not dead-center
  bubble.style.left = `calc(50% + ${sideJitter}px)`;
  bubble.classList.add('visible');
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => bubble.classList.remove('visible'), duration);
}

function spawnParticles(kind, count) {
  const container = document.getElementById('particles');
  for (let i = 0; i < count; i++) {
    let el;
    if (kind === 'zzz') {
      el = document.createElement('div');
      el.textContent = 'z';
    } else {
      el = createParticlePixelArt(kind);
    }
    el.className = `particle ${kind}`;
    const offset = (Math.random() - 0.5) * 50;
    el.style.left = `calc(50% + ${offset}px)`;
    el.style.animationDelay = `${Math.random() * 0.15}s`;
    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// --- onboarding (first-launch walkthrough, replayable from the tray menu) ---

function runOnboardingStep(i) {
  if (i >= ONBOARDING_STEPS.length) {
    onboardingActive = false;
    if (idleDirector) idleDirector.resume();
    return;
  }
  const { text, duration } = ONBOARDING_STEPS[i];
  queueSpeech(text, duration);
  onboardingTimer = setTimeout(() => runOnboardingStep(i + 1), duration + 500);
}

function startOnboarding() {
  clearTimeout(onboardingTimer);
  onboardingActive = true;
  if (idleDirector) idleDirector.pause();
  runOnboardingStep(0);
}

// --- power save (temporary, main-process-driven — reset on next launch) ---

function applyPowerSaveVisual() {
  stageEl.classList.toggle('power-save', powerSaveActive);
  if (powerSaveActive) {
    if (idleDirector) idleDirector.pause();
    clearTimeout(blinkTimer);
    clearTimeout(speechTimer);
    clearTimeout(zzzTimer);
    queueSpeech('Energiesparmodus an 💤', 2400);
  } else {
    scheduleBlink();
    scheduleIdleSpeech();
    scheduleZzz();
    if (idleDirector) idleDirector.resume();
    queueSpeech('Bin wieder da!', 2000);
  }
}

// --- idle micro-animations ---

function scheduleBlink() {
  const delay = 2000 + Math.random() * 4000;
  blinkTimer = setTimeout(() => {
    if (currentState !== 'SLEEPING') {
      dragonSprite.setBlinking(true);
      setTimeout(() => dragonSprite.setBlinking(false), 220);
    }
    scheduleBlink();
  }, delay);
}

function scheduleIdleSpeech() {
  const delay = 20000 + Math.random() * 70000;
  speechTimer = setTimeout(() => {
    const bubble = document.getElementById('speech-bubble');
    if (!onboardingActive && !bubble.classList.contains('visible')) {
      queueSpeech(pickPhrase(sleeping ? 'idleNight' : 'idleDay'));
    }
    scheduleIdleSpeech();
  }, delay);
}

function scheduleZzz() {
  const delay = 4000 + Math.random() * 5000;
  zzzTimer = setTimeout(() => {
    if (currentState === 'SLEEPING') spawnParticles('zzz', 1);
    scheduleZzz();
  }, delay);
}

// --- interactions ---

function wakeIfSleeping() {
  if (!sleeping) return;
  sleeping = false;
  dragonSprite.setBlinking(false);
  window.buddyAPI.setSleeping(false);
}

function doPet() {
  wakeIfSleeping();
  lastInteractionAt = Date.now();
  setState('PETTED');
  window.BuddySounds.playSqueak();
  spawnParticles('heart', 3);
  window.buddyAPI.reportStatEvent('pet');
  queueSpeech(pickPhrase('afterPet'));
  if (returnTimer) clearTimeout(returnTimer);
  returnTimer = setTimeout(() => {
    if (currentState === 'PETTED') setState(sleeping ? 'SLEEPING' : 'IDLE');
  }, 600);
}

function doFeed() {
  wakeIfSleeping();
  lastInteractionAt = Date.now();
  setState('EATING');
  window.BuddySounds.playEatCrunch();
  spawnParticles('sparkle', 4);
  window.buddyAPI.reportStatEvent('feed');
  queueSpeech(pickPhrase('afterFeed'));

  let chomp = 0;
  if (chompInterval) clearInterval(chompInterval);
  chompInterval = setInterval(() => {
    dragonSprite.setMouthOpen(chomp % 2 === 0);
    chomp++;
    if (chomp >= 6) {
      clearInterval(chompInterval);
      chompInterval = null;
      dragonSprite.setMouthOpen(false);
    }
  }, 140);

  if (returnTimer) clearTimeout(returnTimer);
  returnTimer = setTimeout(() => {
    if (currentState === 'EATING') setState(sleeping ? 'SLEEPING' : 'IDLE');
  }, 850);
}

function doToggleSleep() {
  sleeping = !sleeping;
  window.buddyAPI.setSleeping(sleeping);
  if (sleeping) {
    dragonSprite.setBlinking(true);
    setState('SLEEPING');
    window.BuddySounds.playYawn();
    queueSpeech(pickPhrase('idleNight'));
  } else {
    dragonSprite.setBlinking(false);
    lastInteractionAt = Date.now();
    setState('IDLE');
    window.BuddySounds.playChirp();
    queueSpeech('Ich bin wach!');
  }
}

let clickTimer = null;
let clickCount = 0;
function handleShapeClick() {
  clickCount++;
  if (clickCount === 1) {
    clickTimer = setTimeout(() => {
      if (clickCount === 1) doPet();
      clickCount = 0;
    }, CLICK_CONFIRM_MS);
  } else {
    clearTimeout(clickTimer);
    clickCount = 0;
    doFeed();
  }
}

function onDragEnd() {
  window.buddyAPI.endDrag();
  setWalkingVisual(false);
  setState('FALLING');
}

// Fired by main.js the instant the drop/throw physics actually reaches the ground — replaces
// a fixed setTimeout so the thud/hop lands in sync even though throw flights vary in length.
function onLanding() {
  if (currentState !== 'FALLING') return;
  window.BuddySounds.playThud();
  dragonSprite.canvas.classList.add('hop');
  spawnParticles('sparkle', 2);
  setTimeout(() => dragonSprite.canvas.classList.remove('hop'), 450);
  setState(sleeping ? 'SLEEPING' : 'IDLE');
}

// --- event wiring ---

function wireEvents() {
  let overDragon = false;
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest('#dragon-canvas')) {
      if (!overDragon) {
        overDragon = true;
        window.buddyAPI.notifyHitTest(true);
      }
    }
  });
  document.addEventListener('mouseout', (e) => {
    const leavingToOutside = !e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest('#dragon-canvas'));
    if (overDragon && leavingToOutside) {
      overDragon = false;
      window.buddyAPI.notifyHitTest(false);
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest || !e.target.closest('#dragon-canvas')) return;
    dragCandidate = { startClientX: e.clientX, startClientY: e.clientY, moved: false, offsetX: e.clientX, offsetY: e.clientY };
    document.addEventListener('mousemove', onDragCandidateMove);
    document.addEventListener('mouseup', onDragCandidateUp, { once: true });
  });

  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest || !e.target.closest('#dragon-canvas')) return;
    e.preventDefault();
    window.buddyAPI.requestContextMenu(e.screenX, e.screenY);
  });

  window.buddyAPI.onTriggerAction(({ action }) => {
    if (action === 'pet') doPet();
    else if (action === 'feed') doFeed();
    else if (action === 'toggle-sleep') doToggleSleep();
  });

  window.buddyAPI.onLanding(() => onLanding());

  window.buddyAPI.onWalkCommand(({ direction, duration, falling }) => {
    setFacing(direction);
    if (falling) return;
    if (currentState === 'DRAGGING' || currentState === 'FALLING') return;
    setState('WALKING');
    setWalkingVisual(true);

    if (walkReturnTimer) clearTimeout(walkReturnTimer);
    walkReturnTimer = setTimeout(() => {
      setWalkingVisual(false);
      if (currentState === 'WALKING') setState(sleeping ? 'SLEEPING' : 'IDLE');
    }, duration);
  });

  window.buddyAPI.onInitConfig(({ forceNight: fn, character, alwaysDay, idleIntervalSec: interval, beeCollarColor: collar, showOnboarding }) => {
    forceNight = fn;
    alwaysDayFlag = !!alwaysDay;
    applyDayNight();
    if (collar) beeCollarColor = collar;
    if (character && character !== currentCharacter) {
      currentCharacter = character;
      mountCharacter(currentCharacter);
    } else if (currentCharacter === 'bee' && dragonSprite && dragonSprite.setCollarColor) {
      dragonSprite.setCollarColor(beeCollarColor);
    }
    if (interval !== undefined) {
      idleIntervalSec = interval;
      if (idleDirector) idleDirector.setAverageGapSeconds(interval);
    }
    if (showOnboarding) setTimeout(startOnboarding, 1800);
  });

  window.buddyAPI.onShowOnboarding(() => startOnboarding());

  window.buddyAPI.onCollarColorUpdate(({ beeCollarColor: collar }) => {
    if (!collar) return;
    beeCollarColor = collar;
    if (currentCharacter === 'bee' && dragonSprite && dragonSprite.setCollarColor) {
      dragonSprite.setCollarColor(beeCollarColor);
    }
  });

  window.buddyAPI.onDayModeUpdate(({ alwaysDay }) => {
    alwaysDayFlag = !!alwaysDay;
    applyDayNight();
  });

  window.buddyAPI.onIdleConfigUpdate(({ idleIntervalSec: interval }) => {
    if (interval === undefined) return;
    idleIntervalSec = interval;
    if (idleDirector) idleDirector.setAverageGapSeconds(interval);
  });

  // lookX comes in as real screen-space direction (cursor left/right of buddy). The whole
  // canvas gets CSS-mirrored (scaleX(-1)) when facing left, which would also flip an
  // already-correct pupil offset — so undo that here to keep the eyes pointed at the cursor.
  window.buddyAPI.onCursorUpdate(({ lookX, lookY }) => {
    lastLookX = lookX;
    lastLookY = lookY;
    dragonSprite.setLook(facingLeft ? -lookX : lookX, lookY);
  });

  window.buddyAPI.onContextUpdate(({ typing, music, afk }) => {
    if (typing !== undefined) {
      isTypingFlag = typing;
      buddyState.setTyping(typing);
      if (typing && idleDirector) idleDirector.interrupt();
      updateLaptopVisibility();
    }
    if (music !== undefined) {
      listeningFlag = music;
      buddyState.setListening(music);
      dragonSprite.setHeadphones(music);
    }
    if (afk !== undefined) {
      afkFlag = afk;
      buddyState.setAfk(afk);
      if (afk) startAfkZzz(); else stopAfkZzz();
    }
  });

  // Purely cosmetic: a little poof where buddy already stands after main.js repositions the
  // window onto a different display. Never touches currentState/sleeping/idle-blocking, so
  // whatever the idle-pool is doing keeps running straight through the jump.
  window.buddyAPI.onDisplayChanged(() => {
    spawnParticles('sparkle', 2);
  });

  window.buddyAPI.onCharacterUpdate(({ character }) => {
    currentCharacter = character;
    mountCharacter(currentCharacter);
  });

  window.buddyAPI.onPowerSaveUpdate(({ enabled }) => {
    powerSaveActive = enabled;
    applyPowerSaveVisual();
  });
}

function onDragCandidateMove(e) {
  if (!dragCandidate) return;
  const dx = e.clientX - dragCandidate.startClientX;
  const dy = e.clientY - dragCandidate.startClientY;
  if (!dragCandidate.moved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
    dragCandidate.moved = true;
    wakeIfSleeping();
    lastInteractionAt = Date.now();
    setState('DRAGGING');
    window.buddyAPI.startDrag(dragCandidate.offsetX, dragCandidate.offsetY);
  }
}

function onDragCandidateUp() {
  document.removeEventListener('mousemove', onDragCandidateMove);
  if (!dragCandidate) return;
  if (dragCandidate.moved) {
    lastInteractionAt = Date.now();
    onDragEnd();
  } else {
    handleShapeClick();
  }
  dragCandidate = null;
}

// --- day/night + auto-sleep ---

function applyDayNight() {
  const night = isNightTime();
  document.body.classList.toggle('night', night);
  dragonSprite.setPalette(night ? 'night' : 'day');
}

function handleAutoSleep() {
  const night = isNightTime();
  if (night && !sleeping && Date.now() - lastInteractionAt > SLEEP_AUTO_MS) {
    sleeping = true;
    dragonSprite.setBlinking(true);
    window.buddyAPI.setSleeping(true);
    if (currentState === 'IDLE') setState('SLEEPING');
  } else if (!night && sleeping) {
    sleeping = false;
    dragonSprite.setBlinking(false);
    window.buddyAPI.setSleeping(false);
    if (currentState === 'SLEEPING') setState('IDLE');
  }
}

// --- init ---

function init() {
  stageEl = document.getElementById('stage');
  propMountEl = document.getElementById('prop-mount');
  laptopEl = createLaptopAccessory();
  document.getElementById('dragon-mount').appendChild(laptopEl);
  mountCharacter(currentCharacter);
  stageEl.classList.add('state-idle');

  wireEvents();
  scheduleBlink();
  scheduleIdleSpeech();
  scheduleZzz();
  applyDayNight();

  idleDirector = window.BuddyIdleDirector.create({
    pool: window.BuddyIdlePool,
    getCharacter: () => currentCharacter,
    canPlay: () => currentState === 'IDLE' && !sleeping && !buddyState.isIdleBlocked(),
    getSprite: () => dragonSprite,
    getCanvasEl: () => dragonSprite && dragonSprite.canvas,
    propMount: propMountEl,
    onSpeech: (text) => queueSpeech(text),
    onParticle: (kind, count) => spawnParticles(kind, count),
    avgGapSeconds: idleIntervalSec,
  });
  idleDirector.start();
  setInterval(() => {
    applyDayNight();
    handleAutoSleep();
  }, 30000);

  // Single persistent leg-animation clock: fast alternating steps while walking,
  // a slow lazy swing together while sitting.
  setInterval(() => {
    if (powerSaveActive) return;
    const standing = currentState === 'WALKING';
    dragonSprite.setStanding(standing);
    legSwingTick++;
    const ticksPerSwing = standing ? 1 : 5;
    if (legSwingTick >= ticksPerSwing) {
      legSwingTick = 0;
      legSwingPhase = legSwingPhase === 0 ? 1 : 0;
      dragonSprite.setLegPhase(legSwingPhase);
    }
  }, LEG_STEP_MS);

  window.buddyAPI.loadState().then((s) => {
    petState = s;
    if (s && s.fullness < 30) {
      setTimeout(() => queueSpeech('Ich hab ein bisschen Hunger...'), 2000);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
