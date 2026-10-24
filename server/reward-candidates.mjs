import {playScoreBps,scaledPoints} from './play-score.mjs';
import { isHolderWeightBps } from './token-holder.mjs';
import { settlePvpMatches } from './pvp.mjs';

const DAY_MS = 86_400_000;
const PAIR_LIMIT = 3;
const WALLET_LIMIT = 12;

export function rewardDayStart(now = Date.now()) {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

// Mechanical policy only. Historic rows without Agent IDs captured at match
// start stay ineligible. It cannot prove separate humans control two wallets.
export function rewardCandidates(db, dayStart, tokenAddress = null, cutoff = dayStart + DAY_MS, settle = true) {
  if (!Number.isSafeInteger(dayStart) || dayStart < 0 || dayStart % DAY_MS) throw new Error('invalid_reward_day');
  if(settle)settlePvpMatches(db);
  const rows = db.prepare(`SELECT id,a_wallet,b_wallet,a_agent_id,b_agent_id,token_address,token_check_block,
      a_holder_weight_bps,b_holder_weight_bps,a_damage,b_damage,
      winner_wallet,started_at,finished_at FROM pvp_matches
      WHERE status='finished' AND finished_at>=? AND finished_at<?
      ORDER BY finished_at,id`).all(dayStart, Math.min(dayStart+DAY_MS,cutoff));
  const rejected = [], possible = [];
  for (const row of rows) {
    const a = row.a_wallet.toLowerCase(), b = row.b_wallet.toLowerCase();
    const idA = row.a_agent_id?.toLowerCase(), idB = row.b_agent_id?.toLowerCase();
    const winner = row.winner_wallet?.toLowerCase() || null;
    let reason = null;
    if (a === b) reason = 'self_match';
    else if (!idA || !idB) reason = 'agent_id_missing_at_start';
    else if (idA === idB) reason = 'same_agent_id';
    // Earlier stored match weights keep their original payout terms.
    else if (!(isHolderWeightBps(row.a_holder_weight_bps) || [10_500, 11_000].includes(row.a_holder_weight_bps)) ||
        !(isHolderWeightBps(row.b_holder_weight_bps) || [10_500, 11_000].includes(row.b_holder_weight_bps)) ||
        !row.a_holder_weight_bps || !row.b_holder_weight_bps ||
        !row.token_check_block || !row.token_address)
      reason = 'token_not_held_at_entry';
    else if (tokenAddress && row.token_address?.toLowerCase() !== tokenAddress.toLowerCase())
      reason = 'wrong_reward_token';
    else if (row.a_damage < 10 || row.b_damage < 10) reason = 'insufficient_combat';
    else if (winner && winner !== a && winner !== b) reason = 'invalid_winner';
    if (reason) rejected.push({ id: row.id, reason });
    else possible.push({ ...row, a_wallet: a, b_wallet: b, a_agent_id: idA, b_agent_id: idB, winner_wallet: winner });
  }

  const groups=new Map();
  for(const r of db.prepare('SELECT * FROM activity_rewards WHERE finished_at>=? AND finished_at<? ORDER BY finished_at,id').all(dayStart,Math.min(dayStart+DAY_MS,cutoff))){
    if(!r.agent_id||!r.token_block||!isHolderWeightBps(r.weight)||!r.weight||r.points<=0||r.points>30||
      tokenAddress&&r.token_address.toLowerCase()!==tokenAddress.toLowerCase())continue;
    const key=r.source+':'+r.source_id;
    if(!groups.has(key))groups.set(key,{id:'activity:'+r.id,finished_at:r.finished_at,players:[],source:r.source,sourceId:r.source_id,token_address:r.token_address});
    groups.get(key).players.push({wallet:r.wallet.toLowerCase(),agentId:r.agent_id.toLowerCase(),holderWeightBps:r.weight,points:r.points,opponents:JSON.parse(r.opponents)});
  }
  possible.push(...groups.values());possible.sort((a,b)=>a.finished_at-b.finished_at||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  const identities=row=>row.players?row.players.map(p=>[p.wallet,p.agentId]):[[row.a_wallet,row.a_agent_id],[row.b_wallet,row.b_agent_id]];
  const firstIdByWallet = new Map();
  for (const row of possible) for (const [wallet, id] of identities(row)) {
    if (!firstIdByWallet.has(wallet)) firstIdByWallet.set(wallet, id);
  }
  const pairCounts = new Map(), walletCounts = new Map(),cityCounts=new Map(), matches = [];
  for (const row of possible) {
    if(row.players){
      const pairs=new Set(),accepted=[];
      for(const p of row.players){
        const keys=p.opponents.map(o=>[p.wallet,o.toLowerCase()].sort().join(':'));
        const reason=firstIdByWallet.get(p.wallet)!==p.agentId?'identity_changed_during_day':
          (walletCounts.get(p.wallet)||0)>=WALLET_LIMIT?'wallet_daily_limit':
          row.source==='city'&&(cityCounts.get(p.wallet)||0)>=3?'city_daily_limit':keys.some(k=>(pairCounts.get(k)||0)>=PAIR_LIMIT)?'pair_daily_limit':null;
        if(reason){rejected.push({id:row.id,wallet:p.wallet,reason});continue;}
        accepted.push(p);walletCounts.set(p.wallet,(walletCounts.get(p.wallet)||0)+1);keys.forEach(k=>pairs.add(k));
        if(row.source==='city')cityCounts.set(p.wallet,(cityCounts.get(p.wallet)||0)+1);
      }
      for(const k of pairs)pairCounts.set(k,(pairCounts.get(k)||0)+1);
      if(accepted.length)matches.push({id:row.id,finishedAt:row.finished_at,players:accepted,tokenAddress:row.token_address,source:row.source,sourceId:row.sourceId});
      continue;
    }
    const pair = [row.a_wallet, row.b_wallet].sort().join(':');
    let reason = null;
    // Later identity changes must not erase an earlier opponent's earned points.
    if (firstIdByWallet.get(row.a_wallet) !== row.a_agent_id || firstIdByWallet.get(row.b_wallet) !== row.b_agent_id) reason = 'identity_changed_during_day';
    else if ((pairCounts.get(pair) || 0) >= PAIR_LIMIT) reason = 'pair_daily_limit';
    else if ((walletCounts.get(row.a_wallet) || 0) >= WALLET_LIMIT || (walletCounts.get(row.b_wallet) || 0) >= WALLET_LIMIT) reason = 'wallet_daily_limit';
    if (reason) { rejected.push({ id: row.id, reason }); continue; }
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    walletCounts.set(row.a_wallet, (walletCounts.get(row.a_wallet) || 0) + 1);
    walletCounts.set(row.b_wallet, (walletCounts.get(row.b_wallet) || 0) + 1);
    matches.push({
      id: row.id, finishedAt: row.finished_at,
      a: { wallet: row.a_wallet, agentId: row.a_agent_id, scoreBps:playScoreBps(db,'pvp:'+row.id,row.a_wallet),damage: row.a_damage, holderWeightBps: row.a_holder_weight_bps },
      b: { wallet: row.b_wallet, agentId: row.b_agent_id, scoreBps:playScoreBps(db,'pvp:'+row.id,row.b_wallet),damage: row.b_damage, holderWeightBps: row.b_holder_weight_bps },
      tokenAddress: row.token_address, tokenCheckBlock: row.token_check_block,
      winnerWallet: row.winner_wallet,
    });
  }
  return { dayStart, dayEnd: dayStart + DAY_MS, matches, rejected };
}

export function rewardEpochCandidates(db,start,tokenAddress,periodSeconds=86400,scoreCutoff=null){
  if(![60,1800,86400].includes(periodSeconds)||!Number.isSafeInteger(start)||start<0||start%(periodSeconds*1000))throw new Error('invalid_reward_day');
  const end=start+periodSeconds*1000;
  if(periodSeconds===60){const cutoff=scoreCutoff??end;
    // Processing latency must never let later players dilute an earlier receipt.
    if(!Number.isSafeInteger(cutoff)||cutoff!==end)throw new Error('invalid_score_cutoff');
    const daily=rewardCandidates(db,rewardDayStart(cutoff-1),tokenAddress,cutoff);
    return {...daily,dayStart:start,dayEnd:end,scoreCutoff:cutoff};
  }
  // Daily anti-farming caps include earlier epochs, while each match pays once.
  const daily=rewardCandidates(db,rewardDayStart(start),tokenAddress,end);
  return {...daily,dayStart:start,dayEnd:end,matches:daily.matches.filter(m=>m.finishedAt>=start)};
}

// The caller supplies the mechanically selected IDs or a subset for a dry run.
export function scoreApprovedMatches(candidates, approvedIds) {
  if (!Array.isArray(approvedIds)) throw new Error('review_required');
  const known = new Map(candidates.matches.map(match => [match.id, match]));
  const unique = new Set();
  for (const id of approvedIds) {
    if (!(Number.isSafeInteger(id)||typeof id==='string'&&/^activity:\d+$/.test(id)) || !known.has(id) || unique.has(id)) throw new Error('invalid_reviewed_match');
    unique.add(id);
  }
  const agents = new Map();
  for (const id of [...unique].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}))) {
    const match = known.get(id);
    for (const player of match.players||[match.a, match.b]) {
      const won = match.winnerWallet === player.wallet;
      const combatPoints = match.players?player.points:scaledPoints(match.winnerWallet === null ? 3 : won ? 10 : 2,player.scoreBps??10000);
      const points = Math.floor(Math.round(combatPoints*100)*player.holderWeightBps/100);
      const existing = agents.get(player.wallet) || { agentId: player.agentId, gameWallet: player.wallet, points: 0, combatPoints: 0, matchIds: [] };
      if (existing.agentId !== player.agentId) throw new Error('identity_changed_during_day');
      existing.points += points;
      existing.combatPoints += combatPoints;
      existing.matchIds.push(id);
      agents.set(player.wallet, existing);
    }
  }
  return [...agents.values()].sort((a, b) => a.gameWallet.localeCompare(b.gameWallet));
}
