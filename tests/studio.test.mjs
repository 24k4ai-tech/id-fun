import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,encodeEventTopics,encodeAbiParameters,erc20Abi} from 'viem';
import {openDatabase} from '../server/db.mjs';
import {createResident} from '../server/game.mjs';
import {createInvoice,recordPayment,ownerJob,saveAppearance} from '../server/studio-store.mjs';
import {verifyStudioPayment} from '../server/studio-payment.mjs';
import {createStudioService} from '../server/studio-service.mjs';
import {startStudioWorker} from '../server/studio-worker.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const wallet='0x1111111111111111111111111111111111111111',rival='0x2222222222222222222222222222222222222222',token='0x3333333333333333333333333333333333333333',recipient='0x4444444444444444444444444444444444444444';
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),when=1_700_000_000_000;
const settings={enabled:true,token,recipient,decimals:18};
function dbWithPlayers(){const db=openDatabase(':memory:');createResident(db,{wallet,handle:'one.ai'});createResident(db,{wallet:rival,handle:'two.ai'});return db;}
const input={kind:'character',prompt:'A silver haired warrior with a gold coat'};
function rpc(invoice,overrides={}){
 const amount=BigInt(invoice.raw_amount),log={address:token,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:wallet,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[amount])};
 return {getChainId:async()=>56,getTransaction:async()=>({from:wallet,to:token,input:encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[recipient,amount]})}),
   getTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:100n,blockHash,logs:[log]}),getBlockNumber:async()=>106n,getBlock:async()=>({hash:blockHash,timestamp:BigInt(when/1000+10)}),...overrides};
}
test('studio verifies successful BSC transfer, amount, sender, token, confirmation and invoice time',async()=>{
 const db=dbWithPlayers(),invoice=createInvoice(db,wallet,input,settings,when),row=ownerJob(db,wallet,invoice.id),client=rpc(row);
 assert.equal((await verifyStudioPayment(client,row,hash)).received,row.raw_amount);
 await assert.rejects(()=>verifyStudioPayment({...client,getChainId:async()=>1},row,hash),/wrong_chain/);
 await assert.rejects(()=>verifyStudioPayment({...client,getBlockNumber:async()=>102n},row,hash),/confirming/);
 await assert.rejects(()=>verifyStudioPayment({...client,getTransaction:async()=>({...await client.getTransaction(),from:rival})},row,hash),/invalid_payment/);
 await assert.rejects(()=>verifyStudioPayment({...client,getTransaction:async()=>({...await client.getTransaction(),to:recipient})},row,hash),/invalid_payment/);
 await assert.rejects(()=>verifyStudioPayment({...client,getTransactionReceipt:async()=>({...await client.getTransactionReceipt(),status:'reverted'})},row,hash),/invalid_payment/);
 await assert.rejects(()=>verifyStudioPayment({...client,getBlock:async()=>({hash:blockHash,timestamp:BigInt(when/1000-10)})},row,hash),/outside_invoice/);
 await assert.rejects(()=>verifyStudioPayment({...client,getTransactionReceipt:async()=>({...await client.getTransactionReceipt(),logs:[]})},row,hash),/invalid_payment/);
 db.close();
});
test('one payment buys only one asset and the queue is idempotent under duplicate verification',()=>{
 const db=dbWithPlayers(),a=createInvoice(db,wallet,input,settings,when),b=createInvoice(db,rival,input,settings,when);
 const payment={hash,block:'100',received:'100'};assert.equal(recordPayment(db,wallet,a.id,payment).state,'queued');assert.equal(recordPayment(db,wallet,a.id,payment).state,'queued');
 assert.throws(()=>recordPayment(db,rival,b.id,payment),/payment_used/);assert.throws(()=>ownerJob(db,rival,a.id),/not_found/);
 assert.throws(()=>createInvoice(db,wallet,input,settings,when),/job_pending/);db.close();
});
test('studio rejects demo purchases, foreign uploads and invalid appearance without changing combat stats',()=>{
 const db=dbWithPlayers();createResident(db,{wallet:'demo-user',handle:'guest',isDemo:true});
 assert.throws(()=>createInvoice(db,'demo-user',input,settings,when),/wallet_required/);
 assert.throws(()=>createInvoice(db,wallet,{...input,referenceId:'not-owned'},settings,when),/not_found/);
 assert.throws(()=>saveAppearance(db,wallet,{height:99}),/invalid_appearance/);
 const before=db.prepare('SELECT * FROM residents WHERE wallet=?').get(wallet);saveAppearance(db,wallet,{height:1.1,build:.9,head:1,tint:'cool'});assert.deepEqual(db.prepare('SELECT * FROM residents WHERE wallet=?').get(wallet),before);
 assert.throws(()=>createInvoice(db,wallet,input,{...settings,enabled:false},when),/not_live/);db.close();
});
test('uncertain provider submission is held for review and is never resubmitted on restart',async()=>{
 const db=dbWithPlayers(),dir=await mkdtemp(join(tmpdir(),'idfun-studio-'));const a=createInvoice(db,wallet,input,settings,when);recordPayment(db,wallet,a.id,{hash,block:'100',received:'1'});
 let posts=0;const provider={hasBalance:async()=>true,image:async()=>{posts++;throw new Error('network interrupted');}};
 const worker=startStudioWorker(db,{enabled:true,dir,dailyUsd:2},{provider,now:()=>when+10000});
 try{await worker.tick();worker();assert.equal(posts,1);assert.equal(ownerJob(db,wallet,a.id).state,'needs_review');const again=startStudioWorker(db,{enabled:true,dir,dailyUsd:2},{provider,now:()=>when+100000});await again.tick();again();assert.equal(posts,1);
 assert.equal(db.prepare('SELECT sum(amount) AS n FROM studio_spend').get().n,.6);
 }finally{worker();db.close();await removeTestDir(dir);}
});
test('empty AI budget keeps paid orders queued and does not call image generation',async()=>{
 const db=dbWithPlayers(),dir=await mkdtemp(join(tmpdir(),'idfun-studio-'));const a=createInvoice(db,wallet,input,settings,when);recordPayment(db,wallet,a.id,{hash,block:'100',received:'1'});let posts=0;
 const worker=startStudioWorker(db,{enabled:true,dir,dailyUsd:0},{provider:{image:async()=>{posts++;}},now:()=>when+10000});
 try{await worker.tick();assert.equal(posts,0);assert.equal(ownerJob(db,wallet,a.id).state,'queued');assert.equal(ownerJob(db,wallet,a.id).error_code,'waiting_for_ai_budget');}finally{worker();db.close();await removeTestDir(dir);}
});
import {createApp} from '../server/index.mjs';
import {privateKeyToAccount} from 'viem/accounts';
import sharp from 'sharp';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {validateGlb} from '../server/studio-provider.mjs';
import {CHARACTERS} from '../public/character-manifest.js';
import {createHash} from 'node:crypto';

