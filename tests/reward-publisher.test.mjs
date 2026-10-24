import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { publishRewardEpoch } from '../server/reward-publisher.mjs';

const addr = n => `0x${n.toString(16).padStart(40, '0')}`;

function fixture() {
  const treasuryAddress = addr(50);
  const values = [['56', treasuryAddress, '2', addr(1), '200'], ['56', treasuryAddress, '2', addr(2), '300']];
  const tree = StandardMerkleTree.of(values, ['uint256', 'address', 'uint256', 'address', 'uint256']);
  const manifest = { chainId: 56, treasuryAddress, day: 2, root: tree.root, totalWei: '500',
    claims: [...tree.entries()].map(([i, value]) => ({ wallet: value[3], amountWei: value[4], proof: tree.getProof(i) })) };
  const state = { publisher: addr(9), rewardAccountingEnabled: true, unallocatedPlayerWei: 500n,
    unallocatedByDayWei: 500n,
    epochs: [`0x${'0'.repeat(64)}`, 0n, 0n, 0n] };
  let writes = 0;
  const client = { getChainId: async () => 56,
    readContract: async input => state[input.functionName],
    simulateContract: async input => ({ request: input }),
    waitForTransactionReceipt: async () => ({ status: 'success' }) };
  const walletClient = { account: { address: addr(9) }, writeContract: async request => {
    writes++;
    assert.equal(request.functionName, 'publishEpoch');
    assert.deepEqual(request.args, [2n, tree.root, 500n]);
    return `0x${'1'.repeat(64)}`;
  } };
  return { manifest, state, client, walletClient, writes: () => writes };
}

test('automatic root publication enforces publisher, balance and immutable day', async () => {
  const f = fixture();
  f.state.publisher = addr(8);
  await assert.rejects(publishRewardEpoch(f), /wrong_reward_publisher/);
  f.state.publisher = addr(9);
  f.state.rewardAccountingEnabled = false;
  await assert.rejects(publishRewardEpoch(f), /reward_accounting_not_active/);
  f.state.rewardAccountingEnabled = true;
  f.state.unallocatedPlayerWei = 499n;
  await assert.rejects(publishRewardEpoch(f), /reward_player_funds_unavailable/);
  f.state.unallocatedPlayerWei = 500n;
  f.state.unallocatedByDayWei = 499n;
  await assert.rejects(publishRewardEpoch(f), /reward_player_funds_unavailable/);
  f.state.unallocatedByDayWei = 500n;
  f.state.epochs[0] = f.manifest.root;
  await assert.rejects(publishRewardEpoch(f), /reward_epoch_already_published/);
  assert.equal(f.writes(), 0);
  f.state.epochs[0] = `0x${'0'.repeat(64)}`;
  assert.equal(await publishRewardEpoch(f), `0x${'1'.repeat(64)}`);
  assert.equal(f.writes(), 1);
});
