import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import {randomBytes} from 'node:crypto';
import {publicAppearance} from './studio-store.mjs';
import {transaction} from './db.mjs';
import {MOBA_HEROES,newMobaState,stepMoba,mobaCommand,visibleTo} from '../public/moba-rules.js';
import {activityEligibility,reserveActivity,finishActivity,cancelActivity} from './activity-rewards.mjs';
import {mobaParticipation,mobaScore} from './moba-scoring.mjs';

export function createMobaService(db,config,client){
 const running=new Map();
 const live=Boolean(config.energy?.enabled&&config.gameTokenAddress&&config.rewardTreasuryAddress);
 // A restart voids an unfinished room and refunds its reserved energy exactly once.
 transaction(db,()=>{for(const room of db.prepare("SELECT id FROM moba_rooms WHERE status='active'").all()){
  for(const t of db.prepare("SELECT id FROM activity_tickets WHERE id LIKE ? AND status='reserved'").all('moba:'+room.id+':%'))cancelActivity(db,t.id,true);
  db.prepare("UPDATE moba_rooms SET status='void' WHERE id=?").run(room.id);
 }});
 function resident(wallet){const p=db.prepare('SELECT * FROM residents WHERE wallet=?').get(wallet);if(!p)throw new Error('resident_not_found');return p;}
 function room(id){return db.prepare('SELECT * FROM moba_rooms WHERE id=?').get(String(id||'').toUpperCase());}
 function members(id){return db.prepare('SELECT m.*,r.handle,r.is_demo,r.verified_ai FROM moba_members m JOIN residents r ON r.wallet=m.wallet WHERE room_id=? ORDER BY joined_at,wallet').all(id);}
 function current(wallet){return db.prepare("SELECT r.* FROM moba_rooms r JOIN moba_members m ON m.room_id=r.id WHERE m.wallet=? AND r.status IN ('waiting','active') ORDER BY r.created_at DESC LIMIT 1").get(wallet);}
 function needMember(wallet,id){const r=room(id);if(!r||!members(r.id).some(m=>m.wallet===wallet))throw new Error('moba_not_found');return r;}
 function present(r,wallet){
  if(!r)return null;const list=members(r.id),state=running.get(r.id)||JSON.parse(r.state_json||'null'),me=state?.heroes.find(h=>h.wallet===wallet);
  return {id:r.id,host:r.host,ranked:Boolean(r.ranked),teamSize:r.team_size,status:r.status,members:list.map(m=>({wallet:m.wallet,name:m.handle,hero:m.hero,team:m.team,ready:Boolean(m.ready)})),me:me?.id,
   state:state?{...state,heroes:state.heroes.filter(h=>state.status!=='active'||!me||visibleTo(state,h,me.team)).map(({path,hits,...h})=>h),
     minions:state.minions.filter(h=>!me||visibleTo(state,h,me.team)),casts:state.casts.filter(c=>!me||visibleTo(state,c,me.team)),effects:state.effects.filter(c=>!me||visibleTo(state,c,me.team))}:null};
 }
 function lobby(wallet){resident(wallet);return {live,current:present(current(wallet),wallet),rooms:db.prepare("SELECT id,ranked,team_size,created_at FROM moba_rooms WHERE status='waiting' AND created_at>? ORDER BY created_at DESC LIMIT 20").all(Date.now()-1800000)
   .map(r=>({...r,count:members(r.id).length})),heroes:Object.keys(MOBA_HEROES)};}
 function create(wallet,{ranked=false,hero='cz',teamSize=3}={}){resident(wallet);if(current(wallet))throw new Error('moba_already_joined');if(ranked&&!live)throw new Error('activity_not_live');
  if(!MOBA_HEROES[hero]||![1,3].includes(teamSize))throw new Error('moba_invalid');const id=randomBytes(4).toString('hex').slice(0,6).toUpperCase(),now=Date.now();
  transaction(db,()=>{db.prepare('INSERT INTO moba_rooms(id,host,ranked,team_size,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,wallet,ranked?1:0,teamSize,now,now);
   db.prepare('INSERT INTO moba_members(room_id,wallet,team,hero,joined_at) VALUES(?,?,?,?,?)').run(id,wallet,0,hero,now);});return present(room(id),wallet);
 }
 function join(wallet,id,hero='cz'){resident(wallet);if(current(wallet))throw new Error('moba_already_joined');const r=room(id);if(!r||r.status!=='waiting'||Date.now()-r.created_at>1800000)throw new Error('moba_not_found');
  const list=members(r.id);if(list.length>=r.team_size*2)throw new Error('moba_full');if(!MOBA_HEROES[hero])throw new Error('moba_invalid');
  const team=list.filter(m=>m.team===0).length<=list.filter(m=>m.team===1).length?0:1;
  db.prepare('INSERT INTO moba_members(room_id,wallet,team,hero,joined_at) VALUES(?,?,?,?,?)').run(r.id,wallet,team,hero,Date.now());return present(room(r.id),wallet);
 }
 function ready(wallet,id,hero,value){const r=needMember(wallet,id);if(r.status!=='waiting'||!MOBA_HEROES[hero])throw new Error('moba_invalid');
  db.prepare('UPDATE moba_members SET hero=?,ready=? WHERE room_id=? AND wallet=?').run(hero,value?1:0,r.id,wallet);return present(room(r.id),wallet);
 }
 async function start(wallet,id,checkControl=()=>{}){const r=needMember(wallet,id),list=members(r.id);if(r.host!==wallet||r.status!=='waiting'||list.some(m=>!m.ready))throw new Error('moba_not_ready');
  if(r.ranked&&list.length!==r.team_size*2)throw new Error('moba_need_players');
  if(list.some(m=>db.prepare("SELECT 1 FROM pvp_matches WHERE status='active' AND (a_wallet=? OR b_wallet=?)").get(m.wallet,m.wallet)))throw new Error('activity_busy');
  const entries=r.ranked?await activityEligibility(db,client,config.gameTokenAddress,list.map(m=>m.wallet)):[];
  if(r.ranked&&new Set(entries.map(e=>e.agentId)).size!==r.team_size*2)throw new Error('activity_identity_required');
  return transaction(db,()=>{
   checkControl();
   if(room(r.id).status!=='waiting'||JSON.stringify(members(r.id))!==JSON.stringify(list))throw new Error('moba_not_ready');
   for(const entry of entries)reserveActivity(db,`moba:${r.id}:${entry.wallet.toLowerCase()}`,r.team_size===1?'duel':'moba',entry,Date.now(),list.filter(m=>m.team!==list.find(p=>p.wallet===entry.wallet).team).map(m=>m.wallet));
   const players=[];for(const team of [0,1]){const humans=list.filter(m=>m.team===team);for(let i=0;i<r.team_size;i++){
    const m=humans[i],hero=m?.hero||Object.keys(MOBA_HEROES)[(team*3+i)%6];players.push({id:'hero-'+(team*3+i),wallet:m?.wallet||null,name:m?.handle||'BOT',hero,team,bot:!m,appearance:m?publicAppearance(db,m.wallet):null});}}
   for(const p of players)if(p.wallet)beginPlayScore(db,'moba:'+r.id,p.wallet);
   const s=newMobaState(players);db.prepare("UPDATE moba_rooms SET status='active',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(s),Date.now(),r.id);
   running.set(r.id,s);return present(room(r.id),wallet);
  });
 }
 function leave(wallet,id){const r=needMember(wallet,id);if(r.status==='active')throw new Error('moba_in_progress');
  if(r.status==='waiting'){db.prepare('DELETE FROM moba_members WHERE room_id=? AND wallet=?').run(r.id,wallet);const rest=members(r.id);
   db.prepare('UPDATE moba_rooms SET host=?,status=? WHERE id=?').run(rest[0]?.wallet||wallet,rest.length?'waiting':'closed',r.id);}
  return {ok:true};
 }
 function forfeit(wallet,id){
  const r=needMember(wallet,id),s=running.get(r.id);if(!s)throw new Error('moba_inactive');const me=s.heroes.find(h=>h.wallet===wallet);
  me.forfeited=true;me.path=[];me.target=null;me.attackMove=false;me.recallAt=0;
  if(s.heroes.filter(h=>h.wallet).length===1){s.status='finished';s.winner=null;s.finishedAt=s.now;s.forfeited=true;}
  else if(r.ranked){
   if(!s.heroes.some(h=>h.team===me.team&&!h.forfeited)){s.status='finished';s.winner=1-me.team;s.finishedAt=s.now;}
  }else{me.bot=true;me.activeMs=0;}
  if(s.status==='finished')complete(r.id,s);return present(room(r.id),wallet);
 }
 function command(wallet,id,input,source='human'){const r=needMember(wallet,id),s=running.get(r.id);if(!s||r.status!=='active')throw new Error('moba_inactive');
  const h=s.heroes.find(h=>h.wallet===wallet);if(!h||h.forfeited)throw new Error('unauthorized');
  const priorInput=h.lastInput,accepted=mobaCommand(s,h.id,input);if(!accepted)h.lastInput=priorInput;if(accepted)recordPlayInput(db,'moba:'+r.id,wallet,source,s.now);
  return {accepted,serverNow:s.now};
 }
 function complete(id,s){const r=room(id);transaction(db,()=>{
  if(r.status!=='active')return;
  for(const h of s.heroes.filter(h=>h.wallet)){
   const active=!h.forfeited&&!s.forfeited&&mobaParticipation(h),score=mobaScore(s,h,r.team_size,Boolean(r.ranked));
   h.scoreBps=playScoreBps(db,'moba:'+id,h.wallet,true);
   h.rewardPoints=earnedPoints(db,'moba:'+id,h.wallet,score.points);h.rewardStatus=score.reason;
   if(r.ranked&&!finishActivity(db,`moba:${id}:${h.wallet.toLowerCase()}`,id,h.rewardPoints,s.heroes.filter(p=>p.team!==h.team&&p.wallet).map(p=>p.wallet),s.finishedAt)){h.rewardPoints=0;h.rewardStatus='shared_limit';}
   if(active)db.prepare('UPDATE residents SET material=material+2 WHERE wallet=?').run(h.wallet);
  }
  db.prepare("UPDATE moba_rooms SET status='finished',state_json=?,updated_at=? WHERE id=?").run(JSON.stringify(s),Date.now(),id);
 });running.delete(id);}
 let lastSave=0;
 const tick=()=>{const now=Date.now();try{for(const [id,s] of running){
   // Bound catch-up work. A long process stall voids/refunds rather than fabricating gameplay.
   if(now-s.now>30000){transaction(db,()=>{for(const h of s.heroes.filter(h=>h.wallet))cancelActivity(db,`moba:${id}:${h.wallet.toLowerCase()}`,true);db.prepare("UPDATE moba_rooms SET status='void' WHERE id=?").run(id);});running.delete(id);continue;}
   for(let n=0;n<30&&s.now+50<=now&&s.status==='active';n++)stepMoba(s,Math.min(now,s.now+100));
   if(s.status==='finished')complete(id,s);
   else if(now-lastSave>1000)db.prepare('UPDATE moba_rooms SET state_json=?,updated_at=? WHERE id=?').run(JSON.stringify(s),now,id);
  }if(now-lastSave>1000)lastSave=now;}catch(error){console.error('MOBA tick deferred:',error.message);}};
 const timer=setInterval(tick,100);timer.unref();
 return {lobby,create,join,ready,start,leave,forfeit,command,state:(wallet,id)=>present(needMember(wallet,id),wallet),stop:()=>clearInterval(timer),tick};
}
