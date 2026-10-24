import { isAddress } from 'viem';
import {readRewardAsset,normalizeProcessorQuote} from './reward-asset.mjs';

export const BSC_VAULT_PORTAL = '0x90497450f2a706f1951b5bdda52B4E5d16f34C06';
export const BSC_SPLIT_VAULT_FACTORY = '0xfab75Dc774cB9B38b91749B8833360B46a52345F';
const ABI = [{ type: 'function', name: 'tryGetVault', stateMutability: 'view',
  inputs: [{ name: 'taxToken', type: 'address' }], outputs: [
    { name: 'found', type: 'bool' },
    { name: 'info', type: 'tuple', components: [
      { name: 'vault', type: 'address' }, { name: 'vaultFactory', type: 'address' },
      { name: 'description', type: 'string' }, { name: 'isOfficial', type: 'bool' },
      { name: 'riskLevel', type: 'uint8' },
    ] },
  ] }];
const TOKEN_ABI = [{ type: 'function', name: 'taxProcessor', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address' }] }];
const PROCESSOR_ABI = [
  { type: 'function', name: 'marketAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getQuoteToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SPLIT_ABI = [
  { type: 'function', name: 'vaultQuoteToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'vaultSpecVersion', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'taxToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getRecipientsInfo', stateMutability: 'view', inputs: [], outputs: [{ type: 'tuple[]', components: [
    { name: 'recipient', type: 'address' }, { name: 'bps', type: 'uint16' },
    { name: 'accumulated', type: 'uint128' }, { name: 'claimed', type: 'uint128' },
  ] }] },
];

// Read-only gate: cross-check the VaultPortal lookup (when present) against
// the tax processor's BNB market wallet. It does not prove Portal provenance.
export async function verifyFlapVault(client, { tokenAddress, vaultAddress, portalAddress = BSC_VAULT_PORTAL }) {
  if (![tokenAddress, vaultAddress, portalAddress].every(isAddress)) throw new Error('invalid_flap_address');
  if (await client.getChainId() !== 56) throw new Error('wrong_chain');
  const [found, info] = await client.readContract({ address: portalAddress, abi: ABI,
    functionName: 'tryGetVault', args: [tokenAddress] });
  const split = found && info.vaultFactory.toLowerCase() === BSC_SPLIT_VAULT_FACTORY.toLowerCase();
  if (found && !split && info.vault.toLowerCase() !== vaultAddress.toLowerCase()) throw new Error('flap_vault_mismatch');
  // tryGetVault may also find a direct Portal beneficiary via fallback. The
  // factory address distinguishes that from a VaultPortal-created Vault.
  const processor = await client.readContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'taxProcessor' });
  if (!isAddress(processor)) throw new Error('flap_tax_processor_missing');
  const [market, quote] = await Promise.all([
    client.readContract({ address: processor, abi: PROCESSOR_ABI, functionName: 'marketAddress' }),
    client.readContract({ address: processor, abi: PROCESSOR_ABI, functionName: 'getQuoteToken' }),
  ]);
  if (!isAddress(market) || !isAddress(quote)) throw new Error('flap_vault_mismatch');
  const rewardAsset=await readRewardAsset(client,vaultAddress);
  if (normalizeProcessorQuote(quote) !== rewardAsset.address) throw new Error('flap_vault_mismatch');
  let route;
  let flapVaultAddress = vaultAddress.toLowerCase();
  if (split) {
    if(rewardAsset.address!==ZERO_ADDRESS)throw new Error('flap_split_quote_unsupported');
    flapVaultAddress = info.vault.toLowerCase();
    if (!info.isOfficial || market.toLowerCase() !== flapVaultAddress) throw new Error('flap_vault_mismatch');
    const [taxToken, factory, recipients, splitCode] = await Promise.all([
      client.readContract({ address: info.vault, abi: SPLIT_ABI, functionName: 'taxToken' }),
      client.readContract({ address: info.vault, abi: SPLIT_ABI, functionName: 'factory' }),
      client.readContract({ address: info.vault, abi: SPLIT_ABI, functionName: 'getRecipientsInfo' }),
      client.getBytecode({ address: info.vault }),
    ]);
    if (!splitCode || splitCode === '0x' || !isAddress(taxToken) || !isAddress(factory) ||
        taxToken.toLowerCase() !== tokenAddress.toLowerCase() ||
        factory.toLowerCase() !== BSC_SPLIT_VAULT_FACTORY.toLowerCase() ||
        !Array.isArray(recipients) || recipients.length !== 1 ||
        !isAddress(recipients[0].recipient) || recipients[0].recipient.toLowerCase() !== vaultAddress.toLowerCase() ||
        Number(recipients[0].bps) !== 10_000) throw new Error('flap_split_recipient_mismatch');
    route = 'official-split-vault-100';
  } else {
    if (market.toLowerCase() !== vaultAddress.toLowerCase()) throw new Error('flap_vault_mismatch');
    route = found && info.vaultFactory.toLowerCase() !== ZERO_ADDRESS ? 'vaultportal' : 'direct-beneficiary';
    if(rewardAsset.address!==ZERO_ADDRESS){
      if(route!=='vaultportal')throw new Error('flap_erc20_vault_unverified');
      const [asset,version,token,factory]=await Promise.all(['vaultQuoteToken','vaultSpecVersion','taxToken','factory'].map(functionName=>
        client.readContract({address:vaultAddress,abi:SPLIT_ABI,functionName})));
      if(asset.toLowerCase()!==rewardAsset.address||version!=='v3'||token.toLowerCase()!==tokenAddress.toLowerCase()||
        factory.toLowerCase()!==info.vaultFactory.toLowerCase())throw new Error('flap_vault_mismatch');
    }
  }
  const metadata = { taxProcessor: processor.toLowerCase(),
    ...(found ? { isOfficial: info.isOfficial, riskLevel: info.riskLevel, description: info.description } : {}) };
  const code = await client.getBytecode({ address: vaultAddress });
  if (!code || code === '0x') throw new Error('flap_vault_has_no_code');
  return { tokenAddress: tokenAddress.toLowerCase(), vaultAddress: vaultAddress.toLowerCase(), flapVaultAddress,
    portalAddress: portalAddress.toLowerCase(), route,rewardAsset, ...metadata };
}
