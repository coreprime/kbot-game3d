// health-bar.test.js — the in-world unit status bar must read as a bar at
// any zoom.  The bar RUN is authored in world units (it scales with the
// camera) so a fixed pixel stroke collapsed it to a hairline in an extreme
// close-up.  healthBarThicknessPx sizes the stroke from the bar's PROJECTED
// length, keeping a constant thickness:length aspect.  Pure math — no WebGL.

import test from 'node:test'
import assert from 'node:assert/strict'

import { healthBarThicknessPx } from '../model-renderer.js'

// A representative bar + view: r*1.5 world-unit run, 45° fovY, 720-tall buffer.
const BAR_WU = 18
const FOCAL = 1 / Math.tan((45 * Math.PI / 180) / 2) // projMatrix[5]
const VH = 720

test('a hero close-up thickens the stroke instead of leaving a hairline', () => {
  const near = healthBarThicknessPx(BAR_WU, 40, FOCAL, VH)
  // The old fixed 5 px stroke on a hundreds-of-pixels run was the thin dark
  // line — the fix must give a clearly thicker backing up close.
  assert.ok(near.backing > 5, `close-up backing ${near.backing} should exceed the old 5 px`)
  assert.ok(near.fill >= 2 && near.fill < near.backing, 'fill sits inside the backing')
})

test('the bar gets thinner (never thicker) as the camera pulls back', () => {
  const near = healthBarThicknessPx(BAR_WU, 40, FOCAL, VH)
  const mid = healthBarThicknessPx(BAR_WU, 200, FOCAL, VH)
  const wide = healthBarThicknessPx(BAR_WU, 1200, FOCAL, VH)
  assert.ok(near.backing >= mid.backing, 'close-up at least as thick as mid')
  assert.ok(mid.backing >= wide.backing, 'mid at least as thick as wide')
})

test('the stroke is clamped to a legible, bounded range', () => {
  // Absurdly close and absurdly far both stay within [4, 28].
  const tooClose = healthBarThicknessPx(BAR_WU, 0.5, FOCAL, VH)
  const tooFar = healthBarThicknessPx(BAR_WU, 1e6, FOCAL, VH)
  assert.equal(tooClose.backing, 28, 'stroke capped so a close-up cannot balloon')
  assert.equal(tooFar.backing, 4, 'stroke floored so a distant bar stays visible')
  assert.ok(tooFar.fill >= 2, 'fill floored so it never vanishes')
})

test('degenerate inputs are handled without NaN', () => {
  const bad = healthBarThicknessPx(0, 0, 0, 0)
  assert.ok(Number.isFinite(bad.backing) && Number.isFinite(bad.fill))
  assert.ok(bad.backing >= 4 && bad.fill >= 2)
})
