import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {simulateTaxPayout} from '../simulations/tax-payout.mjs';
import {buildClaimManifest} from '../server/reward-merkle.mjs';
import {validateDistributionManifest} from '../server/reward-distributor.mjs';
import {signRewardManifest,verifyRewardSignature} from '../server/reward-signature.mjs';
import {nextPublicPayout} from '../server/public-distribution.mjs';
import {readRewardBalance} from '../server/reward-estimate.mjs';
import {openDatabase} from '../server/db.mjs';
import {initRewardBatches,freezeRewardBatch} from '../server/reward-worker.mjs';
import {rewardCatalog} from '../server/reward-catalog.mjs';
import {rewardEpochCandidates,scoreApprovedMatches} from '../server/reward-candidates.mjs';
import {createResident} from '../server/game.mjs';
import {createChallenge,resolveChallenge} from '../server/pvp.mjs';
const address=n=>'0x'+n.toString(16).padStart(40,'0'),BNB=10n**18n;
const agents=n=>Array.from({length:n},(_,i)=>({agentId:'player'+i+'.ai',gameWallet:address(i+1),resolvedWallet:address(i+1),points:(i+1)*10000,approved:true}));
const payout=(receivedWei,rows)=>simulateTaxPayout({receivedWei,actualPlayerWei:receivedWei===5n*BNB?3500000000000000000n:receivedWei,actualOperationsWei:receivedWei===5n*BNB?1500000000000000000n:0n,operatingWallet:address(999),agents:rows,minEligibleAgents:2,maxWalletShareBps:500});
test('5 BNB scenarios: one ID gets zero, two IDs get at most 0.175 each, 20 equal IDs can allocate the whole player share',()=>{
 const one=payout(5n*BNB,agents(1));assert.equal(one.payouts.length,0);assert.equal(one.heldPlayerWei,35n*BNB/10n);
 const two=payout(5n*BNB,agents(2));assert.deepEqual(two.payouts.map(r=>r.amountWei),[175n*BNB/1000n,175n*BNB/1000n]);assert.equal(two.heldPlayerWei,315n*BNB/100n);
 const twenty=payout(5n*BNB,agents(20).map(r=>({...r,points:10000})));assert.equal(twenty.heldPlayerWei,0n);assert.equal(twenty.payouts.length,20);
});
test('varying tax, joins, departures and weights never allocate unfunded BNB or recycle the held remainder',()=>{
 let tax=0n,paid=0n,ops=0n,held=0n;const retained=[];
 for(let batch=0;batch<300;batch++){
  const revenue=BigInt(batch%19)*BNB/100n+BigInt(batch),rows=agents(batch%31).map((r,i)=>({...r,points:((i*17+batch)%53+1)*10000}));
  const result=payout(revenue,rows),sum=result.payouts.reduce((n,r)=>n+r.amountWei,0n);
  assert.equal(sum+result.heldPlayerWei+result.operatingWei,revenue);
  for(const row of result.payouts)assert.ok(row.amountWei<=result.playerPoolWei*5n/100n);
  tax+=revenue;paid+=sum;ops+=result.operatingWei;held+=result.heldPlayerWei;retained.push(result);
  assert.equal(paid+ops+held,tax);assert.equal(JSON.stringify(retained[0],(_,v)=>typeof v==='bigint'?String(v):v),JSON.stringify(payout(0n,[]),(_,v)=>typeof v==='bigint'?String(v):v));
 }
});
test('partial allocation proofs conserve the remainder and signatures bind every payment domain',async()=>{
 const a=privateKeyToAccount('0x'+'11'.repeat(32)),snapshot=payout(5n*BNB,agents(2));
 const manifest=buildClaimManifest({...snapshot,status:'draft_only',dayStart:60000,periodSeconds:60},{treasuryAddress:address(100)});
 assert.equal(validateDistributionManifest(manifest),35n*BNB/100n);assert.equal(manifest.totalWei,String(snapshot.playerPoolWei-snapshot.heldPlayerWei));
 const signature=await signRewardManifest(a,manifest);assert.ok(await verifyRewardSignature(manifest,signature,a.address));
 assert.equal(await verifyRewardSignature({...manifest,day:2},signature,a.address),false);
 assert.equal(await verifyRewardSignature({...manifest,treasuryAddress:address(101)},signature,a.address),false);
 const read={rewardAsset:address(0),EPOCH_SECONDS:60n,publisher:a.address,rewardAccountingEnabled:true,unallocatedByDayWei:snapshot.playerPoolWei,epochs:['0x'+'0'.repeat(64),0n,0n,0n]};
 const client={getChainId:async()=>56,getBytecode:async()=>'0x6000',getBlock:async()=>({timestamp:121n}),readContract:async i=>read[i.functionName]};
 const review={status:'prepared_only',manifest,signature};
 const ready=await nextPublicPayout({client,review,recipient:address(2)});assert.equal(ready.status,'ready');assert.equal(ready.wallet,address(2));assert.equal(ready.amountWei,String(175n*BNB/1000n));
 read.unallocatedByDayWei=0n;assert.equal((await nextPublicPayout({client,review,recipient:address(2)})).status,'closed');
});
test('funding reads are pinned to one block and exclude reserved and operational balances',async()=>{
 const timestamp=BigInt(Math.floor(Date.now()/1000)),calls=[];
 const values={rewardAsset:address(0),EPOCH_SECONDS:60n,operationsWei:15n*BNB/10n,playerLiabilityWei:35n*BNB/10n,unallocatedPlayerWei:2n*BNB,
  unallocatedByDayWei:BNB,accountedWei:5n*BNB,rewardAccountingEnabled:true,operations:address(999)};
 const client={getChainId:async()=>56,getBlock:async()=>({number:123n,timestamp}),getBalance:async i=>{calls.push(i);return 5n*BNB;},readContract:async i=>{calls.push(i);return values[i.functionName];}};
 const snap=await readRewardBalance(client,address(100));assert.equal(snap.currentPoolWei,String(BNB));assert.equal(snap.reservedWei,String(15n*BNB/10n));
 assert.ok(calls.filter(c=>c.functionName!=='EPOCH_SECONDS').every(c=>c.blockNumber===123n));
 values.playerLiabilityWei=6n*BNB;await assert.rejects(readRewardBalance(client,address(100)),/invalid_treasury_state/);
});
test('frozen reward roots cannot be replaced by new points, new fees or worker retries',()=>{
 const db=openDatabase(':memory:');initRewardBatches(db);db.prepare('INSERT INTO reward_batches(epoch) VALUES(1)').run();
 const first={manifest:{root:'first'},draft:{scoreCutoff:100,scoreEvidence:[]}},second={manifest:{root:'second'},draft:{scoreCutoff:200,scoreEvidence:[]}};
 assert.equal(freezeRewardBatch(db,1,first).manifest.root,'first');assert.equal(freezeRewardBatch(db,1,second).manifest.root,'first');db.close();
});

