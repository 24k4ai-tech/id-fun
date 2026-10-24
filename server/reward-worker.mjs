import {privateKeyToAccount} from 'viem/accounts';
import {scanConfirmedRevenue} from './vault-revenue.mjs';
import {findRewardDayBlocks} from './reward-blocks.mjs';
import {buildReviewedRewardPackage} from './reward-review.mjs';
import {signRewardManifest} from './reward-signature.mjs';
import {transaction} from './db.mjs';
import {bindRewardLedger,validateWorkerManifest} from './reward-ledger.mjs';
export function initRewardBatches(db){db.exec(`CREATE TABLE IF NOT EXISTS reward_batches(
 epoch INTEGER PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',package_json TEXT,updated_at INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reward_scan_cursor(id INTEGER PRIMARY KEY CHECK(id=1),block TEXT NOT NULL);`);}
const wire=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
// RPC errors may embed authenticated URLs; only expose our short error codes.
const safeError=error=>/^[a-z][a-z0-9_]{0,79}$/.test(error?.message||'')?error.message:'upstream_unavailable';
// One immutable unsigned package is committed before signing. Concurrent workers
// and restarts can only sign that same root. No transaction or gas is sent here.
export function freezeRewardBatch(db,epoch,review,now=Date.now()){
 const pack={status:'prepared_only',manifest:review.manifest,scoreCutoff:review.draft.scoreCutoff,scoreEvidence:review.draft.scoreEvidence};
 db.prepare("UPDATE reward_batches SET status='frozen',package_json=?,updated_at=? WHERE epoch=? AND status='pending'").run(wire(pack),now,epoch);
 return JSON.parse(db.prepare('SELECT package_json FROM reward_batches WHERE epoch=?').get(epoch).package_json);
}
export function startRewardWorker(db,client,config){
 initRewardBatches(db);let busy=false,stopped=false;
 if(!config.rewardAutoEnabled)return ()=>{};
 if(!client||!config.gameTokenAddress||!config.rewardTreasuryAddress||config.rewardPeriodSeconds!==60||
  !/^0x[a-fA-F0-9]{64}$/.test(config.rewardPublisherKey||'')||!/^\d+$/.test(config.rewardFromBlock||''))throw new Error('reward_auto_configuration_incomplete');
 const account=privateKeyToAccount(config.rewardPublisherKey);
 bindRewardLedger(db,config);
 async function tick(){if(stopped||busy)return;busy=true;
  try{
   if(await client.getChainId()!==56)throw new Error('wrong_chain');
   const head=await client.getBlockNumber();if(head<12n)return;
   const confirmed=head-12n,stored=db.prepare('SELECT block FROM reward_scan_cursor WHERE id=1').get();
   const from=stored?BigInt(stored.block)+1n:BigInt(config.rewardFromBlock);
   if(from<=confirmed){const to=from+1999n<confirmed?from+1999n:confirmed;
    const scan=await scanConfirmedRevenue(client,{vaultAddress:config.rewardTreasuryAddress,fromBlock:from,toBlock:to});
    transaction(db,()=>{for(const row of scan.receipts)if(row.playerWei>0n)db.prepare('INSERT OR IGNORE INTO reward_batches(epoch) VALUES(?)').run(Math.floor(row.blockTimestampMs/60000));
     db.prepare('INSERT INTO reward_scan_cursor(id,block) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET block=excluded.block').run(String(to));});
   }
   const stamp=Number((await client.getBlock({blockNumber:confirmed})).timestamp)*1000;
   const pending=db.prepare("SELECT * FROM reward_batches WHERE status IN ('pending','frozen') AND epoch*60000+60000<=? ORDER BY updated_at,epoch LIMIT 4").all(stamp);
   for(const row of pending){
    if(stopped)break;
    if((row.epoch+1)*60000+172800000<=stamp){db.prepare("UPDATE reward_batches SET status='expired',updated_at=? WHERE epoch=?").run(Date.now(),row.epoch);continue;}
    try{
     let pack=row.package_json?JSON.parse(row.package_json):null;
     if(!pack){const dayStart=row.epoch*60000,bounds=await findRewardDayBlocks(client,dayStart,60);
      const review=await buildReviewedRewardPackage({client,db,dayStart,...bounds,periodSeconds:60,scoreCutoff:dayStart+60000,
       tokenAddress:config.gameTokenAddress,vaultAddress:config.rewardTreasuryAddress,fetcher:config.agentIdFetcher});
      if(!review.manifest){db.prepare('UPDATE reward_batches SET updated_at=? WHERE epoch=?').run(Date.now(),row.epoch);continue;}
      pack=freezeRewardBatch(db,row.epoch,review);
     }
     validateWorkerManifest(pack.manifest,row.epoch,config);
     const publisher=await client.readContract({address:config.rewardTreasuryAddress,abi:[{type:'function',name:'publisher',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}],functionName:'publisher'});
     if(publisher.toLowerCase()!==account.address.toLowerCase())throw new Error('wrong_reward_publisher');
     const signature=await signRewardManifest(account,pack.manifest);
     db.prepare("UPDATE reward_batches SET status='ready',package_json=?,updated_at=? WHERE epoch=? AND status='frozen'").run(wire({...pack,signature}),Date.now(),row.epoch);
    }catch(error){db.prepare('UPDATE reward_batches SET updated_at=? WHERE epoch=?').run(Date.now(),row.epoch);console.error('Reward batch deferred:',row.epoch,safeError(error));}
   }
  }catch(error){console.error('Reward sync deferred:',safeError(error));}finally{busy=false;}
 }
 const timer=setInterval(tick,15000);timer.unref();const ready=tick();const stop=()=>{stopped=true;clearInterval(timer);};stop.tick=tick;stop.ready=ready;return stop;
}
