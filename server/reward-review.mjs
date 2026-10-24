import { buildRewardDraft } from './reward-draft.mjs';
import { buildClaimManifest } from './reward-merkle.mjs';
import { verifyFlapVault } from './flap-vault.mjs';
import { classifyRevenueDay, revenueForDay, scanConfirmedRevenue } from './vault-revenue.mjs';
import { resolveAgentId } from './agent-id.mjs';
import {rewardPeriod,assertRewardPeriod} from './reward-period.mjs';
import {readAssetBalance} from './reward-asset.mjs';

const operationsAbi = [{ type: 'function', name: 'operations', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address' }] }];
const treasuryAbi = [
  ...['accountedWei','operationsWei'].map(name=>({type:'function',name,stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]})),
  { type: 'function', name: 'rewardAccountingEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'playerWithdrawalRenounced', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'unallocatedByDayWei', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'unallocatedPlayerWei', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'playerLiabilityWei', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochs', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
    { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint64' },
  ] },
];
const ZERO_ROOT = `0x${'0'.repeat(64)}`;

// Full read-only preparation: Flap mapping -> confirmed revenue -> mechanical
// match policy (or explicit IDs for tests) -> fresh ID resolution -> proofs.
export async function buildReviewedRewardPackage({ client, db, dayStart, approvedMatchIds,
  tokenAddress, vaultAddress, fromBlock, toBlock, fetcher = fetch,periodSeconds=86400,scoreCutoff=null }) {
  const periodMs=rewardPeriod(periodSeconds);
  if (dayStart + periodMs > Date.now()) throw new Error('reward_day_not_over');
  if(scoreCutoff!==null&&(!Number.isSafeInteger(scoreCutoff)||scoreCutoff<dayStart+periodMs||scoreCutoff>Date.now()))throw new Error('invalid_score_cutoff');
  if(periodSeconds===60&&scoreCutoff!==null&&scoreCutoff!==dayStart+periodMs)throw new Error('invalid_score_cutoff');
  const [firstBlock, lastBlock] = await Promise.all([
    client.getBlock({ blockNumber: fromBlock }), client.getBlock({ blockNumber: toBlock }),
  ]);
  if (BigInt(firstBlock.timestamp) * 1000n > BigInt(dayStart) ||
      BigInt(lastBlock.timestamp) * 1000n < BigInt(dayStart + periodMs)) throw new Error('reward_day_blocks_incomplete');
  const scan = await scanConfirmedRevenue(client, { vaultAddress, fromBlock, toBlock });
  // Pin routing and all balances to the same block. A recovery or new deposit
  // between RPC calls must not produce a balance assembled from different states.
  const snapshotClient = {
    getChainId: () => client.getChainId(),
    readContract: input => client.readContract({ ...input, blockNumber: scan.head }),
    getBytecode: input => client.getBytecode({ ...input, blockNumber: scan.head }),
    getBalance: input => client.getBalance({ ...input, blockNumber: scan.head }),
  };
  await assertRewardPeriod(snapshotClient,vaultAddress,periodSeconds);
  const flap = await verifyFlapVault(snapshotClient, { tokenAddress, vaultAddress });
  const revenue = revenueForDay(scan, dayStart,periodSeconds);
  const revenueMode = classifyRevenueDay(revenue);
  const day = BigInt(dayStart / periodMs);
  const [operatingWallet, rewardAccountingEnabled, renounced, unallocatedWei, dayUnallocatedWei, playerLiabilityWei, epoch] = await Promise.all([
    snapshotClient.readContract({ address: vaultAddress, abi: operationsAbi, functionName: 'operations' }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'rewardAccountingEnabled' }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'playerWithdrawalRenounced' }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'unallocatedPlayerWei' }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'unallocatedByDayWei', args: [day] }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'playerLiabilityWei' }),
    snapshotClient.readContract({ address: vaultAddress, abi: treasuryAbi, functionName: 'epochs', args: [day] }),
  ]);
  if (revenue.playerWei > 0n && rewardAccountingEnabled !== true) throw new Error('reward_accounting_not_active');
  const [actualBalance,accounted,operations]=await Promise.all([
    readAssetBalance(snapshotClient,vaultAddress,flap.rewardAsset,scan.head),
    snapshotClient.readContract({address:vaultAddress,abi:treasuryAbi,functionName:'accountedWei'}),
    snapshotClient.readContract({address:vaultAddress,abi:treasuryAbi,functionName:'operationsWei'})]);
  if(![actualBalance,accounted,operations,playerLiabilityWei,unallocatedWei,dayUnallocatedWei].every(v=>typeof v==='bigint'&&v>=0n)||
    actualBalance<accounted||operations+playerLiabilityWei!==accounted)throw new Error('reward_treasury_insolvent');
  if (epoch[0].toLowerCase() !== ZERO_ROOT) throw new Error('reward_epoch_already_published');
  if (unallocatedWei > playerLiabilityWei || dayUnallocatedWei > unallocatedWei ||
      revenue.playerWei > dayUnallocatedWei) throw new Error('reward_player_funds_unavailable');
  const draft = await buildRewardDraft({ db, dayStart, periodSeconds,scoreCutoff,approvedMatchIds, tokenAddress, receivedWei: revenue.receivedWei,
    actualPlayerWei: revenue.playerWei, actualOperationsWei: revenue.operationsWei,
    operatingWallet, resolveName: async name => (await resolveAgentId(name, fetcher)).address });
  const manifest = draft.playerPoolWei === 0n || (periodSeconds!==60&&draft.heldPlayerWei) || draft.payouts.length < 2 ? null :
    buildClaimManifest(draft, { treasuryAddress: vaultAddress });
  return { status: 'prepared_only', flap, revenue, revenueMode,
    treasury: { rewardAccountingEnabled, renounced, unallocatedWei, dayUnallocatedWei, playerLiabilityWei, epochDay: day, blockNumber: scan.head }, draft, manifest };
}
