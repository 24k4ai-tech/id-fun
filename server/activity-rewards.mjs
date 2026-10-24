import {isAddress} from 'viem';
import {changeEnergy,ENERGY_COST} from './energy.mjs';
import {holderWeightBps} from './token-holder.mjs';
import {rewardCandidates,rewardDayStart} from './reward-candidates.mjs';

const ABI=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{type:'address'}],outputs:[{type:'uint256'}]},
 {type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]}];
export async function activityEligibility(db,client,token,wallets){
  if(!client||!isAddress(token)||await client.getChainId()!==56)throw new Error('activity_not_live');
  const block=await client.getBlockNumber();
  const decimals=await client.readContract({address:token,abi:ABI,functionName:'decimals',blockNumber:block});
  return Promise.all(wallets.map(async wallet=>{
    const p=db.prepare('SELECT handle,verified_ai,is_demo FROM residents WHERE wallet=?').get(wallet);
    if(!p?.verified_ai||p.is_demo||!isAddress(wallet))throw new Error('activity_identity_required');
    const balance=await client.readContract({address:token,abi:ABI,functionName:'balanceOf',args:[wallet],blockNumber:block});
    const weight=holderWeightBps(balance,decimals);if(!weight)throw new Error('activity_token_required');
    return {wallet,agentId:p.handle.toLowerCase(),token,block:String(block),weight};
  }));
}
// Caller owns the SQLite transaction. Paid participation never changes existing claims.
export function reserveActivity(db,id,mode,entry,now=Date.now(),opponents=[]){
  if(!ENERGY_COST[mode])throw new Error('activity_invalid');
  const wallet=entry.wallet.toLowerCase();
  if(db.prepare("SELECT 1 FROM activity_tickets WHERE wallet=? AND status='reserved'").get(wallet))throw new Error('activity_busy');
  const day=rewardDayStart(now),matches=rewardCandidates(db,day,entry.token,day+86400000,false).matches;
  const mine=matches.filter(m=>m.players?m.players.some(p=>p.wallet===wallet):m.a.wallet===wallet||m.b.wallet===wallet);
  const identities=mine.flatMap(m=>m.players||[m.a,m.b]).filter(p=>p.wallet===wallet).map(p=>p.agentId);
  if(identities.some(id=>id!==entry.agentId))throw new Error('activity_identity_required');
  if(mine.length>=12||mode==='city'&&mine.filter(m=>m.source==='city').length>=3)throw new Error('activity_daily_limit');
  for(const other of opponents){const rival=other.toLowerCase();
    if(mine.filter(m=>m.players?m.players.some(p=>p.wallet===wallet&&p.opponents.includes(rival)):[m.a.wallet,m.b.wallet].includes(rival)).length>=3)throw new Error('activity_pair_limit');
  }
  changeEnergy(db,wallet,-ENERGY_COST[mode],'reserve:'+id,now);
  db.prepare('INSERT INTO activity_tickets(id,wallet,agent_id,mode,token_address,token_block,weight,energy,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,wallet,entry.agentId,mode,entry.token,entry.block,entry.weight,ENERGY_COST[mode],now);
}
export function finishActivity(db,id,sourceId,points,opponents,now=Date.now()){
  const t=db.prepare('SELECT * FROM activity_tickets WHERE id=?').get(id);if(!t||t.status!=='reserved')return false;
  if(!Number.isFinite(points)||Math.abs(points*100-Math.round(points*100))>1e-8||points<0||points>30)throw new Error('activity_invalid');
  db.prepare("UPDATE activity_tickets SET status='finished' WHERE id=?").run(id);
  if(points)db.prepare('INSERT OR IGNORE INTO activity_rewards(source,source_id,wallet,agent_id,token_address,token_block,weight,points,opponents,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(t.mode,String(sourceId),t.wallet,t.agent_id,t.token_address,t.token_block,t.weight,points,JSON.stringify(opponents.map(w=>w.toLowerCase())),now);
  if(points){const day=rewardDayStart(now),accepted=rewardCandidates(db,day,t.token_address,day+86400000,false).matches;
    const included=accepted.some(m=>m.sourceId===String(sourceId)&&m.source===t.mode&&m.players?.some(p=>p.wallet===t.wallet&&p.agentId===t.agent_id));
    // Completion can cross UTC midnight. If shared scoring caps reject this
    // otherwise completed activity, return its participation energy exactly once.
    if(!included){db.prepare("UPDATE activity_tickets SET status='refunded' WHERE id=?").run(id);changeEnergy(db,t.wallet,t.energy,'score-refund:'+id,now);return false;}
  }
  return true;
}
export function cancelActivity(db,id,systemFailure=false,now=Date.now()){
  const t=db.prepare('SELECT * FROM activity_tickets WHERE id=?').get(id);if(!t||t.status!=='reserved')return;
  db.prepare("UPDATE activity_tickets SET status=? WHERE id=?").run(systemFailure?'refunded':'abandoned',id);
  if(systemFailure)changeEnergy(db,t.wallet,t.energy,'refund:'+id,now);
}
