import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db.mjs';
import {createAuth} from '../server/auth.mjs';
import {privateKeyToAccount} from 'viem/accounts';

test('Agent EIP712 entry rejects wrong signer/domain, expired and replayed challenges, mismatched ID and reused codes',async()=>{
 const db=openDatabase(':memory:'),a=privateKeyToAccount('0x'+'71'.repeat(32)),b=privateKeyToAccount('0x'+'72'.repeat(32));
 let resolved=a.address;
 const auth=createAuth(db,{origin:'https://agentfun.pro',rpcUrl:'http://127.0.0.1:1',agentIdFetcher:async()=>({ok:true,json:async()=>({code:0,address:resolved})})});
 const payload=async(signer=a,change=undefined)=>{
  const c=auth.typedChallenge(a.address);return {nonce:c.nonce,signature:await signer.signTypedData(change?change(c.typedData):c.typedData),name:'entry.ai'};
 };
 try{
  await assert.rejects(auth.verifyTyped(await payload(b)),/bad_signature/);
  await assert.rejects(auth.verifyTyped(await payload(a,t=>({...t,domain:{...t.domain,chainId:97}}))),/bad_signature/);
  const expired=await payload();db.prepare('UPDATE nonces SET expires_at=0 WHERE nonce=?').run(expired.nonce);
  await assert.rejects(auth.verifyTyped(expired),/challenge_expired/);
  const mismatched=await payload();resolved=b.address;await assert.rejects(auth.verifyTyped(mismatched),/wallet_mismatch/);resolved=a.address;
  const valid=await payload();const signed=await auth.verifyTyped(valid);
  await assert.rejects(auth.verifyTyped(valid),/challenge_expired/);
  assert.equal(auth.walletFromAgentKey(signed.key),a.address);
  assert.equal(auth.redeemViewerCode(signed.viewerCode).wallet,a.address);
  assert.throws(()=>auth.redeemViewerCode(signed.viewerCode),/viewer_code_invalid/);
  db.prepare('UPDATE agent_keys SET expires_at=0').run();assert.equal(auth.walletFromAgentKey(signed.key),null);
  assert.equal(db.prepare('SELECT count(*) n FROM activity_rewards').get().n,0);
 }finally{db.close();}
});
