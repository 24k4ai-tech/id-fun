// Authoritative, immutable attack footprints. Renderers receive these exact
// dimensions; movement and dodge are evaluated at impact, never at cast time.
export function createAttack(kind, from, to, now, damage, reach = 2.3) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const gap = Math.hypot(dx, dz) || 1;
  const base = { id: `${now}:${kind}`, kind, castAt: now, damage,
    originX: from.x, originZ: from.z, dx: dx / gap, dz: dz / gap };
  if (['arc', 'meteor', 'ultimate'].includes(kind)) return { ...base,
    shape: 'circle', x: to.x, z: to.z, radius: kind === 'ultimate' ? 3.1 : kind === 'meteor' ? 2.3 : 1.7,
    impactAt: now + (kind === 'meteor' ? 1250 : 1050) };
  if (kind === 'spell' || kind === 'skill1' || kind === 'special') return { ...base,
    shape: 'lane', length: kind === 'spell' ? Math.min(28, gap + 2) : 5,
    width: kind === 'spell' ? 1.65 : 2.0, impactAt: now + 900 };
  return { ...base, shape: 'cone', radius: kind === 'skill2' ? 8 : reach,
    halfAngle: kind === 'skill2' ? Math.PI * .42 : Math.PI / 3,
    impactAt: now + (kind === 'strike' ? 560 : 800) };
}

export function attackContains(attack, x, z) {
  if (attack.shape === 'circle') return Math.hypot(x - attack.x, z - attack.z) <= attack.radius;
  const dx = x - attack.originX, dz = z - attack.originZ;
  const forward = dx * attack.dx + dz * attack.dz;
  const sideways = dx * attack.dz - dz * attack.dx;
  if (attack.shape === 'lane') return forward >= 0 && forward <= attack.length && Math.abs(sideways) <= attack.width / 2;
  const gap = Math.hypot(dx, dz);
  return gap <= attack.radius && (gap < .01 || forward / gap >= Math.cos(attack.halfAngle));
}

export function attackHits(attack, x, z, dodgeUntil) {
  return attack.impactAt > dodgeUntil && attackContains(attack, x, z);
}

export const readAttack = value => value ? JSON.parse(value) : null;
