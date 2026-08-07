// Procedurally generates a small chibi citrus-slice (lemon/lime half) plushie as a low-res
// pixel grid, then paints it onto a canvas that CSS scales up with nearest-neighbor filtering
// (image-rendering: pixelated) for a crisp retro sprite look, same technique as dragon.js /
// avocado.js. A half-circle slice with the flat cut edge on top and the white-pith/yellow-flesh
// curve bulging downward — like a little bowl it sits on, same rounded-bottom silhouette
// language as the avocado — with two short brown legs poking out from underneath. No claws,
// no independent core layer (unlike the avocado, this character doesn't have a moving
// pit/eye element). Original character design (own silhouette, own palette) — not a
// reproduction of any existing artwork. No external art assets.
(function () {
const { inCircle, createGrid, computeOutlineCells, createSpriteCanvas, attachStandardSetters } = window.CharacterBase;

const GRID_W = 24;
const GRID_H = 24;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    rind: '#ffffff',
    flesh: '#f7e04a',
    leg: '#7a4a2e',
    cheek: '#ff9aa8',
    'eye-white': '#ffffff',
    'eye-pupil': '#241f21',
    outline: '#c9a227',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    rind: '#c9c9d8',
    flesh: '#b8a838',
    leg: '#54371f',
    cheek: '#c97a5a',
    'eye-white': '#dfe3f5',
    'eye-pupil': '#17172a',
    outline: '#8a6f1a',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

// Legs are intentionally left out of the outline pass below: at only 2px wide, every leg
// pixel has an empty neighbor on some side, so the "outline any silhouette pixel touching
// empty space" rule would recolor the *entire* leg to the outline color instead of leaving
// a brown fill with just an edge — legs stay a plain solid brown instead.
const SILHOUETTE_CATEGORIES = new Set(['rind', 'flesh']);

const CENTER_X = 12;
const CENTER_Y = 6;
const CUT_Y = 6; // flat top edge — only the bottom half of the circle is drawn
const OUTER_R = 10;
const INNER_R = 8;
const LEG_ATTACH_Y = 15; // just inside the curve's lowest reach at these leg columns

const LEFT_LEG_X = [9, 10];
const RIGHT_LEG_X = [13, 14];

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones }) {
  const { grid, set } = createGrid(GRID_W, GRID_H);

  // white pith ring around the curved edge, then yellow flesh inset — both clipped to the
  // bottom half of the circle so the fruit "sits" on its curve, flat cut edge up top
  for (let y = CUT_Y; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inCircle(x, y, CENTER_X, CENTER_Y, OUTER_R)) set(x, y, 'rind');
    }
  }
  for (let y = CUT_Y; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'rind' && inCircle(x, y, CENTER_X, CENTER_Y, INNER_R)) set(x, y, 'flesh');
    }
  }

  // two short legs, poking out from underneath the curve
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = LEG_ATTACH_Y - leftLift; y <= LEG_ATTACH_Y + 6 - leftLift; y++) set(x, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = LEG_ATTACH_Y - rightLift; y <= LEG_ATTACH_Y + 6 - rightLift; y++) set(x, y, 'leg');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = LEG_ATTACH_Y; y <= LEG_ATTACH_Y + 7; y++) set(x + swing, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = LEG_ATTACH_Y; y <= LEG_ATTACH_Y + 7; y++) set(x + swing, y, 'leg');
  }

  // ink outline: any silhouette pixel touching transparent space
  computeOutlineCells(grid, GRID_W, GRID_H, SILHOUETTE_CATEGORIES).forEach(([x, y]) => set(x, y, 'outline'));

  // stitched face, on the flesh, painted last so it always stays visible
  const colOffset = lookX > 0 ? 1 : 0;
  const rowOffset = lookY > 0 ? 1 : 0;
  if (blinking) {
    for (const x of [8, 9, 14, 15]) set(x, 11, 'outline');
  } else {
    for (const x of [8, 9]) {
      set(x, 10, 'eye-white');
      set(x, 11, 'eye-white');
    }
    set(8 + colOffset, 10 + rowOffset, 'eye-pupil');
    for (const x of [14, 15]) {
      set(x, 10, 'eye-white');
      set(x, 11, 'eye-white');
    }
    set(14 + colOffset, 10 + rowOffset, 'eye-pupil');
  }

  if (mouthOpen) {
    for (const x of [10, 11, 12, 13]) {
      set(x, 13, 'outline');
      set(x, 14, 'outline');
    }
  } else {
    for (const x of [10, 11, 12, 13]) set(x, 13, 'outline');
  }

  for (const x of [4, 5]) set(x, 11, 'cheek');
  for (const x of [18, 19]) set(x, 11, 'cheek');

  // headphones — band arcs over the flat top edge, cups sit just outside the silhouette
  // on both sides; always on top, independent of every other state
  if (headphones) {
    for (let x = 6; x <= 17; x++) set(x, 1, 'headphone');
    for (let x = 7; x <= 16; x++) set(x, 2, 'headphone');
    for (let y = 1; y <= 6; y++) {
      set(4, y, 'headphone');
      set(19, y, 'headphone');
    }
    for (let y = 4; y <= 7; y++) {
      set(1, y, 'headphone-cup');
      set(2, y, 'headphone-cup');
      set(3, y, 'headphone-cup');
      set(20, y, 'headphone-cup');
      set(21, y, 'headphone-cup');
      set(22, y, 'headphone-cup');
    }
  }

  return grid;
}

function createCitrusSprite() {
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

window.PixelCitrus = { create: createCitrusSprite, PIXEL, GRID_W, GRID_H };
})();
