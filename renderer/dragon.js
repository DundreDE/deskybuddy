// Procedurally generates a small chibi crab as a low-res pixel grid, then paints it
// onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering:
// pixelated) for a crisp 16-bit / retro sprite look. Original character design (own
// silhouette, own palette) — not a reproduction of any existing artwork. No external
// art assets.
(function () {
const GRID_W = 24;
const GRID_H = 28;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    body: '#ff7a45',
    belly: '#ffd9a8',
    claw: '#ff9466',
    cheek: '#ff5f7a',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#7a2e12',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    body: '#b85a35',
    belly: '#d9a679',
    claw: '#c47a52',
    cheek: '#c9704f',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#4a2012',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

const SILHOUETTE_CATEGORIES = new Set(['body', 'belly', 'claw']);

// 3 short resting legs per side, always visible, plus the 2 animated front legs below = 8 legs total.
const SIDE_LEGS_LEFT = [[6, 19], [6, 20], [7, 20], [7, 21], [8, 19], [8, 20]];
const SIDE_LEGS_RIGHT = SIDE_LEGS_LEFT.map(([x, y]) => [GRID_W - 1 - x, y]);

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px + 0.5 - cx) / rx;
  const dy = (py + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// Pose-driven claw offsets (applied on top of the resting claw position at cx=2.4/GRID_W-2.4, cy=16).
// Poses are additive nudges, not full reshapes, so they stay cheap and read clearly at 5px/cell.
const CLAW_POSES = {
  wave: { leftDX: 0, leftDY: 0, rightDX: 3, rightDY: -10 },
  clap: { leftDX: 5, leftDY: -4, rightDX: -5, rightDY: -4 },
  scratch: { leftDX: 7, leftDY: -8, rightDX: 0, rightDY: 0 },
  cheer: { leftDX: -1, leftDY: -9, rightDX: 1, rightDY: -9 },
};
const LEG_POSES = {
  dig: 3, // extra px the legs sink down by, for the "digging in" idle
};

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones, pose = null }) {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
  const set = (x, y, category) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    grid[y][x] = category;
  };

  const clawOffset = CLAW_POSES[pose] || { leftDX: 0, leftDY: 0, rightDX: 0, rightDY: 0 };

  // claws (painted first so the shell overlaps their attachment point)
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 2.4 + clawOffset.leftDX, 16 + clawOffset.leftDY, 3.4, 4.6)) set(x, y, 'claw');
      if (inEllipse(x, y, GRID_W - 2.4 + clawOffset.rightDX, 16 + clawOffset.rightDY, 3.4, 4.6)) set(x, y, 'claw');
    }
  }
  // pincer seam (only drawn at the resting position — raised/shifted claws skip it, which
  // reads fine at this scale since the seam is a single-pixel detail)
  if (clawOffset.leftDX === 0 && clawOffset.leftDY === 0) {
    set(2, 14, 'outline');
    set(2, 15, 'outline');
  }
  if (clawOffset.rightDX === 0 && clawOffset.rightDY === 0) {
    set(GRID_W - 3, 14, 'outline');
    set(GRID_W - 3, 15, 'outline');
  }

  // wide, flat shell (carapace)
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 11.5, 13, 9.8, 6.8)) set(x, y, 'body');
    }
  }

  // lighter underside patch
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'body' && inEllipse(x, y, 11.5, 15.5, 5.2, 3.4)) {
        set(x, y, 'belly');
      }
    }
  }

  // eye stalks (connect up into the shell)
  set(8, 7, 'body');
  set(15, 7, 'body');

  SIDE_LEGS_LEFT.forEach(([x, y]) => set(x, y, 'body'));
  SIDE_LEGS_RIGHT.forEach(([x, y]) => set(x, y, 'body'));

  if (standing) {
    // walking stance: wider, splayed legs stepping up/down
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of [6, 7, 8]) {
      for (let y = 21 - leftLift; y <= 27 - leftLift; y++) set(x, y, 'body');
    }
    for (const x of [15, 16, 17]) {
      for (let y = 21 - rightLift; y <= 27 - rightLift; y++) set(x, y, 'body');
    }
  } else {
    // sitting stance: narrow legs hanging past the taskbar edge, swinging together
    const swing = legPhase === 1 ? 1 : 0;
    const sink = pose === 'dig' ? LEG_POSES.dig : 0;
    for (const x of [9 + swing, 10 + swing]) {
      for (let y = 19; y <= 27 - sink; y++) set(x, y, 'body');
    }
    for (const x of [13 + swing, 14 + swing]) {
      for (let y = 19; y <= 27 - sink; y++) set(x, y, 'body');
    }
  }

  // ink outline: any silhouette pixel touching transparent space
  const outlineCells = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cat = grid[y][x];
      if (!cat || !SILHOUETTE_CATEGORIES.has(cat)) continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      const touchesEmpty = neighbors.some(([nx, ny]) => {
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) return true;
        return !grid[ny][nx];
      });
      if (touchesEmpty) outlineCells.push([x, y]);
    }
  }
  outlineCells.forEach(([x, y]) => set(x, y, 'outline'));

  // face details, painted last so they always stay visible
  if (blinking) {
    for (const x of [7, 8, 9, 14, 15, 16]) set(x, 5, 'outline');
  } else {
    for (const x of [7, 8, 9]) set(x, 4, 'eye-white');
    for (const x of [7, 8, 9]) set(x, 5, 'eye-white');
    for (const x of [7, 8, 9]) set(x, 6, 'eye-white');
    set(8 + lookX, 5 + lookY, 'eye-pupil');
    for (const x of [14, 15, 16]) set(x, 4, 'eye-white');
    for (const x of [14, 15, 16]) set(x, 5, 'eye-white');
    for (const x of [14, 15, 16]) set(x, 6, 'eye-white');
    set(15 + lookX, 5 + lookY, 'eye-pupil');
  }

  for (const x of [4, 5]) set(x, 12, 'cheek');
  for (const x of [18, 19]) set(x, 12, 'cheek');

  if (mouthOpen) {
    for (const x of [10, 11, 12, 13]) {
      set(x, 17, 'outline');
      set(x, 18, 'outline');
    }
  } else {
    for (const x of [10, 11, 12, 13]) set(x, 17, 'outline');
  }

  // headphones — always on top, independent of every other state
  if (headphones) {
    for (const x of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) set(x, 1, 'headphone');
    set(3, 2, 'headphone');
    for (let y = 3; y <= 7; y++) set(3, y, 'headphone');
    set(20, 2, 'headphone');
    for (let y = 3; y <= 7; y++) set(20, y, 'headphone');
    for (const y of [8, 9, 10]) {
      set(1, y, 'headphone-cup');
      set(2, y, 'headphone-cup');
      set(21, y, 'headphone-cup');
      set(22, y, 'headphone-cup');
    }
  }

  return grid;
}

