import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {nextPublicPayout} from './public-distribution.mjs';
import {encodeFunctionData} from 'viem';
const batchAbi=[{type:'function',name:'publishAndClaimBatch',stateMutability:'nonpayable',inputs:[{name:'requests',type:'tuple[]',components:[
 {name:'epoch',type:'uint256'},{name:'root',type:'bytes32'},{name:'totalWei',type:'uint256'},{name:'signature',type:'bytes'},
 {name:'wallet',type:'address'},{name:'amountWei',type:'uint256'},{name:'proof',type:'bytes32[]'}]}],outputs:[]}];
export async function rewardCatalog(config,db=null,recipient=null){
 const paths=[];if(config.publicRewardManifestPath)paths.push(config.publicRewardManifestPath);
 if(config.rewardManifestDir){const files=await readdir(config.rewardManifestDir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  paths.push(...files.filter(n=>/^epoch-\d+\.json$/.test(n)).sort((a,b)=>Number(b.slice(6,-5))-Number(a.slice(6,-5))).slice(0,100).map(n=>join(config.rewardManifestDir,n)));}
 const packages=db?db.prepare(`SELECT package_json FROM reward_batches WHERE status='ready' AND epoch*60000>=? ${recipient?"AND EXISTS(SELECT 1 FROM json_each(package_json,'$.manifest.claims') WHERE lower(json_extract(value,'$.wallet'))=?)":''} ORDER BY epoch`).all(Date.now()-4*86400000,...recipient?[recipient.toLowerCase()]:[]).map(r=>JSON.parse(r.package_json)):[];
 for(const path of paths){const p=JSON.parse(await readFile(path,'utf8'));if(p.manifest){
   if(config.rewardTreasuryAddress&&p.manifest.treasuryAddress.toLowerCase()!==config.rewardTreasuryAddress.toLowerCase())throw new Error('catalog_treasury_mismatch');
   if(!packages.some(v=>v.manifest.root===p.manifest.root&&v.manifest.day===p.manifest.day))packages.push(p);
 }}
 for(const p of packages){
  if(config.rewardTreasuryAddress&&p.manifest.treasuryAddress?.toLowerCase()!==config.rewardTreasuryAddress.toLowerCase())throw new Error('catalog_treasury_mismatch');
  if(p.manifest.chainId!==56)throw new Error('catalog_chain_mismatch');
 }
 return packages.sort((a,b)=>a.manifest.day*(a.manifest.periodSeconds??86400)-b.manifest.day*(b.manifest.periodSeconds??86400));
}
const closed=new Set();
export async function nextCatalogPayout(client,packages,recipient=null){let last={status:'not_live'},first=null;const batch=[];
 for(const review of packages){if(recipient&&!review.manifest.claims.some(c=>c.wallet.toLowerCase()===recipient.toLowerCase()))continue;
  const key=review.manifest.root+':'+(recipient||'*');if(closed.has(key))continue;
  const result=await nextPublicPayout({client,review,recipient});if(result.status==='ready'){
   if(!recipient||review.manifest.periodSeconds!==60||!review.signature)return result;
   const m=review.manifest,claim=m.claims.find(c=>c.wallet.toLowerCase()===recipient.toLowerCase());first??=result;
   batch.push({epoch:BigInt(m.day),root:m.root,totalWei:BigInt(m.totalWei),signature:review.signature,wallet:claim.wallet,amountWei:BigInt(claim.amountWei),proof:claim.proof});
   if(batch.length>=8)break;continue;
  }last=result;
  if(['complete','expired','closed','none_for_wallet'].includes(result.status)){closed.add(key);if(closed.size>30000)closed.delete(closed.values().next().value);}
 }if(batch.length)return {...first,batchCount:batch.length,amountWei:String(batch.reduce((n,r)=>n+r.amountWei,0n)),data:encodeFunctionData({abi:batchAbi,functionName:'publishAndClaimBatch',args:[batch]})};
 return packages.length&&last.status==='not_live'?{status:recipient?'none_for_wallet':'complete'}:last;
}
