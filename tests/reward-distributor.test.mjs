import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { distributeRewards, validateDistributionManifest } from '../server/reward-distributor.mjs';

const addr = n => `0x${n.toString(16).padStart(40, '0')}`;
const TYPES = ['uint256', 'address', 'uint256', 'address', 'uint256'];

function fixture() {
  const treasuryAddress = addr(50);
  const values = [["56", treasuryAddress, "2", addr(1), "200"], ["56", treasuryAddress, "2", addr(2), "300"]];
  const tree = StandardMerkleTree.of(values, TYPES);
  const manifest = { chainId: 56, treasuryAddress, day: 2, root: tree.root, totalWei: '500',
    claims: [...tree.entries()].map(([i, value]) => ({ wallet: value[3], amountWei: value[4], proof: tree.getProof(i) })) };
  const claimed = new Set();
  const client = {
    getChainId: async () => 56,
    getBytecode: async () => '0x6000',
    getBlock: async () => ({ timestamp: 300_000n }),
    readContract: async input => input.functionName === 'epochs' ? [tree.root, 500n, 0n, 200_000n] :
      input.functionName === 'CLAIM_WINDOW' ? 2n * 86_400n :
      input.functionName === 'recoveredEpochWei' ? 0n : claimed.has(input.args[1]),
    simulateContract: async input => ({ request: input }),
    waitForTransactionReceipt: async () => ({ status: 'success' }),
  };
  return { manifest, claimed, client };
}

test('sponsored distribution pays only proven wallets and skips paid entries', async () => {
  const { manifest, claimed, client } = fixture();
  let sent = 0;
  const walletClient = { account: { address: addr(9) }, writeContract: async request => {
    assert.equal(request.functionName, 'claimFor');
    assert.equal(request.args[1], manifest.claims[1].wallet);
    sent++;
    return `0x${String(sent).padStart(64, '0')}`;
  } };
  const dry = await distributeRewards({ client, manifest });
  assert.deepEqual(dry.results.map(row => row.status), ['ready', 'ready']);
  assert.equal(sent, 0);
  claimed.add(manifest.claims[0].wallet);
  const paid = await distributeRewards({ client, walletClient, manifest, broadcast: true });
  assert.deepEqual(paid.results.map(row => row.status), ['already_paid', 'paid']);
  assert.equal(sent, 1);
});

test('one recipient failing simulation does not block the next', async () => {
  const { manifest, client } = fixture();
  client.simulateContract = async input => {
    if (input.args[1] === manifest.claims[0].wallet) throw new Error('recipient rejected BNB');
    return { request: input };
  };
  const walletClient = { account: { address: addr(9) }, writeContract: async () => `0x${'1'.repeat(64)}` };
  const result = await distributeRewards({ client, walletClient, manifest, broadcast: true });
  assert.deepEqual(result.results.map(row => row.status), ['failed', 'paid']);
});

test('a sent transaction with unknown confirmation is reported with its hash', async () => {
  const { manifest, client } = fixture();
  client.waitForTransactionReceipt = async () => { throw new Error('RPC timeout'); };
  const walletClient = { account: { address: addr(9) }, writeContract: async () => `0x${'1'.repeat(64)}` };
  const result = await distributeRewards({ client, walletClient, manifest, broadcast: true });
  assert.equal(result.results[0].status, 'pending_confirmation');
  assert.equal(result.results[0].hash, `0x${'1'.repeat(64)}`);
});

test('changed wallet, amount, root, or locked epoch is rejected', async () => {
  const { manifest, client } = fixture();
  assert.equal(validateDistributionManifest(manifest), 500n);
  const changed = structuredClone(manifest);
  changed.claims[0].wallet = addr(99);
  assert.throws(() => validateDistributionManifest(changed), /invalid_distribution_proof/);
  const wrongRoot = structuredClone(manifest);
  wrongRoot.root = `0x${'f'.repeat(64)}`;
  await assert.rejects(distributeRewards({ client, manifest: wrongRoot }), /invalid_distribution_proof/);
  client.getBlock = async () => ({ timestamp: 100_000n });
  await assert.rejects(distributeRewards({ client, manifest }), /reward_epoch_locked/);
  client.getBlock = async () => ({ timestamp: 200_000n + 2n * 86_400n });
  await assert.rejects(distributeRewards({ client, manifest }), /reward_epoch_expired/);
  client.getBlock = async () => ({ timestamp: 300_000n });
  client.readContract = async input => input.functionName === 'epochs' ? [manifest.root, 500n, 500n, 200_000n] :
    input.functionName === 'recoveredEpochWei' ? 250n : false;
  await assert.rejects(distributeRewards({ client, manifest }), /reward_epoch_closed/);
});
