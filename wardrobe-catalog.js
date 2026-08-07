// Shared wardrobe metadata — unlock conditions and per-character exclusions. Used by main.js
// (unlock checking, weather-driven auto-equip) via require() and by
// renderer/wardrobe-items.js (which owns the actual pixel-art drawing) via a <script> tag, so
// this file exports itself both ways instead of living in only one place and getting duplicated.
//
// unlock.type:
//   'manual'    - unlocked from the start (no achievement/level system yet — see roadmap v0.9)
//   'dateRange' - auto-unlocks (permanently) the first time today's MM-DD falls within
//                 [from, to] — checked by main.js's checkSeasonalWardrobeUnlocks()
// excludeFrom: character ids that already have a built-in equivalent baked into their own
// sprite (e.g. avocado's permanent hat) and would look wrong wearing this on top of it.
const WARDROBE_CATALOG = {
  sunglasses: {
    unlock: { type: 'manual' },
    excludeFrom: [],
  },
  umbrella: {
    unlock: { type: 'manual' },
    excludeFrom: [],
    weatherManaged: 'rain', // main.js auto-equips/unequips this while weatherReaction is on
  },
  santaHat: {
    unlock: { type: 'dateRange', from: '12-01', to: '12-26' },
    excludeFrom: ['avocado'], // avocado already wears a permanent knit hat
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WARDROBE_CATALOG;
} else {
  window.WardrobeCatalog = WARDROBE_CATALOG;
}
