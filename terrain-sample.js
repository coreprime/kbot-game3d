// terrain-sample.js — CPU-side sampling of a battlefield height field.
//
// The renderer bakes a map's heights into a triangle mesh (see
// ModelRenderer.setMapTerrain); anything that wants to SIT on that mesh —
// grounded units, wreckage, selection rings, camera ground-picks — needs the
// same surface answered as a function.  createTerrainSampler wraps the raw
// pack height bytes in exactly the mesh's geometry:
//
//   * vertices at (cx*cellWU, heights[cz*w+cx]*heightScale, cz*cellWU),
//   * each cell quad split into the (00,10,11) / (00,11,01) triangle pair,
//
// so heightAt(x, z) returns the exact Y a full-resolution mesh renders at
// that point (large maps decimate their DRAWN mesh past ~90k quads; the
// sampler always answers at source resolution, which bounds the divergence
// to well under a height step).
//
// Why this matters for replays: recorded wire positions carry Y in TA world
// units, where the terrain surface sits at rawHeightByte × 1.0 wu.  The
// renderer deliberately flattens relief to heightScale (0.61) × rawHeight —
// a display-only choice — so a wire Y fed straight to the renderer floats
// units 0.39 × height above the drawn ground.  Clamping render Y through
// heightAt (the applyState `grounded` flag) pins units to the surface
// regardless of that scale; a driver placing airborne things converts
// altitude with the same heightScale instead.
//
// Pure module: no GL, no DOM — runs under plain Node for tests.

/**
 * @param {Object} t
 * @param {ArrayLike<number>} t.heights  Row-major raw height values (w×h).
 * @param {number} t.w  Heightmap width in cells.
 * @param {number} t.h  Heightmap height in cells.
 * @param {number} [t.cellWU=16]  World units per heightmap cell.
 * @param {number} [t.heightScale=1]  World-Y per raw height unit.
 * @param {number} [t.originX=0]  World X of cell (0, 0).
 * @param {number} [t.originZ=0]  World Z of cell (0, 0).
 * @returns {{
 *   heightAt: (x: number, z: number) => number,
 *   normalAt: (x: number, z: number) => [number, number, number],
 *   rawHeightAt: (x: number, z: number) => number,
 * }}
 */
