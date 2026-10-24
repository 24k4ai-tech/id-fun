// Shared, deterministic combat rules. Only the server advances ranked matches.
export const FIELD={x:29,z:18};
export const OBSTACLES=[{x:-9,z:-7,w:7,d:3},{x:9,z:7,w:7,d:3},{x:-17,z:10,w:4,d:4},{x:17,z:-10,w:4,d:4}];
export const BRUSH=[{x:-7,z:6,r:3},{x:7,z:-6,r:3}];
const skill=(zh,en,kind,damage,range,cooldown,mana,extra={})=>({zh,en,kind,damage,range,cooldown,mana,windup:450,radius:2,...extra});
export const MOBA_HEROES={
 cz:{zh:'CZ · 金枪守卫',en:'CZ · Vanguard',role:['战士','Fighter'],color:'#f5c74b',hp:1100,range:2.7,attack:61,speed:5.4,
 skills:[skill('贯星枪','Piercing spear','line',120,10,4500,25,{width:1}),skill('守卫阵','Guard stance','shield',160,0,11000,35),skill('破阵突进','Spear charge','dash',100,7,9000,35),skill('金环震击','Solar ring','area',270,7,24000,70,{radius:4,stun:700,windup:850})]},
 heyi:{zh:'何一 · 流风双扇',en:'He Yi · Windkeeper',role:['辅助','Support'],color:'#78e5c3',hp:850,range:7,attack:43,speed:5.5,
 skills:[skill('回风','Gale fan','line',95,13,4000,20,{width:1.4,slow:1800}),skill('春风','Mending wind','heal',180,8,9000,35,{radius:3}),skill('风障','Wind barrier','shield',190,8,10000,35,{radius:3}),skill('风华领域','Sanctuary','area',160,12,25000,70,{radius:4.2,slow:3000,heal:140,windup:900})]},
 jensen:{zh:'黄仁勋 · 晶核重装',en:'Jensen · Coreguard',role:['坦克','Tank'],color:'#86dc5a',hp:1450,range:2.5,attack:48,speed:4.8,
 skills:[skill('碎地','Fault line','cone',100,6,5000,25,{width:3,slow:1200}),skill('晶甲','Core armor','shield',280,0,11000,35),skill('震荡跃击','Seismic leap','dash',90,6,10000,35,{radius:2.5,stun:600}),skill('超频冲击','Overload','area',220,5,26000,70,{radius:4.4,stun:1100,windup:1000})]},
 vitalik:{zh:'V神 · 星轨法师',en:'Vitalik · Starweaver',role:['法师','Mage'],color:'#b3a2ff',hp:780,range:7.5,attack:40,speed:5,
 skills:[skill('星矛','Star lance','line',150,15,4500,30,{width:.85}),skill('引力井','Gravity well','area',120,13,8500,35,{radius:2.8,slow:2600,windup:700}),skill('折跃','Blink','dash',0,6,11000,30),skill('陨星','Starfall','area',350,16,28000,80,{radius:3.8,windup:1200})]},
 musk:{zh:'马斯克 · 电弧游侠',en:'Musk · Arc ranger',role:['射手','Marksman'],color:'#66c9ff',hp:850,range:9,attack:62,speed:5.2,
 skills:[skill('电弧弹','Arc shot','line',110,15,3500,20,{width:.7}),skill('电磁雷','Pulse mine','area',135,12,8000,30,{radius:2.5,slow:2200,windup:900}),skill('推进器','Boost','dash',0,7,10000,25),skill('轨道轰击','Orbital barrage','line',300,21,24000,70,{width:2.4,windup:1100})]},
 afeng:{zh:'阿峰 · 烈焰拳师',en:'Afeng · Firefist',role:['突进','Brawler'],color:'#ff9564',hp:1050,range:2.2,attack:68,speed:5.8,
 skills:[skill('爆裂拳','Burst fist','cone',140,4,4000,25,{width:2.5}),skill('热血','Second wind','heal',160,0,10000,30,{radius:1}),skill('冲拳','Rocket punch','dash',110,7,8500,30),skill('烈焰风暴','Firestorm','area',290,4,24000,65,{radius:3.5,windup:700})]},
};
export const MOBA_ITEMS={power:{zh:'锋芒',en:'Power',cost:350},guard:{zh:'坚韧',en:'Guard',cost:350},focus:{zh:'专注',en:'Focus',cost:350}};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function walkable(x,z,pad=.45){return Math.abs(x)<FIELD.x-pad&&Math.abs(z)<FIELD.z-pad&&!OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+pad&&Math.abs(z-o.z)<o.d/2+pad);}
export function pathTo(from,to){
  const target={x:clamp(to.x,-28,28),z:clamp(to.z,-17,17)};
  if(!walkable(target.x,target.z))return [];
  const samples=Math.ceil(distance(from,target)/.4);let direct=true;
  for(let i=1;i<=samples;i++)if(!walkable(from.x+(target.x-from.x)*i/samples,from.z+(target.z-from.z)*i/samples)){direct=false;break;}
  if(direct)return [target];
  const start={x:Math.round(from.x),z:Math.round(from.z)},goal={x:Math.round(target.x),z:Math.round(target.z)};
  const key=p=>p.x+','+p.z,open=[{...start,g:0,f:distance(start,goal)}],seen=new Map([[key(start),0]]),parents=new Map();
  let end=null;
  for(let n=0;n<1800&&open.length;n++){
    open.sort((a,b)=>a.f-b.f);const p=open.shift();if(distance(p,goal)<1){end=p;break;}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const q={x:p.x+dx,z:p.z+dz},g=p.g+Math.hypot(dx,dz);
      if(!walkable(q.x,q.z)||!walkable(p.x+dx,p.z)||!walkable(p.x,p.z+dz)||g>=(seen.get(key(q))??Infinity))continue;
      seen.set(key(q),g);parents.set(key(q),p);open.push({...q,g,f:g+distance(q,goal)});
    }
  }
  if(!end)return [];
  const path=[target];let p=end;while(key(p)!==key(start)){path.push({x:p.x,z:p.z});p=parents.get(key(p));if(!p)return [];}
  return path.reverse();
}
function heroState(member,i){const spec=MOBA_HEROES[member.hero]||MOBA_HEROES.cz,team=member.team??(i<3?0:1);return {
  id:member.id||'hero-'+i,wallet:member.wallet||null,name:member.name||'BOT',hero:member.hero||'cz',team,bot:Boolean(member.bot),appearance:member.appearance||null,
  x:team?22:-22,z:(i%3-1)*2,hp:spec.hp,maxHp:spec.hp,mana:100,maxMana:100,shield:0,shieldUntil:0,level:3,gold:150,
  path:[],target:null,cooldowns:[0,0,0,0],attackAt:0,castUntil:0,respawnAt:0,stunUntil:0,slowUntil:0,recallAt:0,
  items:[],kills:0,deaths:0,assists:0,damage:0,objective:0,healing:0,activeMs:0,lastInput:0,lastBot:0,hits:{},
 };}
