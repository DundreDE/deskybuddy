// Generic prop/accessory-layer icons for the idle-animation pool. Same technique as the
// existing laptop accessory in renderer.js (a small canvas painted with square pixels,
// then CSS-scaled with image-rendering:pixelated) but generalized into a small registry
// so idle-pool.js can request any of them by name. Each prop is its own tiny canvas that
// idle-director.js positions/shows/hides independently of the body sprite's own animation —
// this is the "Accessory-Layer" from the spec, just reused beyond laptop/headphones.
(function () {
  const PROP_PIXEL = 4;

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

  // Each builder returns a 2D array of CSS colors (or null for transparent).
  const BUILDERS = {
    book: (set) => {
      rect(set, 0, 0, 13, 9, '#7a4a2e');
      rect(set, 1, 1, 12, 8, '#f2e8d5');
      rect(set, 6, 1, 7, 8, '#c0392b');
    },
    mug: (set) => {
      rect(set, 1, 2, 7, 9, '#eeeeee');
      rect(set, 1, 2, 7, 3, '#8a5a2e');
      rect(set, 8, 3, 10, 7, '#eeeeee');
      rect(set, 9, 4, 9, 6, null);
    },
    pen: (set) => {
      rect(set, 4, 0, 6, 8, '#2b6fb0');
      rect(set, 4, 8, 6, 9, '#c0c0c0');
      set(5, 9, '#f2c14e');
    },
    plane: (set) => {
      set(6, 0, '#ffffff');
      rect(set, 5, 1, 7, 1, '#ffffff');
      rect(set, 3, 2, 9, 2, '#ffffff');
      rect(set, 1, 3, 11, 3, '#e8e8e8');
      rect(set, 4, 4, 8, 5, '#ffffff');
    },
    ball: (set) => {
      circle(set, 5, 5, 5, '#f2c14e');
      circle(set, 5, 5, 5, '#f2c14e');
      set(3, 3, '#ffe6a0');
      set(2, 6, '#c98f1e');
      set(7, 7, '#c98f1e');
    },
    sketchpad: (set) => {
      rect(set, 0, 0, 11, 13, '#f2e8d5');
      rect(set, 0, 0, 11, 1, '#c9bfa5');
      rect(set, 2, 5, 5, 5, '#8a8a8a');
      rect(set, 6, 8, 9, 8, '#8a8a8a');
      rect(set, 3, 9, 6, 9, '#8a8a8a');
    },
    puzzle: (set) => {
      rect(set, 0, 0, 11, 11, '#f2e8d5');
      for (let i = 0; i <= 11; i += 3) rect(set, i, 0, i, 11, '#c9bfa5');
      for (let i = 0; i <= 11; i += 3) rect(set, 0, i, 11, i, '#c9bfa5');
      set(1, 1, '#5a5a5a');
      set(4, 4, '#5a5a5a');
      set(7, 2, '#5a5a5a');
      set(2, 8, '#5a5a5a');
    },
    plant: (set) => {
      rect(set, 2, 8, 8, 12, '#b5651d');
      rect(set, 1, 12, 9, 13, '#8a4a12');
      circle(set, 5, 6, 3, '#3f8f3f');
      circle(set, 2, 4, 2, '#4fa84f');
      circle(set, 8, 4, 2, '#4fa84f');
    },
    can: (set) => {
      rect(set, 1, 3, 7, 9, '#5a8fbf');
      rect(set, 6, 0, 10, 2, '#3f6f9f');
      rect(set, 9, 0, 11, 0, '#3f6f9f');
    },
    snack: (set) => {
      circle(set, 5, 5, 5, '#e0b060');
      set(3, 3, '#7a4a2e');
      set(6, 3, '#7a4a2e');
      set(5, 6, '#7a4a2e');
      set(2, 6, '#7a4a2e');
      set(7, 7, '#7a4a2e');
    },
    clock: (set) => {
      circle(set, 5, 5, 5, '#f2f2f2');
      circle(set, 5, 5, 5, '#f2f2f2');
      rect(set, 5, 2, 5, 5, '#2b2b2b');
      rect(set, 5, 5, 7, 5, '#2b2b2b');
      set(2, 0, '#5a5a5a');
      set(8, 0, '#5a5a5a');
    },
    origami: (set) => {
      rect(set, 5, 0, 5, 0, '#e0567a');
      rect(set, 4, 1, 6, 1, '#e0567a');
      rect(set, 3, 2, 7, 2, '#f27a9a');
      rect(set, 2, 3, 8, 4, '#e0567a');
      rect(set, 3, 5, 7, 6, '#f27a9a');
    },
    bubble: (set) => {
      circle(set, 5, 5, 5, 'rgba(150,220,255,0.55)');
      set(3, 3, 'rgba(255,255,255,0.8)');
    },
    flower: (set) => {
      rect(set, 5, 8, 6, 13, '#3f8f3f');
      circle(set, 5, 4, 2, '#e0567a');
      circle(set, 2, 5, 1.6, '#f27a9a');
      circle(set, 8, 5, 1.6, '#f27a9a');
      circle(set, 5, 1, 1.6, '#f27a9a');
      set(5, 4, '#f2c14e');
    },
    honeypot: (set) => {
      rect(set, 1, 4, 9, 12, '#e0a030');
      rect(set, 1, 4, 9, 5, '#8a5a2e');
      rect(set, 2, 1, 8, 3, '#8a5a2e');
      set(5, 8, '#c97a1e');
      set(4, 9, '#c97a1e');
    },
  };

  function createPropIcon(name) {
    const builder = BUILDERS[name];
    if (!builder) return null;
    const w = 12, h = 14;
    const cells = grid(w, h, builder);
    const canvas = document.createElement('canvas');
    canvas.className = 'prop-icon';
    canvas.dataset.prop = name;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w * PROP_PIXEL}px`;
    canvas.style.height = `${h * PROP_PIXEL}px`;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const color = cells[y][x];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return canvas;
  }

  window.BuddyProps = { create: createPropIcon, names: Object.keys(BUILDERS), PROP_PIXEL };
})();
