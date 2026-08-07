// Procedurally generates a small chibi cloud plushie as a low-res pixel grid, then paints it
// onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering: pixelated)
// for a crisp retro sprite look, same technique as dragon.js / avocado.js. A fluffy white blob
// (union of overlapping circles) with a striped rainbow scarf around its neck and two short grey
// teardrop feet. Original character design (own silhouette, own palette) — not a reproduction of
// any existing artwork. No external art assets.
(function () {
const { inEllipse, createGrid, computeOutlineCells, createSpriteCanvas, attachStandardSetters } = window.CharacterBase;

const GRID_W = 22;
const GRID_H = 26;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    cloud: '#ffffff',
    drop: '#b8c4d9',
    scarf0: '#ff6b6b',
    scarf1: '#ffd166',
    scarf2: '#7ed957',
    scarf3: '#6ab7ff',
    cheek: '#ff9aa8',
    'eye-white': '#f4f7fc',
    'eye-pupil': '#241f21',
    outline: '#9aa8bd',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    cloud: '#c9c9d8',
    drop: '#7a869c',
    scarf0: '#b8504f',
    scarf1: '#b8963f',
    scarf2: '#4f8a4f',
    scarf3: '#4a7fb0',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#5a6478',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

const SILHOUETTE_CATEGORIES = new Set(['cloud', 'drop']);
const SCARF_COLORS = ['scarf0', 'scarf1', 'scarf2', 'scarf3'];

const LEFT_LEG_X = [8, 9];
const RIGHT_LEG_X = [13, 14];

// Fluffy silhouette: union of a wide main body plus several overlapping bumps around the rim.
const BUMPS = [
  [11, 13, 8, 7],
  [4, 13, 4, 4],
  [18, 13, 4, 4],
  [7, 6, 4.5, 4.5],
  [15, 6, 4.5, 4.5],
  [11, 4, 4.5, 4],
];

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones }) {
  const { grid, set } = createGrid(GRID_W, GRID_H);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (BUMPS.some(([cx, cy, rx, ry]) => inEllipse(x, y, cx, cy, rx, ry))) set(x, y, 'cloud');
    }
  }

  // two short teardrop feet
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 18 - leftLift; y <= 22 - leftLift; y++) set(x, y, 'drop');
    for (const x of RIGHT_LEG_X) for (let y = 18 - rightLift; y <= 22 - rightLift; y++) set(x, y, 'drop');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 19; y <= 23; y++) set(x + swing, y, 'drop');
    for (const x of RIGHT_LEG_X) for (let y = 19; y <= 23; y++) set(x + swing, y, 'drop');
  }

  // ink outline: any silhouette pixel touching transparent space
  computeOutlineCells(grid, GRID_W, GRID_H, SILHOUETTE_CATEGORIES).forEach(([x, y]) => set(x, y, 'outline'));

  // stitched face, painted last so it always stays visible
  const colOffset = lookX > 0 ? 1 : 0;
  const rowOffset = lookY > 0 ? 1 : 0;
  if (blinking) {
    for (const x of [8, 9, 13, 14]) set(x, 8, 'outline');
  } else {
    for (const x of [8, 9]) {
      set(x, 7, 'eye-white');
      set(x, 8, 'eye-white');
    }
    set(8 + colOffset, 7 + rowOffset, 'eye-pupil');
    for (const x of [13, 14]) {
      set(x, 7, 'eye-white');
      set(x, 8, 'eye-white');
    }
    set(13 + colOffset, 7 + rowOffset, 'eye-pupil');
  }

  if (mouthOpen) {
    for (const x of [9, 10, 11, 12]) {
      set(x, 10, 'outline');
      set(x, 11, 'outline');
    }
  } else {
    for (const x of [9, 10, 11, 12]) set(x, 10, 'outline');
  }

  for (const x of [4, 5]) set(x, 9, 'cheek');
  for (const x of [16, 17]) set(x, 9, 'cheek');

  // striped rainbow scarf around the neck, always visible, independent of every other state
  for (let x = 4; x <= 17; x++) {
    if (grid[13][x] !== 'outline') set(x, 13, SCARF_COLORS[x % 4]);
    if (grid[14][x] !== 'outline') set(x, 14, SCARF_COLORS[(x + 1) % 4]);
  }
  set(10, 15, SCARF_COLORS[2]);
  set(11, 15, SCARF_COLORS[3]);
  set(10, 16, SCARF_COLORS[1]);
  set(11, 16, SCARF_COLORS[2]);

  // headphones — the band arcs clear over the top, arms running down to cups; independent
  // of every other state
  if (headphones) {
    for (let x = 6; x <= 15; x++) set(x, 0, 'headphone');
    for (let x = 7; x <= 14; x++) set(x, 1, 'headphone');
    for (let y = 0; y <= 4; y++) {
      set(4, y, 'headphone');
      set(17, y, 'headphone');
    }
    for (let y = 0; y <= 3; y++) {
      set(0, y, 'headphone-cup');
      set(1, y, 'headphone-cup');
      set(2, y, 'headphone-cup');
      set(3, y, 'headphone-cup');
      set(GRID_W - 1, y, 'headphone-cup');
      set(GRID_W - 2, y, 'headphone-cup');
      set(GRID_W - 3, y, 'headphone-cup');
      set(GRID_W - 4, y, 'headphone-cup');
    }
  }

  return grid;
}

function createWolkeSprite() {
  const { canvas, ctx } = createSpriteCanvas(GRID_W, GRID_H);

  const state = {
    blinking: false,
    mouthOpen: false,
    legPhase: 0,
    standing: false,
    palette: 'day',
    lookX: 0,
    lookY: 0,
    headphones: false,
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

  const api = { canvas, width: GRID_W * PIXEL, height: GRID_H * PIXEL };
  attachStandardSetters(api, state, draw);
  return api;
}

window.PixelWolke = { create: createWolkeSprite, PIXEL, GRID_W, GRID_H };
})();
