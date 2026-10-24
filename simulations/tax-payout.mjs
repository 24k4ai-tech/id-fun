// Player allocation only: pool amounts must come from verified external vault receipts.
import { isAddress } from 'viem';

const AGENT_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ai$/;
const BPS = 10_000n;
const ZERO = /^0x0{40}$/;

function walletOf(value, field) {
  if (!isAddress(value) || ZERO.test(value.toLowerCase())) throw new Error(`invalid_${field}`);
  return value.toLowerCase();
}

// Offline accounting only. `resolvedWallet` must come from an independent
// Agent ID check at the snapshot cutoff; this module does not query the chain.
export function simulateTaxPayout({ receivedWei, operatingWallet, agents, minEligibleAgents = 1,
  actualPlayerWei = null, actualOperationsWei = null,maxWalletShareBps=10000 }) {
  if (typeof receivedWei !== 'bigint' || receivedWei < 0n) throw new Error('invalid_received_wei');
  if (!Array.isArray(agents)) throw new Error('invalid_agents');
  if (!Number.isSafeInteger(minEligibleAgents) || minEligibleAgents < 1) throw new Error('invalid_minimum_agents');
  if(!Number.isSafeInteger(maxWalletShareBps)||maxWalletShareBps<1||maxWalletShareBps>10000)throw new Error('invalid_wallet_share_cap');
  if (actualPlayerWei === null || actualOperationsWei === null) throw new Error('external_pool_required');
  if ((actualPlayerWei === null) !== (actualOperationsWei === null)) throw new Error('incomplete_actual_split');
  if (actualPlayerWei !== null && (typeof actualPlayerWei !== 'bigint' || typeof actualOperationsWei !== 'bigint' ||
      actualPlayerWei < 0n || actualOperationsWei < 0n || actualPlayerWei + actualOperationsWei !== receivedWei)) throw new Error('invalid_actual_split');
  const opsWallet = walletOf(operatingWallet, 'operating_wallet');
  const seenIds = new Set(), seenWallets = new Set();
  const eligible = [], excluded = [];

  for (const agent of agents) {
    const id = String(agent.agentId || '').trim().toLowerCase();
    if (!AGENT_ID.test(id)) throw new Error('invalid_agent_id');
    const wallet = walletOf(agent.gameWallet, 'game_wallet');
    if (seenWallets.has(wallet)) throw new Error('duplicate_identity');
    if (wallet === opsWallet) throw new Error('operating_wallet_is_player');
    seenWallets.add(wallet);
    if (!Number.isSafeInteger(agent.points) || agent.points < 0) throw new Error('invalid_points');
    const resolved = agent.resolvedWallet == null ? null : walletOf(agent.resolvedWallet, 'resolved_wallet');
    const row = { agentId: id, wallet, points: agent.points };
    if (!agent.approved) excluded.push({ ...row, reason: 'match_not_approved' });
    else if (!agent.points) excluded.push({ ...row, reason: 'no_points' });
    else if (!resolved) excluded.push({ ...row, reason: 'agent_id_unverified' });
    else if (resolved !== wallet) excluded.push({ ...row, reason: 'agent_id_moved' });
    else {
      // A transferred name may occur in historic matches for two wallets.
      // Only its freshly resolved owner can be eligible. Conflicting eligible
      // records remain an error rather than producing two payments for one ID.
      if (seenIds.has(id)) throw new Error('duplicate_identity');
      seenIds.add(id);
      eligible.push(row);
    }
  }

  const playerPoolWei = actualPlayerWei;
  const operatingWei = actualOperationsWei;
  const totalPoints = eligible.reduce((sum, row) => sum + BigInt(row.points), 0n);
  if (playerPoolWei === 0n) return {
    receivedWei, playerPoolWei, operatingWallet: opsWallet, operatingWei,
    payouts: [], heldPlayerWei: 0n, excluded, holdReason: 'no_player_revenue',
  };
  if (eligible.length < minEligibleAgents) return {
    receivedWei, playerPoolWei, operatingWallet: opsWallet, operatingWei,
    payouts: [], heldPlayerWei: playerPoolWei, excluded,
    holdReason: eligible.length ? 'minimum_agents_not_met' : 'no_eligible_agents',
  };

  const payouts = eligible.map(row => {
    const numerator = playerPoolWei * BigInt(row.points);
    const proportional=numerator/totalPoints,cap=playerPoolWei*BigInt(maxWalletShareBps)/BPS;
    return { ...row, amountWei: proportional<cap?proportional:cap, remainder: numerator % totalPoints };
  });
  if(maxWalletShareBps<10000){const positive=payouts.filter(row=>row.amountWei>0n).map(({remainder,...row})=>row).sort((a,b)=>a.wallet.localeCompare(b.wallet));
    if(positive.length<minEligibleAgents)return {receivedWei,playerPoolWei,operatingWallet:opsWallet,operatingWei,payouts:[],heldPlayerWei:playerPoolWei,excluded,holdReason:'minimum_positive_payouts_not_met'};
    const allocated=positive.reduce((n,row)=>n+row.amountWei,0n);
    return {receivedWei,playerPoolWei,operatingWallet:opsWallet,operatingWei,payouts:positive,heldPlayerWei:playerPoolWei-allocated,excluded,maxWalletShareBps};
  }
  let dust = playerPoolWei - payouts.reduce((sum, row) => sum + row.amountWei, 0n);
  for (const row of [...payouts].sort((a, b) => a.remainder === b.remainder
    ? a.wallet.localeCompare(b.wallet) : a.remainder > b.remainder ? -1 : 1)) {
    if (!dust) break;
    row.amountWei++;
    dust--;
  }
  if (dust) throw new Error('allocation_dust_not_resolved');
  if (payouts.some(row => row.amountWei === 0n)) return {
    receivedWei, playerPoolWei, operatingWallet: opsWallet, operatingWei,
    payouts: [], heldPlayerWei: playerPoolWei, excluded,
    holdReason: 'minimum_positive_payouts_not_met',
  };
  return {
    receivedWei, playerPoolWei, operatingWallet: opsWallet, operatingWei,
    payouts: payouts.map(({ remainder, ...row }) => row).sort((a, b) => a.wallet.localeCompare(b.wallet)),
    heldPlayerWei: 0n, excluded,
  };
}

