import { verifyFlapVault } from './flap-vault.mjs';
import { encodeFunctionData } from 'viem';
import {readAssetBalance} from './reward-asset.mjs';

const SPLIT_ABI = [
  { type: 'function', name: 'userBalances', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [
    { type: 'uint128' }, { type: 'uint128' },
  ] },
  { type: 'function', name: 'dispatch', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'sync', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'accountedWei', stateMutability: 'view', inputs: [], outputs: [{type:'uint256'}] },
  { type: 'function', name: 'marketQuoteBalance', stateMutability: 'view', inputs: [], outputs: [{type:'uint256'}] },
];

// Permissionless dispatch/sync; only actual treasury receipts fund rewards.
export async function dispatchFlapTax({ client, walletClient, tokenAddress, vaultAddress, broadcast = false }) {
  const blockNumber=await client.getBlockNumber();
  const snapshot={getChainId:()=>client.getChainId(),readContract:i=>client.readContract({...i,blockNumber}),
    getBytecode:i=>client.getBytecode({...i,blockNumber}),getBalance:i=>client.getBalance({...i,blockNumber})};
  const flap = await verifyFlapVault(snapshot, { tokenAddress, vaultAddress });
  const [balance,accounted]=await Promise.all([readAssetBalance(snapshot,vaultAddress,flap.rewardAsset,blockNumber),
    snapshot.readContract({address:vaultAddress,abi:SPLIT_ABI,functionName:'accountedWei'})]);
  if(typeof accounted!=='bigint'||balance<accounted)throw new Error('invalid_treasury_state');
  let target=vaultAddress.toLowerCase(),action='sync',pendingWei=balance-accounted;
  if(pendingWei===0n){
    action='dispatch';
    if(flap.route==='official-split-vault-100'){
      target=flap.flapVaultAddress;
      const [accumulated,claimed]=await snapshot.readContract({address:target,abi:SPLIT_ABI,functionName:'userBalances',args:[vaultAddress]});
      if(accumulated<claimed)throw new Error('flap_split_balance_invalid');pendingWei=accumulated-claimed;
    }else{
      target=flap.taxProcessor;
      pendingWei=await snapshot.readContract({address:target,abi:SPLIT_ABI,functionName:'marketQuoteBalance'});
    }
  }
  if(typeof pendingWei!=='bigint'||pendingWei<0n)throw new Error('invalid_pending_tax');
  const context={target,action,splitVault:flap.route==='official-split-vault-100'?flap.flapVaultAddress:null,
    vaultAddress:vaultAddress.toLowerCase(),pendingWei:String(pendingWei),rewardAsset:flap.rewardAsset,blockNumber:String(blockNumber)};
  if (pendingWei === 0n) return { status: 'nothing_pending',...context };
  if (!broadcast) return { status: 'ready',...context,
    chainId: 56, data: encodeFunctionData({ abi: SPLIT_ABI, functionName: action }), value: '0x0' };
  if (!walletClient?.account) throw new Error('relayer_wallet_required');
  const { request } = await client.simulateContract({ account: walletClient.account, address: target,
    abi: SPLIT_ABI, functionName: action });
  const hash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== 'success') throw new Error('flap_dispatch_failed');
  return { status: 'dispatched',...context,hash };
}
