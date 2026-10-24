import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident, setAvatar } from '../server/game.mjs';
import { battleCommand, battleState, startBattle } from '../server/battle.mjs';
import { createChallenge, pvpCommand, pvpState, resolveChallenge } from '../server/pvp.mjs';

test('solo weapon range and damage are fixed when the match starts', () => {
  const db = openDatabase(':memory:');
  const now = 10_000_000;
  createResident(db, { wallet: '0xsolo', handle: 'solo.ai' }, now);
  setAvatar(db, '0xsolo', 'shadow', 'violet');
  const match = startBattle(db, '0xsolo', 'cz', now);
  assert.equal(match.playerAvatarId, 'shadow');
  setAvatar(db, '0xsolo', 'cz', 'gold');
  db.prepare('UPDATE battles SET player_x=0,enemy_x=2.25,player_z=0,enemy_z=0,last_step_at=?,last_enemy_at=? WHERE id=?')
    .run(now + 400, now + 10_000, match.id);
  assert.throws(() => battleCommand(db, '0xsolo', 'strike', 'human', now + 400), /battle_out_of_range/);
  db.prepare('UPDATE battles SET enemy_x=1.8,last_step_at=? WHERE id=?').run(now + 800, match.id);
  const hit = battleCommand(db, '0xsolo', 'strike', 'human', now + 800);
  assert.equal(hit.enemyHp, 371);
  assert.equal(battleState(db, '0xsolo', now + 801).playerAvatarId, 'shadow');
  db.close();
});

test('PVP uses each entrant’s snapped weapon and cannot gain reach by changing avatar', () => {
  const db = openDatabase(':memory:');
  const now = 12_000_000;
  createResident(db, { wallet: '0xa', handle: 'spear.ai' }, now);
  createResident(db, { wallet: '0xb', handle: 'dagger.ai' }, now);
  setAvatar(db, '0xa', 'cz', 'gold');
  setAvatar(db, '0xb', 'shadow', 'violet');
  const invite = createChallenge(db, '0xa', 'dagger.ai', now);
  const match = resolveChallenge(db, '0xb', invite.id, 'accept', now + 10).match;
  assert.equal(match.playerAvatarId, 'shadow');
  assert.equal(match.opponentId, 'cz');
  setAvatar(db, '0xa', 'shadow', 'violet');
  setAvatar(db, '0xb', 'cz', 'gold');
  db.prepare('UPDATE pvp_matches SET a_x=-1.325,b_x=1.325,a_z=0,b_z=0 WHERE id=?').run(match.id);
  const spearHit = pvpCommand(db, '0xa', 'strike', {}, now + 400);
  assert.equal(spearHit.enemyHp, 100);
  assert.equal(spearHit.playerCast.radius, 2.8);
  assert.throws(() => pvpCommand(db, '0xb', 'strike', {}, now + 401), /battle_out_of_range/);
  const unchanged = pvpState(db, '0xb', now + 402);
  assert.equal(unchanged.playerAvatarId, 'shadow');
  assert.equal(unchanged.opponentId, 'cz');
  assert.equal(pvpState(db, '0xa', spearHit.playerCast.impactAt).enemyHp,92);
  db.close();
});
