// terrain-sample.test.js — headless proofs for the battlefield surface
// sampler (terrain-sample.js): heightAt matches the renderer's mesh
// triangulation exactly, the display heightScale applies, edges clamp, and
// normals tilt toward downhill.  Pure math — runs under `node --test`.

import test from 'node:test'
import assert from 'node:assert/strict'

import { createTerrainSampler } from '../terrain-sample.js'

const CELL = 16
const SCALE = 0.61

// A 3×3 height field with a single-cell hill in the middle column:
//   0 100   0
//   0 100   0
//   0 100   0
const field = () => createTerrainSampler({
  heights: [0, 100, 0, 0, 100, 0, 0, 100, 0],
  w: 3,
  h: 3,
  cellWU: CELL,
  heightScale: SCALE,
})

test('heightAt returns vertex heights × heightScale at cell corners', () => {
  const t = field()
  assert.equal(t.heightAt(0, 0), 0)
  assert.equal(t.heightAt(CELL, 0), 100 * SCALE)
  assert.equal(t.heightAt(2 * CELL, 2 * CELL), 0)
})

test('heightAt interpolates along the mesh triangulation between corners', () => {
  const t = field()
  // Halfway up the western slope of the ridge.
  assert.ok(Math.abs(t.heightAt(CELL / 2, 0) - 50 * SCALE) < 1e-9)
  // The quad diagonal split: at the exact cell centre both triangles of the
  // (0,0)..(1,1) cell agree on (y00 + y11)/2 + correction; sample a point in
  // each half and check monotonic rise toward the ridge.
  const low = t.heightAt(CELL * 0.25, CELL * 0.75)
  const high = t.heightAt(CELL * 0.75, CELL * 0.25)
  assert.ok(high > low, `ridge-side sample (${high}) should top valley-side (${low})`)
})

test('heightAt clamps outside the map instead of extrapolating', () => {
  const t = field()
  assert.equal(t.heightAt(-500, -500), t.heightAt(0, 0))
  assert.equal(t.heightAt(9999, 9999), t.heightAt(2 * CELL, 2 * CELL))
})

test('rawHeightAt reports source units (no display scale)', () => {
  const t = field()
  assert.equal(t.rawHeightAt(CELL, 0), 100)
})

test('normalAt tilts away from the ridge and is unit length', () => {
  const t = field()
  // West of the ridge the surface rises toward +X, so the normal leans -X.
  const n = t.normalAt(CELL * 0.5, CELL)
  assert.ok(n[0] < -0.01, `normal x = ${n[0]}, want < 0 on the west slope`)
  // The test ridge is a cliff (61 wu over one 16 wu cell), so up is small
  // but must stay positive.
  assert.ok(n[1] > 0.05, `normal up ${n[1]} must stay positive`)
  const len = Math.hypot(n[0], n[1], n[2])
  assert.ok(Math.abs(len - 1) < 1e-6, `normal length ${len}`)
  // Flat ground far from the hill: straight up.
  const flat = createTerrainSampler({ heights: new Array(9).fill(7), w: 3, h: 3, cellWU: CELL, heightScale: SCALE })
  const nf = flat.normalAt(CELL, CELL)
  assert.ok(Math.abs(nf[0]) < 1e-9 && Math.abs(nf[2]) < 1e-9 && Math.abs(nf[1] - 1) < 1e-9)
})

test('empty field degrades to a flat plane at 0', () => {
  const t = createTerrainSampler({ heights: null, w: 0, h: 0 })
  assert.equal(t.heightAt(10, 10), 0)
  assert.deepEqual(t.normalAt(10, 10), [0, 1, 0])
  // The flatten API is present but inert on an empty field.
  assert.equal(t.setFlatten(1, { x: 0, z: 0, w: 16, h: 16 }), undefined)
  assert.equal(t.clearFlatten(1), undefined)
  assert.equal(t.flattenCount(), 0)
})

// A sloped ridge for the footprint-flatten tests: heights rise west→east so a
// building spanning the slope has a real height gradient under it.
//   0  40  80 120
//   0  40  80 120
//   0  40  80 120
//   0  40  80 120
const slope = () => createTerrainSampler({
  heights: [
    0, 40, 80, 120,
    0, 40, 80, 120,
    0, 40, 80, 120,
    0, 40, 80, 120,
  ],
  w: 4, h: 4, cellWU: CELL, heightScale: SCALE,
})

