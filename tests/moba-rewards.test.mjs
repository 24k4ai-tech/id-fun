import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,transaction} from '../server/db.mjs';
import {createResident} from '../server/game.mjs';
import {changeEnergy} from '../server/energy.mjs';
import {createMobaService} from '../server/moba.mjs';
import {mobaScore} from '../server/moba-scoring.mjs';
import {rewardCandidates,rewardDayStart,scoreApprovedMatches} from '../server/reward-candidates.mjs';
import {buildRewardDraft} from '../server/reward-draft.mjs';

const A='0x'+'1'.repeat(40),B='0x'+'2'.repeat(40),TOKEN='0x'+'3'.repeat(40),DEV='0x'+'9'.repeat(40);
const actor=(wallet,team,extra={})=>({wallet,team,bot:false,activeMs:70000,damage:250,objective:0,healing:0,assists:0,...extra});
test('MOBA rewards require meaningful human participation on both teams; practice and computers never score',()=>{
 const a=actor(A,0),b=actor(B,1),s={heroes:[a,b],winner:0};
 assert.equal(mobaScore(s,a,1,true).points,10);assert.equal(mobaScore(s,b,1,true).points,2);
 assert.equal(mobaScore(s,a,1,false).points,0);
 b.bot=true;assert.equal(mobaScore(s,a,1,true).reason,'no_active_opponent');assert.equal(mobaScore(s,b,1,true).points,0);
 b.bot=false;b.activeMs=0;assert.equal(mobaScore(s,a,1,true).points,0);
 b.activeMs=70000;b.forfeited=true;assert.equal(mobaScore(s,b,1,true).points,0);assert.equal(mobaScore(s,a,1,true).points,10);
 b.forfeited=false;const support=actor(B,1,{damage:0,healing:360,assists:2});s.heroes=[a,support];
 assert.equal(mobaScore(s,support,3,true).points,8);
});

function setup(){
 const db=openDatabase(':memory:');
 for(const [wallet,handle] of [[A,'one.ai'],[B,'two.ai']]){createResident(db,{wallet,handle});db.prepare('UPDATE residents SET verified_ai=1 WHERE wallet=?').run(wallet);transaction(db,()=>changeEnergy(db,wallet,100,'initial:'+wallet));}
 const config={energy:{enabled:true},gameTokenAddress:TOKEN,rewardTreasuryAddress:DEV};
 const client={getChainId:async()=>56,getBlockNumber:async()=>100n,readContract:async({functionName})=>functionName==='decimals'?18:1000000n*10n**18n};
 const service=createMobaService(db,config,client);return {db,service};
}
test('ranked MOBA blocks empty teams, demo identities and unverified players; early forfeit gives no bot or points',async()=>{
 const {db,service:s}=setup();try{
  const r=s.create(A,{teamSize:1,ranked:true});s.ready(A,r.id,'cz',true);await assert.rejects(s.start(A,r.id),/need_players/);
  s.join(B,r.id,'heyi');s.ready(B,r.id,'heyi',true);
  db.prepare('UPDATE residents SET is_demo=1 WHERE wallet=?').run(B);await assert.rejects(s.start(A,r.id),/identity_required/);
  db.prepare('UPDATE residents SET is_demo=0,verified_ai=0 WHERE wallet=?').run(B);await assert.rejects(s.start(A,r.id),/identity_required/);
  assert.equal(db.prepare('SELECT count(*) n FROM activity_tickets').get().n,0);
  db.prepare('UPDATE residents SET verified_ai=1 WHERE wallet=?').run(B);await s.start(A,r.id);
  const result=s.forfeit(B,r.id);assert.equal(result.status,'finished');assert.equal(result.state.heroes.find(h=>h.wallet===B).bot,false);
  assert.ok(result.state.heroes.every(h=>h.rewardPoints===0));assert.equal(db.prepare('SELECT count(*) n FROM activity_rewards').get().n,0);
 }finally{s.stop();db.close();}
});

test('real 1v1 controls settle once, reach shared points and produce capped U reward allocations',async t=>{
 let now=rewardDayStart(Date.now())+3600000;t.mock.method(Date,'now',()=>now);
 const {db,service:s}=setup();try{
  const r=s.create(A,{teamSize:1,ranked:true,hero:'cz'});s.join(B,r.id,'cz');s.ready(A,r.id,'cz',true);s.ready(B,r.id,'cz',true);await s.start(A,r.id);
  for(let i=0;i<360&&s.state(A,r.id).status==='active';i++){
   for(const wallet of [A,B]){
    const room=s.state(wallet,r.id),me=room.state.heroes.find(h=>h.wallet===wallet),enemy=room.state.heroes.find(h=>h.wallet&&h.wallet!==wallet&&h.hp>0);
    if(me.hp>0){s.command(wallet,r.id,enemy?{kind:'attack',target:enemy.id}:{kind:'attackMove',x:0,z:0},wallet===A?'agent':'human');if(enemy)s.command(wallet,r.id,{kind:'skill',slot:0,x:enemy.x,z:enemy.z},wallet===A?'agent':'human');}
   }
   now+=1000;s.tick();
  }
  const result=s.state(A,r.id);assert.equal(result.status,'finished');assert.ok(result.state.heroes.every(h=>h.rewardPoints>0),'both active human players should score');
  assert.equal(result.state.heroes.find(h=>h.wallet===A).scoreBps,10000);assert.equal(result.state.heroes.find(h=>h.wallet===B).scoreBps,5000);
  const count=db.prepare('SELECT count(*) n FROM activity_rewards').get().n;assert.equal(count,2);s.tick();assert.equal(db.prepare('SELECT count(*) n FROM activity_rewards').get().n,count);
  const candidates=rewardCandidates(db,rewardDayStart(now),TOKEN);assert.equal(candidates.matches.length,1);
  const scores=scoreApprovedMatches(candidates,candidates.matches.map(m=>m.id));assert.equal(scores.length,2);assert.ok(scores.every(x=>x.combatPoints>0&&x.points>=x.combatPoints*10000));
  const batch=Math.floor(now/60000)*60000+60000,received=5n*10n**18n;
  const draft=await buildRewardDraft({db,dayStart:batch,receivedWei:received,actualPlayerWei:3500000000000000000n,actualOperationsWei:1500000000000000000n,operatingWallet:DEV,tokenAddress:TOKEN,periodSeconds:60,resolveName:async id=>id==='one.ai'?A:B});
  assert.equal(draft.payouts.length,2);assert.ok(draft.payouts.every(x=>x.amountWei<=175n*10n**15n));
  assert.equal(draft.payouts.reduce((n,x)=>n+x.amountWei,0n)+draft.heldPlayerWei+draft.operatingWei,received);
 }finally{s.stop();db.close();}
});
