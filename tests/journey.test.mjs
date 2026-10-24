import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db.mjs';
import {createResident,advanceWorld} from '../server/game.mjs';
import {journeyState,journeyMove,journeyCommand} from '../server/journey.mjs';
import {JOURNEY_NODES,COURIER_ROUTE,gateOpen} from '../public/journey-rules.js';
import {createApp} from '../server/index.mjs';

function setup(){const db=openDatabase(':memory:');let now=1000000;
  createResident(db,{wallet:'a',handle:'explorer.ai'},now);advanceWorld(db,now);
  journeyState(db,'a',now);journeyMove(db,'a',{x:0,z:7},now);
  return {db,get now(){return now;},wait(ms){now+=ms;},
    command(c,input={}){return journeyCommand(db,'a',c,input,now);},
    state(){return journeyState(db,'a',now);},
    walk(id){const target=JOURNEY_NODES[id];let p=journeyState(db,'a',now).profile;
      for(const goal of [{x:0,z:p.z},{x:0,z:target.z},target]) {
        while(Math.hypot(p.x-goal.x,p.z-goal.z)>.001){const dx=goal.x-p.x,dz=goal.z-p.z,len=Math.hypot(dx,dz),step=Math.min(.8,len);now+=160;
          p=journeyMove(db,'a',{x:p.x+dx/len*step,z:p.z+dz/len*step},now);}
      }
    },
    touch(id){this.walk(id);now+=750;if(id.startsWith('gate'))while(!gateOpen(id,now))now+=200;return this.command('interact',{id});}
  };
}
function signal(f){f.command('start',{kind:'signal'});let s=f.touch('observatory');for(const id of s.run.order)f.touch(id);return f.touch('power');}
function courier(f){f.command('start',{kind:'courier'});let s;for(const id of COURIER_ROUTE)s=f.touch(id);return s;}

