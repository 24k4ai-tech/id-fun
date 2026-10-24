import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident, state } from '../server/game.mjs';
import { battleCommand, battleState, startBattle } from '../server/battle.mjs';

test('battle commands are server-authoritative and a win updates the city once', () => {
  const db = openDatabase(':memory:');
  const now = 1_000_000;
  createResident(db, { wallet: '0xabc', handle: 'fighter.ai' }, now);
  const initial = startBattle(db, '0xabc', 'cz', now);
  assert.equal(initial.enemyHp, 380);
  assert.throws(() => startBattle(db, '0xabc', 'musk', now + 1), /battle_in_progress/);
  assert.throws(() => battleCommand(db, '0xabc', 'special', 'human', now + 400), /battle_not_enough_energy/);
  let battle;
  let hitCount = 0;
  for (let i = 1; i <= 85; i++) {
    const at = now + i * 400;
    const current = battleState(db, '0xabc', at - 120);
    if (current.status !== 'active') break;
    if (Math.hypot(current.enemyX - current.playerX, current.enemyZ - current.playerZ) > 2.25) {
      const dx = current.enemyX - current.playerX, dz = current.enemyZ - current.playerZ;
      battleCommand(db, '0xabc', 'move', 'human', at - 80, { dx: dx / Math.hypot(dx, dz), dz: dz / Math.hypot(dx, dz) });
    }
    const next = battleState(db, '0xabc', at);
    const distant = Math.hypot(next.enemyX - next.playerX, next.enemyZ - next.playerZ) > 2.3;
    const lastSpecial = db.prepare('SELECT last_special_at FROM battles WHERE wallet=?').get('0xabc').last_special_at;
    if (distant && (next.energy < 20 || at - lastSpecial < 1800)) continue;
    battle = battleCommand(db, '0xabc', distant ? 'spell' : 'strike', 'human', at);
    hitCount = i;
    if (battle.status === 'won') break;
  }
  assert.equal(battle.status, 'won');
  assert.ok(hitCount >= 30, 'the opening opponent should survive a short combo');
  assert.equal(battle.rewarded, true);
  assert.equal(state(db, '0xabc', now + hitCount * 400).me.score, 4);
  assert.equal(state(db, '0xabc', now + hitCount * 400).me.material, 4);
  assert.throws(() => battleCommand(db, '0xabc', 'strike', 'human', now + hitCount * 400 + 100), /no_active_battle/);
  assert.equal(battleState(db, '0xabc', now + hitCount * 400 + 200).status, 'won');
  db.close();
});

test('solo battle lasts up to two minutes; dodge has a server cooldown', () => {
  const db = openDatabase(':memory:');
  const now = 1_000_000;
  createResident(db, { wallet: '0xdef', handle: 'dodger.ai' }, now);
  const initial = startBattle(db, '0xdef', 'musk', now);
  assert.equal(initial.expiresAt, now + 120_000);
  const dodged = battleCommand(db, '0xdef', 'dodge', 'agent', now + 400);
  assert.equal(dodged.energy, 5);
  assert.ok(dodged.playerX < initial.playerX, 'no direction should roll away from the enemy');
  assert.throws(() => battleCommand(db, '0xdef', 'dodge', 'agent', now + 800), /battle_dodge_cooldown/);
  const sideRoll = battleCommand(db, '0xdef', 'dodge', 'agent', now + 1600, { dx: 0, dz: 1 });
  assert.equal(sideRoll.playerX, dodged.playerX);
  assert.equal(sideRoll.playerZ, dodged.playerZ + 1.05);
  db.prepare('UPDATE battles SET player_x=-8,player_z=-6,enemy_x=8,enemy_z=6,last_enemy_at=? WHERE wallet=?').run(now + 90_000, '0xdef');
  assert.equal(battleState(db, '0xdef', now + 80_000).status, 'active');
  const ended = battleState(db, '0xdef', now + 120_001);
  assert.equal(ended.status, 'lost');
  assert.equal(state(db, '0xdef', now + 120_001).me.score, 0);
  db.close();
});

