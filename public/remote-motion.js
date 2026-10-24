// Render authoritative positions smoothly; never send interpolated positions to the server.
export function remoteStep(x,z,target,dt) {
  if(!target)return {x,z,moving:false};
  const dx=target.x-x,dz=target.z-z,d=Math.hypot(dx,dz);
  const t=d>8?1:Math.min(1,Math.max(0,dt)*12);
  return {x:x+dx*t,z:z+dz*t,moving:d>.04,heading:Math.atan2(dx,dz)};
}