export function createTerrainSampler({ heights, w, h, cellWU = 16, heightScale = 1, originX = 0, originZ = 0 }) {
  if (!heights || !(w > 0) || !(h > 0)) {
    const flat = () => 0
    const noop = () => {}
    return {
      heightAt: flat, rawHeightAt: flat, normalAt: () => [0, 1, 0],
      setFlatten: noop, clearFlatten: noop, flattenCount: () => 0,
    }
  }

  // Footprint-flatten overrides — a building levels the DRAWN terrain under
  // its floorplan so its base sits just above ground on a slope instead of
  // sinking into the hill.  This is a RENDER-ONLY, NON-PERSISTENT layer: the
  // source `heights` array is never mutated, each override is keyed by the
  // placing unit's id, and clearing it (on removal / death) reverts the cell
  // to real relief so the crater shows the true ground.  Each entry is a cell
  // rectangle [cx0..cx1] × [cz0..cz1] pinned to a single raw height.
  const overrides = new Map()

  // overrideAt returns the flatten height covering vertex (cx, cz), or null.
  // The MAX across overlapping footprints wins so a building never re-buries a
  // neighbour's flattened pad.
  const overrideAt = (cx, cz) => {
    if (overrides.size === 0) return null
    let hgt = null
    for (const o of overrides.values()) {
      if (cx >= o.cx0 && cx <= o.cx1 && cz >= o.cz0 && cz <= o.cz1) {
        if (hgt === null || o.height > hgt) hgt = o.height
      }
    }
    return hgt
  }

  // Vertex height in RAW units, clamped to the grid (matches the mesh's
  // edge-snap: the final column/row reuses the last height sample).  A
  // footprint-flatten override wins over the source height when present.
  const raw = (cx, cz) => {
    if (cx < 0) cx = 0; else if (cx > w - 1) cx = w - 1
    if (cz < 0) cz = 0; else if (cz > h - 1) cz = h - 1
    const ov = overrideAt(cx, cz)
    if (ov !== null) return ov
    return heights[cz * w + cx]
  }

  // sourceRaw reads the UN-overridden source height (the real relief), so the
  // flatten level can be chosen from the true ground under a footprint.
  const sourceRaw = (cx, cz) => {
    if (cx < 0) cx = 0; else if (cx > w - 1) cx = w - 1
    if (cz < 0) cz = 0; else if (cz > h - 1) cz = h - 1
    return heights[cz * w + cx]
  }

  const rawHeightAt = (x, z) => {
    // Continuous position in cell space.
    let fx = (x - originX) / cellWU
    let fz = (z - originZ) / cellWU
    if (fx < 0) fx = 0; else if (fx > w - 1) fx = w - 1
    if (fz < 0) fz = 0; else if (fz > h - 1) fz = h - 1
    const cx = Math.min(w - 2, Math.floor(fx))
    const cz = Math.min(h - 2, Math.floor(fz))
    const u = fx - cx
    const v = fz - cz
    const y00 = raw(cx, cz)
    const y10 = raw(cx + 1, cz)
    const y01 = raw(cx, cz + 1)
    const y11 = raw(cx + 1, cz + 1)
    // The mesh splits each quad along the (00 → 11) diagonal:
    //   u ≥ v  → triangle (00, 10, 11)
    //   u <  v → triangle (00, 11, 01)
    if (u >= v) return y00 + (y10 - y00) * u + (y11 - y10) * v
    return y00 + (y11 - y01) * u + (y01 - y00) * v
  }

  const heightAt = (x, z) => rawHeightAt(x, z) * heightScale

  // normalAt derives a SMOOTHED surface normal by central differences over
  // ~one cell — the right roughness for unit tilt (a tank spans several
  // texels; snapping to per-triangle facets reads as jitter while driving).
  const normalAt = (x, z) => {
    const d = cellWU * 0.75
    const dyDx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d)
    const dyDz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d)
    const inv = 1 / Math.hypot(dyDx, 1, dyDz)
    return [-dyDx * inv, inv, -dyDz * inv]
  }

  // setFlatten registers (or replaces) a footprint-flatten override for unit
  // `id`.  `worldRect` is the footprint in WORLD coordinates
  // ({ x, z, w, h } — x/z the corner, w/h the extent in world units); the rect
  // is snapped OUTWARD to whole cells so the whole floorplan is covered.  The
  // flatten height defaults to the MINIMUM source height under the footprint
  // (a safe choice: the base sits just above the lowest ground it spans, so no
  // corner is buried), unless an explicit raw `height` is given.  Returns the
  // cell rect + chosen height so the caller (renderer) can rebuild that mesh
  // region and clamp the unit's base to it.
  const setFlatten = (id, { x, z, w: rw, h: rh, height = null } = {}) => {
    if (id == null || !(rw > 0) || !(rh > 0)) return null
    // World rect → inclusive cell rect, snapped outward so the footprint's
    // edge vertices are levelled too.
    let cx0 = Math.floor((x - originX) / cellWU)
    let cz0 = Math.floor((z - originZ) / cellWU)
    let cx1 = Math.ceil((x + rw - originX) / cellWU)
    let cz1 = Math.ceil((z + rh - originZ) / cellWU)
    cx0 = Math.max(0, Math.min(w - 1, cx0))
    cz0 = Math.max(0, Math.min(h - 1, cz0))
    cx1 = Math.max(0, Math.min(w - 1, cx1))
    cz1 = Math.max(0, Math.min(h - 1, cz1))
    let hgt = height
    if (hgt === null) {
      // MIN over the footprint's SOURCE relief — ignore other overrides so the
      // level tracks the true ground, not a neighbour's pad.
      hgt = Infinity
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const sh = sourceRaw(cx, cz)
          if (sh < hgt) hgt = sh
        }
      }
      if (!Number.isFinite(hgt)) hgt = 0
    }
    const entry = { cx0, cz0, cx1, cz1, height: hgt }
    overrides.set(id, entry)
    return entry
  }

  // clearFlatten removes unit `id`'s footprint override, reverting those cells
  // to real relief.  Returns the removed entry (for a mesh rebuild) or null.
  const clearFlatten = (id) => {
    const entry = overrides.get(id) || null
    if (entry) overrides.delete(id)
    return entry
  }

  return {
    heightAt, rawHeightAt, normalAt,
    setFlatten, clearFlatten,
    flattenCount: () => overrides.size,
  }
}
