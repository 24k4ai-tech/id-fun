import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { createChallenge, pvpCommand, pvpLobby, pvpState, resolveChallenge } from '../server/pvp.mjs';

function land(db,wallet,command,input,now) {
  const cast=pvpCommand(db,wallet,command,input,now);
  return pvpState(db,wallet,cast.playerCast.impactAt);
}

test('two authenticated players can challenge, move, fight and receive one settled score', () => {
  const db = openDatabase(':memory:');
  const start = 1_000_000;
  createResident(db, { wallet: '0xaaa', handle: 'alpha.ai' }, start);
  createResident(db, { wallet: '0xbbb', handle: 'beta.ai' }, start);
  assert.throws(() => createChallenge(db, '0xaaa', 'alpha.ai', start), /pvp_self_challenge/);
  const challenge = createChallenge(db, '0xaaa', 'beta.ai', start);
  assert.equal(pvpLobby(db, '0xbbb', start).invitations.length, 1);
  assert.throws(() => resolveChallenge(db, '0xaaa', challenge.id, 'accept', start + 20), /unauthorized/);
  const accepted = resolveChallenge(db, '0xbbb', challenge.id, 'accept', start + 20);
  assert.equal(accepted.match.mode, 'pvp');
  assert.equal(accepted.match.expiresAt, start + 20 + 120_000);
  assert.equal(pvpLobby(db, '0xaaa', start + 30).match.id, accepted.match.id);
  assert.throws(() => createChallenge(db, '0xaaa', 'beta.ai', start + 40), /pvp_match_in_progress/);
  let now = start + 100;
  for (let i = 0; i < 4; i++) {
    pvpCommand(db, '0xaaa', 'move', { dx: 1, dz: 0 }, now);
    now += 100;
  }
  land(db, '0xbbb', 'strike', {}, now);
  now += 1000;
  let result;
  for (let i = 0; i < 10; i++) {
    result = land(db, '0xaaa', 'strike', {}, now);
    if (result.status === 'won') break;
    now += 1000;
  }
  assert.equal(result.status, 'won');
  assert.equal(result.points, 5);
  assert.equal(pvpState(db, '0xbbb', now).status, 'lost');
  assert.equal(pvpState(db, '0xbbb', now).points, 1);
  assert.equal(pvpLobby(db, '0xaaa', now).mine.points, 5);
  assert.throws(() => pvpCommand(db, '0xaaa', 'strike', {}, now + 500), /pvp_no_active_match/);
  db.close();
});

test('both players can cast a ranged spell and the rival sees the cast', () => {
  const db = openDatabase(':memory:');
  const now = 6_000_000;
  createResident(db, { wallet: '0xspellA', handle: 'spell-a.ai' }, now);
  createResident(db, { wallet: '0xspellB', handle: 'spell-b.ai' }, now);
  const invite = createChallenge(db, '0xspellA', 'spell-b.ai', now);
  const match = resolveChallenge(db, '0xspellB', invite.id, 'accept', now + 10).match;
  db.prepare('UPDATE pvp_matches SET a_x=-4,b_x=4,a_energy=100,b_energy=100 WHERE id=?').run(match.id);
  const cast = pvpCommand(db, '0xspellA', 'spell', {}, now + 400);
  assert.equal(cast.enemyHp, 100);
  assert.equal(cast.playerCast.kind, 'spell');
  assert.equal(cast.energy, 100);
  assert.equal(pvpState(db, '0xspellB', now + 401).enemyCast.kind, 'spell');
  const counter = pvpCommand(db, '0xspellB', 'spell', {}, now + 800);
  assert.equal(counter.enemyHp, 100);
  assert.equal(pvpState(db, '0xspellA', now + 1700).enemyHp, 87);
  assert.equal(pvpState(db, '0xspellB', now + 1700).enemyHp, 87);
  db.close();
});

test('an unopposed PVP match remains active before two minutes and then settles once', () => {
  const db = openDatabase(':memory:');
  const start = 1_000_000;
  createResident(db, { wallet: '0xaaa', handle: 'alpha.ai' }, start);
  createResident(db, { wallet: '0xbbb', handle: 'beta.ai' }, start);
  const invite = createChallenge(db, '0xaaa', 'beta.ai', start);
  const match = resolveChallenge(db, '0xbbb', invite.id, 'accept', start + 20).match;
  assert.equal(pvpState(db, '0xaaa', start + 100_000).status, 'active');
  assert.equal(pvpState(db, '0xaaa', match.expiresAt + 1).status, 'draw');
  assert.equal(pvpState(db, '0xbbb', match.expiresAt + 2).points, 0);
  assert.equal(pvpLobby(db, '0xaaa', match.expiresAt + 3).mine.points, 0);
  const retry = createChallenge(db, '0xaaa', 'beta.ai', match.expiresAt + 4);
  assert.ok(retry.id > invite.id);
  db.close();
});