async function removeTestDir(dir){const full=resolve(dir),base=resolve(tmpdir());assert.equal(dirname(full),base);assert.match(full.slice(base.length+1),/^idfun-studio-/);await rm(full,{recursive:true,force:true});}

test('private uploads require an owner session; agent keys cannot upload or equip; public portrait requires explicit equipment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'idfun-studio-'));
 const config={port:0,origin:'http://127.0.0.1:3200',roundMs:120000,dbPath:':memory:',demoMode:true,aiApiKey:null,studio:{dir}};
 const {server,db}=createApp(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
 try{
 const account=privateKeyToAccount('0x'+'66'.repeat(32));const c=await (await post('/api/auth/challenge',{address:account.address})).json();const auth=await post('/api/auth/verify',{nonce:c.nonce,signature:await account.signMessage({message:c.message})});const cookie=auth.headers.get('set-cookie').split(';')[0];
 const png=await sharp({create:{width:10,height:10,channels:3,background:'#ddbb33'}}).png().toBuffer();
 const upload=(headers,body=png)=>fetch(base+'/api/studio/upload',{method:'POST',headers:{Origin:config.origin,'Content-Type':'image/png',...headers},body});
 assert.equal((await upload({})).status,401);
 const key=await (await post('/api/agent-key',{},cookie)).json();assert.equal((await upload({Authorization:'Bearer '+key.key})).status,401);
 assert.equal((await upload({Cookie:cookie,Origin:'https://evil.example'})).status,403);
 assert.equal((await upload({Cookie:cookie},Buffer.from('<svg onload=evil()>'))).status,400);
 const result=await upload({Cookie:cookie});assert.equal(result.status,201);const asset=await result.json();
 assert.equal((await fetch(base+asset.url)).status,401);assert.equal((await fetch(base+asset.url,{headers:{Cookie:cookie}})).status,200);
 const publicPath='/creations/portraits/'+asset.id+'.jpg';assert.equal((await fetch(base+publicPath)).status,404);
 assert.equal((await post('/api/studio/equip',{type:'portrait',id:asset.id},cookie)).status,200);
 const publicImage=await fetch(base+publicPath);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/jpeg');
 assert.equal((await post('/api/studio/invoice',input,cookie)).status,409);
 }finally{await new Promise(r=>server.close(r));db.close();await removeTestDir(dir);}
});

