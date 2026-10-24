import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { createChallenge, resolveChallenge, pvpState, pvpCommand, settlePvpMatches } from '../server/pvp.mjs';
import { rewardEpochCandidates } from '../server/reward-candidates.mjs';
import { buildRewardDraft } from '../server/reward-draft.mjs';
import { resolveAgentId } from '../server/agent-id.mjs';
import { initRewardBatches, startRewardWorker } from '../server/reward-worker.mjs';
import { bindRewardLedger, validateWorkerManifest } from '../server/reward-ledger.mjs';
import { buildClaimManifest } from '../server/reward-merkle.mjs';
import { verifyRewardSignature } from '../server/reward-signature.mjs';

const DAY=86400000, start=2*DAY, BNB=10n**18n;
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const wallets=[1,2,3,4].map(n=>privateKeyToAccount('0x'+String(n).repeat(64)).address);
function fixture(){
 const db=openDatabase(':memory:');
 wallets.forEach((wallet,i)=>createResident(db,{wallet,handle:`audit${i}.ai`,verifiedAi:true},start));
 return db;
}
function match(db,a=0,b=1,at=start+1000){
 const invite=createChallenge(db,wallets[a],`audit${b}.ai`,at);
 return resolveChallenge(db,wallets[b],invite.id,'accept',at+1,
  {tokenAddress:address(40),blockNumber:100n,weights:[10000,10000]}).match;
}
function finished(db,a,b,at=start+1000){
 const m=match(db,a,b,at);
 db.prepare("UPDATE pvp_matches SET status='finished',finished_at=?,a_damage=100,b_damage=20,winner_wallet=? WHERE id=?")
  .run(at+4000,wallets[a],m.id);
 return m;
}
const draft=(db,resolveName)=>buildRewardDraft({db,dayStart:start,periodSeconds:60,tokenAddress:address(40),
 receivedWei:5n*BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n,operatingWallet:address(999),resolveName});

test('audit: real checksummed wallet winners retain their financial score',()=>{
 const db=fixture();try{
  const m=finished(db,0,1);const c=rewardEpochCandidates(db,start,address(40),60);
  assert.deepEqual(c.matches.map(r=>r.id),[m.id]);
  assert.equal(c.matches[0].winnerWallet,wallets[0].toLowerCase());
 }finally{db.close();}
});
test('audit: lowercase wallet address can invite an existing checksummed wallet',()=>{
 const db=fixture();try{assert.equal(createChallenge(db,wallets[0],wallets[1].toLowerCase(),start).targetWallet,wallets[1]);}finally{db.close();}
});
test('audit: disconnected timeout is timestamped at expiry, never the next login',()=>{
 const db=fixture();try{
  const m=match(db,0,1,start+DAY-180000);
  db.prepare('UPDATE pvp_matches SET a_damage=20,b_damage=20,a_hp=80,b_hp=60 WHERE id=?').run(m.id);
  pvpState(db,wallets[0],start+DAY+300000);
  assert.equal(db.prepare('SELECT finished_at FROM pvp_matches WHERE id=?').get(m.id).finished_at,m.expiresAt);
 }finally{db.close();}
});
test('audit: delayed polling records knockout at impact, including a minute boundary',()=>{
 const db=fixture();try{
  const m=match(db);db.prepare('UPDATE pvp_matches SET b_hp=1,b_damage=20 WHERE id=?').run(m.id);
  const cast=pvpCommand(db,wallets[0],'spell',{},start+59000);
  pvpState(db,wallets[0],start+65000);
  assert.equal(db.prepare('SELECT finished_at FROM pvp_matches WHERE id=?').get(m.id).finished_at,cast.playerCast.impactAt);
 }finally{db.close();}
});
test('audit: a missing ID excludes only its owner; an upstream failure holds the whole batch',async()=>{
 const db=fixture();try{
  finished(db,0,1);finished(db,2,3);
  // Isolate name-resolution handling from the separate checksum regression.
  db.exec('UPDATE pvp_matches SET winner_wallet=lower(winner_wallet)');
  const resolve=async id=>{if(id==='audit0.ai')throw new Error('agent_id_not_found');return wallets[Number(id[5])];};
  const result=await draft(db,resolve);
  assert.equal(result.payouts.length,3);assert.equal(result.excluded[0].reason,'agent_id_unverified');
  await assert.rejects(draft(db,async()=>{throw new Error('agent_id_resolver_unavailable');}),/agent_id_resolver_unavailable/);
 }finally{db.close();}
});
test('audit: transferred ID does not block unrelated players or pay its old wallet',async()=>{
 const db=fixture();try{
  finished(db,0,1);const second=finished(db,2,3);
  db.prepare('UPDATE pvp_matches SET a_agent_id=? WHERE id=?').run('audit0.ai',second.id);
  db.exec('UPDATE pvp_matches SET winner_wallet=lower(winner_wallet)');
  const result=await draft(db,async id=>id==='audit0.ai'?wallets[2]:wallets[Number(id[5])]);
  assert.equal(result.payouts.length,3);
  assert.ok(!result.payouts.some(r=>r.wallet===wallets[0].toLowerCase()));
  assert.equal(result.excluded[0].reason,'agent_id_moved');
 }finally{db.close();}
});
test('audit: SPACE ID error code -1 is an outage, not a missing name',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({code:-1,msg:'upstream error'})});
 await assert.rejects(resolveAgentId('audit.ai',fetcher),/agent_id_resolver_unavailable/);
 await assert.rejects(resolveAgentId('audit.ai',async()=>({ok:true,json:async()=>({code:1})})),/agent_id_not_found/);
 await assert.rejects(resolveAgentId('audit.ai',async()=>({ok:true,json:async()=>({code:0,address:address(0)})})),/agent_id_not_found/);
});

