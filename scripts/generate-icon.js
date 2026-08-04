// Builds a static app icon (build/icon.png, 1024x1024) from the same procedural pixel-art
// crab silhouette as renderer/dragon.js's "day" resting pose, without needing a DOM/canvas.
// electron-builder auto-generates .ico (Windows) and .icns (macOS) from this single PNG.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GRID_W = 24;
const GRID_H = 28;

const PALETTE = {
  body: [0xff, 0x7a, 0x45, 255],
  belly: [0xff, 0xd9, 0xa8, 255],
  claw: [0xff, 0x94, 0x66, 255],
  cheek: [0xff, 0x5f, 0x7a, 255],
  'eye-white': [0xff, 0xff, 0xff, 255],
  'eye-pupil': [0x24, 0x1f, 0x21, 255],
  outline: [0x7a, 0x2e, 0x12, 255],
};

const SILHOUETTE_CATEGORIES = new Set(['body', 'belly', 'claw']);
const SIDE_LEGS_LEFT = [[6, 19], [6, 20], [7, 20], [7, 21], [8, 19], [8, 20]];
const SIDE_LEGS_RIGHT = SIDE_LEGS_LEFT.map(([x, y]) => [GRID_W - 1 - x, y]);

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px + 0.5 - cx) / rx;
  const dy = (py + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function buildGrid() {
  const grid = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
  const set = (x, y, category) => {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return;
    grid[y][x] = category;
  };

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 2.4, 16, 3.4, 4.6)) set(x, y, 'claw');
      if (inEllipse(x, y, GRID_W - 2.4, 16, 3.4, 4.6)) set(x, y, 'claw');
    }
  }
  set(2, 14, 'outline');
  set(2, 15, 'outline');
  set(GRID_W - 3, 14, 'outline');
  set(GRID_W - 3, 15, 'outline');

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (inEllipse(x, y, 11.5, 13, 9.8, 6.8)) set(x, y, 'body');
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'body' && inEllipse(x, y, 11.5, 15.5, 5.2, 3.4)) set(x, y, 'belly');
    }
  }

  set(8, 7, 'body');
  set(15, 7, 'body');
  SIDE_LEGS_LEFT.forEach(([x, y]) => set(x, y, 'body'));
  SIDE_LEGS_RIGHT.forEach(([x, y]) => set(x, y, 'body'));

  for (const x of [9, 10]) for (let y = 19; y <= 27; y++) set(x, y, 'body');
  for (const x of [13, 14]) for (let y = 19; y <= 27; y++) set(x, y, 'body');

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

  for (const x of [7, 8, 9]) set(x, 4, 'eye-white');
  for (const x of [7, 8, 9]) set(x, 5, 'eye-white');
  for (const x of [7, 8, 9]) set(x, 6, 'eye-white');
  set(8, 5, 'eye-pupil');
  for (const x of [14, 15, 16]) set(x, 4, 'eye-white');
  for (const x of [14, 15, 16]) set(x, 5, 'eye-white');
  for (const x of [14, 15, 16]) set(x, 6, 'eye-white');
  set(15, 5, 'eye-pupil');

  for (const x of [4, 5]) set(x, 12, 'cheek');
  for (const x of [18, 19]) set(x, 12, 'cheek');

  for (const x of [10, 11, 12, 13]) set(x, 17, 'outline');

  return grid;
}

function renderRGBA(size) {
  const grid = buildGrid();
  // The sprite grid itself has zero margin (claws/legs touch its edges by design), so add
  // breathing room on all sides, then center that padded box in a square before upscaling.
  const MARGIN = 4;
  const boxW = GRID_W + MARGIN * 2;
  const boxH = GRID_H + MARGIN * 2;
  const srcSize = Math.max(boxW, boxH);
  const offX = Math.floor((srcSize - boxW) / 2) + MARGIN;
  const offY = Math.floor((srcSize - boxH) / 2) + MARGIN;
  const px = Buffer.alloc(size * size * 4); // transparent by default

  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      const sx = Math.floor((ox / size) * srcSize) - offX;
      const sy = Math.floor((oy / size) * srcSize) - offY;
      const cat = sx >= 0 && sx < GRID_W && sy >= 0 && sy < GRID_H ? grid[sy][sx] : null;
      const idx = (oy * size + ox) * 4;
      if (cat) {
        const [r, g, b, a] = PALETTE[cat];
        px[idx] = r; px[idx + 1] = g; px[idx + 2] = b; px[idx + 3] = a;
      }
    }
  }
  return px;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const SIZE = 1024;
const outPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePNG(SIZE, renderRGBA(SIZE)));
console.log('Wrote', outPath);