test('paid character order completes durable provider stages, validates its model and can be equipped only by its owner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'idfun-studio-')),db=dbWithPlayers(),a=createInvoice(db,wallet,input,settings,when);recordPayment(db,wallet,a.id,{hash,block:'100',received:'1'});
 let now=when+10000,submits=[];
 const doc={asset:{version:'2.0'},buffers:[{byteLength:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:0}]}],accessors:[{count:60}]};let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+j.length,8);header.writeUInt32LE(j.length,12);header.write('JSON',16);const minimal=Buffer.concat([header,j]);
 const provider={hasBalance:async()=>true,image:async()=>{submits.push('image');return{requestId:'image'};},imageStatus:async()=>({state:'completed',url:'mock:image'}),saveImage:async(_,p)=>sharp({create:{width:16,height:16,channels:3,background:'#888'}}).png().toFile(p),mesh:async()=>{submits.push('mesh');return{taskId:'mesh'};},rig:async()=>{submits.push('rig');return{taskId:'rig'};},taskStatus:async()=>({state:'completed',url:'mock:model'}),saveModel:async(_,p)=>writeFile(p,minimal)};
 const runTool=async(name,args)=>{if(name==='retarget.mjs'){await writeFile(join(dir,'jobs',a.id,a.id+'-animation-report.json'),JSON.stringify({scale:1.8,lift:.9}));return;}const out=args[1];if(out.endsWith('model.tmp.glb'))await copyFile('public/models/ember-v2.glb',out);else await writeFile(out,minimal);};
 const worker=startStudioWorker(db,{enabled:true,dir,dailyUsd:2},{provider,runTool,now:()=>now});
 try{for(let i=0;i<8;i++){await worker.tick();now+=10000;}assert.equal(ownerJob(db,wallet,a.id).state,'ready');assert.deepEqual(submits,['image','mesh','rig']);assert.equal(db.prepare('SELECT sum(amount) AS n FROM studio_spend').get().n,.6);
 const service=createStudioService(db,{dbPath:':memory:',studio:{dir}},null);assert.throws(()=>service.equip(rival,{type:'character',id:a.id}),/not_found/);assert.match(service.equip(wallet,{type:'character',id:a.id}).character.file,/model.glb$/);assert.equal(service.equip(wallet,{type:'character',id:null}).character,undefined);
 }finally{worker();db.close();await removeTestDir(dir);}
});

test('published character geometry, version hashes, skeletons, animations and hand sockets are all complete',async()=>{
 for(const [id,spec] of Object.entries(CHARACTERS)){const bytes=await readFile('public/models/'+spec.file);assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0,12),spec.revision,id);const doc=validateGlb(bytes,800000,true);assert.equal(doc.animations.length,11,id);assert.ok(spec.scale>0&&Number.isFinite(spec.lift),id);}
});


import {recordStudioRefund} from '../server/studio-refund.mjs';
test('refund confirmation requires the original recipient to return the exact order amount to its owner',async()=>{
 const db=dbWithPlayers(),a=createInvoice(db,wallet,input,settings,when);recordPayment(db,wallet,a.id,{hash,block:'100',received:'1'});db.prepare("UPDATE studio_jobs SET state='refund_requested' WHERE id=?").run(a.id);
 const row=ownerJob(db,wallet,a.id),refundHash='0x'+'c'.repeat(64),client=rpc(row);const amount=BigInt(row.raw_amount);
 client.getTransaction=async()=>({from:recipient,to:token,input:encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[wallet,amount]})});
 client.getTransactionReceipt=async()=>({status:'success',transactionHash:refundHash,blockNumber:100n,blockHash,logs:[{address:token,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:recipient,to:wallet}}),data:encodeAbiParameters([{type:'uint256'}],[amount])}]});
 try{await assert.rejects(()=>recordStudioRefund(db,{...client,getTransaction:async()=>({...await client.getTransaction(),from:rival})},a.id,refundHash,0,when+20000),/invalid_payment/);assert.equal(ownerJob(db,wallet,a.id).state,'refund_requested');assert.equal((await recordStudioRefund(db,client,a.id,refundHash,0,when+20000)).state,'refunded');assert.equal((await recordStudioRefund(db,client,a.id,refundHash,0,when+20000)).hash,refundHash);}finally{db.close();}
});
test('a refund requested during an async provider balance check prevents generation and spending',async()=>{
 const db=dbWithPlayers(),dir=await mkdtemp(join(tmpdir(),'idfun-studio-')),a=createInvoice(db,wallet,input,settings,when);recordPayment(db,wallet,a.id,{hash,block:'100',received:'1'});let posts=0;
 const provider={hasBalance:async()=>{db.prepare("UPDATE studio_jobs SET state='refund_requested' WHERE id=?").run(a.id);return true;},image:async()=>{posts++;}};
 const worker=startStudioWorker(db,{enabled:true,dir,dailyUsd:2},{provider,now:()=>when+10000});try{await worker.tick();assert.equal(ownerJob(db,wallet,a.id).state,'refund_requested');assert.equal(posts,0);assert.equal(db.prepare('SELECT count(*) AS n FROM studio_spend').get().n,0);}finally{worker();db.close();await removeTestDir(dir);}
});
