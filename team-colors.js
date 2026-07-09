// team-colors.js
//
// Team-colour mechanism, indexed by `side` so the engine + UI + renderer can
// all refer to a unit's faction by a single integer without each layer
// carrying its own colour table.
//
// The table itself is game configuration, not machinery — the active game's
// adapter package supplies it (see @coreprime/kbot-game-totala's view3d.js) and the
// studio injects it through setTeamSides() at boot. Each entry is
// { side, key, label, rgb, swatchCss }:
//   - side 0 with rgb: null is the "no recolour" sentinel — the renderer's
//     setTeamColor(null) keeps the model's authored pixels untouched.
//   - rgb is a saturated 0..1 float tuple driving the renderer's hue-shift.
//   - label / swatchCss feed tooltips and picker swatches directly.

// TA_TEAM_SIDES — Total Annihilation's player-colour table, indexed by
// `side` (0..7).  This is the same table @coreprime/kbot-game-totala's view3d adapter
// installs in the studio; it is exported HERE so pack-driven consumers (the
// replayer, headless renders) can map a recording's player slots onto sides
// without depending on the private studio adapter package.  createWorld
// installs it as the default when the caller supplies no game.teamSides.
//
// Index 0 (`blue`) is the canonical "no recolour" sentinel — rgb: null keeps
// the model's authored ARM-blue pixels untouched.  Indices 1..7 are
// saturated 0..1 float tuples driving the renderer's hue-shift.
export const TA_TEAM_SIDES = [
  { side: 0, key: 'blue',   label: 'Blue (ARM)',  rgb: null,               swatchCss: '#3a6cd6' },
  { side: 1, key: 'red',    label: 'Red (CORE)',  rgb: [0.92, 0.18, 0.16], swatchCss: '#eb2e29' },
  { side: 2, key: 'green',  label: 'Green',  rgb: [0.20, 0.78, 0.28], swatchCss: '#34c747' },
  { side: 3, key: 'yellow', label: 'Yellow', rgb: [0.95, 0.85, 0.20], swatchCss: '#f3d933' },
  { side: 4, key: 'purple', label: 'Purple', rgb: [0.62, 0.30, 0.85], swatchCss: '#9e4dd9' },
  { side: 5, key: 'cyan',   label: 'Cyan',   rgb: [0.20, 0.80, 0.92], swatchCss: '#34ccea' },
  { side: 6, key: 'orange', label: 'Orange', rgb: [0.98, 0.55, 0.18], swatchCss: '#fa8d2e' },
  { side: 7, key: 'black',  label: 'Black',  rgb: [0.10, 0.10, 0.12], swatchCss: '#1a1a1f' },
]

// TAK_TEAM_SIDES — Total Annihilation: Kingdoms' player-colour table.
//
// TA:K does NOT recolour by hue-shift: each team-marked texture is a
// ten-frame GAF page, one authored frame per player colour, and the game
// binds the owning player's frame.  Each entry here therefore carries
// `page` (the frame index a renderer should bind for that side) and leaves
// `rgb` null so the hue-shift path stays off — TA:K art is full-colour and
// a blue-hue shift would repaint capes, water and banners wholesale.
// `display` is the frame's dominant colour (sampled from the shipped logo
// pages) for surfaces that draw the side AS a colour: impostor dots,
// minimap markers, HUD swatches.
export const TAK_TEAM_SIDES = [
  { side: 0, key: 'blue',   label: 'Blue',   rgb: null, page: 0, display: [0.30, 0.38, 0.59], swatchCss: '#4c6296' },
  { side: 1, key: 'red',    label: 'Red',    rgb: null, page: 1, display: [0.68, 0.11, 0.06], swatchCss: '#ad1c0f' },
  { side: 2, key: 'white',  label: 'White',  rgb: null, page: 2, display: [0.75, 0.75, 0.75], swatchCss: '#bfbfbf' },
  { side: 3, key: 'green',  label: 'Green',  rgb: null, page: 3, display: [0.11, 0.57, 0.35], swatchCss: '#1c9158' },
  { side: 4, key: 'navy',   label: 'Navy',   rgb: null, page: 4, display: [0.06, 0.20, 0.48], swatchCss: '#0f337a' },
  { side: 5, key: 'purple', label: 'Purple', rgb: null, page: 5, display: [0.45, 0.15, 0.30], swatchCss: '#73264d' },
  { side: 6, key: 'gold',   label: 'Gold',   rgb: null, page: 6, display: [0.72, 0.58, 0.24], swatchCss: '#b8943d' },
  { side: 7, key: 'black',  label: 'Black',  rgb: null, page: 7, display: [0.14, 0.14, 0.15], swatchCss: '#242426' },
  { side: 8, key: 'orange', label: 'Orange', rgb: null, page: 8, display: [0.66, 0.35, 0.14], swatchCss: '#a85a24' },
  { side: 9, key: 'brown',  label: 'Brown',  rgb: null, page: 9, display: [0.45, 0.33, 0.11], swatchCss: '#73541c' },
]

// TEAM_SIDES is the live table. Exported as a const binding whose CONTENTS
// setTeamSides() replaces in place, so existing imports always see the
// current configuration.
export const TEAM_SIDES = []

// setTeamSides installs the game's team palette. Mutates the exported array
// in place so every module holding a reference picks the new table up.
export function setTeamSides(sides) {
  TEAM_SIDES.length = 0
  if (Array.isArray(sides)) TEAM_SIDES.push(...sides)
}

// teamColorForSide returns the [r, g, b] tuple a renderer should use
// for the given side index.  Returns null for side 0 (the "no recolour"
// sentinel).  Out-of-range indices fall through to null too — safer than
// throwing in a render hot path.
export function teamColorForSide(side) {
  const entry = TEAM_SIDES[(side | 0)]
  return entry ? entry.rgb : null
}

// _NEUTRAL_RGB — fallback for the side-0 "no recolour" sentinel and
// out-of-range indices, so impostor / minimap / UI paths that need a real
// colour always get one. Matches TA's canonical ARM-blue swatch (#3a6cd6),
// which is also the right neutral for games that inherit TA's table.
const _NEUTRAL_RGB = [0.227, 0.424, 0.839]

// displayRgbForSide returns an ALWAYS-non-null [r, g, b] tuple for
// the side index — useful for surfaces that need to draw the side
// colour as itself rather than as a hue-shift modulator.  Side 0
// (the "no recolour" sentinel) returns the neutral fallback; other sides
// return their saturated team palette.  Phase 3 far-tier impostors
// use this so the user can tell teams apart by colour even when
// units collapse to a single coloured dot.
export function displayRgbForSide(side) {
  const entry = TEAM_SIDES[(side | 0)]
  if (entry && entry.display) return entry.display
  if (entry && entry.rgb) return entry.rgb
  return _NEUTRAL_RGB
}

// teamPageForSide returns the per-player texture-page (GAF frame) index for
// the side, or null when the active game recolours by hue-shift instead
// (TA).  Renderers append `&team=<page>` to a team-paged texture's bind key
// so the cache resolves the owning player's authored frame.
export function teamPageForSide(side) {
  const entry = TEAM_SIDES[(side | 0)]
  return entry && entry.page != null ? entry.page : null
}

// sideForKey looks a side up by string key ('blue', 'red', ...).
// Used by the side picker UI which carries the key on the DOM
// dataset rather than a raw integer.
export function sideForKey(key) {
  const entry = TEAM_SIDES.find((s) => s.key === key)
  return entry ? entry.side : 0
}
