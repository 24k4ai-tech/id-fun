import { isAddress } from 'viem';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import {rewardPeriod} from './reward-period.mjs';

const TYPES = ['uint256', 'address', 'uint256', 'address', 'uint256'];
const DAY_MS = 86_400_000;

// A claim manifest for review, not a transaction. No key is held here.
export function buildClaimManifest(draft, { chainId = 56, treasuryAddress }) {
  if (draft.status !== 'draft_only' || draft.playerPoolWei <= 0n || (draft.periodSeconds!==60&&draft.heldPlayerWei !== 0n) ||
      draft.payouts.length < 2 || draft.payouts.some(row => row.amountWei <= 0n)) throw new Error('draft_not_publishable');
  if (!Number.isSafeInteger(chainId) || chainId < 1 || !isAddress(treasuryAddress)) throw new Error('invalid_claim_domain');
  const periodSeconds=draft.periodSeconds??86400,periodMs=rewardPeriod(periodSeconds);
  if (!Number.isSafeInteger(draft.dayStart) || draft.dayStart % periodMs) throw new Error('invalid_reward_day');
  const day = draft.dayStart / periodMs;
  const values = draft.payouts.map(row => [String(chainId), treasuryAddress, String(day), row.wallet, String(row.amountWei)]);
  const tree = StandardMerkleTree.of(values, TYPES);
  const claims = [...tree.entries()].map(([index, value]) => ({
    wallet: value[3].toLowerCase(), amountWei: value[4], proof: tree.getProof(index),
  })).sort((a, b) => a.wallet.localeCompare(b.wallet));
  const totalWei = claims.reduce((sum, row) => sum + BigInt(row.amountWei), 0n);
  if (totalWei+draft.heldPlayerWei !== draft.playerPoolWei) throw new Error('manifest_balance_mismatch');
  return { chainId, treasuryAddress: treasuryAddress.toLowerCase(), day, periodSeconds, root: tree.root, totalWei: String(totalWei), claims };
}
