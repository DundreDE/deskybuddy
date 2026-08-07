// Procedurally generates a small chibi monkey plushie as a low-res pixel grid, then paints it
// onto a canvas that CSS scales up with nearest-neighbor filtering (image-rendering: pixelated)
// for a crisp retro sprite look, same technique as dragon.js / avocado.js / citrus.js / bee.js.
// Grid is 24x28 like the crab and the bee so the fixed 120x140 mount renders exactly square
// 5px cells. Dark brown shaggy fur on head/body/arms/legs, cream patches at the muzzle, inner
// ears, palms and soles, big solid black embroidered eyes/nose and a stitched smiling mouth.
// Arms are a rounded shoulder cap + straight strip + hand cap painted *over* the body ellipse
// (rather than as separate columns far outside it), so they read as limbs resting against the
// torso instead of floating bars next to it. Original character design (own silhouette, own
// palette) — not a reproduction of any existing artwork/toy. No external art assets.
(function () {
const GRID_W = 24;
const GRID_H = 28;
const PIXEL = 5; // on-screen size of one sprite pixel, in real CSS px

const PALETTES = {
  day: {
    head: '#5a3a24',
    earOuter: '#5a3a24',
    earInner: '#f0dcb8',
    muzzle: '#f0dcb8',
    body: '#5a3a24',
    arm: '#5a3a24',
    palm: '#f0dcb8',
    leg: '#5a3a24',
    sole: '#f0dcb8',
    eye: '#1a1512',
    'eye-shine': '#ffffff',
    nose: '#1a1512',
    outline: '#2e1f14',
    headphone: '#3a3438',
    'headphone-cup': '#5a5258',
  },
  night: {
    head: '#3a271a',
    earOuter: '#3a271a',
    earInner: '#a8927a',
    muzzle: '#a8927a',
    body: '#3a271a',
    arm: '#3a271a',
    palm: '#a8927a',
    leg: '#3a271a',
    sole: '#a8927a',
    eye: '#0d0b09',
    'eye-shine': '#c9c9d8',
    nose: '#0d0b09',
    outline: '#1f150e',
    headphone: '#232025',
    'headphone-cup': '#3f3941',
  },
};

// Legs/palms/soles are deliberately left out of the outline pass: they're only 2px wide, so the
// "outline any silhouette pixel touching empty space" rule would recolor them entirely instead
// of leaving a plain fill with a defined edge — same reasoning as the bee's legs/arm stubs and
// the crab's claws. The head/ears/body/arms are wide enough to keep their fur fill with a proper
// ink edge, and the arm needs it since it forms part of the outer silhouette below the shoulder.
const SILHOUETTE_CATEGORIES = new Set(['head', 'earOuter', 'body', 'arm']);

const LEFT_LEG_X = [9, 10];
const RIGHT_LEG_X = [13, 14];

// Shoulder cap center, straight-strip columns, and hand cap center for the left arm; the right
// arm mirrors every one of these across the grid's vertical center.
const LEFT_SHOULDER = { cx: 6, cy: 14, r: 2.3 };
const LEFT_ARM_COLS = [5, 6];
const ARM_TOP_Y = 14;
const ARM_BOTTOM_Y = 21;
const LEFT_HAND = { cx: 5.5, cy: 21, r: 1.6 };

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px + 0.5 - cx) / rx;
  const dy = (py + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function mirrorX(x) {
  return GRID_W - 1 - x;
}

function buildFrame({ blinking, mouthOpen, legPhase, standing, lookX = 0, lookY = 0, headphones }) {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
  const set = (x, y, category) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    grid[y][x] = category;
  };

  // body, painted before the arms so the arms visibly rest against/over the torso instead of
  // floating next to it
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 12, 18, 6, 7)) set(x, y, 'body');
    }
  }

  // arms: a rounded shoulder cap blends into the body, a straight strip continues down the
  // side, a rounded hand cap ends it. Painted on top of the body so the whole limb — including
  // the part that overlaps the torso ellipse — reads as one continuous shape attached at the
  // shoulder, then the head (painted next) covers the topmost sliver where the cap tucks under
  // the neck.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, LEFT_SHOULDER.cx, LEFT_SHOULDER.cy, LEFT_SHOULDER.r, LEFT_SHOULDER.r)) set(x, y, 'arm');
      if (inEllipse(x, y, mirrorX(LEFT_SHOULDER.cx), LEFT_SHOULDER.cy, LEFT_SHOULDER.r, LEFT_SHOULDER.r)) set(x, y, 'arm');
    }
  }
  for (const x of LEFT_ARM_COLS) for (let y = ARM_TOP_Y; y <= ARM_BOTTOM_Y; y++) set(x, y, 'arm');
  for (const x of LEFT_ARM_COLS.map(mirrorX)) for (let y = ARM_TOP_Y; y <= ARM_BOTTOM_Y; y++) set(x, y, 'arm');
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, LEFT_HAND.cx, LEFT_HAND.cy, LEFT_HAND.r, LEFT_HAND.r)) set(x, y, 'palm');
      if (inEllipse(x, y, mirrorX(LEFT_HAND.cx), LEFT_HAND.cy, LEFT_HAND.r, LEFT_HAND.r)) set(x, y, 'palm');
    }
  }

  // round shaggy head, painted on top so it covers the arms' shoulder attachment
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 12, 7, 6, 6)) set(x, y, 'head');
    }
  }

  // round ears on both sides of the head, cream inner patch painted on top
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 3, 6, 2.6, 2.6)) set(x, y, 'earOuter');
      if (inEllipse(x, y, 20, 6, 2.6, 2.6)) set(x, y, 'earOuter');
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'earOuter' && inEllipse(x, y, 3, 6, 1.2, 1.2)) set(x, y, 'earInner');
      if (grid[y][x] === 'earOuter' && inEllipse(x, y, 20, 6, 1.2, 1.2)) set(x, y, 'earInner');
    }
  }

  // cream muzzle patch, only painted over the head so it never eats the outer head edge
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'head' && inEllipse(x, y, 12, 10.5, 3.4, 2.6)) set(x, y, 'muzzle');
    }
  }

  // two short legs, poking out from underneath the body
  if (standing) {
    const leftLift = legPhase === 0 ? 1 : 0;
    const rightLift = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 25 - leftLift; y <= 27 - leftLift; y++) set(x, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 25 - rightLift; y <= 27 - rightLift; y++) set(x, y, 'leg');
  } else {
    const swing = legPhase === 1 ? 1 : 0;
    for (const x of LEFT_LEG_X) for (let y = 25; y <= 27; y++) set(x + swing, y, 'leg');
    for (const x of RIGHT_LEG_X) for (let y = 25; y <= 27; y++) set(x + swing, y, 'leg');
  }
  for (const x of LEFT_LEG_X) set(x, 27, 'sole');
  for (const x of RIGHT_LEG_X) set(x, 27, 'sole');

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

  // big embroidered eyes, painted last so they always stay visible. lookX/lookY (-1/0/1) shift
  // a small white shine pixel inside the otherwise solid black eye.
  const colOffset = lookX > 0 ? 1 : lookX < 0 ? -1 : 0;
  const rowOffset = lookY > 0 ? 1 : 0;
  if (blinking) {
    for (const x of [7, 8, 9, 15, 16, 17]) set(x, 7, 'outline');
  } else {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (inEllipse(x, y, 8, 7, 1.7, 1.7)) set(x, y, 'eye');
        if (inEllipse(x, y, 16, 7, 1.7, 1.7)) set(x, y, 'eye');
      }
    }
    set(8 + colOffset, 6 + rowOffset, 'eye-shine');
    set(16 + colOffset, 6 + rowOffset, 'eye-shine');
  }

  // small stitched nose under the muzzle
  for (const x of [11, 12]) set(x, 11, 'nose');

  // stitched smiling mouth
  if (mouthOpen) {
    for (const x of [10, 11, 12, 13]) {
      set(x, 12, 'outline');
      set(x, 13, 'outline');
    }
  } else {
    for (const x of [9, 10]) set(x, 13, 'outline');
    for (const x of [11, 12, 13, 14]) set(x, 12, 'outline');
    for (const x of [15, 16]) set(x, 13, 'outline');
  }

  // headphones — band arcs over the top of the head, cups sit outside the ears on both sides;
  // always on top, independent of every other state
  if (headphones) {
    for (let x = 7; x <= 16; x++) set(x, 0, 'headphone');
    for (let x = 6; x <= 17; x++) set(x, 1, 'headphone');
    for (let y = 1; y <= 6; y++) {
      set(1, y, 'headphone');
      set(22, y, 'headphone');
    }
    for (let y = 4; y <= 7; y++) {
      for (const x of [0, 1, 2]) set(x, y, 'headphone-cup');
      for (const x of [21, 22, 23]) set(x, y, 'headphone-cup');
    }
  }

  return grid;
}

function createMonkeySprite() {
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

window.PixelMonkey = { create: createMonkeySprite, PIXEL, GRID_W, GRID_H };
})();
