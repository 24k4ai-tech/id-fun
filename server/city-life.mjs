import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import {randomUUID,randomInt} from 'node:crypto';
import {transaction} from './db.mjs';
import {CITY_PLACES,COMMISSION_KINDS,ROOM_BOUNDS,roomWalkable} from '../public/city-places.js';
import {JOURNEY_NODES} from '../public/journey-rules.js';
import {activityEligibility,reserveActivity,finishActivity,cancelActivity} from './activity-rewards.mjs';

export function createCityLife(db,config,client){
 const live=Boolean(config.energy?.enabled&&config.gameTokenAddress&&config.rewardTreasuryAddress);
 function profile(wallet){const p=db.prepare('SELECT * FROM journey_profiles WHERE wallet=?').get(wallet);if(!p)throw new Error('resident_not_found');return p;}
 function active(wallet){return db.prepare("SELECT * FROM city_commissions WHERE wallet=? AND status='active'").get(wallet);}
 function visit(wallet){return db.prepare('SELECT * FROM city_visits WHERE wallet=?').get(wallet);}
 function status(wallet){const a=active(wallet),v=visit(wallet),today=Math.floor(Date.now()/86400000)*86400000;
  return {serverNow:Date.now(),live,visit:v,commission:a?{...a,route:JSON.parse(a.route),target:COMMISSION_KINDS[a.kind].steps[a.step],ticket:Boolean(a.ticket)}:null,
   completed:db.prepare("SELECT kind,count(*) AS count FROM city_commissions WHERE wallet=? AND status='complete' GROUP BY kind").all(wallet),
   rewardsToday:db.prepare("SELECT count(*) AS n FROM city_commissions WHERE wallet=? AND ticket IS NOT NULL AND started_at>=?").get(wallet,today).n};}
 function enter(wallet,id,now=Date.now()){const p=profile(wallet),place=CITY_PLACES[id];if(visit(wallet))throw new Error('city_inside');if(!place||Math.hypot(p.x-place.x,p.z-place.z)>3.2)throw new Error('journey_too_far');
  db.prepare('INSERT INTO city_visits(wallet,building,entered_at,moved_at) VALUES(?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET building=excluded.building,entered_at=excluded.entered_at,x=0,z=4,moved_at=excluded.moved_at').run(wallet,id,now,now);return status(wallet);}
 function exit(wallet){db.prepare('DELETE FROM city_visits WHERE wallet=?').run(wallet);return status(wallet);}
 function move(wallet,input,now=Date.now(),source='human'){const v=visit(wallet),x=Number(input.x),z=Number(input.z);if(!v||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>ROOM_BOUNDS.x||Math.abs(z)>ROOM_BOUNDS.z||Math.hypot(x-v.x,z-v.z)>Math.min(1,Math.max(0,(now-v.moved_at)/1000))*5.4+.1)throw new Error('journey_invalid_move');
  const samples=Math.max(1,Math.ceil(Math.hypot(x-v.x,z-v.z)/.2));for(let i=1;i<=samples;i++)if(!roomWalkable(v.x+(x-v.x)*i/samples,v.z+(z-v.z)*i/samples))throw new Error('journey_invalid_move');
  const task=active(wallet);if(task&&Math.hypot(x-v.x,z-v.z)>.01)recordPlayInput(db,'city:'+task.id,wallet,source,now);
  db.prepare('UPDATE city_visits SET x=?,z=?,moved_at=? WHERE wallet=?').run(x,z,now,wallet);return {x,z};}
 async function start(wallet,kind,ranked=false,now=Date.now(),checkControl=()=>{}){
  if(!COMMISSION_KINDS[kind])throw new Error('city_invalid');
  if(ranked&&!live)throw new Error('activity_not_live');
  const entry=ranked?(await activityEligibility(db,client,config.gameTokenAddress,[wallet]))[0]:null;
  return transaction(db,()=>{
   checkControl();
   if(active(wallet))throw new Error('journey_in_progress');
   const v=visit(wallet),step=COMMISSION_KINDS[kind].steps[0];if(!v||v.building!==step.place||Math.hypot(v.x-step.x,v.z-step.z)>2.2)throw new Error('journey_too_far');
   if(ranked&&status(wallet).rewardsToday>=3)throw new Error('city_reward_limit');
   const id=randomUUID(),ticket=entry?'city:'+id:null;
   if(ticket)reserveActivity(db,ticket,'city',entry,now);
   beginPlayScore(db,'city:'+id,wallet);
   const route=Array.from({length:4},()=>randomInt(4));
   db.prepare('INSERT INTO city_commissions(id,wallet,kind,route,started_at,step_at,ticket) VALUES(?,?,?,?,?,?,?)').run(id,wallet,kind,JSON.stringify(route),now,now,ticket);
   return status(wallet);
  });
 }
 function interact(wallet,choice,now=Date.now(),source='human'){return transaction(db,()=>{
  const a=active(wallet);if(!a)throw new Error('journey_no_active');const step=COMMISSION_KINDS[a.kind].steps[a.step],v=visit(wallet);
  if(now-a.step_at<4000)throw new Error('journey_cooldown');
  if(step.place){if(!v||v.building!==step.place||Math.hypot(v.x-step.x,v.z-step.z)>2.2)throw new Error('journey_too_far');}
  else {const p=profile(wallet),node=JOURNEY_NODES[step.node];if(v||Math.hypot(p.x-node.x,p.z-node.z)>2.3)throw new Error('journey_too_far');}
  // A changing four-way alignment requires an explicit task interaction; merely entering never scores.
  if(choice!==JSON.parse(a.route)[a.step])throw new Error('city_wrong_alignment');
  recordPlayInput(db,'city:'+a.id,wallet,source,now);
  if(a.step===3){
   if(now-a.started_at<20000)throw new Error('city_too_fast');
   db.prepare("UPDATE city_commissions SET status='complete',finished_at=? WHERE id=?").run(now,a.id);
   const today=Math.floor(now/86400000)*86400000,count=db.prepare("SELECT count(*) AS n FROM city_commissions WHERE wallet=? AND status='complete' AND finished_at>=?").get(wallet,today).n;
   const contribution=earnedPoints(db,'city:'+a.id,wallet,3),reward=earnedPoints(db,'city:'+a.id,wallet,5);
   if(count<=6)db.prepare('UPDATE residents SET material=material+4,score=score+? WHERE wallet=?').run(contribution,wallet);
   const scored=a.ticket&&finishActivity(db,a.ticket,a.id,reward,[],now);
   return {...status(wallet),notice:'complete',materialReward:count<=6?4:0,rewardPoints:scored?reward:0,contribution:count<=6?contribution:0};
  }
  db.prepare('UPDATE city_commissions SET step=step+1,step_at=? WHERE id=?').run(now,a.id);return status(wallet);
 });}
 function abandon(wallet){return transaction(db,()=>{const a=active(wallet);if(a){if(a.ticket)cancelActivity(db,a.ticket);db.prepare("UPDATE city_commissions SET status='abandoned' WHERE id=?").run(a.id);}return status(wallet);});}
 return {live,status,enter,exit,move,start,interact,abandon};
}