test('footprint flatten levels the terrain under a building to its MIN height', () => {
  const t = slope()
  // Real relief across the slope: cell (1,1)=40, (2,1)=80 raw.
  assert.equal(t.rawHeightAt(CELL, CELL), 40)
  assert.equal(t.rawHeightAt(2 * CELL, CELL), 80)

  // A building whose footprint covers cells x∈[1..2], z∈[1..2] (world rect
  // from x=CELL, one cell wide/deep — outward-snapped to the [1..2] corners).
  // Default flatten = MIN source height in the footprint = 40.
  const entry = t.setFlatten(7, { x: CELL, z: CELL, w: CELL, h: CELL })
  assert.ok(entry, 'flatten registered')
  assert.equal(t.flattenCount(), 1)
  assert.equal(entry.height, 40, 'levels to the minimum ground under the footprint')

  // Under the footprint the surface is now uniform at 40×SCALE — the eastern
  // (formerly 80) corner was LOWERED so no part of the base is buried.
  assert.equal(t.rawHeightAt(2 * CELL, CELL), 40)
  assert.ok(Math.abs(t.heightAt(2 * CELL, CELL) - 40 * SCALE) < 1e-9)
  // Off the footprint the real relief is untouched.
  assert.equal(t.rawHeightAt(3 * CELL, CELL), 120)
})

test('footprint flatten reverts exactly on clear (non-persistent)', () => {
  const t = slope()
  const before = t.rawHeightAt(2 * CELL, CELL)
  t.setFlatten(7, { x: CELL, z: CELL, w: 2 * CELL, h: 2 * CELL })
  assert.notEqual(t.rawHeightAt(2 * CELL, CELL), before, 'flatten changed the surface')
  const removed = t.clearFlatten(7)
  assert.ok(removed, 'clear returns the removed entry for a mesh rebuild')
  assert.equal(t.flattenCount(), 0)
  // Real relief restored bit-for-bit — the source heights were never mutated.
  assert.equal(t.rawHeightAt(2 * CELL, CELL), before)
  assert.equal(t.rawHeightAt(CELL, CELL), 40)
  assert.equal(t.rawHeightAt(3 * CELL, CELL), 120)
})

test('an explicit flatten height overrides the MIN default', () => {
  const t = slope()
  t.setFlatten(3, { x: CELL, z: CELL, w: 2 * CELL, h: 2 * CELL, height: 55 })
  assert.equal(t.rawHeightAt(CELL, CELL), 55)
  assert.equal(t.rawHeightAt(2 * CELL, CELL), 55)
})

test('overlapping footprints do not re-bury each other (MAX wins)', () => {
  const t = slope()
  t.setFlatten('a', { x: 0, z: 0, w: 2 * CELL, h: 2 * CELL, height: 20 })
  t.setFlatten('b', { x: CELL, z: 0, w: 2 * CELL, h: 2 * CELL, height: 60 })
  // Cell (1,1) is in BOTH footprints; the higher pad wins so neither building
  // ends up below its own levelled floor.
  assert.equal(t.rawHeightAt(CELL, CELL), 60)
  // Clearing 'b' hands the shared cell back to 'a'.
  t.clearFlatten('b')
  assert.equal(t.rawHeightAt(CELL, CELL), 20)
})

test('per-building flatten is keyed by id and independent', () => {
  const t = slope()
  t.setFlatten(1, { x: 0, z: 0, w: CELL, h: CELL, height: 10 })
  t.setFlatten(2, { x: 3 * CELL, z: 3 * CELL, w: CELL, h: CELL, height: 90 })
  assert.equal(t.flattenCount(), 2)
  assert.equal(t.rawHeightAt(0, 0), 10)
  // Clearing one leaves the other in place.
  t.clearFlatten(1)
  assert.equal(t.flattenCount(), 1)
  assert.equal(t.rawHeightAt(0, 0), 0) // reverted
  assert.equal(t.rawHeightAt(3 * CELL, 3 * CELL), 90) // still flattened
})
