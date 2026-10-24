import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,decodeFunctionData,parseAbi} from 'viem';
import {readRewardAsset,readAssetBalance,BSC_U,FLAP_GUARDIAN} from '../server/reward-asset.mjs';
import {verifyFlapVault} from '../server/flap-vault.mjs';
import {dispatchFlapTax} from '../server/flap-tax-dispatch.mjs';
import {readRewardBalance} from '../server/reward-estimate.mjs';
import {assetAmount} from '../public/reward-overview.js';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),unit=10n**18n;
function fixture(){
 const values={rewardAsset:BSC_U,symbol:'U',decimals:18,guardian:FLAP_GUARDIAN,getAdmins:[addr(9),addr(10)],operations:addr(9),
  operationsWei:15n*unit/10n,playerLiabilityWei:35n*unit/10n,accountedWei:5n*unit,balanceOf:5n*unit,
  unallocatedPlayerWei:35n*unit/10n,unallocatedByDayWei:35n*unit/10n,recoveredEpochWei:0n,
  rewardAccountingEnabled:true,playerWithdrawalRenounced:false,CLAIM_WINDOW:172800n,EPOCH_SECONDS:60n,
  epochs:['0x'+'0'.repeat(64),0n,0n,0n],taxProcessor:addr(61),marketAddress:addr(50),getQuoteToken:BSC_U,
  tryGetVault:[true,{vault:addr(50),vaultFactory:addr(51),description:'ID FUN U',isOfficial:false,riskLevel:1}],
  vaultQuoteToken:BSC_U,vaultSpecVersion:'v3',taxToken:addr(40),factory:addr(51),marketQuoteBalance:2n*unit};
 const calls=[];
 const rpc={getChainId:async()=>56,getBytecode:async()=>'0x6000',getBlockNumber:async()=>123n,
  getBlock:async()=>({number:123n,timestamp:BigInt(Math.floor(Date.now()/1000))}),
  getBalance:async()=>{throw new Error('must_read_U_balance_not_BNB');},
  readContract:async i=>{calls.push(i);if(!(i.functionName in values))throw new Error('missing_fixture_'+i.functionName);return values[i.functionName];}};
 return {values,rpc,calls};
}
test('U estimates use actual token balances at a pinned block',async()=>{
 const {values,rpc,calls}=fixture();
 const snap=await readRewardBalance(rpc,addr(50));assert.deepEqual(snap.rewardAsset,{address:BSC_U,symbol:'U',decimals:18});
 assert.equal(snap.balanceWei,String(5n*unit));assert.equal(snap.operationsWei,String(15n*unit/10n));
 assert.ok(calls.filter(c=>c.functionName!=='EPOCH_SECONDS').every(c=>c.blockNumber===123n));
 values.balanceOf=5n*unit-1n;await assert.rejects(readRewardBalance(rpc,addr(50)),/invalid_treasury_state/);
});
test('Flap U route requires matching quote, tax token, factory and V3 metadata',async()=>{
 const {values,rpc}=fixture();const input={tokenAddress:addr(40),vaultAddress:addr(50)};
 assert.equal((await verifyFlapVault(rpc,input)).route,'vaultportal');
 for(const [key,bad] of [['getQuoteToken',zeroAddress],['vaultQuoteToken',addr(6)],['taxToken',addr(7)],['factory',addr(8)],['vaultSpecVersion','v2']]){
  const prev=values[key];values[key]=bad;await assert.rejects(verifyFlapVault(rpc,input),/flap_vault_mismatch/);values[key]=prev;
 }
});
test('U dispatch selects only verified processor; missed pings offer a separate zero-value sync',async()=>{
 const {values,rpc,calls}=fixture();const opts={client:rpc,tokenAddress:addr(40),vaultAddress:addr(50)};
 let result=await dispatchFlapTax(opts);assert.equal(result.action,'dispatch');assert.equal(result.target,addr(61));assert.equal(result.pendingWei,String(2n*unit));
 assert.equal(result.rewardAsset.symbol,'U');assert.equal(result.data,'0xe9c4a3ac');assert.equal(result.value,'0x0');
 values.balanceOf=6n*unit;result=await dispatchFlapTax(opts);assert.equal(result.action,'sync');assert.equal(result.target,addr(50));assert.equal(result.pendingWei,String(unit));
 assert.equal(decodeFunctionData({abi:parseAbi(['function sync()']),data:result.data}).functionName,'sync');
 values.accountedWei=6n*unit;values.marketQuoteBalance=0n;assert.equal((await dispatchFlapTax(opts)).status,'nothing_pending');
 assert.ok(calls.every(c=>c.blockNumber===123n));
});
test('asset metadata failures stop processing and small amounts never display as BNB',async()=>{
 const {rpc,values}=fixture();assert.equal(assetAmount(175n*unit/1000n,{symbol:'U',decimals:18}),'0.175000 U');
 assert.equal(assetAmount(1n,{symbol:'U',decimals:18}),'<0.000001 U');assert.equal(assetAmount(1n,{symbol:'U',decimals:0}),'1 U');
 values.decimals=255;await assert.rejects(readRewardAsset(rpc,addr(50),123n),/invalid_reward_asset/);
 values.decimals=18;values.symbol='<script>';await assert.rejects(readRewardAsset(rpc,addr(50),123n),/invalid_reward_asset/);
 values.balanceOf=-1n;await assert.rejects(readAssetBalance(rpc,addr(50),{address:BSC_U},123n),/invalid_reward_balance/);
});
