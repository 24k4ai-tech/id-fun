import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {simulateTaxPayout} from '../simulations/tax-payout.mjs';
test('public allocator requires an explicit external pool and conserves arbitrary budgets',()=>{
 const input={receivedWei:11n,operatingWallet:'0x'+'1'.repeat(40),agents:[]};
 assert.throws(()=>simulateTaxPayout(input),/external_pool_required/);
 const result=simulateTaxPayout({...input,actualPlayerWei:8n,actualOperationsWei:3n});
 assert.equal(result.heldPlayerWei,8n);assert.equal(result.operatingWei,3n);
 assert.throws(()=>simulateTaxPayout({...input,actualPlayerWei:12n,actualOperationsWei:0n}),/invalid_actual_split/);
});
test('local game serves player reward APIs but has no DEV withdrawal route',async()=>{
 const app=createApp({port:0,origin:'http://127.0.0.1:3200',roundMs:120000,dbPath:':memory:',demoMode:true,aiApiKey:null,aiModel:'test'});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  assert.equal((await fetch(base+'/api/rewards/next').then(r=>r.json())).status,'not_live');
  assert.equal((await fetch(base+'/api/treasury/status')).status,405);
  assert.equal((await fetch(base+'/creator-fees-ui.js')).status,404);
  assert.equal((await fetch(base+'/api/config').then(r=>r.json())).tokenLive,false);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
