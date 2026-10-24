import { validateDistributionManifest } from './reward-distributor.mjs';
import {assertRewardPeriod} from './reward-period.mjs';

const ABI = [
  { type: 'function', name: 'publisher', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'rewardAccountingEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'unallocatedByDayWei', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'unallocatedPlayerWei', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochs', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
    { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint64' },
  ] },
  { type: 'function', name: 'publishEpoch', stateMutability: 'nonpayable', inputs: [
    { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' },
  ], outputs: [] },
];
const ZERO_ROOT = `0x${'0'.repeat(64)}`;

export async function publishRewardEpoch({ client, walletClient, manifest }) {
  const total = validateDistributionManifest(manifest);
  if (!walletClient?.account?.address) throw new Error('publisher_wallet_required');
  if (await client.getChainId() !== 56) throw new Error('wrong_chain');
  const treasury = manifest.treasuryAddress;
  await assertRewardPeriod(client,treasury,manifest.periodSeconds??86400);
  const [publisher, enabled, unallocated, dayUnallocated, epoch] = await Promise.all([
    client.readContract({ address: treasury, abi: ABI, functionName: 'publisher' }),
    client.readContract({ address: treasury, abi: ABI, functionName: 'rewardAccountingEnabled' }),
    client.readContract({ address: treasury, abi: ABI, functionName: 'unallocatedPlayerWei' }),
    client.readContract({ address: treasury, abi: ABI, functionName: 'unallocatedByDayWei', args: [BigInt(manifest.day)] }),
    client.readContract({ address: treasury, abi: ABI, functionName: 'epochs', args: [BigInt(manifest.day)] }),
  ]);
  if (publisher.toLowerCase() !== walletClient.account.address.toLowerCase()) throw new Error('wrong_reward_publisher');
  if (enabled !== true) throw new Error('reward_accounting_not_active');
  if (BigInt(unallocated) < total || BigInt(dayUnallocated) < total) throw new Error('reward_player_funds_unavailable');
  if (epoch[0].toLowerCase() !== ZERO_ROOT) throw new Error('reward_epoch_already_published');
  const { request } = await client.simulateContract({ account: walletClient.account, address: treasury,
    abi: ABI, functionName: 'publishEpoch', args: [BigInt(manifest.day), manifest.root, total] });
  const hash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== 'success') throw new Error('reward_root_publish_failed');
  return hash;
}