test('audit: offline matches settle once without any player state request before allocation',async()=>{
 const db=fixture();try{
  const m=match(db,0,1,start+DAY-180000);
  db.prepare('UPDATE pvp_matches SET a_damage=20,b_damage=20,a_hp=80,b_hp=60 WHERE id=?').run(m.id);
  const cutoff=start+DAY-60000;
  const c=rewardEpochCandidates(db,cutoff,address(40),60);
  assert.equal(c.matches.length,1);
  assert.equal(c.matches[0].finishedAt,m.expiresAt);
  settlePvpMatches(db,start+DAY+60000);
  assert.equal(db.prepare('SELECT sum(points) AS n FROM pvp_scores WHERE wallet=?').get(wallets[0]).n,5);
 }finally{db.close();}
});
test('audit: reward ledger rejects a changed token, vault, deployment block or unbound legacy data',()=>{
 const db=fixture();initRewardBatches(db);
 const config={gameTokenAddress:address(40),rewardTreasuryAddress:address(50),rewardFromBlock:'100',rewardPeriodSeconds:60};
 try{
  bindRewardLedger(db,config);bindRewardLedger(db,config);
  for(const changed of [{gameTokenAddress:address(41)},{rewardTreasuryAddress:address(51)},{rewardFromBlock:'101'}])
   assert.throws(()=>bindRewardLedger(db,{...config,...changed}),/reward_ledger_domain_mismatch/);
 }finally{db.close();}
 const legacy=fixture();initRewardBatches(legacy);
 try{
  legacy.prepare('INSERT INTO reward_scan_cursor VALUES(1,?)').run('123');
  assert.throws(()=>bindRewardLedger(legacy,config),/reward_ledger_migration_required/);
  assert.equal(legacy.prepare('SELECT block FROM reward_scan_cursor').get().block,'123');
 }finally{legacy.close();}
});
test('audit: persisted worker roots must match the epoch and treasury before signing',async()=>{
 const db=fixture();try{
  finished(db,0,1);
  const d=await draft(db,async name=>wallets[Number(name[5])]);
  const manifest=buildClaimManifest(d,{treasuryAddress:address(50)}),config={rewardTreasuryAddress:address(50)};
  validateWorkerManifest(manifest,start/60000,config);
  for(const changed of [{day:manifest.day+1},{treasuryAddress:address(51)},{chainId:97},{periodSeconds:1800}])
   assert.throws(()=>validateWorkerManifest({...manifest,...changed},start/60000,config),/reward_manifest_domain_mismatch/);
 }finally{db.close();}
});

