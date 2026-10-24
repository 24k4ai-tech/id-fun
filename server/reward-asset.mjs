import { isAddress, parseAbi, zeroAddress } from 'viem';
export const BSC_WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
export const BSC_U = '0xce24439f2d9c6a2289f741120fe202248b666666';
export const FLAP_GUARDIAN = '0x9e27098dcd8844bcc6287a557e0b4d09c86b8a4b';
const ABI = parseAbi(['function rewardAsset() view returns (address)', 'function symbol() view returns (string)',
  'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)']);
export function normalizeProcessorQuote(address) {
  if (!isAddress(address)) throw new Error('invalid_reward_asset');
  return address.toLowerCase() === BSC_WBNB ? zeroAddress : address.toLowerCase();
}
export async function readRewardAsset(client, treasury, blockNumber) {
  const address = await client.readContract({ address: treasury, abi: ABI, functionName: 'rewardAsset', blockNumber });
  if (!isAddress(address)) throw new Error('invalid_reward_asset');
  if (address.toLowerCase() === zeroAddress) return { address: zeroAddress, symbol: 'BNB', decimals: 18 };
  const [symbol, decimals] = await Promise.all(['symbol','decimals'].map(functionName =>
    client.readContract({ address, abi: ABI, functionName, blockNumber })));
  if (typeof symbol !== 'string' || !/^[a-zA-Z0-9._-]{1,24}$/.test(symbol) ||
      !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('invalid_reward_asset');
  return { address: address.toLowerCase(), symbol, decimals };
}
export async function readAssetBalance(client, treasury, asset, blockNumber) {
  const balance = asset.address === zeroAddress ? await client.getBalance({ address: treasury, blockNumber }) :
    await client.readContract({ address: asset.address, abi: ABI, functionName: 'balanceOf', args: [treasury], blockNumber });
  if (typeof balance !== 'bigint' || balance < 0n) throw new Error('invalid_reward_balance');
  return balance;
}
