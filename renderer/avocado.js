// Procedurally generates a small chibi avocado-half plushie as a low-res pixel grid, then
// paints it onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering:
// pixelated) for a crisp 16-bit / retro sprite look. Original character design (own silhouette,
// own palette) — not a reproduction of any existing artwork. No external art assets.
(function () {
const GRID_W = 22;
const GRID_H = 26;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    skin: '#4c7a3a',
    flesh: '#bcd873',
    pit: '#5a3a24',
    leg: '#d9b48f',
    hat: '#dd2c2c',
    pompom: '#b71f1f',
    cheek: '#ff9aa8',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#2e4a22',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    skin: '#3a4a30',
    flesh: '#8fae7a',
    pit: '#3a2a20',
    leg: '#a89a80',
    hat: '#8a3a2a',
    pompom: '#6e2f22',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#1f2a1f',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

const SILHOUETTE_CATEGORIES = new Set(['skin', 'flesh', 'pit', 'leg']);

const LEFT_LEG_X = [8, 9];
const RIGHT_LEG_X = [13, 14];

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px + 0.5 - cx) / rx;
  const dy = (py + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones, core = {} }) {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
  const set = (x, y, category) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    grid[y][x] = category;
  };

  // outer rind, inset flesh, and the pit sitting in the middle of the fruit
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 11, 14, 9, 11)) set(x, y, 'skin');
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'skin' && inEllipse(x, y, 11, 13.5, 7.3, 9.3)) set(x, y, 'flesh');
    }
  }
  // Core (pit) layer: driven independently of body pose/idle-animation state by
  // core.dx/dy/scaleX/scaleY/hidden — see idle-director.js. Defaults reproduce the
  // original static centered pit exactly.
  if (!core.hidden) {
    const { dx = 0, dy = 0, scaleX = 1, scaleY = 1 } = core;
    const cx = 11 + dx;
    const cy = 17 + dy;
    const rx = 3.6 * scaleX;
    const ry = 3.6 * scaleY;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x] === 'flesh' && inEllipse(x, y, cx, cy, rx, ry)) set(x, y, 'pit');
      }
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

  // stitched face, on the flesh above the pit, painted last so it always stays visible.
  // Each eye is only 2 columns x 2 rows, so lookX/lookY (-1/0/1) collapse to the
  // two available slots instead of the 3-wide scheme the crab's eyes use.
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

  // red knit hat with two round pompom balls, one on each side — always worn,
  // independent of every other state
  for (let y = 0; y <= 3; y++) {
    for (let x = 5; x <= 16; x++) set(x, y, 'hat');
  }
  for (let x = 4; x <= 17; x++) set(x, 4, 'hat');

  const LEFT_POMPOM = [[2, 0], [3, 0], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3]];
  const RIGHT_POMPOM = LEFT_POMPOM.map(([x, y]) => [GRID_W - 1 - x, y]);
  LEFT_POMPOM.forEach(([x, y]) => set(x, y, 'pompom'));
  RIGHT_POMPOM.forEach(([x, y]) => set(x, y, 'pompom'));

  // headphones — the band arcs clear over the top of the hat, with the arms running
  // down both sides to cups that replace the pompoms; independent of every other state
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

function createAvocadoSprite() {
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
    core: {},
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
    // core: { dx, dy, scaleX, scaleY, hidden } — partial updates merge onto current core state.
    setCore(partial) { state.core = { ...state.core, ...partial }; draw(); },
    resetCore() { state.core = {}; draw(); },
  };
}

window.PixelAvocado = { create: createAvocadoSprite, PIXEL, GRID_W, GRID_H };
})();
