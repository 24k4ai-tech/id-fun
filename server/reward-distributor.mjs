import { isAddress } from 'viem';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import {rewardPeriod,assertRewardPeriod} from './reward-period.mjs';

const TYPES = ['uint256', 'address', 'uint256', 'address', 'uint256'];
const ABI = [
  { type: 'function', name: 'CLAIM_WINDOW', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'epochs', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
    { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint64' },
  ] },
  { type: 'function', name: 'claimed', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'recoveredEpochWei', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claimFor', stateMutability: 'nonpayable', inputs: [
    { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32[]' },
  ], outputs: [] },
];

export function validateDistributionManifest(manifest) {
  rewardPeriod(manifest?.periodSeconds??86400);
  if (!manifest || manifest.chainId !== 56 || !isAddress(manifest.treasuryAddress) ||
      !Number.isSafeInteger(manifest.day) || manifest.day < 0 ||
      !/^0x[0-9a-fA-F]{64}$/.test(manifest.root) || !Array.isArray(manifest.claims) ||
      manifest.claims.length < 2) throw new Error('invalid_distribution_manifest');
  const seen = new Set();
  let total = 0n;
  for (const row of manifest.claims) {
    if (!isAddress(row.wallet) || !/^\d+$/.test(row.amountWei) || BigInt(row.amountWei) <= 0n ||
        !Array.isArray(row.proof) || !row.proof.every(hash => /^0x[0-9a-fA-F]{64}$/.test(hash)))
      throw new Error('invalid_distribution_claim');
    const key = row.wallet.toLowerCase();
    if (seen.has(key)) throw new Error('duplicate_distribution_wallet');
    seen.add(key);
    const leaf = ['56', manifest.treasuryAddress, String(manifest.day), row.wallet, row.amountWei];
    if (!StandardMerkleTree.verify(manifest.root, TYPES, leaf, row.proof)) throw new Error('invalid_distribution_proof');
    total += BigInt(row.amountWei);
  }
  if (String(total) !== manifest.totalWei) throw new Error('distribution_total_mismatch');
  return total;
}

// Caller supplies a chain client and optionally a relayer wallet client.
// Every payment is its own transaction so one reverting recipient cannot block others.
export async function distributeRewards({ client, walletClient, manifest, broadcast = false }) {
  const total = validateDistributionManifest(manifest);
  if (await client.getChainId() !== 56) throw new Error('wrong_chain');
  const treasury = manifest.treasuryAddress;
  await assertRewardPeriod(client,treasury,manifest.periodSeconds??86400);
  const code = await client.getBytecode({ address: treasury });
  if (!code || code === '0x') throw new Error('treasury_has_no_code');
  const day = BigInt(manifest.day);
  const epoch = await client.readContract({ address: treasury, abi: ABI, functionName: 'epochs', args: [day] });
  if (epoch[0].toLowerCase() !== manifest.root.toLowerCase() || BigInt(epoch[1]) !== total ||
      BigInt(epoch[2]) > total) throw new Error('published_epoch_mismatch');
  if (BigInt(epoch[2]) === total && BigInt(await client.readContract({ address: treasury, abi: ABI,
    functionName: 'recoveredEpochWei', args: [day] })) > 0n) throw new Error('reward_epoch_closed');
  const now = BigInt((await client.getBlock({ blockTag: 'latest' })).timestamp);
  if (now < BigInt(epoch[3])) throw new Error('reward_epoch_locked');
  const claimWindow = BigInt(await client.readContract({ address: treasury, abi: ABI, functionName: 'CLAIM_WINDOW' }));
  if (claimWindow <= 0n || now >= BigInt(epoch[3]) + claimWindow) throw new Error('reward_epoch_expired');
  if (broadcast && (!walletClient?.account || !isAddress(walletClient.account.address)))
    throw new Error('relayer_wallet_required');
  const results = [];
  for (const row of manifest.claims) {
    const args = [day, row.wallet, BigInt(row.amountWei), row.proof];
    let hash;
    try {
      const claimed = await client.readContract({ address: treasury, abi: ABI,
        functionName: 'claimed', args: [day, row.wallet] });
      if (claimed) { results.push({ wallet: row.wallet, status: 'already_paid' }); continue; }
      if (!broadcast) { results.push({ wallet: row.wallet, status: 'ready' }); continue; }
      const { request } = await client.simulateContract({ account: walletClient.account,
        address: treasury, abi: ABI, functionName: 'claimFor', args });
      hash = await walletClient.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
      results.push({ wallet: row.wallet, status: receipt.status === 'success' ? 'paid' : 'failed', hash });
    } catch (error) {
      results.push({ wallet: row.wallet, status: hash ? 'pending_confirmation' : 'failed',
        ...(hash ? { hash } : {}), reason: String(error?.shortMessage || error?.message || error) });
    }
  }
  return { day: manifest.day, treasuryAddress: treasury.toLowerCase(), broadcast, results };
}
