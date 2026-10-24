import test from 'node:test';
import assert from 'node:assert/strict';
import { cityDirection, cityOrbit } from '../public/city-controls.js';

test('city A/D match screen direction and rotate with the mouse camera', () => {
  assert.ok(cityDirection(1, 0, 0).x < 0, 'D moves screen-right at the starting camera angle');
  assert.ok(cityDirection(-1, 0, 0).x > 0, 'A moves screen-left');
  assert.ok(cityDirection(0, -1, 0).z < 0, 'W moves ahead');
  const turned = cityDirection(0, -1, Math.PI / 2);
  assert.ok(turned.x > .99, 'W follows the camera after a quarter turn');
  assert.ok(Math.abs(Math.hypot(...Object.values(cityDirection(1, -1, 0)).slice(0, 2)) - 1) < 1e-9,
    'diagonals keep the same speed');
});

test('city drag rotates right and mouse-down looks downward', () => {
  const view = cityOrbit(0, .38, 90, 90);
  assert.ok(view.yaw < 0);
  assert.ok(view.pitch > .38);
  assert.ok(cityDirection(0, -1, view.yaw).x < 0);
  assert.equal(cityOrbit(0, 1.05, 0, 100).pitch, 1.05);
  assert.equal(cityOrbit(0, -.12, 0, -100).pitch, -.12);
});
