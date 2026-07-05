// footprint-flatten.test.js — a building LEVELS the drawn battlefield mesh
// under its floorplan so its groundplate sits above a slope instead of sinking
// into the hill (the "base buried by terrain" bug).  Drives the REAL
// ModelRenderer through setMapTerrain + setFootprintFlatten against a
// recording GL stub, and reads back the terrain VBO's vertex heights to prove:
//   * flattening LOWERS the mesh under the footprint to a single level;
//   * off the footprint the mesh keeps its real relief;
//   * clearing it REVERTS the mesh exactly (non-persistent, source untouched).

import { test } from 'node:test'
import assert from 'node:assert/strict'

// requestRedraw schedules through rAF; the test never runs the loop.
globalThis.requestAnimationFrame ??= () => 0
globalThis.window ??= { devicePixelRatio: 1 }

// Minimal canvas/document stub — setMapTerrain composites the ground texture on
// a 2D canvas and resizes it to a POT square. We only need the calls not to
// throw and the *heights* to flow through; pixels are irrelevant here.
function stubCanvas(w = 4, h = 4) {
  return {
    width: w, height: h,
    getContext: () => ({
      imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
      drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }),
  }
}
globalThis.document ??= { createElement: () => stubCanvas() }

import { ModelRenderer } from '../model-renderer.js'

// A GL stub that RECORDS bufferData payloads per buffer, so the test can read
// the terrain mesh vertices the renderer uploads.
function makeStubGL() {
  const buffers = new Map()
  let bound = null
  const gl = {
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, TEXTURE_2D: 0x0DE1,
    LUMINANCE: 0x1909, UNSIGNED_BYTE: 0x1401, RGBA: 0x1908,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, CLAMP_TO_EDGE: 0x812F,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601, LINEAR_MIPMAP_LINEAR: 0x2703,
    MAX_TEXTURE_SIZE: 0x0D33,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_ALIGNMENT: 0x0CF5,
    createBuffer: () => ({ id: Symbol('buf') }),
    bindBuffer: (t, b) => { if (t === gl.ARRAY_BUFFER) bound = b },
    bufferData: (t, data) => { if (t === gl.ARRAY_BUFFER && bound) buffers.set(bound, data.slice ? data.slice() : data) },
    createTexture: () => ({ id: Symbol('tex') }),
    bindTexture() {}, texImage2D() {}, texParameteri() {}, texParameterf() {}, generateMipmap() {},
    pixelStorei() {}, getParameter: (p) => (p === gl.MAX_TEXTURE_SIZE ? 4096 : 0),
    getExtension: () => null,
    deleteBuffer() {}, deleteTexture() {},
    _buffers: buffers, _bound: () => bound,
  }
  return gl
}

// Build a renderer with just enough context for setMapTerrain + flatten.
function makeRenderer() {
  const gl = makeStubGL()
  // ModelRenderer's constructor does a lot; construct a bare object and borrow
  // the prototype methods we exercise. setMapTerrain / setFootprintFlatten only
  // touch this.gl, this._mapTerrain, this.requestRedraw.
  const r = Object.create(ModelRenderer.prototype)
  r.gl = gl
  r._mapTerrain = null
  r.requestRedraw = () => {}
  r.updateGroundClipmap = () => {}
  return r
}

// A 4×4 sloped height field: heights rise west→east (raw 0,40,80,120 per row).
const HEIGHTS = new Uint8Array([
  0, 40, 80, 120,
  0, 40, 80, 120,
  0, 40, 80, 120,
  0, 40, 80, 120,
])
const CELL = 16
const SCALE = 0.61

function installTerrain(r) {
  r.setMapTerrain({
    image: stubCanvas(), heights: HEIGHTS, w: 4, h: 4,
    cellWU: CELL, heightScale: SCALE, seaLevel: 0, originX: 0, originZ: 0,
  })
}

