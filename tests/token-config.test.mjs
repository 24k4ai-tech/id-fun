import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

test('public launch config follows the configured token and exposes no signing credentials',async()=>{
 for(const gameTokenAddress of [null,'0x83D655Df2047C3Ac16232dBc1aE4a76A85167777']){
  const treasury='0x79Ff343a340d044901c4A710CbE3A92AE73dad84';
  const config={port:0,origin:'http://127.0.0.1:3200',roundMs:120000,dbPath:':memory:',demoMode:true,
   gameTokenAddress,rewardTreasuryAddress:treasury,rewardAutoEnabled:false,rpcUrl:'http://127.0.0.1:1',
   rewardPublisherKey:'secret-publisher',aiApiKey:'secret-ai',aiModel:'test',storyCooldownMs:90000};
  const {server,db}=createApp(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const text=await (await fetch(`http://127.0.0.1:${server.address().port}/api/config`)).text(),body=JSON.parse(text);
   assert.equal(body.tokenLive,Boolean(gameTokenAddress));assert.equal(body.tokenAddress,gameTokenAddress);assert.equal(body.treasuryAddress,treasury);assert.equal(body.chainId,56);
   assert.ok(!text.includes('secret-'));assert.equal(body.scorePolicy.manualBps,5000);
  }finally{await new Promise(r=>server.close(r));db.close()}
 }
});