export function newMobaState(members,now=Date.now()){return {version:1,startedAt:now,now,status:'active',winner:null,nextWave:now+4000,serial:1,
 heroes:members.map((m,i)=>({...heroState(m,i),lastInput:now})),minions:[],casts:[],effects:[],structures:[0,1].flatMap(team=>[
  {id:'tower-'+team,team,type:'tower',x:team?16:-16,z:0,hp:1200,maxHp:1200,attackAt:0},
  {id:'core-'+team,team,type:'core',x:team?25:-25,z:0,hp:1900,maxHp:1900,attackAt:0}]),
 objective:{x:0,z:11,progress:0,team:null,availableAt:now+45000},buffUntil:[0,0],scores:[0,0]};}
export function visibleTo(s,unit,team){
 if(unit.team===team||unit.type)return true;
 const hidden=BRUSH.some(b=>distance(unit,b)<b.r);
 return [...s.heroes,...s.minions,...s.structures].some(a=>a.team===team&&a.hp>0&&distance(a,unit)<(hidden?5:19));
}
function units(s){return [...s.heroes,...s.minions,...s.structures];}
function enemies(s,h){return units(s).filter(u=>u.team!==h.team&&u.hp>0&&(!u.forfeited||u.bot)&&visibleTo(s,u,h.team)&&(u.type!=='core'||s.structures.find(t=>t.id==='tower-'+u.team).hp<=0));}
export function mobaCommand(s,id,c){
 const h=s.heroes.find(p=>p.id===id);if(!h||h.hp<=0||s.status!=='active')return false;
 const now=s.now;h.lastInput=now;if(h.stunUntil>now)return false;
 if(c.kind==='move'||c.kind==='attackMove'){
  if(!Number.isFinite(c.x)||!Number.isFinite(c.z))return false;
  h.path=pathTo(h,c);h.target=null;h.attackMove=c.kind==='attackMove';h.recallAt=0;return true;
 }
 if(c.kind==='attack'){const target=enemies(s,h).find(u=>u.id===c.target);if(!target)return false;h.target=target.id;h.path=[];h.recallAt=0;return true;}
 if(c.kind==='stop'){h.path=[];h.target=null;h.attackMove=false;h.recallAt=0;return true;}
 if(c.kind==='recall'){h.path=[];h.target=null;h.recallAt=now+3000;return true;}
 if(c.kind==='buy'){
  if(!MOBA_ITEMS[c.item]||h.items.includes(c.item)||distance(h,{x:h.team?24:-24,z:0})>5||h.gold<350)return false;
  h.gold-=350;h.items.push(c.item);if(c.item==='guard'){h.maxHp+=250;h.hp+=250;}return true;
 }
 if(c.kind!=='skill'||!Number.isInteger(c.slot)||c.slot<0||c.slot>3||h.castUntil>now)return false;
 const a=MOBA_HEROES[h.hero].skills[c.slot];if(c.slot===3&&h.level<6||h.cooldowns[c.slot]>now||h.mana<a.mana)return false;
 if(!Number.isFinite(c.x)||!Number.isFinite(c.z))return false;
 const d=Math.hypot(c.x-h.x,c.z-h.z)||1,range=Math.min(d,a.range),tx=h.x+(c.x-h.x)/d*range,tz=h.z+(c.z-h.z)/d*range;
 h.mana-=a.mana;h.cooldowns[c.slot]=now+a.cooldown*(h.items.includes('focus')?.8:1);h.recallAt=0;
 if(a.kind==='shield'||a.kind==='heal'){
  for(const ally of s.heroes.filter(u=>u.team===h.team&&u.hp>0&&distance(u,a.range?{x:tx,z:tz}:h)<=a.radius)){
   if(a.kind==='heal'){const heal=Math.min(a.damage,ally.maxHp-ally.hp);ally.hp+=heal;if(ally.id!==h.id)h.healing+=heal;}
   else {ally.shield=Math.max(ally.shield,a.damage);ally.shieldUntil=now+4000;ally.shieldOwner=h.id;}
  }
  s.effects.push({id:s.serial++,kind:a.kind,x:a.range?tx:h.x,z:a.range?tz:h.z,radius:a.radius,team:h.team,at:now});return true;
 }
 if(a.kind==='dash'){
  const steps=Math.ceil(range/.3);for(let i=1;i<=steps;i++){const x=h.x+(tx-h.x)/Math.max(1,steps-i+1),z=h.z+(tz-h.z)/Math.max(1,steps-i+1);if(!walkable(x,z))break;h.x=x;h.z=z;}
  h.path=[];s.casts.push({id:s.serial++,owner:h.id,team:h.team,kind:'area',x:h.x,z:h.z,ox:h.x,oz:h.z,radius:a.radius,damage:a.damage,stun:a.stun||0,at:now+100,created:now});return true;
 }
 h.castUntil=now+a.windup;
 s.casts.push({id:s.serial++,owner:h.id,team:h.team,...a,x:tx,z:tz,ox:h.x,oz:h.z,at:now+a.windup,created:now});return true;
}
function hitShape(c,u){
 if(c.kind==='area')return distance(c,u)<c.radius+.4;
 const dx=c.x-c.ox,dz=c.z-c.oz,len=Math.hypot(dx,dz)||1,along=((u.x-c.ox)*dx+(u.z-c.oz)*dz)/len;
 const lateral=Math.abs((u.x-c.ox)*dz-(u.z-c.oz)*dx)/len;
 return along>=-.4&&along<=len+.4&&lateral<((c.kind==='cone'?Math.max(.6,along/len*c.width):c.width)||1)+.35;
}
function hurt(s,attacker,target,amount){
 if(!target||target.hp<=0||target.forfeited&&!target.bot||target.type==='core'&&s.structures.find(t=>t.id==='tower-'+target.team).hp>0)return;
 if(target.type){
  if(!s.minions.some(m=>m.team===attacker.team&&m.hp>0&&distance(m,target)<7))amount*=.25;
  if(s.now-s.startedAt>=360000)amount*=3;
 }
 if(attacker.hero){amount*=attacker.items.includes('power')?1.2:1;amount*=s.buffUntil[attacker.team]>s.now?1.12:1;}
 if(target.hero){
  const absorbed=Math.min(target.shield,amount);target.shield-=absorbed;amount-=absorbed;
  const support=s.heroes.find(h=>h.id===target.shieldOwner);if(support&&support.id!==target.id)support.healing+=absorbed;
  target.recallAt=0;if(attacker.hero)target.hits[attacker.id]=s.now;
 }
 const real=Math.min(target.hp,amount);target.hp-=real;
 if(attacker.hero){if(target.hero)attacker.damage+=real;else if(target.type)attacker.objective+=real;}
 if(target.hp<=0){
  if(attacker.hero)attacker.gold+=target.hero?80:target.type?150:12;
  if(target.hero){target.deaths++;target.respawnAt=s.now+Math.min(14000,5000+target.level*600);target.path=[];target.target=null;
   s.scores[attacker.team]++;if(attacker.hero)attacker.kills++;
   for(const [id,at] of Object.entries(target.hits)){const h=s.heroes.find(p=>p.id===id);if(h&&id!==attacker.id&&s.now-at<8000){h.assists++;h.gold+=35;}}target.hits={};}
 }
}
function moveUnit(h,dt,speed){
 if(!h.path?.length)return;const p=h.path[0],d=distance(h,p),step=Math.min(d,dt*speed);
 if(d<.15){h.path.shift();return;}
 const x=h.x+(p.x-h.x)/d*step,z=h.z+(p.z-h.z)/d*step;
 if(walkable(x,z,.25)){h.x=x;h.z=z;}else h.path=[];
}
function botThink(s,h){
 const near=enemies(s,h).sort((a,b)=>distance(h,a)-distance(h,b)),target=near[0];
 if(h.hp<h.maxHp*.28){mobaCommand(s,h.id,{kind:'move',x:h.team?24:-24,z:0});return;}
 if(distance(h,{x:h.team?24:-24,z:0})<5&&h.gold>=350){const item=['power','guard','focus'].find(i=>!h.items.includes(i));if(item)mobaCommand(s,h.id,{kind:'buy',item});}
 const incoming=s.casts.find(c=>c.team!==h.team&&c.at>s.now&&hitShape(c,h));
 if(incoming){mobaCommand(s,h.id,{kind:'move',x:clamp(h.x+(h.team?-1:1)*2,-27,27),z:clamp(h.z+(h.z<0?-1:1)*3,-16,16)});return;}
 if(target&&distance(h,target)<15){
  const spec=MOBA_HEROES[h.hero];
  for(const slot of [3,1,0,2]){const a=spec.skills[slot];if(a.kind==='dash'&&spec.range>5&&distance(h,target)>5)continue;
   if(a.kind==='heal'&&h.hp>h.maxHp*.7)continue;
   if(mobaCommand(s,h.id,{kind:'skill',slot,x:target.x,z:target.z}))break;}
  if(spec.range>5&&distance(h,target)<4)mobaCommand(s,h.id,{kind:'move',x:h.x+(h.x-target.x),z:h.z+(h.z-target.z)});
  else mobaCommand(s,h.id,{kind:'attack',target:target.id});
 }else if(s.objective.availableAt<=s.now&&Number(h.id.split('-').at(-1))%3===2)mobaCommand(s,h.id,{kind:'move',x:0,z:11});
 else mobaCommand(s,h.id,{kind:'move',x:h.team?-20:20,z:(Number(h.id.slice(-1))%3-1)*1.4});
}
export function stepMoba(s,now){
 if(s.status!=='active'||now<=s.now)return s;
 const dt=Math.min(.1,(now-s.now)/1000);s.now+=dt*1000;
 const elapsed=s.now-s.startedAt;
 s.effects=s.effects.filter(e=>s.now-e.at<1100);
 for(const h of s.heroes){
  if(h.forfeited&&!h.bot)continue;
  if(h.hp<=0){if(s.now>=h.respawnAt){h.hp=h.maxHp;h.mana=100;h.x=h.team?22:-22;h.z=0;h.shield=0;}else continue;}
  h.level=Math.min(12,3+Math.floor(elapsed/40000));h.gold+=dt*2;h.mana=Math.min(100,h.mana+dt*4);
  if(h.shieldUntil<s.now)h.shield=0;
  if(distance(h,{x:h.team?24:-24,z:0})<4){h.hp=Math.min(h.maxHp,h.hp+dt*160);h.mana=Math.min(100,h.mana+dt*30);}
  if(h.recallAt&&s.now>=h.recallAt){h.x=h.team?22:-22;h.z=0;h.recallAt=0;}
  if(!h.bot&&s.now-h.lastInput<12000)h.activeMs+=dt*1000;
  if(h.bot&&s.now-h.lastBot>650){h.lastBot=s.now;const input=h.lastInput;botThink(s,h);h.lastInput=input;}
  if(h.stunUntil>s.now||h.castUntil>s.now||h.recallAt)continue;
  if(h.attackMove){const candidate=enemies(s,h).filter(e=>distance(h,e)<MOBA_HEROES[h.hero].range+1).sort((a,b)=>distance(h,a)-distance(h,b))[0];if(candidate)h.target=candidate.id;}
  const target=enemies(s,h).find(e=>e.id===h.target);
  if(target){const range=MOBA_HEROES[h.hero].range;
   if(distance(h,target)>range){if(!h.path.length||distance(h.path.at(-1),target)>1.5)h.path=pathTo(h,target);}
   else {h.path=[];if(h.attackAt<=s.now){h.attackAt=s.now+850;hurt(s,h,target,MOBA_HEROES[h.hero].attack*(1+(h.level-3)*.06));s.effects.push({id:s.serial++,kind:'attack',x:target.x,z:target.z,ox:h.x,oz:h.z,team:h.team,at:s.now});}}
  }else if(h.target)h.target=null;
  moveUnit(h,dt,MOBA_HEROES[h.hero].speed*(h.slowUntil>s.now?.55:1));
 }
 if(s.now>=s.nextWave){s.nextWave+=14000;for(const team of [0,1])for(let i=0;i<3;i++)s.minions.push({id:'minion-'+s.serial++,team,x:team?23:-23,z:(i-1)*1.1,siege:i===1&&Math.floor((s.nextWave-s.startedAt)/14000)%3===0,hp:(260+elapsed/1500)*(i===1?1.6:1),maxHp:(260+elapsed/1500)*(i===1?1.6:1),attackAt:0});}
 for(const m of s.minions){if(m.hp<=0)continue;const t=units(s).filter(u=>u.team!==m.team&&u.hp>0&&(u.type!=='core'||s.structures.find(t=>t.id==='tower-'+u.team).hp<=0)).sort((a,b)=>distance(m,a)-distance(m,b))[0];
  if(t&&distance(m,t)<(m.siege?6:2)){if(m.attackAt<s.now){m.attackAt=s.now+1100;hurt(s,m,t,(m.siege?42:22)+elapsed/12000);}}
  else {const direction=m.team?-1:1;m.x=clamp(m.x+dt*2.4*direction,-25,25);}
 }
 for(const tower of s.structures.filter(t=>t.type==='tower'&&t.hp>0)){
  const t=[...s.minions,...s.heroes].filter(u=>u.team!==tower.team&&u.hp>0&&distance(tower,u)<9).sort((a,b)=>(a.hero?1:0)-(b.hero?1:0)||distance(tower,a)-distance(tower,b))[0];
  if(t&&tower.attackAt<s.now){tower.attackAt=s.now+1000;hurt(s,tower,t,t.hero?140:100);s.effects.push({id:s.serial++,kind:'attack',x:t.x,z:t.z,ox:tower.x,oz:tower.z,team:tower.team,at:s.now});}
 }
 const due=s.casts.filter(c=>c.at<=s.now);s.casts=s.casts.filter(c=>c.at>s.now);
 for(const c of due){const owner=s.heroes.find(h=>h.id===c.owner);if(!owner||owner.hp<=0)continue;
  for(const u of enemies(s,owner).filter(u=>hitShape(c,u))){hurt(s,owner,u,c.damage);if(u.hero){u.slowUntil=Math.max(u.slowUntil,s.now+(c.slow||0));u.stunUntil=Math.max(u.stunUntil,s.now+(c.stun||0));}}
  if(c.heal)for(const h of s.heroes.filter(h=>h.team===c.team&&h.hp>0&&distance(h,c)<c.radius)){const n=Math.min(c.heal,h.maxHp-h.hp);h.hp+=n;if(h.id!==owner.id)owner.healing+=n;}
  s.effects.push({...c,at:s.now});
 }
 s.minions=s.minions.filter(m=>m.hp>0);
 const o=s.objective;
 if(s.now>=o.availableAt){const nearby=s.heroes.filter(h=>h.hp>0&&(!h.forfeited||h.bot)&&distance(h,o)<3);const teams=new Set(nearby.map(h=>h.team));
  if(teams.size===1){const team=nearby[0].team;if(o.team!==team)o.progress=0;o.team=team;o.progress+=dt;
   if(o.progress>=8){s.buffUntil[team]=s.now+40000;for(const h of nearby)h.objective+=100;o.availableAt=s.now+60000;o.progress=0;s.effects.push({id:s.serial++,kind:'shield',x:o.x,z:o.z,radius:4,team,at:s.now});}}
  else if(!teams.size)o.progress=Math.max(0,o.progress-dt);
 }
 const cores=s.structures.filter(t=>t.type==='core');
 if(cores.some(c=>c.hp<=0)||elapsed>=(s.heroes.length===2?360000:480000)){
  const strength=team=>s.structures.filter(t=>t.team===team).reduce((n,t)=>n+Math.max(0,t.hp)/t.maxHp*(t.type==='core'?2:1),0);
  const a=strength(0),b=strength(1);s.winner=cores[0].hp<=0?1:cores[1].hp<=0?0:Math.abs(a-b)<.0001?null:a>b?0:1;s.status='finished';s.finishedAt=s.now;
 }
 return s;
}