function createDragonSprite() {
  const canvas = document.createElement('canvas');
  canvas.id = 'dragon-canvas';
  canvas.width = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d');

  const state = {
    blinking: false,
    mouthOpen: false,
    legPhase: 0,
    standing: false,
    palette: 'day',
    lookX: 0,
    lookY: 0,
    headphones: false,
    pose: null,
  };

  function draw() {
    const grid = buildFrame(state);
    const palette = PALETTES[state.palette];
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cat = grid[y][x];
        if (!cat) continue;
        ctx.fillStyle = palette[cat];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  draw();

  return {
    canvas,
    width: GRID_W * PIXEL,
    height: GRID_H * PIXEL,
    setBlinking(value) { state.blinking = value; draw(); },
    setMouthOpen(value) { state.mouthOpen = value; draw(); },
    setLegPhase(value) { state.legPhase = value; draw(); },
    setStanding(value) { state.standing = value; draw(); },
    setPalette(name) { state.palette = name; draw(); },
    setLook(lookX, lookY) { state.lookX = lookX; state.lookY = lookY; draw(); },
    setHeadphones(value) { state.headphones = value; draw(); },
    setPose(name) { state.pose = name; draw(); },
  };
}

window.PixelDragon = { create: createDragonSprite, PIXEL, GRID_W, GRID_H };
})();
