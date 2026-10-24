import { encodeFunctionData } from 'viem';
import { validateDistributionManifest } from './reward-distributor.mjs';
import {assertRewardPeriod} from './reward-period.mjs';
import {verifyRewardSignature} from './reward-signature.mjs';
import {readRewardAsset} from './reward-asset.mjs';

const ABI = [
  ...['publisher'].map(name=>({type:'function',name,stateMutability:'view',inputs:[],outputs:[{type:'address'}]})),
  {type:'function',name:'rewardAccountingEnabled',stateMutability:'view',inputs:[],outputs:[{type:'bool'}]},
  {type:'function',name:'unallocatedByDayWei',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'publishAndClaim',stateMutability:'nonpayable',inputs:[{type:'uint256'},{type:'bytes32'},{type:'uint256'},{type:'bytes'},{type:'address'},{type:'uint256'},{type:'bytes32[]'}],outputs:[]},
  { type: 'function', name: 'CLAIM_WINDOW', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'epochs', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
    { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint64' },
  ] },
  { type: 'function', name: 'claimed', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'recoveredEpochWei', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claimFor', stateMutability: 'nonpayable', inputs: [
    { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes32[]' },
  ], outputs: [] },
];

// Produces transaction data only. The visitor's wallet sends it and pays gas.
export async function nextPublicPayout({ client, review,recipient=null }) {
  if (review?.status !== 'prepared_only' || !review.manifest) throw new Error('reward_manifest_required');
  const manifest = review.manifest;
  const total = validateDistributionManifest(manifest);
  if (await client.getChainId() !== 56) throw new Error('wrong_chain');
  const treasury = manifest.treasuryAddress;
  await assertRewardPeriod(client,treasury,manifest.periodSeconds??86400);
  const block=await client.getBlock({blockTag:'latest'});
  const read=(functionName,args=[])=>client.readContract({address:treasury,abi:ABI,functionName,args,...typeof block.number==='bigint'?{blockNumber:block.number}:{}});
  const code = await client.getBytecode({ address: treasury });
  if (!code || code === '0x') throw new Error('treasury_has_no_code');
  const day = BigInt(manifest.day);
  const epoch = await read('epochs',[day]);
  const now = BigInt(block.timestamp);
  if(/^0x0{64}$/.test(epoch[0])&&[60,1800].includes(manifest.periodSeconds)&&review.signature){
    const duration=BigInt(manifest.periodSeconds);
    const [publisher,enabled,available]=await Promise.all([
      read('publisher'),read('rewardAccountingEnabled'),read('unallocatedByDayWei',[day])]);
    if(!await verifyRewardSignature(manifest,review.signature,publisher))throw new Error('invalid_reward_signature');
    if(!enabled||available<total)return {status:'closed',day:manifest.day};
    if(now<(day+1n)*duration)return {status:'locked',day:manifest.day,unlockAt:String((day+1n)*duration)};
    if(now>=(day+1n)*duration+172800n)return {status:'expired',day:manifest.day};
    const claim=manifest.claims.find(c=>!recipient||c.wallet.toLowerCase()===recipient.toLowerCase());
    if(!claim)return {status:'none_for_wallet',day:manifest.day};
    const rewardAsset=await readRewardAsset(client,treasury,block.number);
    return {status:'ready',day:manifest.day,wallet:claim.wallet,amountWei:claim.amountWei,treasuryAddress:treasury,rewardAsset,
      periodSeconds:manifest.periodSeconds,publishes:true,data:encodeFunctionData({abi:ABI,functionName:'publishAndClaim',
       args:[day,manifest.root,total,review.signature,claim.wallet,BigInt(claim.amountWei),claim.proof]})};
  }
  if (epoch[0].toLowerCase() !== manifest.root.toLowerCase() || BigInt(epoch[1]) !== total ||
      BigInt(epoch[2]) > total) throw new Error('published_epoch_mismatch');
  if (now < BigInt(epoch[3])) return { status: 'locked', day: manifest.day, unlockAt: String(epoch[3]) };
  if (BigInt(epoch[2]) === total) {
    const recoveredWei = BigInt(await read('recoveredEpochWei',[day]));
    return { status: recoveredWei > 0n ? 'closed' : 'complete', day: manifest.day };
  }
  const claimWindow = BigInt(await read('CLAIM_WINDOW'));
  if (claimWindow <= 0n) throw new Error('invalid_claim_window');
  if (now >= BigInt(epoch[3]) + claimWindow && BigInt(epoch[2]) < total)
    return { status: 'expired', day: manifest.day };
  for (const claim of manifest.claims) {
    if(recipient&&claim.wallet.toLowerCase()!==recipient.toLowerCase())continue;
    const paid = await read('claimed',[day,claim.wallet]);
    if (paid) continue;
    const rewardAsset=await readRewardAsset(client,treasury,block.number);
    return { status: 'ready', day: manifest.day, wallet: claim.wallet,rewardAsset,
      amountWei: claim.amountWei, treasuryAddress: treasury,
      data: encodeFunctionData({ abi: ABI, functionName: 'claimFor',
        args: [day, claim.wallet, BigInt(claim.amountWei), claim.proof] }) };
  }
  return { status: recipient?'none_for_wallet':'complete', day: manifest.day };
}
