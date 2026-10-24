import test from 'node:test';
import assert from 'node:assert/strict';
import { followTargetYaw, targetYaw, angleDelta } from '../public/combat-camera.js';
import { battleDirection } from '../public/battle-controls.js';

test('locked movement approaches the actual enemy and strafes perpendicular, without camera lag', () => {
  for (const enemy of [{x:8,z:0},{x:-9,z:3},{x:2,z:-10}]) {
    const player={x:-1,z:-2}, yaw=targetYaw(player,enemy);
    const forward=battleDirection(1,0,yaw), side=battleDirection(0,1,yaw);
    const dx=enemy.x-player.x,dz=enemy.z-player.z,gap=Math.hypot(dx,dz);
    assert.ok(Math.abs(forward.dx-dx/gap)<1e-12);
    assert.ok(Math.abs(forward.dz-dz/gap)<1e-12);
    assert.ok(Math.abs(side.dx*dx+side.dz*dz)<1e-12);
  }
});
test('camera follows the shortest arc, bounds turn speed, and holds steady when fighters overlap', () => {
  const p={x:0,z:0}, e={x:.01,z:-10};
  const next=followTargetYaw(-Math.PI+.01,p,e,1/60);
  assert.ok(Math.abs(angleDelta(-Math.PI+.01,next))<.05);
  assert.equal(followTargetYaw(1,p,{x:.2,z:.1},.016),1);
  let yaw=0;
  for(let i=0;i<180;i++) yaw=followTargetYaw(yaw,p,{x:8,z:0},1/60);
  assert.ok(Math.abs(yaw-Math.PI/2)<.001);
});
