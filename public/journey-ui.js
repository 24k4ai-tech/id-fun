import {JOURNEY_NODES,RUNE_IDS,journeyTargets,BEACON_COSTS,gateOpen} from './journey-rules.js';
import {createCampaignUI} from './campaign-ui.js';
import {campaignTargets} from './campaign-content.js';

export function createJourneyUI({api,toast,getCity,isActive,onChanged,controls}) {
  const board=document.createElement('section');board.className='journey-board';board.id='journey-board';board.hidden=true;
  board.innerHTML=`<header><div><small>WAYFINDER · CITY JOURNEY</small><h2 id="journey-title"></h2></div><b id="journey-growth"></b></header>
    <p id="journey-story"></p><div class="journey-cards">
    <button id="journey-signal"><i>☀ ☾ ✧</i><strong></strong><span></span><small></small></button>
    <button id="journey-courier"><i>Ⅰ → Ⅳ</i><strong></strong><span></span><small></small></button>
    <button id="journey-craft"><i>✦</i><strong></strong><span></span><small></small></button></div>
    <footer><span id="journey-record"></span><span id="journey-rewards"></span></footer>`;
  document.getElementById('signal-board').before(board);
  const hud=document.createElement('div');hud.id='city-quest-hud';hud.className='city-quest-hud';hud.hidden=true;
  hud.innerHTML=`<small id="journey-chapter"></small><strong id="journey-goal"></strong><p id="journey-hint"></p>
    <div id="journey-sequence" class="journey-sequence"></div><div class="journey-progress"><i id="journey-progress-fill"></i></div>
    <div class="journey-hud-meta"><b id="journey-time"></b><span id="journey-distance"></span></div>
    <div class="journey-hud-actions"><button id="journey-reveal"></button><button id="journey-next"></button><button id="journey-abandon"></button></div>`;
  document.querySelector('.map-frame').append(hud);
  const mini=document.createElement('canvas');mini.width=mini.height=164;mini.className='journey-minimap';mini.hidden=true;
  mini.setAttribute('aria-label','City navigation');document.querySelector('.map-frame').append(mini);
  const el=id=>document.getElementById(id),say=(zh,en)=>document.documentElement.lang==='en'?en:zh;
  const set=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  let wallet=null,data=null,loadPromise=null,motionPromise=null,commandBusy=false,clock=0,received=0,focus=null,lastRead=0;
  const campaign=createCampaignUI({command,getCity,toast,controls});
  function apply(next) {
    if(data && next.serverNow<data.serverNow)return;
    data=next;clock=next.serverNow;received=performance.now();
    if(controls.watching())getCity()?.setRemotePosition(data.profile);
    getCity()?.setJourney({...data,focus});campaign.sync(data);render();
  }
  async function read() {
    if(loadPromise)return loadPromise;
    const owner=wallet;if(!owner)return;
    loadPromise=api('/api/journey').then(next=>{if(wallet===owner)apply(next);}).catch(()=>{});
    await loadPromise;loadPromise=null;lastRead=performance.now();
  }
  async function move() {
    if(!controls.canPlay())return;
    if(motionPromise)return motionPromise;
    const city=getCity(),owner=wallet;if(!city||!owner||!data)return;
    motionPromise=api('/api/journey/move',city.position()).catch(async()=>{
      const next=await api('/api/journey');
      if(wallet===owner){apply(next);if(controls.canPlay())city.setPosition(next.profile.x,next.profile.z);}
    }).finally(()=>{motionPromise=null;});
    return motionPromise;
  }
  async function command(command,input={}) {
    if(!controls.canPlay()||!wallet||!getCity()||commandBusy)return;
    const owner=wallet;
    commandBusy=true;
    try {
      await move();
      if(wallet!==owner)return;
      const next=await api('/api/journey/command',{command,...input});if(wallet!==owner)return;focus=null;apply(next);
      if(command==='start')document.querySelector('.map-frame').scrollIntoView({block:'center',behavior:'smooth'});
      const notices={wrong_rune:say('顺序不对，光纹已重新亮起。','Wrong order. The sequence is visible again.'),
        storm:say('风门尚未开启！等它变绿再通过。','The gate is closed! Wait for green.'),
        complete:say(`旅程完成 · ${'★'.repeat(next.run?.rating||1)}${next.run?.rewarded?' · 材料 +4，贡献按操作来源结算':''}`,
          `Journey complete · ${'★'.repeat(next.run?.rating||1)}${next.run?.rewarded?' · +4 materials; contribution adjusted for control source':''}`),
        crafted:say('星灯信标已升级，去城南看看！','Your beacon has grown. Visit the south garden!')};
      if(notices[next.notice])toast(notices[next.notice]);
      if(['complete','crafted','campaign_complete'].includes(next.notice))onChanged();
    } catch(error){toast(error.message);} finally{commandBusy=false;render();}
  }
  function nextKind(){return !data?.profile.signals?'signal':!data.profile.deliveries?'courier':!data.profile.beacon_level?'craft':'signal';}
  function markWorkshop(){focus='workshop';getCity()?.setJourney({...data,focus});render();toast(say('工坊已标记，走近后按 E。','Workshop marked. Get close and press E.'));}
  function nextJourney(){if(nextKind()==='craft')markWorkshop();else command('start',{kind:nextKind()});}
  function render() {
    if(!data||!wallet)return;
    const p=data.profile,r=data.run,active=r?.status==='active'||campaign.active();
    const now=clock+performance.now()-received;
    const remaining=Math.max(0,Math.ceil(((r?.expires_at||0)-now)/1000));
    const total=p.signals+p.deliveries;
    set(el('journey-title'),say('星灯之旅','The Starlight Journey'));
    set(el('journey-growth'),say(`信标 ${p.beacon_level}/3 · 旅程 ${total}`,`Beacon ${p.beacon_level}/3 · ${total} journeys`));
    set(el('journey-story'),say(!p.signals?'引路灵：城市的星灯熄灭了。去观测台记住光纹，寻找三枚符文，把光带回来。'
      :!p.deliveries?'光纹已归位！驿站需要一位信使穿过风门，把新的星灯核心送到城南。'
      :!p.beacon_level?'核心已送达。把探索或格斗所得材料带到工坊，建起属于你的星灯。'
      :'星灯正在生长。重走不同光纹、刷新递送纪录，再用材料点亮下一层。',
      !p.signals?'Wayfinder: The city beacon has gone dark. Learn the light sequence at the observatory, find its three runes and bring the light back.'
      :!p.deliveries?'The runes are restored! Carry a new core through the wind gates to the south garden.'
      :!p.beacon_level?'The core is safe. Take materials from journeys or duels to the workshop and build your beacon.'
      :'Your beacon is growing. Solve a new sequence, beat your delivery record, and light its next tier.'));
    const cards=[['signal',say('寻光解谜','Rune Trail'),say('记住顺序，在城中找回三道光。','Remember the sequence. Find three lights in the city.'),say('探索 / 记忆 · 约 1–3 分钟','Explore / Memory · 1–3 minutes')],
      ['courier',say('风门递送','Wind Courier'),say('跑完四道风门，绿灯通过，红灯等待。','Run four gates. Green means go; red means wait.'),say(p.signals?'60 秒限时 · 挑战三星':'完成寻光后解锁',p.signals?'60-second trial · Chase three stars':'Unlock with Rune Trail')],
      ['craft',say('建设星灯','Build Your Beacon'),say('材料化为城中看得见的永久成长。','Turn materials into lasting growth in the city.'),say(p.beacon_level===3?'已完成三层星灯':`下一层：${BEACON_COSTS[p.beacon_level]} 材料 · 需 ${[2,4,6][p.beacon_level]} 次旅程`,p.beacon_level===3?'All three tiers complete':`Next: ${BEACON_COSTS[p.beacon_level]} materials · ${[2,4,6][p.beacon_level]} journeys`)]];
    for(const [id,title,copy,meta] of cards) {
      const button=el('journey-'+id);set(button.querySelector('strong'),title);set(button.querySelector('span'),copy);set(button.querySelector('small'),meta);
      button.disabled=!controls.canPlay()||commandBusy||(!getCity())||(id==='craft'?p.beacon_level===3||!p.deliveries:active||id==='courier'&&!p.signals);
    }
    set(el('journey-record'),say(`材料 ${data.material} · 最快递送 ${p.best_delivery_ms?(p.best_delivery_ms/1000).toFixed(1)+'s':'—'}`,`Materials ${data.material} · Best delivery ${p.best_delivery_ms?(p.best_delivery_ms/1000).toFixed(1)+'s':'—'}`));
    set(el('journey-rewards'),say(`今日还有 ${data.rewardsLeft}/6 次材料奖励；之后仍可挑战纪录。`,`${data.rewardsLeft}/6 material rewards left today. Record attempts stay open.`));
    let title,copy;
    if(r?.status==='active') {
      if(r.kind==='signal') {
        title=r.stage===0?say('前往观测台','Reach the signal lens'):r.stage<=3?say(`找回光纹 ${r.stage-1}/3`,`Recover runes ${r.stage-1}/3`):say('把光送回能源座','Return the light to the pedestal');
        copy=r.stage===0?say('走近蓝色 ◎，按 E 观察。','Find the blue ◎ and press E.'):r.stage<=3?say('按记忆顺序走近符文，按 E 收集。','Visit the runes in order; press E to collect.'):say('走近西南的 ϟ，按 E 点亮。','Find the southwest ϟ and press E.');
      } else {
        const id=journeyTargets(r)[0],node=JOURNEY_NODES[id];
        title=say(node.zh,node.en);
        copy=id==='market'?say('在驿站按 E 取件，之后开始 60 秒递送。','Press E at the post. The 60-second delivery starts at pickup.'):id==='home'?say('把核心送到城南，按 E 完成交付。','Deliver the core in the south. Press E.'):say(gateOpen(id,now)?'风门已开 · 走近按 E 通过':'风暴蓄能 · 等待风门变绿',gateOpen(id,now)?'Gate open · Get close and press E':'Storm charging · Wait for green');
      }
    } else if(focus==='workshop') {title=say('前往星灯工坊','Visit the beacon workshop');copy=say('走近城东 ⚒，按 E 建设。','Find the east ⚒ and press E to build.');}
    else {title=say(r?.status==='complete'?`完成！${'★'.repeat(r.rating)}`:r?.status==='expired'?'时间到了，再试一次':'跟随引路灵，开始旅程',r?.status==='complete'?`Complete! ${'★'.repeat(r.rating)}`:r?.status==='expired'?'Time is up. Try again.':'Follow the Wayfinder');copy=say('先寻光，再递送，最后建设你的星灯。','Find light, deliver a core, then build your beacon.');}
    set(el('journey-chapter'),say(r?.status==='active'?(r.kind==='signal'?'寻光短途':'递送挑战'):'城市短途',r?.status==='active'?(r.kind==='signal'?'RUNE TRAIL':'COURIER'):'CITY ACTIVITIES'));
    set(el('journey-goal'),title);set(el('journey-hint'),copy);
    const remembering=r?.status==='active'&&r.kind==='signal'&&r.stage>=1&&r.stage<=3;
    const sequence=el('journey-sequence');sequence.hidden=!remembering;
    if(remembering)set(sequence,now<r.revealed_until?r.order.map(id=>JOURNEY_NODES[id].symbol).join(' → '):'◇ → ◇ → ◇');
    el('journey-reveal').hidden=!remembering;set(el('journey-reveal'),say('再看一次','Show again'));
    el('journey-abandon').hidden=!active;set(el('journey-abandon'),say('放弃本轮','Abandon'));
    el('journey-next').hidden=active;set(el('journey-next'),say(nextKind()==='craft'?'前往工坊':nextKind()==='courier'?'接取递送':'接取寻光',nextKind()==='craft'?'Visit workshop':nextKind()==='courier'?'Take delivery':'Take Rune Trail'));
    el('journey-progress-fill').style.width=r?.status==='active'?`${r.stage/(r.kind==='signal'?5:6)*100}%`:r?.status==='complete'?'100%':'0';
    set(el('journey-time'),active?`${remaining}s`:say(`信标 ${p.beacon_level}/3`,`Beacon ${p.beacon_level}/3`));
    const position=getCity()?.position(),ids=campaign.active()?campaignTargets(data.campaign):focus?[focus]:journeyTargets(r);
    const nearest=position&&ids.map(id=>({id,d:Math.hypot(position.x-JOURNEY_NODES[id].x,position.z-JOURNEY_NODES[id].z)})).sort((a,b)=>a.d-b.d)[0];
    set(el('journey-distance'),nearest?`${JOURNEY_NODES[nearest.id].symbol} ${nearest.d.toFixed(0)}m`:'WASD · E');
    if(position) {
      const ctx=mini.getContext('2d'),px=x=>12+(x+28)*2.4,pz=z=>8+(z+28)*2.4;
      ctx.clearRect(0,0,164,164);ctx.fillStyle='#101b28e6';ctx.fillRect(0,0,164,164);
      ctx.strokeStyle='#68829a25';ctx.lineWidth=1;
      for(let i=20;i<160;i+=24){ctx.beginPath();ctx.moveTo(i,8);ctx.lineTo(i,156);ctx.moveTo(8,i);ctx.lineTo(156,i);ctx.stroke();}
      ctx.fillStyle='#66809555';for(const [x,z] of [[-9,-7],[9,-7],[-9,8],[9,8]])ctx.fillRect(px(x)-7,pz(z)-7,14,14);
      for(const id of new Set(['guide','home',...ids])) {const node=JOURNEY_NODES[id];ctx.fillStyle=node.color;ctx.beginPath();ctx.arc(px(node.x),pz(node.z),ids.includes(id)?4:2,0,Math.PI*2);ctx.fill();
        if(ids.includes(id)){ctx.font='11px sans-serif';ctx.fillText(node.symbol,px(node.x)+5,pz(node.z)-3);}}
      ctx.save();ctx.translate(px(position.x),pz(position.z));ctx.rotate(getCity().heading());ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();ctx.restore();
      ctx.fillStyle='#b9cbd9';ctx.font='9px sans-serif';ctx.fillText('N ↑',8,12);
    }
  }
  el('journey-signal').onclick=()=>command('start',{kind:'signal'});
  el('journey-courier').onclick=()=>command('start',{kind:'courier'});
  el('journey-craft').onclick=markWorkshop;
  el('journey-next').onclick=nextJourney;
  el('journey-reveal').onclick=()=>command('reveal');el('journey-abandon').onclick=()=>command('abandon');
  setInterval(()=>{
    const visible=Boolean(wallet&&getCity()&&isActive());
    hud.hidden=!visible||campaign.active();campaign.visibility(visible);
    mini.hidden=!visible;
    if(wallet&&getCity()){
      if(isActive()&&controls.canPlay())move().catch(()=>{});
      if(isActive())render();
      if(!document.hidden&&performance.now()-lastRead>(controls.watching()?350:5000)&&!commandBusy){lastRead=performance.now();read();}
    }
  },250);
  return {
    flush:move,
    async syncControl(){
      campaign.close();
      if(motionPromise)await motionPromise;if(loadPromise)await loadPromise;
      if(!wallet)return;const owner=wallet,next=await api('/api/journey');if(wallet!==owner)return;apply(next);
      const city=getCity();city?.setMotion(0,0);city?.setPosition(next.profile.x,next.profile.z);city?.setRemotePosition(controls.watching()?next.profile:null);
    },
    setPlayer(next) {
      board.hidden=!next;if(wallet===next)return;
      wallet=next;data=null;focus=null;campaign.clear();if(next)read();else hud.hidden=true;
    },
    async attachCity(city) {await loadPromise;if(!data){await read();}if(data){city.setPosition(data.profile.x,data.profile.z);city.setRemotePosition(controls.watching()?data.profile:null);city.setJourney({...data,focus});await move();render();}},
    interact(id) {
      if(!controls.canPlay())return;
      if(campaign.interact(id))return;
      if(id==='guide'){if(data?.run?.status==='active')toast(say('跟随光纹标记，按 E 与目标互动。','Follow the light markers and press E.'));else nextJourney();}
      else if(id==='workshop'){
        if(!data?.profile.deliveries)toast(say('完成寻光和递送后，再来建设星灯。','Complete Rune Trail and a delivery before building your beacon.'));
        else command('craft');
      }
      else if(id==='home'&&data?.run?.status!=='active')toast(say('这是你的星灯。继续旅程，在工坊升级它。','Your beacon. Complete journeys and upgrade it at the workshop.'));
      else command('interact',{id});
    },
  };
}
