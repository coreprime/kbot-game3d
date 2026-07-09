// weapon-rendertype.js
//
// Named constants for TA's `rendertype` weapon TDF field.  The values
// come from an audit of the stock weapons/*.tdf (256 weapons across
// weapons.tdf, rockets.tdf, armemp_weapon.tdf, cortron_weapon.tdf):
//
//   0  LASER       — instant-hit beam (always paired with beamweapon=1).
//                    e.g. ARMCOMLASER, CORCOMLASER, ARM_TOTAL_ANNIHILATOR,
//                    CORE_DOOMSDAY, ARM_PARALYZER.  Count: 34.
//   1  PROJECTILE  — smoke-trailed sprite, missile/torpedo class.
//                    e.g. SBMISSILE, ARM_TORPEDO, ARMSMART_TORPEDO,
//                    all stock rockets.  Count: 68 + 12.
//   2  MINDGUN     — single TA weapon (MINDGUN), a paralyser variant.
//                    Visually reads as a beam.  Count: 1.
//   3  DGUN        — Commander disintegrator fireball; bright orange
//                    energy ball with a flame trail.  ARM_DISINTEGRATOR
//                    + CORE_DISINTEGRATOR.  Count: 2.
//   4  BITMAP      — 2D bitmap sprite, the catch-all bullet / plasma
//                    bolt / shell.  e.g. EMG, VTOL_EMG, ATOMIC_BLAST,
//                    most cannons.  Count: 79.
//   5  FLAME       — flamethrower particle stream.  FLAMETHROWER.
//                    Count: 1.
//   6  BOMB        — gravity-falling bomb (always dropped=1).  ARMBOMB,
//                    ARMADVBOMB, CORBOMB, CORADVBOMB.  Count: 4.
//   7  LIGHTNING   — instant-hit lightning bolt.  LIGHTNING (Buzzsaw).
//                    Count: 2.
//
// Why bake these into named constants rather than detect from flag
// combinations (commandFire / beamWeapon / ballistic / dropped)?
//
//   * `rendertype` is what TA's engine actually uses to pick the
//     projectile visual — it's already authoritative game data.
//   * Detecting from flags fragile-couples our classifier to flag
//     combinations that depend on each other (the D-Gun fix is the
//     best example: ARM_DISINTEGRATOR has commandfire+beamweapon
//     with areaofeffect=48, which broke any "commandFire+huge-AoE"
//     heuristic).  rendertype=3 says "this is a D-Gun" unambiguously.
//   * Mod weapons that ship without rendertype still fall through to
//     the flag heuristic + name regex below in pickProjectileKind, so
//     we don't lose coverage.

export const WEAPON_RENDERTYPE_LASER      = 0
export const WEAPON_RENDERTYPE_PROJECTILE = 1
export const WEAPON_RENDERTYPE_MINDGUN    = 2
export const WEAPON_RENDERTYPE_DGUN       = 3
export const WEAPON_RENDERTYPE_BITMAP     = 4
export const WEAPON_RENDERTYPE_FLAME      = 5
export const WEAPON_RENDERTYPE_BOMB       = 6
export const WEAPON_RENDERTYPE_LIGHTNING  = 7

// ── Pack v8 effectClass ────────────────────────────────────────────────
//
// weapons.json format v8 carries a per-weapon `effectClass` derived by the
// pack builder from each game's own weapon data (TA: rendertype + ballistic;
// TA:K: the type=/nimbus=/lightmap=/hweffect=/damagetype= fields the engine
// itself dispatches on).  It is the gate for light/glow policy:
//
//   physical  — arrow / bolt / stone / ballista shot: a dark object in
//               flight.  NO light emission, no additive glow, no fiery
//               muzzle pop; impacts are dust + sparks, not fire.
//   fire      — flame breath / fireballs: warm emissive glow.
//   magic     — nimbus-glowing spell projectiles: warm arcane glow.
//   lightning — bolt weapons: instant beam (tinted by the def's colours).
//   melee     — no projectile at all (the swing lives in the COB anim).
//   beam / plasma / missile / ballistic / flame — the TA families; these
//               keep the renderType-driven pipeline untouched.
//
// Packs older than v8 ship no effectClass, so every helper below returns
// false/'' for them and behaviour is exactly what it was.

export function weaponEffectClass(weapon) {
  if (!weapon || typeof weapon.effectClass !== 'string') return ''
  return weapon.effectClass.toLowerCase()
}

// isPhysicalClass — a mundane object in flight; must never emit light.
export function isPhysicalClass(weapon) {
  return weaponEffectClass(weapon) === 'physical'
}

// isWarmGlowClass — the fire/magic family: warm emissive glow, scaled well
// below the TA energy weapons.
export function isWarmGlowClass(weapon) {
  const c = weaponEffectClass(weapon)
  return c === 'fire' || c === 'magic'
}

// hasRenderType — was `rendertype` actually shipped on the weapon, or
// did the TDF omit it and the Go side defaulted to 0?
//
// We can't disambiguate by value alone — 0 is the legit LASER constant
// — but every stock TA weapon with rendertype=0 ALSO sets beamweapon=1
// (they're describing the same fact: "this is a laser").  So we treat
// 0 as authentic only when beamweapon is also set; otherwise it reads
// as "field omitted, fall back to the flag heuristic."
//
// Any rendertype > 0 is unambiguously present.
export function hasRenderType(weapon) {
  if (!weapon) return false
  const rt = weapon.renderType
  if (typeof rt !== 'number') return false
  if (rt > 0) return true
  return rt === 0 && !!weapon.beamWeapon
}
