export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// A critically bounded turn avoids a full camera flip when fighters cross.
export function followTargetYaw(yaw, player, enemy, dt) {
  if (Math.hypot(enemy.x - player.x, enemy.z - player.z) < .65) return yaw;
  const delta = angleDelta(yaw, Math.atan2(enemy.x - player.x, enemy.z - player.z));
  const step = delta * (1 - Math.exp(-7 * dt));
  return yaw + Math.max(-2.8 * dt, Math.min(2.8 * dt, step));
}

export function targetYaw(player, enemy, fallback = 0) {
  return Math.hypot(enemy.x - player.x, enemy.z - player.z) < .65 ? fallback
    : Math.atan2(enemy.x - player.x, enemy.z - player.z);
}
