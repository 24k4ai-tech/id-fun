import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import {randomInt} from 'node:crypto';
import {transaction} from './db.mjs';
import {JOURNEY_NODES,RUNE_IDS,COURIER_ROUTE,BEACON_COSTS,gateOpen} from '../public/journey-rules.js';
import {cityWalkable} from '../public/city-controls.js';
import {campaignState,campaignCommand} from './campaign.mjs';

function profile(db,wallet,now) {
  if (!db.prepare('SELECT 1 FROM residents WHERE wallet=?').get(wallet)) throw new Error('resident_not_found');
  db.prepare('INSERT OR IGNORE INTO journey_profiles(wallet,moved_at) VALUES(?,?)').run(wallet,now);
  db.prepare('UPDATE journey_profiles SET moved_at=? WHERE wallet=? AND moved_at=0').run(now,wallet);
  return db.prepare('SELECT * FROM journey_profiles WHERE wallet=?').get(wallet);
}
function latest(db,wallet,now) {
  db.prepare("UPDATE journey_runs SET status='expired',completed_at=? WHERE wallet=? AND status='active' AND expires_at<=?").run(now,wallet,now);
  return db.prepare('SELECT * FROM journey_runs WHERE wallet=? ORDER BY id DESC LIMIT 1').get(wallet);
}
function view(db,wallet,now,notice=null) {
  const p=profile(db,wallet,now),run=latest(db,wallet,now);
  const today=Math.floor(now/86400000)*86400000;
  const earned=db.prepare('SELECT count(*) AS n FROM journey_runs WHERE wallet=? AND rewarded=1 AND completed_at>=?').get(wallet,today).n;
  return {profile:p,run:run?{...run,order:JSON.parse(run.order_json),order_json:undefined}:null,
    material:db.prepare('SELECT material FROM residents WHERE wallet=?').get(wallet).material,
    rewardsLeft:Math.max(0,6-earned),campaign:campaignState(db,wallet),serverNow:now,notice};
}
export const journeyState=(db,wallet,now=Date.now())=>transaction(db,()=>view(db,wallet,now));

