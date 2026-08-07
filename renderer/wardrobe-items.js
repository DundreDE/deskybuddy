// Wardrobe item icons — same technique as props.js (small canvas painted with square pixels via
// grid/circle/rect helpers, then CSS-scaled with image-rendering:pixelated), but these are worn
// on the body instead of held/floating, so each one also carries a `cssPos` key (see
// .wardrobe-pos-* in style.css) saying roughly where on the sprite it belongs. Because every
// character's canvas is CSS-stretched to fill the same 120x140 #dragon-mount box regardless of
// its native pixel grid (see index.html/style.css #dragon-canvas), a single fixed position lines
// up "close enough" across all ten characters without needing per-character tailoring — same
// spirit as the generic (non-appliesTo) idle-pool entries.
//
// Unlock conditions and per-character exclusions live in wardrobe-catalog.js (shared with
// main.js), not here — this file only owns the pixel art.
(function () {
  const PIXEL = 5;

  function grid(w, h, paint) {
    const cells = Array.from({ length: h }, () => new Array(w).fill(null));
    const set = (x, y, color) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      cells[y][x] = color;
    };
    paint(set, w, h);
    return cells;
  }

  function circle(set, cx, cy, r, color) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) set(x, y, color);
      }
    }
  }

  function rect(set, x0, y0, x1, y1, color) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, color);
  }

  const ITEMS = {
    sunglasses: {
      w: 16,
      h: 6,
      cssPos: 'eyes',
      build(set) {
        rect(set, 0, 1, 6, 5, '#1a1a1a');
        rect(set, 9, 1, 15, 5, '#1a1a1a');
        rect(set, 6, 2, 9, 2, '#1a1a1a');
        set(2, 2, '#4a90d9');
        set(11, 2, '#4a90d9');
      },
    },
    umbrella: {
      w: 22,
      h: 20,
      cssPos: 'held',
      build(set) {
        // domed canopy built as a widening staircase (row by row) instead of a circle-then-clip
        // — much more predictable at this resolution than trying to clip a filled circle back
        // into a clean dome outline. Alternating red/white stripes computed per row so they
        // never need to be masked against the dome shape after the fact.
        const canopyRows = [
          [9, 12],
          [7, 14],
          [5, 16],
          [3, 18],
          [1, 20],
          [0, 21],
        ];
        canopyRows.forEach(([x0, x1], y) => {
          for (let x = x0; x <= x1; x++) {
            const stripe = Math.floor((x - x0) / 3) % 2 === 0;
            set(x, y, stripe ? '#d81e2c' : '#ffffff');
          }
        });
        rect(set, 0, 6, 21, 6, '#a81420'); // canopy rim shadow
        rect(set, 10, 7, 11, 17, '#5a3a24'); // handle shaft
        rect(set, 11, 15, 14, 16, '#5a3a24'); // hook
        rect(set, 14, 13, 15, 16, '#5a3a24');
      },
    },
    santaHat: {
      // cssPos is 'crown' (top:8px), not the more head-hugging position tried first (top:26px):
      // at that lower position, on some characters (citrus, bee, toast, croissant) the sprite's
      // own canvas intermittently painted as if empty — confirmed via getImageData (pixel data
      // was always correct) vs. the actual screenshot (body missing), a Chromium/software-
      // rendering compositing artifact tied to Y-overlap with the character canvas's
      // content-heavy region, not a logic bug. top:8px stays clear of that zone on every
      // character while still sitting close to the head.
      w: 16,
      h: 10,
      cssPos: 'crown',
      build(set) {
        rect(set, 1, 1, 14, 5, '#d81e2c'); // main cone
        rect(set, 3, 0, 12, 1, '#d81e2c'); // top taper
        rect(set, 0, 5, 15, 8, '#ffffff'); // fur brim
        circle(set, 13, 0, 3, '#ffffff'); // pompom, hanging off the top-right
      },
    },
  };

  function createWardrobeIcon(id) {
    const item = ITEMS[id];
    if (!item) return null;
    const cells = grid(item.w, item.h, item.build);
    const canvas = document.createElement('canvas');
    canvas.className = `wardrobe-icon wardrobe-pos-${item.cssPos}`;
    canvas.dataset.wardrobe = id;
    canvas.width = item.w;
    canvas.height = item.h;
    canvas.style.width = `${item.w * PIXEL}px`;
    canvas.style.height = `${item.h * PIXEL}px`;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < item.h; y++) {
      for (let x = 0; x < item.w; x++) {
        const color = cells[y][x];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  window.BuddyWardrobeItems = { create: createWardrobeIcon, ids: Object.keys(ITEMS), PIXEL };
})();
