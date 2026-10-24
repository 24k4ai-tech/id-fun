import {encodeAbiParameters,keccak256,recoverMessageAddress} from 'viem';
export function rewardDigest(m){return keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'},{type:'bytes32'},{type:'uint256'}],
 [BigInt(m.chainId),m.treasuryAddress,BigInt(m.day),m.root,BigInt(m.totalWei)]));}
export async function signRewardManifest(account,manifest){if(![60,1800].includes(manifest.periodSeconds))throw new Error('fast_manifest_required');return account.signMessage({message:{raw:rewardDigest(manifest)}});}
export async function verifyRewardSignature(manifest,signature,publisher){return (await recoverMessageAddress({message:{raw:rewardDigest(manifest)},signature})).toLowerCase()===publisher.toLowerCase();}
