import test from 'node:test';
import assert from 'node:assert/strict';
import { findRewardDayBlocks } from '../server/reward-blocks.mjs';

test('automatic settlement finds complete UTC day with confirmation margin', async () => {
  const start = 2 * 86_400_000;
  const client = { getBlockNumber: async () => 40n,
    getBlock: async ({ blockNumber }) => ({ timestamp: blockNumber * 10_000n }) };
  const bounds = await findRewardDayBlocks(client, start);
  assert.deepEqual(bounds, { fromBlock: 17n, toBlock: 26n });
  client.getBlockNumber = async () => 30n;
  await assert.rejects(findRewardDayBlocks(client, start), /reward_day_blocks_unconfirmed/);
});
