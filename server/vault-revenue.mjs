import { isAddress, parseAbiItem } from 'viem';

const revenueEvent = parseAbiItem('event RevenueRecognized(address indexed trigger, uint256 amountWei, uint256 playerWei, uint256 operationsWei)');

// Read-only, confirmed event scan. Caller must separately verify that this
// contract address is the Flap tax beneficiary for the intended token.
export async function scanConfirmedRevenue(client, { vaultAddress, fromBlock, toBlock, confirmations = 12n }) {
  if (!isAddress(vaultAddress) || typeof fromBlock !== 'bigint' || typeof toBlock !== 'bigint' ||
      fromBlock < 0n || toBlock < fromBlock || typeof confirmations !== 'bigint' || confirmations < 1n) throw new Error('invalid_revenue_range');
  const head = await client.getBlockNumber();
  if (toBlock + confirmations > head) throw new Error('revenue_blocks_unconfirmed');
  const logs = [];
  // Stay below common BSC provider limits. A failed page aborts the scan; the
  // worker only commits its cursor after every page has been validated.
  for (let start = fromBlock; start <= toBlock; start += 500n) {
    const end = start + 499n < toBlock ? start + 499n : toBlock;
    logs.push(...await client.getLogs({ address: vaultAddress, event: revenueEvent, fromBlock: start, toBlock: end }));
  }
  const timestamps = new Map();
  const seen = new Set(), receipts = [];
  for (const log of logs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) throw new Error('duplicate_revenue_event');
    seen.add(key);
    if (log.address.toLowerCase() !== vaultAddress.toLowerCase() ||
        log.blockNumber < fromBlock || log.blockNumber > toBlock ||
        log.args.amountWei <= 0n || log.args.playerWei + log.args.operationsWei !== log.args.amountWei) throw new Error('invalid_revenue_event');
    if (!timestamps.has(log.blockNumber)) {
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      timestamps.set(log.blockNumber, Number(block.timestamp) * 1000);
    }
    receipts.push({ txHash: log.transactionHash, logIndex: log.logIndex, blockNumber: log.blockNumber,
      blockTimestampMs: timestamps.get(log.blockNumber),
      trigger: log.args.trigger, amountWei: log.args.amountWei,
      playerWei: log.args.playerWei, operationsWei: log.args.operationsWei });
  }
  return { vaultAddress: vaultAddress.toLowerCase(), fromBlock, toBlock, head, receipts,
    receivedWei: receipts.reduce((sum, row) => sum + row.amountWei, 0n),
    playerWei: receipts.reduce((sum, row) => sum + row.playerWei, 0n),
    operationsWei: receipts.reduce((sum, row) => sum + row.operationsWei, 0n) };
}

export function revenueForDay(scan, dayStart, periodSeconds=86400) {
  if(![60,1800,86400].includes(periodSeconds))throw new Error('invalid_reward_period');
  const DAY_MS = periodSeconds*1000;
  if (!Number.isSafeInteger(dayStart) || dayStart < 0 || dayStart % DAY_MS) throw new Error('invalid_reward_day');
  const receipts = scan.receipts.filter(row => row.blockTimestampMs >= dayStart && row.blockTimestampMs < dayStart + DAY_MS);
  return { vaultAddress: scan.vaultAddress, dayStart, dayEnd: dayStart + DAY_MS, receipts,
    receivedWei: receipts.reduce((sum, row) => sum + row.amountWei, 0n),
    playerWei: receipts.reduce((sum, row) => sum + row.playerWei, 0n),
    operationsWei: receipts.reduce((sum, row) => sum + row.operationsWei, 0n) };
}

// Classify externally reported budgets; revenue split policy is not distributed.
export function classifyRevenueDay(revenue) {
  let rewardSeen=false, creatorSeen=false;
  for (const row of revenue.receipts) {
    if ([row.amountWei,row.playerWei,row.operationsWei].some(v=>typeof v!=='bigint'||v<0n)
        || row.playerWei+row.operationsWei!==row.amountWei) throw new Error('invalid_revenue_event');
    if(row.playerWei>0n) rewardSeen=true;
    else if(row.amountWei>0n) creatorSeen=true;
  }
  return rewardSeen ? (creatorSeen?'mixed':'reward_accounting') : 'creator_test';
}
