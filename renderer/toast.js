// Procedurally generates a small chibi toast-slice plushie as a low-res pixel grid, then paints
// it onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering: pixelated)
// for a crisp retro sprite look, same technique as dragon.js / avocado.js. A rounded-arch bread
// slice with a darker crust ring, a butter pat melting on top, and two short legs. Original
// character design (own silhouette, own palette) — not a reproduction of any existing artwork.
// No external art assets.
(function () {
const GRID_W = 22;
const GRID_H = 26;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    crust: '#c17a2e',
    crumb: '#f2c973',
    butter: '#ffe14d',
    leg: '#c9a876',
    cheek: '#ff9aa8',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#6b3f18',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    crust: '#8a5620',
    crumb: '#b8935a',
    butter: '#c9a838',
    leg: '#8a7250',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#3a2210',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

const SILHOUETTE_CATEGORIES = new Set(['crust', 'crumb', 'leg']);

const LEFT_LEG_X = [8, 9];
const RIGHT_LEG_X = [13, 14];

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px + 0.5 - cx) / rx;
  const dy = (py + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones }) {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
  const set = (x, y, category) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    grid[y][x] = category;
  };

  // bread slice silhouette: arched top, straight sides/bottom
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (y < 9 ? inEllipse(x, y, 11, 9, 9, 9) : (x >= 2 && x <= 19 && y <= 24)) set(x, y, 'crust');
    }
  }
  // inset crumb, leaving a ~2px crust ring all around
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] !== 'crust') continue;
      const inset = y < 9 ? inEllipse(x, y, 11, 9, 7, 7) : (x >= 4 && x <= 17 && y <= 22);
      if (inset) set(x, y, 'crumb');
    }
  }

  // two short legs
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 17 - leftLift; y <= 24 - leftLift; y++) set(x, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 17 - rightLift; y <= 24 - rightLift; y++) set(x, y, 'leg');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 18; y <= 25; y++) set(x + swing, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 18; y <= 25; y++) set(x + swing, y, 'leg');
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

  for (const x of [4, 5]) set(x, 8, 'cheek');
  for (const x of [16, 17]) set(x, 8, 'cheek');

  // melting butter pat on top, always visible, independent of every other state
  for (let x = 8; x <= 13; x++) set(x, 1, 'butter');
  for (let x = 8; x <= 13; x++) set(x, 2, 'butter');
  set(9, 3, 'butter');
  set(12, 3, 'butter');

  // headphones — the band arcs clear over the top, arms running down to cups; independent
  // of every other state
  if (headphones) {
    for (let x = 6; x <= 15; x++) set(x, 0, 'headphone');
    for (let x = 7; x <= 14; x++) set(x, 1, 'headphone');
    for (let y = 0; y <= 4; y++) {
      set(5, y, 'headphone');
      set(16, y, 'headphone');
    }
    for (let y = 0; y <= 3; y++) {
      set(1, y, 'headphone-cup');
      set(2, y, 'headphone-cup');
      set(3, y, 'headphone-cup');
      set(4, y, 'headphone-cup');
      set(GRID_W - 2, y, 'headphone-cup');
      set(GRID_W - 3, y, 'headphone-cup');
      set(GRID_W - 4, y, 'headphone-cup');
      set(GRID_W - 5, y, 'headphone-cup');
    }
  }

  return grid;
}

function createToastSprite() {
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
  };
}

window.PixelToast = { create: createToastSprite, PIXEL, GRID_W, GRID_H };
})();
