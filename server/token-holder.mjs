import { isAddress } from 'viem';

const ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
];

export function holderWeightBps(balance, decimals) {
  if (typeof balance !== 'bigint' || balance < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error('invalid_token_balance');
  if (balance === 0n) return 0;
  const unit = 10n ** BigInt(decimals);
  if (balance >= 1_000_000n * unit) {
    const capped = balance < 49_000_000n * unit ? balance : 49_000_000n * unit;
    const steps = Number((capped - 1_000_000n * unit) / (2_000_000n * unit));
    return 13_000 + Math.min(steps, 4) * 500 + Math.max(steps - 4, 0) * 250;
  }
  if (balance >= 100_000n * unit) return 11_500;
  return 10_000;
}

export function isHolderWeightBps(weight) {
  return weight === 0 || weight === 10_000 || weight === 11_500 ||
    (Number.isInteger(weight) && ((weight >= 13_000 && weight <= 15_000 && (weight - 13_000) % 500 === 0) ||
      (weight > 15_000 && weight <= 20_000 && (weight - 15_000) % 250 === 0)));
}

// Both balances are read at the same BSC block when the challenge is accepted.
// This is a single entry check, not a lock or a continuing holding requirement.
export async function matchHolderWeights(client, tokenAddress, wallets) {
  if (!isAddress(tokenAddress) || wallets.length !== 2 || wallets.some(wallet => !isAddress(wallet)))
    throw new Error('invalid_token_holder_check');
  if (await client.getChainId() !== 56) throw new Error('wrong_chain');
  const [blockNumber, decimals] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({ address: tokenAddress, abi: ABI, functionName: 'decimals' }),
  ]);
  const balances = await Promise.all(wallets.map(wallet => client.readContract({
    address: tokenAddress, abi: ABI, functionName: 'balanceOf', args: [wallet], blockNumber,
  })));
  return { blockNumber, weights: balances.map(balance => holderWeightBps(balance, decimals)) };
}
