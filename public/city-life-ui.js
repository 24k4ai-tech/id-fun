import {CITY_PLACES,COMMISSION_KINDS} from './city-places.js';
import {JOURNEY_NODES} from './journey-rules.js';
import {createCityInterior} from './city-interior.js';
import {createEnergyUI} from './energy-ui.js';
const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh,lang=()=>document.documentElement.lang==='en'?1:0;
export function createCityLifeUI({api,toast,getCity,getWorld,flush,continueJourney,onChanged,controls,isVisible=()=>true}){
 let data=null,room=null,roomId=null,wallet=null,busy=false,moving=null,reading=false,visualGeneration=0,lastRead=0;
 const dialogue=document.createElement('dialog');dialogue.className='npc-dialog';dialogue.innerHTML='<button class="life-close">×</button><img class="npc-portrait" alt=""><div><small class="npc-place"></small><h2 class="npc-name"></h2><p class="npc-line"></p><div class="npc-options"></div></div>';document.body.append(dialogue);
 const interior=document.createElement('section');interior.className='city-interior';interior.hidden=true;interior.innerHTML='<canvas aria-label="Walkable interior"></canvas><header><span></span><button class="interior-exit"></button></header><div class="interior-help"></div><p class="interior-task" role="status"></p><div class="interior-actions"><button class="interior-use"></button></div><div class="interior-touch"><button data-dx="0" data-dz="-1">↑</button><button data-dx="-1" data-dz="0">←</button><button data-dx="0" data-dz="1">↓</button><button data-dx="1" data-dz="0">→</button></div>';document.body.append(interior);
 const commission=document.createElement('aside');commission.className='commission-hud';commission.hidden=true;commission.innerHTML='<small></small><strong></strong><p></p><button></button>';document.querySelector('.map-frame').append(commission);
 const energy=createEnergyUI({api,toast,getWallet:()=>getWorld()?.me?.wallet});
 const setPaused=flag=>{getCity()?.setMotion(0,0);getCity()?.pause(flag||!isVisible());document.body.classList.toggle('city-life-open',flag);};
 function option(label,run,disabled=false){const b=document.createElement('button');b.textContent=label;b.disabled=disabled||!controls.canPlay();b.onclick=()=>act(run);dialogue.querySelector('.npc-options').append(b);return b;}
 function closeTalk(){dialogue.close();room?.pause(false);if(!room)setPaused(false);}
 dialogue.querySelector('.life-close').onclick=closeTalk;dialogue.addEventListener('cancel',()=>{room?.pause(false);if(!room)setPaused(false);});
 function baseTalk(id,line=null){const p=CITY_PLACES[id];dialogue.querySelector('.npc-portrait').src='/portraits/'+p.avatar+'.webp';dialogue.querySelector('.npc-place').textContent=p.name[lang()];dialogue.querySelector('.npc-name').textContent=p.npc[lang()];dialogue.querySelector('.npc-line').textContent=line||p.line[lang()];dialogue.querySelector('.npc-options').replaceChildren();setPaused(true);room?.pause(true);if(!dialogue.open)dialogue.showModal();}
 async function read(){
  const owner=getWorld()?.me?.wallet;if(!owner)return;
  const next=await api('/api/city-life');if(getWorld()?.me?.wallet!==owner)return;
  if(data?.serverNow>next.serverNow)return;data=next;lastRead=performance.now();
  await syncVisual();render();
 }
 function hideInterior(){
  visualGeneration++;room?.dispose();room=null;roomId=null;interior.hidden=true;dialogue.close();setPaused(false);
 }
 async function syncVisual(){
  const v=data?.visit;
  if(!v){if(room||roomId)hideInterior();return;}
  interior.hidden=!isVisible();getCity()?.pause(isVisible());
  if(roomId!==v.building){
   hideInterior();const stamp=++visualGeneration,owner=getWorld()?.me?.wallet;
   roomId=v.building;const id=roomId,p=CITY_PLACES[id];
   setPaused(true);interior.hidden=!isVisible();
   interior.querySelector('header span').textContent=p.name[lang()];
   interior.querySelector('.interior-help').textContent=tr('载入室内模型…','Loading interior…');
   try{
    const next=await createCityInterior(interior.querySelector('canvas'),id,getWorld().me.avatar_id||'cz',v,near=>{
     interior.querySelector('.interior-help').textContent=controls.watching()?tr('正在跟随 Agent · 任务进度实时同步','Following Agent · Live task progress'):near==='work'?tr(`E · ${p.prop[0]}`,`E · ${p.prop[1]}`):near==='exit'?tr('E · 离开建筑','E · Leave building'):tr('WASD 行走 · 靠近工作台按 E','WASD to walk · Approach the table and press E');
    },getWorld().me.appearance);
    if(stamp!==visualGeneration||getWorld()?.me?.wallet!==owner||data?.visit?.building!==id){next.dispose();return;}
    room=next;const latest=data.visit;room.setPosition(latest.x,latest.z);
   }catch(e){if(stamp===visualGeneration){hideInterior();toast(tr('室内画面加载失败，将自动重试。','Interior view failed to load. Retrying.'));}return;}
  }
  if(controls.watching())room?.setRemotePosition(data.visit);
  room?.pause(!isVisible()||dialogue.open);
  render();
 }

 function render(){const a=data?.commission;
  interior.querySelector('.interior-exit').disabled=!controls.canPlay();
  interior.querySelector('.interior-exit').textContent=tr('返回街道','Return to street');
  interior.querySelector('.interior-use').textContent=tr('互动 E','Interact E');
  interior.querySelector('.interior-task').textContent=a?`${COMMISSION_KINDS[a.kind].name[lang()]} · ${a.step+1}/4 · ${a.target.label[lang()]}`:'';
  commission.querySelector('button').disabled=!controls.canPlay();document.body.classList.toggle('has-city-commission',Boolean(a));commission.hidden=!a||Boolean(room);if(a){commission.querySelector('small').textContent=COMMISSION_KINDS[a.kind].name[lang()]+(a.ticket?tr(' · 奖励委托',' · Reward commission'):tr(' · 普通探索',' · Exploration'));commission.querySelector('strong').textContent=`${a.step+1}/4 · ${a.target.label[lang()]}`;
  const target=a.target.place?CITY_PLACES[a.target.place]:JOURNEY_NODES[a.target.node],pos=getCity()?.position();commission.querySelector('p').textContent=(a.target.place?tr('进入建筑，走到工作台按 E','Enter the building, approach its table and press E'):tr('走近标记，按 E 校准','Reach the marker and press E'))+(pos?` · ${Math.round(Math.hypot(pos.x-target.x,pos.z-target.z))}m`:'');
  commission.querySelector('button').textContent=tr('放弃委托','Abandon commission');getCity()?.setCommissionTarget?.(a.target.node||a.target.place);}
  else getCity()?.setCommissionTarget?.(null);
 }
 async function act(fn){if(!controls.canPlay()||busy)return;busy=true;try{await fn();}catch(e){toast(e.message);}finally{busy=false;}}
 async function syncInside(){if(!controls.canPlay())return;if(moving)return moving;if(!room)return;moving=(async()=>{try{await api('/api/city-life/move',room.position());}catch{const next=await api('/api/city-life');if(next.visit&&controls.canPlay())room?.setPosition(next.visit.x,next.visit.z);}finally{moving=null;}})();return moving;}
 async function openInterior(id){
  if(!controls.canPlay())return;await flush();data=await api('/api/city-life/enter',{id});closeTalk();await syncVisual();
 }
 async function leaveInterior(){
  if(!controls.canPlay())return;if(moving)await moving;
  data=await api('/api/city-life/exit',{});hideInterior();render();
 }

 async function align(){const a=data?.commission;if(!a)return;const id=a.target.place||roomId||'observatory';baseTalk(CITY_PLACES[id]?id:'observatory',tr('观察目标方向，旋转指针后锁定。','Observe the target direction, rotate the pointer, then lock it.'));
  if(a.kind==='courier'){const seals=['☀','☾','✦','◆'];dialogue.querySelector('.npc-line').textContent=tr('核对包裹上的封印：','Match the parcel seal: ')+seals[a.route[a.step]];for(let i=0;i<4;i++)option(seals[i],async()=>{if(room)await syncInside();else await flush();data=await api('/api/city-life/interact',{choice:i});closeTalk();render();if(data.notice==='complete'){toast(tr(`递送完成 · 材料 +${data.materialReward||0}`,`Delivery complete · +${data.materialReward||0} materials`));onChanged();}});return;}
  const options=dialogue.querySelector('.npc-options'),dial=document.createElement('div');dial.className='alignment-dial';const marks=['↑','→','↓','←'],target=a.route[a.step];let choice=(target+1)%4;
  const label=document.createElement('span'),needle=document.createElement('b');label.textContent=tr('目标：','Target: ')+marks[target];dial.append(label,needle);options.append(dial);const draw=()=>{needle.textContent=marks[choice];};draw();
  option(tr('向左旋转','Rotate left'),()=>{choice=(choice+3)%4;draw();});option(tr('向右旋转','Rotate right'),()=>{choice=(choice+1)%4;draw();});
  option(tr('锁定 / 交付','Lock / Deliver'),async()=>{if(room)await syncInside();else await flush();data=await api('/api/city-life/interact',{choice});closeTalk();render();if(data.notice==='complete'){toast(tr(`委托完成 · 材料 +${data.materialReward||0}${data.rewardPoints?` · 奖励候选积分 +${data.rewardPoints}`:''}`,`Commission complete · +${data.materialReward||0} materials${data.rewardPoints?` · +${data.rewardPoints} candidate reward points`:''}`));onChanged();}});
 }
 async function work(){if(!room)return;if(room.near()==='exit'){await leaveInterior();return;}if(room.near()!=='work')return toast(tr('靠近工作台后再互动。','Move closer to the workbench.'));await syncInside();await read();
  if(data.commission?.target.place===roomId){await align();return;}
  baseTalk(roomId);const place=CITY_PLACES[roomId];
  if(place.action==='moba')option(tr('进入星环战场 · 1V1 / 3V3','Starfall Arena · 1V1 / 3V3'),()=>{location.href='/moba';});
  else if(place.action==='energy'){option(tr('给角色充能','Charge character energy'),()=>energy.open());option(tr('查看角色工坊','Character studio'),async()=>{closeTalk();await leaveInterior();document.getElementById('edit-avatar-btn')?.click();});}
  else {const kind=place.action;
   option(tr('接取普通委托 · 免费','Take exploration commission · Free'),async()=>{data=await api('/api/city-life/start',{kind,ranked:false});closeTalk();await align();},Boolean(data.commission));
   option(tr('接取奖励委托 · 4 能量','Take reward commission · 4 energy'),async()=>{data=await api('/api/city-life/start',{kind,ranked:true});closeTalk();await align();},!data.live||Boolean(data.commission)||data.rewardsToday>=3);
  }
 }
 interior.querySelector('.interior-exit').onclick=()=>act(leaveInterior);interior.querySelector('.interior-use').onclick=()=>act(work);
 for(const b of interior.querySelectorAll('[data-dx]')){b.onpointerdown=e=>{e.preventDefault();if(!controls.canPlay())return;b.setPointerCapture(e.pointerId);room?.motion(Number(b.dataset.dx),Number(b.dataset.dz));};b.onpointerup=b.onpointercancel=()=>room?.motion(0,0);}
 document.addEventListener('keydown',e=>{if(!controls.canPlay()||!room||dialogue.open||e.repeat)return;if(e.code==='KeyE'){e.preventDefault();e.stopImmediatePropagation();act(work);}if(e.code==='Escape'){e.preventDefault();act(leaveInterior);}},true);
 commission.querySelector('button').onclick=()=>act(async()=>{data=await api('/api/city-life/abandon',{});render();});
 setInterval(()=>{
  const me=getWorld()?.me;
  if(!me){if(wallet){wallet=null;data=null;hideInterior();}commission.hidden=true;return;}
  if(wallet!==me.wallet){wallet=me.wallet;data=null;hideInterior();lastRead=0;}
  if(room){interior.hidden=!isVisible();room.pause(!isVisible()||dialogue.open);if(!dialogue.open&&controls.canPlay())syncInside().catch(()=>{});}
  if(data?.commission)render();
  if(!document.hidden&&!reading&&!busy&&performance.now()-lastRead>(controls.watching()?350:5000)){
   reading=true;read().catch(()=>{}).finally(()=>{reading=false;});
  }
 },250);

 return {async syncControl(){
   if(moving)await moving;closeTalk();wallet=getWorld()?.me?.wallet||null;
   await read();if(room&&data?.visit){room.setPosition(data.visit.x,data.visit.z);room.setRemotePosition(controls.watching()?data.visit:null);}
  },async talk(id){if(!controls.canPlay())return;await flush();await read();baseTalk(id);option(tr('进入 '+CITY_PLACES[id].name[0],'Enter '+CITY_PLACES[id].name[1]),()=>openInterior(id));
   if(data.commission?.target.node===id)option(tr('继续委托','Continue commission'),align);
   option(tr('继续星灯旅程 / 章节','Continue journey / chapter'),()=>{closeTalk();continueJourney(id);});
  },interact(site){if(!controls.canPlay())return false;if(data?.commission?.target.node===site?.id){act(align);return true;}return false;},blocked:()=>Boolean(room||roomId||dialogue.open||energy.isOpen()),energy};
}
