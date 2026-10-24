import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {createApp} from '../server/index.mjs';
import {remoteStep} from '../public/remote-motion.js';
import {CITY_PLACES} from '../public/city-places.js';

test('signed Agent pairing, viewer, controller handover, gameplay and revocation stay isolated',async()=>{
  const account=privateKeyToAccount('0x'+'62'.repeat(32));
  const config={port:0,origin:'http://127.0.0.1:3200',roundMs:120000,dbPath:':memory:',demoMode:true,rpcUrl:'http://127.0.0.1:1',
    agentIdFetcher:async()=>({ok:true,json:async()=>({code:0,address:account.address})})};
  const {server,db}=createApp(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='',key='';
  async function call(path,body,agent=false,extra={}){
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(agent?{Authorization:'Bearer '+key}:{Origin:config.origin,Cookie:cookie}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  try{
    const pair=await call('/api/auth/pair/start',{});
    const challenge=await call('/api/auth/typed-challenge',{address:account.address,pairCode:pair.data.code});
    const signature=await account.signTypedData(challenge.data.typedData);
    const signed=await call('/api/auth/typed-verify',{nonce:challenge.data.nonce,signature,name:'viewer.ai'});
    assert.equal(signed.status,200);key=signed.data.key;
    const paired=await call('/api/auth/pair/complete',{code:pair.data.code});cookie=paired.cookie;assert.equal(paired.status,200);
    assert.equal((await call('/api/auth/pair/complete',{code:pair.data.code})).status,409);
    let control=(await call('/api/control')).data;assert.equal(control.mode,'agent');
    const world=(await call('/api/state')).data;assert.equal(world.me.handle,'viewer.ai');assert.equal(world.me.control.mode,'agent');
    assert.equal(JSON.stringify(world).includes(key),false);
    await call('/api/journey',undefined,true);
    const p=CITY_PLACES.market;db.prepare('UPDATE journey_profiles SET x=?,z=? WHERE wallet=?').run(p.x,p.z,account.address);
    assert.equal((await call('/api/city-life/enter',{id:'market'},true)).status,200);
    assert.equal((await call('/api/city-life/exit',{})).data.error,'control_paused');
    assert.equal((await call('/api/city-life')).data.visit.building,'market');
    await call('/api/battle/start',{opponentId:'cz'},true);
    const cast=await call('/api/battle/command',{command:'spell'},true);assert.equal(cast.status,200);
    const watched=(await call('/api/battle/state')).data.battle;
    assert.equal(watched.playerCommand.kind,'spell');assert.equal(watched.playerCommand.at,cast.data.battle.playerCommand.at);
    for(const path of ['/api/journey/move','/api/journey/command','/api/action','/api/arena-signal','/api/battle/start','/api/battle/command','/api/pvp/challenge','/api/pvp/challenge/respond','/api/pvp/command','/api/moba/create','/api/moba/command','/api/city-life/move','/api/city-life/interact']){
      assert.equal((await call(path,{})).data.error,'control_paused',path);
    }
    assert.equal((await call('/api/control',{mode:'human'},true)).status,401);
    for(const path of ['/api/energy/order','/api/energy/confirm','/api/studio/appearance','/api/agent-key'])assert.equal((await call(path,{},true)).status,401,path);
    control=(await call('/api/control',{mode:'human'})).data;assert.equal(control.mode,'human');
    for(const path of ['/api/journey/move','/api/city-life/exit','/api/battle/start','/api/moba/create','/api/pvp/command'])assert.equal((await call(path,{},true)).data.error,'control_paused',path);
    assert.equal((await call('/api/city-life/exit',{},false,{'X-Game-Control':String(control.version-1)})).data.error,'control_changed');
    assert.equal((await call('/api/city-life/exit',{},false,{'X-Game-Control':String(control.version)})).status,200);
    const manual=await call('/api/action',{kind:'gather',source:'agent'});assert.equal(manual.data.score,.5,'JSON cannot spoof Agent points');
    const oldVersion=control.version;await call('/api/control',{mode:'agent'});control=(await call('/api/control',{mode:'human'})).data;
    assert.equal((await call('/api/journey/move',{x:p.x,z:p.z},false,{'X-Game-Control':String(oldVersion)})).data.error,'control_changed');
    await call('/api/control',{mode:'agent'});
    const created=await call('/api/moba/create',{hero:'cz',teamSize:1,ranked:false},true);assert.equal(created.status,200);
    const id=created.data.id;await call('/api/moba/ready',{id,hero:'cz',ready:true},true);
    assert.equal((await call('/api/moba/start',{id},true)).status,200);
    assert.equal((await call('/api/moba/state?id='+id)).data.status,'active');
    assert.equal((await call('/api/moba/command',{id,kind:'move',x:-10,z:0},true)).status,200);
    await call('/api/agent-key/revoke',{});
    assert.equal((await call('/api/control')).data.mode,'human');
    assert.equal((await call('/api/journey',undefined,true)).status,401);
    assert.equal((await call('/api/control',{mode:'agent'})).data.error,'control_no_agent');
  }finally{await new Promise(r=>server.close(r));db.close();}
});

test('remote walking converges without overshoot; large scene jumps snap and idle stops',()=>{
  let p={x:0,z:0};for(let i=0;i<40;i++)p=remoteStep(p.x,p.z,{x:2,z:3},.016);
  assert.ok(Math.hypot(p.x-2,p.z-3)<.01);assert.ok(p.x<=2&&p.z<=3);
  assert.equal(remoteStep(0,0,{x:20,z:0},.016).x,20);
  assert.equal(remoteStep(2,3,{x:2,z:3},.016).moving,false);
});