test('audit: automatic worker scans 5 BNB, settles offline combat and signs one immutable capped batch',async()=>{
 const db=fixture(),at=Math.floor((Date.now()-180000)/60000)*60000,epoch=at/60000;
 const m=match(db,0,1,at-121000);
 db.prepare('UPDATE pvp_matches SET expires_at=?,a_damage=20,b_damage=20,a_hp=80,b_hp=60 WHERE id=?').run(at+5000,m.id);
 const signer=privateKeyToAccount('0x'+'55'.repeat(32));
 const config={rewardAutoEnabled:true,rewardPeriodSeconds:60,gameTokenAddress:address(40),rewardTreasuryAddress:address(50),
  rewardPublisherKey:'0x'+'55'.repeat(32),rewardFromBlock:'99',agentIdFetcher:async url=>({ok:true,json:async()=>({code:0,
   address:wallets[Number(new URL(url).searchParams.get('domain')[5])]})})};
 let sends=0;
 const rpc={getChainId:async()=>56,getBlockNumber:async()=>200n,getBytecode:async()=>'0x6000',getBalance:async()=>5n*BNB,
  getBlock:async({blockNumber})=>({number:blockNumber,timestamp:BigInt(at/1000)+blockNumber-100n}),
  getLogs:async({fromBlock,toBlock})=>fromBlock<=100n&&toBlock>=100n?[{address:address(50),blockNumber:100n,logIndex:0,transactionHash:'0x'+'aa'.repeat(32),
   args:{trigger:address(70),amountWei:5n*BNB,playerWei:35n*BNB/10n,operationsWei:15n*BNB/10n}}]:[],
  readContract:async input=>({accountedWei:5n*BNB,operationsWei:15n*BNB/10n,EPOCH_SECONDS:60n,publisher:signer.address,operations:address(999),rewardAccountingEnabled:true,
   playerWithdrawalRenounced:false,unallocatedPlayerWei:35n*BNB/10n,unallocatedByDayWei:35n*BNB/10n,playerLiabilityWei:35n*BNB/10n,
   epochs:['0x'+'0'.repeat(64),0n,0n,0n],tryGetVault:[false,{}],taxProcessor:address(61),marketAddress:address(50),getQuoteToken:address(0),rewardAsset:address(0)})[input.functionName],
  sendTransaction:async()=>{sends++;throw new Error('worker_must_not_spend');}};
 let stop;
 try{
  stop=startRewardWorker(db,rpc,config);await stop.ready;
  const row=db.prepare('SELECT * FROM reward_batches WHERE epoch=?').get(epoch);assert.equal(row.status,'ready');
  const pack=JSON.parse(row.package_json);assert.equal(pack.manifest.claims.length,2);
  assert.ok(pack.manifest.claims.every(r=>BigInt(r.amountWei)===175n*BNB/1000n));
  assert.ok(await verifyRewardSignature(pack.manifest,pack.signature,signer.address));
  assert.equal(db.prepare('SELECT finished_at FROM pvp_matches WHERE id=?').get(m.id).finished_at,at+5000);
  await stop.tick();assert.equal(db.prepare('SELECT package_json FROM reward_batches WHERE epoch=?').get(epoch).package_json,row.package_json);
  assert.equal(sends,0);
 }finally{stop?.();db.close();}
});

test('audit: later identity changes cannot erase a prior opponent\'s valid match',()=>{
 const db=fixture();try{
  const first=finished(db,0,1),next=finished(db,0,2,start+20000);
  db.prepare('UPDATE pvp_matches SET a_agent_id=? WHERE id=?').run('changed.ai',next.id);
  const candidates=rewardEpochCandidates(db,start,address(40),60);
  assert.deepEqual(candidates.matches.map(m=>m.id),[first.id]);
  assert.deepEqual(candidates.rejected,[{id:next.id,reason:'identity_changed_during_day'}]);
 }finally{db.close();}
});