// A synchronous, in-memory claim dry-run. `send` is a fake transfer callback;
// this does not move BNB or establish that a future Solidity contract is safe.
export function createDryRunClaimLedger(snapshot, send) {
  if (typeof send !== 'function') throw new Error('invalid_send_callback');
  const allocations = new Map(snapshot.payouts.map(row => [row.wallet, row.amountWei]));
  if (allocations.size !== snapshot.payouts.length) throw new Error('duplicate_payout_wallet');
  const fundedWei = snapshot.payouts.reduce((sum, row) => sum + row.amountWei, 0n);
  if (fundedWei + snapshot.heldPlayerWei !== snapshot.playerPoolWei) throw new Error('underfunded_snapshot');
  const claimed = new Set();
  let balanceWei = fundedWei;
  return {
    claim(caller) {
      const wallet = walletOf(caller, 'claim_caller');
      const amountWei = allocations.get(wallet);
      if (!amountWei) throw new Error('no_claim_for_wallet');
      if (claimed.has(wallet)) throw new Error('already_claimed');
      claimed.add(wallet);
      try {
        if (send(wallet, amountWei) !== true) throw new Error('transfer_failed');
      } catch (error) {
        claimed.delete(wallet);
        throw error;
      }
      balanceWei -= amountWei;
      return { wallet, amountWei };
    },
    balanceWei: () => balanceWei,
    hasClaimed: caller => claimed.has(walletOf(caller, 'claim_caller')),
  };
}
