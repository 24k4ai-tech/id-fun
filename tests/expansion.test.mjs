import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,erc20Abi} from 'viem';
import {openDatabase,transaction} from '../server/db.mjs';
import {createResident} from '../server/game.mjs';
import {journeyState} from '../server/journey.mjs';
import {createEnergyService,changeEnergy,energyBalance,DEAD} from '../server/energy.mjs';
import {reserveActivity,finishActivity,cancelActivity} from '../server/activity-rewards.mjs';
import {rewardCandidates,rewardDayStart,scoreApprovedMatches} from '../server/reward-candidates.mjs';
import {buildRewardDraft} from '../server/reward-draft.mjs';
import {createMobaService} from '../server/moba.mjs';
import {createCityLife} from '../server/city-life.mjs';
import {CITY_PLACES,COMMISSION_KINDS} from '../public/city-places.js';
import {JOURNEY_NODES} from '../public/journey-rules.js';
import {newMobaState,stepMoba,mobaCommand,pathTo,walkable,visibleTo} from '../public/moba-rules.js';
const A='0x'+'1'.repeat(40),B='0x'+'2'.repeat(40),TOKEN='0x'+'3'.repeat(40),HASH='0x'+'4'.repeat(64),BLOCK='0x'+'5'.repeat(64);
function setup(){const db=openDatabase(':memory:');for(const [wallet,handle] of [[A,'one.ai'],[B,'two.ai']]){createResident(db,{wallet,handle});db.prepare('UPDATE residents SET verified_ai=1 WHERE wallet=?').run(wallet);journeyState(db,wallet);}return db;}
const entry=(wallet=A)=>({wallet,agentId:wallet===A?'one.ai':'two.ai',token:TOKEN,block:'100',weight:10000});
test('new modes allocate only confirmed batch funds; later tax and players cannot dilute older allocations',async()=>{
 const db=setup(),start=rewardDayStart(Date.now())+3600000, C='0x'+'7'.repeat(40),DEV='0x'+'9'.repeat(40),BNB=10n**18n;
 const add=(wallet,id,source,points,time)=>db.prepare('INSERT INTO activity_rewards(source,source_id,wallet,agent_id,token_address,token_block,weight,points,opponents,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(source,id,wallet,wallet===A?'one.ai':wallet===B?'two.ai':'three.ai',TOKEN,'100',10000,points,'[]',time);
 add(A,'city1','city',5,start-1000);add(B,'moba1','moba',20,start-900);
 const input={db,dayStart:start,receivedWei:5n*BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n,operatingWallet:DEV,tokenAddress:TOKEN,periodSeconds:60,resolveName:async id=>({'one.ai':A,'two.ai':B,'three.ai':C})[id]};
 const first=await buildRewardDraft(input);assert.equal(first.operatingWei,15n*BNB/10n);assert.equal(first.payouts.length,2);assert.ok(first.payouts.every(p=>p.amountWei===175n*BNB/1000n));
 add(C,'city2','city',5,start+61000);const same=await buildRewardDraft(input);assert.deepEqual(same.payouts,first.payouts);
 const next=await buildRewardDraft({...input,dayStart:start+60000,receivedWei:BNB,actualPlayerWei:700000000000000000n,actualOperationsWei:300000000000000000n});assert.equal(next.payouts.length,3);
 const paid=next.payouts.reduce((n,p)=>n+p.amountWei,0n);assert.equal(paid+next.heldPlayerWei+next.operatingWei,BNB);assert.ok(next.payouts.every(p=>p.amountWei<=35n*BNB/1000n));db.close();
});
test('energy charges require finalized, canonical, exact dead-address transfers and credit once',async()=>{
 const db=setup(),now=Date.now(),config={gameTokenAddress:TOKEN,energy:{enabled:true,decimals:18,taxBps:500}};let confirmations=1,received,chain=56,canonical=BLOCK;
 const client={getChainId:async()=>chain,getBlockNumber:async()=>100n+BigInt(confirmations-1),getBlock:async()=>({hash:canonical,timestamp:BigInt(Math.floor(now/1000))}),getTransaction:async()=>({from:A,to:TOKEN,input:order.transaction.data}),getTransactionReceipt:async()=>({status:'success',transactionHash:HASH,blockNumber:100n,blockHash:BLOCK,logs:[{address:TOKEN,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:A,to:DEAD}}),data:encodeAbiParameters([{type:'uint256'}],[received])}]})};
 const service=createEnergyService(db,config,client),order=service.order(A,now);received=200000n*10n**18n;
 await assert.rejects(service.confirm(A,order.id,HASH),/confirming/);assert.equal(energyBalance(db,A),0);
 confirmations=12;canonical='0x'+'6'.repeat(64);await assert.rejects(service.confirm(A,order.id,HASH),/confirming/);canonical=BLOCK;
 chain=1;await assert.rejects(service.confirm(A,order.id,HASH),/wrong_chain/);chain=56;
 received-=1n;await assert.rejects(service.confirm(A,order.id,HASH),/burn_short|invalid_payment/);received+=1n;
 await service.confirm(A,order.id,HASH);await service.confirm(A,order.id,HASH);assert.equal(energyBalance(db,A),100);
 const next=service.order(A,now);await assert.rejects(service.confirm(A,next.id,HASH),/payment_used/);assert.equal(energyBalance(db,A),100);
 assert.throws(()=>createEnergyService(db,{...config,gameTokenAddress:B},client),/domain_mismatch/);db.close();
});
test('energy reserve rollback, one active activity and restart refunds are atomic and idempotent',()=>{
 const db=setup();transaction(db,()=>changeEnergy(db,A,100,'initial'));
 assert.throws(()=>transaction(db,()=>{reserveActivity(db,'room:a','moba',entry());reserveActivity(db,'room:b','moba',entry(B));}),/insufficient/);
 assert.equal(energyBalance(db,A),100);assert.equal(db.prepare('SELECT count(*) n FROM activity_tickets').get().n,0);
 transaction(db,()=>reserveActivity(db,'one','moba',entry()));assert.equal(energyBalance(db,A),88);
 assert.throws(()=>transaction(db,()=>reserveActivity(db,'two','city',entry())),/busy/);
 transaction(db,()=>{cancelActivity(db,'one',true);cancelActivity(db,'one',true);});assert.equal(energyBalance(db,A),100);db.close();
});
test('city and arena share daily scoring, immutable identities and per-opponent caps before energy use',()=>{
 const db=setup(),now=Date.now();transaction(db,()=>changeEnergy(db,A,100,'initial'));
 for(let i=0;i<3;i++)transaction(db,()=>{reserveActivity(db,'duel'+i,'duel',entry(),now,[B]);finishActivity(db,'duel'+i,'d'+i,10,[B],now+i);});
 const balance=energyBalance(db,A);assert.throws(()=>transaction(db,()=>reserveActivity(db,'fourth','moba',entry(),now+5,[B])),/pair_limit/);assert.equal(energyBalance(db,A),balance);
 for(let i=0;i<3;i++)transaction(db,()=>{reserveActivity(db,'city'+i,'city',entry(),now+10);finishActivity(db,'city'+i,'c'+i,5,[],now+10+i);});
 assert.throws(()=>transaction(db,()=>reserveActivity(db,'city4','city',entry(),now+20)),/daily_limit/);
 assert.throws(()=>transaction(db,()=>reserveActivity(db,'renamed','moba',{...entry(),agentId:'changed.ai'},now+20)),/identity_required/);
 const c=rewardCandidates(db,rewardDayStart(now),TOKEN);assert.equal(c.matches.length,6);const score=scoreApprovedMatches(c,c.matches.map(m=>m.id));assert.equal(score[0].combatPoints,45);
 assert.equal(finishActivity(db,'duel0','d0',10,[B]),false);db.close();
});
test('walk paths route around walls and never cut corners',()=>{
 const from={x:-15,z:-7},to={x:-3,z:-7},path=pathTo(from,to);assert.ok(path.length>1);let p=from;
 for(const q of path){for(let t=0;t<=1;t+=.05)assert.ok(walkable(p.x+(q.x-p.x)*t,p.z+(q.z-p.z)*t,.25));p=q;}
 assert.deepEqual(pathTo(from,{x:-9,z:-7}),[]);
});
function game(){const s=newMobaState([{id:'hero-0',hero:'vitalik',team:0},{id:'hero-3',hero:'cz',team:1}],1000);s.heroes[0].x=0;s.heroes[0].z=0;s.heroes[1].x=6;s.heroes[1].z=0;return s;}
test('enemy windup gives time to move out; mana, cooldown, collision and ultimate gate are authoritative',()=>{
 const s=game(),[a,b]=s.heroes;assert.equal(mobaCommand(s,a.id,{kind:'skill',slot:3,x:6,z:0}),false);
 assert.ok(mobaCommand(s,a.id,{kind:'skill',slot:0,x:6,z:0}));assert.equal(b.hp,b.maxHp);assert.equal(a.mana,70);
 assert.equal(mobaCommand(s,a.id,{kind:'skill',slot:0,x:6,z:0}),false);
 mobaCommand(s,b.id,{kind:'move',x:6,z:4});for(let i=0;i<6;i++)stepMoba(s,s.now+100);assert.equal(b.hp,b.maxHp);
 const h=game();mobaCommand(h,h.heroes[0].id,{kind:'skill',slot:0,x:6,z:0});for(let i=0;i<6;i++)stepMoba(h,h.now+100);assert.ok(h.heroes[1].hp<h.heroes[1].maxHp);
});
test('core is protected by tower; brush hides distant players and recall is interruptible',()=>{
 const s=game(),h=s.heroes[0];h.x=22;assert.equal(mobaCommand(s,h.id,{kind:'attack',target:'core-1'}),false);
 s.structures[1].hp=0; // core 0 is irrelevant; tower 1 remains alive
 assert.equal(mobaCommand(s,h.id,{kind:'attack',target:'core-1'}),false);
 s.structures.find(t=>t.id==='tower-1').hp=0;assert.ok(mobaCommand(s,h.id,{kind:'attack',target:'core-1'}));
 h.x=-20;s.heroes[1].x=7;s.heroes[1].z=-6;assert.equal(visibleTo(s,s.heroes[1],0),false);
 assert.ok(mobaCommand(s,h.id,{kind:'recall'}));assert.ok(h.recallAt);mobaCommand(s,h.id,{kind:'move',x:-19,z:0});assert.equal(h.recallAt,0);
});
test('computer matches terminate and disconnected control never creates active participation',()=>{
 const s=newMobaState([{id:'hero-0',hero:'cz',team:0},{id:'hero-3',hero:'musk',team:1,bot:true}],1000);
 for(let i=0;i<6001&&s.status==='active';i++)stepMoba(s,s.now+100);
 assert.equal(s.status,'finished');assert.ok(s.heroes[0].activeMs<=12000);assert.equal(s.heroes[1].activeMs,0);assert.ok(s.heroes.every(h=>Number.isFinite(h.hp)));
});
test('1v1 friend lobby enforces membership and ready, bots fill practice, restart returns reserved energy',async()=>{
 const db=setup();let svc=createMobaService(db,{},null);try{
 const r=svc.create(A,{hero:'cz',teamSize:1});svc.join(B,r.id,'heyi');assert.throws(()=>svc.join('unknown',r.id),/resident/);
 await assert.rejects(svc.start(B,r.id),/not_ready/);svc.ready(A,r.id,'cz',true);svc.ready(B,r.id,'heyi',true);
 const match=await svc.start(A,r.id);assert.equal(match.state.heroes.length,1);const full=JSON.parse(db.prepare('SELECT state_json FROM moba_rooms WHERE id=?').get(r.id).state_json);assert.equal(full.heroes.length,2);assert.equal(full.heroes.filter(h=>h.bot).length,0);
 assert.throws(()=>svc.command('unknown',r.id,{kind:'stop'}),/not_found/);
 transaction(db,()=>{changeEnergy(db,A,100,'initial');reserveActivity(db,'moba:'+r.id+':'+A,'duel',entry());});
 svc.stop();svc=createMobaService(db,{},null);assert.equal(energyBalance(db,A),100);assert.equal(svc.state(A,r.id).status,'void');
 const practice=svc.create(A,{teamSize:3});svc.ready(A,practice.id,'cz',true);await svc.start(A,practice.id);
 const state=JSON.parse(db.prepare('SELECT state_json FROM moba_rooms WHERE id=?').get(practice.id).state_json);assert.equal(state.heroes.length,6);assert.equal(state.heroes.filter(h=>h.bot).length,5);
 assert.equal(svc.forfeit(A,practice.id).status,'finished');assert.equal(energyBalance(db,A),100);
 }finally{svc.stop();db.close();}
});
test('city requires proximity and walking; four interactions finish once and only ranked work enters tax ledger',async()=>{
 const db=setup(),svc=createCityLife(db,{},null),now=Date.now();assert.throws(()=>svc.enter(A,'market',now),/too_far/);
 const enter=(id,time)=>{const p=CITY_PLACES[id];db.prepare('UPDATE journey_profiles SET x=?,z=? WHERE wallet=?').run(p.x,p.z,A);svc.enter(A,id,time);};
 enter('market',now);assert.throws(()=>svc.move(A,{x:0,z:-2},now+100),/invalid_move/);
 svc.move(A,{x:0,z:0},now+1000);svc.move(A,{x:0,z:-1.5},now+2000);
 assert.throws(()=>svc.move(A,{x:0,z:-4},now+3000),/invalid_move/);
 let d=await svc.start(A,'courier',false,now+2000);await assert.rejects(svc.start(A,'courier',true),/not_live/);
 assert.throws(()=>svc.interact(A,d.commission.route[0],now+2500),/cooldown/);
 const route=d.commission.route;const steps=COMMISSION_KINDS.courier.steps;
 svc.interact(A,route[0],now+7000);svc.exit(A);
 for(let i=1;i<=2;i++){const n=JOURNEY_NODES[steps[i].node];db.prepare('UPDATE journey_profiles SET x=?,z=? WHERE wallet=?').run(n.x,n.z,A);svc.interact(A,route[i],now+7000+i*7000);}
 enter('market',now+23000);svc.move(A,{x:0,z:0},now+24000);svc.move(A,{x:0,z:-1.5},now+25000);
 d=svc.interact(A,route[3],now+29000);assert.equal(d.notice,'complete');assert.equal(d.materialReward,4);assert.equal(d.rewardPoints,0);
 assert.throws(()=>svc.interact(A,route[3],now+30000),/no_active/);assert.equal(db.prepare('SELECT count(*) n FROM activity_rewards').get().n,0);db.close();
});