test('staff skills consume different energy and recovery works once per fight', () => {
  const db = openDatabase(':memory:');
  const now = 2_000_000;
  createResident(db, { wallet: '0xstaff', handle: 'staff.ai' }, now);
  startBattle(db, '0xstaff', 'musk', now);
  db.prepare('UPDATE battles SET player_hp=50,energy=100 WHERE wallet=?').run('0xstaff');
  const healed = battleCommand(db, '0xstaff', 'heal', 'human', now + 400);
  assert.equal(healed.playerHp, 75);
  assert.equal(healed.healAvailable, false);
  assert.throws(() => battleCommand(db, '0xstaff', 'heal', 'human', now + 800), /battle_heal_used/);
  const first = battleCommand(db, '0xstaff', 'skill1', 'human', now + 800);
  assert.equal(first.energy, 70);
  assert.equal(first.enemyHp, 442);
  const second = battleCommand(db, '0xstaff', 'skill2', 'human', now + 2800);
  assert.equal(second.energy, 35);
  assert.equal(second.enemyHp, 418);
  assert.throws(() => battleCommand(db, '0xstaff', 'ultimate', 'human', now + 4800), /battle_not_enough_energy/);
  db.close();
});

test('charged heavy damage uses server hold time, not client claimed duration', () => {
  const db = openDatabase(':memory:');
  const now = 4_000_000;
  createResident(db, { wallet: '0xcharge', handle: 'charge.ai' }, now);
  startBattle(db, '0xcharge', 'musk', now);
  db.prepare('UPDATE battles SET energy=100 WHERE wallet=?').run('0xcharge');
  const uncharged = battleCommand(db, '0xcharge', 'heavy', 'human', now + 400, { chargeMs: 1200 });
  assert.equal(uncharged.enemyHp, 442);
  battleCommand(db, '0xcharge', 'charge', 'human', now + 1000);
  const charged = battleCommand(db, '0xcharge', 'heavy', 'human', now + 2200);
  assert.equal(charged.enemyHp, 418);
  db.close();
});

test('ranged spells have server range, energy and enemy dodge windows', () => {
  const db = openDatabase(':memory:');
  const now = 5_000_000;
  createResident(db, { wallet: '0xmagic', handle: 'magic.ai' }, now);
  startBattle(db, '0xmagic', 'cz', now);
  db.prepare('UPDATE battles SET player_x=-15,enemy_x=15,energy=100 WHERE wallet=?').run('0xmagic');
  assert.throws(() => battleCommand(db, '0xmagic', 'spell', 'human', now + 400), /battle_out_of_range/);
  db.prepare('UPDATE battles SET enemy_x=0 WHERE wallet=?').run('0xmagic');
  const cast = battleCommand(db, '0xmagic', 'spell', 'human', now + 400);
  assert.equal(cast.enemyHp, 367);
  assert.equal(cast.energy, 100);
  db.prepare('UPDATE battles SET last_enemy_at=?,enemy_attack_count=2,enemy_x=0,dodge_until=? WHERE wallet=?')
    .run(now + 1000, now + 5000, '0xmagic');
  const warning = battleState(db, '0xmagic', now + 3400);
  assert.equal(warning.enemyCast.kind, 'spell');
  assert.equal(warning.playerHp, 100);
  const avoided = battleState(db, '0xmagic', warning.enemyCast.impactAt);
  assert.equal(avoided.enemyAction.kind, 'spell');
  assert.equal(avoided.enemyAction.hit, false);
  assert.equal(avoided.playerHp, 100);
  db.close();
});

test('wide arena permits disengagement and three distinct ranged spells', () => {
  const db = openDatabase(':memory:');
  const now = 7_000_000;
  createResident(db, { wallet: '0xrange', handle: 'range.ai' }, now);
  startBattle(db, '0xrange', 'cz', now);
  db.prepare('UPDATE battles SET player_x=-13,enemy_x=4,energy=100 WHERE wallet=?').run('0xrange');
  const bolt = battleCommand(db, '0xrange', 'spell', 'human', now + 400);
  assert.equal(bolt.enemyHp, 367);
  assert.equal(bolt.energy, 100);
  const chain = battleCommand(db, '0xrange', 'arc', 'human', now + 2400);
  assert.equal(chain.enemyHp, 345);
  assert.equal(chain.energy, 80);
  const meteor = battleCommand(db, '0xrange', 'meteor', 'human', now + 4400);
  assert.equal(meteor.enemyHp, 313);
  assert.equal(meteor.energy, 45);
  db.prepare('UPDATE battles SET player_x=-22.9,player_z=-21.9,last_move_at=? WHERE wallet=?').run(now + 4400, '0xrange');
  const moved = battleCommand(db, '0xrange', 'move', 'human', now + 4600, { dx: -Math.SQRT1_2, dz: -Math.SQRT1_2 });
  assert.equal(moved.playerX, -23);
  assert.equal(moved.playerZ, -22);
  db.close();
});
