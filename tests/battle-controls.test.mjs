import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_KEYS, battleDirection, orbitCamera } from '../public/battle-controls.js';
import { ARENA_X, ARENA_Z, clampArena } from '../server/combat-rules.mjs';

test('WASD follows a freely turned camera and W never casts a skill', () => {
  const startForward = battleDirection(1, 0, Math.PI / 2);
  assert.ok(startForward.dx > .99 && Math.abs(startForward.dz) < 1e-10);
  const startRight = battleDirection(0, 1, Math.PI / 2);
  assert.ok(Math.abs(startRight.dx) < 1e-10 && startRight.dz < -.99);
  assert.deepEqual(battleDirection(1, 0, 0), { dx: 0, dz: 1 });
  assert.deepEqual(battleDirection(0, 1, 0), { dx: 1, dz: 0 });
  const diagonal = battleDirection(1, 1, .73);
  assert.ok(Math.abs(Math.hypot(diagonal.dx, diagonal.dz) - 1) < 1e-10);
  assert.equal(BATTLE_KEYS.KeyW, undefined);
  assert.equal(BATTLE_KEYS.Digit1, 'spell');
  assert.equal(BATTLE_KEYS.Digit2, 'arc');
  assert.equal(BATTLE_KEYS.Digit3, 'meteor');
  assert.equal(BATTLE_KEYS.Digit4, 'ultimate');
});

test('right drag turns toward pointer movement and mouse-down tilts the view down', () => {
  const start = orbitCamera(Math.PI / 2, .24, 80, 80);
  assert.ok(start.yaw > Math.PI / 2);
  assert.ok(start.pitch > .24);
  assert.ok(battleDirection(1, 0, start.yaw).dz < 0);
  assert.equal(orbitCamera(0, 1.1, 0, 100).pitch, 1.05);
  assert.equal(orbitCamera(0, -.12, 0, -100).pitch, -.12);
});

test('both axes allow a substantially wider duel without escaping the ground', () => {
  assert.equal(ARENA_X, 23);
  assert.equal(ARENA_Z, 22);
  assert.deepEqual(clampArena(80, -80), { x: 23, z: -22 });
});
