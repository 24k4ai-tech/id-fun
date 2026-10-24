import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/db.mjs';
import {startRewardWorker} from '../server/reward-worker.mjs';
const address=n=>'0x'+n.toString(16).padStart(40,'0');

test('RPC failure and process restart resume persisted scans without dropping or duplicating receipts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'idfun-restart-')),path=join(dir,'game.sqlite');
 const config={rewardAutoEnabled:true,rewardPeriodSeconds:60,gameTokenAddress:address(40),rewardTreasuryAddress:address(50),
  rewardPublisherKey:'0x'+'55'.repeat(32),rewardFromBlock:'100'};
 let db=openDatabase(path),stop,fail=true,head=2111n;
 const ranges=[];
 const rpc={getChainId:async()=>56,getBlockNumber:async()=>head,
  getBlock:async({blockNumber})=>({number:blockNumber,timestamp:6000n}),
  getLogs:async({fromBlock,toBlock})=>{
   ranges.push([fromBlock,toBlock]);assert.ok(toBlock-fromBlock<500n);
   if(fail&&fromBlock===600n)throw new Error('rpc_unavailable');
   return [150n,650n].filter(n=>n>=fromBlock&&n<=toBlock).map((n,i)=>({address:address(50),blockNumber:n,logIndex:0,
    transactionHash:'0x'+n.toString(16).padStart(64,'0'),args:{trigger:address(70),amountWei:10n,playerWei:7n,operationsWei:3n}}));
  },sendTransaction:async()=>{throw new Error('worker_must_not_spend');}};
 try{
  stop=startRewardWorker(db,rpc,config);await stop.ready;stop();
  assert.equal(db.prepare('SELECT count(*) n FROM reward_batches').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM reward_scan_cursor').get().n,0);
  db.close();fail=false;db=openDatabase(path);ranges.length=0;
  stop=startRewardWorker(db,rpc,config);await stop.ready;stop();
  assert.equal(ranges[0][0],100n);
  assert.equal(db.prepare('SELECT block FROM reward_scan_cursor').get().block,'2099');
  assert.equal(db.prepare('SELECT count(*) n FROM reward_batches').get().n,1);
  db.close();db=openDatabase(path);ranges.length=0;head=2211n;
  stop=startRewardWorker(db,rpc,config);await stop.ready;stop();
  assert.deepEqual(ranges,[[2100n,2199n]]);
  assert.equal(db.prepare('SELECT count(*) n FROM reward_batches').get().n,1);
 }finally{stop?.();db.close();rmSync(dir,{recursive:true,force:true});}
});
