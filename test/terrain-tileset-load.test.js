// terrain-tileset-load.test.js — the async terrain-tileset fetch must not leak
// or stale-install a GL texture when a second load starts before the first
// resolves (a scene-boundary environment switch mid-fetch).  Drives the REAL
// ModelRenderer through Terrain ground mode against a recording GL stub + a
// deferred-resolving AssetProvider and proves:
//   * two overlapping loads net ZERO leaked textures (deletes == creates - 1);
//   * a load resolving AFTER the tileset moved on installs NOTHING stale.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// The renderer schedules redraws through rAF; the test never runs the loop.
globalThis.requestAnimationFrame ??= () => 0
globalThis.window ??= { devicePixelRatio: 1 }

import { ModelRenderer } from '../model-renderer.js'
import { setAssetProvider } from '../assets.js'

// Real WebGL enum values for the tokens the load + constructor compose or
// compare; anything else the Proxy below hands back a stable per-name id.
const GL_ENUMS = {
  TEXTURE_2D: 0x0DE1, RGBA: 0x1908, RGB: 0x1907, DEPTH_COMPONENT: 0x1902,
  UNSIGNED_BYTE: 0x1401, UNSIGNED_INT: 0x1405, FLOAT: 0x1406,
  TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, REPEAT: 0x2901, CLAMP_TO_EDGE: 0x812F,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
  NEAREST: 0x2600, LINEAR: 0x2601, LINEAR_MIPMAP_LINEAR: 0x2703,
  UNPACK_FLIP_Y_WEBGL: 0x9240,
  FRAMEBUFFER: 0x8D40, COLOR_ATTACHMENT0: 0x8CE0, DEPTH_ATTACHMENT: 0x8D00,
  FRAMEBUFFER_COMPLETE: 0x8CD5, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
  VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, MAX_TEXTURE_SIZE: 0x0D33,
}

// A stub GL that lets the real constructor run and COUNTS texture create/delete
// (reset after construction so only terrain-load activity is measured).  Each
// bound texture is stamped with the image last uploaded to it, so the test can
// read which tileset won the live slot.
function makeStubGL() {
  const record = { texCreated: 0, texDeleted: 0, resetTex() { this.texCreated = 0; this.texDeleted = 0 } }
  const enumIds = new Map()
  const uniforms = new Map()
  let nextEnum = 0x30000
  let boundTex = null
  const fns = {
    getExtension: () => null,
    getParameter: () => 4096,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader() {},
    createProgram: () => ({ attrs: new Map(), nextAttr: 0 }),
    attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
    getProgramInfoLog: () => '', useProgram() {},
    getAttribLocation: (p, n) => { if (!p.attrs.has(n)) p.attrs.set(n, p.nextAttr++); return p.attrs.get(n) },
    getUniformLocation: (p, n) => {
      if (!uniforms.has(p)) uniforms.set(p, new Map())
      const m = uniforms.get(p)
      if (!m.has(n)) m.set(n, { name: n })
      return m.get(n)
    },
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, bufferSubData() {}, deleteBuffer() {},
    createTexture() { record.texCreated++; return { id: Symbol('tex') } },
    bindTexture: (_target, tex) => { boundTex = tex },
    texImage2D: (_t, _l, _i, _f, _ty, img) => { if (boundTex && img && typeof img === 'object') boundTex.img = img },
    texParameteri() {}, generateMipmap() {}, pixelStorei() {}, activeTexture() {},
    deleteTexture(t) { if (t) record.texDeleted++ },
    createFramebuffer: () => ({}), bindFramebuffer() {}, framebufferTexture2D() {}, framebufferRenderbuffer() {},
    checkFramebufferStatus: () => GL_ENUMS.FRAMEBUFFER_COMPLETE, deleteFramebuffer() {},
    createRenderbuffer: () => ({}), bindRenderbuffer() {}, renderbufferStorage() {}, deleteRenderbuffer() {},
    isContextLost: () => false, getError: () => 0,
  }
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'drawingBufferWidth') return 800
      if (prop === 'drawingBufferHeight') return 600
      if (prop === 'canvas') return { width: 800, height: 600 }
      if (prop === '_record') return record
      if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) {
        if (prop in GL_ENUMS) return GL_ENUMS[prop]
        if (!enumIds.has(prop)) enumIds.set(prop, nextEnum++)
        return enumIds.get(prop)
      }
      if (prop in fns) return fns[prop]
      return () => undefined
    },
  })
}

// A provider whose groundTile hands back a deferred the test resolves by hand,
// so two loads can be in flight at once.  Records the requested tileset name.
function makeDeferredProvider() {
  const pending = []
  setAssetProvider({
    groundTile(name) {
      return new Promise((resolve) => { pending.push({ name, resolve }) })
    },
  })
  return pending
}

// Build a real renderer (so the private #loadTerrainTexture path runs).  The
// default groundMode is 'terrain', so construction issues the FIRST load.
function makeRenderer(gl) {
  return new ModelRenderer({
    canvas: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    textureCache: { get: () => ({ tex: {}, width: 64, height: 64 }), dispose() {} },
    gl,
  })
}

// Resolve a POT (8×8) tile image tagged with its tileset, then drain the
// fetch → decode → upload microtask chain.
async function resolveTile(entry) {
  entry.resolve({ naturalWidth: 8, naturalHeight: 8, tileset: entry.name })
  await new Promise((res) => setTimeout(res, 0))
}

test('overlapping terrain-tileset loads leak no texture and never install a stale tileset', async () => {
  const gl = makeStubGL()
  const pending = makeDeferredProvider()
  try {
    // Construction (groundMode 'terrain') issues load #1 for the default tileset.
    const r = makeRenderer(gl)
    assert.equal(pending.length, 1, 'construction issued the first load')
    // Ignore every texture the constructor built (shadow FBOs, sky, …); measure
    // only the terrain-load activity from here on.
    gl._record.resetTex()

    // Environment switches tileset before load #1 resolves → load #2 starts.
    r.terrainTileset = 'B'
    r.setGroundMode('terrain')
    assert.equal(pending.length, 2, 'a second load is issued while the first is in flight')

    // The later-issued load (B) wins first and takes the live slot.
    await resolveTile(pending[1])
    // The earlier load resolves LAST — it must be dropped as stale, not installed.
    await resolveTile(pending[0])

    const { texCreated, texDeleted } = gl._record
    assert.equal(texCreated, 1, 'only the winning load created a texture')
    assert.equal(texDeleted, 0, 'no live handle was orphaned')
    assert.equal(texCreated - texDeleted, 1, 'exactly one texture stays live (no leak)')
    assert.equal(r._terrainReady, true, 'terrain marked ready')
    assert.equal(r._terrainTex.img.tileset, 'B', 'live slot holds the current tileset, not the stale one')
  } finally {
    setAssetProvider(null)
  }
})

test('a single terrain load installs exactly one texture and marks ready', async () => {
  const gl = makeStubGL()
  const pending = makeDeferredProvider()
  try {
    const r = makeRenderer(gl)
    assert.equal(pending.length, 1)
    gl._record.resetTex()

    await resolveTile(pending[0])

    const { texCreated, texDeleted } = gl._record
    assert.equal(texCreated, 1, 'one texture created on the normal path')
    assert.equal(texDeleted, 0, 'nothing deleted on the normal path')
    assert.equal(r._terrainReady, true)
    assert.equal(r._terrainTex.img.tileset, pending[0].name)
  } finally {
    setAssetProvider(null)
  }
})