export function journeyMove(db,wallet,input,now=Date.now(),source='human') {
  return transaction(db,()=>{
    const p=profile(db,wallet,now),x=Number(input.x),z=Number(input.z);
    if (!Number.isFinite(x)||!Number.isFinite(z)||x < -28||x > 28||z < -28||z > 33) throw new Error('journey_invalid_move');
    const elapsed=Math.max(0,Math.min(1,(now-(p.moved_at||now))/1000));
    if (Math.hypot(x-p.x,z-p.z)>elapsed*6.2+.05) throw new Error('journey_invalid_move');
    const steps=Math.max(1,Math.ceil(Math.hypot(x-p.x,z-p.z)/.25));
    // A small skin accommodates a curved client path between two position samples.
    for(let i=1;i<=steps;i++)if(!cityWalkable(p.x+(x-p.x)*i/steps,p.z+(z-p.z)*i/steps,.12))throw new Error('journey_invalid_move');
    if(Math.hypot(x-p.x,z-p.z)>.01){
      const run=latest(db,wallet,now),mission=campaignState(db,wallet).active?.mission;
      if(run?.status==='active')recordPlayInput(db,'journey:'+run.id,wallet,source,now);
      if(mission)recordPlayInput(db,'campaign:'+mission,wallet,source,now);
      const task=db.prepare("SELECT id FROM city_commissions WHERE wallet=? AND status='active'").get(wallet);
      if(task)recordPlayInput(db,'city:'+task.id,wallet,source,now);
    }
    db.prepare('UPDATE journey_profiles SET x=?,z=?,moved_at=? WHERE wallet=?').run(x,z,now,wallet);
    return {x,z,serverNow:now};
  });
}
function near(p,id) {
  const node=JOURNEY_NODES[id];
  return node && Math.hypot(p.x-node.x,p.z-node.z)<=2.3;
}
function complete(db,p,run,now) {
  const elapsed=now-run.started_at;
  const today=Math.floor(now/86400000)*86400000;
  const rewarded=db.prepare('SELECT count(*) AS n FROM journey_runs WHERE wallet=? AND rewarded=1 AND completed_at>=?').get(p.wallet,today).n<6;
  const rating=Math.max(1,3-Math.min(2,run.mistakes+run.reveals+(run.kind==='courier'&&elapsed>33000?1:0)));
  db.prepare("UPDATE journey_runs SET status='complete',completed_at=?,rewarded=?,rating=? WHERE id=?").run(now,rewarded?1:0,rating,run.id);
  const field=run.kind==='signal'?'signals':'deliveries';
  db.prepare(`UPDATE journey_profiles SET ${field}=${field}+1 WHERE wallet=?`).run(p.wallet);
  if(run.kind==='courier')db.prepare('UPDATE journey_profiles SET best_delivery_ms=CASE WHEN best_delivery_ms IS NULL THEN ? ELSE min(best_delivery_ms,?) END WHERE wallet=?').run(elapsed,elapsed,p.wallet);
  const points=earnedPoints(db,'journey:'+run.id,p.wallet,3);
  if(rewarded) {
    db.prepare('UPDATE residents SET material=material+4,score=score+? WHERE wallet=?').run(points,p.wallet);
    db.prepare('UPDATE city SET stability=min(100,stability+1) WHERE id=1').run();
    const event=db.prepare("SELECT e.* FROM events e JOIN city c ON c.active_event_id=e.id WHERE e.status='active' AND e.ends_at>?").get(now);
    if(event) {
      db.prepare('UPDATE events SET progress=progress+1 WHERE id=?').run(event.id);
      if(event.progress+1>=event.target) {
        db.prepare("UPDATE events SET status='completed' WHERE id=?").run(event.id);
        db.prepare('UPDATE city SET active_event_id=NULL,stability=min(100,stability+7) WHERE id=1').run();
      }
    }
  }
  const who=db.prepare('SELECT handle FROM residents WHERE wallet=?').get(p.wallet).handle;
  db.prepare('INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(p.wallet,who,'journey','system',`${who} 完成了${run.kind==='signal'?'寻光解谜':'风门递送'}，获得 ${rating} 星评价。`,rewarded?points:0,now);
}
export function journeyCommand(db,wallet,command,input={},now=Date.now(),source='human') {
  return transaction(db,()=>{
    const p=profile(db,wallet,now),run=latest(db,wallet,now);
    let notice=null;
    if(command?.startsWith('campaign:')) {
      if(run?.status==='active')throw new Error('journey_in_progress');
      notice=campaignCommand(db,p,command.slice(9),input,now,source);
    } else if(command==='start') {
      if(campaignState(db,wallet).active)throw new Error('journey_in_progress');
      if(!['signal','courier'].includes(input.kind))throw new Error('journey_invalid_command');
      if(run?.status==='active')throw new Error('journey_in_progress');
      if(input.kind==='courier'&&!p.signals)throw new Error('journey_locked');
      const order=[...RUNE_IDS];for(let i=order.length-1;i>0;i--){const j=randomInt(i+1);[order[i],order[j]]=[order[j],order[i]];}
      db.prepare('INSERT INTO journey_runs(wallet,kind,order_json,started_at,expires_at,stage_at) VALUES(?,?,?,?,?,?)')
        .run(wallet,input.kind,JSON.stringify(order),now,now+180000,now);
      beginPlayScore(db,'journey:'+latest(db,wallet,now).id,wallet);
    } else if(command==='craft') {
      if(!near(p,'workshop'))throw new Error('journey_too_far');
      if(p.beacon_level>=3||!p.signals||!p.deliveries||p.signals+p.deliveries<[2,4,6][p.beacon_level])throw new Error('journey_locked');
      const cost=BEACON_COSTS[p.beacon_level];
      if(!db.prepare('UPDATE residents SET material=material-? WHERE wallet=? AND material>=?').run(cost,wallet,cost).changes)throw new Error('not_enough_material');
      db.prepare('UPDATE journey_profiles SET beacon_level=beacon_level+1 WHERE wallet=?').run(wallet);
      notice='crafted';
    } else if(command==='abandon') {
      if(run?.status==='active')db.prepare("UPDATE journey_runs SET status='abandoned',completed_at=? WHERE id=?").run(now,run.id);
    } else {
      if(run?.status!=='active')throw new Error('journey_no_active');
      recordPlayInput(db,'journey:'+run.id,wallet,source,now);
      if(command==='reveal') {
        if(run.kind!=='signal'||run.stage<1||run.stage>3)throw new Error('journey_invalid_command');
        if(now>=run.revealed_until)db.prepare('UPDATE journey_runs SET reveals=reveals+1,revealed_until=? WHERE id=?').run(now+6000,run.id);
      } else if(command==='interact') {
        if(!near(p,input.id))throw new Error('journey_too_far');
        if(now-run.last_hit_at<700)throw new Error('journey_cooldown');
        const order=JSON.parse(run.order_json);
        const expected=run.kind==='courier'?COURIER_ROUTE[run.stage]
          :run.stage===0?'observatory':run.stage<=3?order[run.stage-1]:'power';
        if(input.id!==expected) {
          if(run.kind==='signal'&&run.stage>=1&&run.stage<=3&&RUNE_IDS.includes(input.id)) {
            db.prepare('UPDATE journey_runs SET stage=1,mistakes=mistakes+1,stage_at=?,revealed_until=?,last_hit_at=? WHERE id=?').run(now,now+6000,now,run.id);
            notice='wrong_rune';
          } else throw new Error('journey_wrong_target');
        } else if(run.kind==='courier'&&input.id.startsWith('gate')&&!gateOpen(input.id,now)) {
          db.prepare('UPDATE journey_runs SET mistakes=mistakes+1,last_hit_at=? WHERE id=?').run(now,run.id);notice='storm';
        } else if(run.stage===(run.kind==='signal'?4:5)) {
          complete(db,p,run,now);notice='complete';
        } else {
          db.prepare('UPDATE journey_runs SET stage=stage+1,stage_at=?,revealed_until=?,last_hit_at=? WHERE id=?')
            .run(now,run.kind==='signal'&&run.stage===0?now+9000:run.revealed_until,now,run.id);
          if(run.kind==='courier'&&run.stage===0)
            db.prepare('UPDATE journey_runs SET started_at=?,expires_at=? WHERE id=?').run(now,now+60000,run.id);
          notice='checkpoint';
        }
      } else throw new Error('journey_invalid_command');
    }
    return view(db,wallet,now,notice);
  });
}