test('a pair can earn practice points for at most three matches per 15-minute window', () => {
  const db = openDatabase(':memory:');
  const start = 1_000_000;
  createResident(db, { wallet: '0xaaa', handle: 'alpha.ai' }, start);
  createResident(db, { wallet: '0xbbb', handle: 'beta.ai' }, start);
  for (let round = 0; round < 4; round++) {
    const startAt = start + round * 10_000;
    const invite = createChallenge(db, '0xaaa', '0xbbb', startAt);
    const match = resolveChallenge(db, '0xbbb', invite.id, 'accept', startAt + 1).match;
    assert.equal(match.status, 'active');
    db.prepare('UPDATE pvp_matches SET a_x=-1,b_x=1 WHERE id=?').run(match.id);
    land(db, '0xbbb', 'strike', {}, startAt + 350);
    let result;
    for (let hit = 0; hit < 10; hit++) {
      result = land(db, '0xaaa', 'strike', {}, startAt + 1000 + hit * 800);
      if (result.status === 'won') break;
    }
    assert.equal(result.status, 'won');
    assert.equal(result.points, round < 3 ? 5 : 0);
  }
  assert.equal(pvpLobby(db, '0xaaa', start + 40_000).mine.points, 15);
  db.close();
});

test('practice points require real participation by both non-demo players', () => {
  const db = openDatabase(':memory:');
  const start = 2_000_000;
  createResident(db, { wallet: '0xaaa', handle: 'alpha.ai' }, start);
  createResident(db, { wallet: '0xbbb', handle: 'beta.ai' }, start);
  const invite = createChallenge(db, '0xaaa', 'beta.ai', start);
  const match = resolveChallenge(db, '0xbbb', invite.id, 'accept', start + 1).match;
  db.prepare('UPDATE pvp_matches SET a_x=-1,b_x=1 WHERE id=?').run(match.id);
  let result;
  for (let hit = 0; hit < 10; hit++) {
    result = land(db, '0xaaa', 'strike', {}, start + 400 + hit * 800);
    if (result.status === 'won') break;
  }
  assert.equal(result.status, 'won');
  assert.equal(result.points, 0);
  assert.equal(result.engaged, false);
  assert.equal(pvpLobby(db, '0xaaa', start + 5_000).mine.points, 0);

  createResident(db, { wallet: 'demo', handle: 'demo', isDemo: true }, start);
  const demoInvite = createChallenge(db, '0xaaa', 'demo', start + 10_000);
  const demoMatch = resolveChallenge(db, 'demo', demoInvite.id, 'accept', start + 10_001).match;
  db.prepare('UPDATE pvp_matches SET a_x=-1,b_x=1 WHERE id=?').run(demoMatch.id);
  land(db, 'demo', 'strike', {}, start + 10_400);
  for (let hit = 0; hit < 10; hit++) {
    result = land(db, '0xaaa', 'strike', {}, start + 11_000 + hit * 800);
    if (result.status === 'won') break;
  }
  assert.equal(result.engaged, true);
  assert.equal(result.points, 0);
  db.close();
});

test('PVP skills and one-use recovery stay server-authoritative', () => {
  const db = openDatabase(':memory:');
  const start = 3_000_000;
  createResident(db, { wallet: '0xleft', handle: 'left.ai' }, start);
  createResident(db, { wallet: '0xright', handle: 'right.ai' }, start);
  const invite = createChallenge(db, '0xleft', 'right.ai', start);
  const match = resolveChallenge(db, '0xright', invite.id, 'accept', start + 10).match;
  db.prepare('UPDATE pvp_matches SET a_hp=50,a_energy=100,a_x=-1,b_x=1 WHERE id=?').run(match.id);
  const healed = pvpCommand(db, '0xleft', 'heal', {}, start + 400);
  assert.equal(healed.playerHp, 75);
  assert.equal(healed.healAvailable, false);
  assert.throws(() => pvpCommand(db, '0xleft', 'heal', {}, start + 800), /battle_heal_used/);
  const hit = land(db, '0xleft', 'skill1', {}, start + 800);
  assert.equal(hit.energy, 70);
  assert.equal(hit.enemyHp, 81);
  assert.equal(pvpState(db, '0xright', start + 1700).playerHp, 81);
  const uncharged = land(db, '0xleft', 'heavy', { chargeMs: 1200 }, start + 1800);
  assert.equal(uncharged.enemyHp, 63);
  pvpCommand(db, '0xleft', 'charge', {}, start + 2700);
  const charged = land(db, '0xleft', 'heavy', {}, start + 3900);
  assert.equal(charged.enemyHp, 40);
  db.close();
});