test('exploration, delivery and crafting form a persistent progression loop with real material costs',()=>{
  const f=setup();assert.throws(()=>f.command('start',{kind:'courier'}),/journey_locked/);
  const first=signal(f);assert.equal(first.run.status,'complete');assert.equal(first.material,6);assert.equal(first.profile.signals,1);
  assert.equal(first.run.rating,3);assert.equal(first.rewardsLeft,5);
  const second=courier(f);assert.equal(second.run.status,'complete');assert.equal(second.profile.deliveries,1);assert.equal(second.material,10);
  assert.ok(second.profile.best_delivery_ms>0&&second.profile.best_delivery_ms<60000);
  f.walk('workshop');const crafted=f.command('craft');assert.equal(crafted.profile.beacon_level,1);assert.equal(crafted.material,4);
  assert.equal(f.state().profile.beacon_level,1);assert.throws(()=>f.command('craft'),/journey_locked/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM pvp_scores').get().n,0);
  f.db.close();
});
test('wrong rune resets the sequence, gives a visible retry and lowers rating without consuming material',()=>{
  const f=setup();f.command('start',{kind:'signal'});const first=f.touch('observatory');
  const wrong=first.run.order[1];const retry=f.touch(wrong);assert.equal(retry.notice,'wrong_rune');assert.equal(retry.run.stage,1);assert.equal(retry.material,2);
  assert.ok(retry.run.revealed_until>f.now);for(const id of first.run.order)f.touch(id);
  const done=f.touch('power');assert.equal(done.run.rating,2);assert.equal(done.material,6);
  assert.throws(()=>f.command('interact',{id:'power'}),/journey_no_active/);assert.equal(f.state().material,6);f.db.close();
});
test('quest steps cannot be skipped or completed remotely and travel speed/collision are checked',()=>{
  const f=setup();f.command('start',{kind:'signal'});
  assert.throws(()=>f.command('interact',{id:'observatory'}),/journey_too_far/);
  assert.throws(()=>journeyMove(f.db,'a',{x:9,z:-3},f.now+10),/journey_invalid_move/);
  assert.throws(()=>journeyMove(f.db,'a',{x:Infinity,z:0},f.now+20),/journey_invalid_move/);
  f.walk('power');assert.throws(()=>f.command('interact',{id:'power'}),/journey_wrong_target/);
  f.wait(1000);assert.throws(()=>journeyMove(f.db,'a',{x:-9,z:8},f.now),/journey_invalid_move/);
  assert.equal(f.state().run.stage,0);f.db.close();
});
test('closed wind gates penalize the attempt without advancing it; open gates advance once',()=>{
  const f=setup();signal(f);f.command('start',{kind:'courier'});f.touch('market');f.walk('gate1');f.wait(750);
  while(gateOpen('gate1',f.now))f.wait(100);
  const blocked=f.command('interact',{id:'gate1'});assert.equal(blocked.notice,'storm');assert.equal(blocked.run.stage,1);
  assert.throws(()=>f.command('interact',{id:'gate1'}),/journey_cooldown/);
  f.wait(750);while(!gateOpen('gate1',f.now))f.wait(100);
  assert.equal(f.command('interact',{id:'gate1'}).run.stage,2);f.db.close();
});
test('timeouts keep prior growth, replays are allowed, and the daily reward cap cannot be replayed',()=>{
  const f=setup();for(let i=0;i<7;i++){const done=signal(f);assert.equal(done.run.rewarded,i<6?1:0);}
  assert.equal(f.state().material,26);assert.equal(f.state().rewardsLeft,0);
  f.command('start',{kind:'courier'});f.wait(60001);assert.equal(f.state().run.status,'active');
  f.touch('market');f.wait(60001);assert.equal(f.state().run.status,'expired');assert.equal(f.state().profile.signals,7);
  assert.throws(()=>f.command('interact',{id:'market'}),/journey_no_active/);
  f.command('start',{kind:'signal'});f.command('abandon');assert.equal(f.state().run.status,'abandoned');
  f.command('start',{kind:'signal'});assert.equal(f.state().run.status,'active');f.db.close();
});

test('journey API requires a session and valid origin and always uses the authenticated wallet',async()=>{
  const config={port:0,origin:'http://127.0.0.1:3200',roundMs:120000,dbPath:':memory:',demoMode:true,rpcUrl:'https://bsc-dataseed.binance.org/',aiApiKey:null,aiModel:'test',storyCooldownMs:90000,aiAllowDemo:false};
  const {server,db}=createApp(config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,cookie='',origin=config.origin)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(base+'/api/journey')).status,401);
    const login=await post('/api/demo/start',{}),cookie=login.headers.get('set-cookie').split(';')[0];
    const initial=await (await fetch(base+'/api/journey',{headers:{Cookie:cookie}})).json();
    assert.equal((await post('/api/journey/command',{command:'start',kind:'signal'},cookie,'https://invalid.example')).status,403);
    const started=await (await post('/api/journey/command',{command:'start',kind:'signal',wallet:'someone-else'},cookie)).json();
    assert.equal(started.profile.wallet,initial.profile.wallet);assert.equal(started.run.wallet,initial.profile.wallet);
    assert.equal((await post('/api/journey/command',{command:'interact',id:'power'},cookie)).status,409);
    assert.equal(db.prepare('SELECT count(*) AS n FROM journey_profiles').get().n,1);
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});


test('a fresh Agent can take its first step after reading the city, without a stationary POST',()=>{
 const db=openDatabase(':memory:');try{
  createResident(db,{wallet:'new',handle:'new.ai'},1000000);
  const first=journeyState(db,'new',1000000);assert.equal(first.profile.moved_at,1000000);
  assert.equal(journeyMove(db,'new',{x:0,z:6},1000250,'agent').z,6);
  assert.throws(()=>journeyMove(db,'new',{x:10,z:6},1000260,'agent'),/journey_invalid_move/);
 }finally{db.close();}
});
