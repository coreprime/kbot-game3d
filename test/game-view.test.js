// game-view.test.js — per-game view defaults + the TA:K team-page table.
//
// TA:K recolours by texture PAGE (one authored GAF frame per player slot),
// not by TA's blue-hue shift; and its construction reads as gold "magic"
// casting instead of green nano.  These proofs pin the table + config
// plumbing that pack-driven drivers (the replayer) rely on.

import test from 'node:test'
import assert from 'node:assert/strict'

import { gameViewConfig } from '../game-view.js'
import {
  TA_TEAM_SIDES,
  TAK_TEAM_SIDES,
  setTeamSides,
  teamColorForSide,
  teamPageForSide,
  displayRgbForSide,
} from '../team-colors.js'
import { NANOLATHE_STYLES } from '../create-world.js'

test('gameViewConfig maps game ids onto view defaults', () => {
  assert.equal(gameViewConfig('totala').nanolatheStyle, 'green')
  assert.equal(gameViewConfig('totala').teamSides, TA_TEAM_SIDES)
  assert.equal(gameViewConfig('tak').nanolatheStyle, 'gold')
  assert.equal(gameViewConfig('takingdoms').teamSides, TAK_TEAM_SIDES)
  // Unknown ids opt into createWorld's own defaults.
  assert.deepEqual(gameViewConfig('mystery'), {})
  assert.deepEqual(gameViewConfig(null), {})
})

test('TAK sides recolour by page, never by hue-shift', () => {
  setTeamSides(TAK_TEAM_SIDES)
  try {
    for (let side = 0; side < TAK_TEAM_SIDES.length; side++) {
      // Page index = side (frame N of a ten-frame team page).
      assert.equal(teamPageForSide(side), side)
      // No hue-shift rgb — the authored frames carry the colour.
      assert.equal(teamColorForSide(side), null)
      // But display surfaces (impostors, minimap, HUD) still get a real
      // per-side colour.
      const d = displayRgbForSide(side)
      assert.equal(d.length, 3)
    }
    // Sides 0 and 1 must be visually distinct for the classic 1v1 read.
    assert.notDeepEqual(displayRgbForSide(0), displayRgbForSide(1))
  } finally {
    setTeamSides(TA_TEAM_SIDES)
  }
})

test('TA sides carry no page — the hue-shift path stays in charge', () => {
  setTeamSides(TA_TEAM_SIDES)
  assert.equal(teamPageForSide(0), null)
  assert.equal(teamPageForSide(1), null)
  // Side 1 (CORE red) still hue-shifts.
  assert.deepEqual(teamColorForSide(1), TA_TEAM_SIDES[1].rgb)
})

test('nanolathe styles: gold reads warm, green reads green', () => {
  const g = NANOLATHE_STYLES.green
  const au = NANOLATHE_STYLES.gold
  // Green style: green channel dominates the beam.
  assert.ok(g.beam[1] > g.beam[0] && g.beam[1] > g.beam[2])
  assert.ok(g.buildFx[1] > g.buildFx[0] && g.buildFx[1] > g.buildFx[2])
  // Gold style: red ≥ green > blue across beam, reclaim and build glow.
  for (const c of [au.beam, au.reclaim, au.buildFx]) {
    assert.ok(c[0] >= c[1] && c[1] > c[2], `gold tuple ${c} must be warm`)
  }
})