test('equal weight pays equally regardless of order; higher valid weight never reduces a payout before the cap',()=>{
 const equal=agents(30).map(r=>({...r,points:10000})),base=payout(5n*BNB,equal);
 assert.equal(new Set(base.payouts.map(r=>String(r.amountWei))).size,1);
 assert.deepEqual(payout(5n*BNB,[...equal].reverse()).payouts,base.payouts);
 let prior=0n;
 for(const points of [10000,12000,15000,20000,50000]){
  const result=payout(5n*BNB,equal.map((r,i)=>i===0?{...r,points}:r));
  const amount=result.payouts.find(r=>r.wallet===equal[0].gameWallet).amountWei;
  assert.ok(amount>=prior);assert.ok(amount<=175n*BNB/1000n);prior=amount;
 }
 assert.equal(prior,175n*BNB/1000n);
});

test('a fixed minute cutoff excludes later matches and identities even when processing is delayed',()=>{
 const db=openDatabase(':memory:'),start=2*86400000,token=address(40);
 try{
  for(let i=1;i<=3;i++)createResident(db,{wallet:address(i),handle:'player'+i+'.ai',verifiedAi:true},start);
  const finish=(b,at)=>{
   const challenge=createChallenge(db,address(1),address(b),start+at);
   const match=resolveChallenge(db,address(b),challenge.id,'accept',start+at+1,{tokenAddress:token,blockNumber:100n,weights:[10000,20000]}).match;
   db.prepare("UPDATE pvp_matches SET status='finished',finished_at=?,a_damage=100,b_damage=20,winner_wallet=? WHERE id=?").run(start+at+4000,address(1),match.id);
   return match.id;
  };
  const first=finish(2,1000),before=rewardEpochCandidates(db,start,token,60);
  const later=finish(3,61000),after=rewardEpochCandidates(db,start,token,60);
  assert.deepEqual(after,before);assert.deepEqual(after.matches.map(m=>m.id),[first]);
  assert.throws(()=>rewardEpochCandidates(db,start,token,60,start+120000),/invalid_score_cutoff/);
  const next=rewardEpochCandidates(db,start+60000,token,60);
  assert.deepEqual(next.matches.map(m=>m.id),[first,later]);
  assert.equal(scoreApprovedMatches(next,[first,later]).find(r=>r.gameWallet===address(1)).combatPoints,10);
 }finally{db.close();}
});

test('database reward catalogs reject roots belonging to another treasury or chain',async()=>{
 const db=openDatabase(':memory:');initRewardBatches(db);const epoch=Math.floor(Date.now()/60000);
 const pack={manifest:{chainId:56,treasuryAddress:address(100),day:epoch,periodSeconds:60,root:'root',claims:[]}};
 db.prepare("INSERT INTO reward_batches(epoch,status,package_json) VALUES(?,'ready',?)").run(epoch,JSON.stringify(pack));
 try{
  assert.equal((await rewardCatalog({rewardTreasuryAddress:address(100)},db)).length,1);
  await assert.rejects(rewardCatalog({rewardTreasuryAddress:address(101)},db),/catalog_treasury_mismatch/);
  pack.manifest.chainId=97;db.prepare('UPDATE reward_batches SET package_json=?').run(JSON.stringify(pack));
  await assert.rejects(rewardCatalog({rewardTreasuryAddress:address(100)},db),/catalog_chain_mismatch/);
 }finally{db.close();}
});