// Read the max mesh Y (world units) over vertices whose XZ falls inside a world
// rect — the drawn surface height there.
function meshMaxYInRect(r, x0, z0, x1, z1) {
  const mt = r._mapTerrain
  const verts = r.gl._buffers.get(mt.vbo)
  assert.ok(verts, 'terrain VBO recorded')
  let maxY = -Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2]
    if (x >= x0 - 1e-6 && x <= x1 + 1e-6 && z >= z0 - 1e-6 && z <= z1 + 1e-6) {
      if (y > maxY) maxY = y
    }
  }
  return maxY
}

test('a building flattens the DRAWN terrain mesh under its footprint, then reverts', () => {
  const r = makeRenderer()
  installTerrain(r)

  // Real relief across the eastern slope: the mesh reaches 80×SCALE at the
  // x=2·CELL column BEFORE any building levels it.
  const eastX0 = 2 * CELL - 1, eastX1 = 2 * CELL + 1
  const reliefY = meshMaxYInRect(r, eastX0, 0, eastX1, 4 * CELL)
  assert.ok(Math.abs(reliefY - 80 * SCALE) < 1e-4, `slope mesh rises to 80×scale (got ${reliefY})`)

  // Place a building over cells x∈[1..2] (world x∈[CELL, 2·CELL]) on the slope.
  // Its footprint flattens to the MIN ground under it (40 raw).
  const changed = r.setFootprintFlatten(42, { x: CELL, z: CELL, w: CELL, h: CELL })
  assert.ok(changed, 'flatten reported a surface change')

  // The mesh under the footprint is now LEVEL at 40×SCALE — the eastern
  // (formerly 80) corner was lowered so the base is no longer buried.
  const flatY = meshMaxYInRect(r, eastX0, CELL - 1, eastX1, 2 * CELL + 1)
  assert.ok(Math.abs(flatY - 40 * SCALE) < 1e-4, `footprint mesh levelled to 40×scale (got ${flatY})`)
  assert.ok(flatY < reliefY - 1, 'the mesh under the base was lowered')

  // Off the footprint the far-east column keeps its real 120×scale relief.
  const farY = meshMaxYInRect(r, 3 * CELL - 1, 0, 3 * CELL + 1, 4 * CELL)
  assert.ok(Math.abs(farY - 120 * SCALE) < 1e-4, `terrain off the footprint is unchanged (got ${farY})`)

  // Removing the building (death / removal) reverts the mesh to real relief.
  const cleared = r.clearFootprintFlatten(42)
  assert.ok(cleared, 'clear reported a change')
  const revertedY = meshMaxYInRect(r, eastX0, 0, eastX1, 4 * CELL)
  assert.ok(Math.abs(revertedY - reliefY) < 1e-6, `mesh reverts to real relief (got ${revertedY})`)
})

test('the CPU sampler (grounded clamp) flattens and reverts in lockstep with the mesh', () => {
  const r = makeRenderer()
  installTerrain(r)
  // terrainHeightAt is what a grounded building clamps its base to.
  assert.ok(Math.abs(r.terrainHeightAt(2 * CELL, CELL) - 80 * SCALE) < 1e-6)
  r.setFootprintFlatten(9, { x: CELL, z: CELL, w: CELL, h: CELL })
  assert.ok(Math.abs(r.terrainHeightAt(2 * CELL, CELL) - 40 * SCALE) < 1e-6, 'base clamps to the flattened pad')
  r.clearFootprintFlatten(9)
  assert.ok(Math.abs(r.terrainHeightAt(2 * CELL, CELL) - 80 * SCALE) < 1e-6, 'reverts to real ground')
})

test('setFootprintFlatten is a no-op with no battlefield installed', () => {
  const r = makeRenderer()
  assert.equal(r.setFootprintFlatten(1, { x: 0, z: 0, w: 16, h: 16 }), false)
  assert.equal(r.clearFootprintFlatten(1), false)
})
