// Third-person motion in Babylon's X/Z plane. yaw=0 faces +Z.
export function battleDirection(forward, right, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const x = fx * forward + rx * right;
  const z = fz * forward + rz * right;
  const length = Math.max(1, Math.hypot(x, z));
  return { dx: x / length, dz: z / length };
}

export function orbitCamera(yaw, pitch, dx, dy) {
  const boundedX = Math.max(-100, Math.min(100, dx));
  const boundedY = Math.max(-100, Math.min(100, dy));
  return {
    yaw: yaw + boundedX * .0028,
    pitch: Math.max(-.12, Math.min(1.05, pitch + boundedY * .0022)),
  };
}

export const BATTLE_KEYS = Object.freeze({
  KeyJ: 'strike', KeyH: 'heal', Space: 'dodge',
  Digit1: 'spell', Digit2: 'arc', Digit3: 'meteor', Digit4: 'ultimate',
});
