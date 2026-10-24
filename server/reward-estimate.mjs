import {isAddress} from 'viem';
import {rewardEpochCandidates,scoreApprovedMatches} from './reward-candidates.mjs';
import {periodStart,assertRewardPeriod} from './reward-period.mjs';
import {resolveAgentId} from './agent-id.mjs';
import {simulateTaxPayout} from '../simulations/tax-payout.mjs';
import {resolveRewardIdentities} from './reward-identities.mjs';
import {readRewardAsset,readAssetBalance} from './reward-asset.mjs';
const ABI=[...['operationsWei','playerLiabilityWei','unallocatedPlayerWei','accountedWei'].map(name=>({type:'function',name,stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]})),
 {type:'function',name:'operations',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
 {type:'function',name:'unallocatedByDayWei',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'uint256'}]},
 {type:'function',name:'rewardAccountingEnabled',stateMutability:'view',inputs:[],outputs:[{type:'bool'}]}];
export async function readRewardBalance(client,treasuryAddress,periodSeconds=60){
 if(!isAddress(treasuryAddress)||await client.getChainId()!==56)throw new Error('invalid_treasury');
 await assertRewardPeriod(client,treasuryAddress,periodSeconds);
 const block=await client.getBlock({blockTag:'latest'}),blockNumber=block.number;
 if(typeof blockNumber!=='bigint'||Math.abs(Date.now()-Number(block.timestamp)*1000)>120000)throw new Error('stale_reward_block');
 const start=periodStart(Number(block.timestamp)*1000,periodSeconds),epoch=BigInt(start/(periodSeconds*1000));
 const read=(functionName,args=[])=>client.readContract({address:treasuryAddress,abi:ABI,functionName,args,blockNumber});
 const rewardAsset=await readRewardAsset(client,treasuryAddress,blockNumber);
 const [balance,ops,liability,unallocated,pool,accounted,enabled,operations]=await Promise.all([
  readAssetBalance(client,treasuryAddress,rewardAsset,blockNumber),read('operationsWei'),read('playerLiabilityWei'),read('unallocatedPlayerWei'),
  read('unallocatedByDayWei',[epoch]),read('accountedWei'),read('rewardAccountingEnabled'),read('operations')]);
 if(![balance,ops,liability,unallocated,pool,accounted].every(v=>typeof v==='bigint'&&v>=0n)||ops+liability!==accounted||balance<accounted||unallocated>liability||pool>unallocated)throw new Error('invalid_treasury_state');
 return {status:enabled?'ready':'test_phase',treasuryAddress,periodSeconds,epoch:Number(epoch),periodStart:start,periodEnd:start+periodSeconds*1000,
  balanceWei:String(balance),operationsWei:String(ops),playerLiabilityWei:String(liability),unallocatedWei:String(unallocated),
  currentPoolWei:String(enabled?pool:0n),reservedWei:String(liability-unallocated),unrecognizedWei:String(balance-accounted),
  operations,rewardAsset,blockNumber:String(blockNumber),checkedAt:Date.now()};
}
export async function estimateRewards({db,snapshot,tokenAddress,resolveName=async id=>(await resolveAgentId(id)).address}){
 const candidates=rewardEpochCandidates(db,snapshot.periodStart,tokenAddress,snapshot.periodSeconds),scores=scoreApprovedMatches(candidates,candidates.matches.map(m=>m.id));
 const agents=await resolveRewardIdentities(scores,snapshot.operations,resolveName);
 const pool=BigInt(snapshot.currentPoolWei),allocation=simulateTaxPayout({receivedWei:pool,actualPlayerWei:pool,actualOperationsWei:0n,
  operatingWallet:snapshot.operations,agents,minEligibleAgents:2,maxWalletShareBps:snapshot.periodSeconds===60?500:10000});
 const total=agents.filter(a=>a.resolvedWallet?.toLowerCase()===a.gameWallet.toLowerCase()).reduce((n,a)=>n+a.points,0);
 return {...snapshot,totalWeightedPoints:total/10000,eligibleIds:agents.length-allocation.excluded.length,maxWalletShareBps:500,heldPlayerWei:String(allocation.heldPlayerWei),holdReason:allocation.holdReason||null,
  rows:agents.map(a=>({agentId:a.agentId,wallet:a.gameWallet,combatPoints:a.combatPoints,weightedPoints:a.points/10000,
   multiplier:a.combatPoints?a.points/a.combatPoints/10000:1,shareBps:total&&a.resolvedWallet?.toLowerCase()===a.gameWallet.toLowerCase()?Math.floor(a.points/total*10000):0,
   estimatedWei:String(allocation.payouts.find(p=>p.wallet===a.gameWallet)?.amountWei||0n),
   reason:allocation.excluded.find(p=>p.wallet===a.gameWallet)?.reason||null}))};
}
export function createRewardEstimator({db,client,config}){let balance=null,inflight=null;const names=new Map();
 return async()=>{
  if(!client||!config.rewardTreasuryAddress||!config.gameTokenAddress)return {status:'not_live',periodSeconds:60,rows:[],checkedAt:Date.now()};
  const seconds=config.rewardPeriodSeconds??60;
  try{
   if(!balance||Date.now()-balance.checkedAt>15000||Date.now()>=balance.periodEnd){
    if(!inflight)inflight=readRewardBalance(client,config.rewardTreasuryAddress,seconds).then(s=>balance=s).finally(()=>inflight=null);await inflight;
   }
   return await estimateRewards({db,snapshot:balance,tokenAddress:config.gameTokenAddress,resolveName:async id=>{
    const cached=names.get(id);if(cached&&Date.now()-cached.at<30000)return cached.address;
    let address=null;try{address=(await resolveAgentId(id)).address;}catch(e){if(e.message!=='agent_id_not_found')throw e;}
    names.set(id,{address,at:Date.now()});return address;
   }});
  }catch{return {status:'unavailable',periodSeconds:seconds,rows:[],checkedAt:balance?.checkedAt||null};}
 };
}
