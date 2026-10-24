export const ARENA_X = 23;
export const ARENA_Z = 22;
export const RANGED = Object.freeze({
  spell: Object.freeze({ cost: 0, range: 28, damage: 13 }),
  arc: Object.freeze({ cost: 20, range: 24, damage: 22 }),
  meteor: Object.freeze({ cost: 35, range: 27, damage: 32 }),
});
export const clampArena = (x, z) => ({
  x: Math.max(-ARENA_X, Math.min(ARENA_X, x)),
  z: Math.max(-ARENA_Z, Math.min(ARENA_Z, z)),
});

// Optional melee assist is a short planted step, never a teleport/chase.
export function meleeApproach(from, to, reach, enabled) {
  const dx=to.x-from.x,dz=to.z-from.z,gap=Math.hypot(dx,dz);
  if (!enabled || gap <= reach || gap > reach + .6) return from;
  const step=Math.min(.6,gap-reach+.08);
  return clampArena(from.x+dx/gap*step,from.z+dz/gap*step);
}
