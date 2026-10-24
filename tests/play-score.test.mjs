import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,transaction} from '../server/db.mjs';
import {createResident,action} from '../server/game.mjs';
import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from '../server/play-score.mjs';
import {createChallenge,resolveChallenge,pvpCommand,pvpState} from '../server/pvp.mjs';
import {rewardCandidates,scoreApprovedMatches} from '../server/reward-candidates.mjs';
import {createCityLife} from '../server/city-life.mjs';
import {journeyState,journeyCommand} from '../server/journey.mjs';
import {JOURNEY_NODES} from '../public/journey-rules.js';
import {CITY_PLACES} from '../public/city-places.js';

test('input seconds cap spam, manual wins mixed seconds, failed transactions roll back and settled ratios cannot change',()=>{
 const db=openDatabase(':memory:');try{
  beginPlayScore(db,'mix','0xAB');
  recordPlayInput(db,'mix','0xab','human',1000);
  for(let i=0;i<100;i++)recordPlayInput(db,'mix','0xAB','agent',2000+i);
  assert.equal(playScoreBps(db,'mix','0xab'),7500);
  recordPlayInput(db,'mix','0xab','human',2900);assert.equal(playScoreBps(db,'mix','0xAB'),5000);
  assert.throws(()=>transaction(db,()=>{recordPlayInput(db,'mix','0xab','agent',3000);throw Error('invalid');}));
  assert.equal(playScoreBps(db,'mix','0xab'),5000);
  recordPlayInput(db,'mix','0xab','agent',4000);
  assert.equal(earnedPoints(db,'mix','0xab',5),3.33);
  recordPlayInput(db,'mix','0xab','agent',5000);assert.equal(earnedPoints(db,'mix','0xab',5),3.33);
  assert.equal(earnedPoints(db,'historic','0xab',5),5);
 }finally{db.close();}
});

test('manual and Agent instant contributions differ by exactly 50%, without changing materials',()=>{
 const db=openDatabase(':memory:');try{
  for(const w of ['human','agent'])createResident(db,{wallet:w,handle:w+'.ai'},1000000);
  const h=action(db,'human','gather','human',1000000),a=action(db,'agent','gather','agent',1000000);
  assert.equal(h.score,.5);assert.equal(a.score,1);assert.equal(a.material,h.material);
 }finally{db.close();}
});

test('same-result PVP records 50% manual vs 100% Agent in both match results and tax candidates',()=>{
 const db=openDatabase(':memory:'),A='0x'+'11'.repeat(20),B='0x'+'22'.repeat(20),T='0x'+'33'.repeat(20),start=86400000;
 try{
  for(const [wallet,handle] of [[A,'a.ai'],[B,'b.ai']])createResident(db,{wallet,handle,verifiedAi:true},start);
  const c=createChallenge(db,A,B,start),m=resolveChallenge(db,B,c.id,'accept',start,{tokenAddress:T,blockNumber:1n,weights:[10000,10000]}).match;
  pvpCommand(db,A,'spell',{},start+1000,'human');pvpCommand(db,B,'spell',{},start+1000,'agent');
  pvpState(db,A,start+2000);const result=pvpState(db,A,m.expiresAt);
  assert.equal(result.status,'draw');assert.equal(result.points,1.5);assert.equal(pvpState(db,B,m.expiresAt).points,3);
  const candidates=rewardCandidates(db,start,T),scores=scoreApprovedMatches(candidates,[m.id]);
  assert.deepEqual(scores.map(r=>r.combatPoints),[1.5,3]);assert.deepEqual(scores.map(r=>r.points),[15000,30000]);
  recordPlayInput(db,'pvp:'+m.id,A,'agent',m.expiresAt+1000);
  assert.deepEqual(scoreApprovedMatches(rewardCandidates(db,start,T),[m.id]),scores);
 }finally{db.close();}
});

test('journey and commission completions apply per-run ratios once, retaining material awards',async()=>{
 for(const source of ['human','agent']){
  const db=openDatabase(':memory:'),wallet='walker';let now=1000000;
  try{
   createResident(db,{wallet,handle:'walker.ai'},now);journeyState(db,wallet,now);
   const place=(x,z)=>db.prepare('UPDATE journey_profiles SET x=?,z=? WHERE wallet=?').run(x,z,wallet);
   const cmd=(c,input)=>journeyCommand(db,wallet,c,input,now+=1000,source);
   let s=cmd('start',{kind:'signal'});for(const id of ['observatory',...s.run.order,'power']){const n=JOURNEY_NODES[id];place(n.x,n.z);s=cmd('interact',{id});}
   assert.equal(s.run.status,'complete');assert.equal(db.prepare('SELECT score FROM residents WHERE wallet=?').get(wallet).score,source==='agent'?3:1.5);
   const life=createCityLife(db,{},null),market=CITY_PLACES.market;place(market.x,market.z);life.enter(wallet,'market',now);
   db.prepare('UPDATE city_visits SET x=0,z=-2 WHERE wallet=?').run(wallet);
   let task=await life.start(wallet,'courier',false,now);
   for(let i=0;i<4;i++){
    const target=task.commission.target;if(target.place){place(market.x,market.z);if(!task.visit)life.enter(wallet,'market',now);db.prepare('UPDATE city_visits SET x=0,z=-2 WHERE wallet=?').run(wallet);}
    else{life.exit(wallet);const n=JOURNEY_NODES[target.node];place(n.x,n.z);}
    now+=6000;task=life.interact(wallet,task.commission.route[i],now,source);
   }
   assert.equal(task.notice,'complete');assert.equal(task.contribution,source==='agent'?3:1.5);
   assert.equal(task.materialReward,4);assert.equal(db.prepare('SELECT material FROM residents WHERE wallet=?').get(wallet).material,10);
   assert.throws(()=>life.interact(wallet,0,now+6000,source),/journey_no_active/);
  }finally{db.close();}
 }
});
