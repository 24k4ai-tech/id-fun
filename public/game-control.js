import {isGameWrite} from './game-control-rules.js';
const tr=(zh,en)=>document.documentElement.lang==='en'?en:zh;

export function createGameControl({toast,onChange=async()=>{}}) {
  const bar=document.createElement('aside');bar.className='game-control';bar.hidden=true;
  bar.innerHTML='<span role="status"></span><button type="button"></button><a href="/moba" hidden></a>';
  document.body.append(bar);
  let wallet=null,state=null,ready=false,generation=0,reading=false,switching=false,seen=0;
  const watching=()=>Boolean(wallet&&state?.mode==='agent');
  const canPlay=()=>Boolean(wallet&&state?.mode==='human'&&ready&&!switching&&Date.now()-seen<8000);
  function render(){
    bar.hidden=!wallet||!state?.agentAvailable;
    document.body.classList.toggle('agent-watching',watching());
    bar.querySelector('span').textContent=!ready?tr('正在同步角色…','Syncing character…'):watching()?tr('Agent 模式 · 积分 100%','Agent mode · 100% points'):tr('你在操作 · 积分 50%','Your control · 50% points');
    const b=bar.querySelector('button');b.disabled=switching||!ready;b.textContent=watching()?tr('我来操作','Take control'):tr('交给 Agent','Resume Agent');
  }
  async function accept(next){
    if(!wallet||state&&next.version<state.version)return;
    seen=Date.now();
    if(state&&state.version===next.version&&state.mode===next.mode){state=next;render();return;}
    state=next;ready=false;const stamp=++generation;render();
    try{await onChange(next);if(stamp===generation)ready=true;}catch{if(stamp!==generation)return;toast(tr('角色同步失败，请稍后重试。','Character sync failed. Please retry.'));state=null;}
    render();
  }
  async function request(body){
    const r=await fetch('/api/control',{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const result=await r.json();if(!r.ok)throw new Error(result.message||'Control unavailable');return result;
  }
  async function refresh(){if(!wallet||reading||switching)return;reading=true;const owner=wallet;try{const next=await request();if(wallet===owner)await accept(next);}catch{render();}finally{reading=false;}}
  bar.querySelector('button').onclick=async()=>{
    if(switching||!state)return;switching=true;ready=false;render();
    const owner=wallet;
    try{const next=await request({mode:watching()?'human':'agent'});if(wallet===owner)await accept(next);}
    catch(e){toast(e.message);state=null;}finally{switching=false;render();refresh();}
  };
  setInterval(()=>{render();refresh();},1000);
  return {
    watching,canPlay,refresh,
    update(me){
      const owner=me?.wallet||null;
      if(owner!==wallet){wallet=owner;state=null;ready=false;generation++;bar.querySelector('a').hidden=true;}
      if(wallet&&me.control)accept(me.control);else render();
    },
    headers(path,body){
      if(body===undefined||!isGameWrite(path))return {};
      if(!canPlay())throw new Error(tr('当前为观战模式，请先点击“我来操作”。','Take control before playing.'));
      return {'X-Game-Control':String(state.version)};
    },
    activity(label,href='/moba'){
      const link=bar.querySelector('a');link.hidden=!label;link.textContent=label||'';link.href=href;
    },
  };
}
