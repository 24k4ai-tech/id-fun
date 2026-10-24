import { rewardEpochCandidates, scoreApprovedMatches } from './reward-candidates.mjs';
import { simulateTaxPayout } from '../simulations/tax-payout.mjs';
import { resolveRewardIdentities } from './reward-identities.mjs';

// Builds an offline draft only. The amount must be replaced with confirmed
// Vault receipts, and the resolver must check Agent IDs again at settlement.
export async function buildRewardDraft({ db, dayStart, approvedMatchIds, receivedWei, operatingWallet, resolveName, tokenAddress = null,
  actualPlayerWei = null, actualOperationsWei = null, periodSeconds = 86400,scoreCutoff=null }) {
  if (typeof resolveName !== 'function') throw new Error('identity_resolver_required');
  const candidates = rewardEpochCandidates(db, dayStart, tokenAddress, periodSeconds,scoreCutoff);
  const selectedIds = approvedMatchIds === undefined ? candidates.matches.map(row => row.id) : approvedMatchIds;
  const scores = scoreApprovedMatches(candidates, selectedIds);
  const agents = await resolveRewardIdentities(scores, operatingWallet, resolveName);
  const accounting = simulateTaxPayout({ receivedWei, operatingWallet, agents, minEligibleAgents: 2,
    actualPlayerWei, actualOperationsWei,maxWalletShareBps:periodSeconds===60?500:10000 });
  return {
    status: 'draft_only', periodSeconds,scoreCutoff:candidates.scoreCutoff||candidates.dayEnd,
    dayStart, dayEnd: candidates.dayEnd,
    selectionMode: approvedMatchIds === undefined ? 'automatic_rules' : 'explicit_ids',
    reviewedMatches: selectedIds.length,
    approvedMatchIds: [...selectedIds].sort((a, b) => String(a).localeCompare(String(b),undefined,{numeric:true})),
    scoreEvidence: agents.map(({ agentId, gameWallet, resolvedWallet, points, combatPoints, matchIds }) =>
      ({ agentId, gameWallet, resolvedWallet, weightedPoints: points, combatPoints, matchIds })),
    rejectedMatches: candidates.rejected,
    ...accounting,
  };
}
