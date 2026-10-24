import test from 'node:test';
import assert from 'node:assert/strict';
import { holderWeightBps, isHolderWeightBps, matchHolderWeights } from '../server/token-holder.mjs';

const wallet = n => `0x${n.toString(16).padStart(40, '0')}`;
const UNIT = 10n ** 18n;

test('positive balances qualify and holder weight stops increasing after the cap', () => {
  assert.equal(holderWeightBps(0n, 18), 0);
  assert.equal(holderWeightBps(1n, 18), 10_000);
  assert.equal(holderWeightBps(100_000n * UNIT - 1n, 18), 10_000);
  assert.equal(holderWeightBps(100_000n * UNIT, 18), 11_500);
  assert.equal(holderWeightBps(1_000_000n * UNIT - 1n, 18), 11_500);
  for (let step = 0; step <= 24; step++) {
    const threshold = BigInt(1 + step * 2) * 1_000_000n * UNIT;
    const expected = 13_000 + Math.min(step, 4) * 500 + Math.max(step - 4, 0) * 250;
    assert.equal(holderWeightBps(threshold, 18), expected);
    assert.equal(isHolderWeightBps(expected), true);
    if (step) assert.ok(holderWeightBps(threshold - 1n, 18) < expected);
  }
  assert.equal(holderWeightBps(10_000_000n * UNIT, 18), 15_000);
  assert.equal(holderWeightBps(50_000_000n * UNIT, 18), 20_000);
  assert.equal(holderWeightBps(100_000_000n * UNIT, 18), 20_000);
  assert.equal(isHolderWeightBps(20_250), false);
});

test('both wallets are checked against the same BSC block', async () => {
  const calls = [];
  const client = { getChainId: async () => 56, getBlockNumber: async () => 123n,
    readContract: async input => {
      calls.push(input);
      if (input.functionName === 'decimals') return 18;
      return input.args[0] === wallet(1) ? 1n : 1_000_000n * UNIT;
    } };
  const result = await matchHolderWeights(client, wallet(40), [wallet(1), wallet(2)]);
  assert.deepEqual(result, { blockNumber: 123n, weights: [10_000, 13_000] });
  assert.deepEqual(calls.filter(row => row.functionName === 'balanceOf').map(row => row.blockNumber), [123n, 123n]);
  await assert.rejects(matchHolderWeights({ ...client, getChainId: async () => 97 }, wallet(40),
    [wallet(1), wallet(2)]), /wrong_chain/);
});
