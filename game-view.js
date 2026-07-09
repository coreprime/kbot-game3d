// game-view.js
//
// Per-game view defaults for pack-driven consumers (the replayer, headless
// renders) that know only a pack/recording's game id.  The studio wires
// these same knobs through its private per-game adapter packages; this
// helper gives standalone drivers the equivalent table with one call:
//
//   const world = await createWorld(canvas, {
//     assets,
//     game: gameViewConfig(tracks.gameId),   // 'totala' | 'tak' | ...
//   })
//
// Unknown / missing ids return {} — createWorld's own defaults (TA team
// table, green nanolathe) apply, so callers can pass the id through
// unconditionally.

import { TA_TEAM_SIDES, TAK_TEAM_SIDES } from './team-colors.js'

export function gameViewConfig(gameId) {
  switch (String(gameId || '').toLowerCase()) {
    case 'ta':
    case 'totala':
      return { teamSides: TA_TEAM_SIDES, nanolatheStyle: 'green' }
    case 'tak':
    case 'takingdoms':
      // TA:K recolours by per-player texture pages (TAK_TEAM_SIDES carries
      // the page index per side), constructs with gold "magic" casting
      // instead of TA's green nanolathe, dresses its maps with the TA:K
      // feature dialect (palms/cypresses, henge stones, grass tufts), and
      // shows buildings under construction as a whole hull beneath the
      // molten-gold Gilded Veil rather than a wireframe scaffold.
      return {
        teamSides: TAK_TEAM_SIDES,
        nanolatheStyle: 'gold',
        featureStyle: 'tak',
        buildStyle: 'shimmer-a',
      }
    default:
      return {}
  }
}
