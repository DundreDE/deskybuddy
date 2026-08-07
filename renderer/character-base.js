// Shared low-level helpers reused by every character sprite module (avocado.js, bee.js,
// citrus.js, crab.js, croissant.js, kaktus.js, monkey.js, pilz.js, toast.js, wolke.js): the
// pixel-grid painting primitives, the "outline any silhouette pixel touching empty space" pass,
// canvas setup, and the standard set of state setters every character exposes. Must load before
// any character script (see index.html script order). Each character file still owns its own
// GRID_W/GRID_H/PALETTES and buildFrame() — this only removes byte-identical boilerplate that
// used to be copy-pasted into all ten files.
window.CharacterBase = (function () {
  function inEllipse(px, py, cx, cy, rx, ry) {
    const dx = (px + 0.5 - cx) / rx;
    const dy = (py + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function inCircle(px, py, cx, cy, r) {
    const dx = px + 0.5 - cx;
    const dy = py + 0.5 - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // Returns { grid, set } — a gridH x gridW array pre-filled with null plus a bounds-checked
  // setter, exactly the pair every buildFrame() used to construct by hand.
  function createGrid(gridW, gridH) {
    const grid = Array.from({ length: gridH }, () => new Array(gridW).fill(null));
    const set = (x, y, category) => {
      if (x < 0 || x >= gridW || y < 0 || y >= gridH) return;
      grid[y][x] = category;
    };
    return { grid, set };
  }

  // Returns the [x, y] cells that should be painted as 'outline': any grid cell whose category
  // is in silhouetteCategories and that has at least one neighbor (or grid edge) that's empty.
  function computeOutlineCells(grid, gridW, gridH, silhouetteCategories) {
    const cells = [];
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const cat = grid[y][x];
        if (!cat || !silhouetteCategories.has(cat)) continue;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        const touchesEmpty = neighbors.some(([nx, ny]) => {
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) return true;
          return !grid[ny][nx];
        });
        if (touchesEmpty) cells.push([x, y]);
      }
    }
    return cells;
  }

  // canvas.id stays 'dragon-canvas' for every character — it's the one mounted sprite canvas
  // at a time (see #dragon-mount in index.html), not a crab-specific name, and style.css /
  // renderer.js drag-handling both key off this id across all ten characters.
  function createSpriteCanvas(gridW, gridH) {
    const canvas = document.createElement('canvas');
    canvas.id = 'dragon-canvas';
    canvas.width = gridW;
    canvas.height = gridH;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx };
  }

  // Adds the 7 setters every character exposes (setBlinking, setMouthOpen, setLegPhase,
  // setStanding, setPalette, setLook, setHeadphones) onto `api`, mutating `state` and calling
  // `draw()` after each — the pattern every character file used to repeat by hand. Character
  // files add their own extra setters (setPose, setCore, setCollarColor, ...) after this call.
  function attachStandardSetters(api, state, draw) {
    api.setBlinking = (value) => { state.blinking = value; draw(); };
    api.setMouthOpen = (value) => { state.mouthOpen = value; draw(); };
    api.setLegPhase = (value) => { state.legPhase = value; draw(); };
    api.setStanding = (value) => { state.standing = value; draw(); };
    api.setPalette = (name) => { state.palette = name; draw(); };
    api.setLook = (lookX, lookY) => { state.lookX = lookX; state.lookY = lookY; draw(); };
    api.setHeadphones = (value) => { state.headphones = value; draw(); };
    return api;
  }

  return { inEllipse, inCircle, createGrid, computeOutlineCells, createSpriteCanvas, attachStandardSetters };
})();
