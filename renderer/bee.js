// Procedurally generates a small chibi bee plushie as a low-res pixel grid, then paints it
// onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering: pixelated)
// for a crisp retro sprite look, same technique as dragon.js / avocado.js / citrus.js. Grid is
// 24x28 like the crab so the fixed 120x140 mount renders exactly square 5px cells.
//
// The round plush body is split into four horizontal bands: yellow head, black band carrying
// the arm stubs, yellow mid-belly, black bottom band the legs come out of. Wings and arm stubs
// are painted *before* the body so the body overlaps their attachment point and only the outer
// part shows — same "painted first" trick the crab uses for its claws. The neckerchief color is
// configurable per settings (setCollarColor). Original character design (own silhouette, own
// palette) — not a reproduction of any existing artwork. No external art assets.
(function () {
const { inEllipse, createGrid, computeOutlineCells, createSpriteCanvas, attachStandardSetters } = window.CharacterBase;

const GRID_W = 24;
const GRID_H = 28;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const DEFAULT_COLLAR = '#8fd6ff';

const PALETTES = {
  day: {
    head: '#f7e04a',
    armBand: '#2a2620',
    belly: '#f7e04a',
    legBand: '#2a2620',
    leg: '#2a2620',
    armStub: '#2a2620',
    antenna: '#2a2620',
    wing: '#ffffff',
    cheek: '#ff9aa8',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#8a6f1a',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    head: '#b8a838',
    armBand: '#18150f',
    belly: '#b8a838',
    legBand: '#18150f',
    leg: '#18150f',
    armStub: '#18150f',
    antenna: '#18150f',
    wing: '#c9c9d8',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#5a4a12',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

// Legs and arm stubs are deliberately left out of the outline pass: they are only 2-3px across,
// so the "outline any silhouette pixel touching empty space" rule would recolor them entirely
// instead of leaving a black fill with an edge — same reasoning as the citrus slice's legs.
// The wings are wide enough to keep a white core, and being white they need the edge to read.
const SILHOUETTE_CATEGORIES = new Set(['head', 'armBand', 'belly', 'legBand', 'wing']);
const BODY_CATEGORIES = new Set(['head', 'armBand', 'belly', 'legBand']);

const CENTER_X = 12;
const CENTER_Y = 13;
const RX = 7;
const RY = 9;

// Band boundaries, top-down: yellow head / black arm band / yellow belly / black leg band.
const HEAD_BOTTOM = 11;
const ARM_BAND_BOTTOM = 15;
const BELLY_BOTTOM = 19;

const LEFT_LEG_X = [9, 10];
const RIGHT_LEG_X = [13, 14];

const COLLAR_ROWS = [11, 12];
const COLLAR_KNOT = [[11, 13], [12, 13], [11, 14], [12, 14]];

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones, collarColor }) {
  const { grid, set } = createGrid(GRID_W, GRID_H);
  const mirror = (x) => GRID_W - 1 - x;

  // wings on the back, painted first so the body covers their attachment point and only the
  // outer rounded part stays visible on each side
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 4, 10, 3, 3.5)) {
        set(x, y, 'wing');
        set(mirror(x), y, 'wing');
      }
    }
  }

  // little black arm stubs poking out of the black band, also painted behind the body
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 4.5, 15, 2.3, 2.3)) {
        set(x, y, 'armStub');
        set(mirror(x), y, 'armStub');
      }
    }
  }

  // round plush body, split into the four horizontal bands
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!inEllipse(x, y, CENTER_X, CENTER_Y, RX, RY)) continue;
      if (y <= HEAD_BOTTOM) set(x, y, 'head');
      else if (y <= ARM_BAND_BOTTOM) set(x, y, 'armBand');
      else if (y <= BELLY_BOTTOM) set(x, y, 'belly');
      else set(x, y, 'legBand');
    }
  }

  // two short legs, poking out from underneath the black bottom band
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 19 - leftLift; y <= 25 - leftLift; y++) set(x, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 19 - rightLift; y <= 25 - rightLift; y++) set(x, y, 'leg');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 20; y <= 26; y++) set(x + swing, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 20; y <= 26; y++) set(x + swing, y, 'leg');
  }

  // ink outline: any silhouette pixel touching transparent space
  computeOutlineCells(grid, GRID_W, GRID_H, SILHOUETTE_CATEGORIES).forEach(([x, y]) => set(x, y, 'outline'));

  // stitched face, on the yellow head band, painted last so it always stays visible. Each eye is
  // only 2 columns x 2 rows, so lookX/lookY (-1/0/1) collapse to the two available slots, same
  // as the avocado and the citrus slice.
  const colOffset = lookX > 0 ? 1 : 0;
  const rowOffset = lookY > 0 ? 1 : 0;
  if (blinking) {
    for (const x of [8, 9, 14, 15]) set(x, 8, 'outline');
  } else {
    for (const x of [8, 9]) {
      set(x, 7, 'eye-white');
      set(x, 8, 'eye-white');
    }
    set(8 + colOffset, 7 + rowOffset, 'eye-pupil');
    for (const x of [14, 15]) {
      set(x, 7, 'eye-white');
      set(x, 8, 'eye-white');
    }
    set(14 + colOffset, 7 + rowOffset, 'eye-pupil');
  }

  for (const x of [6, 7]) set(x, 9, 'cheek');
  for (const x of [16, 17]) set(x, 9, 'cheek');

  if (mouthOpen) {
    for (const x of [10, 11, 12, 13]) {
      set(x, 10, 'outline');
      set(x, 11, 'outline');
    }
  } else {
    for (const x of [10, 11, 12, 13]) set(x, 10, 'outline');
  }

  // neckerchief at the head/arm-band seam, with a small knot hanging below it. Only painted over
  // body pixels, so it never eats the silhouette outline at the edges. Color comes from settings.
  for (const y of COLLAR_ROWS) {
    for (let x = 0; x < GRID_W; x++) {
      if (BODY_CATEGORIES.has(grid[y][x])) set(x, y, 'collar');
    }
  }
  COLLAR_KNOT.forEach(([x, y]) => set(x, y, 'collar'));

  // two antennae with round tips. Kept out of the outline pass for the same 1px-wide reason as
  // the legs — they stay plain black.
  for (let y = 1; y <= 3; y++) {
    set(9, y, 'antenna');
    set(14, y, 'antenna');
  }
  for (const x of [8, 9]) set(x, 0, 'antenna');
  for (const x of [14, 15]) set(x, 0, 'antenna');

  // headphones — band arcs over the antennae, cups sit outside the silhouette on both sides;
  // always on top, independent of every other state
  if (headphones) {
    for (let x = 6; x <= 17; x++) set(x, 1, 'headphone');
    for (let x = 7; x <= 16; x++) set(x, 2, 'headphone');
    for (let y = 1; y <= 7; y++) {
      set(4, y, 'headphone');
      set(19, y, 'headphone');
    }
    for (let y = 4; y <= 7; y++) {
      for (const x of [1, 2, 3]) {
        set(x, y, 'headphone-cup');
        set(mirror(x), y, 'headphone-cup');
      }
    }
  }

  return { grid, collarColor: collarColor || DEFAULT_COLLAR };
}

function createBeeSprite() {
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
    collarColor: DEFAULT_COLLAR,
  };

  function draw() {
    const { grid, collarColor } = buildFrame(state);
    const palette = PALETTES[state.palette];
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const cat = grid[y][x];
        if (!cat) continue;
        // 'collar' is the one category whose color comes from settings instead of the palette.
        ctx.fillStyle = cat === 'collar' ? collarColor : palette[cat];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  draw();

  const api = { canvas, width: GRID_W * PIXEL, height: GRID_H * PIXEL };
  attachStandardSetters(api, state, draw);
  api.setCollarColor = (hex) => { state.collarColor = hex || DEFAULT_COLLAR; draw(); };
  return api;
}

window.PixelBee = { create: createBeeSprite, PIXEL, GRID_W, GRID_H, DEFAULT_COLLAR };
})();
