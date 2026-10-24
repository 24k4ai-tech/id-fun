import {CAMPAIGN,PUZZLES,PUZZLE_TEXT,campaignMission,campaignTargets} from './campaign-content.js';
import {beamTrace,pipeTrace} from './puzzle-rules.js';
import {JOURNEY_NODES} from './journey-rules.js';
const say=v=>typeof v==='string'?v:v?.[document.documentElement.lang==='en'?'en':'zh']||'';
const tr=(zh,en)=>say({zh,en});
function laser(p,trace){const first=trace.path[0],last=trace.path.at(-1),vectors=[[0,-1],[1,0],[0,1],[-1,0]],dir=vectors[trace.direction??1];
 const points=[`0,${(Math.floor(first/p.w)+.5)*100}`,...trace.path.map(i=>`${(i%p.w+.5)*100},${(Math.floor(i/p.w)+.5)*100}`),`${(last%p.w+.5+dir[0]*.45)*100},${(Math.floor(last/p.w)+.5+dir[1]*.45)*100}`];
 return `<svg class="puzzle-laser" viewBox="0 0 ${p.w*100} ${p.h*100}" aria-hidden="true"><polyline points="${points.join(' ')}"/></svg>`;
}
export function createCampaignUI({command,getCity,toast,controls}) {
 const board=document.createElement('section');board.className='campaign-board';board.hidden=true;
 document.getElementById('journey-board').before(board);
 const hud=document.createElement('div');hud.className='city-quest-hud campaign-hud';hud.hidden=true;document.querySelector('.map-frame').append(hud);
 const modal=document.createElement('dialog');modal.className='puzzle-dialog';modal.setAttribute('aria-label','City mechanism');document.body.append(modal);
 let data=null,selected=null,working=false,open=false,lang='',hint=false,lastFocus=null,dismissedPuzzle=null,lastPuzzleRender='';
 const watchKey=()=>data?.campaign?.active?`${data.campaign.active.mission}:${data.campaign.active.stage}`:null;
 const current=()=>campaignMission(data?.campaign?.active?.mission);
 function close(dismiss=true){if(dismiss&&controls.watching())dismissedPuzzle=watchKey();open=false;lastPuzzleRender='';modal.close();document.body.classList.remove('puzzle-open');getCity()?.setMotion(0,0);if(!controls.watching())lastFocus?.focus?.();}
 async function send(action,input={}){
  if(!controls.canPlay()||working)return;working=true;
  try{await command('campaign:'+action,{...input,revision:data?.campaign?.active?.revision});}finally{working=false;renderPuzzle();}
 }
 function drawBoard(){if(!data)return;const c=data.campaign,done=c.completed,active=c.active;
  board.innerHTML=`<header><div><small>STARLIGHT CHRONICLES</small><h2>${tr('星城纪事','Starlight Chronicles')}</h2></div><b>${done.length}/16 · ${done.reduce((n,r)=>n+r.stars,0)}/48 ★</b></header>
  <p>${tr('两幕相连的城市冒险。走到机关前动手解开它，带着结果回来，城市随之点亮。随时离开，下次从原处继续。','Two connected city adventures. Find mechanisms, solve them, and bring the results home. Progress saves after every move.')}</p>
  ${[1,2].map(act=>`<details ${act===(active?current().act:done.length>=8?2:1)?'open':''}><summary>${act===1?tr('第一幕 · 让城市醒来','ACT I · Awaken the City'):tr('第二幕 · 找回真正的星光','ACT II · Recover the Starlight')} <span>${done.filter(d=>campaignMission(d.mission).act===act).length}/8</span></summary><div class="campaign-missions">${CAMPAIGN.filter(m=>m.act===act).map(m=>{const completion=done.find(d=>d.mission===m.id),unlocked=m.requires.every(id=>done.some(d=>d.mission===id));return `<button data-mission="${m.id}" ${!unlocked||active?'disabled':''} class="${completion?'completed':''} ${active?.mission===m.id?'current':''}"><i>${String(m.chapter).padStart(2,'0')}</i><strong>${say(m.title)}</strong><small>${completion?'★'.repeat(completion.stars):active?.mission===m.id?tr('进行中','In progress'):unlocked?tr('可出发','Available'):tr('完成前序后解锁','Complete earlier trails')}</small><span>${m.steps.map(s=>({pipe:'⌁',mirror:'◇',water:'◒',cargo:'▣',logic:'✧'}[PUZZLES[s.puzzle].type])).join(' → ')}</span></button>`;}).join('')}</div></details>`).join('')}`;
  board.querySelectorAll('[data-mission]').forEach(b=>b.onclick=async()=>{hint=false;await send('start',{mission:b.dataset.mission});document.querySelector('.map-frame').scrollIntoView({behavior:'smooth',block:'center'});});
 }
 function drawHud(){const c=data?.campaign,a=c?.active,m=current();if(!a||!m)return;
  const node=JOURNEY_NODES[campaignTargets(c)[0]],step=m.steps[a.stage];
  hud.innerHTML=`<small>${tr('第','ACT ')}${m.act} · ${m.chapter}/16</small><strong>${say(m.title)}</strong>
   <p>${say(m.story)}</p><b>${node.symbol} ${tr(node.zh,node.en)} · ${a.stage}/2</b><p>${step?tr('走近光标按 E，操作机关。','Follow the marker. Press E to work on the mechanism.'):tr('两道机关已完成。回到光标处按 E 交付。','Both mechanisms restored. Return to the marker and press E.')}</p>
   <div class="journey-progress"><i></i></div><div class="journey-hud-actions"><button data-journal>${tr('查看章节','Journal')}</button><button data-pause>${tr('放弃本任务','Abandon mission')}</button></div>`;
  hud.querySelector('.journey-progress i').style.width=a.stage/2*100+'%';
  // Progress width uses a CSS custom value only; CSP-safe rendering is set below.
  hud.querySelector('[data-journal]').onclick=()=>board.scrollIntoView({behavior:'smooth',block:'start'});
  hud.querySelector('[data-pause]').onclick=()=>send('abandon');
 }
 function renderPuzzle(){
  const a=data?.campaign?.active,m=current(),step=m?.steps[a?.stage];if(!open||!step||!a?.puzzle)return;
  const renderKey=JSON.stringify([a,selected,working,hint,controls.watching(),document.documentElement.lang,innerHeight]);
  if(renderKey===lastPuzzleRender)return;lastPuzzleRender=renderKey;
  const p=PUZZLES[step.puzzle],s=a.puzzle,grid=p.type==='pipe'||p.type==='mirror'||p.type==='cargo';
  let area='';
  if(grid){const trace=p.type==='pipe'?pipeTrace(p,s):p.type==='mirror'?beamTrace(p,s):{path:[]};
   area=`<div class="puzzle-grid" data-width="${p.w}">${Array.from({length:p.w*p.h},(_,i)=>{
    let inside='',classes=[];
    if(p.type==='pipe') {const mask=s.cells[i];inside=`<svg viewBox="0 0 60 60" aria-hidden="true">${[0,1,2,3].filter(d=>mask&(1<<d)).map(d=>`<path d="M30 30 L${[30,60,30,0][d]} ${[0,30,60,30][d]}"/>`).join('')}${mask?'<circle cx="30" cy="30" r="5"/>':''}</svg>`;if(!mask)classes.push('empty');if(trace.path.includes(i))classes.push('flow');if(p.targets.includes(i))classes.push('crystal');}
    if(p.type==='mirror'){inside=s.cells[i]?(s.cells[i]===1?'╱':'╲'):(p.crystals.includes(i)?'◆':'');if(!s.cells[i])classes.push('empty');if(trace.path.includes(i))classes.push('flow');if(p.crystals.includes(i))classes.push('crystal');}
    if(p.type==='cargo'){if(p.walls.includes(i)){classes.push('wall');inside='';}else if(s.player===i){classes.push('player');inside='◉';}else if(s.boxes.includes(i)){classes.push('crate');inside='▣';}if(p.goals.includes(i)){classes.push('target');if(!inside)inside='✦';}}
    if(i===p.source){classes.push('source');inside+='<em>→</em>';}if(i===p.goal){classes.push('outlet');inside+='<em>→</em>';}
    return `<button data-cell="${i}" class="${classes.join(' ')}" aria-label="${tr('格','Cell ')}${i+1}" ${working||p.type==='cargo'||classes.includes('empty')?'disabled':''}>${inside}</button>`;
   }).join('')}${p.type==='mirror'?laser(p,trace):''}</div>`;
   if(p.type==='cargo')area+=`<div class="puzzle-arrows">${['↑','→','↓','←'].map((v,i)=>`<button data-direction="${i}" ${working?'disabled':''}>${v}</button>`).join('')}</div>`;
  }else if(p.type==='water')area=`<div class="puzzle-jugs">${p.cap.map((cap,i)=>`<button data-pick="${i}" class="${selected===i?'selected':''}" ${working?'disabled':''}><strong>${String.fromCharCode(65+i)}</strong><div class="jug"><i data-fill="${s.amounts[i]/cap*100}"></i><b>${s.amounts[i]} / ${cap}</b></div><small>${tr('目标','Target ')} ${p.target[i]??'—'}</small></button>`).join('')}</div>`;
  else area=`<blockquote>${say(p.clues)}</blockquote><div class="puzzle-order">${s.order.map((v,i)=>`<button data-pick="${i}" class="${selected===i?'selected':''}" ${working?'disabled':''}><small>${i+1}</small>${p.tokens[v]}</button>`).join('')}</div>`;
  modal.innerHTML=`<header><div><small>${tr('机关','MECHANISM')} ${a.stage+1}/2 · ${m.chapter}/16</small><h2>${say(m.title)}</h2></div><button data-close aria-label="${tr('关闭','Close')}">×</button></header><p>${say(PUZZLE_TEXT[p.type])}</p>${area}
  <p class="puzzle-feedback" aria-live="polite">${working?tr('保存中…','Saving…'):tr(`已保存 · ${s.moves} 步`,`Saved · ${s.moves} moves`)}${hint?' · '+hintText(p,s):''}</p>
  <footer><button data-undo ${!a.canUndo||working?'disabled':''}>${tr('撤销','Undo')}</button><button data-reset ${working?'disabled':''}>${tr('重置机关','Reset')}</button><button data-hint ${working?'disabled':''}>${tr('提示（评价减星）','Hint (lower rating)')}</button><span>${tr('退出也会保留进度','Leaving preserves progress')}</span></footer>`;
  const g=modal.querySelector('.puzzle-grid');if(g){g.style.gridTemplateColumns=`repeat(${p.w},1fr)`;g.style.maxWidth=Math.min(460,Math.max(240,innerHeight-330)*p.w/p.h)+'px';}
  modal.querySelectorAll('[data-fill]').forEach(e=>e.style.height=e.dataset.fill+'%');
  modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-undo]').onclick=()=>{selected=null;send('undo');};
  modal.querySelector('[data-reset]').onclick=()=>{selected=null;send('reset');};
  modal.querySelector('[data-hint]').onclick=()=>{hint=true;send('hint');};
  modal.querySelectorAll('[data-cell]').forEach(b=>b.onclick=()=>send('move',{cell:Number(b.dataset.cell)}));
  modal.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>send('move',{direction:Number(b.dataset.direction)}));
  modal.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.pick);if(selected===null){selected=i;renderPuzzle();}else if(selected===i){selected=null;renderPuzzle();}else{const from=selected;selected=null;send('move',{from,to:i});}});
  if(controls.watching())modal.querySelectorAll("button:not([data-close])").forEach(b=>b.disabled=true);
  modal.tabIndex=-1;if(!controls.watching())modal.focus({preventScroll:true});
 }
 function hintText(p,s){if(p.type==='pipe'||p.type==='mirror'){const i=p.solution.findIndex((v,i)=>v!==s.cells[i]);return i<0?tr('检查出口方向。','Check the exit direction.'):tr(`先检查第 ${Math.floor(i/p.w)+1} 行、第 ${i%p.w+1} 格。`,`Check row ${Math.floor(i/p.w)+1}, column ${i%p.w+1}.`);}
  if(p.type==='cargo')return tr('不要把箱子推入没有目标的角落。先从目标位置反推需要站在哪里。','Avoid corners without targets. Work backward from each target to where you must stand.');
  if(p.type==='water')return tr('利用大小容器的差值，每次尽量制造一个新的余数。','Use capacity differences to create a new remainder with each pour.');
  return tr('先固定“最左”“最后”和相邻的一组，再安排剩余符号。','Place fixed ends and adjacent pairs first, then the remaining symbols.');}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 modal.addEventListener('keydown',e=>{const p=PUZZLES[current()?.steps[data?.campaign.active?.stage]?.puzzle];if(p?.type==='cargo'&&['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();e.stopPropagation();if(!e.repeat)send('move',{direction:['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].indexOf(e.key)});}});
 return {
  sync(next){data=next;board.hidden=!next;drawBoard();drawHud();
   if(next.notice==='campaign_puzzle'){open=true;lastFocus=document.activeElement;getCity()?.setMotion(0,0);document.body.classList.add('puzzle-open');if(!modal.open)modal.showModal();}
   if(['campaign_solved','campaign_complete','campaign_replay','campaign_abandoned'].includes(next.notice)){selected=null;hint=false;close();const messages={campaign_solved:tr('机关已恢复！跟随下一个光标。','Mechanism restored! Follow the next marker.'),campaign_complete:tr('章节完成 · 材料 +4 · 贡献按操作来源结算','Chapter complete · +4 materials · Contribution adjusted for control source'),campaign_replay:tr('挑战完成，最佳评价已保存。','Challenge complete. Best rating saved.')};if(messages[next.notice])toast(messages[next.notice]);}
   if(controls.watching()){
    modal.classList.add('agent-puzzle');
    if(next.campaign?.active?.puzzle&&watchKey()!==dismissedPuzzle){open=true;if(!modal.open)modal.show();}
    else if(!next.campaign?.active?.puzzle&&open)close(false);
   }else modal.classList.remove('agent-puzzle');
   renderPuzzle();},
  visibility(active){hud.hidden=!active||!data?.campaign?.active;if(lang!==document.documentElement.lang){lang=document.documentElement.lang;drawBoard();drawHud();renderPuzzle();}},
  close,
  clear(){data=null;board.hidden=true;hud.hidden=true;close();},
  active(){return Boolean(data?.campaign?.active);},
  interact(id){if(!data?.campaign?.active)return false;if(campaignTargets(data.campaign).includes(id))send('interact',{id});else toast(tr('沿小地图光标前往当前任务。','Follow the minimap marker for this mission.'));return true;},
 };
}
