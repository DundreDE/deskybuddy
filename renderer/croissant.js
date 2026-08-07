// Procedurally generates a small chibi croissant plushie as a low-res pixel grid, then paints
// it onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering:
// pixelated) for a crisp retro sprite look, same technique as dragon.js / avocado.js. A puffy
// golden crescent — deep amber caramelized tips, a glossy highlight sheen across the plump
// middle, a dusting of powdered sugar, and two short legs. Original character design (own
// silhouette, own palette) — not a reproduction of any existing artwork. No external art assets.
(function () {
const GRID_W = 22;
const GRID_H = 26;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    croissant: '#eab464',
    stripe: '#f6d38c',
    crust: '#a8662a',
    sugar: '#fff8e8',
    leg: '#d9b98c',
    cheek: '#ff9aa8',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#7a4a1a',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    croissant: '#9c7440',
    stripe: '#c2a06a',
    crust: '#6b3f1a',
    sugar: '#c9beac',
    leg: '#8a7250',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#402910',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

const SILHOUETTE_CATEGORIES = new Set(['croissant', 'stripe', 'crust', 'leg']);

const LEFT_LEG_X = [8, 9];
const RIGHT_LEG_X = [13, 14];

const SUGAR_SPOTS = [[7, 8], [15, 7], [11, 6], [6, 12], [17, 11], [12, 17]];

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

  // puffy crescent body: a wide oval with two deep notches carved from opposite corners so
  // the silhouette curves into tapered tips, banana/croissant-style, while the plump middle
  // stays intact for the face
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!inEllipse(x, y, 11, 14, 9, 8)) continue;
      if (inEllipse(x, y, 1, 16, 5, 7)) continue;
      if (inEllipse(x, y, 21, 7, 5, 6)) continue;
      set(x, y, 'croissant');
    }
  }

  // deep caramelized crust at both tapered tips, where a real croissant bakes darkest — the
  // thin sliver of body left just outside each carving notch, so it naturally hugs the curve
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] !== 'croissant') continue;
      if (inEllipse(x, y, 1, 16, 7, 9) || inEllipse(x, y, 21, 7, 7, 8)) set(x, y, 'crust');
    }
  }

  // a few sparse glossy highlight streaks across the plump middle, tracing the pastry's
  // laminated layers without turning the whole body into a checkerboard
  for (let y = 8; y <= 18; y++) {
    for (let x = 7; x <= 16; x++) {
      if (grid[y][x] === 'croissant' && ((x - y) % 7 === 0)) set(x, y, 'stripe');
    }
  }

  // two short legs
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 20 - leftLift; y <= 24 - leftLift; y++) set(x, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 20 - rightLift; y <= 24 - rightLift; y++) set(x, y, 'leg');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 21; y <= 25; y++) set(x + swing, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 21; y <= 25; y++) set(x + swing, y, 'leg');
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
    for (const x of [8, 9, 13, 14]) set(x, 10, 'outline');
  } else {
    for (const x of [8, 9]) {
      set(x, 9, 'eye-white');
      set(x, 10, 'eye-white');
    }
    set(8 + colOffset, 9 + rowOffset, 'eye-pupil');
    for (const x of [13, 14]) {
      set(x, 9, 'eye-white');
      set(x, 10, 'eye-white');
    }
    set(13 + colOffset, 9 + rowOffset, 'eye-pupil');
  }

  if (mouthOpen) {
    for (const x of [9, 10, 11, 12]) {
      set(x, 12, 'outline');
      set(x, 13, 'outline');
    }
  } else {
    for (const x of [9, 10, 11, 12]) set(x, 12, 'outline');
  }

  for (const x of [5, 6]) set(x, 10, 'cheek');
  for (const x of [16, 17]) set(x, 10, 'cheek');

  // powdered sugar dusting, always visible, independent of every other state
  SUGAR_SPOTS.forEach(([x, y]) => {
    if (grid[y] && grid[y][x]) set(x, y, 'sugar');
  });

  // headphones — the band arcs clear over the top, arms running down to cups; independent
  // of every other state
  if (headphones) {
    for (let x = 6; x <= 15; x++) set(x, 0, 'headphone');
    for (let x = 7; x <= 14; x++) set(x, 1, 'headphone');
    for (let y = 0; y <= 6; y++) {
      set(5, y, 'headphone');
      set(16, y, 'headphone');
    }
    for (let y = 4; y <= 7; y++) {
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

function createCroissantSprite() {
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

window.PixelCroissant = { create: createCroissantSprite, PIXEL, GRID_W, GRID_H };
})();
