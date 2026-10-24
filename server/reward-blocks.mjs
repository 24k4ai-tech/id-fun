// Locate a complete UTC interval; include the block before the day starts and
// the first block after it ends because the review checks both boundaries.
export async function findRewardDayBlocks(client, dayStart, periodSeconds=86400) {
  const periodMs=periodSeconds*1000;
  if (![60,1800,86400].includes(periodSeconds)||!Number.isSafeInteger(dayStart) || dayStart < periodMs || dayStart % periodMs)
    throw new Error('invalid_reward_day');
  const head = await client.getBlockNumber();
  async function firstAtOrAfter(timestampSeconds) {
    let low = 0n, high = head;
    while (low < high) {
      const mid = (low + high) / 2n;
      const block = await client.getBlock({ blockNumber: mid });
      if (BigInt(block.timestamp) < timestampSeconds) low = mid + 1n;
      else high = mid;
    }
    const block = await client.getBlock({ blockNumber: low });
    if (BigInt(block.timestamp) < timestampSeconds) throw new Error('reward_day_not_over');
    return low;
  }
  const first = await firstAtOrAfter(BigInt(dayStart / 1000));
  const after = await firstAtOrAfter(BigInt((dayStart + periodMs) / 1000));
  if (first === 0n || after + 12n > head) throw new Error('reward_day_blocks_unconfirmed');
  return { fromBlock: first - 1n, toBlock: after };
}
