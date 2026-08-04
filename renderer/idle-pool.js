// Idle-animation pool: each entry is a hard-keyframed sequence (3-4 poses, no in-between
// tweening) that idle-director.js plays back when the Idle state is active and not blocked
// by Typing. `appliesTo` restricts an entry to a character; entries without a restriction
// apply to both. Fields on each frame are deltas applied on top of the previous frame —
// idle-director.js resets everything to neutral before/after a run.
//
// frame fields:
//   holdMs    - how long this pose is held before cutting to the next one
//   transform - CSS class (see style.css .anim-*) applied to the canvas for whole-body motion
//   pose      - crab claw/leg pose (dragon.js CLAW_POSES / LEG_POSES), ignored by avocado
//   core      - avocado pit offset/scale/hidden (avocado.js setCore), ignored by crab
//   prop      - name from props.js to show, or null to hide the prop
(function () {
  const POOL = [
    // --- general / character-agnostic ---
    { id: 'read-book', frames: [
      { holdMs: 900, transform: 'anim-tilt', prop: 'book', propPos: 'hands' },
      { holdMs: 700, transform: 'anim-tilt' },
      { holdMs: 900, transform: 'anim-tilt', prop: 'book' },
    ] },
    { id: 'look-out-window', frames: [
      { holdMs: 1000, transform: 'anim-tilt' },
      { holdMs: 1200, transform: null },
      { holdMs: 900, transform: 'anim-tilt' },
    ], speech: 'Schöne Wolken heute...' },
    { id: 'yawn-stretch', frames: [
      { holdMs: 500, transform: 'anim-stretch' },
      { holdMs: 600, transform: 'anim-stretch' },
      { holdMs: 300, transform: null },
    ] },
    { id: 'doze-startle', frames: [
      { holdMs: 1400, transform: 'anim-tilt', blinking: true },
      { holdMs: 900, transform: 'anim-tilt', blinking: true },
      { holdMs: 250, transform: 'anim-shake', blinking: false },
    ] },
    { id: 'coffee-sip', frames: [
      { holdMs: 500, prop: 'mug', propPos: 'hands' },
      { holdMs: 450, prop: 'mug', propPos: 'hands', mouthOpen: true },
      { holdMs: 500, prop: 'mug', propPos: 'hands', mouthOpen: false },
    ] },
    { id: 'pen-spin', frames: [
      { holdMs: 380, prop: 'pen', propPos: 'hands' },
      { holdMs: 380, prop: 'pen', propPos: 'hands', transform: 'anim-wobble' },
      { holdMs: 380, prop: 'pen', propPos: 'hands' },
    ] },
    { id: 'paper-plane', frames: [
      { holdMs: 600, prop: 'origami', propPos: 'hands' },
      { holdMs: 400, prop: 'plane', propPos: 'hands' },
      { holdMs: 500, prop: 'plane', propPos: 'float', transform: 'anim-bounce' },
      { holdMs: 300, prop: null },
    ] },
    { id: 'ball-toss', frames: [
      { holdMs: 320, prop: 'ball', propPos: 'hands' },
      { holdMs: 320, prop: 'ball', propPos: 'float', transform: 'anim-bounce' },
      { holdMs: 320, prop: 'ball', propPos: 'hands', transform: null },
    ] },
    { id: 'air-guitar', frames: [
      { holdMs: 260, transform: 'anim-wobble', particle: 'sparkle' },
      { holdMs: 260, transform: 'anim-wobble' },
      { holdMs: 260, transform: 'anim-wobble', particle: 'sparkle' },
    ] },
    { id: 'pirouette', frames: [
      { holdMs: 260, transform: 'anim-spin' },
      { holdMs: 260, transform: 'anim-spin' },
      { holdMs: 260, transform: null },
    ] },
    { id: 'sketch-notepad', frames: [
      { holdMs: 700, prop: 'sketchpad', propPos: 'hands' },
      { holdMs: 500, prop: 'sketchpad', propPos: 'hands', transform: 'anim-wobble' },
      { holdMs: 700, prop: 'sketchpad', propPos: 'hands' },
    ] },
    { id: 'origami-fold', frames: [
      { holdMs: 500, prop: 'origami', propPos: 'hands' },
      { holdMs: 500, prop: 'origami', propPos: 'hands', transform: 'anim-wobble' },
      { holdMs: 500, prop: 'origami', propPos: 'hands' },
    ] },
    { id: 'finger-drum', frames: [
      { holdMs: 200, transform: 'anim-wobble' },
      { holdMs: 200, transform: null },
      { holdMs: 200, transform: 'anim-wobble' },
      { holdMs: 200, transform: null },
    ] },
    { id: 'sudoku-puzzle', frames: [
      { holdMs: 800, prop: 'puzzle', propPos: 'hands' },
      { holdMs: 600, prop: 'puzzle', propPos: 'hands', transform: 'anim-tilt' },
      { holdMs: 800, prop: 'puzzle', propPos: 'hands' },
    ] },
    { id: 'water-plant', frames: [
      { holdMs: 500, prop: 'plant', propPos: 'side' },
      { holdMs: 500, prop: 'can', propPos: 'hands', transform: 'anim-tilt' },
      { holdMs: 600, prop: 'plant', propPos: 'side' },
    ] },
    { id: 'check-watch-panic', frames: [
      { holdMs: 500, prop: 'clock', propPos: 'hands' },
      { holdMs: 350, prop: null, transform: 'anim-shake', particle: 'sparkle' },
      { holdMs: 400, transform: null },
    ], speech: 'Schon so spät?!' },
    { id: 'mirror-grimace', frames: [
      { holdMs: 260, mouthOpen: true, blinking: false },
      { holdMs: 260, mouthOpen: false, blinking: true },
      { holdMs: 260, mouthOpen: true, blinking: false },
      { holdMs: 300, mouthOpen: false },
    ] },
    { id: 'doze-zzz', frames: [
      { holdMs: 1200, blinking: true, particle: 'zzz' },
      { holdMs: 1200, blinking: true, particle: 'zzz' },
      { holdMs: 400, blinking: false },
    ] },
    { id: 'snack-drawer', frames: [
      { holdMs: 400, prop: 'snack', propPos: 'hands' },
      { holdMs: 350, prop: 'snack', propPos: 'hands', mouthOpen: true },
      { holdMs: 350, prop: 'snack', propPos: 'hands', mouthOpen: false },
      { holdMs: 300, prop: null },
    ] },
    { id: 'wave-hello', frames: [
      { holdMs: 260, transform: 'anim-nudge', pose: 'wave' },
      { holdMs: 260, transform: 'anim-nudge', pose: 'wave' },
      { holdMs: 260, transform: null, pose: null },
    ], speech: 'Hallo!' },

    // --- crab-specific ---
    { id: 'crab-scuttle-side', appliesTo: ['crab'], frames: [
      { holdMs: 260, transform: 'anim-scuttle' },
      { holdMs: 260, transform: 'anim-scuttle' },
      { holdMs: 260, transform: null },
    ] },
    { id: 'crab-claw-clatter', appliesTo: ['crab'], frames: [
      { holdMs: 220, pose: 'clap' },
      { holdMs: 220, pose: null },
      { holdMs: 220, pose: 'clap' },
      { holdMs: 220, pose: null },
    ] },
    { id: 'crab-dig-pop', appliesTo: ['crab'], frames: [
      { holdMs: 350, pose: 'dig', transform: 'anim-dig' },
      { holdMs: 500, pose: 'dig', transform: 'anim-dig' },
      { holdMs: 300, pose: null, transform: 'anim-bounce', particle: 'sparkle' },
    ] },
    { id: 'crab-bubble-blow', appliesTo: ['crab'], frames: [
      { holdMs: 400, prop: 'bubble', propPos: 'hands' },
      { holdMs: 500, prop: 'bubble', propPos: 'float' },
      { holdMs: 300, prop: null, particle: 'sparkle' },
    ] },
    { id: 'crab-wave-hop', appliesTo: ['crab'], frames: [
      { holdMs: 300, transform: 'anim-tilt' },
      { holdMs: 260, transform: 'anim-bounce' },
      { holdMs: 300, transform: null },
    ] },
    { id: 'crab-cheer', appliesTo: ['crab'], frames: [
      { holdMs: 260, pose: 'cheer', transform: 'anim-bounce', particle: 'sparkle' },
      { holdMs: 260, pose: 'cheer', transform: 'anim-bounce' },
      { holdMs: 260, pose: null, transform: null },
    ] },
    { id: 'crab-sideways-wobble', appliesTo: ['crab'], frames: [
      { holdMs: 220, transform: 'anim-scuttle' },
      { holdMs: 220, transform: null },
      { holdMs: 220, transform: 'anim-scuttle' },
      { holdMs: 220, transform: null },
    ] },
    { id: 'crab-scratch-shell', appliesTo: ['crab'], frames: [
      { holdMs: 280, pose: 'scratch' },
      { holdMs: 280, pose: null },
      { holdMs: 280, pose: 'scratch' },
      { holdMs: 280, pose: null },
    ] },

    // --- avocado core-specific ---
    { id: 'avo-core-roll', appliesTo: ['avocado'], frames: [
      { holdMs: 260, core: { dx: -3 } },
      { holdMs: 260, core: { dx: 3 } },
      { holdMs: 260, core: { dx: 0 } },
    ] },
    { id: 'avo-core-hop', appliesTo: ['avocado'], frames: [
      { holdMs: 220, core: { dy: -4, scaleX: 0.9, scaleY: 0.9 } },
      { holdMs: 220, core: { dy: 0, scaleX: 1.1, scaleY: 0.85 } },
      { holdMs: 220, core: { dy: 0, scaleX: 1, scaleY: 1 } },
    ] },
    { id: 'avo-core-spin', appliesTo: ['avocado'], frames: [
      { holdMs: 200, core: { scaleX: 0.4, scaleY: 1 } },
      { holdMs: 200, core: { scaleX: 1, scaleY: 1 } },
      { holdMs: 200, core: { scaleX: 0.4, scaleY: 1 } },
      { holdMs: 200, core: { scaleX: 1, scaleY: 1 } },
    ] },
    { id: 'avo-core-blink', appliesTo: ['avocado'], frames: [
      { holdMs: 500, core: { dy: -2, scaleY: 0.5 } },
      { holdMs: 150, core: { dy: 0, scaleY: 1 } },
      { holdMs: 500, core: { dy: 0, scaleY: 1 } },
    ] },
    { id: 'avo-core-panic', appliesTo: ['avocado'], frames: [
      { holdMs: 150, core: { dx: -3 }, transform: 'anim-shake' },
      { holdMs: 150, core: { dx: 3 }, transform: 'anim-shake' },
      { holdMs: 150, core: { dx: -2 }, transform: 'anim-shake' },
      { holdMs: 200, core: { dx: 0 }, transform: null },
    ], speech: 'Bin ich noch gut?!' },
    { id: 'avo-core-hold', appliesTo: ['avocado'], frames: [
      { holdMs: 260, core: { dx: 5 } },
      { holdMs: 400, core: { dx: 5 }, blinking: false, transform: 'anim-nudge' },
      { holdMs: 260, core: { dx: 0 } },
    ] },
    { id: 'avo-core-peek', appliesTo: ['avocado'], frames: [
      { holdMs: 300, core: { hidden: true } },
      { holdMs: 260, core: { hidden: false, scaleX: 1.2, scaleY: 1.2 }, particle: 'sparkle' },
      { holdMs: 260, core: { hidden: false, scaleX: 1, scaleY: 1 } },
    ] },
    { id: 'avo-core-balance', appliesTo: ['avocado'], frames: [
      { holdMs: 300, core: { dx: -2 }, transform: 'anim-tilt' },
      { holdMs: 300, core: { dx: 2 }, transform: 'anim-tilt' },
      { holdMs: 300, core: { dx: 0 }, transform: null },
    ] },
    { id: 'avo-core-sunglasses', appliesTo: ['avocado'], frames: [
      { holdMs: 700, core: { dy: -9, scaleX: 1.8, scaleY: 0.5 } },
      { holdMs: 700, core: { dy: -9, scaleX: 1.8, scaleY: 0.5 } },
      { holdMs: 300, core: { dy: 0, scaleX: 1, scaleY: 1 } },
    ] },

    // --- citrus-slice-specific ---
    { id: 'citrus-wedge-rock', appliesTo: ['citrus'], frames: [
      { holdMs: 320, transform: 'anim-tilt' },
      { holdMs: 320, transform: 'anim-tilt' },
      { holdMs: 260, transform: null },
    ] },
    { id: 'citrus-juice-squeeze', appliesTo: ['citrus'], frames: [
      { holdMs: 260, transform: 'anim-squish', particle: 'sparkle' },
      { holdMs: 260, transform: 'anim-squish' },
      { holdMs: 260, transform: null },
    ], speech: 'Frisch gepresst!' },
    { id: 'citrus-happy-hop', appliesTo: ['citrus'], frames: [
      { holdMs: 260, transform: 'anim-bounce', particle: 'sparkle' },
      { holdMs: 260, transform: 'anim-bounce' },
      { holdMs: 260, transform: null },
    ] },
    { id: 'citrus-roll-in-place', appliesTo: ['citrus'], frames: [
      { holdMs: 220, transform: 'anim-scuttle' },
      { holdMs: 220, transform: null },
      { holdMs: 220, transform: 'anim-scuttle' },
      { holdMs: 220, transform: null },
    ] },
    { id: 'citrus-sour-face', appliesTo: ['citrus'], frames: [
      { holdMs: 260, mouthOpen: true, transform: 'anim-shake' },
      { holdMs: 300, mouthOpen: false, transform: null },
      { holdMs: 260, mouthOpen: true },
      { holdMs: 260, mouthOpen: false },
    ], speech: 'Uff, sauer!' },

    // --- bee-specific ---
    { id: 'bee-wing-flutter', appliesTo: ['bee'], frames: [
      { holdMs: 140, transform: 'anim-wobble' },
      { holdMs: 140, transform: null },
      { holdMs: 140, transform: 'anim-wobble' },
      { holdMs: 140, transform: null },
    ] },
    { id: 'bee-hover-bounce', appliesTo: ['bee'], frames: [
      { holdMs: 260, transform: 'anim-bounce', particle: 'sparkle' },
      { holdMs: 260, transform: 'anim-bounce' },
      { holdMs: 260, transform: null },
    ] },
    { id: 'bee-visit-flower', appliesTo: ['bee'], frames: [
      { holdMs: 500, prop: 'flower', propPos: 'side' },
      { holdMs: 450, prop: 'flower', propPos: 'side', transform: 'anim-nudge' },
      { holdMs: 400, prop: 'flower', propPos: 'side', particle: 'sparkle' },
      { holdMs: 300, prop: null },
    ], speech: 'Mmh, Nektar!' },
    { id: 'bee-honey-snack', appliesTo: ['bee'], frames: [
      { holdMs: 400, prop: 'honeypot', propPos: 'hands' },
      { holdMs: 350, prop: 'honeypot', propPos: 'hands', mouthOpen: true },
      { holdMs: 350, prop: 'honeypot', propPos: 'hands', mouthOpen: false },
      { holdMs: 300, prop: null },
    ] },
    { id: 'bee-antenna-wiggle', appliesTo: ['bee'], frames: [
      { holdMs: 220, transform: 'anim-shake' },
      { holdMs: 220, transform: null },
      { holdMs: 220, transform: 'anim-shake' },
      { holdMs: 220, transform: null },
    ] },
    { id: 'bee-buzz-spin', appliesTo: ['bee'], frames: [
      { holdMs: 220, transform: 'anim-spin' },
      { holdMs: 220, transform: 'anim-spin' },
      { holdMs: 260, transform: null },
    ] },
  ];

  window.BuddyIdlePool = POOL;
})();
