import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttack,attackContains } from '../server/attack-rules.mjs';
import { meleeApproach } from '../server/combat-rules.mjs';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { startBattle,battleState,battleCommand } from '../server/battle.mjs';
import { createChallenge,resolveChallenge,pvpCommand,pvpState } from '../server/pvp.mjs';

test('circle, lane and cone boundaries match advertised dimensions in every direction', () => {
  const from={x:3,z:-4},to={x:3,z:4};
  const circle=createAttack('meteor',from,to,100,32);
  assert.ok(attackContains(circle,5.29,4));assert.ok(!attackContains(circle,5.31,4));
  const lane=createAttack('spell',from,to,100,13);
  assert.ok(attackContains(lane,3.82,0));assert.ok(!attackContains(lane,3.84,0));
  assert.ok(!attackContains(lane,3,-4.01));
  const cone=createAttack('strike',from,to,100,10,2.3);
  assert.ok(attackContains(cone,3,-1.71));assert.ok(!attackContains(cone,3,-1.69));
  assert.ok(!attackContains(cone,3,-4.1));
  const diagonal=createAttack('spell',{x:0,z:0},{x:10,z:10},100,13);
  assert.ok(attackContains(diagonal,5,5));assert.ok(!attackContains(diagonal,6,4));
});

test('melee assist only takes a bounded step within reach; it cannot chase or teleport', () => {
  const from={x:0,z:0};
  const step=meleeApproach(from,{x:2.7,z:0},2.3,true);
  assert.ok(step.x>0 && step.x<=.6);assert.ok(2.7-step.x<=2.3);
  assert.deepEqual(meleeApproach(from,{x:10,z:0},2.3,true),from);
  assert.deepEqual(meleeApproach(from,{x:2.7,z:0},2.3,false),from);
  assert.deepEqual(meleeApproach(from,{x:0,z:0},2.3,true),from);
});

function solo() {
  const db=openDatabase(':memory:');createResident(db,{wallet:'test',handle:'fighter.ai'},10000);
  startBattle(db,'test','cz',10000);
  return db;
}
test('solo warning stays fixed, moving out avoids damage, and repeated polling cannot apply damage twice', () => {
  const db=solo();
  const cast=battleState(db,'test',12700);
  assert.equal(cast.playerHp,100);assert.equal(cast.enemyCast.kind,'spell');
  const warning=cast.enemyCast;
  const moved=battleCommand(db,'test','move','human',12900,{dx:0,dz:1});
  assert.deepEqual(moved.enemyCast,warning);
  const impact=battleState(db,'test',warning.impactAt);
  assert.equal(impact.enemyAction.hit,false);assert.equal(impact.playerHp,100);
  assert.equal(battleState(db,'test',warning.impactAt+10).playerHp,100);
  db.close();
});
test('standing in the warning takes damage only at impact; late dodge cannot undo it', () => {
  const db=solo();const cast=battleState(db,'test',12700).enemyCast;
  assert.equal(battleState(db,'test',cast.impactAt-1).playerHp,100);
  const dodge=battleCommand(db,'test','dodge','human',cast.impactAt+1,{dx:0,dz:1});
  assert.equal(dodge.playerHp,92);
  assert.equal(battleState(db,'test',cast.impactAt+50).playerHp,92);
  db.close();
});
test('dodge protects at the impact timestamp and late polling does not backdate a new warning', () => {
  const db=solo();const cast=battleState(db,'test',12700).enemyCast;
  battleCommand(db,'test','dodge','human',cast.impactAt-300,{dx:1,dz:0});
  assert.equal(battleState(db,'test',cast.impactAt).playerHp,100);
  const late=battleState(db,'test',20000);
  assert.equal(late.enemyCast.castAt,20000);
  assert.ok(late.enemyCast.impactAt>20000);
  db.close();
});
function duel() {
  const db=openDatabase(':memory:');
  for(const wallet of ['a','b']) createResident(db,{wallet,handle:wallet+'.ai'},10000);
  const c=createChallenge(db,'a','b',10000);resolveChallenge(db,'b',c.id,'accept',10000);
  db.prepare('UPDATE pvp_matches SET a_x=-1,b_x=1,a_energy=100,b_energy=100').run();
  return db;
}
test('PVP exposes the same immutable cast to both players and permits a spatial sidestep', () => {
  const db=duel();
  const cast=pvpCommand(db,'a','spell',{},10400);
  assert.equal(cast.enemyHp,100);assert.equal(cast.playerCast.kind,'spell');
  assert.deepEqual(pvpState(db,'b',10401).enemyCast,cast.playerCast);
  assert.throws(()=>pvpCommand(db,'a','strike',{},10800),/battle_command_cooldown/);
  pvpCommand(db,'b','move',{dx:0,dz:1},10600);
  assert.equal(pvpState(db,'b',11300).playerHp,100);
  assert.equal(pvpState(db,'a',11301).playerDamage,0);
  db.close();
});
test('PVP melee warns, hits at impact, and counts effective damage once', () => {
  const db=duel();const cast=pvpCommand(db,'a','strike',{},10400);
  assert.equal(cast.enemyHp,100);
  const hit=pvpState(db,'a',cast.playerCast.impactAt);
  assert.equal(hit.enemyHp,90);assert.equal(hit.playerDamage,10);assert.equal(hit.energy,100);
  assert.equal(pvpState(db,'a',11000).playerDamage,10);
  db.close();
});

test('server accepts assisted melee at the edge but rejects distant attacks and rolls back movement on failure', () => {
  const db=duel();db.prepare('UPDATE pvp_matches SET a_x=0,b_x=2.7').run();
  const cast=pvpCommand(db,'a','strike',{assist:true},10400);
  assert.ok(cast.playerX>0 && cast.playerX<=.6);
  assert.equal(pvpState(db,'a',10960).enemyHp,90);
  db.prepare('UPDATE pvp_matches SET b_x=15').run();
  assert.throws(()=>pvpCommand(db,'a','strike',{assist:true},11200),/battle_out_of_range/);
  assert.equal(pvpState(db,'a',11201).playerX,cast.playerX);
  db.close();
});
test('simultaneous lethal PVP attacks trade and a defeated caster cannot deal a later hit', () => {
  for (const delay of [0,100]) {
    const db=duel();db.prepare('UPDATE pvp_matches SET a_hp=10,b_hp=10').run();
    pvpCommand(db,'a','strike',{},10400);pvpCommand(db,'b','strike',{},10400+delay);
    const result=pvpState(db,'a',11200);
    assert.equal(result.status,delay?'won':'draw');
    assert.equal(result.playerHp,delay?10:0);
    db.close();
  }
});
