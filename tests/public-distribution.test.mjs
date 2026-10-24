import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { nextPublicPayout } from '../server/public-distribution.mjs';

const addr = n => `0x${n.toString(16).padStart(40, '0')}`;

function fixture() {
  const treasuryAddress = addr(50);
  const values = [['56', treasuryAddress, '2', addr(1), '200'], ['56', treasuryAddress, '2', addr(2), '300']];
  const types = ['uint256', 'address', 'uint256', 'address', 'uint256'];
  const tree = StandardMerkleTree.of(values, types);
  const review = { status: 'prepared_only', manifest: { chainId: 56, treasuryAddress, day: 2,
    root: tree.root, totalWei: '500', claims: [...tree.entries()].map(([i, value]) => ({
      wallet: value[3], amountWei: value[4], proof: tree.getProof(i),
    })) } };
  const paid = new Set();
  const client = { getChainId: async () => 56, getBytecode: async () => '0x6000',
    getBlock: async () => ({ timestamp: 300_000n }),
    readContract: async input => input.functionName === 'rewardAsset' ? addr(0) : input.functionName === 'epochs' ? [tree.root, 500n, 0n, 200_000n] :
      input.functionName === 'CLAIM_WINDOW' ? 2n * 86_400n :
      input.functionName === 'recoveredEpochWei' ? 0n : paid.has(input.args[1]),
  };
  return { review, client, paid };
}

test('public trigger only prepares approved claimFor destination', async () => {
  const { review, client, paid } = fixture();
  const first = await nextPublicPayout({ review, client });
  assert.equal(first.status, 'ready');
  assert.equal(first.treasuryAddress, review.manifest.treasuryAddress);
  const abi = [{ type: 'function', name: 'claimFor', stateMutability: 'nonpayable', inputs: [
    { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32[]' },
  ], outputs: [] }];
  const decoded = decodeFunctionData({ abi, data: first.data });
  assert.equal(decoded.functionName, 'claimFor');
  assert.equal(decoded.args[1].toLowerCase(), first.wallet.toLowerCase());
  assert.equal(String(decoded.args[2]), first.amountWei);
  paid.add(first.wallet);
  const second = await nextPublicPayout({ review, client });
  assert.notEqual(second.wallet, first.wallet);
  paid.add(second.wallet);
  assert.equal((await nextPublicPayout({ review, client })).status, 'complete');
});

test('public trigger refuses locked or mismatched epoch', async () => {
  const { review, client } = fixture();
  client.getBlock = async () => ({ timestamp: 100_000n });
  assert.equal((await nextPublicPayout({ review, client })).status, 'locked');
  client.readContract = async input => input.functionName === 'epochs' ? [`0x${'0'.repeat(64)}`, 500n, 0n, 0n] : false;
  await assert.rejects(nextPublicPayout({ review, client }), /published_epoch_mismatch/);
});

test('expired or recovered rewards cannot present a player payment', async () => {
  const { review, client } = fixture();
  client.getBlock = async () => ({ timestamp: 200_000n + 2n * 86_400n });
  const result = await nextPublicPayout({ review, client });
  assert.equal(result.status, 'expired');
  assert.equal(result.data, undefined);
  client.readContract = async input => input.functionName === 'epochs' ? [review.manifest.root, 500n, 500n, 200_000n] :
    input.functionName === 'recoveredEpochWei' ? 300n : false;
  assert.equal((await nextPublicPayout({ review, client })).status, 'closed');
});
