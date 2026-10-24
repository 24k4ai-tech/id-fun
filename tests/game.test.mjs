import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { action, advanceWorld, createResident, setRole, state } from '../server/game.mjs';

test('fast actions change resources and enforce cooldown and locked role', () => {
  const db = openDatabase(':memory:');
  const now = 1_000_000;
  createResident(db, { wallet: '0x1', handle: 'ada.ai' }, now);
  assert.equal(setRole(db, '0x1', 'builder'), 'builder');
  const gathered = action(db, '0x1', 'gather', 'human', now);
  assert.equal(gathered.material, 4);
  assert.equal(gathered.score, 0.5);
  assert.throws(() => setRole(db, '0x1', 'merchant'), /role_locked/);
  assert.throws(() => action(db, '0x1', 'build', 'human', now + 19_000), /action_cooldown/);
  const built = action(db, '0x1', 'build', 'human', now + 20_000);
  assert.equal(built.material, 0);
  assert.equal(state(db, '0x1', now + 20_000).city.district_level, 2);
  db.close();
});

test('public event progress and outcome follow server rules', () => {
  const db = openDatabase(':memory:', 5_000);
  const start = db.prepare('SELECT next_round_at FROM city').get().next_round_at;
  createResident(db, { wallet: '0x2', handle: 'bee.ai' }, start - 10_000);
  advanceWorld(db, start - 1_000, 5_000);
  const world = state(db, '0x2', start - 1_000);
  assert.equal(world.city.round, 0);
  assert.equal(world.event.kind, 'blackout');
  action(db, '0x2', 'repair', 'agent', start - 1_000);
  assert.equal(state(db, '0x2', start - 1_000).event.progress, 2);
  assert.throws(() => action(db, '0x2', 'repair', 'agent', start + 19_000), /not_enough_material/);
  db.close();
});

test('an empty test city does not lose stability while nobody is playing', () => {
  const db = openDatabase(':memory:', 5_000);
  const first = db.prepare('SELECT next_round_at FROM city').get().next_round_at;
  db.prepare('UPDATE city SET stability=0 WHERE id=1').run();
  const city = advanceWorld(db, first + 60_000, 5_000);
  assert.equal(city.stability, 70);
  db.close();
});
