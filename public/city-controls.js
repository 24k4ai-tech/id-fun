// Camera-relative motion in Babylon's left-handed X/Z ground plane.
export function cityDirection(right, backward, yaw) {
  const forwardX = Math.sin(yaw), forwardZ = -Math.cos(yaw);
  const rightX = -Math.cos(yaw), rightZ = -Math.sin(yaw);
  const x = rightX * right - forwardX * backward;
  const z = rightZ * right - forwardZ * backward;
  const length = Math.max(1, Math.hypot(x, z));
  return { x: x / length, z: z / length, forwardX, forwardZ };
}

export function cityOrbit(yaw, pitch, dx, dy) {
  const boundedX = Math.max(-100, Math.min(100, dx));
  const boundedY = Math.max(-100, Math.min(100, dy));
  return {
    yaw: yaw - boundedX * .0028,
    pitch: Math.max(-.12, Math.min(1.05, pitch + boundedY * .0022)),
  };
}

export function cityWalkable(x,z,margin=0) {
  return [[-9,-7],[9,-7],[-9,8],[9,8]].every(([a,b])=>Math.hypot(x-a,z-b)>3.15-margin)
    && [-18,18].every(a=>[-17,-6,5,16].every(b=>Math.abs(x-a)>2.15-margin||Math.abs(z-b)>2.45-margin));
}
