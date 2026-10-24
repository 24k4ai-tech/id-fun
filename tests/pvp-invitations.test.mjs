import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {openDatabase} from '../server/db.mjs';
import {createResident} from '../server/game.mjs';
import {createApp} from '../server/index.mjs';
import {createChallenge,receiveChallenge,resolveChallenge,pvpLobby} from '../server/pvp.mjs';
const start=1_000_000;
function fixture(){const db=openDatabase(':memory:');for(const [wallet,handle] of [['a','alpha.ai'],['b','beta.ai'],['c','gamma.ai']])createResident(db,{wallet,handle,verifiedAi:true},start);return db;}

test('an invitation remains undelivered until its authenticated recipient acknowledges it',()=>{
 const db=fixture();try{
  const invite=createChallenge(db,'a','  BeTa.AI  ',start);
  assert.equal(invite.targetWallet,'b');assert.equal(pvpLobby(db,'b',start+1).invitations[0].id,invite.id);
  assert.equal(pvpLobby(db,'a',start+2).outgoing[0].received_at,null);
  assert.throws(()=>receiveChallenge(db,'a',invite.id,start+3),/unauthorized/);
  assert.throws(()=>receiveChallenge(db,'c',invite.id,start+3),/unauthorized/);
  assert.equal(receiveChallenge(db,'b',invite.id,start+4).receivedAt,start+4);
  assert.equal(receiveChallenge(db,'b',invite.id,start+5).receivedAt,start+4);
  const outgoing=pvpLobby(db,'a',start+6).outgoing[0];assert.equal(outgoing.status,'pending');assert.equal(outgoing.received_at,start+4);
 }finally{db.close();}
});

test('declined and expired invitations remain visible and cannot start a match',()=>{
 const db=fixture();try{
  const first=createChallenge(db,'a','beta.ai',start);resolveChallenge(db,'b',first.id,'decline',start+1);
  assert.equal(pvpLobby(db,'a',start+2).outgoing[0].status,'declined');assert.throws(()=>resolveChallenge(db,'b',first.id,'accept',start+3),/pvp_challenge_unavailable/);
  const second=createChallenge(db,'a','beta.ai',start+4),now=second.expiresAt;
  assert.equal(receiveChallenge(db,'b',second.id,now).status,'expired');assert.equal(pvpLobby(db,'b',now).invitations.length,0);
  assert.equal(pvpLobby(db,'a',now).outgoing[0].status,'expired');assert.throws(()=>resolveChallenge(db,'b',second.id,'accept',now),/pvp_challenge_unavailable/);
 }finally{db.close();}
});

test('accepting creates one shared match and duplicate or reverse invitations cannot create another',()=>{
 const db=fixture();try{
  const invite=createChallenge(db,'a','beta.ai',start);
  assert.throws(()=>createChallenge(db,'b','alpha.ai',start+1),/pvp_challenge_pending/);
  assert.throws(()=>resolveChallenge(db,'c',invite.id,'accept',start+2),/unauthorized/);
  const accepted=resolveChallenge(db,'b',invite.id,'accept',start+3);
  assert.equal(pvpLobby(db,'a',start+4).match.id,accepted.match.id);assert.equal(pvpLobby(db,'b',start+4).match.id,accepted.match.id);
  assert.equal(pvpLobby(db,'a',start+4).outgoing[0].status,'accepted');assert.equal(pvpLobby(db,'a',start+4).outgoing[0].received_at,start+3);
  assert.throws(()=>resolveChallenge(db,'b',invite.id,'accept',start+5),/pvp_challenge_unavailable/);
  assert.equal(db.prepare('SELECT count(*) n FROM pvp_matches').get().n,1);
  assert.throws(()=>createChallenge(db,'c','never-joined.ai',start+6),/pvp_target_not_found/);
 }finally{db.close();}
});

test('two signed HTTP sessions bind names, deliver a receipt, accept, and observe the same PVP state',async()=>{
 const accounts=['11','22'].map(part=>privateKeyToAccount('0x'+part.repeat(32)));
 const config={port:0,origin:'http://127.0.0.1:3202',roundMs:120000,dbPath:':memory:',demoMode:false,
  rpcUrl:'http://127.0.0.1:1',agentRegistry:null,aiApiKey:null,aiAllowDemo:false,
  agentIdFetcher:async url=>({ok:true,json:async()=>({code:0,address:accounts[new URL(url).searchParams.get('domain')==='alpha.ai'?0:1].address})})};
 const {server,db}=createApp(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,cookie='')=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const cookies=[];
  for(const [i,account] of accounts.entries()){
   const challenge=await request('/api/auth/challenge',{address:account.address});
   const login=await request('/api/auth/verify',{nonce:challenge.data.nonce,signature:await account.signMessage({message:challenge.data.message})});
   assert.equal(login.status,200);cookies.push(login.cookie);
   assert.equal((await request('/api/agent-id/claim',{name:i===0?'alpha.ai':'beta.ai'},login.cookie)).status,200);
  }
  const created=await request('/api/pvp/challenge',{target:'BETA.AI'},cookies[0]);assert.equal(created.status,200);const id=created.data.challenge.id;
  assert.equal((await request('/api/pvp/challenge/received',{id})).status,401);
  assert.equal((await request('/api/pvp/challenge/received',{id},cookies[0])).status,401);
  assert.equal((await request('/api/pvp/lobby',null,cookies[1])).data.invitations[0].id,id);
  assert.equal((await request('/api/pvp/lobby',null,cookies[0])).data.outgoing[0].received_at,null);
  assert.equal((await request('/api/pvp/challenge/received',{id},cookies[1])).status,200);
  assert.ok((await request('/api/pvp/lobby',null,cookies[0])).data.outgoing[0].received_at>0);
  const accepted=await request('/api/pvp/challenge/respond',{id,decision:'accept'},cookies[1]);assert.equal(accepted.status,200);
  const states=await Promise.all(cookies.map(cookie=>request('/api/pvp/state',null,cookie)));
  assert.equal(states[0].data.battle.id,states[1].data.battle.id);assert.equal(states[0].data.battle.id,accepted.data.match.id);
  assert.equal(states[0].data.battle.opponentName,'beta.ai');assert.equal(states[1].data.battle.opponentName,'alpha.ai');
  const cast=await request('/api/pvp/command',{command:'spell'},cookies[0]);assert.equal(cast.status,200);
  assert.equal((await request('/api/pvp/state',null,cookies[1])).data.battle.enemyCast.kind,cast.data.battle.playerCast.kind);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
